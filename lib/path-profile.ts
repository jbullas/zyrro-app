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
// are derived by Zyrro and confirmed on the summary card, never asked.
export const ASKED_ITEMS = ['opening_read', 'pushing_now', 'tried_before', 'direction', 'risk_time'] as const;
export type AskedItem = typeof ASKED_ITEMS[number];

// Items the model may update (opening_read and the tapped parts of risk_time are code's).
export const MODEL_ITEMS = ['pushing_now', 'tried_before', 'direction', 'risk_time'] as const;
type ModelItem = typeof MODEL_ITEMS[number];

export type ItemStatus = 'known' | 'inferred' | 'missing' | 'confirmed' | 'not_known';
export type ItemSource = 'questionnaire' | 'report' | 'conversation';

const STATUSES: ItemStatus[] = ['known', 'inferred', 'missing', 'confirmed', 'not_known'];
const SOURCES: ItemSource[] = ['questionnaire', 'report', 'conversation'];

export type ReadVerdict = 'right' | 'partly' | 'not_quite';
export type Urgency = 'no_rush' | 'soon' | 'deadline';
export type DirectionKind = 'specific_idea' | 'rough_leaning' | 'no_idea';
export type Readiness = 'side' | 'reduce' | 'real_move';
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

export type ItemValues = {
  opening_read: { text: string; verdict: ReadVerdict | null; correction: string | null };
  pushing_now: { pressure: string; urgency: Urgency | null; deadline: string | null };
  tried_before: { attempts: Array<{ what: string; why_it_stalled: string }>; never_tried: boolean };
  direction: { kind: DirectionKind; description: string | null };
  risk_time: {
    readiness: Readiness | null;
    at_stake: AtStake[];
    at_stake_unsure: boolean;
    limits: LimitKind[];
    no_limits: boolean;
    limits_detail: string | null;
    hours_band: string | null;
    hours_per_week: number | null;
    // What the user said that qualifies their readiness, risk or time
    // (for exploring now, not a lasting commitment, and the like).
    qualifier: string | null;
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
  // Theme labels already stated or confirmed in the conversation (no repetition).
  stated_themes: string[];
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

// Values the model may set. risk_time: only the free-text parts; the tapped
// parts come from code and are kept as they are.
const COERCE: { [K in ModelItem]: (v: unknown) => Partial<ItemValues[K]> | null } = {
  pushing_now(v) {
    const o = obj(v);
    const pressure = str(o?.pressure);
    if (!o || !pressure) return null;
    return { pressure, urgency: oneOf(o.urgency, ['no_rush', 'soon', 'deadline'] as const), deadline: str(o.deadline) };
  },
  tried_before(v) {
    const o = obj(v);
    if (!o) return null;
    const attempts = Array.isArray(o.attempts)
      ? o.attempts.flatMap(a => {
          const ao = obj(a);
          const what = str(ao?.what);
          return what ? [{ what, why_it_stalled: str(ao?.why_it_stalled) ?? '' }] : [];
        })
      : [];
    const never_tried = o.never_tried === true;
    return attempts.length || never_tried ? { attempts, never_tried } : null;
  },
  direction(v) {
    const o = obj(v);
    const kind = oneOf(o?.kind, ['specific_idea', 'rough_leaning', 'no_idea'] as const);
    return kind ? { kind, description: str(o?.description) } : null;
  },
  risk_time(v) {
    const o = obj(v);
    if (!o) return null;
    const out: Partial<ItemValues['risk_time']> = {};
    const detail = str(o.limits_detail);
    const qualifier = str(o.qualifier);
    if (detail) out.limits_detail = detail;
    if (qualifier) out.qualifier = qualifier;
    return Object.keys(out).length ? out : null;
  },
};

export function emptyItem<V>(): ProfileItem<V> {
  return { status: 'missing', value: null, source: null, refs: [], in_their_words: null, follow_ups: 0 };
}

export function emptyRiskTime(): ItemValues['risk_time'] {
  return {
    readiness: null, at_stake: [], at_stake_unsure: false, limits: [], no_limits: false,
    limits_detail: null, hours_band: null, hours_per_week: null, qualifier: null,
  };
}

export function emptyProfile(): PathProfile {
  const profile = {
    version: 2,
    meta: { stated_themes: [], pending_clarify: null, removed_items: [], last_asked: null },
  } as unknown as PathProfile;
  for (const key of ITEM_KEYS) (profile as Record<string, unknown>)[key] = emptyItem();
  return profile;
}

// in_their_words is a short phrase for the options to echo; a whole message is not.
const MAX_QUOTE_WORDS = 25;
function shortQuote(v: unknown): string | null {
  const s = str(v);
  return s && s.split(/\s+/).length <= MAX_QUOTE_WORDS ? s : null;
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(w => w.length > 2);
}

/** Most of the phrase's words appear in what the user wrote. */
export function inUserWords(phrase: string, userText: string): boolean {
  const said = new Set(words(userText));
  const ws = words(phrase);
  return ws.length > 0 && ws.filter(w => said.has(w)).length / ws.length >= 0.8;
}

// ── Seeding (design doc, "Where each item comes from") ─────────────────────

/**
 * The seed call's output, with the design doc's fixed rules applied in code:
 * only what's pushing them can start known; everything else is asked (its
 * refs kept as hints). The opening read is written by the first message.
 */
export function seedProfile(raw: unknown): PathProfile {
  const p = emptyProfile();
  const r = obj(raw) ?? {};
  const hints = (key: string) => strList(obj(r[key])?.refs);

  const pushing = obj(r.pushing_now);
  const pushingValue = COERCE.pushing_now(pushing?.value) as ItemValues['pushing_now'] | null;
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
  // Always asked openly: seeding kept counting things that were not attempts,
  // and a leaning or a wish is not a direction (step 3 live runs).
  p.tried_before = { ...emptyItem(), refs: hints('tried_before') };
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
 * MODEL_ITEMS are accepted; risk_time only takes its free-text parts.
 */
export function applyProfileUpdates(
  profile: PathProfile,
  updates: unknown,
  answered: AskedItem[],
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
      const coerced = COERCE[item](u.value);
      if (!coerced) continue; // malformed value: drop this update
      value = item === 'risk_time'
        ? { ...(current.value as ItemValues['risk_time'] | null ?? emptyRiskTime()), ...coerced }
        : coerced;
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
      in_their_words: quote ?? current.in_their_words,
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

/** The opening read's verdict (and urgency, when it was asked), plus the user's note as their correction. */
export function applyOpeningReadTap(profile: PathProfile, ids: string[], note: string | null): PathProfile {
  const p = structuredClone(profile);
  const verdict = oneOf(pickedIn(ids, 'read')[0], ['right', 'partly', 'not_quite'] as const);
  const read = p.opening_read.value;
  if (verdict && read) {
    p.opening_read = {
      ...p.opening_read,
      status: verdict === 'right' || note ? 'confirmed' : p.opening_read.status,
      value: { ...read, verdict, correction: note ?? read.correction },
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
  const v = { ...(p.risk_time.value ?? emptyRiskTime()) };
  const readiness = oneOf(pickedIn(ids, 'readiness')[0], ['side', 'reduce', 'real_move'] as const);
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
    case 'tried_before': return !!value;
    // An idea or a leaning needs describing; "no idea" is complete as it is.
    case 'direction': {
      const v = value as ItemValues['direction'] | null;
      return !!v && (v.kind === 'no_idea' || !!v.description);
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
 * it gets its one follow-up; the second time it is marked not known.
 */
export function settleAnswered(profile: PathProfile, item: AskedItem): PathProfile {
  if (isItemComplete(profile, item)) return profile;
  const p = structuredClone(profile);
  const it = p[item] as ProfileItem<unknown>;
  if (it.follow_ups >= 1) {
    (p as Record<string, unknown>)[item] = { ...it, status: 'not_known' };
  } else {
    (p as Record<string, unknown>)[item] = { ...it, follow_ups: 1 };
  }
  return p;
}

/** What an open item still needs, in plain words, for the reply. */
export function stillNeeded(profile: PathProfile, item: AskedItem): string {
  const it = profile[item] as ProfileItem<unknown>;
  switch (item) {
    case 'opening_read':
      return 'what is off about Zyrro\'s read of them, in their own words';
    case 'pushing_now': {
      const v = it.value as ItemValues['pushing_now'] | null;
      if (!v) return 'what is pushing them to change now, and whether anything forces a decision';
      return 'whether anything forces a decision, and by when';
    }
    case 'tried_before':
      return 'what they have actually tried before to change things, and what got in the way';
    case 'direction': {
      const v = it.value as ItemValues['direction'] | null;
      if (v && v.kind !== 'no_idea' && !v.description) return 'what the idea or leaning actually is, in their words';
      return 'where they want to go: a specific idea, a rough leaning, or no idea yet';
    }
    case 'risk_time':
      return 'their hard limits, asked directly; code attaches choices for the change they are ready to make now, what they would put at risk, their hard limits, and the hours a week they have for this now';
  }
}

export function isPathProfile(v: unknown): v is PathProfile {
  const o = obj(v);
  return !!o && o.version === 2 && !!obj(o.meta) && ITEM_KEYS.every(k => !!obj(o[k]));
}

// ── Labels shown on the summary card and in choices ────────────────────────

export const READINESS_LABELS: Record<Readiness, string> = {
  side: 'Explore it on the side',
  reduce: 'Reduce what I do now',
  real_move: 'Make a real move',
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
  location: 'Location',
  commitments: 'Other commitments',
  none: 'Nothing off the table',
};
