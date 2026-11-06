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

export type NoteRule = {
  required?: boolean;
  required_when?: { ids: string[]; unless_group?: string };
  placeholder?: string;
};

export type ChoicePurpose = 'opening_read' | 'risk_time' | 'summary' | 'summary_clarify';

export type SummaryCardItem = { id: string; text: string; inferred: boolean };

export type SummaryCard = {
  round: number;
  seen_as: string;
  wants: string;
  must_haves: SummaryCardItem[];
  must_avoids: SummaryCardItem[];
  risk: { readiness: string; at_stake: string; limits: string; hours: string; qualifier: string | null };
};

type ChoiceBase = { purpose?: ChoicePurpose; note?: NoteRule; card?: SummaryCard };

export type ChatChoiceSet =
  | (ChoiceBase & { mode: 'single' | 'multi'; max: number; options: ChoiceOption[] })
  | (ChoiceBase & { mode: 'groups'; groups: ChoiceGroup[] })
  | (ChoiceBase & { mode: 'note' });

export const NOTE_MAX_CHARS = 1500;

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
        return labels.length ? `${group.label}: ${labels.join(', ')}` : null;
      })
      .filter((s): s is string => !!s)
      .join('\n');
  }
  return choices.options.filter(o => ids.includes(o.id)).map(o => o.label).join('; ');
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
