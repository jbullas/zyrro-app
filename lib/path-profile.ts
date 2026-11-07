// #168: the Path conversation profile, six items that fill in while the user
// talks (docs/framework/path-plan-redesign.md, "The profile"; brief
// docs/briefs/168-shorter-flow.md). Stored in path_profiles.profile, written
// only by the server. Every value coming from the model goes through the
// coerce functions below, so a malformed update is dropped rather than stored.
// Taps on code-owned choices are applied by code, never by the model.

export const ITEM_KEYS = [
  'opening_read',
  'pushing_now',
  'tried_before',
  'direction',
  'risk_time',
  'must_haves_avoids',
] as const;

export type ItemKey = typeof ITEM_KEYS[number];

// The items the conversation asks about, in order. Must-haves and must-avoids
// are derived by Zyrro and confirmed on the summary card, never asked. What
// they've tried before is context from the 13 answers only, never asked
// (brief 168-direction-and-card, Part A item 1).
export const ASKED_ITEMS = ['opening_read', 'pushing_now', 'direction', 'risk_time'] as const;
export type AskedItem = typeof ASKED_ITEMS[number];

// Items the model may update (opening_read and the tapped parts of risk_time are code's).
export const MODEL_ITEMS = ['pushing_now', 'direction', 'risk_time'] as const;
type ModelItem = typeof MODEL_ITEMS[number];

export type ItemStatus = 'known' | 'inferred' | 'missing' | 'confirmed' | 'not_known';
export type ItemSource = 'questionnaire' | 'report' | 'conversation';

const STATUSES: ItemStatus[] = ['known', 'inferred', 'missing', 'confirmed', 'not_known'];
const SOURCES: ItemSource[] = ['questionnaire', 'report', 'conversation'];

export type ReadVerdict = 'right' | 'partly' | 'not_quite';
export type Urgency = 'no_rush' | 'soon' | 'deadline';
export type DirectionKind = 'specific_idea' | 'rough_leaning' | 'no_idea';
// Design doc, "The profile" item 5 (revised 2026-11-06): concrete readiness choices, plus not sure yet.
export type Readiness = 'side' | 'reduce' | 'real_move' | 'unsure';
export type AtStake = 'income' | 'position' | 'location';
export type LimitKind = 'money' | 'family' | 'location' | 'commitments';

// Hours a week available now. The stored number is the lower end of the
// band, and never 0 (approved 2026-11-06).
export const HOURS_BANDS = [
  { id: 'under_3', label: 'Under 3 hours', hours: 2 },
  { id: '3_5', label: '3 to 5 hours', hours: 3 },
  { id: '6_10', label: '6 to 10 hours', hours: 6 },
  { id: '11_20', label: '11 to 20 hours', hours: 11 },
  { id: 'over_20', label: 'More than 20 hours', hours: 21 },
] as const;

export type EvidencedItem = {
  id: string;
  text: string;
  ref: string;
  quote: string;
  basis: 'stated' | 'inferred';
};

// The lines of the card's risk and time section.
export const RISK_FACT_LINES = ['readiness', 'at_stake', 'limits', 'hours', 'deadline'] as const;
export type RiskFactLine = typeof RISK_FACT_LINES[number];

// Something the user said, with the source it came from and the exact words
// that support it (checked in code against that source).
export type QuotedFact = { text: string; ref: string; quote: string };

export type Attempt = { what: string; why_it_stalled: string; ref: string; quote: string };

export type ItemValues = {
  // correction: the user's note when the read was partly or not quite right.
  // added_context: their note sent with "That's right": something added, not a
  // correction (brief 168-direction-and-card, Part B item 1).
  opening_read: { text: string; verdict: ReadVerdict | null; correction: string | null; added_context: string | null };
  pushing_now: { pressure: string; urgency: Urgency | null; deadline: string | null };
  // Attempts the 13 answers already describe, each quote-checked; quiet context
  // for the options, never asked and never on the card.
  tried_before: { attempts: Attempt[] };
  // description: their direction in their own words. aside: something they
  // named that belongs to their free time rather than where their life and work
  // are heading; recorded, but not the direction. specific_enough: call A's
  // judgement of whether the description can carry options (null: not given).
  direction: { kind: DirectionKind; description: string | null; aside: string | null; specific_enough: boolean | null };
  risk_time: {
    readiness: Readiness | null;
    at_stake: AtStake[];
    at_stake_unsure: boolean;
    limits: LimitKind[];
    no_limits: boolean;
    hours_band: string | null;
    hours_per_week: number | null;
    // What the user said that qualifies one card line, kept on that line only
    // (brief 168-direction-and-card, Part B items 3 and 4).
    line_facts: Partial<Record<RiskFactLine, QuotedFact>>;
  };
  must_haves_avoids: { must_haves: EvidencedItem[]; must_avoids: EvidencedItem[] };
};

export type ProfileItem<V> = {
  status: ItemStatus;
  value: V | null;
  source: ItemSource | null;
  refs: string[];
  in_their_words: string | null;
  // Follow-ups asked for this item: at most one (design doc, "When Zyrro has enough").
  follow_ups: number;
  // Direction only: its one follow-up has been answered, so it is settled
  // with whatever the user gave.
  follow_up_answered?: boolean;
};

// What the last assistant message asked for, so the next user message is
// read against it.
export type Asked =
  | { kind: 'open_read' }
  | { kind: 'item'; item: AskedItem }
  | { kind: 'follow_up'; item: AskedItem }
  | { kind: 'clarify'; item: AskedItem }
  | { kind: 'card' }
  | { kind: 'card_clarify' };

export type ProfileMeta = {
  // Sources (Q<n> answers, m:<id> user messages) Zyrro's messages have already
  // rested on. An idea resting only on these may come back only to connect it
  // to something new (no repetition, tracked by source rather than by label).
  used_refs: string[];
  // A contradiction call A found, waiting for its one clarifying question.
  pending_clarify: { item: AskedItem; text: string; refs: string[] } | null;
  // Must-haves and must-avoids the user removed on the card; never proposed again.
  removed_items: string[];
  last_asked: Asked | null;
};

export type PathProfile = { version: 2; meta: ProfileMeta } & { [K in ItemKey]: ProfileItem<ItemValues[K]> };

// ── Coercion ────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Checks code runs on what the model records as the user's words.
 * quote: the quote is found in that source (a Q answer or one of the user's
 * messages). userText: everything the user has typed in this conversation.
 */
export type EvidenceCheck = {
  quote: (ref: string, quote: string) => boolean;
  userText: string;
};

const FACT_TEXT_MAX = 240;
const MAX_ATTEMPTS = 4;

/** A { text, ref, quote } the model gave, kept only when the quote is in that source. */
function quotedFact(v: unknown, check: EvidenceCheck, label: string): QuotedFact | null {
  const o = obj(v);
  const text = str(o?.text);
  const ref = str(o?.ref);
  const quote = str(o?.quote);
  if (!text || !ref || !quote || text.length > FACT_TEXT_MAX || !check.quote(ref, quote)) {
    console.warn(`[path profile] ${label} dropped: ref ${ref ?? 'none'}, quote "${quote ?? ''}"`);
    return null;
  }
  return { text, ref, quote };
}

/** A phrase recorded as the user's own words: kept only when it is mostly their words. */
function theirWords(v: unknown, check: EvidenceCheck, label: string): string | null {
  const s = str(v);
  if (!s) return null;
  if (inUserWords(s, check.userText)) return s;
  console.warn(`[path profile] ${label} not in the user's words, dropped: "${s}"`);
  return null;
}

// Values the model may set. risk_time: only the facts that qualify a line; the
// tapped parts come from code and are kept as they are.
const COERCE: { [K in ModelItem]: (v: unknown, check: EvidenceCheck) => Record<string, unknown> | null } = {
  pushing_now(v) {
    const o = obj(v);
    const pressure = str(o?.pressure);
    if (!o || !pressure) return null;
    // A decision recorded with its term or date is a deadline (follow-up
    // brief, item 3): in a live run the seed wrote the renewal as the deadline
    // but labelled it "soon", so the card showed no deadline.
    const deadline = str(o.deadline);
    const urgency = deadline ? 'deadline' : oneOf(o.urgency, ['no_rush', 'soon', 'deadline'] as const);
    return { pressure, urgency, deadline };
  },
  direction(v, check) {
    const o = obj(v);
    const kind = oneOf(o?.kind, ['specific_idea', 'rough_leaning', 'no_idea'] as const);
    if (!kind) return null;
    return {
      kind,
      description: theirWords(o?.description, check, 'direction description'),
      aside: theirWords(o?.aside, check, 'direction aside'),
      specific_enough: typeof o?.specific_enough === 'boolean' ? o.specific_enough : null,
    };
  },
  risk_time(v, check) {
    const raw = obj(obj(v)?.line_facts);
    if (!raw) return null;
    // A line given as null clears it; a fact that fails its check is dropped.
    const facts: Partial<Record<RiskFactLine, QuotedFact | null>> = {};
    for (const line of RISK_FACT_LINES) {
      if (!(line in raw)) continue;
      if (raw[line] === null) { facts[line] = null; continue; }
      const fact = quotedFact(raw[line], check, `risk fact (${line})`);
      if (fact) facts[line] = fact;
    }
    return Object.keys(facts).length ? { line_facts: facts } : null;
  },
};

export function emptyItem<V>(): ProfileItem<V> {
  return { status: 'missing', value: null, source: null, refs: [], in_their_words: null, follow_ups: 0 };
}

export function emptyRiskTime(): ItemValues['risk_time'] {
  return {
    readiness: null, at_stake: [], at_stake_unsure: false, limits: [], no_limits: false,
    hours_band: null, hours_per_week: null, line_facts: {},
  };
}

function emptyMeta(): ProfileMeta {
  return { used_refs: [], pending_clarify: null, removed_items: [], last_asked: null };
}

export function emptyProfile(): PathProfile {
  const profile = { version: 2, meta: emptyMeta() } as unknown as PathProfile;
  for (const key of ITEM_KEYS) (profile as Record<string, unknown>)[key] = emptyItem();
  return profile;
}

/** A stored profile with any meta field it predates filled in (rows saved before the follow-up brief). */
export function withMetaDefaults(profile: PathProfile): PathProfile {
  const meta = { ...emptyMeta(), ...(profile.meta ?? {}) } as ProfileMeta & { stated_themes?: unknown };
  delete meta.stated_themes;
  if (!Array.isArray(meta.used_refs)) meta.used_refs = [];
  return { ...profile, meta };
}

// in_their_words is a short phrase for the options to echo; a whole message is not.
const MAX_QUOTE_WORDS = 25;
function shortQuote(v: unknown): string | null {
  const s = str(v);
  return s && s.split(/\s+/).length <= MAX_QUOTE_WORDS ? s : null;
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(w => w.length > 2);
}

/** Most of the phrase's words appear in what the user wrote. */
export function inUserWords(phrase: string, userText: string): boolean {
  const said = new Set(words(userText));
  const ws = words(phrase);
  return ws.length > 0 && ws.filter(w => said.has(w)).length / ws.length >= 0.8;
}

// Second-person words a card line adds when it speaks to the user; the user
// wrote "I" and "my" (too short to count) in their place.
const SECOND_PERSON = new Set(['you', 'your', 'yours', 'yourself', "you're", "you've", "you'd", "you'll"]);

/** A second-person restatement that is still mostly the user's own words. */
export function inUserWordsAsYou(phrase: string, userText: string): boolean {
  const said = new Set(words(userText));
  const ws = words(phrase).filter(w => !SECOND_PERSON.has(w));
  return ws.length > 0 && ws.filter(w => said.has(w)).length / ws.length >= 0.8;
}

// ── Seeding (design doc, "Where each item comes from") ─────────────────────

/**
 * The seed call's output, with the design doc's fixed rules applied in code:
 * only what's pushing them can start known; direction and risk and time are
 * asked (their refs kept as hints); what they've tried is context from the
 * answers only, each attempt kept only when its quote is found in the answer
 * it cites. The opening read is written by the first message.
 */
export function seedProfile(raw: unknown, check: EvidenceCheck): PathProfile {
  const p = emptyProfile();
  const r = obj(raw) ?? {};
  const hints = (key: string) => strList(obj(r[key])?.refs);

  const pushing = obj(r.pushing_now);
  const pushingValue = COERCE.pushing_now(pushing?.value, check) as ItemValues['pushing_now'] | null;
  if (pushingValue) {
    p.pushing_now = {
      ...emptyItem(),
      status: oneOf(pushing?.status, ['known', 'inferred'] as const) ?? 'inferred',
      value: pushingValue,
      source: oneOf(pushing?.source, SOURCES) ?? 'questionnaire',
      refs: hints('pushing_now'),
      in_their_words: shortQuote(pushing?.in_their_words),
    };
  } else {
    p.pushing_now = { ...emptyItem(), refs: hints('pushing_now') };
  }

  // Open seeding of attempts counted things that were not attempts (step 3
  // live runs), so each one now needs an answer ref and an exact quote.
  const attempts: Attempt[] = [];
  const rawAttempts = obj(obj(r.tried_before)?.value)?.attempts;
  for (const a of Array.isArray(rawAttempts) ? rawAttempts : []) {
    const o = obj(a);
    const what = str(o?.what);
    const ref = str(o?.ref);
    const quote = str(o?.quote);
    if (!what || what.length > FACT_TEXT_MAX || !ref || !/^Q\d+$/.test(ref) || !quote || !check.quote(ref, quote)) {
      console.warn(`[path seed] attempt dropped: ref ${ref ?? 'none'}, quote "${quote ?? ''}"`);
      continue;
    }
    // Design doc, profile item 3: what they tried "and why it didn't stick".
    // How it fell short must be in the user's words too, in the same answer:
    // live runs counted a project that went well, and invented a shortfall to
    // fit, when it was only the attempt that was checked.
    const why = str(o?.why_it_stalled);
    const whyQuote = str(o?.why_quote);
    if (!why || why.length > FACT_TEXT_MAX || !whyQuote || !check.quote(ref, whyQuote)) {
      console.warn(`[path seed] attempt dropped: how it fell short not found in ${ref} ("${whyQuote ?? ''}"): ${what}`);
      continue;
    }
    attempts.push({ what, why_it_stalled: why, ref, quote });
  }
  const kept = attempts.slice(0, MAX_ATTEMPTS);
  p.tried_before = kept.length
    ? { ...emptyItem(), status: 'known', value: { attempts: kept }, source: 'questionnaire', refs: [...new Set(kept.map(a => a.ref))] }
    : { ...emptyItem(), status: 'not_known' };

  // A leaning or a wish is not a direction (step 3 live runs): always asked.
  p.direction = { ...emptyItem(), refs: hints('direction') };
  p.risk_time = { ...emptyItem(), refs: hints('risk_time') };
  p.opening_read = { ...emptyItem(), refs: [] };
  return p;
}

// ── Updates from the conversation ───────────────────────────────────────────

/**
 * Model updates, applied with code deciding statuses: an item the user was
 * just asked about is confirmed by their answer (or not_known if they said
 * so); any other item becomes inferred unless already confirmed. Only the
 * MODEL_ITEMS are accepted; risk_time only takes the facts that qualify its
 * lines. Words recorded as the user's are checked against what they wrote.
 */
export function applyProfileUpdates(
  profile: PathProfile,
  updates: unknown,
  answered: AskedItem[],
  check: EvidenceCheck,
): { profile: PathProfile; changed: ItemKey[] } {
  const next = structuredClone(profile);
  const changed: ItemKey[] = [];
  if (!Array.isArray(updates)) return { profile: next, changed };

  for (const raw of updates) {
    const u = obj(raw);
    const item = oneOf(u?.item, MODEL_ITEMS);
    let status = oneOf(u?.status, STATUSES);
    if (!u || !item || !status) continue;
    const current = next[item] as ProfileItem<unknown>;
    const isAnswered = (answered as readonly string[]).includes(item);
    if (isAnswered) {
      if (status === 'known' || status === 'inferred') status = 'confirmed';
    } else {
      status = current.status === 'confirmed' || current.status === 'not_known' ? current.status : 'inferred';
    }

    let value: unknown = current.value;
    if (status !== 'not_known' && u.value !== undefined && u.value !== null) {
      const coerced = COERCE[item](u.value, check);
      if (!coerced) continue; // malformed value: drop this update
      if (item === 'risk_time') {
        const base = { ...emptyRiskTime(), ...((current.value as ItemValues['risk_time'] | null) ?? {}) };
        const facts: Record<string, QuotedFact | null> = { ...(base.line_facts ?? {}), ...(coerced.line_facts as Record<string, QuotedFact | null>) };
        for (const k of Object.keys(facts)) if (!facts[k]) delete facts[k];
        value = { ...base, line_facts: facts };
      } else {
        value = coerced;
      }
    }
    // risk_time's status is decided by its taps, not by a free-text update.
    if (item === 'risk_time') status = current.status === 'missing' && value ? 'inferred' : current.status;
    if ((status === 'confirmed' || status === 'known' || status === 'inferred') && value === null) continue;
    // Not knowing risk and time is never a model call: those are tapped.
    if (item === 'risk_time' && status === 'not_known') continue;

    const quote = shortQuote(u.in_their_words);
    const updated: ProfileItem<unknown> = {
      ...current,
      status,
      value,
      source: status === 'not_known' ? current.source : 'conversation',
      in_their_words: quote && inUserWords(quote, check.userText) ? quote : current.in_their_words,
    };
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      (next as Record<string, unknown>)[item] = updated;
      if (!changed.includes(item)) changed.push(item);
    }
  }
  return { profile: next, changed };
}

// ── Taps on code-owned choices ─────────────────────────────────────────────

const pickedIn = (ids: string[], group: string) =>
  ids.filter(id => id.startsWith(`${group}:`)).map(id => id.slice(group.length + 1));

/** The note sent with an opening-read tap is added context (true) or a correction. */
export function openingNoteIsContext(ids: string[]): boolean {
  return pickedIn(ids, 'read')[0] === 'right';
}

/**
 * The opening read's verdict (and urgency, when it was asked), plus the
 * user's note: sent with "That's right" it is added context; with "Partly" or
 * "Not quite" it is their correction (brief 168-direction-and-card, Part B item 1).
 */
export function applyOpeningReadTap(profile: PathProfile, ids: string[], note: string | null): PathProfile {
  const p = structuredClone(profile);
  const verdict = oneOf(pickedIn(ids, 'read')[0], ['right', 'partly', 'not_quite'] as const);
  const read = p.opening_read.value;
  if (verdict && read) {
    const isContext = openingNoteIsContext(ids);
    p.opening_read = {
      ...p.opening_read,
      status: verdict === 'right' || note ? 'confirmed' : p.opening_read.status,
      value: {
        ...read,
        verdict,
        correction: !isContext && note ? note : read.correction ?? null,
        added_context: isContext && note ? note : read.added_context ?? null,
      },
      source: 'conversation',
    };
  }
  const urgency = oneOf(pickedIn(ids, 'urgency')[0], ['no_rush', 'soon', 'deadline'] as const);
  if (urgency && p.pushing_now.value) {
    p.pushing_now = {
      ...p.pushing_now,
      value: { ...p.pushing_now.value, urgency },
      source: 'conversation',
    };
  }
  // The user saw what's pushing them in the read and answered it.
  if (verdict && p.pushing_now.value?.urgency) p.pushing_now.status = 'confirmed';
  return p;
}

/** A typed answer to the opening read's follow-up: their words are the correction. */
export function applyOpeningReadFollowUp(profile: PathProfile, text: string): PathProfile {
  const p = structuredClone(profile);
  const read = p.opening_read.value;
  if (read) p.opening_read = { ...p.opening_read, status: 'confirmed', value: { ...read, correction: text }, source: 'conversation' };
  if (p.pushing_now.value?.urgency && p.pushing_now.status !== 'not_known') p.pushing_now.status = 'confirmed';
  return p;
}

export function applyRiskTimeTap(profile: PathProfile, ids: string[]): PathProfile {
  const p = structuredClone(profile);
  const v = { ...emptyRiskTime(), ...(p.risk_time.value ?? {}) };
  const readiness = oneOf(pickedIn(ids, 'readiness')[0], ['side', 'reduce', 'real_move', 'unsure'] as const);
  if (readiness) v.readiness = readiness;
  const stake = pickedIn(ids, 'at_stake');
  if (stake.length) {
    v.at_stake_unsure = stake.includes('unsure');
    v.at_stake = v.at_stake_unsure ? [] : stake.filter((s): s is AtStake => ['income', 'position', 'location'].includes(s));
  }
  const limits = pickedIn(ids, 'limits');
  if (limits.length) {
    v.no_limits = limits.includes('none');
    v.limits = v.no_limits ? [] : limits.filter((s): s is LimitKind => ['money', 'family', 'location', 'commitments'].includes(s));
  }
  const band = HOURS_BANDS.find(b => b.id === pickedIn(ids, 'hours')[0]);
  if (band) { v.hours_band = band.id; v.hours_per_week = band.hours; }
  p.risk_time = { ...p.risk_time, value: v, source: 'conversation' };
  if (valueSettles('risk_time', v)) p.risk_time.status = 'confirmed';
  return p;
}

/**
 * The direction tap: whether they have a sense of the direction they want to
 * move in. The note is what it is, in their own words; call A then decides
 * whether it is specific enough, or something other than the direction.
 */
export function applyDirectionTap(profile: PathProfile, ids: string[], note: string | null): PathProfile {
  const p = structuredClone(profile);
  const kind = DIRECTION_TAPS[pickedIn(ids, 'direction')[0] as keyof typeof DIRECTION_TAPS];
  if (!kind) return p;
  const prev = p.direction.value;
  const value = { kind, description: note ?? prev?.description ?? null, aside: prev?.aside ?? null, specific_enough: null };
  p.direction = { ...p.direction, value, source: 'conversation', status: valueSettles('direction', value) ? 'confirmed' : 'inferred' };
  return p;
}

/**
 * After call A in the conversation, once the direction has been tapped: the
 * tapped kind stands. Call A's description, aside and judgement are taken when
 * it returned the direction; a description that failed the words check falls
 * back to what the user wrote, unless call A placed it aside as not the
 * direction. On other turns (directionTurn false) the judgement and status
 * stay as they were, so a later turn can't reopen the question.
 */
export function keepDirectionKind(profile: PathProfile, before: PathProfile, modelChanged: boolean, directionTurn: boolean): PathProfile {
  const prev = before.direction.value;
  if (!prev) return profile;
  const m = modelChanged ? profile.direction.value : null;
  const value: ItemValues['direction'] = m
    ? {
        kind: prev.kind,
        description: m.description ?? (m.aside ? null : prev.description),
        aside: m.aside ?? prev.aside,
        specific_enough: directionTurn ? m.specific_enough : prev.specific_enough,
      }
    : prev;
  return {
    ...profile,
    direction: directionTurn
      ? { ...profile.direction, value, source: 'conversation', status: valueSettles('direction', value) ? 'confirmed' : 'inferred' }
      : { ...before.direction, value },
  };
}

// ── The "enough" rule (design doc, "When Zyrro has enough") ────────────────

function valueSettles(item: ItemKey, value: unknown): boolean {
  switch (item) {
    case 'opening_read': {
      const v = value as ItemValues['opening_read'] | null;
      return !!v && (v.verdict === 'right' || (!!v.verdict && !!v.correction));
    }
    case 'pushing_now': {
      const v = value as ItemValues['pushing_now'] | null;
      return !!v?.pressure && !!v.urgency;
    }
    case 'tried_before': return true;
    // A clear or rough direction needs their words, judged specific enough to
    // build options on (no judgement counts as not yet judged, so the one
    // follow-up still comes); "not yet" is a full answer.
    case 'direction': {
      const v = value as ItemValues['direction'] | null;
      return !!v && (v.kind === 'no_idea' || (!!v.description && v.specific_enough === true));
    }
    case 'risk_time': {
      const v = value as ItemValues['risk_time'] | null;
      return !!v && !!v.readiness && (v.at_stake.length > 0 || v.at_stake_unsure)
        && (v.limits.length > 0 || v.no_limits) && v.hours_per_week !== null;
    }
    case 'must_haves_avoids': return true;
  }
}

export function isItemComplete(profile: PathProfile, item: ItemKey): boolean {
  const it = profile[item] as ProfileItem<unknown>;
  if (it.status === 'not_known') return true;
  if (it.follow_up_answered && it.value) return true;
  if (it.status === 'confirmed' || it.status === 'known') return valueSettles(item, it.value);
  return false;
}

export function openItems(profile: PathProfile): AskedItem[] {
  return ASKED_ITEMS.filter(k => !isItemComplete(profile, k));
}

export function isProfileComplete(profile: PathProfile): boolean {
  return openItems(profile).length === 0;
}

/**
 * After the user answered `item`: if it still isn't settled, the first time
 * it gets its one follow-up. The second time, direction is settled with
 * whatever the user gave (its level is tapped, so it is known); any other item
 * is marked not known.
 */
export function settleAnswered(profile: PathProfile, item: AskedItem): PathProfile {
  if (isItemComplete(profile, item)) return profile;
  const p = structuredClone(profile);
  const it = p[item] as ProfileItem<unknown>;
  if (it.follow_ups >= 1) {
    (p as Record<string, unknown>)[item] = item === 'direction' && it.value
      ? { ...it, status: 'confirmed', follow_up_answered: true }
      : { ...it, status: 'not_known' };
  } else {
    (p as Record<string, unknown>)[item] = { ...it, follow_ups: 1 };
  }
  return p;
}

/**
 * What the next question is about, in plain words, for the reply. Worded as
 * a person would say it, so none of it reads as Zyrro's internal workings if
 * the reply echoes it.
 */
export function stillNeeded(profile: PathProfile, item: AskedItem): string {
  const it = profile[item] as ProfileItem<unknown>;
  switch (item) {
    case 'opening_read':
      return 'what Zyrro got wrong about them, in their own words';
    case 'pushing_now': {
      const v = it.value as ItemValues['pushing_now'] | null;
      if (!v) return 'what is pushing them to change now';
      return 'whether anything forces a decision, and by when';
    }
    case 'direction': {
      const v = it.value as ItemValues['direction'] | null;
      if (v && v.kind !== 'no_idea') {
        return 'the direction they want their life and work to move in, concretely enough to build options on, in their own words; the question may also ask whether they have tried it and what got in the way';
      }
      return 'whether they have a sense of the direction they want their life and work to move in from here, as opposed to how they spend their free time; the attached choices ask it, and the note lets them say what it is';
    }
    case 'risk_time':
      return 'what they can change now, what they would risk, what is off the table and how much time they have; the attached choices ask each of these';
  }
}

export function isPathProfile(v: unknown): v is PathProfile {
  const o = obj(v);
  return !!o && o.version === 2 && !!obj(o.meta) && ITEM_KEYS.every(k => !!obj(o[k]));
}

// ── Labels shown on the summary card and in choices ────────────────────────

// Brief 168-followup, Part A items 4 and 10: words people say, and readiness
// choices that say concretely what changes.
export const READINESS_LABELS: Record<Readiness, string> = {
  side: 'Explore alongside my current work, nothing changes yet',
  reduce: 'Change my current setup: fewer hours or a different role',
  real_move: 'Leave or make a big change: a new job, field or way of life',
  unsure: 'Not sure yet',
};
export const AT_STAKE_LABELS: Record<AtStake | 'unsure', string> = {
  income: 'Some income',
  position: 'My current position',
  location: 'Where I live',
  unsure: 'Not sure yet',
};
export const LIMIT_LABELS: Record<LimitKind | 'none', string> = {
  money: 'Money',
  family: 'Family',
  location: 'Where I live',
  commitments: 'Other commitments',
  none: 'Nothing is off the table',
};
// The same answers on the summary card, which speaks to the user in the
// second person throughout (follow-up brief, item 9). Tap labels above are
// written from the user's side.
export const READINESS_CARD_LABELS: Record<Readiness, string> = {
  side: 'Explore alongside your current work, nothing changes yet',
  reduce: 'Change your current setup: fewer hours or a different role',
  real_move: 'Leave or make a big change: a new job, field or way of life',
  unsure: 'Not sure yet',
};
export const AT_STAKE_CARD_LABELS: Record<AtStake | 'unsure', string> = {
  income: 'Some income',
  position: 'Your current position',
  location: 'Where you live',
  unsure: 'Not sure yet',
};
export const LIMIT_CARD_LABELS: Record<LimitKind | 'none', string> = {
  money: 'Money',
  family: 'Family',
  location: 'Where you live',
  commitments: 'Other commitments',
  none: 'Nothing is off the table',
};

// Brief 168-direction-and-card, Part A item 2: the tap ids and stored kinds
// are unchanged; the words are new.
export const DIRECTION_TAPS = { specific: 'specific_idea', rough: 'rough_leaning', not_yet: 'no_idea' } as const;
export const DIRECTION_LABELS: Record<keyof typeof DIRECTION_TAPS, string> = {
  specific: 'Yes, a clear one',
  rough: 'A rough sense',
  not_yet: 'Not yet',
};
export const DIRECTION_QUESTION = 'Do you have a sense of the direction you want to move in?';
export const DIRECTION_NOTE_PLACEHOLDER = 'If you have one, what is it?';
export const DIRECTION_CARD_LABELS: Record<DirectionKind, string> = {
  specific_idea: 'A clear direction',
  rough_leaning: 'A rough sense',
  no_idea: 'Not yet',
};
// Code-owned card line after "Not yet" (approved at step 0, 2026-11-07); shown
// as "Not yet. Your options will start from your strengths."
export const NOT_YET_LINE = 'Your options will start from your strengths.';
