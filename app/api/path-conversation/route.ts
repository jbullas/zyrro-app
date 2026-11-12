import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimTurn,
  createServiceClient,
  handleChatTurn,
  listConversationMessages,
  releaseTurn,
  requireEntitledUser,
  runClaimedTurn,
  type ConversationRow,
  type NewUserMessage,
  type TurnFailure,
  type TurnResult,
} from '@/lib/chat-turn';
import {
  buildContextDigest,
  createPathConversation,
  ensureSeeded,
  getPathConversation,
  getProfileRow,
  MESSAGE_MAX_CHARS,
  overSendLimit,
  PATH_ENTITLEMENT,
  PATH_TURN_CONFIG,
  pathState,
  startRedo,
  toMessageView,
} from '@/lib/path-conversation';
import { choiceContent, NOTE_MAX_CHARS, validateChoiceAnswer, type ChatChoiceSet, type ChoicePurpose } from '@/lib/chat-choices';
import { chosenPathView, ensureOptionsGeneration, optionsRetryWait, optionsStateView, PATH_FLOW_TURN_CONFIG, redoStateView } from '@/lib/path-options';

// #168: the Path conversation, owned by the server. The browser sends only
// the conversation id and the new message, or the tapped choices plus an
// optional note. Typing is accepted only in the conversation phase and only
// when the latest message has no choices; in the summary phase only the
// card's choices and its one clarifying answer are accepted. Once the summary
// is confirmed (brief 168-options), only taps on the options, the "what feels
// off" question and the name suggestions are, each on the latest message.
// The options generation runs in the background after the turn that starts
// it (after()), so this matches the generation budget, like
// app/api/path-options/route.ts (GENERATION_BUDGET_MS in lib/generation-budget.ts).
export const maxDuration = 240;

async function conversationView(supabase: SupabaseClient, conversation: ConversationRow) {
  const [messages, profileRow, options, chosen] = await Promise.all([
    listConversationMessages(supabase, conversation.id),
    getProfileRow(supabase, conversation.id),
    optionsStateView(supabase, conversation.id),
    chosenPathView(supabase, conversation.id),
  ]);
  const redo = await redoStateView(supabase, conversation.id, profileRow?.redo_started_at ?? null);
  return {
    conversation: { id: conversation.id, ...pathState(profileRow), options, chosen, redo },
    messages: messages.map(toMessageView),
  };
}

function failure(f: TurnFailure) {
  return NextResponse.json({ error: f.error }, { status: f.status });
}

// Read-back: saved messages only, no model call.
export async function GET() {
  const auth = await requireEntitledUser(PATH_ENTITLEMENT);
  if (!auth.ok) return failure(auth);

  const supabase = createServiceClient();
  const existing = await getPathConversation(supabase, auth.userId);
  if (!existing) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  // Resumes a due generation that never started (a summary confirmed before
  // options existed) and flips a stranded one; never starts a second one.
  await ensureOptionsGeneration(supabase, existing.conversation);
  return NextResponse.json(await conversationView(supabase, existing.conversation));
}

type PostBody =
  | { action: 'start' }
  | { action: 'message'; conversation_id: string; text: string }
  | { action: 'choice'; conversation_id: string; message_id: string; choice_ids?: string[]; note?: string; risk_text?: string }
  | { action: 'options_retry'; conversation_id: string }
  | { action: 'redo'; conversation_id: string };

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = await req.json() as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    if (body.action === 'start') return await start();
    if (body.action === 'options_retry') return await retryOptions();
    if (body.action === 'redo') return await redo();

    if (body.action === 'message' || body.action === 'choice') {
      if (typeof body.conversation_id !== 'string' || !body.conversation_id) {
        return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 });
      }
      const result = await handleChatTurn(PATH_FLOW_TURN_CONFIG, body.conversation_id, (supabase, conversation) =>
        body.action === 'message'
          ? prepareMessage(supabase, conversation, body.text)
          : prepareChoice(supabase, conversation, body.message_id, body.choice_ids, body.note, body.risk_text),
      );
      return await turnResponse(result, body.conversation_id);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Path conversation API error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

async function turnResponse(result: TurnResult, conversationId: string) {
  if (!result.ok) return failure(result);
  const supabase = createServiceClient();
  const [row, options] = await Promise.all([getProfileRow(supabase, conversationId), optionsStateView(supabase, conversationId)]);
  return NextResponse.json({
    messages: result.messages.map(toMessageView),
    ...pathState(row),
    options,
  });
}

// After a failed options generation: starts that round again. Refused while
// one is running or when nothing has failed.
async function retryOptions() {
  const auth = await requireEntitledUser(PATH_ENTITLEMENT);
  if (!auth.ok) return failure(auth);
  const supabase = createServiceClient();
  const existing = await getPathConversation(supabase, auth.userId);
  if (!existing) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const state = await optionsStateView(supabase, existing.conversation.id);
  if (state.status !== 'failed') return NextResponse.json({ error: 'nothing_to_retry' }, { status: 409 });
  // At most OPTIONS_RETRY_LIMIT failed generations an hour (brief 168-guardrails-redo).
  const wait = await optionsRetryWait(supabase, existing.conversation.id);
  if (wait !== null) return NextResponse.json({ error: 'retry_limited', retry_in_minutes: wait }, { status: 429 });
  await ensureOptionsGeneration(supabase, existing.conversation, { retry: true });
  return NextResponse.json(await conversationView(supabase, existing.conversation));
}

// Creates the user's one Path conversation (or reuses it), seeds the profile
// and runs the opening turn. Safe to call again: each part runs only once.
async function start() {
  const auth = await requireEntitledUser(PATH_ENTITLEMENT);
  if (!auth.ok) return failure(auth);

  const supabase = createServiceClient();
  const existing = await getPathConversation(supabase, auth.userId);
  if (!existing && !(await buildContextDigest(supabase, auth.userId))) {
    return NextResponse.json({ error: 'no_identity_report' }, { status: 409 });
  }
  const conversation = existing?.conversation ?? await createPathConversation(supabase, auth.userId);

  if (!(await claimTurn(supabase, conversation.id))) {
    return NextResponse.json({ error: 'turn_in_progress' }, { status: 409 });
  }
  try {
    await ensureSeeded(supabase, conversation);
    const messages = await listConversationMessages(supabase, conversation.id, 1);
    if (messages.length === 0) {
      const opening = await runClaimedTurn(PATH_TURN_CONFIG, supabase, conversation, null);
      if (!opening.ok) return failure(opening);
    }
  } finally {
    await releaseTurn(supabase, conversation.id);
  }
  return NextResponse.json(await conversationView(supabase, conversation));
}

// The one redo (brief 168-guardrails-redo), from "Your path": holds the turn
// claim, so it can't run alongside a turn or a second redo.
async function redo() {
  const auth = await requireEntitledUser(PATH_ENTITLEMENT);
  if (!auth.ok) return failure(auth);
  const supabase = createServiceClient();
  const existing = await getPathConversation(supabase, auth.userId);
  if (!existing) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const conversation = existing.conversation;
  if (!(await claimTurn(supabase, conversation.id))) {
    return NextResponse.json({ error: 'turn_in_progress' }, { status: 409 });
  }
  try {
    const result = await startRedo(supabase, conversation);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  } finally {
    await releaseTurn(supabase, conversation.id);
  }
  const fresh = await getPathConversation(supabase, auth.userId);
  return NextResponse.json(await conversationView(supabase, fresh!.conversation));
}

const refuse = (status: number, error: string): TurnFailure => ({ ok: false, status, error });

// Typed text: conversation phase only, and only when the latest message asks
// an open question (a message with choices is answered with them and a note).
async function prepareMessage(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  text: unknown,
): Promise<NewUserMessage | TurnFailure> {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content) return refuse(400, 'Empty message');
  // At most PATH_SENDS_PER_WINDOW sends in the window (brief 168-guardrails-redo).
  if (await overSendLimit(supabase, conversation.id)) return refuse(429, 'rate_limited');
  if (content.length > MESSAGE_MAX_CHARS) return refuse(400, 'message_too_long');
  const row = await getProfileRow(supabase, conversation.id);
  if (row?.phase !== 'conversation') return refuse(409, 'not_in_conversation');
  const [latest] = await listConversationMessages(supabase, conversation.id, 1);
  if (latest?.role === 'assistant' && latest.choices) return refuse(409, 'choices_expected');
  return { content, selected_choice_ids: null, note: null };
}

// A tap (plus optional note) answers the latest assistant message only, with
// ids from its choices. In the summary phase, only the card or its clarifying
// question can be answered, and nothing once the summary is confirmed.
async function prepareChoice(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  messageId: unknown,
  choiceIds: unknown,
  note: unknown,
  riskText: unknown,
): Promise<NewUserMessage | TurnFailure> {
  if (await overSendLimit(supabase, conversation.id)) return refuse(429, 'rate_limited');
  const row = await getProfileRow(supabase, conversation.id);
  const laterPurposes: ChoicePurpose[] | null = row?.phase === 'options' ? ['options', 'options_feedback']
    : row?.phase === 'chosen' ? ['naming'] : null;
  if (!row || (!laterPurposes && ((row.phase !== 'conversation' && row.phase !== 'summary') || row.summary_confirmed_at))) {
    return refuse(409, 'not_in_conversation');
  }

  const [latest] = await listConversationMessages(supabase, conversation.id, 1);
  const choices = latest?.choices as ChatChoiceSet | null | undefined;
  if (!latest || latest.id !== messageId || latest.role !== 'assistant' || !choices) return refuse(409, 'stale_choice');
  if (laterPurposes) {
    if (!choices.purpose || !laterPurposes.includes(choices.purpose)) return refuse(409, 'not_in_conversation');
  } else {
    const summaryChoices = choices.purpose === 'summary' || choices.purpose === 'summary_clarify';
    if ((row.phase === 'summary') !== summaryChoices) return refuse(409, 'not_in_conversation');
  }

  const answer = validateChoiceAnswer(choices, choiceIds, note);
  if (!answer.ok) return refuse(400, answer.error);
  // The card's risk field (brief 168-risk-note): only on the summary card, and
  // only with "Risk, limits and time" marked off.
  if (riskText !== undefined && riskText !== null) {
    const fieldOpen = choices.purpose === 'summary' && choices.risk_text !== undefined && answer.ids.includes('part:risk');
    if (!fieldOpen || typeof riskText !== 'string') return refuse(400, 'invalid_choice');
    if (riskText.trim().length > NOTE_MAX_CHARS) return refuse(400, 'note_too_long');
  }

  return {
    content: choiceContent(choices, answer.ids, answer.note),
    selected_choice_ids: answer.ids,
    note: answer.note,
    ...(typeof riskText === 'string' && { risk_text: riskText }),
  };
}
