import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasEntitlement, type EntitlementProduct } from '@/lib/entitlements';
import { getChatCompletionDetailed, isRateLimitError, type RetryOptions } from '@/lib/llm';

// #168: the server-owned chat turn. Unlike Mentor today (the browser creates
// the conversation, saves messages and resends the whole history), the server
// loads the conversation itself, builds the prompt from the database, calls
// the model, saves both messages with service credentials and counts tokens.
// The browser only sends the conversation id and the new message.

export type ConversationKind = 'mentor' | 'path';

export type ConversationRow = {
  id: string;
  user_id: string;
  kind: ConversationKind;
  status: string | null;
  tokens_used: number;
  token_budget: number | null;
  turn_started_at: string | null;
};

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  choices: unknown | null;
  selected_choice_ids: string[] | null;
  created_at: string;
};

export type NewUserMessage = { content: string; selected_choice_ids: string[] | null };

export type TurnFailure = { ok: false; status: number; error: string };
export type TurnResult = { ok: true; messages: StoredMessage[] } | TurnFailure;

const CONVERSATION_SELECT = 'id, user_id, kind, status, tokens_used, token_budget, turn_started_at';
const MESSAGE_SELECT = 'id, role, content, choices, selected_choice_ids, created_at';

// A claim older than this is treated as abandoned (the request died mid-turn).
const TURN_CLAIM_STALE_MS = 120_000;

export function createServiceClient(): SupabaseClient {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function requireEntitledUser(
  entitlement: EntitlementProduct,
): Promise<{ ok: true; userId: string } | TurnFailure> {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!(await hasEntitlement(user.id, entitlement))) return { ok: false, status: 403, error: 'Payment required' };
  return { ok: true, userId: user.id };
}

/** The conversation, only if it belongs to this user and is of this kind. */
export async function loadOwnedConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  kind: ConversationKind,
): Promise<ConversationRow | null> {
  const { data } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle();
  return (data as ConversationRow | null) ?? null;
}

/** Ascending by time. With `limit`, the most recent `limit` messages. */
export async function listConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit?: number,
): Promise<StoredMessage[]> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: limit === undefined });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as StoredMessage[];
  return limit === undefined ? rows : rows.reverse();
}

/**
 * Claims the conversation for one turn (conditional UPDATE, same idea as
 * claimGeneration in lib/path-checkpoint.ts). Stops double-sends, and makes
 * the read-modify-write of tokens_used safe. False if another turn holds it.
 */
export async function claimTurn(supabase: SupabaseClient, conversationId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - TURN_CLAIM_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('conversations')
    .update({ turn_started_at: new Date().toISOString() })
    .eq('id', conversationId)
    .or(`turn_started_at.is.null,turn_started_at.lt.${staleBefore}`)
    .select('id');
  if (error) throw error;
  return (data ?? []).length === 1;
}

export async function releaseTurn(supabase: SupabaseClient, conversationId: string): Promise<void> {
  const { error } = await supabase.from('conversations').update({ turn_started_at: null }).eq('id', conversationId);
  if (error) console.error('releaseTurn failed:', error);
}

/** Only call while holding the turn claim. */
export async function addTokens(supabase: SupabaseClient, conversationId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  const { data } = await supabase.from('conversations').select('tokens_used').eq('id', conversationId).single();
  const { error } = await supabase
    .from('conversations')
    .update({ tokens_used: (data?.tokens_used ?? 0) + tokens })
    .eq('id', conversationId);
  if (error) console.error('addTokens failed:', error);
}

export type TurnContext = {
  supabase: SupabaseClient;
  conversation: ConversationRow;
  recent: StoredMessage[];          // before the new user message
  userMessage: NewUserMessage | null; // null for an assistant-only turn (the opening)
};

type ChatTurnBase = {
  kind: ConversationKind;
  entitlement: EntitlementProduct;
  recentLimit: number;
};

export type AssistantMessage = { content: string; choices: unknown | null };

/**
 * What a turn produced, before anything is saved. `commit` runs after both
 * messages are saved (it gets them, with their ids) and writes whatever else
 * the turn changed. A failure still reports the tokens it used.
 */
export type TurnRun =
  | { ok: true; assistant: AssistantMessage; tokens: number; commit: (saved: StoredMessage[]) => Promise<void> }
  | (TurnFailure & { tokens: number });

/** A turn that runs its own model calls (Path: update, then reply). */
export type RunTurn = ChatTurnBase & { run: (ctx: TurnContext) => Promise<TurnRun> };

export type ChatTurnConfig<P = unknown> = SingleCallTurn<P> | RunTurn;

export type SingleCallTurn<P> = ChatTurnBase & {
  temperature: number;
  retry: RetryOptions;
  responseFormat?: { type: 'json_object' };
  buildMessages: (ctx: TurnContext) => Promise<ChatCompletionMessageParam[]>;
  /** Null when the model output is unusable; the turn retries once. */
  parse: (raw: string | null) => P | null;
  toAssistantMessage: (parsed: P) => AssistantMessage;
  afterTurn?: (ctx: TurnContext, parsed: P) => Promise<void>;
};

/**
 * One turn on a conversation the caller has already authorised and claimed:
 * produce the reply (one model call by default, or the config's own `run`),
 * then save the user message (if any) and the reply, commit, count tokens.
 * Nothing is saved when producing the reply fails, so the user can simply
 * send again.
 */
export async function runClaimedTurn<P>(
  config: ChatTurnConfig<P>,
  supabase: SupabaseClient,
  conversation: ConversationRow,
  userMessage: NewUserMessage | null,
): Promise<TurnResult> {
  if (conversation.token_budget !== null && conversation.tokens_used >= conversation.token_budget) {
    return { ok: false, status: 409, error: 'budget_exhausted' };
  }

  const recent = await listConversationMessages(supabase, conversation.id, config.recentLimit);
  const ctx: TurnContext = { supabase, conversation, recent, userMessage };

  const produced = 'run' in config ? await config.run(ctx) : await singleCall(config, ctx);
  if (!produced.ok) {
    await addTokens(supabase, conversation.id, produced.tokens);
    return { ok: false, status: produced.status, error: produced.error };
  }
  const { assistant, tokens, commit } = produced;

  const saved: StoredMessage[] = [];
  if (userMessage) {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_id: conversation.user_id,
        conversation_id: conversation.id,
        role: 'user',
        content: userMessage.content,
        selected_choice_ids: userMessage.selected_choice_ids,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    saved.push(data as StoredMessage);
  }

  const { data: reply, error: replyError } = await supabase
    .from('messages')
    .insert({
      user_id: conversation.user_id,
      conversation_id: conversation.id,
      role: 'assistant',
      content: assistant.content,
      choices: assistant.choices,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (replyError) throw replyError;
  saved.push(reply as StoredMessage);

  await commit(saved);
  await addTokens(supabase, conversation.id, tokens);

  return { ok: true, messages: saved };
}

// The default turn: one model call (one retry on unusable output).
async function singleCall<P>(config: SingleCallTurn<P>, ctx: TurnContext): Promise<TurnRun> {
  const messages = await config.buildMessages(ctx);
  let tokens = 0;
  let parsed: P | null = null;
  try {
    for (let attempt = 0; attempt < 2 && parsed === null; attempt++) {
      const result = await getChatCompletionDetailed({
        messages,
        temperature: config.temperature,
        response_format: config.responseFormat,
        retry: config.retry,
      });
      tokens += result.usage.prompt_tokens + result.usage.completion_tokens;
      parsed = config.parse(result.content);
      if (parsed === null) console.warn(`[chat-turn] ${config.kind}: unusable model output (attempt ${attempt + 1})`);
    }
  } catch (error) {
    if (isRateLimitError(error)) return { ok: false, status: 503, error: 'busy', tokens };
    throw error;
  }
  if (parsed === null) return { ok: false, status: 502, error: 'no_usable_reply', tokens };
  const result = parsed;
  return {
    ok: true,
    assistant: config.toAssistantMessage(result),
    tokens,
    commit: async () => { if (config.afterTurn) await config.afterTurn(ctx, result); },
  };
}

/**
 * The full server-owned turn: login, entitlement, ownership, claim, then
 * `prepare` (validates the request against the conversation's current state
 * and turns it into the user message) and the turn itself. Always releases
 * the claim.
 */
export async function handleChatTurn<P>(
  config: ChatTurnConfig<P>,
  conversationId: string,
  prepare: (supabase: SupabaseClient, conversation: ConversationRow) => Promise<NewUserMessage | TurnFailure>,
): Promise<TurnResult> {
  const auth = await requireEntitledUser(config.entitlement);
  if (!auth.ok) return auth;

  const supabase = createServiceClient();
  const conversation = await loadOwnedConversation(supabase, conversationId, auth.userId, config.kind);
  if (!conversation) return { ok: false, status: 404, error: 'Conversation not found' };

  if (!(await claimTurn(supabase, conversation.id))) return { ok: false, status: 409, error: 'turn_in_progress' };
  try {
    const prepared = await prepare(supabase, conversation);
    if ('ok' in prepared) return prepared;
    return await runClaimedTurn(config, supabase, conversation, prepared);
  } finally {
    await releaseTurn(supabase, conversation.id);
  }
}
