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
  applyDirectionTap,
  applyOpeningReadFollowUp,
  applyOpeningReadTap,
  applyProfileUpdates,
  applyRiskTimeTap,
  ASKED_ITEMS,
  AT_STAKE_CARD_LABELS,
  AT_STAKE_LABELS,
  DIRECTION_CARD_LABELS,
  DIRECTION_LABELS,
  DIRECTION_NOTE_PLACEHOLDER,
  DIRECTION_QUESTION,
  emptyProfile,
  emptyRiskTime,
  HOURS_BANDS,
  isItemComplete,
  isPathProfile,
  ITEM_KEYS,
  keepDirectionKind,
  LIMIT_CARD_LABELS,
  LIMIT_LABELS,
  MODEL_ITEMS,
  NOT_YET_LINE,
  openingNoteIsContext,
  openItems,
  READINESS_CARD_LABELS,
  READINESS_LABELS,
  seedProfile,
  settleAnswered,
  stillNeeded,
  withMetaDefaults,
  type Asked,
  type AskedItem,
  type EvidenceCheck,
  type EvidencedItem,
  type PathProfile,
} from '@/lib/path-profile';
import {
  cleanConfirmedRead,
  confirmedReadProblem,
  DIRECTION_LINE_MAX_CHARS,
  DIRECTION_LINE_MAX_SENTENCES,
  directionLineProblem,
  fallbackDirectionLine,
  hasFirstPerson,
  mechanicalSecondPerson,
  personCutFrom,
  swapToSecondPerson,
  thirdPersonWord,
} from '@/lib/path-text-checks';
import { PATH_CORRECTION_ITEMS_PROMPT } from '@/lib/prompts/path-correction-items';
import { PATH_ITEM_VOICE_PROMPT } from '@/lib/prompts/path-item-voice';
import { PATH_PROFILE_SEED_PROMPT } from '@/lib/prompts/path-profile-seed';
import { PATH_REPLY_PROMPT } from '@/lib/prompts/path-reply';
import { PATH_UPDATE_PROMPT } from '@/lib/prompts/path-update';
import {
  buildRefIndex,
  emptySummary,
  isCurrentSummary,
  loadUserSummary,
  mergeSummaryChanges,
  quoteFound,
  resolveExcerpts,
  sourceRefs,
  summaryRefs,
  syncFromProfile,
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
// turn the profile completes, returning the summary card. Confirming the card
// moves the phase to options; the options, choice and naming live in
// lib/path-options.ts (brief 168-options).

export const PATH_ENTITLEMENT = 'onetime_payment' as const;

// Recent messages each call sees; everything older lives on in the profile and
// summary. Call A went from 8 to 4 for speed (follow-up brief).
const UPDATE_RECENT_MESSAGES = 4;
// Report excerpts call A sees: enough to link to, not the whole digest.
const UPDATE_REPORT_EXCERPT_CHARS = 400;
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

// The one interpretive reflection (design doc, "One interpretive reflection at
// most"). refs: the summary note's sources; a note sharing one of them counts
// as confirmed once the user confirms the reflection.
export type Reflection = {
  id: 'r1';
  status: 'offered' | 'confirmed' | 'corrected' | 'rejected' | 'no_reaction';
  message_id: string | null;
  text: string;
  refs: string[];
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
export function reportFields(digest: ContextDigest): Record<string, string> {
  const r = digest.report;
  // The friction points and the named identity are where the report names the
  // user's tension (brief 168-conversation-purpose), so they are citable too.
  const fields: Record<string, string> = {
    identity_thesis: r.identity_thesis,
    synthesis: r.synthesis,
    ...(r.named_identity && { named_identity: r.named_identity }),
    ...(r.friction_points?.length && { friction_points: r.friction_points.join('; ') }),
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

export type OwnMessage = { id: string; content: string };

/**
 * The user's own words in each of their messages: the typed text, or for a
 * tap only the note (the tapped labels are Zyrro's words, not theirs).
 */
export function ownMessages(all: StoredMessage[]): OwnMessage[] {
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
export function ownIndexFor(digest: ContextDigest, messages: OwnMessage[]): RefIndex {
  return buildRefIndex({ answers: digest.answers, reportFields: {}, userMessages: messages });
}

/** Everything the user has typed in this conversation (their messages and notes). */
function userTextOf(ownIndex: RefIndex): string {
  return [...ownIndex].filter(([ref]) => ref.startsWith('m:')).map(([, text]) => text).join('\n');
}

/**
 * The checks on what the model records as the user's words: a quote must be
 * found in the questionnaire answer or user message it cites, and a phrase in
 * their own words must be mostly what they typed.
 */
function evidenceCheck(ownIndex: RefIndex): EvidenceCheck {
  return {
    quote: (ref, quote) => {
      if (!/^Q\d+$/.test(ref) && !ref.startsWith('m:')) return false;
      const source = ownIndex.get(ref);
      return !!source && quoteFound(quote, source);
    },
    userText: userTextOf(ownIndex),
  };
}

export function firstNameOf(digest: ContextDigest): string {
  return digest.report.prepared_for.split(/\s+/)[0] ?? '';
}

type MustLists = { must_haves: EvidencedItem[]; must_avoids: EvidencedItem[] };

// A pronoun cut out of an item leaves out a word or two; more than this is a
// different stretch of the source, not a cut.
const MAX_CUT_WORDS = 3;

/**
 * Inferred must-haves and must-avoids speak in the second person or without
 * pronouns, never in the third person (brief 168-card-fixes, fix 3). Code
 * finds the items that don't; those get one small rewrite call (only when
 * there are any); an item that still fails has its pronouns swapped by code.
 * Stated items never come here (brief 168-card-items, fix 1): their text is
 * the user's quote with only the first person swapped, and the third-person
 * check and swap would turn other people's "they" into "you".
 */
async function inSecondPerson(
  input: MustLists,
  firstName: string,
  sourceOf: (ref: string) => string | undefined,
  conversationId?: string,
): Promise<{ lists: MustLists; tokens: number }> {
  // Step 3: an item that dodged its quote's pronoun by cutting it out is
  // broken ("…but personally unmoved"); code rebuilds it from the quote with
  // only the pronouns turned to "you". The quote can be shorter than the item
  // (brief 168-options item 5: a quote starting at "commercially sensible"
  // hid the cut), so the item is also checked against its whole source; there
  // a cut counts only when the words left out are a few, not a stretch of
  // other sentences.
  const cutIn = (i: EvidencedItem): string | null => {
    const inQuote = personCutFrom(i.text, i.quote);
    if (inQuote) return inQuote;
    const source = sourceOf(i.ref);
    const inSource = source ? personCutFrom(i.text, source) : null;
    if (!inSource) return null;
    const extra = inSource.split(/\s+/).length - i.text.split(/\s+/).length;
    return extra <= MAX_CUT_WORDS ? inSource : null;
  };
  const uncut = (items: EvidencedItem[]) => items.map(i => {
    if (i.basis === 'stated') return i;
    const stretch = cutIn(i);
    if (!stretch) return i;
    // The stretch is the user's own words: only their first person is swapped.
    const text = swapToSecondPerson(stretch, false);
    console.warn(`[path items] ${i.id} cut the person out of its quote: "${i.text}"; rebuilt from the quote: "${text}"`);
    return { ...i, text };
  });
  const lists = { must_haves: uncut(input.must_haves), must_avoids: uncut(input.must_avoids) };
  const all = [...lists.must_haves, ...lists.must_avoids];
  // First person counts too: an item copied close to the user's quote came
  // through as "…leave me unmoved" in a live run.
  const wrongVoice = (t: string) => thirdPersonWord(t, firstName) ?? (hasFirstPerson(t) ? 'first person' : null);
  const flagged = all.filter(i => i.basis === 'inferred' && wrongVoice(i.text));
  if (!flagged.length) return { lists, tokens: 0 };
  console.warn(`[path items] not second person: ${flagged.map(i => `${i.id} (${wrongVoice(i.text)}) "${i.text}"`).join('; ')}`);
  const { parsed, tokens } = await chatJson([
    { role: 'system', content: PATH_ITEM_VOICE_PROMPT },
    { role: 'user', content: JSON.stringify({ items: flagged.map(({ id, text }) => ({ id, text })) }) },
  ], 0.2, 'path item voice', undefined, conversationId);
  const rewritten = new Map<string, string>();
  for (const r of Array.isArray(parsed?.items) ? parsed.items : []) {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (typeof o?.id === 'string' && typeof o.text === 'string' && o.text.trim()) rewritten.set(o.id, o.text.trim());
  }
  const fix = (items: EvidencedItem[]) => items.map(i => {
    if (!flagged.includes(i)) return i;
    const r = rewritten.get(i.id);
    // A rewrite that cut the person out instead of turning it into "you" is broken too.
    if (r && r.length <= SUMMARY_CAPS.entry_chars && !wrongVoice(r) && !personCutFrom(r, i.text)) return { ...i, text: r };
    const swapped = swapToSecondPerson(mechanicalSecondPerson(i.text), false);
    console.warn(`[path items] rewrite unusable for ${i.id} (${JSON.stringify(r ?? null)}); pronouns swapped by code: "${swapped}"`);
    return { ...i, text: swapped };
  });
  return { lists: { must_haves: fix(lists.must_haves), must_avoids: fix(lists.must_avoids) }, tokens };
}

// temperature undefined: the model's default (the newer models only accept that).
// Logs one usage line per call (tokens, cache hits, reasoning, latency).
export async function chatJson(
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

export function mentionsSignature(text: string, digest: ContextDigest): string | null {
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
      const profile = seedProfile(parsed.profile, evidenceCheck(ownIndex));
      const haves = validateEvidenced(parsed.must_haves, ownIndex, 'h', []);
      const avoids = validateEvidenced(parsed.must_avoids, ownIndex, 'a', []);
      const dropped = [...haves.dropped, ...avoids.dropped];
      if (dropped.length) console.warn(`[path seed] must items dropped: ${dropped.join('; ')}`);
      const voiced = await inSecondPerson({ must_haves: haves.items, must_avoids: avoids.items }, firstNameOf(digest), ref => ownIndex.get(ref), conversationId);
      tokens += voiced.tokens;
      profile.must_haves_avoids = {
        ...profile.must_haves_avoids,
        status: 'inferred',
        value: voiced.lists,
        source: 'questionnaire',
      };
      const validated = validateSummary(parsed.summary, { index, confirmedRefs: [], previous: null });
      // Nothing is confirmed before the user has spoken; what they've tried
      // comes only from the checked attempts (syncFromProfile).
      const summary = { ...(validated?.summary ?? emptySummary()), confirmed_read: null };
      return { profile, summary: syncFromProfile(summary, profile), tokens, fromModel: true };
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

// deepen: an open question with no taps that takes Zyrro's understanding of
// the user's tension and pattern further (brief 168-conversation-purpose);
// still_unclear is what call A said Zyrro does not yet understand.
type Next =
  | { kind: 'open_read'; deadline: string | null; urgency_unknown: boolean }
  | { kind: 'follow_up'; item: AskedItem; still_needed: string }
  | { kind: 'clarify'; item: AskedItem; contradiction: { text: string; refs: string[] } }
  | { kind: 'item'; item: AskedItem; still_needed: string }
  | { kind: 'deepen'; still_unclear: string | null }
  | { kind: 'card' };

function asAsked(next: Next): Asked {
  switch (next.kind) {
    case 'open_read': return { kind: 'open_read' };
    case 'card': return { kind: 'card' };
    case 'deepen': return { kind: 'deepen' };
    default: return { kind: next.kind, item: next.item };
  }
}

// Deepen turns in a row before the next practical question is asked anyway,
// so the facts the options need are never crowded out.
const MAX_DEEPEN_STREAK = 2;

/**
 * Code decides what comes next (design doc, "How the conversation runs" and
 * "When Zyrro has enough"): the opening view, then a pending clarification,
 * then the card if the conversation has stalled or hit the cap. While call A
 * says the understanding isn't ready, a deepen turn comes first (at most
 * MAX_DEEPEN_STREAK in a row), then the next practical question (its one
 * follow-up if it needs one). With every practical fact in, the card comes
 * once call A says ready; until then, deepen turns, which the stall rule and
 * the cap still end.
 */
function computeNext(
  profile: PathProfile,
  state: { opening: boolean; turns: number; turnsSinceProgress: number },
): Next {
  if (state.opening) {
    const p = profile.pushing_now.value;
    return { kind: 'open_read', deadline: p?.urgency === 'deadline' ? p.deadline ?? 'a decision they are putting off' : null, urgency_unknown: !p?.urgency };
  }
  const clarify = profile.meta.pending_clarify;
  if (clarify) return { kind: 'clarify', item: clarify.item, contradiction: { text: clarify.text, refs: clarify.refs } };
  if (state.turns >= MAX_USER_TURNS || state.turnsSinceProgress >= STALL_TURNS) return { kind: 'card' };

  const understanding = profile.meta.understanding;
  const ready = understanding?.ready === true;
  const deepen: Next = { kind: 'deepen', still_unclear: understanding?.still_unclear ?? null };
  const item = openItems(profile)[0];
  if (!item) return ready ? { kind: 'card' } : deepen;
  if (profile[item].follow_ups >= 1) return { kind: 'follow_up', item, still_needed: stillNeeded(profile, item) };
  if (!ready && (profile.meta.deepen_streak ?? 0) < MAX_DEEPEN_STREAK) return deepen;
  return { kind: 'item', item, still_needed: stillNeeded(profile, item) };
}

// ── Choices code attaches itself ───────────────────────────────────────────
// Each group's label is the question it asks, in words people say (brief
// 168-followup, Part A items 4 and 5; Part B item 6).

const OPTIONAL_NOTE = { placeholder: 'Anything to add? (optional)' };

function openingReadChoices(profile: PathProfile): ChatChoiceSet {
  const groups: ChoiceGroup[] = [{
    id: 'read',
    label: 'Does this sound like you?',
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
      label: 'Is anything forcing a decision?',
      mode: 'single',
      required: true,
      options: [
        { id: 'no_rush', label: 'No rush' },
        { id: 'soon', label: 'Fairly soon' },
        { id: 'deadline', label: 'Yes, there’s a deadline' },
      ],
    });
  }
  // Added context or a correction, whichever it is (brief 168-direction-and-card, Part B item 1).
  return { mode: 'groups', purpose: 'opening_read', groups, note: { placeholder: 'Anything you’d like to add or correct? (Optional)' } };
}

// Brief 168-direction-and-card, Part A item 2: worded so as not to assume they
// have a direction; the optional note lets them say what it is.
function directionChoices(): ChatChoiceSet {
  return {
    mode: 'groups',
    purpose: 'direction',
    note: { placeholder: DIRECTION_NOTE_PLACEHOLDER },
    groups: [{
      id: 'direction', label: DIRECTION_QUESTION, mode: 'single', required: true,
      options: (Object.keys(DIRECTION_LABELS) as Array<keyof typeof DIRECTION_LABELS>).map(id => ({ id, label: DIRECTION_LABELS[id] })),
    }],
  };
}

function riskGroups(): ChoiceGroup[] {
  return [
    {
      id: 'readiness', label: 'What change are you ready to make now?', mode: 'single', required: true,
      options: (Object.keys(READINESS_LABELS) as Array<keyof typeof READINESS_LABELS>).map(id => ({ id, label: READINESS_LABELS[id] })),
    },
    {
      id: 'at_stake', label: 'What would you put at risk?', mode: 'multi', required: true, exclusive: ['unsure'],
      options: (Object.keys(AT_STAKE_LABELS) as Array<keyof typeof AT_STAKE_LABELS>).map(id => ({ id, label: AT_STAKE_LABELS[id] })),
    },
    {
      id: 'limits', label: 'Is anything off the table?', mode: 'multi', required: true, exclusive: ['none'],
      options: (Object.keys(LIMIT_LABELS) as Array<keyof typeof LIMIT_LABELS>).map(id => ({ id, label: LIMIT_LABELS[id] })),
    },
    {
      id: 'hours', label: 'How many hours a week do you have for this now?', mode: 'single', required: true,
      options: HOURS_BANDS.map(b => ({ id: b.id, label: b.label })),
    },
  ];
}

function riskTimeChoices(): ChatChoiceSet {
  return { mode: 'groups', purpose: 'risk_time', note: OPTIONAL_NOTE, groups: riskGroups() };
}

/** The current risk and time answers as tap ids, to pre-fill re-offered groups. */
function riskPreselected(profile: PathProfile): string[] {
  const v = profile.risk_time.value;
  if (!v) return [];
  return [
    ...(v.readiness ? [`readiness:${v.readiness}`] : []),
    ...(v.at_stake_unsure ? ['at_stake:unsure'] : v.at_stake.map(s => `at_stake:${s}`)),
    ...(v.no_limits ? ['limits:none'] : v.limits.map(l => `limits:${l}`)),
    ...(v.hours_band ? [`hours:${v.hours_band}`] : []),
  ];
}

function fixedChoices(next: Next, profile: PathProfile): ChatChoiceSet | null {
  if (next.kind === 'open_read') return openingReadChoices(profile);
  if (next.kind === 'item' && next.item === 'direction') return directionChoices();
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
  { id: 'direction', label: 'Your direction' },
  { id: 'must_haves', label: 'Must-haves' },
  { id: 'must_avoids', label: 'Must-avoids' },
  { id: 'risk', label: 'Risk, limits and time' },
];

/**
 * The card's risk block, built by code from the profile: the tapped values on
 * their lines and one note: the user's own risk text, verbatim with only the
 * first person turned to "you" (brief 168-risk-note; no model writes it).
 * Long dashes are replaced, as on every card item. The deadline is not on the
 * card: its text is the model's and nothing the user writes can correct it
 * (Miroslav, 2026-11-09); options get it from the profile (riskDeadline).
 */
function cardRisk(profile: PathProfile): SummaryCard['risk'] {
  const v = profile.risk_time.value;
  const notKnown = 'Not known yet';
  const band = HOURS_BANDS.find(b => b.id === v?.hours_band);
  return {
    readiness: v?.readiness ? READINESS_CARD_LABELS[v.readiness] : notKnown,
    at_stake: v?.at_stake_unsure ? AT_STAKE_CARD_LABELS.unsure : v?.at_stake.length ? v.at_stake.map(s => AT_STAKE_CARD_LABELS[s]).join(', ') : notKnown,
    limits: v?.no_limits ? LIMIT_CARD_LABELS.none : v?.limits.length ? v.limits.map(l => LIMIT_CARD_LABELS[l]).join(', ') : notKnown,
    hours: band ? `${band.label} a week, available now` : notKnown,
    note: (v?.their_words ?? []).map(w => fixDashes(swapToSecondPerson(w.text))).join(' ') || null,
  };
}

/** The decision with a deadline, from what's pushing them: for options, not shown on the card. */
export function riskDeadline(profile: PathProfile): string | null {
  const p = profile.pushing_now.value;
  return p?.urgency === 'deadline' ? (p.deadline ? fixDashes(p.deadline) : 'A decision with a deadline') : null;
}

const RISK_KEYS = ['readiness', 'at_stake', 'limits', 'hours'] as const;

/** Whether re-tapped answers changed any of the card's tapped risk values. */
function riskValuesChanged(before: SummaryCard['risk'], profile: PathProfile): boolean {
  const now = cardRisk(profile);
  return RISK_KEYS.some(k => before[k] !== now[k]);
}

/** The card's risk block as the correction-items call sees it: the values and the one note. */
function riskBlockFor(risk: SummaryCard['risk']) {
  return { readiness: risk.readiness, at_stake: risk.at_stake, limits: risk.limits, hours: risk.hours, deadline: risk.deadline ?? null, note: risk.note ?? null };
}

// ── The user's risk text (brief 168-risk-note) ─────────────────────────────

/** A risk answer's note added to the user's risk text, verbatim, when there is one. */
function withRiskText(profile: PathProfile, text: string | null): PathProfile {
  const t = text?.trim();
  if (!t) return profile;
  const v = { ...emptyRiskTime(), ...(profile.risk_time.value ?? {}) };
  return { ...profile, risk_time: { ...profile.risk_time, value: { ...v, their_words: [...(v.their_words ?? []), { ref: LATEST_REF, text: t }] } } };
}

/** The user's risk text in their own first person, for the card's editable field. */
function riskTextForEditing(profile: PathProfile): string {
  return (profile.risk_time.value?.their_words ?? []).map(w => w.text).join('\n\n');
}

/**
 * What the user saved in the card's risk field replaces their risk text,
 * with this message as its ref. Saved unchanged, it is left as it was.
 */
function withEditedRiskText(profile: PathProfile, edited: string): PathProfile {
  const t = edited.trim();
  if (t === riskTextForEditing(profile).trim()) return profile;
  const v = { ...emptyRiskTime(), ...(profile.risk_time.value ?? {}) };
  return { ...profile, risk_time: { ...profile.risk_time, value: { ...v, their_words: t ? [{ ref: LATEST_REF, text: t }] : [] } } };
}

/**
 * What the user wrote in answer to the direction question: the note with
 * their tap and the follow-up (and a card correction of the direction), in
 * order. Profiles from before brief 168-card-fixes fall back to the recorded
 * description.
 */
export function directionSources(profile: PathProfile, ownIndex: RefIndex): string[] {
  const v = profile.direction.value;
  if (!v || v.kind === 'no_idea') return [];
  const texts = (v.answer_refs ?? []).map(ref => ownIndex.get(ref)).filter((t): t is string => !!t?.trim());
  return texts.length ? texts : v.description ? [v.description] : [];
}

// What call B gets for the card's direction line: their own answers, all of them.
function directionFacts(profile: PathProfile, ownIndex: RefIndex) {
  const v = profile.direction.value;
  if (!v) return null;
  return { level: DIRECTION_CARD_LABELS[v.kind], their_words: v.kind === 'no_idea' ? null : directionSources(profile, ownIndex) };
}

type CardProse = { seen_as: string; wants: string; direction: string | null };

// Fix 1: every card after the first opens with this line (code-owned).
export const CARD_INTRO = 'Here’s the updated summary with your changes. Your earlier answers are already filled in, so just check it and confirm, or change anything that’s still off.';

function buildCard(round: number, prose: CardProse, profile: PathProfile, direction: SummaryCard['direction']): SummaryCard {
  const toItems = (items: EvidencedItem[] = []) => items.map(i => ({ id: i.id, text: fixDashes(i.text), inferred: i.basis === 'inferred' }));
  return {
    round,
    intro: round > 1 ? CARD_INTRO : null,
    seen_as: prose.seen_as,
    wants: prose.wants,
    direction,
    must_haves: toItems(profile.must_haves_avoids.value?.must_haves),
    must_avoids: toItems(profile.must_haves_avoids.value?.must_avoids),
    risk: cardRisk(profile),
  };
}

function cardChoices(card: SummaryCard, profile: PathProfile, offerRisk: boolean): ChatChoiceSet {
  const removable = [...card.must_haves, ...card.must_avoids];
  const groups: ChoiceGroup[] = [
    {
      id: 'verdict', label: 'Does this summary sound right?', mode: 'single', required: true,
      options: [
        { id: 'right', label: 'Yes, that’s right' },
        { id: 'mostly', label: 'Mostly, with changes' },
        { id: 'not_it', label: 'No, that’s not it' },
      ],
    },
    { id: 'part', label: 'What’s off?', mode: 'multi', required: false, options: CARD_PARTS },
  ];
  if (removable.length) {
    groups.push({ id: 'remove', label: 'Remove', mode: 'multi', required: false, options: removable.map(i => ({ id: i.id, label: i.text })) });
  }
  // Brief item 8: when risk, limits and time were marked off, the tapped
  // answers come back as taps, filled with what is recorded now.
  if (offerRisk) groups.push(...riskGroups());
  return {
    mode: 'groups',
    purpose: 'summary',
    groups,
    card,
    ...(offerRisk && { preselected: riskPreselected(profile) }),
    risk_text: riskTextForEditing(profile),
    note: { placeholder: 'What should change?', required_when: { ids: ['verdict:mostly', 'verdict:not_it'], unless_group: 'part' } },
  };
}

/** The card as plain markdown: the message's content, for read-back anywhere. */
function cardMarkdown(card: SummaryCard): string {
  const list = (items: SummaryCard['must_haves']) =>
    items.length ? items.map(i => `- ${i.text}${i.inferred ? ' (Zyrro’s guess)' : ''}`).join('\n') : '- None recorded';
  const r = card.risk;
  const line = (label: string, value: string) => `- ${label}: ${value}`;
  const d = card.direction;
  return [
    ...(card.intro ? [card.intro] : []),
    '**How Zyrro sees you**', card.seen_as,
    '**What you want**', card.wants,
    ...(d ? ['**Your direction**', d.text ? `${d.level}. ${d.text}` : d.level] : []),
    '**Must-haves**', list(card.must_haves),
    '**Must-avoids**', list(card.must_avoids),
    '**Risk, limits and time**',
    [
      line('Ready to', r.readiness),
      line('Would put at risk', r.at_stake),
      line('Off the table', r.limits),
      line('Time', r.hours),
    ].join('\n'),
    ...(r.note ? [r.note] : []),
  ].join('\n\n');
}

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

// The summary's understanding of the user, for progress: the read, tensions,
// connections and direction (texts only).
function understandingSnapshot(s: UserSummary): string {
  return JSON.stringify([s.confirmed_read?.text ?? null, s.tensions.map(n => n.text), s.connections.map(n => n.text), s.direction.text]);
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

// Call A's view of the user: all 13 answers, and short report excerpts keyed
// by the refs it may cite (the full digest made the call slow; follow-up brief).
function updateContext(digest: ContextDigest) {
  const excerpts: Record<string, string> = {};
  for (const [key, text] of Object.entries(reportFields(digest))) {
    excerpts[`report.${key}`] = text.length > UPDATE_REPORT_EXCERPT_CHARS ? `${text.slice(0, UPDATE_REPORT_EXCERPT_CHARS)}…` : text;
  }
  return { answers: digest.answers, report_excerpts: excerpts };
}

/**
 * Call A, and everything code does with its output: profile updates (code
 * decides statuses), must-haves and must-avoids (each quote checked; null
 * means unchanged), the reflection result, the summary (changed sections
 * merged, then validated as a whole) and this turn's insights.
 */
async function runUpdate(s: TurnState, input: CallAInput, conversationId: string) {
  const pending = s.reflections.find(r => r.status === 'offered');
  const callLabel = input.mode === 'conversation' ? 'path update' : 'path card correction';
  const callAMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PATH_UPDATE_PROMPT },
    { role: 'system', content: `USER CONTEXT\n${JSON.stringify(updateContext(s.digest))}` },
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
            ? {
                tapped: { offered: { ...input.latest.tapped.offered, card: undefined, preselected: undefined }, picked: input.latest.tapped.picked },
                note: input.latest.own || null,
                // The opening read's note: added context or a correction, decided by code.
                ...(input.latest.tapped.offered.purpose === 'opening_read' && input.latest.own && {
                  note_is: openingNoteIsContext(input.latest.tapped.picked) ? 'added_context' : 'correction',
                }),
              }
            : { text: input.latest.content }),
        },
        asked: input.asked,
        // The user has answered Zyrro's first message but no acceptable
        // confirmed read is stored yet (fix 5): write one.
        confirmed_read_missing: !!s.profile.opening_read.value?.verdict
          && (!s.summary.confirmed_read || !!confirmedReadProblem(s.summary.confirmed_read.text, s.profile.opening_read.value?.text ?? null, firstNameOf(s.digest))),
        removed_items: s.profile.meta.removed_items,
        ...(input.correction && {
          card: input.correction.card,
          parts_marked_off: input.correction.parts,
          correction_note: input.correction.note,
        }),
      }),
    },
  ];
  // Step 3: what the correction note asks to add or reword comes from its own
  // small call, which sees only the note and the card's items (call A
  // returned none in a live run, so a requested item waited a whole round).
  // It runs alongside call A, so it adds no waiting.
  const correctionNote = input.mode === 'summary_correction' ? input.correction?.note ?? null : null;
  const [update, noteCall] = await Promise.all([
    chatJson(callAMessages, 0.2, callLabel, undefined, conversationId),
    correctionNote && input.correction
      ? chatJson([
          { role: 'system', content: PATH_CORRECTION_ITEMS_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              note: correctionNote,
              must_haves: input.correction.card.must_haves.map(({ id, text }) => ({ id, text })),
              must_avoids: input.correction.card.must_avoids.map(({ id, text }) => ({ id, text })),
              // The call can only tell a note about risk from an item if it
              // sees the risk block (briefs 168-card-items and 168-risk-note).
              risk: riskBlockFor(input.correction.card.risk),
            }),
          },
        ], 0.2, 'path correction items', undefined, conversationId)
      : Promise.resolve(null),
  ]);
  if (!update.parsed) return { ok: false as const, tokens: update.tokens + (noteCall?.tokens ?? 0) };
  let extraTokens = noteCall?.tokens ?? 0;
  const out = update.parsed;

  const applied = applyProfileUpdates(s.profile, out.profile_updates, input.answered, evidenceCheck(s.ownIndex));
  let profile = applied.profile;

  // null (or missing) means unchanged. A returned list that is empty or wholly
  // invalid also keeps what was there: removals are the user's, on the card.
  const removed = profile.meta.removed_items;
  const current = profile.must_haves_avoids.value;
  const pick = (key: 'must_haves' | 'must_avoids', prefix: 'h' | 'a') => {
    if (!Array.isArray(out[key])) return current?.[key] ?? [];
    const checked = validateEvidenced(out[key], s.ownIndex, prefix, removed);
    if (checked.dropped.length) console.warn(`[path update] ${key} dropped: ${checked.dropped.join('; ')}`);
    if (!checked.items.length) {
      console.warn(`[path update] ${key}: returned list had no usable items; keeping the current ones`);
      return current?.[key] ?? [];
    }
    return checked.items;
  };
  // Items a correction note asks for, merged in by code after the same quote
  // check (ref fixed to the note): in live runs a full list sometimes came back
  // without the reworded item the user had asked for.
  const requested = { must_haves: [] as unknown[], must_avoids: [] as unknown[] };
  const noteItems = noteCall?.parsed?.items;
  if (input.mode === 'summary_correction' && Array.isArray(noteItems)) {
    for (const a of noteItems) {
      const o = a && typeof a === 'object' ? (a as Record<string, unknown>) : null;
      // Each quote is checked against the note itself (ref m:latest). The note
      // is the user's words, so an item is stated unless the model says its
      // quote leans on something earlier and can't stand on the card
      // (brief 168-card-items, decision 2).
      if (o?.list === 'must_haves' || o?.list === 'must_avoids') requested[o.list].push({ ...o, ref: LATEST_REF, basis: o.basis === 'inferred' ? 'inferred' : 'stated' });
    }
    console.info(`[path update] correction items asked for by the note: ${JSON.stringify(noteItems)}`);
  }
  const withRequested = (key: 'must_haves' | 'must_avoids', prefix: 'h' | 'a') => {
    if (input.mode === 'summary_correction') return correctedList(key, prefix);
    const base = pick(key, prefix);
    if (!requested[key].length) return base;
    const checked = validateEvidenced(requested[key], s.ownIndex, prefix, []);
    if (checked.dropped.length) console.warn(`[path update] note item ${key} dropped: ${checked.dropped.join('; ')}`);
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const added = checked.items.filter(i => !base.some(b => norm(b.text) === norm(i.text)));
    const merged = [...base.slice(0, Math.max(0, SUMMARY_CAPS.must_items - added.length)), ...added];
    return merged.map((item, i) => ({ ...item, id: `${prefix}${i + 1}` }));
  };
  /**
   * A correction never drops an item the user didn't remove (step 1b): code
   * starts from the card's items (removals with the control are already
   * applied) and only adds what the note asks for. A reworded item is added
   * alongside the original, never in its place (brief 168-card-items,
   * decision 4): in a live run a rewording replaced an item the user never
   * touched. The user removes the original with the remove control. What
   * the note asks for is added even past the cap of 5.
   * Call A's full lists are not used here; in a live run a corrected list
   * silently lost an item the user never touched.
   */
  function correctedList(key: 'must_haves' | 'must_avoids', prefix: 'h' | 'a'): EvidencedItem[] {
    const base = current?.[key] ?? [];
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const list = [...base];
    for (const raw of requested[key]) {
      const checked = validateEvidenced([raw], s.ownIndex, prefix, []);
      if (checked.dropped.length) { console.warn(`[path update] note item ${key} dropped: ${checked.dropped.join('; ')}`); continue; }
      const item = checked.items[0];
      // Always added, even past the cap: the cap of 5 is only for what Zyrro
      // proposes itself (brief 168-card-items, decision of 2026-11-09). A
      // full list once silently left out what the user asked for.
      if (!list.some(b => norm(b.text) === norm(item.text))) {
        if (list.length >= SUMMARY_CAPS.must_items) console.info(`[path update] correction: ${key} past the cap of ${SUMMARY_CAPS.must_items}, added as the user asked: "${item.text}"`);
        list.push(item);
      }
    }
    const returned = Array.isArray(out[key]) ? (out[key] as Array<{ text?: unknown }>).map(i => (typeof i?.text === 'string' ? norm(i.text) : '')) : null;
    const leftOut = returned ? base.filter(b => !returned.includes(norm(b.text)) && list.includes(b)) : [];
    if (leftOut.length) console.info(`[path update] correction: kept ${key} call A's list left out: ${leftOut.map(b => `"${b.text}"`).join(', ')}`);
    return list.map((item, i) => ({ ...item, id: `${prefix}${i + 1}` }));
  }
  // Stated or inferred is the model's call, made when it picks the quote
  // (brief 168-card-items, decision 2): a stated item's text is its quote, so
  // an item whose quote leans on something earlier is inferred, in Zyrro's
  // wording. This replaces forcing every item from a user message to stated
  // (brief 168-direction-and-card, Part B item 2), which would now show
  // Zyrro's wording as the user's.
  // Second person on every inferred item, enforced by code (fix 3).
  const voiced = await inSecondPerson(
    { must_haves: withRequested('must_haves', 'h'), must_avoids: withRequested('must_avoids', 'a') },
    firstNameOf(s.digest),
    ref => s.ownIndex.get(ref),
    conversationId,
  );
  profile = {
    ...profile,
    must_haves_avoids: {
      ...profile.must_haves_avoids,
      status: 'inferred',
      source: 'conversation',
      value: voiced.lists,
    },
  };

  let reflections = s.reflections;
  if (pending) {
    const r = out.reflection_result && typeof out.reflection_result === 'object' ? (out.reflection_result as Record<string, unknown>) : null;
    const status = (['confirmed', 'corrected', 'rejected', 'no_reaction'] as const).find(x => x === r?.status) ?? 'no_reaction';
    reflections = reflections.map(x => (x === pending ? { ...x, status } : x));
  }

  const confirmedRefs = reflections.filter(r => r.status === 'confirmed' || r.status === 'corrected').flatMap(r => r.refs ?? []);
  // Changed sections only; a full "summary" (the pre-follow-up shape) is accepted too.
  let merged = mergeSummaryChanges(s.summary, out.summary_changes ?? out.summary);
  // A missing summary_changes key (about 1 call in 10) left the summary
  // un-updated on turns that carried something for it (brief 168-options,
  // item 6): one retry asks for the summary changes only. An empty object is
  // a real "nothing changed" and is not retried.
  if (!merged) {
    console.warn(`[path update] no usable summary_changes (got ${JSON.stringify(out.summary_changes)?.slice(0, 120)}; keys ${Object.keys(out).join(',')}); retrying for the summary only`);
    const started = Date.now();
    const retry = await chatJson([
      ...callAMessages,
      { role: 'system', content: 'Your answer had no summary_changes. Return only this JSON object: { "summary_changes": { ... } }, with the summary sections this message changes, in the same form as before, or an empty object if it changes none. Nothing else will be used.' },
    ], 0.2, `${callLabel} (summary retry)`, undefined, conversationId);
    extraTokens += retry.tokens;
    merged = mergeSummaryChanges(s.summary, retry.parsed?.summary_changes);
    console.info(`[path update] summary retry ${merged ? `returned ${Object.keys((retry.parsed?.summary_changes as object) ?? {}).join(',') || 'no changes'}` : 'unusable too; keeping the summary'} in ${Date.now() - started} ms`);
  }
  const validated = merged ? validateSummary(merged, { index: s.index, confirmedRefs, previous: s.summary }) : null;
  // The confirmed read says how the user now stands (fix 5): code takes out a
  // greeting and every sentence copied from Zyrro's first message. If nothing
  // of its own is left, or Zyrro speaks in it, it falls back to the previous
  // read if that one passes, else stays empty for call A to write again.
  let base = validated?.summary ?? s.summary;
  const opening = s.profile.opening_read.value?.text ?? null;
  const name = firstNameOf(s.digest);
  let read = base.confirmed_read;
  let readProblem = read ? confirmedReadProblem(read.text, opening, name) : null;
  // One retry from call A with the reason (step 1b), before the cleaned version.
  if (read && readProblem) {
    console.warn(`[path update] confirmed_read rejected (${readProblem}); asking call A once more: ${JSON.stringify(read.text)}`);
    const retry = await chatJson([
      ...callAMessages,
      { role: 'system', content: `Your confirmed_read was not usable: it ${readProblem.replace(/^copies/, 'copied').replace(/^says/, 'said').replace(/^starts/, 'started')}. Return the same JSON object again. Only summary_changes.confirmed_read will be used: how the user now stands, in your own words as a record about them, never taken from Zyrro's message, with no greeting and nothing about what is not known.` },
    ], 0.2, `${callLabel} (read retry)`, undefined, conversationId);
    extraTokens += retry.tokens;
    const changes = retry.parsed?.summary_changes && typeof retry.parsed.summary_changes === 'object' ? (retry.parsed.summary_changes as Record<string, unknown>) : null;
    const again = changes?.confirmed_read
      ? validateSummary(mergeSummaryChanges(base, { confirmed_read: changes.confirmed_read }), { index: s.index, confirmedRefs, previous: base })?.summary.confirmed_read ?? null
      : null;
    const againProblem = again ? confirmedReadProblem(again.text, opening, name) : 'no read returned';
    if (again && !againProblem) {
      console.info(`[path update] confirmed_read retry accepted: ${JSON.stringify(again.text)}`);
      base = { ...base, confirmed_read: again };
      read = again;
      readProblem = null;
    } else {
      console.warn(`[path update] confirmed_read retry rejected too (${againProblem}): ${JSON.stringify(again?.text ?? null)}`);
      if (again) read = again;
      readProblem = againProblem;
    }
  }
  if (read && readProblem) {
    const cleaned = cleanConfirmedRead(read.text, opening, name);
    const prev = s.summary.confirmed_read;
    const prevOk = !!prev && !confirmedReadProblem(prev.text, opening, name);
    console.warn(`[path update] confirmed_read rejected (${readProblem}); ${cleaned ? `kept without the copied lines: ${JSON.stringify(cleaned)}` : prevOk ? 'keeping the previous one' : 'left empty'}`);
    base = { ...base, confirmed_read: cleaned ? { ...read, text: cleaned } : prevOk ? prev : null };
  }
  const summary = syncFromProfile(base, profile);

  let contradiction: { item: AskedItem; text: string; refs: string[] } | null = null;
  const c = out.contradiction && typeof out.contradiction === 'object' ? (out.contradiction as Record<string, unknown>) : null;
  const cItem = ASKED_ITEMS.find(i => i === c?.item);
  const cText = typeof c?.text === 'string' ? c.text.trim() : '';
  const cRefs = Array.isArray(c?.refs) ? c.refs.filter((r): r is string => typeof r === 'string' && s.index.has(r)) : [];
  if (cItem && cText && cText.length <= SUMMARY_CAPS.entry_chars && cRefs.length >= 2) contradiction = { item: cItem, text: cText, refs: cRefs };

  // Whether Zyrro can yet describe the tension, pattern and constraints (brief
  // 168-conversation-purpose); null when call A gave no usable judgement.
  const u = out.understanding && typeof out.understanding === 'object' ? (out.understanding as Record<string, unknown>) : null;
  const understanding = typeof u?.ready === 'boolean'
    ? { ready: u.ready, still_unclear: typeof u.still_unclear === 'string' && u.still_unclear.trim() ? u.still_unclear.trim() : null }
    : null;

  return {
    understanding,
    ok: true as const,
    tokens: update.tokens + voiced.tokens + extraTokens,
    profile,
    changed: applied.changed,
    summary,
    reflections,
    insights: validInsights(out.turn_insights, s.index),
    contradiction,
    needsClarification: out.needs_clarification === true,
  };
}

type ReplyNext = Next | { kind: 'card_clarify'; parts: string[]; note: string | null };

// The card and its clarifying question restate by design; repetition is checked elsewhere.
const REPEAT_EXEMPT = new Set<ReplyNext['kind']>(['card', 'card_clarify']);

/**
 * The parts of the report where it names the user's tension and pattern, for
 * call B on every turn (brief 168-conversation-purpose). Fixed for the
 * conversation, so it sits right after the prompt and is cached.
 */
function reportCore(digest: ContextDigest) {
  const r = digest.report;
  return {
    named_identity: r.named_identity,
    signatures: r.primary_signatures.map(sig => ({ name: sig.name, core_statement: sig.core_statement, tension: sig.tension })),
    secondary_signatures: r.secondary_signatures,
    friction_points: r.friction_points,
    ...(r.pattern_to_notice && { pattern_to_notice: r.pattern_to_notice }),
    ...(r.distinctive_pattern && { distinctive_pattern: r.distinctive_pattern }),
  };
}

/**
 * Call B. Retries once if it rests only on sources already used without
 * anything new (no repetition, tracked by source refs); a second miss is
 * logged and kept. Returns the user sources the message rests on, for
 * meta.used_refs.
 *
 * Understanding on every turn (brief 168-conversation-purpose): every reply
 * sees the summary's tensions and connections, this turn's insights, the
 * report text they cite, the user's earlier words the latest answer touches,
 * and the report's tension material (reportCore). A signature may be named
 * when it is explained in plain words; code no longer retries on a name.
 */
async function runReply(
  s: TurnState,
  next: ReplyNext,
  fixed: ChatChoiceSet | null,
  insights: Insight[],
  latestText: string | null,
  conversationId: string,
  retryNote?: string,
) {
  const summary = s.summary;
  const earlierRefs = sourceRefs(insights.flatMap(i => i.refs)).filter(r => r !== LATEST_REF);
  const earlier = resolveExcerpts(earlierRefs, s.index);
  const used = new Set(s.profile.meta.used_refs);
  const excerpts = resolveExcerpts([
    ...summaryRefs(summary),
    ...earlierRefs,
    ...insights.flatMap(i => i.refs),
    ...(next.kind === 'clarify' ? next.contradiction.refs : []),
  ], s.index);
  const evidence = Object.fromEntries(Object.entries(excerpts).map(([ref, text]) => [ref, { text, used: used.has(ref) }]));
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PATH_REPLY_PROMPT },
    { role: 'system', content: `REPORT\n${JSON.stringify(reportCore(s.digest))}` },
    {
      role: 'user',
      content: JSON.stringify({
        first_name: s.digest.report.prepared_for.split(/\s+/)[0] ?? '',
        next,
        // Added context from the opening read, handed over by code so it never
        // depends on the summary keeping it (Part B item 1).
        added_to_read: next.kind === 'open_read' ? null : s.profile.opening_read.value?.added_context ?? null,
        fixed_choices: fixed ? { ...fixed, card: undefined, preselected: undefined } : null,
        summary,
        turn_insights: insights,
        earlier_answers: Object.entries(earlier).map(([ref, text]) => ({ ref, text })),
        evidence,
        ...(next.kind === 'card' && { direction: directionFacts(s.profile, s.ownIndex) }),
        recent_messages: s.all.slice(-REPLY_RECENT_MESSAGES).map(({ role, content }) => ({ role, content })),
        latest_message: latestText !== null ? { ref: LATEST_REF, content: latestText } : null,
      }),
    },
    ...(retryNote ? [{ role: 'system' as const, content: retryNote }] : []),
  ];

  let tokens = 0;
  let parsed: Record<string, unknown> | null = null;
  let refsUsed: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await chatJson(messages, REPLY_TEMPERATURE, next.kind === 'card' ? 'path card' : 'path reply', PATH_REPLY_MODEL, conversationId);
    tokens += reply.tokens;
    parsed = reply.parsed;
    const text = [parsed?.reply, parsed?.seen_as, parsed?.wants, parsed?.direction].filter(t => typeof t === 'string').join(' ');
    refsUsed = sourceRefs((Array.isArray(parsed?.refs_used) ? parsed.refs_used : [])
      .filter((r): r is string => typeof r === 'string' && (r === LATEST_REF || r in excerpts)));
    // Logged only: a signature named in the reply, for the verification judge.
    const named = text ? mentionsSignature(text, s.digest) : null;
    if (named) console.info(`[path reply] names "${named}" (${next.kind})`);
    const restated = !REPEAT_EXEMPT.has(next.kind) && refsUsed.length > 0
      && !refsUsed.includes(LATEST_REF) && refsUsed.every(r => used.has(r));
    if (!restated) break;
    console.warn(`[path reply] rested only on used sources ${refsUsed.join(', ')} (attempt ${attempt + 1})${attempt === 1 ? '; kept' : '; retrying'}`);
    if (attempt === 0) {
      messages.push({ role: 'system', content: 'Your draft rested only on sources marked used, with nothing new. Write it again: build on the latest message or a source not yet used.' });
    }
  }
  // One line per reply: what it rested on, against what was already used (repetition audit).
  console.info(`[path refs] ${JSON.stringify({ conversation: conversationId, kind: next.kind, refs_used: refsUsed, already_used: refsUsed.filter(r => used.has(r)) })}`);
  return { parsed, tokens, refsUsed };
}

function addUsedRefs(profile: PathProfile, refs: string[]): PathProfile {
  const all = [...new Set([...profile.meta.used_refs, ...sourceRefs(refs)])];
  return { ...profile, meta: { ...profile.meta, used_refs: all } };
}

// The prompt asks for about 600 and 350 characters; these ceilings are only a
// safety net against a runaway output.
const CARD_SEEN_AS_MAX = 900;
const CARD_WANTS_MAX = 600;
// Only a runaway guard: the direction line's real limits are checked by
// directionLineProblem, which retries and then falls back (fix 2). A hard cap
// here once threw away a faithful line and pasted the user's raw words instead.
const CARD_DIRECTION_RAW_MAX = 2000;

function cardProse(parsed: Record<string, unknown> | null): CardProse | null {
  const seen = typeof parsed?.seen_as === 'string' ? fixDashes(parsed.seen_as.trim()) : '';
  const wants = typeof parsed?.wants === 'string' ? fixDashes(parsed.wants.trim()) : '';
  if (!seen || !wants || seen.length > CARD_SEEN_AS_MAX || wants.length > CARD_WANTS_MAX) {
    console.warn(`[path card] unusable prose: seen_as ${seen.length} chars, wants ${wants.length} chars`);
    return null;
  }
  const d = typeof parsed?.direction === 'string' ? fixDashes(parsed.direction.trim()) : '';
  return { seen_as: seen, wants, direction: d && d.length <= CARD_DIRECTION_RAW_MAX ? d : null };
}

/**
 * The card's direction line (brief 168-card-fixes, fix 2): the level, then one
 * or two sentences in the second person built from everything they wrote in
 * answer to the direction question, checked by code. A line that fails the
 * check gets one retry from call B; if that fails too, code builds the line
 * from their first sentences with only the pronouns swapped. Their raw first
 * person never reaches the card. After "Not yet", the code-owned line.
 */
async function cardDirectionLine(
  s: TurnState,
  proseText: string | null,
  latestText: string | null,
  conversationId: string,
): Promise<{ direction: SummaryCard['direction']; tokens: number }> {
  const v = s.profile.direction.value;
  if (!v) return { direction: { level: 'Not known yet', text: null }, tokens: 0 };
  if (v.kind === 'no_idea') return { direction: { level: DIRECTION_CARD_LABELS.no_idea, text: NOT_YET_LINE }, tokens: 0 };
  const level = DIRECTION_CARD_LABELS[v.kind];
  const sources = directionSources(s.profile, s.ownIndex);
  if (!sources.length) return { direction: { level, text: null }, tokens: 0 };

  let tokens = 0;
  let problem = proseText ? directionLineProblem(proseText, sources) : 'no line written';
  if (!problem) return { direction: { level, text: proseText }, tokens };
  console.warn(`[path card] direction line rejected (${problem}); retrying: ${JSON.stringify(proseText)}`);

  const retry = await runReply(s, { kind: 'card' }, null, [], latestText, conversationId,
    `The direction line was not usable: ${problem}. Write all the card fields again; the direction must be at most ${DIRECTION_LINE_MAX_SENTENCES} sentences and ${DIRECTION_LINE_MAX_CHARS} characters, in the second person, built from their_words with their own words for the substance.`);
  tokens += retry.tokens;
  const second = typeof retry.parsed?.direction === 'string' ? fixDashes(retry.parsed.direction.trim()) : null;
  problem = second ? directionLineProblem(second, sources) : 'no line written';
  if (!problem) return { direction: { level, text: second }, tokens };

  const fallback = fallbackDirectionLine(sources);
  console.warn(`[path card] direction line rejected again (${problem}): ${JSON.stringify(second)}; code-built line: ${JSON.stringify(fallback)}`);
  return { direction: { level, text: fallback ? fixDashes(fallback) : null }, tokens };
}

async function loadTurnState(ctx: TurnContext, row: PathProfileRow) {
  const digest = row.context_digest!;
  // In parallel: each is a database round trip, and a turn's overhead is mostly these.
  const [stored, all] = await Promise.all([
    loadUserSummary(ctx.supabase, ctx.conversation.user_id),
    listConversationMessages(ctx.supabase, ctx.conversation.id),
  ]);
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
    profile: withMetaDefaults(row.profile as PathProfile),
    summary: stored && isCurrentSummary(stored.summary) ? stored.summary : emptySummary(),
    reflections: (row.reflections ?? []).map(r => ({ ...r, refs: r.refs ?? [] })),
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
  const understandingBefore = understandingSnapshot(s.summary);

  try {
    if (userMessage) {
      const asked = s.profile.meta.last_asked;
      const answeredMsg = [...s.all].reverse().find(m => m.role === 'assistant');
      const answeredChoices = answeredMsg?.choices as ChatChoiceSet | null | undefined;
      const ids = userMessage.selected_choice_ids;
      const note = userMessage.note ?? null;

      // Taps on code-owned choices, applied exactly, before call A.
      if (ids && answeredChoices?.purpose === 'opening_read') s.profile = applyOpeningReadTap(s.profile, ids, note);
      if (ids && answeredChoices?.purpose === 'direction') s.profile = applyDirectionTap(s.profile, ids, note);
      // A risk answer: its taps, and its note kept verbatim as the user's risk
      // text, which the card shows (brief 168-risk-note).
      if (ids && answeredChoices?.purpose === 'risk_time') s.profile = withRiskText(applyRiskTimeTap(s.profile, ids), latestOwn);
      if (!ids && asked?.kind === 'follow_up' && asked.item === 'opening_read') s.profile = applyOpeningReadFollowUp(s.profile, userMessage.content);
      const tapped = s.profile;

      const answered: AskedItem[] = !asked || asked.kind === 'card' || asked.kind === 'card_clarify' || asked.kind === 'deepen' ? []
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
      // The tapped level stands; only the direction turn (its tap or its one
      // follow-up) can settle or reopen it.
      const directionTurn = answeredChoices?.purpose === 'direction' || (asked?.kind === 'follow_up' && asked.item === 'direction');
      s.profile = keepDirectionKind(a.profile, tapped, a.changed.includes('direction'), directionTurn);
      // The typed answer to the direction follow-up is a source of the card's
      // direction line too (fix 2); the tap's note was recorded with the tap.
      if (!ids && asked?.kind === 'follow_up' && asked.item === 'direction' && latestOwn?.trim() && s.profile.direction.value) {
        const v = s.profile.direction.value;
        s.profile = { ...s.profile, direction: { ...s.profile.direction, value: { ...v, answer_refs: [...(v.answer_refs ?? []), LATEST_REF] } } };
      }
      s.summary = a.summary;
      s.reflections = a.reflections;
      insights = a.insights;
      // Call A's readiness judgement, with the turn it first said ready.
      if (a.understanding) {
        const prev = s.profile.meta.understanding;
        const firstReady = prev?.first_ready_turn ?? (a.understanding.ready ? turns : null);
        s.profile = { ...s.profile, meta: { ...s.profile.meta, understanding: { ...a.understanding, first_ready_turn: firstReady } } };
        console.info(`[path understanding] ${JSON.stringify({ conversation: conversation.id, turn: turns, ...a.understanding, first_ready_turn: firstReady })}`);
      } else {
        console.warn(`[path understanding] no usable judgement from call A (turn ${turns}); keeping ${JSON.stringify(s.profile.meta.understanding ?? null)}`);
      }

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

    // Progress is a filled practical fact or a deepened understanding: a change
    // to the profile items, or to the summary's read, tensions, connections or
    // direction (brief 168-conversation-purpose; before, only the profile counted).
    const progress = itemsSnapshot(s.profile) !== itemsSnapshot(withMetaDefaults(row.profile as PathProfile))
      || understandingSnapshot(s.summary) !== understandingBefore;
    const turnsSinceProgress = userMessage ? (progress ? 0 : row.turns_since_progress + 1) : row.turns_since_progress;
    const next = computeNext(s.profile, { opening: !userMessage, turns, turnsSinceProgress });
    // Deepen turns in a row; a practical question or the card resets it.
    s.profile = { ...s.profile, meta: { ...s.profile.meta, deepen_streak: next.kind === 'deepen' ? (s.profile.meta.deepen_streak ?? 0) + 1 : 0 } };

    let assistant: { content: string; choices: ChatChoiceSet | null };
    let cardState: CardState | null = null;
    if (next.kind === 'card') {
      const b = await runReply(s, next, null, insights, latestOwn, conversation.id);
      tokens += b.tokens;
      const prose = cardProse(b.parsed);
      if (!prose) return { ok: false, status: 502, error: 'no_usable_card', tokens };
      const dir = await cardDirectionLine(s, prose.direction, latestOwn, conversation.id);
      tokens += dir.tokens;
      const card = buildCard(1, prose, s.profile, dir.direction);
      cardState = { round: 1, card, correction: null, clarify_pending: false, confirmed: false };
      assistant = { content: cardMarkdown(card), choices: cardChoices(card, s.profile, false) };
    } else {
      const fixed = fixedChoices(next, s.profile);
      const b = await runReply(s, next, fixed, insights, latestOwn, conversation.id);
      tokens += b.tokens;
      const text = typeof b.parsed?.reply === 'string' ? fixDashes(b.parsed.reply.trim()) : '';
      if (!text) return { ok: false, status: 502, error: 'no_usable_reply', tokens };
      s.profile = addUsedRefs(s.profile, b.refsUsed);
      if (next.kind === 'open_read') {
        s.profile = { ...s.profile, opening_read: { ...s.profile.opening_read, value: { text, verdict: null, correction: null, added_context: null } } };
      }
      // The model may offer its own choices on an open question only: never
      // where code attaches choices, never on a follow-up that asks for
      // something only the user can put in words, and never on a deepen turn.
      const modelChoicesAllowed = next.kind === 'item' || (next.kind === 'follow_up' && next.item !== 'opening_read' && next.item !== 'direction');
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
        const reflections = withLatestRef(s.reflections, userId).map(r => (r.status === 'offered' && !r.message_id ? { ...r, message_id: assistantId } : r));

        const [{ error }] = await Promise.all([
          supabase
            .from('path_profiles')
            .update({
              profile,
              reflections,
              turns,
              turns_since_progress: turnsSinceProgress,
              ...(cardState && { phase: 'summary', summary: cardState }),
            })
            .eq('conversation_id', conversation.id),
          saveSummary(ctx, withLatestRef(s.summary, userId), storedVersion),
        ]);
        if (error) console.error('Path profile update failed:', error);
      },
    };
  } catch (error) {
    if (isRateLimitError(error)) return { ok: false, status: 503, error: 'busy', tokens };
    throw error;
  }
}

// ── The summary phase: confirm, correct, clarify ──────────────────────────

const offeredRisk = (choices: ChatChoiceSet | null | undefined) =>
  choices?.mode === 'groups' && choices.groups.some(g => g.id === 'readiness');

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

  // Removals on the card are applied by code, exactly. Only that exact item is
  // blocked from coming back; a reworded version the user asks for may be added.
  let card = cardState.card;
  const removeIds = answeredChoices?.purpose === 'summary' ? pickedIn(ids, 'remove') : [];
  if (removeIds.length) {
    const v = s.profile.must_haves_avoids.value ?? { must_haves: [], must_avoids: [] };
    const removedTexts = [...v.must_haves, ...v.must_avoids].filter(i => removeIds.includes(i.id)).map(i => i.text);
    s.profile = {
      ...s.profile,
      must_haves_avoids: {
        ...s.profile.must_haves_avoids,
        value: { must_haves: v.must_haves.filter(i => !removeIds.includes(i.id)), must_avoids: v.must_avoids.filter(i => !removeIds.includes(i.id)) },
      },
      meta: { ...s.profile.meta, removed_items: [...s.profile.meta.removed_items, ...removedTexts] },
    };
    card = { ...card, must_haves: card.must_haves.filter(i => !removeIds.includes(i.id)), must_avoids: card.must_avoids.filter(i => !removeIds.includes(i.id)) };
  }
  // Re-offered risk and time taps (brief item 8), applied by code as before.
  let riskChanged = false;
  if (answeredChoices?.purpose === 'summary' && offeredRisk(answeredChoices)) {
    s.profile = applyRiskTimeTap(s.profile, ids);
    riskChanged = riskValuesChanged(card.risk, s.profile);
  }
  // "Risk, limits and time" marked off: what the user saved in the card's risk
  // field replaces their risk text (brief 168-risk-note). Nothing else changes it.
  let riskEdited = false;
  if (answeredChoices?.purpose === 'summary' && pickedIn(ids, 'part').includes('risk') && typeof userMessage.risk_text === 'string') {
    const before = s.profile;
    s.profile = withEditedRiskText(s.profile, userMessage.risk_text);
    riskEdited = s.profile !== before;
  }
  s.summary = syncFromProfile(s.summary, s.profile);

  const commitWith = (next: CardState, extra: Record<string, unknown> = {}) => async (saved: StoredMessage[]) => {
    const userId = saved[0]?.id ?? null;
    const [{ error }] = await Promise.all([
      supabase
        .from('path_profiles')
        .update({ profile: withLatestRef(s.profile, userId), reflections: s.reflections, summary: next, turns: row.turns + 1, ...extra })
        .eq('conversation_id', conversation.id),
      saveSummary(ctx, withLatestRef(s.summary, userId), storedVersion),
    ]);
    if (error) console.error('Path profile update failed:', error);
  };

  // A card built by code from the current one: same prose, current must-haves,
  // must-avoids and risk block. No model call.
  const codeCard = (round: number, offerRisk: boolean): TurnRun => {
    const fresh: SummaryCard = {
      ...card,
      round,
      intro: CARD_INTRO,
      must_haves: card.must_haves,
      must_avoids: card.must_avoids,
      risk: cardRisk(s.profile),
    };
    s.profile = { ...s.profile, meta: { ...s.profile.meta, last_asked: { kind: 'card' } } };
    return {
      ok: true,
      assistant: { content: cardMarkdown(fresh), choices: cardChoices(fresh, s.profile, offerRisk) },
      tokens,
      commit: commitWith({ round, card: fresh, correction: null, clarify_pending: false, confirmed: false }),
    };
  };

  try {
    if (answeredChoices?.purpose === 'summary') {
      const verdict = pickedIn(ids, 'verdict')[0];
      if (verdict === 'right') {
        // Changed risk and time answers: show the updated card once more before
        // confirming (Miroslav, 2026-11-06), built by code; the same for an
        // edited risk text.
        if (riskChanged || riskEdited) return codeCard(cardState.round + 1, false);
        // Confirmed: no model call and no message (brief 168-options, Part B
        // item 1). The phase moves to options; the generation is started after
        // this commit (lib/path-options.ts) and its options arrive as the reply.
        const confirmed: CardState = { ...cardState, card, correction: null, clarify_pending: false, confirmed: true };
        return {
          ok: true,
          assistant: null,
          tokens: 0,
          commit: commitWith(confirmed, { summary_confirmed_at: new Date().toISOString(), phase: 'options' }),
        };
      }
      if (verdict !== 'mostly' && verdict !== 'not_it') return { ok: false, status: 400, error: 'invalid_choice', tokens: 0 };
      const parts = pickedIn(ids, 'part');
      const correction = { verdict, parts, note } as const;
      const riskOnly = parts.length > 0 && parts.every(p => p === 'risk');
      // Risk, limits and time are taps: when only they are off and there's no
      // note, the card comes back with those taps (or, if the user already
      // changed them, updated). No model call.
      if (!note && riskOnly) return codeCard(cardState.round + 1, !riskChanged);
      // Other parts marked off but no note: nothing to apply yet, so the one
      // clarifying question comes first, decided by code.
      if (!note) return await clarify(correction);

      const directionBefore = directionKey(s.profile);
      const a = await runUpdate(s, {
        mode: 'summary_correction',
        latest: { content: userMessage.content, own: latestOwn ?? '', tapped: { offered: answeredChoices, picked: ids } },
        asked: { kind: 'card' },
        answered: [...MODEL_ITEMS],
        correction: { card, parts, note },
      }, conversation.id);
      tokens += a.tokens;
      if (!a.ok) return { ok: false, status: 502, error: 'no_usable_update', tokens };
      s.profile = a.profile;
      s.summary = a.summary;
      const directionChanged = noteChangesDirection(parts, directionBefore);

      // One clarifying question per correction, only when Zyrro can't tell what to change.
      if (a.needsClarification) return await clarify(correction);
      return await newCard(cardState.round + 1, parts.includes('risk') && !offeredRisk(answeredChoices), parts, directionChanged);
    }

    if (answeredChoices?.purpose === 'summary_clarify' && cardState.clarify_pending) {
      const prior = cardState.correction;
      const directionBefore = directionKey(s.profile);
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
      const priorParts = prior?.parts ?? [];
      return await newCard(cardState.round + 1, priorParts.includes('risk'), priorParts, noteChangesDirection(priorParts, directionBefore));
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

  /** The direction as the user put it (kind and words), to tell whether a correction changed it. */
  function directionKey(p: PathProfile): string {
    const v = p.direction.value;
    return JSON.stringify(v ? { kind: v.kind, description: v.description } : null);
  }

  /**
   * Whether this correction changes the direction: marked off, or call A
   * changed it. Then the user's note is one of the direction line's sources.
   */
  function noteChangesDirection(parts: string[], before: string): boolean {
    const changed = parts.includes('direction') || directionKey(s.profile) !== before;
    const v = s.profile.direction.value;
    if (changed && v && v.kind !== 'no_idea' && latestOwn?.trim()) {
      s.profile = { ...s.profile, direction: { ...s.profile.direction, value: { ...v, answer_refs: [...(v.answer_refs ?? []), LATEST_REF] } } };
    }
    return changed;
  }

  /**
   * A corrected card (fix 2). Sections the user didn't mark as off keep the
   * previous card's text: the read, what they want, and the direction line
   * (unless the direction itself changed). With a note but nothing marked,
   * the read and what they want are written again; the direction still stands
   * unless the correction changed it.
   */
  async function newCard(round: number, offerRisk: boolean, parts: string[], directionChanged: boolean): Promise<TurnRun> {
    const b = await runReply(s, { kind: 'card' }, null, [], latestOwn, conversation.id);
    tokens += b.tokens;
    const written = cardProse(b.parsed);
    if (!written) return { ok: false, status: 502, error: 'no_usable_card', tokens };
    const marked = parts.length > 0;
    const prose: CardProse = {
      ...written,
      seen_as: marked && !parts.includes('read') ? card.seen_as : written.seen_as,
      wants: marked && !parts.includes('wants') ? card.wants : written.wants,
    };
    const keepDirection = !!card.direction && !directionChanged;
    let direction: SummaryCard['direction'] = card.direction ?? null;
    if (!keepDirection) {
      const dir = await cardDirectionLine(s, written.direction, latestOwn, conversation.id);
      tokens += dir.tokens;
      direction = dir.direction ?? null;
    }
    s.profile = { ...s.profile, meta: { ...s.profile.meta, last_asked: { kind: 'card' } } };
    const fresh = buildCard(round, prose, s.profile, direction);
    return {
      ok: true,
      assistant: { content: cardMarkdown(fresh), choices: cardChoices(fresh, s.profile, offerRisk) },
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
