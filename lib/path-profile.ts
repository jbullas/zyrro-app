// #168: the Path conversation profile — seven items that fill in while the
// user talks (docs/framework/path-plan-redesign.md, "The profile"). Stored in
// path_profiles.profile, written only by the server. Every value coming from
// the model goes through the coerce* functions below, so a malformed update is
// dropped rather than stored.

export const ITEM_KEYS = [
  'pattern_confirmation',
  'pushing_now',
  'tried_before',
  'clarity_of_direction',
  'must_hold',
  'risk_appetite',
  'constraints',
] as const;

export type ItemKey = typeof ITEM_KEYS[number];
export type ItemStatus = 'known' | 'inferred' | 'missing' | 'confirmed' | 'not_known';
export type ItemSource = 'questionnaire' | 'report' | 'conversation';

const STATUSES: ItemStatus[] = ['known', 'inferred', 'missing', 'confirmed', 'not_known'];
const SOURCES: ItemSource[] = ['questionnaire', 'report', 'conversation'];

export type SignatureReaction = 'unreacted' | 'confirmed' | 'corrected' | 'rejected';
export type RiskLevel = 'keep_and_explore' | 'gradual_shift' | 'significant_change' | 'change_everything';
export type DirectionKind = 'specific_idea' | 'rough_leaning' | 'no_idea';
export type Urgency = 'no_rush' | 'soon' | 'deadline';

export type ItemValues = {
  pattern_confirmation: { signatures: Array<{ name: string; reaction: SignatureReaction; correction: string | null }> };
  pushing_now: { pressure: string; urgency: Urgency | null; deadline: string | null };
  tried_before: { attempts: Array<{ what: string; why_it_stalled: string }>; never_tried: boolean };
  clarity_of_direction: { kind: DirectionKind; description: string | null };
  must_hold: { energisers: string[]; friction_points: string[] };
  risk_appetite: { level: RiskLevel; general_vs_now: string | null };
  constraints: { money: string | null; family: string | null; other: string[]; hours_per_week: number | null };
};

export type ProfileItem<V> = {
  status: ItemStatus;
  value: V | null;
  source: ItemSource | null;
  refs: string[];
  in_their_words: string | null;
  needs_timing_check: boolean;
};

export type PathProfile = { version: 1 } & { [K in ItemKey]: ProfileItem<ItemValues[K]> };

export type ProfileUpdate = {
  item: ItemKey;
  status: ItemStatus;
  value: unknown;
  in_their_words?: unknown;
};

// ── Coercion ────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const COERCE: { [K in ItemKey]: (v: unknown) => ItemValues[K] | null } = {
  pattern_confirmation(v) {
    const o = obj(v);
    if (!o || !Array.isArray(o.signatures)) return null;
    const signatures = o.signatures.flatMap(s => {
      const so = obj(s);
      const name = str(so?.name);
      if (!so || !name) return [];
      return [{
        name,
        reaction: oneOf(so.reaction, ['unreacted', 'confirmed', 'corrected', 'rejected'] as const) ?? 'unreacted',
        correction: str(so.correction),
      }];
    });
    return signatures.length ? { signatures } : null;
  },
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
  clarity_of_direction(v) {
    const o = obj(v);
    const kind = oneOf(o?.kind, ['specific_idea', 'rough_leaning', 'no_idea'] as const);
    return kind ? { kind, description: str(o?.description) } : null;
  },
  must_hold(v) {
    const o = obj(v);
    if (!o) return null;
    const energisers = strList(o.energisers);
    const friction_points = strList(o.friction_points);
    return energisers.length || friction_points.length ? { energisers, friction_points } : null;
  },
  risk_appetite(v) {
    const o = obj(v);
    const level = oneOf(o?.level, ['keep_and_explore', 'gradual_shift', 'significant_change', 'change_everything'] as const);
    return level ? { level, general_vs_now: str(o?.general_vs_now) } : null;
  },
  constraints(v) {
    const o = obj(v);
    if (!o) return null;
    const hours = typeof o.hours_per_week === 'number' && Number.isFinite(o.hours_per_week) && o.hours_per_week >= 0
      ? o.hours_per_week
      : null;
    const value = { money: str(o.money), family: str(o.family), other: strList(o.other), hours_per_week: hours };
    return value.money || value.family || value.other.length || value.hours_per_week !== null ? value : null;
  },
};

export function coerceItemValue<K extends ItemKey>(item: K, value: unknown): ItemValues[K] | null {
  return COERCE[item](value);
}

export function coerceItem<K extends ItemKey>(item: K, raw: unknown, defaultSource: ItemSource | null): ProfileItem<ItemValues[K]> {
  const o = obj(raw) ?? {};
  const value = coerceItemValue(item, o.value);
  let status = oneOf(o.status, STATUSES) ?? 'missing';
  if (!value && (status === 'known' || status === 'inferred' || status === 'confirmed')) status = 'missing';
  return {
    status,
    value,
    source: value ? oneOf(o.source, SOURCES) ?? defaultSource : null,
    refs: strList(o.refs),
    in_their_words: shortQuote(o.in_their_words),
    needs_timing_check: o.needs_timing_check === true,
  };
}

export function emptyItem<V>(): ProfileItem<V> {
  return { status: 'missing', value: null, source: null, refs: [], in_their_words: null, needs_timing_check: false };
}

export function fallbackProfile(signatureNames: string[]): PathProfile {
  const profile = { version: 1 } as PathProfile;
  for (const key of ITEM_KEYS) (profile as Record<string, unknown>)[key] = emptyItem();
  return applySeedRules(profile, signatureNames);
}

// ── Seed rules (design doc, "Where each item comes from") ──────────────────
// Applied in code after the seeding call, so the table's rules hold no matter
// what the model returned.
export function applySeedRules(profile: PathProfile, signatureNames: string[]): PathProfile {
  const p = structuredClone(profile);

  // Patterns are inferred by the report and never confirmed yet.
  p.pattern_confirmation = {
    ...emptyItem(),
    status: signatureNames.length ? 'inferred' : 'missing',
    value: signatureNames.length
      ? { signatures: signatureNames.map(name => ({ name, reaction: 'unreacted' as const, correction: null })) }
      : null,
    source: signatureNames.length ? 'report' : null,
    refs: ['signature_profile_summary.primary_signatures'],
  };

  // Risk and direction are always asked; the seed keeps only its hints (refs).
  for (const key of ['risk_appetite', 'clarity_of_direction'] as const) {
    p[key] = { ...emptyItem(), refs: p[key].refs, in_their_words: p[key].in_their_words };
  }

  // Which energisers and friction points matter most is never known up front.
  p.must_hold = { ...emptyItem(), refs: ['energisers', 'friction_points'] };

  // Time per week is always asked explicitly; anything else known about
  // constraints is only partial, so it gets confirmed.
  if (p.constraints.value) {
    p.constraints.value.hours_per_week = null;
    if (p.constraints.status === 'known') p.constraints.status = 'inferred';
  }

  // What they tried is only ever partly covered by the questionnaire (design
  // doc: "Partial. Ask."), and a questionnaire never establishes "never
  // tried": seeded attempts get confirmed, otherwise it's asked.
  if (p.tried_before.value?.attempts.length) {
    p.tried_before = { ...p.tried_before, status: 'inferred', value: { ...p.tried_before.value, never_tried: false } };
  } else {
    p.tried_before = { ...emptyItem(), refs: p.tried_before.refs };
  }

  // What's pushing them is usually well covered but changes with time.
  if (p.pushing_now.value && p.pushing_now.status === 'known') p.pushing_now.needs_timing_check = true;

  // Nothing from the seed is "confirmed" or "not_known": those come only from the user.
  for (const key of ITEM_KEYS) {
    const item = p[key];
    if (item.status === 'confirmed' || item.status === 'not_known') item.status = item.value ? 'inferred' : 'missing';
  }
  return p;
}

// ── Updates from the conversation ───────────────────────────────────────────

// Energisers and friction points are usually settled in two separate turns, and
// the model tends to send only the list it just asked about: an empty list in
// an update keeps what was already recorded instead of wiping it.
function mergeMustHold(current: ItemValues['must_hold'] | null, update: ItemValues['must_hold']): ItemValues['must_hold'] {
  return {
    energisers: update.energisers.length ? update.energisers : current?.energisers ?? [],
    friction_points: update.friction_points.length ? update.friction_points : current?.friction_points ?? [],
  };
}

// in_their_words is a short phrase for the options to echo; a whole message is
// not, so anything longer is ignored.
const MAX_QUOTE_WORDS = 25;
function shortQuote(v: unknown): string | null {
  const s = str(v);
  return s && s.split(/\s+/).length <= MAX_QUOTE_WORDS ? s : null;
}

// The user's own words (corrections, in_their_words) must actually come from
// what they wrote this turn. In live runs the model sometimes filled them in
// itself; those are dropped, so the item stays open and Zyrro asks instead.
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(w => w.length > 2);
}

function inUserWords(phrase: string, userText: string): boolean {
  const said = new Set(words(userText));
  const ws = words(phrase);
  return ws.length > 0 && ws.filter(w => said.has(w)).length / ws.length >= 0.8;
}

function keepOwnWords(item: ItemKey, value: unknown, current: unknown, userText: string): unknown {
  if (item !== 'pattern_confirmation') return value;
  const before = new Map(((current as ItemValues['pattern_confirmation'] | null)?.signatures ?? []).map(s => [s.name, s.correction]));
  const v = value as ItemValues['pattern_confirmation'];
  return {
    signatures: v.signatures.map(s => {
      if (!s.correction || s.correction === before.get(s.name) || inUserWords(s.correction, userText)) return s;
      return { ...s, correction: before.get(s.name) ?? null };
    }),
  };
}

/**
 * `userText` is the user's message this turn; when given, corrections and
 * in_their_words that are not in it are dropped.
 */
export function applyProfileUpdates(profile: PathProfile, updates: unknown, userText?: string): { profile: PathProfile; changed: ItemKey[] } {
  const next = structuredClone(profile);
  const changed: ItemKey[] = [];
  if (!Array.isArray(updates)) return { profile: next, changed };

  for (const raw of updates) {
    const u = obj(raw);
    const item = oneOf(u?.item, ITEM_KEYS);
    const status = oneOf(u?.status, STATUSES);
    if (!u || !item || !status) continue;

    const current = next[item] as ProfileItem<unknown>;
    let value: unknown = current.value;
    if (status !== 'not_known' && u.value !== undefined && u.value !== null) {
      const coerced = coerceItemValue(item, u.value);
      if (!coerced) continue; // malformed value: drop this update
      value = item === 'must_hold' ? mergeMustHold(current.value as ItemValues['must_hold'] | null, coerced as ItemValues['must_hold']) : coerced;
      if (userText !== undefined) value = keepOwnWords(item, value, current.value, userText);
    }
    const quote = shortQuote(u.in_their_words);
    const ownQuote = quote && (userText === undefined || inUserWords(quote, userText)) ? quote : null;
    if ((status === 'confirmed' || status === 'known' || status === 'inferred') && value === null) continue;

    const updated: ProfileItem<unknown> = {
      ...current,
      status,
      value,
      source: status === 'not_known' ? current.source : 'conversation',
      in_their_words: ownQuote ?? current.in_their_words,
      needs_timing_check: status === 'confirmed' || status === 'not_known' ? false : current.needs_timing_check,
    };
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      (next as Record<string, unknown>)[item] = updated;
      if (!changed.includes(item)) changed.push(item);
    }
  }
  return { profile: next, changed };
}

// ── The "enough" rule (design doc, "When Zyrro has enough") ────────────────
// `known` counts as complete (approved 2026-11-05) unless it needs a timing check.

function valueSettles(item: ItemKey, value: unknown): boolean {
  switch (item) {
    // Every signature reacted to; a rejection or a qualified yes needs the user's reason.
    case 'pattern_confirmation': {
      const signatures = (value as ItemValues['pattern_confirmation'] | null)?.signatures ?? [];
      return signatures.length > 0 && signatures.every(s =>
        s.reaction === 'confirmed' || ((s.reaction === 'rejected' || s.reaction === 'corrected') && !!s.correction));
    }
    case 'pushing_now': return !!(value as ItemValues['pushing_now'])?.urgency;
    case 'tried_before': return !!value;
    // An idea or a leaning needs describing; "no idea" is complete as it is.
    case 'clarity_of_direction': {
      const v = value as ItemValues['clarity_of_direction'] | null;
      return !!v && (v.kind === 'no_idea' || !!v.description);
    }
    // Both halves: what the path must include and what it must avoid.
    case 'must_hold': {
      const v = value as ItemValues['must_hold'] | null;
      return !!v && v.energisers.length > 0 && v.friction_points.length > 0;
    }
    case 'risk_appetite': return !!value;
    case 'constraints': return (value as ItemValues['constraints'])?.hours_per_week != null;
  }
}

export function isItemComplete(profile: PathProfile, item: ItemKey): boolean {
  const it = profile[item] as ProfileItem<unknown>;
  if (it.status === 'not_known') return true;
  if (it.status === 'confirmed') return valueSettles(item, it.value);
  if (it.status === 'known') return !it.needs_timing_check && valueSettles(item, it.value);
  return false;
}

/**
 * What an open item still needs, in plain words, so the model knows exactly
 * what is left (in live runs it sometimes thought an item was done when one
 * half of it was still empty).
 */
export function stillNeeded(profile: PathProfile, item: ItemKey): string {
  const it = profile[item] as ProfileItem<unknown>;
  const toConfirm = it.status === 'known' || it.status === 'inferred';
  switch (item) {
    case 'pattern_confirmation': {
      const signatures = (it.value as ItemValues['pattern_confirmation'] | null)?.signatures ?? [];
      const unreacted = signatures.filter(s => s.reaction === 'unreacted').map(s => s.name);
      const noReason = signatures.filter(s => s.reaction !== 'confirmed' && s.reaction !== 'unreacted' && !s.correction).map(s => s.name);
      // A signature left unpicked in a multi-select is a "no": ask why once, typed, not again as choices.
      if (unreacted.length === signatures.length) return 'which of the primary signatures ring true';
      const unsettled = [...unreacted, ...noReason];
      if (unsettled.length) return `one typed question, no choices: what does not fit about ${unsettled.join(', ')}`;
      return 'their confirmation of the patterns';
    }
    case 'pushing_now': {
      const v = it.value as ItemValues['pushing_now'] | null;
      if (!v) return 'what is pushing them to change now';
      if (!v.urgency || toConfirm) return 'a quick check that this still holds, and whether anything forces a decision';
      return 'their confirmation';
    }
    case 'tried_before':
      return toConfirm ? 'confirmation of what they tried and why it stalled' : 'what they have tried before, and why it did not stick';
    case 'clarity_of_direction': {
      const v = it.value as ItemValues['clarity_of_direction'] | null;
      if (v && v.kind !== 'no_idea' && !v.description) return 'what the idea or leaning actually is, in their words';
      return 'whether they have a specific idea, a rough leaning or no idea, and what it is';
    }
    case 'must_hold': {
      const v = it.value as ItemValues['must_hold'] | null;
      const parts = [];
      if (!v?.energisers.length) parts.push('which energisers the path must include');
      if (!v?.friction_points.length) parts.push('which friction points it must avoid');
      return parts.length ? parts.join('; ') : 'their confirmation';
    }
    case 'risk_appetite':
      return 'how much they are prepared to put on the line now';
    case 'constraints': {
      const v = it.value as ItemValues['constraints'] | null;
      const parts = [];
      if (it.status !== 'confirmed') parts.push('confirmation of their money and family picture, and any hard limits');
      if (v?.hours_per_week == null) parts.push('the hours per week they have now');
      return parts.join('; ') || 'their confirmation';
    }
  }
}

export function openItems(profile: PathProfile): ItemKey[] {
  return ITEM_KEYS.filter(k => !isItemComplete(profile, k));
}

export function isProfileComplete(profile: PathProfile): boolean {
  return openItems(profile).length === 0;
}

// Default conversation order (design doc, "Conversation order"); stage 4 takes
// direction and what must hold, stage 5 risk and constraints together.
const ORDER: ItemKey[][] = [
  ['pattern_confirmation'],
  ['pushing_now'],
  ['tried_before'],
  ['clarity_of_direction', 'must_hold'],
  ['risk_appetite', 'constraints'],
];

export function suggestedFocus(profile: PathProfile): ItemKey[] {
  const open = openItems(profile);
  return ORDER.find(stage => stage.some(k => open.includes(k)))?.filter(k => open.includes(k)) ?? [];
}

export function isPathProfile(v: unknown): v is PathProfile {
  const o = obj(v);
  return !!o && o.version === 1 && ITEM_KEYS.every(k => !!obj(o[k]));
}
