// #168: tap choices on an assistant message, shared by the server (validating
// a tap, writing the user's message) and the browser (rendering, the pending
// message). No server-only imports.
//
// single / multi: one list of options, ids are the option ids.
// groups: several questions in one message (Path's opening read, the risk
//   and time turn, the summary card); ids are "<groupId>:<optionId>". A
//   required group needs an answer; a single group takes at most one; an
//   exclusive option stands alone in its group.
// note: no options, only the note (Path's clarifying question on the card).
//
// Every choice set can carry a note: optional unless `note.required`, or
// required when one of `note.required_when.ids` is picked and nothing is
// picked in `note.required_when.unless_group`.
//
// purpose is set by code for choices whose answers code itself maps onto the
// Path profile; card is the summary card's content (purpose 'summary').

export type ChoiceOption = { id: string; label: string };

export type ChoiceGroup = {
  id: string;
  label: string;
  mode: 'single' | 'multi';
  options: ChoiceOption[];
  required: boolean;
  exclusive?: string[];
};

// required_unless_picked: the note is required when nothing is tapped (a tap
// or a note, e.g. "what feels off" about the options).
export type NoteRule = {
  required?: boolean;
  required_when?: { ids: string[]; unless_group?: string };
  required_unless_picked?: boolean;
  placeholder?: string;
};

// options: a round of three path options (brief 168-options); options_feedback:
// what feels off about them; naming: names for the chosen path.
export type ChoicePurpose = 'opening_read' | 'direction' | 'risk_time' | 'summary' | 'summary_clarify' | 'options' | 'options_feedback' | 'naming';

// One path option as the user sees it, in the design doc's order (its kind,
// form and evidence stay server-side). what_it_is: absent on rounds generated
// before it existed.
export type PathOptionView = {
  id: string;
  name: string;
  what_it_is?: string;
  what_it_looks_like: string;
  why_it_fits: string;
  starting_point: string;
  what_it_costs: string;
};

// An options round on its message (purpose 'options'). last_round: no
// "None of these feels right" after it, the user picks the closest one.
// intro: the round's code-owned lead-in, shown above the options (none on the
// first round).
export type OptionsRoundView = {
  artifact_id: string;
  round: number;
  intro?: string | null;
  options: PathOptionView[];
  strongest_fit_id: string;
  why_strongest: string;
  last_round: boolean;
};

// Name suggestions for the chosen path (purpose 'naming'); ids match the 'name' group's options.
export type NameSuggestion = { id: string; name: string; rationale: string };

// A name the user writes themselves for the chosen path (sent as the naming
// turn's note): trimmed, at most this long, no em or en dashes.
export const PROJECT_NAME_MAX_CHARS = 50;

/** Why a typed name can't be saved, or null when it can. */
export function typedNameProblem(raw: string): 'empty' | 'too_long' | 'dash' | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return 'empty';
  if (name.length > PROJECT_NAME_MAX_CHARS) return 'too_long';
  if (/[—–]/.test(name)) return 'dash';
  return null;
}

export type SummaryCardItem = { id: string; text: string; inferred: boolean };

// Next to each card item a correction note questioned (brief
// 168-adjust-and-card B1), on the card and in its read-back.
export const QUESTIONED_ITEM_LINE = 'You said this may not belong. Tap Remove to take it off.';

export type RiskLine = 'readiness' | 'at_stake' | 'limits' | 'hours' | 'deadline';

export type SummaryCard = {
  round: number;
  // Every card after the first opens with one code-owned line above it
  // (brief 168-card-fixes, fix 1). Absent on the first card.
  intro?: string | null;
  seen_as: string;
  wants: string;
  // Brief 168-direction-and-card, Part C: the level and, when the user gave
  // one, their direction in their own words (after "Not yet", a code-owned
  // line). Absent on cards from before that brief.
  direction?: { level: string; text: string | null } | null;
  must_haves: SummaryCardItem[];
  must_avoids: SummaryCardItem[];
  // Ids of items the latest correction note said may not belong (brief
  // 168-adjust-and-card B1): flagged with a code-written line next to their
  // remove control. Nothing is removed without the user's own tap.
  questioned?: string[];
  risk: {
    readiness: string;
    at_stake: string;
    limits: string;
    hours: string;
    // A decision with a term or date attached; it limits how long they can explore.
    deadline?: string | null;
    // One note under the block, from the user's own risk text (brief 168-risk-note).
    note?: string | null;
    // Cards from before brief 168-risk-note: a note under each line it qualified.
    notes?: Partial<Record<RiskLine, string>>;
    // Cards from before the follow-up brief: one free-text qualifier.
    qualifier?: string | null;
  };
};

// preselected: ids already picked when the choices are shown (the card's
// re-offered risk and time taps, filled with the current answers).
// options_round: the options shown (purpose 'options'); names: the suggestions
// with their rationale (purpose 'naming'). risk_text: on the summary card, the
// user's risk text in their own first person, prefilled in the field that
// opens when they mark "Risk, limits and time" (brief 168-risk-note).
type ChoiceBase = {
  purpose?: ChoicePurpose;
  note?: NoteRule;
  card?: SummaryCard;
  preselected?: string[];
  risk_text?: string;
  options_round?: OptionsRoundView;
  names?: NameSuggestion[];
};

export type ChatChoiceSet =
  | (ChoiceBase & { mode: 'single' | 'multi'; max: number; options: ChoiceOption[] })
  | (ChoiceBase & { mode: 'groups'; groups: ChoiceGroup[] })
  | (ChoiceBase & { mode: 'note' });

export const NOTE_MAX_CHARS = 1500;
// A typed message in the Path conversation (checked on the server, capped and
// counted in the box: brief 168-guardrails-redo).
export const MESSAGE_MAX_CHARS = 1500;

// Code-owned lines for each refusal of a Path send (brief 168-guardrails-redo).
// No em or en dashes.
export const PATH_REFUSAL_TEXT: Record<string, string> = {
  message_too_long: 'That message is too long. Keep it under 1,500 characters.',
  note_too_long: 'That note is too long. Keep it under 1,500 characters.',
  rate_limited: 'You’re sending faster than I can keep up. Give it a minute, then send again.',
  turn_in_progress: 'Zyrro is still working on your last message. Wait for it to finish, then send again.',
  stale_choice: 'This step has already moved on. Refresh the page to see where you are.',
  not_in_conversation: 'This step has already moved on. Refresh the page to see where you are.',
  choices_expected: 'This step has already moved on. Refresh the page to see where you are.',
  note_required: 'Add a note, or pick one of the answers.',
  invalid_name: 'That name doesn’t work. Keep it to 50 characters, without dashes.',
  busy: 'Zyrro is busy right now. Try again in a moment.',
  redo_used: 'You’ve already used your one fresh start.',
  redo_not_available: 'A fresh start isn’t available right now. Refresh the page to see where you are.',
};
export const PATH_REFUSAL_FALLBACK = 'Couldn’t send that. Try again.';

/** The options retry limit's line (brief 168-guardrails-redo). */
export function optionsRetryLimitText(minutes: number): string {
  return `Something went wrong on my side, and I couldn’t build your options. You can try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

export type ChoiceValidation =
  | { ok: true; ids: string[]; note: string | null }
  | { ok: false; error: 'invalid_choice' | 'note_required' | 'correction_detail_required' | 'note_too_long' };

function splitId(id: string): [string, string] {
  const i = id.indexOf(':');
  return i < 0 ? [id, ''] : [id.slice(0, i), id.slice(i + 1)];
}

/** The picked ids and note if they are a valid answer to these choices. */
export function validateChoiceAnswer(choices: ChatChoiceSet, rawIds: unknown, rawNote: unknown): ChoiceValidation {
  const ids = rawIds === undefined || rawIds === null ? [] : rawIds;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) return { ok: false, error: 'invalid_choice' };
  const unique = [...new Set(ids as string[])];
  if (unique.length !== ids.length) return { ok: false, error: 'invalid_choice' };
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') return { ok: false, error: 'invalid_choice' };
  const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : null;
  if (note && note.length > NOTE_MAX_CHARS) return { ok: false, error: 'note_too_long' };

  if (choices.mode === 'note') {
    if (unique.length) return { ok: false, error: 'invalid_choice' };
  } else if (choices.mode === 'groups') {
    const picked = new Map<string, string[]>();
    for (const id of unique) {
      const [groupId, optionId] = splitId(id);
      const group = choices.groups.find(g => g.id === groupId);
      if (!group || !group.options.some(o => o.id === optionId)) return { ok: false, error: 'invalid_choice' };
      picked.set(groupId, [...(picked.get(groupId) ?? []), optionId]);
    }
    for (const group of choices.groups) {
      const got = picked.get(group.id) ?? [];
      if (group.required && got.length === 0) return { ok: false, error: 'invalid_choice' };
      if (group.mode === 'single' && got.length > 1) return { ok: false, error: 'invalid_choice' };
      if (got.length > 1 && got.some(o => group.exclusive?.includes(o))) return { ok: false, error: 'invalid_choice' };
    }
  } else {
    if (unique.length === 0 || !unique.every(id => choices.options.some(o => o.id === id))) return { ok: false, error: 'invalid_choice' };
    if (unique.length > (choices.mode === 'single' ? 1 : choices.max)) return { ok: false, error: 'invalid_choice' };
  }

  const rule = choices.note;
  if ((rule?.required || choices.mode === 'note') && !note) return { ok: false, error: 'note_required' };
  if (rule?.required_unless_picked && !unique.length && !note) return { ok: false, error: 'note_required' };
  const when = rule?.required_when;
  if (when && unique.some(id => when.ids.includes(id)) && !note) {
    const hasGroupPick = !!when.unless_group && unique.some(id => splitId(id)[0] === when.unless_group);
    if (!hasGroupPick) return { ok: false, error: 'correction_detail_required' };
  }
  return { ok: true, ids: unique, note };
}

/** What the user picked, in plain words, without the note. */
export function choiceLabels(choices: ChatChoiceSet, ids: string[]): string {
  if (choices.mode === 'note') return '';
  if (choices.mode === 'groups') {
    return choices.groups
      .map(group => {
        const labels = group.options.filter(o => ids.includes(`${group.id}:${o.id}`)).map(o => o.label);
        if (!labels.length) return null;
        // A question reads as question and answer; a plain label takes a colon.
        return group.label.trim().endsWith('?') ? `${group.label} ${labels.join(', ')}` : `${group.label}: ${labels.join(', ')}`;
      })
      .filter((s): s is string => !!s)
      .join('\n');
  }
  return choices.options.filter(o => ids.includes(o.id)).map(o => o.label).join('; ');
}

/**
 * What the user picked, as rows for their bubble (brief 168-direction-and-card,
 * Part B item 5): each group's question (shown muted) with the answer they
 * tapped. A single list of options has no question of its own (Zyrro's
 * message asked it), so its row has the answer only.
 */
export function choiceAnswerRows(choices: ChatChoiceSet, ids: string[]): Array<{ question: string | null; answer: string }> {
  if (choices.mode === 'note') return [];
  if (choices.mode === 'groups') {
    return choices.groups.flatMap(group => {
      const labels = group.options.filter(o => ids.includes(`${group.id}:${o.id}`)).map(o => o.label);
      return labels.length ? [{ question: group.label, answer: labels.join(', ') }] : [];
    });
  }
  const answer = choices.options.filter(o => ids.includes(o.id)).map(o => o.label).join('; ');
  return answer ? [{ question: null, answer }] : [];
}

/** The text of the user's message for a tap: what they picked, then their note. */
export function choiceContent(choices: ChatChoiceSet, ids: string[], note?: string | null): string {
  return [choiceLabels(choices, ids), note?.trim() || ''].filter(Boolean).join('\n\n');
}

/** The note part of a saved tap message (its content minus the labels). */
export function noteFromContent(choices: ChatChoiceSet, ids: string[], content: string): string {
  const labels = choiceLabels(choices, ids);
  return (labels && content.startsWith(labels) ? content.slice(labels.length) : labels ? '' : content).trim();
}
