import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import type { ConversationRow, RunTurn, StoredMessage, TurnContext, TurnRun } from '@/lib/chat-turn';
import { addTokens, listConversationMessages } from '@/lib/chat-turn';
import type { ChatChoiceSet } from '@/lib/chat-choices';
import { mergeAnswersWithQuestions } from '@/lib/identity-questions';
import { getChatCompletionDetailed, isRateLimitError, PATH_RETRY } from '@/lib/llm';
import {
  applyProfileUpdates,
  applySeedRules,
  applySignatureTaps,
  coerceItem,
  fallbackProfile,
  isItemComplete,
  isPathProfile,
  isProfileComplete,
  ITEM_KEYS,
  nextPatternStep,
  stillNeeded,
  suggestedFocus,
  type DrainSource,
  type ItemKey,
  type PathProfile,
  type SignatureReaction,
} from '@/lib/path-profile';
import { PATH_PROFILE_SEED_PROMPT } from '@/lib/prompts/path-profile-seed';
import { PATH_REPLY_PROMPT } from '@/lib/prompts/path-reply';
import { PATH_UPDATE_PROMPT } from '@/lib/prompts/path-update';
import {
  buildRefIndex,
  emptySummary,
  loadUserSummary,
  resolveExcerpts,
  summaryRefs,
  syncPatterns,
  validateSummary,
  writeUserSummary,
  SUMMARY_CAPS,
  type RefIndex,
  type UserSummary,
} from '@/lib/user-summary';

// #168: the Path conversation (docs/framework/path-plan-redesign.md) on the
// shared server-owned turn (lib/chat-turn.ts). Step 3b: each user message runs
// two calls. Call A updates the profile and rewrites the living user summary
// (lib/user-summary.ts); call B writes the reply from the summary, this turn's
// insights and the evidence behind them. Steps 4-5 add the summary playback,
// options and guardrails.

export const PATH_ENTITLEMENT = 'onetime_payment' as const;

// Recent messages each call sees; everything older lives on in the profile and summary.
const UPDATE_RECENT_MESSAGES = 8;
const REPLY_RECENT_MESSAGES = 4;

// Models. Seeding and call A (update) use the default (OPENAI_MODEL, else
// gpt-4o). Call B (reply) is switchable on its own: change PATH_REPLY_MODEL
// here, or set the PATH_REPLY_MODEL env var to override without a code change.
export const PATH_REPLY_MODEL = process.env.PATH_REPLY_MODEL || 'gpt-6.1-sol';
// Only the gpt-4 family accepts a custom temperature; newer models use their default.
const REPLY_TEMPERATURE = /^gpt-4/.test(PATH_REPLY_MODEL) ? 0.6 : undefined;

export type PathPhase = 'seeding' | 'conversation' | 'summary' | 'options' | 'chosen';

export type ReflectionStatus = 'offered' | 'follow_up' | 'confirmed' | 'corrected' | 'rejected';
export type Reflection = {
  id: 'r1' | 'r2';
  status: ReflectionStatus;
  message_id: string | null;
  text: string | null;
  final_text: string | null;
};

export type PathProfileRow = {
  conversation_id: string;
  user_id: string;
  phase: PathPhase;
  profile: unknown;
  context_digest: ContextDigest | null;
  turns: number;
  turns_since_progress: number;
  reflections: Reflection[];
};

const PROFILE_SELECT = 'conversation_id, user_id, phase, profile, context_digest, turns, turns_since_progress, reflections';

// ── Context: the 13 answers and a digest of the Identity report ─────────────

export type ContextDigest = {
  answers: Array<{ number: number; question: string; answer: string }>;
  report: {
    prepared_for: string;
    named_identity: string;
    identity_thesis: string;
    // evidence: the report's own evidence for the signature, drawn from the
    // user's answers (evidence_analysis), so signature lines can rest on it.
    primary_signatures: Array<{ name: string; core_statement: string; tension: string; evidence?: string }>;
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
        ...(s.evidence_analysis && { evidence: s.evidence_analysis }),
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

// The report fields a ref may point at (report.<key>), as the text an excerpt shows.
function reportFields(digest: ContextDigest): Record<string, string> {
  const r = digest.report;
  const fields: Record<string, string> = {
    identity_thesis: r.identity_thesis,
    synthesis: r.synthesis,
    energisers: r.energisers.join('; '),
    friction_points: r.friction_points.join('; '),
  };
  for (const [k, v] of Object.entries(r.how_you_operate ?? {})) if (typeof v === 'string') fields[`how_you_operate.${k}`] = v;
  for (const s of r.primary_signatures) {
    fields[`signature.${s.name}`] = `${s.core_statement} ${s.tension}`.trim();
    if (s.evidence) fields[`signature_evidence.${s.name}`] = s.evidence;
  }
  if (r.distinctive_pattern) fields.distinctive_pattern = [...r.distinctive_pattern.steps, ...r.distinctive_pattern.paragraphs].join(' ');
  if (r.pattern_to_notice) fields.pattern_to_notice = `${r.pattern_to_notice.headline}. ${r.pattern_to_notice.body} ${r.pattern_to_notice.takeaway}`;
  if (r.forward_frame) fields.forward_frame = r.forward_frame;
  return fields;
}

// The not-yet-saved user message is referred to as m:latest until it has an id.
const LATEST_REF = 'm:latest';

function refIndexFor(digest: ContextDigest, userMessages: Array<{ id: string; content: string }>): RefIndex {
  return buildRefIndex({ answers: digest.answers, reportFields: reportFields(digest), userMessages });
}

// temperature undefined: the model's default (the newer models only accept that).
// Logs one usage line per call (tokens, cache hits, reasoning, latency), for
// cost tracking and the token budget.
async function chatJson(
  messages: ChatCompletionMessageParam[],
  temperature: number | undefined,
  label: string,
  model?: string,
  conversationId?: string,
) {
  const started = Date.now();
  const result = await getChatCompletionDetailed({
    messages,
    temperature,
    response_format: { type: 'json_object' },
    retry: { ...PATH_RETRY, label },
    ...(model && { model }),
  });
  const u = result.usage;
  console.info(`[path usage] ${JSON.stringify({
    conversation: conversationId ?? null,
    call: label,
    model: model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
    input: u.prompt_tokens,
    cached: u.cached_tokens,
    output: u.completion_tokens,
    reasoning: u.reasoning_tokens,
    ms: Date.now() - started,
  })}`);
  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(result.content ?? '');
    parsed = p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    parsed = null;
  }
  return { parsed, tokens: result.usage.prompt_tokens + result.usage.completion_tokens };
}

// ── Seeding ─────────────────────────────────────────────────────────────────

function parseSeedProfile(raw: unknown): PathProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const profile = { version: 1 } as PathProfile;
  for (const key of ITEM_KEYS) {
    (profile as Record<string, unknown>)[key] = coerceItem(key, (raw as Record<string, unknown>)[key], 'questionnaire');
  }
  return profile;
}

// If the seed's summary is unusable, start from the report's own lines for
// each signature; the first rewrite replaces them with the user's evidence.
function fallbackSummary(digest: ContextDigest): UserSummary {
  return {
    ...emptySummary(),
    confirmed_patterns: digest.report.primary_signatures.map(s => ({
      signature: s.name,
      status: 'proposed' as const,
      how_it_shows_up: s.core_statement.slice(0, SUMMARY_CAPS.entry_chars),
      user_words: null,
      drain_source: null,
      refs: s.evidence ? [`report.signature_evidence.${s.name}`] : [`report.signature.${s.name}`],
    })),
  };
}

/**
 * One model call: the starting profile (with the design doc's fixed rules
 * applied in code) and the starting summary. Falls back to an all-missing
 * profile and a report-based summary if the output is unusable twice, so the
 * conversation can always start.
 */
export async function seedPath(digest: ContextDigest, conversationId?: string): Promise<{ profile: PathProfile; summary: UserSummary; tokens: number; fromModel: boolean }> {
  const signatureNames = digest.report.primary_signatures.map(s => s.name);
  const index = refIndexFor(digest, []);
  let tokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { parsed, tokens: used } = await chatJson([
      { role: 'system', content: PATH_PROFILE_SEED_PROMPT },
      { role: 'user', content: JSON.stringify({ ...digest, valid_refs: [...index.keys()] }) },
    ], 0.2, 'path seed', undefined, conversationId);
    tokens += used;
    const profile = parseSeedProfile(parsed?.profile);
    if (profile) {
      const seeded = applySeedRules(profile, signatureNames);
      const validated = validateSummary(parsed?.summary, {
        index,
        signatureNames,
        ownTexts: digest.answers.map(a => a.answer),
        allowConfirmedByUser: false,
        previous: fallbackSummary(digest),
      });
      // Like the profile, the summary starts with nothing under "tried": the seed
      // kept listing things that were not attempts, and the reply then led with them.
      const summary = { ...(validated?.summary ?? fallbackSummary(digest)), tried: [] };
      return { profile: seeded, summary: syncPatterns(summary, seeded), tokens, fromModel: true };
    }
    console.warn(`[path seed] unusable output (attempt ${attempt + 1})`);
  }
  const profile = fallbackProfile(signatureNames);
  return { profile, summary: syncPatterns(fallbackSummary(digest), profile), tokens, fromModel: false };
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

/**
 * Seeds the profile and, if the user has none yet, the summary (it belongs to
 * the user, so an existing one is kept). Call while holding the turn claim.
 */
export async function ensureSeeded(supabase: SupabaseClient, conversation: ConversationRow): Promise<PathProfileRow> {
  const row = await getProfileRow(supabase, conversation.id);
  if (row && row.phase !== 'seeding' && isPathProfile(row.profile)) return row;

  const digest = await buildContextDigest(supabase, conversation.user_id);
  if (!digest) throw new Error('No ready Identity report');
  const { profile, summary, tokens, fromModel } = await seedPath(digest, conversation.id);
  if (!fromModel) console.error(`[path seed] fell back to the default profile for conversation ${conversation.id}`);

  if (!(await loadUserSummary(supabase, conversation.user_id))) {
    await writeUserSummary(supabase, conversation.user_id, summary, null, 'path_seed', conversation.id);
  }
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

// ── What the next message must do ───────────────────────────────────────────

type Next =
  | { kind: 'open' }
  | { kind: 'item'; item: ItemKey; still_needed: string }
  | { kind: 'reflection'; id: 'r1' | 'r2' }
  | { kind: 'reflection_follow_up'; id: 'r1' | 'r2' }
  | { kind: 'complete' };

const PENDING: ReflectionStatus[] = ['offered', 'follow_up'];

function itemsComplete(profile: PathProfile, items: ItemKey[]) {
  return items.every(i => isItemComplete(profile, i));
}

/**
 * Code decides what comes next, so the order holds: an open reflection
 * follow-up, then the pattern steps, then the two reflection moments (design
 * doc, "Reflection moments"), then the next open item.
 */
function computeNext(profile: PathProfile, reflections: Reflection[], summary: UserSummary, opening: boolean): Next {
  if (opening) return { kind: 'open' };
  const followUp = reflections.find(r => r.status === 'follow_up');
  if (followUp) return { kind: 'reflection_follow_up', id: followUp.id };

  if (nextPatternStep(profile)) return { kind: 'item', item: 'pattern_confirmation', still_needed: stillNeeded(profile, 'pattern_confirmation') };

  const has = (id: 'r1' | 'r2') => reflections.some(r => r.id === id);
  // R1: patterns, pressure and past attempts are in; connect them before direction.
  if (!has('r1') && itemsComplete(profile, ['pattern_confirmation', 'pushing_now', 'tried_before'])) {
    return { kind: 'reflection', id: 'r1' };
  }
  // R2: only if the summary holds a tension or connection the user hasn't confirmed.
  const unconfirmed = [...summary.tensions, ...summary.connections].some(n => !n.confirmed_by_user);
  if (!has('r2') && unconfirmed && itemsComplete(profile, ['clarity_of_direction', 'must_hold'])) {
    return { kind: 'reflection', id: 'r2' };
  }

  if (isProfileComplete(profile)) return { kind: 'complete' };
  const item = suggestedFocus(profile)[0];
  return { kind: 'item', item, still_needed: stillNeeded(profile, item) };
}

// ── Choices code attaches itself, and maps back onto the profile ────────────

const GRID_OPTIONS = [
  { id: 'yes', label: 'Yes, that’s me', reaction: 'confirmed' },
  { id: 'partly', label: 'Partly', reaction: 'corrected' },
  { id: 'no', label: 'Not me', reaction: 'rejected' },
  { id: 'drains', label: 'That’s me, but I don’t enjoy it', reaction: 'draining' },
] as const satisfies ReadonlyArray<{ id: string; label: string; reaction: SignatureReaction }>;

const DRAIN_OPTIONS = [
  { id: 'activity', label: 'The work itself' },
  { id: 'context', label: 'Where and how I do it now' },
  { id: 'unclear', label: 'I’m not sure' },
] as const satisfies ReadonlyArray<{ id: DrainSource; label: string }>;

const REFLECTION_OPTIONS = [
  { id: 'yes', label: 'Yes, that fits' },
  { id: 'partly', label: 'Partly' },
  { id: 'no', label: 'No, that’s not it' },
] as const;

function fixedChoices(next: Next, profile: PathProfile, digest: ContextDigest): ChatChoiceSet | null {
  const signatures = profile.pattern_confirmation.value?.signatures ?? [];
  // Energisers, then friction points: the report's lists exactly, one list per message.
  if (next.kind === 'item' && next.item === 'must_hold') {
    const v = profile.must_hold.value;
    const [purpose, list] = !v?.energisers.length
      ? ['energisers' as const, digest.report.energisers]
      : !v?.friction_points.length ? ['friction_points' as const, digest.report.friction_points] : [null, []];
    if (purpose && list.length >= 2) {
      return { mode: 'multi', max: Math.min(3, list.length), purpose, options: list.map((label, i) => ({ id: `${purpose[0]}${i + 1}`, label })) };
    }
  }
  const step = nextPatternStep(profile);
  if (next.kind === 'open' || (next.kind === 'item' && next.item === 'pattern_confirmation' && step?.kind === 'grid')) {
    return {
      mode: 'matrix',
      purpose: 'patterns',
      rows: signatures.map((s, i) => ({ id: `s${i + 1}`, label: s.name })),
      options: GRID_OPTIONS.map(({ id, label }) => ({ id, label })),
    };
  }
  if (next.kind === 'item' && step?.kind === 'drain') {
    return { mode: 'single', max: 1, purpose: 'drain_source', target: step.name, options: DRAIN_OPTIONS.map(o => ({ ...o })) };
  }
  if (next.kind === 'reflection') {
    return { mode: 'single', max: 1, purpose: 'reflection', target: next.id, options: REFLECTION_OPTIONS.map(o => ({ ...o })) };
  }
  return null;
}

/** Applies a tap on code-owned choices exactly, before call A sees the message. */
function applyTap(
  profile: PathProfile,
  reflections: Reflection[],
  answered: StoredMessage | undefined,
  ids: string[] | null,
): { profile: PathProfile; reflections: Reflection[] } {
  const choices = answered?.choices as ChatChoiceSet | null | undefined;
  if (!choices?.purpose || !ids?.length) return { profile, reflections };

  if (choices.purpose === 'patterns' && choices.mode === 'matrix') {
    const reactions = new Map<string, SignatureReaction>();
    for (const id of ids) {
      const [rowId, optionId] = id.split(':');
      const row = choices.rows.find(r => r.id === rowId);
      const option = GRID_OPTIONS.find(o => o.id === optionId);
      if (row && option) reactions.set(row.label, option.reaction);
    }
    return { profile: applySignatureTaps(profile, reactions), reflections };
  }
  if ((choices.purpose === 'energisers' || choices.purpose === 'friction_points') && choices.mode !== 'matrix') {
    const picked = choices.options.filter(o => ids.includes(o.id)).map(o => o.label);
    if (!picked.length) return { profile, reflections };
    const current = profile.must_hold.value ?? { energisers: [], friction_points: [] };
    const value = { ...current, [choices.purpose]: picked };
    return {
      profile: { ...profile, must_hold: { ...profile.must_hold, status: 'confirmed', value, source: 'conversation' } },
      reflections,
    };
  }
  if (choices.purpose === 'drain_source' && choices.target) {
    const source = DRAIN_OPTIONS.find(o => o.id === ids[0])?.id;
    if (!source) return { profile, reflections };
    return { profile: applySignatureTaps(profile, new Map(), new Map([[choices.target, source]])), reflections };
  }
  if (choices.purpose === 'reflection' && choices.target) {
    return {
      profile,
      reflections: reflections.map(r => {
        if (r.id !== choices.target || r.status !== 'offered') return r;
        // A plain yes settles it; partly or no gets one follow-up asking what's off.
        return ids[0] === 'yes' ? { ...r, status: 'confirmed' as const, final_text: r.text } : { ...r, status: 'follow_up' as const };
      }),
    };
  }
  return { profile, reflections };
}

/** Call A's reading of a typed answer to a reflection; at most one follow-up. */
function applyReflectionResult(reflections: Reflection[], result: unknown, tapped: boolean): Reflection[] {
  const r = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  return reflections.map(ref => {
    if (!PENDING.includes(ref.status)) return ref;
    if (tapped && ref.status === 'follow_up' && !r) return ref; // the tap itself just asked for the follow-up
    const status = r?.id === ref.id ? r.status : null;
    const finalText = typeof r?.final_text === 'string' && r.final_text.trim() ? r.final_text.trim() : null;
    if (status === 'confirmed') return { ...ref, status: 'confirmed', final_text: ref.text };
    if (status === 'corrected' && finalText) return { ...ref, status: 'corrected', final_text: finalText };
    if (status === 'rejected') return { ...ref, status: 'rejected' };
    // Unclear or no reading: an offered reflection gets its one follow-up, a follow-up is closed.
    return ref.status === 'offered' ? { ...ref, status: 'follow_up' } : { ...ref, status: 'rejected' };
  });
}

// Energisers and friction points in a typed answer must map onto the report's
// own items (exact, case-insensitive); anything else is dropped.
function restrictMustHold(update: unknown, digest: ContextDigest): unknown {
  const u = update as { item?: unknown; value?: { energisers?: unknown; friction_points?: unknown } };
  if (u?.item !== 'must_hold' || !u.value) return update;
  const pick = (list: unknown, allowed: string[]) =>
    (Array.isArray(list) ? list : [])
      .map(x => (typeof x === 'string' ? allowed.find(a => a.toLowerCase() === x.trim().toLowerCase()) : undefined))
      .filter((x): x is string => !!x);
  return {
    ...u,
    value: { energisers: pick(u.value.energisers, digest.report.energisers), friction_points: pick(u.value.friction_points, digest.report.friction_points) },
  };
}

// ── The turn: call A (update), then call B (reply) ──────────────────────────

type Insight = { text: string; refs: string[] };

function validInsights(raw: unknown, index: RefIndex): Insight[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(i => {
    const o = i && typeof i === 'object' ? (i as Record<string, unknown>) : null;
    const text = typeof o?.text === 'string' ? o.text.trim() : '';
    const refs = Array.isArray(o?.refs) ? o.refs.filter((r): r is string => typeof r === 'string' && index.has(r)) : [];
    return text && text.length <= SUMMARY_CAPS.entry_chars && refs.length ? [{ text, refs }] : [];
  }).slice(0, 2);
}

function messageForModel(m: StoredMessage) {
  return { id: m.id, role: m.role, content: m.content };
}

export function normalizeChoices(raw: unknown): ChatChoiceSet | null {
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

async function runPathTurn(ctx: TurnContext): Promise<TurnRun> {
  const { supabase, conversation, userMessage } = ctx;
  const row = await getProfileRow(supabase, conversation.id);
  if (!row || !isPathProfile(row.profile) || !row.context_digest) throw new Error('Path profile not seeded');
  const digest = row.context_digest;
  const stored = await loadUserSummary(supabase, conversation.user_id);
  const all = await listConversationMessages(supabase, conversation.id);
  const userMessages = all.filter(m => m.role === 'user');
  const signatureNames = digest.report.primary_signatures.map(s => s.name);

  let profile: PathProfile = row.profile;
  let reflections: Reflection[] = row.reflections ?? [];
  let summary: UserSummary = stored?.summary ?? emptySummary();
  let insights: Insight[] = [];
  let tokens = 0;
  const index = refIndexFor(digest, [
    ...userMessages.map(m => ({ id: m.id, content: m.content })),
    ...(userMessage ? [{ id: 'latest', content: userMessage.content }] : []),
  ]);

  try {
    if (userMessage) {
      const answered = [...all].reverse().find(m => m.role === 'assistant');
      const answeredChoices = answered?.choices as ChatChoiceSet | null | undefined;
      // What the previous message asked about, worked out from the state it was written from.
      const asked = computeNext(row.profile, row.reflections ?? [], summary, false);
      const answeredItem = asked.kind === 'item' ? asked.item : null;
      // A tap on choices code owns (the grid, drain source, reflection) is applied by
      // code exactly; its labels are not the user's own words.
      const codeTap = !!(userMessage.selected_choice_ids && answeredChoices?.purpose);
      const userText = codeTap ? '' : userMessage.content;

      ({ profile, reflections } = applyTap(profile, reflections, answered, userMessage.selected_choice_ids));
      const pending = reflections.find(r => PENDING.includes(r.status));

      // Call A: update.
      const update = await chatJson([
        { role: 'system', content: PATH_UPDATE_PROMPT },
        { role: 'system', content: `USER CONTEXT\n${JSON.stringify(digest)}` },
        {
          role: 'user',
          content: JSON.stringify({
            valid_refs: [...index.keys()],
            profile,
            summary,
            recent_messages: all.slice(-UPDATE_RECENT_MESSAGES).map(messageForModel),
            latest_message: {
              ref: LATEST_REF,
              content: userMessage.content,
              ...(userMessage.selected_choice_ids && answeredChoices && { tapped: { offered: answeredChoices, picked: userMessage.selected_choice_ids } }),
            },
            pending_reflection: pending ? { id: pending.id, text: pending.text, status: pending.status } : null,
          }),
        },
      ], 0.2, 'path update', undefined, conversation.id);
      tokens += update.tokens;
      if (!update.parsed) return { ok: false, status: 502, error: 'no_usable_update', tokens };

      const updates = Array.isArray(update.parsed.profile_updates)
        ? update.parsed.profile_updates
            .filter(u => {
              const item = (u as { item?: unknown })?.item;
              // Code applied these taps exactly; the model must not redo them.
              if (codeTap && item === 'pattern_confirmation' && (answeredChoices?.purpose === 'patterns' || answeredChoices?.purpose === 'drain_source')) return false;
              // What must hold is only ever set from the user's answer to that question:
              // in live runs the model filled the whole friction list without asking.
              if (item === 'must_hold' && (codeTap || answeredItem !== 'must_hold')) return false;
              return true;
            })
            .map(u => restrictMustHold(u, digest))
        : [];
      profile = applyProfileUpdates(profile, updates, { userText, answeredItem }).profile;
      if (pending) reflections = applyReflectionResult(reflections, update.parsed.reflection_result, !!userMessage.selected_choice_ids);
      const validated = validateSummary(update.parsed.summary, {
        index,
        signatureNames,
        ownTexts: [...digest.answers.map(a => a.answer), ...userMessages.filter(m => !m.selected_choice_ids).map(m => m.content), userText],
        allowConfirmedByUser: reflections.some(r => r.status === 'confirmed' || r.status === 'corrected'),
        previous: summary,
      });
      if (validated) summary = validated.summary;
      insights = validInsights(update.parsed.turn_insights, index);
    }
    summary = syncPatterns(summary, profile);

    // Call B: reply.
    const next = computeNext(profile, reflections, summary, !userMessage);
    const fixed = fixedChoices(next, profile, digest);
    const evidence = resolveExcerpts([...summaryRefs(summary), ...insights.flatMap(i => i.refs)], index);
    const reply = await chatJson([
      { role: 'system', content: PATH_REPLY_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          first_name: digest.report.prepared_for.split(/\s+/)[0] ?? '',
          next,
          fixed_choices: fixed,
          summary,
          turn_insights: insights,
          evidence,
          report_extract: {
            named_identity: digest.report.named_identity,
            primary_signatures: digest.report.primary_signatures.map(s => ({ name: s.name, core_statement: s.core_statement })),
            ...(next.kind === 'item' && next.item === 'must_hold' && {
              energisers: digest.report.energisers,
              friction_points: digest.report.friction_points,
            }),
          },
          recent_messages: all.slice(-REPLY_RECENT_MESSAGES).map(({ role, content }) => ({ role, content })),
          latest_message: userMessage ? { ref: LATEST_REF, content: userMessage.content } : null,
        }),
      },
    ], REPLY_TEMPERATURE, 'path reply', PATH_REPLY_MODEL, conversation.id);
    tokens += reply.tokens;
    const text = typeof reply.parsed?.reply === 'string' ? reply.parsed.reply.trim() : '';
    if (!text) return { ok: false, status: 502, error: 'no_usable_reply', tokens };

    if (next.kind === 'reflection') reflections = [...reflections, { id: next.id, status: 'offered', message_id: null, text, final_text: null }];

    const progress = JSON.stringify(profile) !== JSON.stringify(row.profile) || JSON.stringify(reflections) !== JSON.stringify(row.reflections ?? []);
    return {
      ok: true,
      assistant: { content: text, choices: fixed ?? normalizeChoices(reply.parsed?.choices) },
      tokens,
      commit: async saved => {
        const userId = userMessage ? saved[0]?.id : null;
        const assistantId = saved[saved.length - 1]?.id ?? null;
        const finalSummary = userId
          ? (JSON.parse(JSON.stringify(summary).split(`"${LATEST_REF}"`).join(`"m:${userId}"`)) as UserSummary)
          : summary;
        const finalReflections = reflections.map(r => (r.status === 'offered' && !r.message_id ? { ...r, message_id: assistantId } : r));

        const { error } = await supabase
          .from('path_profiles')
          .update({
            profile,
            reflections: finalReflections,
            turns: row.turns + (userMessage ? 1 : 0),
            turns_since_progress: userMessage ? (progress ? 0 : row.turns_since_progress + 1) : row.turns_since_progress,
          })
          .eq('conversation_id', conversation.id);
        if (error) console.error('Path profile update failed:', error);

        const written = await writeUserSummary(supabase, conversation.user_id, finalSummary, stored?.version ?? null, 'path_turn', conversation.id);
        if (!written) console.error(`[user summary] write conflict for user ${conversation.user_id}; kept the newer version`);
      },
    };
  } catch (error) {
    if (isRateLimitError(error)) return { ok: false, status: 503, error: 'busy', tokens };
    throw error;
  }
}

export const PATH_TURN_CONFIG: RunTurn = {
  kind: 'path',
  entitlement: PATH_ENTITLEMENT,
  recentLimit: REPLY_RECENT_MESSAGES,
  run: runPathTurn,
};

// ── What the browser sees ───────────────────────────────────────────────────

export type PathMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  choices: ChatChoiceSet | null;
  selected_choice_ids: string[] | null;
};

export function toMessageView(m: StoredMessage): PathMessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    choices: (m.choices as ChatChoiceSet | null) ?? null,
    selected_choice_ids: m.selected_choice_ids,
  };
}

/** Every item complete and no reflection still waiting for the user. */
export function profileComplete(row: PathProfileRow | null): boolean {
  return !!row
    && isPathProfile(row.profile)
    && isProfileComplete(row.profile)
    && !(row.reflections ?? []).some(r => PENDING.includes(r.status));
}
