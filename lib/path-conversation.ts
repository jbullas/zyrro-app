import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import type { ConversationRow, RunTurn, StoredMessage, TurnContext, TurnRun } from '@/lib/chat-turn';
import { addTokens, listConversationMessages } from '@/lib/chat-turn';
import { noteFromContent, type ChatChoiceSet, type ChoiceGroup, type SummaryCard } from '@/lib/chat-choices';
import { mergeAnswersWithQuestions } from '@/lib/identity-questions';
import { getChatCompletionDetailed, isRateLimitError, PATH_RETRY } from '@/lib/llm';
import {
  applyOpeningReadFollowUp,
  applyOpeningReadTap,
  applyProfileUpdates,
  applyRiskTimeTap,
  ASKED_ITEMS,
  AT_STAKE_LABELS,
  emptyProfile,
  HOURS_BANDS,
  isItemComplete,
  isPathProfile,
  ITEM_KEYS,
  LIMIT_LABELS,
  MODEL_ITEMS,
  openItems,
  READINESS_LABELS,
  seedProfile,
  settleAnswered,
  stillNeeded,
  type Asked,
  type AskedItem,
  type EvidencedItem,
  type PathProfile,
} from '@/lib/path-profile';
import { PATH_PROFILE_SEED_PROMPT } from '@/lib/prompts/path-profile-seed';
import { PATH_REPLY_PROMPT } from '@/lib/prompts/path-reply';
import { PATH_UPDATE_PROMPT } from '@/lib/prompts/path-update';
import {
  buildRefIndex,
  emptySummary,
  isCurrentSummary,
  loadUserSummary,
  resolveExcerpts,
  summaryRefs,
  syncMustItems,
  validateEvidenced,
  validateSummary,
  writeUserSummary,
  SUMMARY_CAPS,
  type RefIndex,
  type UserSummary,
} from '@/lib/user-summary';

// #168: the Path conversation (docs/framework/path-plan-redesign.md; brief
// docs/briefs/168-shorter-flow.md) on the shared server-owned turn
// (lib/chat-turn.ts). Each user message runs two calls: call A updates the
// profile, the must-haves and must-avoids and the living user summary
// (lib/user-summary.ts); call B writes the reply from the summary, this turn's
// insights and the evidence behind them. Code decides what comes next, applies
// every tap on its own choices, and moves the phase to `summary` in the same
// turn the profile completes, returning the summary card. Options are the
// next brief.

export const PATH_ENTITLEMENT = 'onetime_payment' as const;

// Recent messages each call sees; everything older lives on in the profile and summary.
const UPDATE_RECENT_MESSAGES = 8;
const REPLY_RECENT_MESSAGES = 4;

// Guardrails (step 0, approved 2026-11-06). Five exchanges is the target; the
// stall rule and the cap are safety nets.
const STALL_TURNS = 2;
const MAX_USER_TURNS = 12;
export const MESSAGE_MAX_CHARS = 1500;

// Models. Seeding and call A (update) use the default (OPENAI_MODEL, else
// gpt-4o). Call B (reply) is switchable on its own: change PATH_REPLY_MODEL
// here, or set the PATH_REPLY_MODEL env var to override without a code change.
export const PATH_REPLY_MODEL = process.env.PATH_REPLY_MODEL || 'gpt-6.1-sol';
// Only the gpt-4 family accepts a custom temperature; newer models use their default.
const REPLY_TEMPERATURE = /^gpt-4/.test(PATH_REPLY_MODEL) ? 0.6 : undefined;

export type PathPhase = 'seeding' | 'conversation' | 'summary' | 'options' | 'chosen';

// The one interpretive reflection (design doc, "One interpretive reflection at most").
export type Reflection = {
  id: 'r1';
  status: 'offered' | 'confirmed' | 'corrected' | 'rejected' | 'no_reaction';
  message_id: string | null;
  theme: string;
  text: string;
};

// path_profiles.summary while in the summary phase: the latest card, and a
// correction waiting for its one clarifying answer.
export type CardState = {
  round: number;
  card: SummaryCard;
  correction: { verdict: 'mostly' | 'not_it'; parts: string[]; note: string | null } | null;
  clarify_pending: boolean;
  confirmed: boolean;
};

export type PathProfileRow = {
  conversation_id: string;
  user_id: string;
  phase: PathPhase;
  profile: unknown;
  context_digest: ContextDigest | null;
  summary: CardState | null;
  summary_confirmed_at: string | null;
  turns: number;
  turns_since_progress: number;
  reflections: Reflection[];
};

const PROFILE_SELECT = 'conversation_id, user_id, phase, profile, context_digest, summary, summary_confirmed_at, turns, turns_since_progress, reflections';

// ── Context: the 13 answers and a digest of the Identity report ─────────────

export type ContextDigest = {
  answers: Array<{ number: number; question: string; answer: string }>;
  report: {
    prepared_for: string;
    named_identity: string;
    identity_thesis: string;
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

type OwnMessage = { id: string; content: string };

/**
 * The user's own words in each of their messages: the typed text, or for a
 * tap only the note (the tapped labels are Zyrro's words, not theirs).
 */
function ownMessages(all: StoredMessage[]): OwnMessage[] {
  const out: OwnMessage[] = [];
  all.forEach((m, i) => {
    if (m.role !== 'user') return;
    if (!m.selected_choice_ids) return out.push({ id: m.id, content: m.content });
    const before = [...all.slice(0, i)].reverse().find(x => x.role === 'assistant');
    const choices = before?.choices as ChatChoiceSet | null | undefined;
    out.push({ id: m.id, content: choices ? noteFromContent(choices, m.selected_choice_ids, m.content) : '' });
  });
  return out;
}

// All evidence (summary, insights) / only the user's own words (must-haves and must-avoids).
function refIndexFor(digest: ContextDigest, messages: OwnMessage[]): RefIndex {
  return buildRefIndex({ answers: digest.answers, reportFields: reportFields(digest), userMessages: messages });
}
function ownIndexFor(digest: ContextDigest, messages: OwnMessage[]): RefIndex {
  return buildRefIndex({ answers: digest.answers, reportFields: {}, userMessages: messages });
}

// temperature undefined: the model's default (the newer models only accept that).
// Logs one usage line per call (tokens, cache hits, reasoning, latency).
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

// ── User-facing text checks ────────────────────────────────────────────────

/** No em or en dashes in user-facing text (brief, item 11). */
export function fixDashes(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*([,.;:!?])/g, '$1')
    .replace(/^,\s*/gm, '');
}

function signatureTerms(digest: ContextDigest): string[] {
  return [
    ...digest.report.primary_signatures.map(s => s.name),
    ...digest.report.secondary_signatures,
    digest.report.named_identity,
  ].map(t => t?.trim()).filter((t): t is string => !!t && t.length > 2);
}

function mentionsSignature(text: string, digest: ContextDigest): string | null {
  const lower = text.toLowerCase();
  return signatureTerms(digest).find(t => lower.includes(t.toLowerCase())) ?? null;
}

// ── Seeding ─────────────────────────────────────────────────────────────────

/**
 * One model call: the starting profile (design doc's fixed rules applied in
 * code), the must-haves and must-avoids (each quote checked against its
 * answer) and the starting summary. Falls back to an empty profile and
 * summary if the output is unusable twice, so the conversation can always start.
 */
export async function seedPath(digest: ContextDigest, conversationId?: string): Promise<{ profile: PathProfile; summary: UserSummary; tokens: number; fromModel: boolean }> {
  const index = refIndexFor(digest, []);
  const ownIndex = ownIndexFor(digest, []);
  let tokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { parsed, tokens: used } = await chatJson([
      { role: 'system', content: PATH_PROFILE_SEED_PROMPT },
      { role: 'user', content: JSON.stringify({ ...digest, valid_refs: [...index.keys()] }) },
    ], 0.2, 'path seed', undefined, conversationId);
    tokens += used;
    // All four parts or none: in live runs the seed sometimes returned only the
    // profile, which left the conversation with no must-haves or must-avoids.
    const complete = !!parsed && !!parsed.profile && typeof parsed.profile === 'object'
      && Array.isArray(parsed.must_haves) && Array.isArray(parsed.must_avoids)
      && !!parsed.summary && typeof parsed.summary === 'object';
    if (parsed && complete) {
      const profile = seedProfile(parsed.profile);
      const haves = validateEvidenced(parsed.must_haves, ownIndex, 'h', []);
      const avoids = validateEvidenced(parsed.must_avoids, ownIndex, 'a', []);
      const dropped = [...haves.dropped, ...avoids.dropped];
      if (dropped.length) console.warn(`[path seed] must items dropped: ${dropped.join('; ')}`);
      profile.must_haves_avoids = {
        ...profile.must_haves_avoids,
        status: 'inferred',
        value: { must_haves: haves.items, must_avoids: avoids.items },
        source: 'questionnaire',
      };
      const validated = validateSummary(parsed.summary, { index, confirmedThemes: [], previous: null });
      // Nothing is confirmed, and nothing counts as tried, before the user has spoken.
      const summary = { ...(validated?.summary ?? emptySummary()), confirmed_read: null, tried: [] };
      return { profile, summary: syncMustItems(summary, profile), tokens, fromModel: true };
    }
    console.warn(`[path seed] unusable output (attempt ${attempt + 1})`);
  }
  return { profile: emptyProfile(), summary: emptySummary(), tokens, fromModel: false };
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
 * Seeds the profile and the user's summary. The summary belongs to the user,
 * so a current one is kept; one in an older schema is replaced. Call while
 * holding the turn claim.
 */
export async function ensureSeeded(supabase: SupabaseClient, conversation: ConversationRow): Promise<PathProfileRow> {
  const row = await getProfileRow(supabase, conversation.id);
  if (row && row.phase !== 'seeding' && isPathProfile(row.profile)) return row;

  const digest = await buildContextDigest(supabase, conversation.user_id);
  if (!digest) throw new Error('No ready Identity report');
  const { profile, summary, tokens, fromModel } = await seedPath(digest, conversation.id);
  if (!fromModel) console.error(`[path seed] fell back to the empty profile for conversation ${conversation.id}`);

  const stored = await loadUserSummary(supabase, conversation.user_id);
  if (!stored) {
    await writeUserSummary(supabase, conversation.user_id, summary, null, 'path_seed', conversation.id);
  } else if (!isCurrentSummary(stored.summary)) {
    await writeUserSummary(supabase, conversation.user_id, summary, stored.version, 'path_seed', conversation.id);
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
  | { kind: 'open_read'; urgency_unknown: boolean }
  | { kind: 'follow_up'; item: AskedItem; still_needed: string }
  | { kind: 'clarify'; item: AskedItem; contradiction: { text: string; refs: string[] } }
  | { kind: 'item'; item: AskedItem; still_needed: string; reflection?: { theme: string; text: string; refs: string[] } }
  | { kind: 'card' };

function asAsked(next: Next): Asked {
  switch (next.kind) {
    case 'open_read': return { kind: 'open_read' };
    case 'card': return { kind: 'card' };
    default: return { kind: next.kind, item: next.item };
  }
}

/** The one reflection: a note the user hasn't confirmed and Zyrro hasn't said yet. */
function reflectionCandidate(summary: UserSummary, stated: string[]) {
  const said = new Set(stated.map(s => s.toLowerCase()));
  return [...summary.connections, ...summary.tensions].find(n => !n.confirmed_by_user && !said.has(n.theme.toLowerCase())) ?? null;
}

/**
 * Code decides what comes next (design doc, "Conversation order" and "When
 * Zyrro has enough"): the opening read, then a pending clarification, then
 * the summary card if the conversation has stalled or hit the cap, then the
 * first open item in order (its one follow-up if it needs one). The one
 * reflection goes with the direction question.
 */
function computeNext(
  profile: PathProfile,
  summary: UserSummary,
  reflections: Reflection[],
  state: { opening: boolean; turns: number; turnsSinceProgress: number },
): Next {
  if (state.opening) return { kind: 'open_read', urgency_unknown: !profile.pushing_now.value?.urgency };
  const clarify = profile.meta.pending_clarify;
  if (clarify) return { kind: 'clarify', item: clarify.item, contradiction: { text: clarify.text, refs: clarify.refs } };
  if (state.turns >= MAX_USER_TURNS || state.turnsSinceProgress >= STALL_TURNS) return { kind: 'card' };

  const item = openItems(profile)[0];
  if (!item) return { kind: 'card' };
  if (profile[item].follow_ups >= 1) return { kind: 'follow_up', item, still_needed: stillNeeded(profile, item) };
  if (item === 'direction' && reflections.length === 0) {
    const r = reflectionCandidate(summary, profile.meta.stated_themes);
    if (r) return { kind: 'item', item, still_needed: stillNeeded(profile, item), reflection: { theme: r.theme, text: r.text, refs: r.refs } };
  }
  return { kind: 'item', item, still_needed: stillNeeded(profile, item) };
}

// ── Choices code attaches itself ───────────────────────────────────────────

const OPTIONAL_NOTE = { placeholder: 'Anything to add? (optional)' };

function openingReadChoices(profile: PathProfile): ChatChoiceSet {
  const groups: ChoiceGroup[] = [{
    id: 'read',
    label: 'This read',
    mode: 'single',
    required: true,
    options: [
      { id: 'right', label: 'That’s right' },
      { id: 'partly', label: 'Partly' },
      { id: 'not_quite', label: 'Not quite' },
    ],
  }];
  if (profile.pushing_now.value && !profile.pushing_now.value.urgency) {
    groups.push({
      id: 'urgency',
      label: 'Anything forcing a decision',
      mode: 'single',
      required: true,
      options: [
        { id: 'no_rush', label: 'No rush' },
        { id: 'soon', label: 'Fairly soon' },
        { id: 'deadline', label: 'A real deadline' },
      ],
    });
  }
  return { mode: 'groups', purpose: 'opening_read', groups, note: { placeholder: 'What’s off, if anything? (optional)' } };
}

function riskTimeChoices(): ChatChoiceSet {
  return {
    mode: 'groups',
    purpose: 'risk_time',
    note: OPTIONAL_NOTE,
    groups: [
      {
        id: 'readiness', label: 'The change I’m ready to make now', mode: 'single', required: true,
        options: (Object.keys(READINESS_LABELS) as Array<keyof typeof READINESS_LABELS>).map(id => ({ id, label: READINESS_LABELS[id] })),
      },
      {
        id: 'at_stake', label: 'What I’d put at risk', mode: 'multi', required: true, exclusive: ['unsure'],
        options: (Object.keys(AT_STAKE_LABELS) as Array<keyof typeof AT_STAKE_LABELS>).map(id => ({ id, label: AT_STAKE_LABELS[id] })),
      },
      {
        id: 'limits', label: 'Hard limits', mode: 'multi', required: true, exclusive: ['none'],
        options: (Object.keys(LIMIT_LABELS) as Array<keyof typeof LIMIT_LABELS>).map(id => ({ id, label: LIMIT_LABELS[id] })),
      },
      {
        id: 'hours', label: 'Hours a week I have for this now', mode: 'single', required: true,
        options: HOURS_BANDS.map(b => ({ id: b.id, label: b.label })),
      },
    ],
  };
}

function fixedChoices(next: Next, profile: PathProfile): ChatChoiceSet | null {
  if (next.kind === 'open_read') return openingReadChoices(profile);
  if ((next.kind === 'item' || next.kind === 'follow_up') && next.item === 'risk_time') return riskTimeChoices();
  return null;
}

export function normalizeChoices(raw: unknown): ChatChoiceSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { mode?: unknown; max?: unknown; options?: unknown };
  if (!Array.isArray(r.options)) return null;
  const labels: string[] = [];
  for (const o of r.options) {
    const label = typeof (o as { label?: unknown })?.label === 'string' ? fixDashes((o as { label: string }).label.trim()) : '';
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length < 2) return null;
  const options = labels.slice(0, 8).map((label, i) => ({ id: `c${i + 1}`, label }));
  const mode = r.mode === 'multi' ? 'multi' : 'single';
  const max = mode === 'multi' && typeof r.max === 'number' && r.max >= 1
    ? Math.min(Math.floor(r.max), options.length)
    : mode === 'multi' ? options.length : 1;
  return { mode, max, options, note: OPTIONAL_NOTE };
}

// ── The summary card ────────────────────────────────────────────────────────

const CARD_PARTS = [
  { id: 'read', label: 'How Zyrro sees you' },
  { id: 'wants', label: 'What you want' },
  { id: 'must_haves', label: 'Must-haves' },
  { id: 'must_avoids', label: 'Must-avoids' },
  { id: 'risk', label: 'Risk and limits' },
];

function cardRisk(profile: PathProfile): SummaryCard['risk'] {
  const v = profile.risk_time.value;
  const notKnown = 'Not known yet';
  const band = HOURS_BANDS.find(b => b.id === v?.hours_band);
  const limits = v?.no_limits ? LIMIT_LABELS.none : v?.limits.length ? v.limits.map(l => LIMIT_LABELS[l]).join(', ') : notKnown;
  return {
    readiness: v?.readiness ? READINESS_LABELS[v.readiness] : notKnown,
    at_stake: v?.at_stake_unsure ? AT_STAKE_LABELS.unsure : v?.at_stake.length ? v.at_stake.map(s => AT_STAKE_LABELS[s]).join(', ') : notKnown,
    limits: v?.limits_detail ? `${limits}. ${fixDashes(v.limits_detail)}` : limits,
    hours: band ? `${band.label} a week, available now` : notKnown,
    qualifier: v?.qualifier ? fixDashes(v.qualifier) : null,
  };
}

function buildCard(round: number, prose: { seen_as: string; wants: string }, profile: PathProfile): SummaryCard {
  const toItems = (items: EvidencedItem[] = []) => items.map(i => ({ id: i.id, text: fixDashes(i.text), inferred: i.basis === 'inferred' }));
  return {
    round,
    seen_as: prose.seen_as,
    wants: prose.wants,
    must_haves: toItems(profile.must_haves_avoids.value?.must_haves),
    must_avoids: toItems(profile.must_haves_avoids.value?.must_avoids),
    risk: cardRisk(profile),
  };
}

function cardChoices(card: SummaryCard): ChatChoiceSet {
  const removable = [...card.must_haves, ...card.must_avoids];
  const groups: ChoiceGroup[] = [
    {
      id: 'verdict', label: 'This summary', mode: 'single', required: true,
      options: [
        { id: 'right', label: 'That’s right' },
        { id: 'mostly', label: 'Mostly, with changes' },
        { id: 'not_it', label: 'That’s not it' },
      ],
    },
    { id: 'part', label: 'What’s off', mode: 'multi', required: false, options: CARD_PARTS },
  ];
  if (removable.length) {
    groups.push({ id: 'remove', label: 'Remove', mode: 'multi', required: false, options: removable.map(i => ({ id: i.id, label: i.text })) });
  }
  return {
    mode: 'groups',
    purpose: 'summary',
    groups,
    card,
    note: { placeholder: 'What should change?', required_when: { ids: ['verdict:mostly', 'verdict:not_it'], unless_group: 'part' } },
  };
}

/** The card as plain markdown: the message's content, for read-back anywhere. */
function cardMarkdown(card: SummaryCard): string {
  const list = (items: SummaryCard['must_haves']) =>
    items.length ? items.map(i => `- ${i.text}${i.inferred ? ' (Zyrro’s reading)' : ''}`).join('\n') : '- None recorded';
  return [
    '**How Zyrro sees you**', card.seen_as,
    '**What you want**', card.wants,
    '**Must-haves**', list(card.must_haves),
    '**Must-avoids**', list(card.must_avoids),
    '**Risk, limits and time**',
    [
      `- Ready to: ${card.risk.readiness}`,
      `- Would put at risk: ${card.risk.at_stake}`,
      `- Hard limits: ${card.risk.limits}`,
      `- Time: ${card.risk.hours}`,
      ...(card.risk.qualifier ? [`- ${card.risk.qualifier}`] : []),
    ].join('\n'),
  ].join('\n\n');
}

const HOLDING_TEXT = 'Your summary is confirmed. Your three path options come next.';

// ── Shared pieces of a turn ────────────────────────────────────────────────

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

const pickedIn = (ids: string[], group: string) =>
  ids.filter(id => id.startsWith(`${group}:`)).map(id => id.slice(group.length + 1));

// Profile items only, for progress (meta changes every turn).
function itemsSnapshot(p: PathProfile): string {
  return JSON.stringify(ITEM_KEYS.map(k => p[k]));
}

function withLatestRef<T>(value: T, userMessageId: string | null): T {
  if (!userMessageId) return value;
  return JSON.parse(JSON.stringify(value).split(`"${LATEST_REF}"`).join(`"m:${userMessageId}"`)) as T;
}

type TurnState = {
  digest: ContextDigest;
  all: StoredMessage[];
  own: OwnMessage[];
  index: RefIndex;
  ownIndex: RefIndex;
  profile: PathProfile;
  summary: UserSummary;
  reflections: Reflection[];
};

type CallAInput = {
  mode: 'conversation' | 'summary_correction';
  latest: { content: string; own: string; tapped?: { offered: ChatChoiceSet; picked: string[] } };
  asked: Asked | null;
  answered: AskedItem[];
  correction?: { card: SummaryCard; parts: string[]; note: string | null };
};

/**
 * Call A, and everything code does with its output: profile updates (code
 * decides statuses), must-haves and must-avoids (each quote checked), the
 * reflection result, the summary (validated) and this turn's insights.
 */
async function runUpdate(s: TurnState, input: CallAInput, conversationId: string) {
  const pending = s.reflections.find(r => r.status === 'offered');
  const update = await chatJson([
    { role: 'system', content: PATH_UPDATE_PROMPT },
    { role: 'system', content: `USER CONTEXT\n${JSON.stringify(s.digest)}` },
    {
      role: 'user',
      content: JSON.stringify({
        mode: input.mode,
        valid_refs: [...s.index.keys()],
        profile: { ...s.profile, meta: undefined },
        summary: s.summary,
        recent_messages: s.all.slice(-UPDATE_RECENT_MESSAGES).map(messageForModel),
        latest_message: {
          ref: LATEST_REF,
          ...(input.latest.tapped
            ? { tapped: { offered: { ...input.latest.tapped.offered, card: undefined }, picked: input.latest.tapped.picked }, note: input.latest.own || null }
            : { text: input.latest.content }),
        },
        asked: input.asked,
        pending_reflection: pending ? { theme: pending.theme, text: pending.text } : null,
        removed_items: s.profile.meta.removed_items,
        ...(input.correction && { card: input.correction.card, parts_marked_off: input.correction.parts, correction_note: input.correction.note }),
      }),
    },
  ], 0.2, input.mode === 'conversation' ? 'path update' : 'path card correction', undefined, conversationId);
  if (!update.parsed) return { ok: false as const, tokens: update.tokens };
  const out = update.parsed;

  let profile = applyProfileUpdates(s.profile, out.profile_updates, input.answered).profile;

  const removed = profile.meta.removed_items;
  const haves = validateEvidenced(out.must_haves, s.ownIndex, 'h', removed);
  const avoids = validateEvidenced(out.must_avoids, s.ownIndex, 'a', removed);
  const dropped = [...haves.dropped, ...avoids.dropped];
  if (dropped.length) console.warn(`[path update] must items dropped: ${dropped.join('; ')}`);
  // A missing, empty or wholly invalid list keeps what was there: removals are
  // the user's, on the card, never the model's by omission.
  for (const key of ['must_haves', 'must_avoids'] as const) {
    if (!Array.isArray(out[key]) || !(out[key] as unknown[]).length) console.warn(`[path update] ${key}: ${Array.isArray(out[key]) ? 'empty list' : 'missing'}; keeping the current items`);
  }
  const current = profile.must_haves_avoids.value;
  profile = {
    ...profile,
    must_haves_avoids: {
      ...profile.must_haves_avoids,
      status: 'inferred',
      source: 'conversation',
      value: {
        must_haves: haves.items.length ? haves.items : current?.must_haves ?? [],
        must_avoids: avoids.items.length ? avoids.items : current?.must_avoids ?? [],
      },
    },
  };

  let reflections = s.reflections;
  if (pending) {
    const r = out.reflection_result && typeof out.reflection_result === 'object' ? (out.reflection_result as Record<string, unknown>) : null;
    const status = (['confirmed', 'corrected', 'rejected', 'no_reaction'] as const).find(x => x === r?.status) ?? 'no_reaction';
    reflections = reflections.map(x => (x === pending ? { ...x, status } : x));
  }

  const confirmedThemes = reflections.filter(r => r.status === 'confirmed' || r.status === 'corrected').map(r => r.theme);
  const validated = validateSummary(out.summary, { index: s.index, confirmedThemes, previous: s.summary });
  const summary = syncMustItems(validated?.summary ?? s.summary, profile);

  let contradiction: { item: AskedItem; text: string; refs: string[] } | null = null;
  const c = out.contradiction && typeof out.contradiction === 'object' ? (out.contradiction as Record<string, unknown>) : null;
  const cItem = ASKED_ITEMS.find(i => i === c?.item);
  const cText = typeof c?.text === 'string' ? c.text.trim() : '';
  const cRefs = Array.isArray(c?.refs) ? c.refs.filter((r): r is string => typeof r === 'string' && s.index.has(r)) : [];
  if (cItem && cText && cText.length <= SUMMARY_CAPS.entry_chars && cRefs.length >= 2) contradiction = { item: cItem, text: cText, refs: cRefs };

  return {
    ok: true as const,
    tokens: update.tokens,
    profile,
    summary,
    reflections,
    insights: validInsights(out.turn_insights, s.index),
    contradiction,
    needsClarification: out.needs_clarification === true,
  };
}

type ReplyNext = Next | { kind: 'card_clarify'; parts: string[]; note: string | null };

/**
 * Call B. Retries once if the output names a signature or the named identity
 * (brief: no signature names); a second miss is logged and kept.
 */
async function runReply(
  s: TurnState,
  next: ReplyNext,
  fixed: ChatChoiceSet | null,
  insights: Insight[],
  latestText: string | null,
  conversationId: string,
) {
  const reflection = next.kind === 'item' ? next.reflection : undefined;
  const evidence = resolveExcerpts([
    ...summaryRefs(s.summary),
    ...insights.flatMap(i => i.refs),
    ...(reflection?.refs ?? []),
    ...(next.kind === 'clarify' ? next.contradiction.refs : []),
  ], s.index);
  const alreadyStated = [
    ...s.profile.meta.stated_themes,
    ...(s.profile.opening_read.value?.text ? [`Opening read: ${s.profile.opening_read.value.text}`] : []),
    ...s.reflections.map(r => `Reflection: ${r.text}`),
  ];
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PATH_REPLY_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        first_name: s.digest.report.prepared_for.split(/\s+/)[0] ?? '',
        next,
        fixed_choices: fixed ? { ...fixed, card: undefined } : null,
        summary: s.summary,
        turn_insights: insights,
        evidence,
        already_stated: alreadyStated,
        ...(next.kind === 'card' && { risk_and_time: cardRisk(s.profile) }),
        recent_messages: s.all.slice(-REPLY_RECENT_MESSAGES).map(({ role, content }) => ({ role, content })),
        latest_message: latestText !== null ? { ref: LATEST_REF, content: latestText } : null,
      }),
    },
  ];

  let tokens = 0;
  let parsed: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await chatJson(messages, REPLY_TEMPERATURE, next.kind === 'card' ? 'path card' : 'path reply', PATH_REPLY_MODEL, conversationId);
    tokens += reply.tokens;
    parsed = reply.parsed;
    const text = [parsed?.reply, parsed?.seen_as, parsed?.wants].filter(t => typeof t === 'string').join(' ');
    const hit = text ? mentionsSignature(text, s.digest) : null;
    if (!hit) break;
    console.warn(`[path reply] named "${hit}" (attempt ${attempt + 1})${attempt === 1 ? '; kept' : '; retrying'}`);
  }

  const known = new Map([...s.summary.tensions, ...s.summary.connections].map(n => [n.theme.toLowerCase(), n.theme]));
  const themesUsed = (Array.isArray(parsed?.themes_used) ? parsed.themes_used : [])
    .map(t => (typeof t === 'string' ? known.get(t.trim().toLowerCase()) : undefined))
    .filter((t): t is string => !!t);
  return { parsed, tokens, themesUsed };
}

function addThemes(profile: PathProfile, themes: string[]): PathProfile {
  const all = [...profile.meta.stated_themes];
  for (const t of themes) if (!all.some(x => x.toLowerCase() === t.toLowerCase())) all.push(t);
  return { ...profile, meta: { ...profile.meta, stated_themes: all.slice(-20) } };
}

// The prompt asks for about 600 and 350 characters; these ceilings are only a
// safety net against a runaway output.
const CARD_SEEN_AS_MAX = 900;
const CARD_WANTS_MAX = 600;

function cardProse(parsed: Record<string, unknown> | null): { seen_as: string; wants: string } | null {
  const seen = typeof parsed?.seen_as === 'string' ? fixDashes(parsed.seen_as.trim()) : '';
  const wants = typeof parsed?.wants === 'string' ? fixDashes(parsed.wants.trim()) : '';
  if (seen && wants && seen.length <= CARD_SEEN_AS_MAX && wants.length <= CARD_WANTS_MAX) return { seen_as: seen, wants };
  console.warn(`[path card] unusable prose: seen_as ${seen.length} chars, wants ${wants.length} chars`);
  return null;
}

async function loadTurnState(ctx: TurnContext, row: PathProfileRow) {
  const digest = row.context_digest!;
  const stored = await loadUserSummary(ctx.supabase, ctx.conversation.user_id);
  const all = await listConversationMessages(ctx.supabase, ctx.conversation.id);
  const own = ownMessages(all);
  const latestOwn = ctx.userMessage
    ? ctx.userMessage.selected_choice_ids ? ctx.userMessage.note ?? '' : ctx.userMessage.content
    : null;
  const withLatest = [...own, ...(latestOwn ? [{ id: 'latest', content: latestOwn }] : [])];
  const state: TurnState = {
    digest,
    all,
    own,
    index: refIndexFor(digest, withLatest),
    ownIndex: ownIndexFor(digest, withLatest),
    profile: row.profile as PathProfile,
    summary: stored && isCurrentSummary(stored.summary) ? stored.summary : emptySummary(),
    reflections: row.reflections ?? [],
  };
  return { state, storedVersion: stored?.version ?? null, latestOwn };
}

async function saveSummary(ctx: TurnContext, summary: UserSummary, storedVersion: number | null) {
  const written = await writeUserSummary(ctx.supabase, ctx.conversation.user_id, summary, storedVersion, 'path_turn', ctx.conversation.id);
  if (!written) console.error(`[user summary] write conflict for user ${ctx.conversation.user_id}; kept the newer version`);
}

// ── The conversation turn ──────────────────────────────────────────────────

async function runConversationTurn(ctx: TurnContext, row: PathProfileRow): Promise<TurnRun> {
  const { supabase, conversation, userMessage } = ctx;
  const { state: s, storedVersion, latestOwn } = await loadTurnState(ctx, row);
  let tokens = 0;
  let insights: Insight[] = [];
  const turns = row.turns + (userMessage ? 1 : 0);

  try {
    if (userMessage) {
      const asked = s.profile.meta.last_asked;
      const answeredMsg = [...s.all].reverse().find(m => m.role === 'assistant');
      const answeredChoices = answeredMsg?.choices as ChatChoiceSet | null | undefined;
      const ids = userMessage.selected_choice_ids;
      const note = userMessage.note ?? null;

      // Taps on code-owned choices, applied exactly, before call A.
      if (ids && answeredChoices?.purpose === 'opening_read') s.profile = applyOpeningReadTap(s.profile, ids, note);
      if (ids && answeredChoices?.purpose === 'risk_time') s.profile = applyRiskTimeTap(s.profile, ids);
      if (!ids && asked?.kind === 'follow_up' && asked.item === 'opening_read') s.profile = applyOpeningReadFollowUp(s.profile, userMessage.content);

      const answered: AskedItem[] = !asked || asked.kind === 'card' || asked.kind === 'card_clarify' ? []
        : asked.kind === 'open_read' ? ['opening_read', 'pushing_now']
          : [asked.item];

      const a = await runUpdate(s, {
        mode: 'conversation',
        latest: { content: userMessage.content, own: latestOwn ?? '', ...(ids && answeredChoices && { tapped: { offered: answeredChoices, picked: ids } }) },
        asked,
        answered,
      }, conversation.id);
      tokens += a.tokens;
      if (!a.ok) return { ok: false, status: 502, error: 'no_usable_update', tokens };
      s.profile = a.profile;
      s.summary = a.summary;
      s.reflections = a.reflections;
      insights = a.insights;

      // A clarification has been answered; the next contradiction can be raised.
      if (asked?.kind === 'clarify') s.profile = { ...s.profile, meta: { ...s.profile.meta, pending_clarify: null } };
      // The one follow-up per item, or not known after it (design doc, "When Zyrro has enough").
      const settleItem = asked?.kind === 'open_read' ? 'opening_read' : asked?.kind === 'item' || asked?.kind === 'follow_up' ? asked.item : null;
      if (settleItem) s.profile = settleAnswered(s.profile, settleItem);
      // A contradiction about a settled item earns one clarifying question, as that item's follow-up.
      const c = a.contradiction;
      if (c && !s.profile.meta.pending_clarify && isItemComplete(s.profile, c.item) && s.profile[c.item].follow_ups === 0) {
        s.profile = {
          ...s.profile,
          [c.item]: { ...s.profile[c.item], follow_ups: 1 },
          meta: { ...s.profile.meta, pending_clarify: c },
        };
      }
    }

    const progress = itemsSnapshot(s.profile) !== itemsSnapshot(row.profile as PathProfile);
    const turnsSinceProgress = userMessage ? (progress ? 0 : row.turns_since_progress + 1) : row.turns_since_progress;
    const next = computeNext(s.profile, s.summary, s.reflections, { opening: !userMessage, turns, turnsSinceProgress });

    let assistant: { content: string; choices: ChatChoiceSet | null };
    let cardState: CardState | null = null;
    if (next.kind === 'card') {
      const b = await runReply(s, next, null, insights, latestOwn, conversation.id);
      tokens += b.tokens;
      const prose = cardProse(b.parsed);
      if (!prose) return { ok: false, status: 502, error: 'no_usable_card', tokens };
      s.profile = addThemes(s.profile, b.themesUsed);
      const card = buildCard(1, prose, s.profile);
      cardState = { round: 1, card, correction: null, clarify_pending: false, confirmed: false };
      assistant = { content: cardMarkdown(card), choices: cardChoices(card) };
    } else {
      const fixed = fixedChoices(next, s.profile);
      const b = await runReply(s, next, fixed, insights, latestOwn, conversation.id);
      tokens += b.tokens;
      const text = typeof b.parsed?.reply === 'string' ? fixDashes(b.parsed.reply.trim()) : '';
      if (!text) return { ok: false, status: 502, error: 'no_usable_reply', tokens };
      s.profile = addThemes(s.profile, [...b.themesUsed, ...(next.kind === 'item' && next.reflection ? [next.reflection.theme] : [])]);
      if (next.kind === 'open_read') {
        s.profile = { ...s.profile, opening_read: { ...s.profile.opening_read, value: { text, verdict: null, correction: null } } };
      }
      if (next.kind === 'item' && next.reflection) {
        s.reflections = [...s.reflections, { id: 'r1', status: 'offered', message_id: null, theme: next.reflection.theme, text: next.reflection.text }];
      }
      // The model may offer its own choices on an item question, never on the
      // opening read's follow-up (what's off is only the user's to say).
      const modelChoicesAllowed = (next.kind === 'item' || next.kind === 'follow_up') && next.item !== 'opening_read';
      assistant = { content: text, choices: fixed ?? (modelChoicesAllowed ? normalizeChoices(b.parsed?.choices) : null) };
    }
    s.profile = { ...s.profile, meta: { ...s.profile.meta, last_asked: asAsked(next) } };

    return {
      ok: true,
      assistant,
      tokens,
      commit: async saved => {
        const userId = userMessage ? saved[0]?.id ?? null : null;
        const assistantId = saved[saved.length - 1]?.id ?? null;
        const profile = withLatestRef(s.profile, userId);
        const reflections = s.reflections.map(r => (r.status === 'offered' && !r.message_id ? { ...r, message_id: assistantId } : r));

        const { error } = await supabase
          .from('path_profiles')
          .update({
            profile,
            reflections,
            turns,
            turns_since_progress: turnsSinceProgress,
            ...(cardState && { phase: 'summary', summary: cardState }),
          })
          .eq('conversation_id', conversation.id);
        if (error) console.error('Path profile update failed:', error);
        await saveSummary(ctx, withLatestRef(s.summary, userId), storedVersion);
      },
    };
  } catch (error) {
    if (isRateLimitError(error)) return { ok: false, status: 503, error: 'busy', tokens };
    throw error;
  }
}

// ── The summary phase: confirm, correct, clarify ──────────────────────────

async function runSummaryTurn(ctx: TurnContext, row: PathProfileRow): Promise<TurnRun> {
  const { supabase, conversation, userMessage } = ctx;
  const cardState = row.summary;
  if (!userMessage || !cardState || cardState.confirmed) return { ok: false, status: 409, error: 'not_in_conversation', tokens: 0 };
  const { state: s, storedVersion, latestOwn } = await loadTurnState(ctx, row);
  const answeredMsg = [...s.all].reverse().find(m => m.role === 'assistant');
  const answeredChoices = answeredMsg?.choices as ChatChoiceSet | null | undefined;
  const ids = userMessage.selected_choice_ids ?? [];
  const note = userMessage.note ?? null;
  let tokens = 0;

  // Removals on the card are applied by code, exactly, and never proposed again.
  let profile = s.profile;
  let card = cardState.card;
  const removeIds = answeredChoices?.purpose === 'summary' ? pickedIn(ids, 'remove') : [];
  if (removeIds.length) {
    const v = profile.must_haves_avoids.value ?? { must_haves: [], must_avoids: [] };
    const removedTexts = [...v.must_haves, ...v.must_avoids].filter(i => removeIds.includes(i.id)).map(i => i.text);
    profile = {
      ...profile,
      must_haves_avoids: {
        ...profile.must_haves_avoids,
        value: { must_haves: v.must_haves.filter(i => !removeIds.includes(i.id)), must_avoids: v.must_avoids.filter(i => !removeIds.includes(i.id)) },
      },
      meta: { ...profile.meta, removed_items: [...profile.meta.removed_items, ...removedTexts] },
    };
    card = { ...card, must_haves: card.must_haves.filter(i => !removeIds.includes(i.id)), must_avoids: card.must_avoids.filter(i => !removeIds.includes(i.id)) };
  }
  s.profile = profile;
  s.summary = syncMustItems(s.summary, profile);

  const commitWith = (next: CardState, extra: Record<string, unknown> = {}) => async (saved: StoredMessage[]) => {
    const userId = saved[0]?.id ?? null;
    const { error } = await supabase
      .from('path_profiles')
      .update({ profile: withLatestRef(s.profile, userId), reflections: s.reflections, summary: next, turns: row.turns + 1, ...extra })
      .eq('conversation_id', conversation.id);
    if (error) console.error('Path profile update failed:', error);
    await saveSummary(ctx, withLatestRef(s.summary, userId), storedVersion);
  };

  try {
    if (answeredChoices?.purpose === 'summary') {
      const verdict = pickedIn(ids, 'verdict')[0];
      if (verdict === 'right') {
        // Confirmed: no model call. The options come next (not built in this brief).
        const confirmed: CardState = { ...cardState, card, correction: null, clarify_pending: false, confirmed: true };
        return {
          ok: true,
          assistant: { content: HOLDING_TEXT, choices: null },
          tokens: 0,
          commit: commitWith(confirmed, { summary_confirmed_at: new Date().toISOString() }),
        };
      }
      if (verdict !== 'mostly' && verdict !== 'not_it') return { ok: false, status: 400, error: 'invalid_choice', tokens: 0 };
      const correction = { verdict, parts: pickedIn(ids, 'part'), note } as const;

      // Parts marked off but no note: nothing to apply yet, so the one
      // clarifying question comes first, decided by code (in a live run the
      // model applied a part-only correction and returned an unchanged card).
      if (!note) return await clarify(correction);

      const a = await runUpdate(s, {
        mode: 'summary_correction',
        latest: { content: userMessage.content, own: latestOwn ?? '', tapped: { offered: answeredChoices, picked: ids } },
        asked: { kind: 'card' },
        answered: [...MODEL_ITEMS],
        correction: { card, parts: correction.parts, note },
      }, conversation.id);
      tokens += a.tokens;
      if (!a.ok) return { ok: false, status: 502, error: 'no_usable_update', tokens };
      s.profile = a.profile;
      s.summary = a.summary;

      // One clarifying question per correction, only when Zyrro can't tell what to change.
      if (a.needsClarification) return await clarify(correction);
      return await newCard(cardState.round + 1);
    }

    if (answeredChoices?.purpose === 'summary_clarify' && cardState.clarify_pending) {
      const prior = cardState.correction;
      const a = await runUpdate(s, {
        mode: 'summary_correction',
        latest: { content: userMessage.content, own: latestOwn ?? '' },
        asked: { kind: 'card_clarify' },
        answered: [...MODEL_ITEMS],
        correction: { card, parts: prior?.parts ?? [], note: [prior?.note, note].filter(Boolean).join('\n\n') || null },
      }, conversation.id);
      tokens += a.tokens;
      if (!a.ok) return { ok: false, status: 502, error: 'no_usable_update', tokens };
      s.profile = a.profile;
      s.summary = a.summary;
      return await newCard(cardState.round + 1);
    }

    return { ok: false, status: 409, error: 'stale_choice', tokens };
  } catch (error) {
    if (isRateLimitError(error)) return { ok: false, status: 503, error: 'busy', tokens };
    throw error;
  }

  async function clarify(correction: { verdict: 'mostly' | 'not_it'; parts: string[]; note: string | null }): Promise<TurnRun> {
    const b = await runReply(s, { kind: 'card_clarify', parts: correction.parts, note: correction.note }, null, [], latestOwn, conversation.id);
    tokens += b.tokens;
    const text = typeof b.parsed?.reply === 'string' ? fixDashes(b.parsed.reply.trim()) : '';
    if (!text) return { ok: false, status: 502, error: 'no_usable_reply', tokens };
    s.profile = { ...s.profile, meta: { ...s.profile.meta, last_asked: { kind: 'card_clarify' } } };
    return {
      ok: true,
      assistant: { content: text, choices: { mode: 'note', purpose: 'summary_clarify', note: { required: true, placeholder: 'Your answer' } } },
      tokens,
      commit: commitWith({ ...cardState!, card, correction, clarify_pending: true }),
    };
  }

  async function newCard(round: number): Promise<TurnRun> {
    const b = await runReply(s, { kind: 'card' }, null, [], latestOwn, conversation.id);
    tokens += b.tokens;
    const prose = cardProse(b.parsed);
    if (!prose) return { ok: false, status: 502, error: 'no_usable_card', tokens };
    s.profile = { ...addThemes(s.profile, b.themesUsed), meta: { ...s.profile.meta, last_asked: { kind: 'card' } } };
    const fresh = buildCard(round, prose, s.profile);
    return {
      ok: true,
      assistant: { content: cardMarkdown(fresh), choices: cardChoices(fresh) },
      tokens,
      commit: commitWith({ round, card: fresh, correction: null, clarify_pending: false, confirmed: false }),
    };
  }
}

async function runPathTurn(ctx: TurnContext): Promise<TurnRun> {
  const row = await getProfileRow(ctx.supabase, ctx.conversation.id);
  if (!row || !isPathProfile(row.profile) || !row.context_digest) throw new Error('Path profile not seeded');
  if (row.phase === 'conversation') return runConversationTurn(ctx, row);
  if (row.phase === 'summary') return runSummaryTurn(ctx, row);
  return { ok: false, status: 409, error: 'not_in_conversation', tokens: 0 };
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

export function pathState(row: PathProfileRow | null): { phase: PathPhase; summary_confirmed: boolean } {
  return { phase: row?.phase ?? 'seeding', summary_confirmed: !!row?.summary_confirmed_at };
}
