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
  PATH_ENTITLEMENT,
  PATH_TURN_CONFIG,
  profileComplete,
  toMessageView,
} from '@/lib/path-conversation';
import { choiceContent, validateChoiceIds, type ChatChoiceSet } from '@/lib/chat-choices';

// #168 step 3: the Path conversation, owned by the server. The browser sends
// only the conversation id and the new message (or the tapped choice).
// Start = seeding call + opening turn, so it needs more than a single reply.
export const maxDuration = 120;

async function conversationView(supabase: SupabaseClient, conversation: ConversationRow) {
  const [messages, profileRow] = await Promise.all([
    listConversationMessages(supabase, conversation.id),
    getProfileRow(supabase, conversation.id),
  ]);
  return {
    conversation: { id: conversation.id, phase: profileRow?.phase ?? 'seeding' },
    messages: messages.map(toMessageView),
    profile_complete: profileComplete(profileRow),
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
  return NextResponse.json(await conversationView(supabase, existing.conversation));
}

type PostBody =
  | { action: 'start' }
  | { action: 'message'; conversation_id: string; text: string }
  | { action: 'choice'; conversation_id: string; message_id: string; choice_ids: string[] };

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = await req.json() as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    if (body.action === 'start') return await start();

    if (body.action === 'message' || body.action === 'choice') {
      if (typeof body.conversation_id !== 'string' || !body.conversation_id) {
        return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 });
      }
      const result = await handleChatTurn(PATH_TURN_CONFIG, body.conversation_id, (supabase, conversation) =>
        body.action === 'message'
          ? prepareMessage(supabase, conversation, body.text)
          : prepareChoice(supabase, conversation, body.message_id, body.choice_ids),
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
  return NextResponse.json({
    messages: result.messages.map(toMessageView),
    profile_complete: profileComplete(await getProfileRow(supabase, conversationId)),
  });
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

async function requireConversationPhase(supabase: SupabaseClient, conversation: ConversationRow): Promise<TurnFailure | null> {
  const row = await getProfileRow(supabase, conversation.id);
  return row?.phase === 'conversation' ? null : { ok: false, status: 409, error: 'not_in_conversation' };
}

async function prepareMessage(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  text: unknown,
): Promise<NewUserMessage | TurnFailure> {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content) return { ok: false, status: 400, error: 'Empty message' };
  return (await requireConversationPhase(supabase, conversation)) ?? { content, selected_choice_ids: null };
}

// A tap answers the latest assistant message only, with ids from its choices.
async function prepareChoice(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  messageId: unknown,
  choiceIds: unknown,
): Promise<NewUserMessage | TurnFailure> {
  const phaseError = await requireConversationPhase(supabase, conversation);
  if (phaseError) return phaseError;

  const [latest] = await listConversationMessages(supabase, conversation.id, 1);
  const choices = latest?.choices as ChatChoiceSet | null | undefined;
  if (!latest || latest.id !== messageId || latest.role !== 'assistant' || !choices) {
    return { ok: false, status: 409, error: 'stale_choice' };
  }

  // Single: one id. Multi: up to max. Matrix (the signature grid): every row once.
  const ids = validateChoiceIds(choices, choiceIds);
  if (!ids) return { ok: false, status: 400, error: 'invalid_choice' };

  return { content: choiceContent(choices, ids), selected_choice_ids: ids };
}
