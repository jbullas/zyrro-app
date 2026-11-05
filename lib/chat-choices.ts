// #168: tap choices on an assistant message, shared by the server (validating
// a tap, writing the user's message) and the browser (rendering, the pending
// message). No server-only imports.
//
// single / multi: one list of options. matrix: one row per item (Path uses it
// for the signatures), each answered with exactly one of the same options;
// a matrix tap's ids are "<rowId>:<optionId>".
//
// purpose/target are set by code for choices whose answers code itself maps
// onto the profile (the signature grid, the drain-source question, reflections).

export type ChoiceOption = { id: string; label: string };

export type ChatChoiceSet =
  | {
      mode: 'single' | 'multi';
      max: number;
      options: ChoiceOption[];
      purpose?: ChoicePurpose;
      target?: string;
    }
  | {
      mode: 'matrix';
      rows: ChoiceOption[];
      options: ChoiceOption[];
      purpose?: ChoicePurpose;
      target?: string;
    };

export type ChoicePurpose = 'patterns' | 'drain_source' | 'reflection' | 'energisers' | 'friction_points';

/** The picked ids if they are a valid answer to these choices, else null. */
export function validateChoiceIds(choices: ChatChoiceSet, ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  if (unique.length === 0 || unique.length !== ids.length) return null;

  if (choices.mode === 'matrix') {
    const seenRows = new Set<string>();
    for (const id of unique) {
      const [rowId, optionId] = id.split(':');
      if (!choices.rows.some(r => r.id === rowId) || !choices.options.some(o => o.id === optionId) || seenRows.has(rowId)) return null;
      seenRows.add(rowId);
    }
    return seenRows.size === choices.rows.length ? unique : null;
  }

  if (!unique.every(id => choices.options.some(o => o.id === id))) return null;
  const allowed = choices.mode === 'single' ? 1 : choices.max;
  return unique.length <= allowed ? unique : null;
}

/** The text of the user's message for a tap: what they picked, in plain words. */
export function choiceContent(choices: ChatChoiceSet, ids: string[]): string {
  if (choices.mode === 'matrix') {
    return choices.rows
      .map(row => {
        const optionId = ids.find(id => id.startsWith(`${row.id}:`))?.split(':')[1];
        const option = choices.options.find(o => o.id === optionId);
        return option ? `${row.label}: ${option.label}` : null;
      })
      .filter((s): s is string => !!s)
      .join('; ');
  }
  return choices.options.filter(o => ids.includes(o.id)).map(o => o.label).join('; ');
}
