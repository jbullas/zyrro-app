import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  addTokens,
  createServiceClient,
  insertAssistantMessage,
  listConversationMessages,
  type AssistantMessage,
  type ConversationRow,
  type RunTurn,
  type StoredMessage,
  type TurnContext,
  type TurnRun,
} from '@/lib/chat-turn';
import {
  noteFromContent,
  typedNameProblem,
  type ChatChoiceSet,
  type NameSuggestion,
  type OptionsRoundView,
  type PathOptionView,
  type SummaryCard,
} from '@/lib/chat-choices';
import { FLIP_GUARD_MS, GENERATION_BUDGET_MS } from '@/lib/generation-budget';
import { ensurePlanGeneration } from '@/lib/path-plan-generation';
import { isRateLimitError, withPipelineDeadline } from '@/lib/llm';
import {
  chatJson,
  directionSources,
  firstNameOf,
  fixDashes,
  getProfileRow,
  ownIndexFor,
  ownMessages,
  PATH_TURN_CONFIG,
  reportFields,
  riskDeadline,
  type CardState,
  type ContextDigest,
  type PathPhase,
  type PathProfileRow,
} from '@/lib/path-conversation';
import { DIRECTION_CARD_LABELS, withMetaDefaults, type PathProfile } from '@/lib/path-profile';
import { hasFirstPerson, pathSpecificStartWords, sentences, substanceShare, thirdPersonWord } from '@/lib/path-text-checks';
import { PATH_OPTION_REPLACE_NOTE, PATH_OPTIONS_PROMPT } from '@/lib/prompts/path-options';
import { PROJECT_NAME_PROMPT } from '@/lib/prompts/project-name';
import { isCurrentSummary, loadUserSummary, quoteFound, resolveExcerpts, type RefIndex, type UserSummary } from '@/lib/user-summary';

// #168, brief 168-options (Parts B, C and D): the three path options, the
// adjustment rounds, the choice and naming the chosen path, after the user has
// confirmed their summary card. Design rules: docs/framework/path-plan-redesign.md.
//
// Flow, all in the Path conversation's thread:
// - "That's right" on the card saves only the user's message and moves the
//   phase to options (lib/path-conversation.ts). After that commit, code here
//   inserts a path_conversation_options row (status generating) and runs the
//   generation in the background (after()). The one-generating-row unique
//   index stops a second generation; a row left generating past the budget is
//   flipped to failed and the user can retry.
// - The generation saves the round on the row and posts it as an assistant
//   message (purpose 'options'): three options to choose from, and "None of
//   these feels right" unless this is the last round.
// - "None of these" gets one code-owned question (purpose 'options_feedback'):
//   close or not for me per option, plus a note. The answer saves only the
//   user's message and starts the next round's generation the same way.
// - Choosing an option writes path_choice, moves the phase to chosen and
//   offers three names (purpose 'naming', PROJECT_NAME_PROMPT) with a skip.
//   The pick or skip is saved on path_choice.project_name; the reply shows
//   the chosen path and one code-owned line that the plan comes next.

// Model for the options (brief Part B item 8): switchable on its own.
export const PATH_OPTIONS_MODEL = process.env.PATH_OPTIONS_MODEL || 'gpt-6.1-sol';
const OPTIONS_TEMPERATURE = /^gpt-4/.test(PATH_OPTIONS_MODEL) ? 0.7 : undefined;

// Names for the chosen path in this flow (the current /path naming route keeps its own model).
const PATH_NAMES_MODEL = 'gpt-6.1-sol';

// The first set plus two adjustment rounds (design doc, "If nothing lands").
export const MAX_OPTIONS_ROUNDS = 3;

// Section lengths (design doc, "What each option contains", approved 2026-11-08).
const LIMITS = {
  name: { words: 6, chars: 50 },
  what_it_is: { sentences: 1, chars: 200 },
  what_it_looks_like: { sentences: 3, chars: 450 },
  why_it_fits: { sentences: 2, chars: 280 },
  starting_point: { sentences: 1, chars: 180 },
  what_it_costs: { sentences: 2, chars: 240 },
  why_strongest: { sentences: 1, chars: 200 },
} as const;

// The parts in the design doc's order.
const PART_KEYS = ['name', 'what_it_is', 'what_it_looks_like', 'why_it_fits', 'starting_point', 'what_it_costs'] as const;
type PartKey = typeof PART_KEYS[number];

export const OPTION_KINDS = ['develops_direction', 'new_path', 'rebalance'] as const;
export type OptionKind = typeof OPTION_KINDS[number];

// The form of the path ("what it is"): who the user would work for, or as.
export const OPTION_FORMS = ['current_employer', 'new_employer', 'freelance', 'business', 'portfolio'] as const;
export type OptionForm = typeof OPTION_FORMS[number];

// Their weekly hours now shape only the starting point (design doc, "What it
// would look like"): any other part that mentions the user's current hours is
// flagged: a number of hours from their band, or the hours they have now. A
// full working week on the path itself is not their current hours.
const HOURS_MENTION = /\b(\d+)\s*(?:to|-|–|or|and)?\s*(\d+)?[\s-]*hours?\b/gi;
const HOURS_NOW = /\b(hours (?:you have|available)|available hours|spare hours|hours (?:a|per|each) week (?:you have )?now)\b/i;

function mentionsCurrentHours(text: string, bandNumbers: string[]): boolean {
  if (HOURS_NOW.test(text)) return true;
  for (const m of text.matchAll(HOURS_MENTION)) {
    if ([m[1], m[2]].some(n => n && bandNumbers.includes(n))) return true;
  }
  return false;
}

// The report's section labels, which never reach option text. Signature names
// and the named identity may (design doc, "Signatures in context only"): the
// prompt asks for each to be explained in the same sentence, and the
// verification judge checks it; code doesn't ban them in options any more
// (the conversation still does).
const REPORT_LABELS = [
  'identity report', 'pattern to notice', 'energiser', 'friction point', 'how you operate',
  'distinctive pattern', 'forward frame', 'constellation',
];
// How Zyrro works, never shown to the user.
const INTERNAL_TERMS = /(develops_direction|new_path|\bq\d{1,2}\b|\bm:[\w-]+|\b[ha]\d\b|\breport\.[\w.]+|questionnaire|summary card|\bthe card\b|\brefs?\b)/i;

// ── Stored shapes (artifacts.content, jsonb; no migration) ─────────────────

export type StoredOption = PathOptionView & {
  kind: OptionKind;
  // The form and who pays the user, which "what it is" must name (absent on
  // rounds generated before them).
  form?: OptionForm;
  who_pays?: string;
  refs: Array<{ ref: string; quote: string }>;
  must_haves_met: string[];
  must_avoids_touched: Array<{ id: string; fully_avoidable: boolean }>;
};

export type OptionMark = 'close' | 'not_for_me';

// What the user said about the round before this one.
export type Adjustment = { from_artifact_id: string; from_round: number; marks: Record<string, OptionMark>; note: string | null };

type CheckLog = {
  attempts: number;
  problems_first: string[];
  problems_kept: string[];
  replaced: string[];
  evidence_kept_failing: string[];
  ms: number;
  tokens: number;
};

export type OptionsContent = {
  round: number;
  adjustment: Adjustment | null;
  options?: StoredOption[];
  strongest_fit_id?: string;
  why_strongest?: string;
  card_snapshot?: SummaryCard;
  summary_snapshot?: UserSummary | null;
  profile_snapshot?: PathProfile;
  model?: string;
  checks?: CheckLog;
};

export type PathChoiceContent = {
  option: StoredOption;
  was_strongest_fit: boolean;
  why_strongest: string | null;
  round: number;
  // What the user asked to keep in mind about this path, sent with the
  // choice; passed to naming and kept for the Plan (null: none given).
  note?: string | null;
  // absent = not asked, null = skipped (same convention as path_report).
  project_name?: string | null;
};

type OptionsRow = { id: string; status: string; content: OptionsContent; created_at: string };

const OPTIONS_TYPE = 'path_conversation_options';
const CHOICE_TYPE = 'path_choice';

async function optionsRows(supabase: SupabaseClient, conversationId: string): Promise<OptionsRow[]> {
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, status, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('type', OPTIONS_TYPE)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OptionsRow[];
}

async function latestChoice(supabase: SupabaseClient, conversationId: string): Promise<{ id: string; content: PathChoiceContent } | null> {
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, content')
    .eq('conversation_id', conversationId)
    .eq('type', CHOICE_TYPE)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { id: string; content: PathChoiceContent } | undefined) ?? null;
}

/** A generating row past the budget is stranded: flip it to failed (status-guarded, like the identity report route). */
async function flipStranded(supabase: SupabaseClient, rows: OptionsRow[]): Promise<void> {
  for (const r of rows) {
    if (r.status !== 'generating') continue;
    if (Date.now() - new Date(r.created_at).getTime() <= GENERATION_BUDGET_MS + FLIP_GUARD_MS) continue;
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', r.id).eq('status', 'generating');
    const { data } = await supabase.from('artifacts').select('status').eq('id', r.id).single();
    r.status = (data?.status as string | undefined) ?? 'failed';
    console.warn(`[path options] stranded generation ${r.id} flipped to ${r.status}`);
  }
}

// ── Which round is wanted now ───────────────────────────────────────────────

/**
 * The user's answer to "what feels off", when it is the latest message: the
 * marks per option and their note, after any note they sent with "Adjust
 * these options" itself. Null otherwise. Takes the last four messages.
 */
function pendingFeedback(messages: StoredMessage[]): Adjustment | null {
  const last = messages[messages.length - 1];
  const asked = messages[messages.length - 2];
  const choices = asked?.choices as ChatChoiceSet | null | undefined;
  if (last?.role !== 'user' || asked?.role !== 'assistant' || choices?.purpose !== 'options_feedback' || !choices.options_round) return null;
  const ids = last.selected_choice_ids ?? [];
  const marks: Record<string, OptionMark> = {};
  for (const id of ids) {
    const [opt, mark] = id.split(':');
    if (mark === 'close' || mark === 'not_for_me') marks[opt] = mark;
  }
  // The note sent with "Adjust these options", from the tap that asked for this question.
  const adjustTap = messages[messages.length - 3];
  const optionsMsg = messages[messages.length - 4];
  const optionsChoices = optionsMsg?.choices as ChatChoiceSet | null | undefined;
  const adjustNote = adjustTap?.role === 'user' && adjustTap.selected_choice_ids && optionsChoices?.purpose === 'options'
    ? noteFromContent(optionsChoices, adjustTap.selected_choice_ids, adjustTap.content)
    : '';
  const note = [adjustNote, noteFromContent(choices, ids, last.content)].filter(Boolean).join('\n\n') || null;
  return { from_artifact_id: choices.options_round.artifact_id, from_round: choices.options_round.round, marks, note };
}

export type OptionsStatus = 'none' | 'started' | 'running' | 'failed' | 'ready';

/**
 * Starts the options generation that is due, if any, exactly once: the first
 * round once the summary is confirmed, or the next round once the user has
 * said what feels off. Called after the turns that end with no reply, on
 * read-back (resumes a conversation confirmed before options existed, and
 * flips a stranded row) and on retry. Must run inside a route handler (after()).
 */
export async function ensureOptionsGeneration(
  supabase: SupabaseClient,
  conversation: Pick<ConversationRow, 'id' | 'user_id'>,
  opts: { retry?: boolean } = {},
): Promise<OptionsStatus> {
  const row = await getProfileRow(supabase, conversation.id);
  if (!row) return 'none';
  let phase: PathPhase = row.phase;
  // A summary confirmed before options existed moves on to them.
  if (phase === 'summary' && row.summary_confirmed_at) {
    const { error } = await supabase.from('path_profiles').update({ phase: 'options' }).eq('conversation_id', conversation.id).eq('phase', 'summary');
    if (error) throw error;
    console.info(`[path options] conversation ${conversation.id}: confirmed summary moved on to options`);
    phase = 'options';
  }
  if (phase !== 'options') return 'none';

  const rows = await optionsRows(supabase, conversation.id);
  await flipStranded(supabase, rows);
  if (rows.some(r => r.status === 'generating')) return 'running';

  const ready = rows.filter(r => r.status === 'ready');
  let wanted: { round: number; adjustment: Adjustment | null } | null;
  if (!ready.length) {
    wanted = { round: 1, adjustment: null };
  } else {
    const adjustment = pendingFeedback(await listConversationMessages(supabase, conversation.id, 4));
    wanted = adjustment ? { round: adjustment.from_round + 1, adjustment } : null;
  }
  if (!wanted) return 'ready';
  const forRound = rows.filter(r => r.content?.round === wanted!.round);
  if (forRound.some(r => r.status === 'ready')) return 'ready';
  if (forRound.some(r => r.status === 'failed') && !opts.retry) return 'failed';

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: conversation.user_id,
      conversation_id: conversation.id,
      type: OPTIONS_TYPE,
      status: 'generating',
      content: { round: wanted.round, adjustment: wanted.adjustment } satisfies OptionsContent,
    })
    .select('id')
    .single();
  if (error?.code === '23505') return 'running';
  if (error || !data) throw error ?? new Error('options row insert returned nothing');
  const id = data.id as string;
  console.info(`[path options] conversation ${conversation.id}: round ${wanted.round} generation ${id} started`);
  after(() => withPipelineDeadline(() => runOptionsGeneration(id)));
  return 'started';
}

// ── The generation ──────────────────────────────────────────────────────────

// rough_specific: a rough sense specific enough to build on (call A's
// specific_enough, after the follow-up if one was asked); rough: still vague.
type DirectionLevel = 'clear' | 'rough_specific' | 'rough' | 'none';

const LEVEL_FOR_OPTIONS: Record<DirectionLevel, string> = {
  clear: 'clear',
  rough_specific: 'rough, specific enough to build on',
  rough: 'rough, still vague',
  none: 'none yet',
};

type GenContext = {
  digest: ContextDigest;
  card: SummaryCard;
  level: DirectionLevel;
  firstName: string;
  ownIndex: RefIndex;
  notForMe: string[];
  conversationId: string;
  // The numbers in their hours band (the card's Time line), for the hours check.
  hoursNumbers: string[];
};

function directionLevel(profile: PathProfile): DirectionLevel {
  const v = profile.direction.value;
  if (v?.kind === 'specific_idea') return 'clear';
  if (v?.kind === 'rough_leaning') return v.specific_enough === true ? 'rough_specific' : 'rough';
  return 'none';
}

// The report is now evidence the options build on and cite (design doc,
// "Built on the Identity report"), so each field gets more room than before.
const REPORT_EXCERPT_CHARS = 700;

/** Everything the options read (brief Part B item 2), every ref resolved to an excerpt. */
function buildInputs(
  digest: ContextDigest,
  profile: PathProfile,
  card: SummaryCard,
  summary: UserSummary | null,
  ownIndex: RefIndex,
  round: number,
  previous: Array<{ round: number; options: StoredOption[]; marks: Record<string, OptionMark> }>,
  adjustment: Adjustment | null,
) {
  const answerRefs = digest.answers.map(a => `Q${a.number}`);
  const messageRefs = [...ownIndex.keys()].filter(r => r.startsWith('m:'));
  const evidence: Record<string, string> = resolveExcerpts([...answerRefs, ...messageRefs], ownIndex);
  for (const i of [...card.must_haves, ...card.must_avoids]) evidence[i.id] = i.text;
  // Keyed by the ref an option cites (report.<field>); a quote must come from the text shown.
  const report: Record<string, string> = {};
  for (const [key, text] of Object.entries(reportFields(digest))) {
    report[`report.${key}`] = text.length > REPORT_EXCERPT_CHARS ? `${text.slice(0, REPORT_EXCERPT_CHARS)}…` : text;
  }
  const d = profile.direction.value;
  return {
    round,
    // The main input (design doc, "Grown out of the understanding"): the
    // tension and pattern the user confirmed, as the card put them, with the
    // summary's notes behind them.
    understanding: {
      how_zyrro_sees_you: card.seen_as,
      tensions: summary?.tensions.map(n => n.text) ?? [],
      pattern_and_connections: summary?.connections.map(n => n.text) ?? [],
      confirmed_read: summary?.confirmed_read?.text ?? null,
    },
    card: {
      seen_as: card.seen_as,
      wants: card.wants,
      direction: card.direction ?? null,
      must_haves: card.must_haves.map(({ id, text, inferred }) => ({ id, text, inferred })),
      must_avoids: card.must_avoids.map(({ id, text, inferred }) => ({ id, text, inferred })),
      risk: card.risk,
    },
    // The user's own words about their readiness, risk, limits, time and
    // timing, verbatim with their message ids (brief 168-risk-note).
    risk_text: profile.risk_time.value?.their_words ?? [],
    direction: {
      level: d ? DIRECTION_CARD_LABELS[d.kind] : 'Not known',
      level_for_options: LEVEL_FOR_OPTIONS[directionLevel(profile)],
      their_words: d && d.kind !== 'no_idea' ? directionSources(profile, ownIndex) : [],
      aside: d?.aside ?? null,
    },
    summary: summary
      ? {
          pushing: summary.pushing?.text ?? null,
          open_questions: summary.open_questions,
        }
      : null,
    attempts: (profile.tried_before.value?.attempts ?? []).map(a => ({ what: a.what, why_it_stalled: a.why_it_stalled, ref: a.ref })),
    evidence,
    report,
    ...(previous.length && {
      previous_rounds: previous.map(p => ({
        round: p.round,
        options: p.options.map(o => ({ id: o.id, name: o.name, kind: o.kind, form: o.form ?? null, what_it_is: o.what_it_is ?? null, what_it_looks_like: o.what_it_looks_like, why_it_fits: o.why_it_fits, starting_point: o.starting_point, mark: p.marks[o.id] ?? null })),
      })),
    }),
    ...(adjustment && { feedback: { note: adjustment.note } }),
  };
}

type ParsedSet = { options: StoredOption[]; strongest_fit_id: string; why_strongest: string };

const str = (v: unknown) => (typeof v === 'string' ? fixDashes(v.trim()) : '');

function parseOption(raw: unknown, id: string, card: SummaryCard): StoredOption | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const kind = OPTION_KINDS.find(k => k === o.kind);
  const form = OPTION_FORMS.find(f => f === o.form);
  const whoPays = str(o.who_pays);
  const parts = Object.fromEntries(PART_KEYS.map(k => [k, str(o[k])])) as Record<PartKey, string>;
  if (!kind || !form || !whoPays || PART_KEYS.some(k => !parts[k])) return null;
  const haveIds = new Set(card.must_haves.map(i => i.id));
  const avoidIds = new Set(card.must_avoids.map(i => i.id));
  const refs = (Array.isArray(o.refs) ? o.refs : []).flatMap(r => {
    const x = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    return typeof x?.ref === 'string' && typeof x.quote === 'string' ? [{ ref: x.ref.trim(), quote: x.quote.trim() }] : [];
  });
  const touched = (Array.isArray(o.must_avoids_touched) ? o.must_avoids_touched : []).flatMap(t => {
    const x = t && typeof t === 'object' ? (t as Record<string, unknown>) : null;
    return typeof x?.id === 'string' && avoidIds.has(x.id) ? [{ id: x.id, fully_avoidable: x.fully_avoidable === true }] : [];
  });
  return {
    id,
    ...parts,
    kind,
    form,
    who_pays: whoPays,
    refs,
    must_haves_met: (Array.isArray(o.must_haves_met) ? o.must_haves_met : []).filter((h): h is string => typeof h === 'string' && haveIds.has(h)),
    must_avoids_touched: touched,
  };
}

/** The set's structure; option ids are o1 to o3 in the order given. */
function parseSet(raw: Record<string, unknown> | null, card: SummaryCard): { set: ParsedSet | null; problem: string | null } {
  const list = Array.isArray(raw?.options) ? raw.options : null;
  if (!list || list.length !== 3) return { set: null, problem: `expected exactly 3 options, got ${list?.length ?? 'none'}` };
  const givenIds = list.map(o => (o && typeof o === 'object' ? (o as Record<string, unknown>).id : null));
  const options: StoredOption[] = [];
  for (let i = 0; i < 3; i++) {
    const opt = parseOption(list[i], `o${i + 1}`, card);
    if (!opt) return { set: null, problem: `option ${i + 1} is missing a part, or has no valid kind, form or who_pays` };
    options.push(opt);
  }
  const at = givenIds.findIndex(id => id === raw?.strongest_fit_id);
  const why = str(raw?.why_strongest);
  if (at < 0) return { set: null, problem: 'strongest_fit_id does not name one of the three options' };
  if (!why) return { set: null, problem: 'why_strongest is empty' };
  return { set: { options, strongest_fit_id: `o${at + 1}`, why_strongest: why }, problem: null };
}

function lengthProblem(field: string, text: string): string | null {
  const limit = LIMITS[field as keyof typeof LIMITS];
  if (!limit) return null;
  if (text.length > limit.chars) return `${field} is ${text.length} characters (at most ${limit.chars})`;
  if ('words' in limit && text.split(/\s+/).filter(Boolean).length > limit.words) return `${field} has more than ${limit.words} words`;
  if ('sentences' in limit && sentences(text).length > limit.sentences) return `${field} has ${sentences(text).length} sentences (at most ${limit.sentences})`;
  return null;
}

function voiceProblem(field: string, text: string, ctx: GenContext): string | null {
  const lower = text.toLowerCase();
  const label = REPORT_LABELS.find(l => lower.includes(l));
  if (label) return `${field} uses the report label "${label}"`;
  const internal = text.match(INTERNAL_TERMS);
  if (internal) return `${field} mentions "${internal[0]}", which is internal`;
  const third = thirdPersonWord(text, ctx.firstName);
  if (third) return `${field} speaks about the user in the third person ("${third}")`;
  if (hasFirstPerson(text)) return `${field} is written in the first person`;
  return null;
}

/**
 * Lengths, voice, weekly hours outside the starting point, and "what it is"
 * naming who pays, for one option (and why_strongest when it is the strongest fit).
 */
function optionProblems(o: StoredOption, ctx: GenContext, whyStrongest: string | null): string[] {
  const fields: Array<[string, string]> = PART_KEYS.map(k => [k, o[k] ?? '']);
  if (whyStrongest !== null) fields.push(['why_strongest', whyStrongest]);
  const problems = fields.flatMap(([field, text]) => {
    const p = lengthProblem(field, text) ?? voiceProblem(field, text, ctx)
      ?? (field !== 'starting_point' && mentionsCurrentHours(text, ctx.hoursNumbers) ? `${field} mentions their current weekly hours, which belong only in the starting point` : null);
    return p ? [`${o.id}: ${p}`] : [];
  });
  if (o.who_pays && !norm(o.what_it_is ?? '').includes(norm(o.who_pays))) {
    problems.push(`${o.id}: what_it_is does not name who pays ("${o.who_pays}")`);
  }
  const nameForm = nameFormProblem(o);
  if (nameForm) problems.push(`${o.id}: ${nameForm}`);
  // The start is this path's start, not their readiness, risk or hours again (brief item 3).
  if (!pathSpecificStartWords(o.starting_point, [o.name, o.what_it_is ?? '', o.what_it_looks_like], riskLines(ctx.card)).length) {
    problems.push(`${o.id}: starting_point only restates their readiness, risk or hours and says nothing specific to this path`);
  }
  return problems;
}

// The name matches the form (design doc, "Name"): a role with an employer is
// never named as consultancy or freelance work, and freelance work is never
// named as a staff job with an employer.
const INDEPENDENT_NAME = /\b(consult\w*|freelance\w*)\b/i;
const EMPLOYED_NAME = /\b(officer|employee|staff|in-house|salaried)\b/i;

function nameFormProblem(o: StoredOption): string | null {
  if ((o.form === 'current_employer' || o.form === 'new_employer') && INDEPENDENT_NAME.test(o.name)) {
    return `name "${o.name}" says consultancy or freelance work, but the form is ${o.form}`;
  }
  if (o.form === 'freelance' && EMPLOYED_NAME.test(o.name)) {
    return `name "${o.name}" reads as a staff job with an employer, but the form is freelance`;
  }
  return null;
}

function riskLines(card: SummaryCard): string[] {
  const r = card.risk;
  return [r.readiness, r.at_stake, r.limits, r.hours, r.deadline ?? ''];
}

// Two starting points sharing this much of their substance say the same thing.
const START_ALIKE = 0.5;

function startsAlike(options: StoredOption[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const a = options[i].starting_point;
      const b = options[j].starting_point;
      const share = Math.max(substanceShare(a, [b]), substanceShare(b, [a]));
      if (share >= START_ALIKE) out.push(`the starting points of ${options[i].id} and ${options[j].id} are too alike (${share.toFixed(2)}); each must describe the start of its own path`);
    }
  }
  return out;
}

/** Each part the third- or first-person check rejects, with the word and the full text, for the log. */
function voiceRejections(set: ParsedSet, ctx: GenContext): string[] {
  return set.options.flatMap(o => {
    const fields: Array<[string, string]> = PART_KEYS.map(k => [k, o[k] ?? '']);
    if (o.id === set.strongest_fit_id) fields.push(['why_strongest', set.why_strongest]);
    return fields.flatMap(([field, text]) => {
      const third = thirdPersonWord(text, ctx.firstName);
      const why = third ? `third person ("${third}")` : hasFirstPerson(text) ? 'first person' : null;
      return why ? [`${o.id}.${field} (${why}): ${JSON.stringify(text)}`] : [];
    });
  });
}

function kindProblem(options: StoredOption[], level: DirectionLevel): string | null {
  const count = (k: OptionKind) => options.filter(o => o.kind === k).length;
  const got = options.map(o => o.kind).join(', ');
  if (level === 'clear') return count('develops_direction') === 3 ? null : `the user has a clear direction, so all three must be develops_direction (got ${got})`;
  if (level === 'rough_specific') {
    return count('develops_direction') >= 1 && count('new_path') >= 1 && count('rebalance') === 0
      ? null
      : `the user's rough direction is specific enough to build on, so the options develop it in different forms and at least one is new_path, with no rebalance (got ${got})`;
  }
  if (count('new_path') < 2) return `at least two options must be new_path (got ${got})`;
  if (count('rebalance') > 1) return `at most one option may be rebalance (got ${got})`;
  if (level === 'none' && count('develops_direction') > 0) return `the user has no direction yet, so no option can be develops_direction (got ${got})`;
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function setProblems(set: ParsedSet, ctx: GenContext): string[] {
  const problems = set.options.flatMap(o => optionProblems(o, ctx, o.id === set.strongest_fit_id ? set.why_strongest : null));
  const kind = kindProblem(set.options, ctx.level);
  if (kind) problems.push(kind);
  problems.push(...startsAlike(set.options));
  for (const o of set.options) {
    if (ctx.notForMe.includes(norm(o.name))) problems.push(`${o.id}: "${o.name}" was marked not for me and must not return`);
  }
  return problems;
}

const ownRef = (ref: string) => /^Q\d+$/.test(ref) || ref.startsWith('m:');

/**
 * The option's refs that hold: a Q or m: source, a card item or a report
 * field (report.<key>) that contains the quote.
 */
function validRefs(o: StoredOption, ctx: GenContext): StoredOption['refs'] {
  const items = new Map([...ctx.card.must_haves, ...ctx.card.must_avoids].map(i => [i.id, i.text]));
  const report = reportFields(ctx.digest);
  return o.refs.filter(r => {
    const source = ownRef(r.ref) ? ctx.ownIndex.get(r.ref)
      : r.ref.startsWith('report.') ? report[r.ref.slice('report.'.length)]
        : items.get(r.ref);
    return !!source && quoteFound(r.quote, source);
  });
}

/** Evidence holds when the valid refs include at least one from the user's own words (design doc). */
const evidenceHolds = (refs: StoredOption['refs']) => refs.some(r => ownRef(r.ref));

/**
 * One generation: the set, one whole-set retry for structure, kinds, lengths
 * and voice together, then each option whose evidence fails gets one
 * replacement of its own, kept only if the replacement passes every check.
 */
async function generateSet(
  inputs: ReturnType<typeof buildInputs>,
  ctx: GenContext,
): Promise<{ set: ParsedSet; log: CheckLog } | null> {
  const started = Date.now();
  const log: CheckLog = { attempts: 1, problems_first: [], problems_kept: [], replaced: [], evidence_kept_failing: [], ms: 0, tokens: 0 };
  const base: ChatCompletionMessageParam[] = [
    { role: 'system', content: PATH_OPTIONS_PROMPT },
    { role: 'user', content: JSON.stringify(inputs) },
  ];
  const first = await chatJson(base, OPTIONS_TEMPERATURE, 'path options', PATH_OPTIONS_MODEL, ctx.conversationId);
  log.tokens += first.tokens;
  const a = parseSet(first.parsed, ctx.card);
  const aProblems = a.set ? setProblems(a.set, ctx) : [a.problem!];
  log.problems_first = aProblems;
  let set = a.set;
  let kept = aProblems;

  if (aProblems.length) {
    console.warn(`[path options] first set not usable as is; retrying once: ${aProblems.join('; ')}`);
    // The rejected text of every voice check that triggered this retry, so a
    // false positive (a "their" about other people) can be told from a real one.
    if (a.set) for (const r of voiceRejections(a.set, ctx)) console.warn(`[path options] voice check rejected ${r}`);
    log.attempts = 2;
    const retry = await chatJson([
      ...base,
      { role: 'assistant', content: JSON.stringify(first.parsed ?? {}) },
      { role: 'system', content: `Your options were not usable: ${aProblems.join('; ')}. Return the full JSON again with these fixed. Every other rule still applies.` },
    ], OPTIONS_TEMPERATURE, 'path options (retry)', PATH_OPTIONS_MODEL, ctx.conversationId);
    log.tokens += retry.tokens;
    const b = parseSet(retry.parsed, ctx.card);
    if (b.set) {
      set = b.set;
      kept = setProblems(b.set, ctx);
    } else {
      console.warn(`[path options] retry unusable (${b.problem}); ${a.set ? 'keeping the first set' : 'no set'}`);
    }
    if (kept.length) console.warn(`[path options] kept with problems: ${kept.join('; ')}`);
  }
  log.problems_kept = kept;
  if (!set) {
    log.ms = Date.now() - started;
    return null;
  }

  // Evidence (brief Part B item 7): invalid refs are dropped; an option with
  // none left gets one replacement.
  const withRefs = set.options.map(o => ({ ...o, refs: validRefs(o, ctx) }));
  const failing = withRefs.filter(o => !evidenceHolds(o.refs));
  let current: ParsedSet = { ...set, options: withRefs };
  if (failing.length) {
    const results = await Promise.all(failing.map(async f => {
      const keep = current.options.filter(o => o.id !== f.id).map(({ id, name, kind, form, what_it_is, what_it_looks_like, why_it_fits, starting_point, what_it_costs }) => ({ id, name, kind, form, what_it_is, what_it_looks_like, why_it_fits, starting_point, what_it_costs }));
      const r = await chatJson([
        ...base,
        { role: 'system', content: PATH_OPTION_REPLACE_NOTE },
        { role: 'user', content: JSON.stringify({ REPLACE: { id: f.id, kind: f.kind, strongest_fit: f.id === current.strongest_fit_id, reason: 'it has no quote, found word for word, from one of their answers or messages (a report quote alone is not enough)', previous: { name: f.name, why_it_fits: f.why_it_fits, refs: set!.options.find(o => o.id === f.id)?.refs ?? [] } }, KEEP: keep }) },
      ], OPTIONS_TEMPERATURE, 'path option replace', PATH_OPTIONS_MODEL, ctx.conversationId);
      return { f, r };
    }));
    for (const { f, r } of results) {
      log.tokens += r.tokens;
      const candidate = parseOption(r.parsed?.option, f.id, ctx.card);
      const isStrongest = f.id === current.strongest_fit_id;
      const why = isStrongest ? str(r.parsed?.why_strongest) || current.why_strongest : null;
      const problems = candidate
        ? [
            ...optionProblems(candidate, ctx, why),
            ...(candidate.kind !== f.kind ? [`kind changed from ${f.kind} to ${candidate.kind}`] : []),
            ...(candidate.form !== f.form ? [`form changed from ${f.form} to ${candidate.form}`] : []),
            ...(ctx.notForMe.includes(norm(candidate.name)) ? ['a not for me option returned'] : []),
            ...startsAlike(current.options.map(o => (o.id === f.id ? candidate : o))),
          ]
        : ['unusable output'];
      const refs = candidate ? validRefs(candidate, ctx) : [];
      if (candidate && evidenceHolds(refs) && !problems.length) {
        console.info(`[path options] ${f.id} replaced (evidence): "${f.name}" -> "${candidate.name}"`);
        log.replaced.push(`${f.id}: "${f.name}" -> "${candidate.name}"`);
        current = {
          ...current,
          options: current.options.map(o => (o.id === f.id ? { ...candidate, refs } : o)),
          ...(isStrongest && why && { why_strongest: why }),
        };
      } else {
        console.warn(`[path options] ${f.id} evidence failed and the replacement did not pass (${refs.length ? problems.join('; ') : 'no valid ref'}); kept "${f.name}"`);
        log.evidence_kept_failing.push(f.id);
      }
    }
  }
  log.ms = Date.now() - started;
  return { set: current, log };
}

/** Runs one generation for a row created by ensureOptionsGeneration. Never throws. */
export async function runOptionsGeneration(artifactId: string): Promise<void> {
  const supabase = createServiceClient();
  try {
    const { data: art, error } = await supabase.from('artifacts').select('id, user_id, conversation_id, status, content').eq('id', artifactId).single();
    if (error || !art) throw error ?? new Error('options row missing');
    if (art.status !== 'generating') return;
    const content = art.content as OptionsContent;
    const conversationId = art.conversation_id as string;
    const row = await getProfileRow(supabase, conversationId);
    const cardState = row?.summary as CardState | null;
    if (!row?.context_digest || !cardState?.card) throw new Error('no confirmed card');
    const digest = row.context_digest;
    const profile = withMetaDefaults(row.profile as PathProfile);
    // The deadline is no longer on the card (Miroslav, 2026-11-09); options
    // and their checks still take it from the profile, as before.
    const card: SummaryCard = { ...cardState.card, risk: { ...cardState.card.risk, deadline: riskDeadline(profile) } };
    const [stored, all, rows] = await Promise.all([
      loadUserSummary(supabase, art.user_id),
      listConversationMessages(supabase, conversationId),
      optionsRows(supabase, conversationId),
    ]);
    const summary = stored && isCurrentSummary(stored.summary) ? stored.summary : null;
    const ownIndex = ownIndexFor(digest, ownMessages(all));

    // Earlier rounds, each with the marks the user gave it.
    const marksFor = new Map<string, Record<string, OptionMark>>();
    for (const r of rows) if (r.content?.adjustment) marksFor.set(r.content.adjustment.from_artifact_id, r.content.adjustment.marks);
    const previous = rows
      .filter(r => r.status === 'ready' && r.content.options && r.content.round < content.round)
      .map(r => ({ round: r.content.round, options: r.content.options!, marks: marksFor.get(r.id) ?? {} }));
    const notForMe = previous.flatMap(p => p.options.filter(o => p.marks[o.id] === 'not_for_me').map(o => norm(o.name)));

    const ctx: GenContext = {
      digest, card, level: directionLevel(profile), firstName: firstNameOf(digest), ownIndex, notForMe, conversationId,
      hoursNumbers: card.risk.hours.match(/\d+/g) ?? [],
    };
    const inputs = buildInputs(digest, profile, card, summary, ownIndex, content.round, previous, content.adjustment);
    const result = await generateSet(inputs, ctx);
    if (!result) throw new Error('no usable options after the retry');

    const done: OptionsContent = {
      ...content,
      options: result.set.options,
      strongest_fit_id: result.set.strongest_fit_id,
      why_strongest: result.set.why_strongest,
      card_snapshot: card,
      summary_snapshot: summary,
      profile_snapshot: profile,
      model: PATH_OPTIONS_MODEL,
      checks: result.log,
    };
    // The message first: a round marked ready always has its message.
    await insertAssistantMessage(supabase, { id: conversationId, user_id: art.user_id }, optionsMessage(artifactId, done));
    const { error: upError } = await supabase.from('artifacts').update({ status: 'ready', content: done }).eq('id', artifactId).eq('status', 'generating');
    if (upError) throw upError;
    await addTokens(supabase, conversationId, result.log.tokens);
    console.info(`[path options] ${JSON.stringify({ conversation: conversationId, round: content.round, artifact: artifactId, ms: result.log.ms, tokens: result.log.tokens, attempts: result.log.attempts, kinds: result.set.options.map(o => o.kind), replaced: result.log.replaced, kept_problems: result.log.problems_kept })}`);
  } catch (error) {
    console.error(`[path options] generation ${artifactId} failed${isRateLimitError(error) ? ' (rate limit)' : ''}:`, error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', artifactId).eq('status', 'generating');
  }
}

// ── Messages ────────────────────────────────────────────────────────────────

const NONE_LABEL = 'Adjust these options';
const FEEDBACK_TEXT = 'What feels off? For each option, tell me whether it’s close or not for you, and add anything that would help me get closer.';
const NEW_ROUND_TEXT = 'Here are three new options, shaped by what you told me.';
// The what-to-do line above every round (design doc, "Say what to do").
const GUIDE_TEXT = 'Choose the option you want to build your plan on, or ask me to adjust them. You can add a note either way. After you choose, you’ll name your path, and then we’ll build the plan.';
const LAST_ROUND_TEXT = 'These are the last options in this session. Choose the one closest to what you want to build your plan on; you can add a note. After you choose, you’ll name your path, and then we’ll build the plan.';
const CHOICE_NOTE_PLACEHOLDER = 'Anything to keep in mind about this path? (Optional)';

function toView(o: StoredOption): PathOptionView {
  const { id, name, what_it_is, what_it_looks_like, why_it_fits, starting_point, what_it_costs } = o;
  return { id, name, ...(what_it_is && { what_it_is }), what_it_looks_like, why_it_fits, starting_point, what_it_costs };
}

function roundView(artifactId: string, c: OptionsContent): OptionsRoundView {
  const lastRound = c.round >= MAX_OPTIONS_ROUNDS;
  const intro = [...(c.round > 1 ? [NEW_ROUND_TEXT] : []), lastRound ? LAST_ROUND_TEXT : GUIDE_TEXT].join(' ');
  return {
    artifact_id: artifactId,
    round: c.round,
    intro,
    options: (c.options ?? []).map(toView),
    strongest_fit_id: c.strongest_fit_id ?? '',
    why_strongest: c.why_strongest ?? '',
    last_round: lastRound,
  };
}

/** The round as plain markdown, for read-back anywhere. */
function optionsMarkdown(view: OptionsRoundView): string {
  const intro = view.intro ? [view.intro] : [];
  const blocks = view.options.map(o => [
    `**${o.name}**${o.id === view.strongest_fit_id ? ' (Zyrro’s strongest fit)' : ''}`,
    ...(o.what_it_is ? [o.what_it_is] : []),
    `**What it would look like:** ${o.what_it_looks_like}`,
    `**Why it fits you:** ${o.why_it_fits}`,
    `**Starting point:** ${o.starting_point}`,
    `**What it would cost you:** ${o.what_it_costs}`,
    ...(o.id === view.strongest_fit_id ? [`**Why this one:** ${view.why_strongest}`] : []),
  ].join('\n\n'));
  return [...intro, ...blocks].join('\n\n');
}

function optionsMessage(artifactId: string, c: OptionsContent): AssistantMessage {
  const view = roundView(artifactId, c);
  const choices: ChatChoiceSet = {
    mode: 'groups',
    purpose: 'options',
    options_round: view,
    groups: [{
      id: 'pick',
      label: view.last_round ? 'Which one is closest?' : 'Which path do you choose?',
      mode: 'single',
      required: true,
      options: [
        ...view.options.map(o => ({ id: o.id, label: o.name })),
        ...(view.last_round ? [] : [{ id: 'none', label: NONE_LABEL }]),
      ],
    }],
    // Optional, with a choice (kept on path_choice) or with "Adjust these options".
    note: { placeholder: CHOICE_NOTE_PLACEHOLDER },
  };
  return { content: optionsMarkdown(view), choices };
}

function feedbackMessage(view: OptionsRoundView): AssistantMessage {
  return {
    content: FEEDBACK_TEXT,
    choices: {
      mode: 'groups',
      purpose: 'options_feedback',
      options_round: view,
      groups: view.options.map(o => ({
        id: o.id,
        label: o.name,
        mode: 'single' as const,
        required: false,
        options: [{ id: 'close', label: 'Close' }, { id: 'not_for_me', label: 'Not for me' }],
      })),
      note: { placeholder: 'What feels off, or what would be closer?', required_unless_picked: true },
    },
  };
}

/** Starts the Plan generation; a failure to start is logged, never fails the turn (/plan resumes it). */
async function startPlan(supabase: SupabaseClient, conversation: Pick<ConversationRow, 'id' | 'user_id'>): Promise<void> {
  try {
    await ensurePlanGeneration(supabase, conversation);
  } catch (err) {
    console.error(`[path plan] conversation ${conversation.id}: start failed; /plan will resume it:`, err);
  }
}

function endMessage(option: StoredOption, projectName: string | null | undefined): AssistantMessage {
  const title = projectName || option.name;
  return {
    content: [
      `**${title}**`,
      ...(projectName ? [option.name] : []),
      `**Starting point:** ${option.starting_point}`,
    ].join('\n\n'),
    // The page shows a code-owned "See your plan" button under this message
    // (brief 169-plan-page, decision 2).
    choices: null,
  };
}

// ── Naming (brief Part D item 2) ───────────────────────────────────────────

// The user's note with the choice goes into the description the prompt names
// from (PROJECT_NAME_PROMPT is shared with the current /path naming, so its
// input shape stays name and description).
async function suggestNames(option: StoredOption, note: string | null, conversationId: string): Promise<{ names: NameSuggestion[] | null; tokens: number }> {
  const description = [option.what_it_looks_like, option.starting_point, ...(note ? [`What they want to keep in mind about this path: ${note}`] : [])].join(' ');
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PROJECT_NAME_PROMPT },
    { role: 'user', content: JSON.stringify({ name: option.name, description }) },
  ];
  let tokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    // The newer models only accept their default temperature.
    const r = await chatJson(messages, undefined, 'path names', PATH_NAMES_MODEL, conversationId);
    tokens += r.tokens;
    const list = Array.isArray(r.parsed?.options) ? r.parsed.options : [];
    const names = list.flatMap((o, i) => {
      const x = o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
      const name = str(x?.name);
      const rationale = str(x?.rationale);
      return name && rationale ? [{ id: `n${i + 1}`, name, rationale }] : [];
    });
    if (names.length === 3 && list.length === 3) return { names, tokens };
    console.warn(`[path names] unusable suggestions (attempt ${attempt + 1})`);
  }
  return { names: null, tokens };
}

// ── The turns in the options and chosen phases ─────────────────────────────

const refuse = (status: number, error: string): TurnRun => ({ ok: false, status, error, tokens: 0 });

async function runOptionsPhaseTurn(ctx: TurnContext, row: PathProfileRow): Promise<TurnRun> {
  const { supabase, conversation, userMessage, recent } = ctx;
  const asked = [...recent].reverse().find(m => m.role === 'assistant');
  const choices = asked?.choices as ChatChoiceSet | null | undefined;
  if (!userMessage || !choices) return refuse(409, 'not_in_conversation');
  const ids = userMessage.selected_choice_ids ?? [];
  const note = userMessage.note?.trim() || null;

  try {
    if (row.phase === 'options' && choices.purpose === 'options' && choices.options_round) {
      const view = choices.options_round;
      const pick = ids.find(id => id.startsWith('pick:'))?.slice(5);
      if (pick === 'none') {
        if (view.last_round) return refuse(400, 'invalid_choice');
        return { ok: true, assistant: feedbackMessage(view), tokens: 0, commit: async () => {} };
      }
      const { data: art, error } = await supabase.from('artifacts').select('id, status, content')
        .eq('id', view.artifact_id).eq('conversation_id', conversation.id).eq('type', OPTIONS_TYPE).single();
      if (error || !art || art.status !== 'ready') return refuse(409, 'stale_choice');
      const content = art.content as OptionsContent;
      const option = content.options?.find(o => o.id === pick);
      if (!option) return refuse(400, 'invalid_choice');
      const choice: PathChoiceContent = {
        option,
        was_strongest_fit: option.id === content.strongest_fit_id,
        why_strongest: content.why_strongest ?? null,
        round: content.round,
        note,
      };
      const named = await suggestNames(option, note, conversation.id);
      const assistant: AssistantMessage = named.names
        ? {
            content: `You chose **${option.name}**. Here are three names you could give this path. Pick one, or skip and keep its descriptive name.`,
            choices: {
              mode: 'groups',
              purpose: 'naming',
              names: named.names,
              // A suggestion, the skip, or a name of their own as the note
              // (one of them; the typed name is checked in the naming turn).
              groups: [{
                id: 'name',
                label: 'Which name do you want for this path?',
                mode: 'single',
                required: false,
                options: [...named.names.map(n => ({ id: n.id, label: n.name })), { id: 'skip', label: 'Skip, keep the descriptive name' }],
              }],
              note: { placeholder: 'Or write your own', required_unless_picked: true },
            } satisfies ChatChoiceSet,
          }
        : endMessage(option, undefined);
      return {
        ok: true,
        assistant,
        tokens: named.tokens,
        commit: async () => {
          const { error: insError } = await supabase.from('artifacts').insert({
            user_id: conversation.user_id,
            conversation_id: conversation.id,
            type: CHOICE_TYPE,
            status: 'ready',
            path_options_artifact_id: view.artifact_id,
            content: choice,
          });
          if (insError) console.error('[path options] path_choice insert failed:', insError);
          const { error: phaseError } = await supabase.from('path_profiles').update({ phase: 'chosen' }).eq('conversation_id', conversation.id);
          if (phaseError) console.error('[path options] phase update failed:', phaseError);
          // No name suggestions: the conversation ends here, so the Plan starts now.
          if (!named.names) await startPlan(supabase, conversation);
          console.info(`[path options] conversation ${conversation.id}: chose ${option.id} "${option.name}" (round ${content.round}, strongest ${choice.was_strongest_fit}); names ${named.names ? 'offered' : 'unavailable'}`);
        },
      };
    }

    if (row.phase === 'options' && choices.purpose === 'options_feedback') {
      // At least one tap or a note (brief Part C item 1).
      if (!ids.length && !note) return refuse(400, 'note_required');
      // The next round starts after this commit (PATH_FLOW_TURN_CONFIG).
      return { ok: true, assistant: null, tokens: 0, commit: async () => {} };
    }

    if (row.phase === 'chosen' && choices.purpose === 'naming' && choices.names) {
      const pick = ids.find(id => id.startsWith('name:'))?.slice(5);
      let projectName: string | null | undefined;
      if (pick) {
        projectName = pick === 'skip' ? null : choices.names.find(n => n.id === pick)?.name;
      } else {
        // A name of their own: trimmed, at most 50 characters, no em or en dashes.
        if (!note || typedNameProblem(note)) return refuse(400, 'invalid_name');
        projectName = note.replace(/\s+/g, ' ').trim();
      }
      if (projectName === undefined) return refuse(400, 'invalid_choice');
      const current = await latestChoice(supabase, conversation.id);
      if (!current) return refuse(409, 'stale_choice');
      return {
        ok: true,
        assistant: endMessage(current.content.option, projectName),
        tokens: 0,
        commit: async () => {
          const { error } = await supabase.from('artifacts')
            .update({ content: { ...current.content, project_name: projectName } satisfies PathChoiceContent })
            .eq('id', current.id);
          if (error) console.error('[path options] project name save failed:', error);
          // The path is chosen and named (or naming skipped): the Plan
          // generation starts by itself (brief 169-plan-page, decision 1).
          await startPlan(supabase, conversation);
        },
      };
    }
    return refuse(409, 'stale_choice');
  } catch (error) {
    if (isRateLimitError(error)) return { ok: false, status: 503, error: 'busy', tokens: 0 };
    throw error;
  }
}

/**
 * The whole Path turn: the conversation and summary phases
 * (lib/path-conversation.ts), then options and chosen. A turn that ends with
 * no reply (the card confirmed, or "what feels off" answered) starts the due
 * options generation once its commit is done.
 */
export const PATH_FLOW_TURN_CONFIG: RunTurn = {
  ...PATH_TURN_CONFIG,
  run: async ctx => {
    let result = await PATH_TURN_CONFIG.run(ctx);
    if (!result.ok && result.error === 'not_in_conversation') {
      const row = await getProfileRow(ctx.supabase, ctx.conversation.id);
      if (row?.phase === 'options' || row?.phase === 'chosen') result = await runOptionsPhaseTurn(ctx, row);
    }
    if (!result.ok || result.assistant) return result;
    const inner = result.commit;
    return {
      ...result,
      commit: async saved => {
        await inner(saved);
        await ensureOptionsGeneration(ctx.supabase, ctx.conversation);
      },
    };
  },
};

// ── What the browser sees ───────────────────────────────────────────────────

export type OptionsStateView = {
  status: 'generating' | 'failed' | 'ready' | null;
  round: number | null;
  choice: { name: string; project_name: string | null | undefined; was_strongest_fit: boolean } | null;
};

// The "Your path" view on /path (Miroslav, 2026-11-09): the chosen option in
// full, and the other two options of the round it was chosen from.
export type ChosenPathView = {
  name: string;
  option: PathOptionView;
  was_strongest_fit: boolean;
  why_strongest: string | null;
  others: Array<{ option: PathOptionView; strongest: boolean }>;
};

/** The chosen path for read-back: no model call. Null before a path is chosen. */
export async function chosenPathView(supabase: SupabaseClient, conversationId: string): Promise<ChosenPathView | null> {
  const choice = await latestChoice(supabase, conversationId);
  if (!choice) return null;
  const { data: row, error } = await supabase.from('artifacts').select('path_options_artifact_id').eq('id', choice.id).single();
  if (error) throw error;
  const { data: round } = row?.path_options_artifact_id
    ? await supabase.from('artifacts').select('content').eq('id', row.path_options_artifact_id).single()
    : { data: null };
  const content = round?.content as OptionsContent | undefined;
  const c = choice.content;
  return {
    name: c.project_name || c.option.name,
    option: toView(c.option),
    was_strongest_fit: c.was_strongest_fit,
    why_strongest: c.why_strongest,
    others: (content?.options ?? []).filter(o => o.id !== c.option.id).map(o => ({ option: toView(o), strongest: o.id === content?.strongest_fit_id })),
  };
}

/** The options state for read-back: no model call. */
export async function optionsStateView(supabase: SupabaseClient, conversationId: string): Promise<OptionsStateView> {
  const [rows, choice] = await Promise.all([optionsRows(supabase, conversationId), latestChoice(supabase, conversationId)]);
  const latest = rows[rows.length - 1];
  return {
    status: (latest?.status as OptionsStateView['status']) ?? null,
    round: latest?.content?.round ?? null,
    choice: choice ? { name: choice.content.option.name, project_name: choice.content.project_name, was_strongest_fit: choice.content.was_strongest_fit } : null,
  };
}
