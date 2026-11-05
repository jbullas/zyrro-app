import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import type { ChatTurnConfig, ConversationRow, StoredMessage, TurnContext } from '@/lib/chat-turn';
import { addTokens } from '@/lib/chat-turn';
import { mergeAnswersWithQuestions } from '@/lib/identity-questions';
import { getChatCompletionDetailed, PATH_RETRY } from '@/lib/llm';
import {
  applyProfileUpdates,
  applySeedRules,
  coerceItem,
  fallbackProfile,
  isPathProfile,
  isProfileComplete,
  ITEM_KEYS,
  openItems,
  stillNeeded,
  suggestedFocus,
  type PathProfile,
} from '@/lib/path-profile';
import { PATH_CONVERSATION_PROMPT } from '@/lib/prompts/path-conversation';
import { PATH_PROFILE_SEED_PROMPT } from '@/lib/prompts/path-profile-seed';

// #168: the Path conversation (docs/framework/path-plan-redesign.md) on the
// shared server-owned turn (lib/chat-turn.ts). Steps 4-5 add the summary,
// options and guardrails; this file covers seeding and the conversation.

export const PATH_ENTITLEMENT = 'onetime_payment' as const;

// How many recent messages each turn sends; older ones live on in the profile.
const PATH_RECENT_MESSAGES = 12;

export type PathPhase = 'seeding' | 'conversation' | 'summary' | 'options' | 'chosen';

export type PathProfileRow = {
  conversation_id: string;
  user_id: string;
  phase: PathPhase;
  profile: unknown;
  context_digest: ContextDigest | null;
  turns: number;
  turns_since_progress: number;
};

const PROFILE_SELECT = 'conversation_id, user_id, phase, profile, context_digest, turns, turns_since_progress';

// ── Context: the 13 answers and a digest of the Identity report ─────────────

export type ContextDigest = {
  answers: Array<{ number: number; question: string; answer: string }>;
  report: {
    prepared_for: string;
    named_identity: string;
    identity_thesis: string;
    primary_signatures: Array<{ name: string; core_statement: string; tension: string }>;
    secondary_signatures: string[];
    synthesis: string;
    how_you_operate: IdentitySignatureReportArtifactContent['how_you_operate'];
    energisers: string[];
    friction_points: string[];
    distinctive_pattern?: IdentitySignatureReportArtifactContent['distinctive_pattern'];
    pattern_to_notice?: IdentitySignatureReportArtifactContent['pattern_to_notice'];
    forward_frame?: string;
  };
};

/** Null when the user has no ready Identity report. */
export async function buildContextDigest(supabase: SupabaseClient, userId: string): Promise<ContextDigest | null> {
  const { data: artifact } = await getCurrentArtifact<{ content: IdentitySignatureReportArtifactContent }>(
    supabase,
    userId,
    'identity_report',
    { status: 'ready', select: 'content' },
  );
  const report = artifact?.content;
  if (!report?.cover) return null;

  const { data: rows, error } = await supabase
    .from('discovery_answers')
    .select('question_number, answer_text')
    .eq('user_id', userId);
  if (error) throw error;

  return {
    answers: mergeAnswersWithQuestions(rows ?? []).map(({ number, question, answer }) => ({ number, question, answer })),
    report: {
      prepared_for: report.cover.prepared_for,
      named_identity: report.cover.named_identity,
      identity_thesis: report.cover.identity_thesis,
      primary_signatures: (report.primary_constellation ?? []).map(s => ({
        name: s.name,
        core_statement: s.core_statement,
        tension: s.tension,
      })),
      secondary_signatures: (report.signature_profile_summary?.secondary_signatures ?? []).map(s => s.name),
      synthesis: report.constellation_synthesis?.synthesis ?? '',
      how_you_operate: report.how_you_operate,
      energisers: report.energisers ?? [],
      friction_points: report.friction_points ?? [],
      ...(report.distinctive_pattern && { distinctive_pattern: report.distinctive_pattern }),
      ...(report.pattern_to_notice && { pattern_to_notice: report.pattern_to_notice }),
      ...(report.reframe_teaser?.forward_frame && { forward_frame: report.reframe_teaser.forward_frame }),
    },
  };
}

// ── Seeding ─────────────────────────────────────────────────────────────────

function parseSeed(raw: string | null): PathProfile | null {
  try {
    const parsed = JSON.parse(raw ?? '');
    if (!parsed || typeof parsed !== 'object') return null;
    const profile = { version: 1 } as PathProfile;
    for (const key of ITEM_KEYS) {
      (profile as Record<string, unknown>)[key] = coerceItem(key, (parsed as Record<string, unknown>)[key], 'questionnaire');
    }
    return profile;
  } catch {
    return null;
  }
}

/**
 * One model call that marks each item known, inferred or missing from the 13
 * answers and the report, then the design doc's fixed rules on top. Falls
 * back to an all-missing profile (patterns from the report) if the output is
 * unusable twice, so the conversation can always start.
 */
export async function seedPathProfile(digest: ContextDigest): Promise<{ profile: PathProfile; tokens: number; fromModel: boolean }> {
  const signatureNames = digest.report.primary_signatures.map(s => s.name);
  let tokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await getChatCompletionDetailed({
      messages: [
        { role: 'system', content: PATH_PROFILE_SEED_PROMPT },
        { role: 'user', content: JSON.stringify(digest) },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      retry: { budgetMs: 20_000, label: 'path seed' },
    });
    tokens += result.usage.prompt_tokens + result.usage.completion_tokens;
    const profile = parseSeed(result.content);
    if (profile) return { profile: applySeedRules(profile, signatureNames), tokens, fromModel: true };
    console.warn(`[path seed] unusable output (attempt ${attempt + 1})`);
  }
  return { profile: fallbackProfile(signatureNames), tokens, fromModel: false };
}

// ── Conversation rows ───────────────────────────────────────────────────────

export async function getPathConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ conversation: ConversationRow; profileRow: PathProfileRow | null } | null> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, user_id, kind, status, tokens_used, token_budget, turn_started_at')
    .eq('user_id', userId)
    .eq('kind', 'path')
    .maybeSingle();
  if (!conversation) return null;
  return { conversation: conversation as ConversationRow, profileRow: await getProfileRow(supabase, conversation.id) };
}

export async function getProfileRow(supabase: SupabaseClient, conversationId: string): Promise<PathProfileRow | null> {
  const { data } = await supabase.from('path_profiles').select(PROFILE_SELECT).eq('conversation_id', conversationId).maybeSingle();
  return (data as PathProfileRow | null) ?? null;
}

/**
 * The user's one Path conversation (one per purchase), created by the server.
 * The unique index conversations_one_path_per_user settles a creation race:
 * the loser reads the winner's row.
 */
export async function createPathConversation(supabase: SupabaseClient, userId: string): Promise<ConversationRow> {
  const { error } = await supabase.from('conversations').insert({ user_id: userId, kind: 'path' });
  if (error && error.code !== '23505') throw error;
  const existing = await getPathConversation(supabase, userId);
  if (!existing) throw new Error('Path conversation missing after insert');
  if (!existing.profileRow) {
    const { error: profileError } = await supabase
      .from('path_profiles')
      .insert({ conversation_id: existing.conversation.id, user_id: userId });
    if (profileError && profileError.code !== '23505') throw profileError;
  }
  return existing.conversation;
}

/** Seeds the profile if not done yet. Call while holding the turn claim. */
export async function ensureSeeded(supabase: SupabaseClient, conversation: ConversationRow): Promise<PathProfileRow> {
  const row = await getProfileRow(supabase, conversation.id);
  if (row && row.phase !== 'seeding' && isPathProfile(row.profile)) return row;

  const digest = await buildContextDigest(supabase, conversation.user_id);
  if (!digest) throw new Error('No ready Identity report');
  const { profile, tokens, fromModel } = await seedPathProfile(digest);
  if (!fromModel) console.error(`[path seed] fell back to the default profile for conversation ${conversation.id}`);

  const { data, error } = await supabase
    .from('path_profiles')
    .update({ profile, context_digest: digest, phase: 'conversation' })
    .eq('conversation_id', conversation.id)
    .select(PROFILE_SELECT)
    .single();
  if (error) throw error;
  await addTokens(supabase, conversation.id, tokens);
  return data as PathProfileRow;
}

// ── The turn ────────────────────────────────────────────────────────────────

export type PathChoices = {
  mode: 'single' | 'multi';
  max: number;
  options: Array<{ id: string; label: string }>;
};

type PathTurnOutput = {
  reply: string;
  profile_updates: unknown[];
  choices: PathChoices | null;
};

export function normalizeChoices(raw: unknown): PathChoices | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { mode?: unknown; max?: unknown; options?: unknown };
  if (!Array.isArray(r.options)) return null;
  const labels: string[] = [];
  for (const o of r.options) {
    const label = typeof (o as { label?: unknown })?.label === 'string' ? (o as { label: string }).label.trim() : '';
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length < 2) return null;
  const options = labels.slice(0, 8).map((label, i) => ({ id: `c${i + 1}`, label }));
  const mode = r.mode === 'multi' ? 'multi' : 'single';
  const max = mode === 'multi' && typeof r.max === 'number' && r.max >= 1
    ? Math.min(Math.floor(r.max), options.length)
    : mode === 'multi' ? options.length : 1;
  return { mode, max, options };
}

function parsePathTurn(raw: string | null): PathTurnOutput | null {
  try {
    const parsed = JSON.parse(raw ?? '') as { reply?: unknown; profile_updates?: unknown; choices?: unknown };
    if (typeof parsed?.reply !== 'string' || !parsed.reply.trim()) return null;
    return {
      reply: parsed.reply.trim(),
      profile_updates: Array.isArray(parsed.profile_updates) ? parsed.profile_updates : [],
      choices: normalizeChoices(parsed.choices),
    };
  } catch {
    return null;
  }
}

const REPLY_CHECKLIST = [
  'Shape: at most two short paragraphs. The first is one sentence on a concrete detail of what they just said. The second is the question itself, starting directly with it, with no lead-in line.',
  'No thanks, praise, reassurance, evaluation of their answer, or announcing what comes next.',
  'Never ask for something they have just told you or the profile already holds.',
  'Record every update their latest message gives, with the full value of each changed item.',
  'If your updates close the last open items, do not ask anything: close as the prompt describes for a complete profile.',
];

function historyMessage(m: StoredMessage): ChatCompletionMessageParam {
  return { role: m.role, content: m.content };
}

async function buildPathMessages(ctx: TurnContext): Promise<ChatCompletionMessageParam[]> {
  const row = await getProfileRow(ctx.supabase, ctx.conversation.id);
  if (!row || !isPathProfile(row.profile) || !row.context_digest) throw new Error('Path profile not seeded');
  const profile = row.profile;

  const state = {
    situation: ctx.userMessage ? 'continuing' : 'opening',
    first_name: row.context_digest.report.prepared_for.split(/\s+/)[0] ?? '',
    profile_complete: isProfileComplete(profile),
    open_items: openItems(profile).map(item => ({ item, still_needed: stillNeeded(profile, item) })),
    suggested_focus: suggestedFocus(profile),
    profile,
    // Repeated every turn, last in the prompt: these slipped most in live runs.
    reply_checklist: REPLY_CHECKLIST,
  };

  // Fixed prefix first (prompt, then the user context), so it caches.
  return [
    { role: 'system', content: PATH_CONVERSATION_PROMPT },
    { role: 'system', content: `USER CONTEXT\n${JSON.stringify(row.context_digest)}` },
    ...ctx.recent.map(historyMessage),
    ...(ctx.userMessage ? [{ role: 'user' as const, content: ctx.userMessage.content }] : []),
    { role: 'system', content: `SESSION STATE\n${JSON.stringify(state)}` },
  ];
}

async function applyPathTurn(ctx: TurnContext, parsed: PathTurnOutput): Promise<void> {
  if (!ctx.userMessage) return; // the opening turn records nothing
  const row = await getProfileRow(ctx.supabase, ctx.conversation.id);
  if (!row || !isPathProfile(row.profile)) return;

  const { profile, changed } = applyProfileUpdates(row.profile, parsed.profile_updates, ctx.userMessage.content);
  const { error } = await ctx.supabase
    .from('path_profiles')
    .update({
      profile,
      turns: row.turns + 1,
      turns_since_progress: changed.length ? 0 : row.turns_since_progress + 1,
    })
    .eq('conversation_id', ctx.conversation.id);
  if (error) console.error('Path profile update failed:', error);
}

export const PATH_TURN_CONFIG: ChatTurnConfig<PathTurnOutput> = {
  kind: 'path',
  entitlement: PATH_ENTITLEMENT,
  recentLimit: PATH_RECENT_MESSAGES,
  temperature: 0.6,
  retry: PATH_RETRY,
  responseFormat: { type: 'json_object' },
  buildMessages: buildPathMessages,
  parse: parsePathTurn,
  toAssistantMessage: parsed => ({ content: parsed.reply, choices: parsed.choices }),
  afterTurn: applyPathTurn,
};

// ── What the browser sees ───────────────────────────────────────────────────

export type PathMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  choices: PathChoices | null;
  selected_choice_ids: string[] | null;
};

export function toMessageView(m: StoredMessage): PathMessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    choices: (m.choices as PathChoices | null) ?? null,
    selected_choice_ids: m.selected_choice_ids,
  };
}

export function profileComplete(row: PathProfileRow | null): boolean {
  return !!row && isPathProfile(row.profile) && isProfileComplete(row.profile);
}
