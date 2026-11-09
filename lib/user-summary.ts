import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvidencedItem, PathProfile } from '@/lib/path-profile';
import { leansOnEarlier, swapToSecondPerson } from '@/lib/path-text-checks';

// #168: the living user summary (docs/framework/path-plan-redesign.md,
// "Living user summary"). One per user in public.user_summaries, server-only.
// Rewritten on every update, never appended to; fixed sections, each capped,
// and a cap on the whole. Every entry points at its evidence with refs:
//   Q<n>            a questionnaire answer
//   report.<field>  a field of the Identity report digest
//   m:<message id>  one of the user's messages
// Refs are checked against what actually exists, and resolved into short
// excerpts before the reply is written, so the reply can use the user's words.
//
// Schema 2 (shorter flow): no signature section. Must-haves and must-avoids
// are copied in from the profile by code, never written by the model here.
// What the conversation has already said is tracked by source refs in the
// profile (meta.used_refs), not by labels on these notes (follow-up brief).

export type SummaryNote = { text: string; refs: string[]; confirmed_by_user: boolean };

/** The user's own sources among refs: questionnaire answers and their messages. */
export function sourceRefs(refs: Iterable<string>): string[] {
  return [...new Set([...refs].filter(r => /^Q\d+$/.test(r) || r.startsWith('m:')))];
}

export const SUMMARY_SECTIONS = ['confirmed_read', 'tensions', 'connections', 'tried', 'pushing', 'direction', 'open_questions'] as const;

/**
 * Call A returns only the sections that changed (follow-up brief, speed). The
 * candidate is the previous summary with those sections replaced; it is then
 * validated as a whole, like a full rewrite.
 */
export function mergeSummaryChanges(previous: UserSummary, changes: unknown): Record<string, unknown> | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const c = changes as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...previous };
  for (const key of SUMMARY_SECTIONS) if (key in c && c[key] !== undefined) merged[key] = c[key];
  return merged;
}

export type UserSummary = {
  schema_version: 2;
  confirmed_read: { text: string; refs: string[] } | null;
  tensions: SummaryNote[];
  connections: SummaryNote[];
  tried: Array<{ what: string; why_it_stalled: string; refs: string[] }>;
  pushing: { text: string; urgency: 'no_rush' | 'soon' | 'deadline' | null; deadline: string | null; refs: string[] } | null;
  direction: { kind: 'specific_idea' | 'rough_leaning' | 'no_idea' | null; text: string | null; refs: string[] };
  must_haves: Array<{ text: string; basis: 'stated' | 'inferred' }>;
  must_avoids: Array<{ text: string; basis: 'stated' | 'inferred' }>;
  open_questions: string[];
};

// ── Caps ────────────────────────────────────────────────────────────────────

export const SUMMARY_CAPS = {
  tensions: 3,
  connections: 4,
  tried: 4,
  must_items: 5,
  open_questions: 3,
  // The prompt asks for 400; this is the safety net (live runs ran slightly
  // over and the confirmed read was lost).
  read_chars: 600,
  entry_chars: 240,
  open_question_chars: 160,
  single_chars: 400,
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
  for (const m of input.userMessages) if (m.content.trim()) index.set(`m:${m.id}`, m.content);
  return index;
}

// How much of each source the reply sees: the user's own words get more room.
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
  if (summary.confirmed_read) add(summary.confirmed_read.refs);
  summary.tensions.forEach(n => add(n.refs));
  summary.connections.forEach(n => add(n.refs));
  summary.tried.forEach(t => add(t.refs));
  if (summary.pushing) add(summary.pushing.refs);
  add(summary.direction.refs);
  return refs;
}

// ── Must-haves and must-avoids: evidence quotes ────────────────────────────

function normalizeForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_QUOTE_WORDS = 3;
// A stated item's quote is what the card shows, so a short item ("being
// invisible") is its own evidence; three words dropped such items once the
// quote became the text (brief 168-card-items, step 4).
const MIN_STATED_QUOTE_WORDS = 2;

/** The quote appears in the source (ignoring case, spacing and punctuation), and is at least three words (or minWords). */
export function quoteFound(quote: string, source: string, minWords = MIN_QUOTE_WORDS): boolean {
  const q = normalizeForQuote(quote);
  if (q.split(' ').filter(Boolean).length < minWords) return false;
  return ` ${normalizeForQuote(source)} `.includes(` ${q} `);
}

/**
 * The stretch of the source the quote matched, in the user's own spelling and
 * punctuation (the quote check ignores case and punctuation, so the model's
 * copy can differ from what they wrote). Whole words of the source, with
 * sentence punctuation trimmed from the ends. Null when the quote isn't found.
 */
export function quoteSpan(quote: string, source: string): string | null {
  const q = normalizeForQuote(quote).split(' ').filter(Boolean);
  if (!q.length) return null;
  const tokens = source.split(/\s+/).filter(Boolean);
  // Each normalized word of the source, with the token it came from.
  const words: Array<{ w: string; t: number }> = [];
  tokens.forEach((tok, t) => normalizeForQuote(tok).split(' ').filter(Boolean).forEach(w => words.push({ w, t })));
  for (let i = 0; i + q.length <= words.length; i++) {
    if (!q.every((w, k) => words[i + k].w === w)) continue;
    const span = tokens.slice(words[i].t, words[i + q.length - 1].t + 1).join(' ');
    return span.replace(/^[“"‘'(]+/, '').replace(/[.,;:!?”")]+$/, '').trim() || null;
  }
  return null;
}

/**
 * A stated item's text (brief 168-card-items, fix 1): the user's own words
 * from the quote, with only their first person turned to "you". Never the
 * model's wording, and never the third-person swap: "they" in a user's quote
 * is about someone else.
 */
export function statedItemText(quote: string, source: string): string | null {
  const span = quoteSpan(quote, source);
  return span ? swapToSecondPerson(span, false) : null;
}

/**
 * Call A's (or the seed's) must-haves or must-avoids, kept only when the ref
 * is a questionnaire answer or one of the user's own messages that exists, and
 * the quote is found in that source. Items the user removed on the card are
 * dropped too. Ids are assigned here, in order (prefix h or a).
 */
export function validateEvidenced(
  raw: unknown,
  ownIndex: RefIndex,
  prefix: 'h' | 'a',
  removed: string[],
): { items: EvidencedItem[]; dropped: string[] } {
  const dropped: string[] = [];
  const removedSet = new Set(removed.map(normalizeForQuote));
  const items: EvidencedItem[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const o = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    const modelText = typeof o?.text === 'string' ? o.text.trim() : '';
    const ref = typeof o?.ref === 'string' ? o.ref.trim() : '';
    const quote = typeof o?.quote === 'string' ? o.quote.trim() : '';
    let basis: EvidencedItem['basis'] = o?.basis === 'stated' ? 'stated' : 'inferred';
    if (basis === 'inferred' && (!modelText || modelText.length > SUMMARY_CAPS.entry_chars)) { dropped.push(`${prefix}: empty or too long`); continue; }
    if (!/^Q\d+$/.test(ref) && !ref.startsWith('m:')) { dropped.push(`${prefix}: ref not the user's own words (${ref}): ${modelText || quote}`); continue; }
    const source = ownIndex.get(ref);
    if (!source) { dropped.push(`${prefix}: ref does not resolve (${ref}): ${modelText || quote}`); continue; }
    if (!quoteFound(quote, source, basis === 'stated' ? MIN_STATED_QUOTE_WORDS : MIN_QUOTE_WORDS)) { dropped.push(`${prefix}: quote not in ${ref}: "${quote}"`); continue; }
    // A stated item is the user's words (brief 168-card-items, fix 1): its
    // text is the quote with only the pronouns swapped. A quote over the item
    // cap is dropped, never cut. A quote that leans on something earlier
    // can't stand on the card (decision 2): the item becomes inferred and
    // shows Zyrro's wording, which every item carries.
    let text = modelText;
    if (basis === 'stated') {
      const span = quoteSpan(quote, source);
      const leans = span ? leansOnEarlier(span) : null;
      if (span && leans) {
        if (!modelText || modelText.length > SUMMARY_CAPS.entry_chars) { dropped.push(`${prefix}: stated quote leans (${leans}) and no usable wording of Zyrro's: "${quote}"`); continue; }
        console.info(`[path items] stated quote leans on something earlier (${leans}), shown as inferred: quote "${span}", text "${modelText}"`);
        basis = 'inferred';
      } else {
        text = span ? swapToSecondPerson(span, false) : '';
        if (!text) { dropped.push(`${prefix}: stated quote not placed in ${ref}: "${quote}"`); continue; }
        if (text.length > SUMMARY_CAPS.entry_chars) { dropped.push(`${prefix}: stated quote over ${SUMMARY_CAPS.entry_chars} chars (${text.length}): "${quote}"`); continue; }
      }
    }
    if (removedSet.has(normalizeForQuote(text))) { dropped.push(`${prefix}: removed by user: ${text}`); continue; }
    if (items.some(i => normalizeForQuote(i.text) === normalizeForQuote(text))) continue;
    items.push({ id: '', text, ref, quote, basis });
  }
  return {
    items: items.slice(0, SUMMARY_CAPS.must_items).map((item, i) => ({ ...item, id: `${prefix}${i + 1}` })),
    dropped,
  };
}

/**
 * The summary's must-haves and must-avoids, and what they've tried, always
 * mirror the profile's. Tried comes only from quote-checked attempts in the
 * 13 answers (brief 168-direction-and-card, Part A item 1).
 */
export function syncFromProfile(summary: UserSummary, profile: PathProfile): UserSummary {
  const v = profile.must_haves_avoids.value;
  const strip = (items: EvidencedItem[] = []) => items.map(({ text, basis }) => ({ text, basis }));
  const tried = (profile.tried_before.value?.attempts ?? []).map(a => ({ what: a.what, why_it_stalled: a.why_it_stalled, refs: [a.ref] }));
  return { ...summary, tried, must_haves: strip(v?.must_haves), must_avoids: strip(v?.must_avoids) };
}

// ── Validation ──────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function emptySummary(): UserSummary {
  return {
    schema_version: 2,
    confirmed_read: null,
    tensions: [],
    connections: [],
    tried: [],
    pushing: null,
    direction: { kind: null, text: null, refs: [] },
    must_haves: [],
    must_avoids: [],
    open_questions: [],
  };
}

export function isCurrentSummary(v: unknown): v is UserSummary {
  return obj(v)?.schema_version === 2;
}

export type SummaryValidationContext = {
  index: RefIndex;
  // Sources of the reflection the user confirmed; only a note sharing one of
  // them may be confirmed_by_user.
  confirmedRefs: string[];
  previous: UserSummary | null;
};

/**
 * The model's summary, cleaned: refs that don't exist removed, entries without
 * evidence or over length dropped (and logged), lists capped. Must-haves and
 * must-avoids (and what they've tried) are left for syncFromProfile. Null if still over the total cap, so
 * the caller keeps the previous version.
 */
/** Text over max cut back to the whole sentences that fit; null if not even the first one does. */
function sentencesWithin(text: string | null, max: number, log: string[]): string | null {
  if (!text || text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  log.push(`confirmed_read: over ${max} chars, cut to ${out.trim().length}`);
  return out.trim() || null;
}

export function validateSummary(raw: unknown, ctx: SummaryValidationContext): { summary: UserSummary; dropped: string[] } | null {
  const o = obj(raw);
  if (!o) return null;
  const dropped: string[] = [];
  const refsOf = (v: unknown) => [...new Set(list(v).map(str).filter((r): r is string => !!r && ctx.index.has(r)))];
  const fits = (s: string | null, max: number, what: string) => {
    if (s && s.length <= max) return true;
    dropped.push(`${what}: ${s ? `over ${max} chars` : 'empty'}`);
    return false;
  };

  // An over-long confirmed read is cut back to whole sentences rather than
  // lost: live runs kept writing it over the cap, so the confirmed read (and
  // what the user added to it, written first) never reached the summary.
  const ro = obj(o.confirmed_read);
  const readText = sentencesWithin(str(ro?.text), SUMMARY_CAPS.read_chars, dropped);
  const confirmed_read = readText && fits(readText, SUMMARY_CAPS.read_chars, 'confirmed_read')
    ? { text: readText, refs: refsOf(ro?.refs) }
    : ctx.previous?.confirmed_read ?? null;

  const confirmed = new Set(sourceRefs(ctx.confirmedRefs));
  const notes = (key: 'tensions' | 'connections', max: number): SummaryNote[] =>
    list(o[key]).flatMap(n => {
      const no = obj(n);
      const text = str(no?.text);
      const refs = refsOf(no?.refs);
      if (!fits(text, SUMMARY_CAPS.entry_chars, key)) return [];
      if (!refs.length) { dropped.push(`${key}: no valid refs`); return []; }
      // Decided by code from the confirmed reflection's sources, never by the model's flag.
      return [{ text: text!, refs, confirmed_by_user: refs.some(r => confirmed.has(r)) }];
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
  // As in the profile: a recorded deadline makes the urgency a deadline.
  const pushingDeadline = str(po?.deadline);
  const pushing = pushingText && pushingText.length <= SUMMARY_CAPS.single_chars
    ? {
        text: pushingText,
        urgency: pushingDeadline ? 'deadline' as const : (['no_rush', 'soon', 'deadline'] as const).find(u => u === po?.urgency) ?? null,
        deadline: pushingDeadline,
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
    schema_version: 2,
    confirmed_read,
    tensions: notes('tensions', SUMMARY_CAPS.tensions),
    connections: notes('connections', SUMMARY_CAPS.connections),
    tried,
    pushing,
    direction,
    must_haves: ctx.previous?.must_haves ?? [],
    must_avoids: ctx.previous?.must_avoids ?? [],
    open_questions,
  };
  if (approxTokens(summary) > SUMMARY_CAPS.total_tokens) {
    console.warn(`[user summary] rewrite over the ${SUMMARY_CAPS.total_tokens}-token cap (${approxTokens(summary)}); keeping the previous version`);
    return null;
  }
  if (dropped.length) console.warn(`[user summary] dropped: ${dropped.join('; ')}`);
  return { summary, dropped };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export type StoredSummary = { summary: unknown; version: number };

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
