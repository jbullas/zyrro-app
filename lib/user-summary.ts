import type { SupabaseClient } from '@supabase/supabase-js';
import { inUserWords, type DrainSource, type PathProfile, type SignatureReaction } from '@/lib/path-profile';

// #168 step 3b: the living user summary (docs/framework/path-plan-redesign.md,
// "Living user summary"). One per user in public.user_summaries, server-only.
// Rewritten on every update, never appended to; fixed sections, each capped,
// and a cap on the whole. Every entry points at its evidence with refs:
//   Q<n>            a questionnaire answer
//   report.<field>  a field of the Identity report digest
//   m:<message id>  one of the user's messages
// Refs are checked against what actually exists, and resolved into short
// excerpts before the reply is written, so the reply can use the user's words.

export type PatternStatus = 'proposed' | 'confirmed' | 'corrected' | 'rejected' | 'draining';

export type SummaryPattern = {
  signature: string;
  status: PatternStatus;
  how_it_shows_up: string;
  user_words: string | null;
  drain_source: DrainSource | null;
  refs: string[];
};

export type SummaryNote = { text: string; refs: string[]; confirmed_by_user: boolean };

export type UserSummary = {
  schema_version: 1;
  confirmed_patterns: SummaryPattern[];
  tensions: SummaryNote[];
  connections: SummaryNote[];
  tried: Array<{ what: string; why_it_stalled: string; refs: string[] }>;
  pushing: { text: string; urgency: 'no_rush' | 'soon' | 'deadline' | null; deadline: string | null; refs: string[] } | null;
  direction: { kind: 'specific_idea' | 'rough_leaning' | 'no_idea' | null; text: string | null; refs: string[] };
  open_questions: string[];
};

// ── Caps ────────────────────────────────────────────────────────────────────

export const SUMMARY_CAPS = {
  patterns: 5,
  tensions: 3,
  connections: 5,
  tried: 4,
  open_questions: 3,
  entry_chars: 220,
  open_question_chars: 160,
  single_chars: 300,
  total_tokens: 1800,
} as const;

// Rough token count for JSON (about four characters per token).
export function approxTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

// ── Evidence index ──────────────────────────────────────────────────────────

export type RefIndex = Map<string, string>;

export function buildRefIndex(input: {
  answers: Array<{ number: number; answer: string }>;
  reportFields: Record<string, string>;
  userMessages: Array<{ id: string; content: string }>;
}): RefIndex {
  const index: RefIndex = new Map();
  for (const a of input.answers) if (a.answer.trim()) index.set(`Q${a.number}`, a.answer.trim());
  for (const [key, text] of Object.entries(input.reportFields)) if (text.trim()) index.set(`report.${key}`, text.trim());
  for (const m of input.userMessages) index.set(`m:${m.id}`, m.content);
  return index;
}

// How much of each source the reply sees. The sources that carry the user's
// own words get more room: the report's evidence for a signature opens with
// the general pattern and only later quotes the user, so a short cut kept
// exactly the generic part (live runs, step 3b).
function excerptChars(ref: string): number {
  if (ref.startsWith('report.signature_evidence.')) return 1400;
  if (/^Q\d+$/.test(ref)) return 900;
  if (ref.startsWith('m:')) return 600;
  return 320;
}

function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max)}…`;
}

/** Every ref the reply will see, resolved to an excerpt of its source. */
export function resolveExcerpts(refs: Iterable<string>, index: RefIndex): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ref of refs) {
    const text = index.get(ref);
    if (text && !(ref in out)) out[ref] = excerpt(text, excerptChars(ref));
  }
  return out;
}

export function summaryRefs(summary: UserSummary): Set<string> {
  const refs = new Set<string>();
  const add = (rs: string[]) => rs.forEach(r => refs.add(r));
  summary.confirmed_patterns.forEach(p => add(p.refs));
  summary.tensions.forEach(n => add(n.refs));
  summary.connections.forEach(n => add(n.refs));
  summary.tried.forEach(t => add(t.refs));
  if (summary.pushing) add(summary.pushing.refs);
  add(summary.direction.refs);
  return refs;
}

// ── Validation ──────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function emptySummary(): UserSummary {
  return {
    schema_version: 1,
    confirmed_patterns: [],
    tensions: [],
    connections: [],
    tried: [],
    pushing: null,
    direction: { kind: null, text: null, refs: [] },
    open_questions: [],
  };
}

export type SummaryValidationContext = {
  index: RefIndex;
  signatureNames: string[];
  ownTexts: string[];            // everything the user wrote: answers and messages
  allowConfirmedByUser: boolean; // only once a reflection has actually been settled
  previous: UserSummary | null;
};

/**
 * The model's summary, cleaned: refs that don't exist removed, entries without
 * evidence or over length dropped (and logged), lists capped, user words kept
 * only if the user wrote them. Null if it is still over the total cap, so the
 * caller keeps the previous version.
 */
export function validateSummary(raw: unknown, ctx: SummaryValidationContext): { summary: UserSummary; dropped: string[] } | null {
  const o = obj(raw);
  if (!o) return null;
  const dropped: string[] = [];
  const refsOf = (v: unknown) => [...new Set(list(v).map(str).filter((r): r is string => !!r && ctx.index.has(r)))];
  const ownWords = (v: unknown) => {
    const s = str(v);
    return s && ctx.ownTexts.some(t => inUserWords(s, t)) ? s : null;
  };
  const fits = (s: string | null, max: number, what: string) => {
    if (s && s.length <= max) return true;
    dropped.push(`${what}: ${s ? `over ${max} chars` : 'empty'}`);
    return false;
  };

  // A signature line must rest on this user's evidence: their answers, their
  // messages, or the report's evidence for that signature (drawn from their
  // answers). Report summary lines alone read as generic.
  const userEvidence = (r: string) => /^Q\d+$/.test(r) || r.startsWith('m:') || r.startsWith('report.signature_evidence.');
  const patterns: SummaryPattern[] = [];
  for (const name of ctx.signatureNames) {
    const p = list(o.confirmed_patterns).map(obj).find(x => str(x?.signature)?.toLowerCase() === name.toLowerCase());
    const how = str(p?.how_it_shows_up);
    const refs = refsOf(p?.refs);
    if (p && how && fits(how, SUMMARY_CAPS.entry_chars, `pattern ${name}`) && refs.some(userEvidence)) {
      patterns.push({ signature: name, status: 'proposed', how_it_shows_up: how, user_words: ownWords(p.user_words), drain_source: null, refs });
    } else {
      if (p && !refs.some(userEvidence)) dropped.push(`pattern ${name}: no user evidence in refs`);
      const prev = ctx.previous?.confirmed_patterns.find(x => x.signature === name);
      if (prev) patterns.push(prev);
    }
  }

  const notes = (key: 'tensions' | 'connections', max: number): SummaryNote[] =>
    list(o[key]).flatMap(n => {
      const no = obj(n);
      const text = str(no?.text);
      const refs = refsOf(no?.refs);
      if (!fits(text, SUMMARY_CAPS.entry_chars, key)) return [];
      if (!refs.length) { dropped.push(`${key}: no valid refs`); return []; }
      return [{ text: text!, refs, confirmed_by_user: ctx.allowConfirmedByUser && no?.confirmed_by_user === true }];
    }).slice(0, max);

  const tried = list(o.tried).flatMap(t => {
    const to = obj(t);
    const what = str(to?.what);
    const why = str(to?.why_it_stalled) ?? '';
    const refs = refsOf(to?.refs);
    if (!fits(what, SUMMARY_CAPS.entry_chars, 'tried') || why.length > SUMMARY_CAPS.entry_chars) return [];
    if (!refs.length) { dropped.push('tried: no valid refs'); return []; }
    return [{ what: what!, why_it_stalled: why, refs }];
  }).slice(0, SUMMARY_CAPS.tried);

  const po = obj(o.pushing);
  const pushingText = str(po?.text);
  const pushing = pushingText && pushingText.length <= SUMMARY_CAPS.single_chars
    ? {
        text: pushingText,
        urgency: (['no_rush', 'soon', 'deadline'] as const).find(u => u === po?.urgency) ?? null,
        deadline: str(po?.deadline),
        refs: refsOf(po?.refs),
      }
    : ctx.previous?.pushing ?? null;

  const dob = obj(o.direction);
  const directionText = str(dob?.text);
  const direction = {
    kind: (['specific_idea', 'rough_leaning', 'no_idea'] as const).find(k => k === dob?.kind) ?? null,
    text: directionText && directionText.length <= SUMMARY_CAPS.single_chars ? directionText : null,
    refs: refsOf(dob?.refs),
  };

  const open_questions = list(o.open_questions)
    .map(str)
    .filter((q): q is string => !!q && q.length <= SUMMARY_CAPS.open_question_chars)
    .slice(0, SUMMARY_CAPS.open_questions);

  const summary: UserSummary = {
    schema_version: 1,
    confirmed_patterns: patterns.slice(0, SUMMARY_CAPS.patterns),
    tensions: notes('tensions', SUMMARY_CAPS.tensions),
    connections: notes('connections', SUMMARY_CAPS.connections),
    tried,
    pushing,
    direction,
    open_questions,
  };
  if (approxTokens(summary) > SUMMARY_CAPS.total_tokens) {
    console.warn(`[user summary] rewrite over the ${SUMMARY_CAPS.total_tokens}-token cap (${approxTokens(summary)}); keeping the previous version`);
    return null;
  }
  if (dropped.length) console.warn(`[user summary] dropped: ${dropped.join('; ')}`);
  return { summary, dropped };
}

/**
 * The profile decides each signature's status, drain source and the user's
 * reason; the summary only adds how it shows up. Keeps the two from drifting.
 */
export function syncPatterns(summary: UserSummary, profile: PathProfile): UserSummary {
  const STATUS: Record<SignatureReaction, PatternStatus> = {
    unreacted: 'proposed',
    confirmed: 'confirmed',
    corrected: 'corrected',
    rejected: 'rejected',
    draining: 'draining',
  };
  const signatures = profile.pattern_confirmation.value?.signatures ?? [];
  return {
    ...summary,
    confirmed_patterns: summary.confirmed_patterns.map(p => {
      const s = signatures.find(x => x.name === p.signature);
      if (!s) return p;
      return {
        ...p,
        status: STATUS[s.reaction],
        drain_source: s.reaction === 'draining' ? s.drain_source : null,
        user_words: s.correction ?? p.user_words,
      };
    }),
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export type StoredSummary = { summary: UserSummary; version: number };

export async function loadUserSummary(supabase: SupabaseClient, userId: string): Promise<StoredSummary | null> {
  const { data, error } = await supabase.from('user_summaries').select('summary, version').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as StoredSummary | null) ?? null;
}

/**
 * Inserts (expectedVersion null) or rewrites the user's summary. A rewrite
 * names the version it was built from; if another write got there first it
 * changes nothing and returns false.
 */
export async function writeUserSummary(
  supabase: SupabaseClient,
  userId: string,
  summary: UserSummary,
  expectedVersion: number | null,
  updatedBy: 'path_seed' | 'path_turn',
  conversationId: string | null,
): Promise<boolean> {
  if (expectedVersion === null) {
    const { error } = await supabase.from('user_summaries')
      .insert({ user_id: userId, summary, version: 1, updated_by: updatedBy, conversation_id: conversationId });
    if (error?.code === '23505') return false;
    if (error) throw error;
    return true;
  }
  const { data, error } = await supabase.from('user_summaries')
    .update({ summary, version: expectedVersion + 1, updated_by: updatedBy, conversation_id: conversationId })
    .eq('user_id', userId)
    .eq('version', expectedVersion)
    .select('version');
  if (error) throw error;
  return (data ?? []).length === 1;
}
