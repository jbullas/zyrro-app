import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvidencedItem, PathProfile } from '@/lib/path-profile';

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
// Schema 2 (shorter flow): no signature section. Tensions and connections
// carry a short theme label, which code uses to track what the conversation
// has already said. Must-haves and must-avoids are copied in from the profile
// by code, never written by the model here.

export type SummaryNote = { theme: string; text: string; refs: string[]; confirmed_by_user: boolean };

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
  theme_chars: 60,
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

/** The quote appears in the source (ignoring case, spacing and punctuation), and is at least three words. */
export function quoteFound(quote: string, source: string): boolean {
  const q = normalizeForQuote(quote);
  if (q.split(' ').filter(Boolean).length < MIN_QUOTE_WORDS) return false;
  return ` ${normalizeForQuote(source)} `.includes(` ${q} `);
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
    const text = typeof o?.text === 'string' ? o.text.trim() : '';
    const ref = typeof o?.ref === 'string' ? o.ref.trim() : '';
    const quote = typeof o?.quote === 'string' ? o.quote.trim() : '';
    const basis = o?.basis === 'stated' ? 'stated' : 'inferred';
    if (!text || text.length > SUMMARY_CAPS.entry_chars) { dropped.push(`${prefix}: empty or too long`); continue; }
    if (removedSet.has(normalizeForQuote(text))) { dropped.push(`${prefix}: removed by user: ${text}`); continue; }
    if (!/^Q\d+$/.test(ref) && !ref.startsWith('m:')) { dropped.push(`${prefix}: ref not the user's own words (${ref}): ${text}`); continue; }
    const source = ownIndex.get(ref);
    if (!source) { dropped.push(`${prefix}: ref does not resolve (${ref}): ${text}`); continue; }
    if (!quoteFound(quote, source)) { dropped.push(`${prefix}: quote not in ${ref}: "${quote}"`); continue; }
    if (items.some(i => normalizeForQuote(i.text) === normalizeForQuote(text))) continue;
    items.push({ id: '', text, ref, quote, basis });
  }
  return {
    items: items.slice(0, SUMMARY_CAPS.must_items).map((item, i) => ({ ...item, id: `${prefix}${i + 1}` })),
    dropped,
  };
}

/** The summary's must-haves and must-avoids always mirror the profile's. */
export function syncMustItems(summary: UserSummary, profile: PathProfile): UserSummary {
  const v = profile.must_haves_avoids.value;
  const strip = (items: EvidencedItem[] = []) => items.map(({ text, basis }) => ({ text, basis }));
  return { ...summary, must_haves: strip(v?.must_haves), must_avoids: strip(v?.must_avoids) };
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
  // Notes the user has confirmed in a reflection, by theme; only these may be confirmed_by_user.
  confirmedThemes: string[];
  previous: UserSummary | null;
};

/**
 * The model's summary, cleaned: refs that don't exist removed, entries without
 * evidence or over length dropped (and logged), lists capped. Must-haves and
 * must-avoids are left for syncMustItems. Null if still over the total cap, so
 * the caller keeps the previous version.
 */
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

  const ro = obj(o.confirmed_read);
  const readText = str(ro?.text);
  const confirmed_read = readText && fits(readText, SUMMARY_CAPS.single_chars, 'confirmed_read')
    ? { text: readText, refs: refsOf(ro?.refs) }
    : ctx.previous?.confirmed_read ?? null;

  const confirmed = new Set(ctx.confirmedThemes.map(t => t.toLowerCase()));
  const notes = (key: 'tensions' | 'connections', max: number): SummaryNote[] =>
    list(o[key]).flatMap(n => {
      const no = obj(n);
      const text = str(no?.text);
      const theme = str(no?.theme);
      const refs = refsOf(no?.refs);
      if (!fits(text, SUMMARY_CAPS.entry_chars, key)) return [];
      if (!theme || theme.length > SUMMARY_CAPS.theme_chars) { dropped.push(`${key}: missing or long theme`); return []; }
      if (!refs.length) { dropped.push(`${key}: no valid refs`); return []; }
      return [{ theme, text: text!, refs, confirmed_by_user: confirmed.has(theme.toLowerCase()) }];
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
