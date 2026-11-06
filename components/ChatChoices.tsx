'use client';

import { useState } from 'react';
import SecondaryButton from '@/components/SecondaryButton';
import SelectableList from '@/components/SelectableList';
import { NOTE_MAX_CHARS, validateChoiceAnswer, type ChatChoiceSet, type ChoiceGroup } from '@/lib/chat-choices';

type ChatChoicesProps = {
  choices: ChatChoiceSet;
  disabled?: boolean;
  onSubmit: (choiceIds: string[], note: string | null) => void;
};

// #168: tap-to-confirm choices inside the assistant's bubble
// (docs/framework/path-plan-redesign.md, "Tap to confirm"; brief
// docs/briefs/168-shorter-flow.md, UI). Every mode is the same pattern: tap,
// add an optional note, one Continue. Continue unlocks only when the answer
// would be accepted: the same validateChoiceAnswer the API runs.
//   single / multi: one list. groups: one list per question (ids
//   "<group>:<option>"); a single group swaps its pick, an exclusive option
//   clears the rest of its group. note: only the note.
export default function ChatChoices({ choices, disabled, onSubmit }: ChatChoicesProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const check = validateChoiceAnswer(choices, selected, note);
  const noteRequired = choices.mode === 'note' || !!choices.note?.required;
  const placeholder = choices.note?.placeholder ?? (noteRequired ? 'Your answer' : 'Anything to add? (optional)');

  function toggleInGroup(group: ChoiceGroup, optionId: string) {
    const id = `${group.id}:${optionId}`;
    setSelected(prev => {
      const others = prev.filter(x => !x.startsWith(`${group.id}:`));
      const mine = prev.filter(x => x.startsWith(`${group.id}:`));
      if (mine.includes(id)) return [...others, ...mine.filter(x => x !== id)];
      if (group.mode === 'single' || group.exclusive?.includes(optionId)) return [...others, id];
      return [...others, ...mine.filter(x => !group.exclusive?.includes(x.slice(group.id.length + 1))), id];
    });
  }

  function list(options: { id: string; label: string }[], picked: string[], onPick: (optionId: string) => void, variant: 'positive' | 'negative' = 'positive') {
    const idOf = (label: string) => options.find(o => o.label === label)?.id;
    return (
      <SelectableList
        items={options.map(o => o.label)}
        selected={options.filter(o => picked.includes(o.id)).map(o => o.label)}
        max={options.length}
        variant={variant}
        disabled={disabled}
        onToggle={label => { const id = idOf(label); if (id) onPick(id); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-16">
      {choices.mode === 'groups' && choices.groups.map(group => (
        <div key={group.id}>
          <p className="card-sub-label">{group.label}</p>
          {list(
            group.options,
            selected.filter(x => x.startsWith(`${group.id}:`)).map(x => x.slice(group.id.length + 1)),
            optionId => toggleInGroup(group, optionId),
            group.id === 'remove' ? 'negative' : 'positive',
          )}
        </div>
      ))}
      {(choices.mode === 'single' || choices.mode === 'multi') && list(
        choices.options,
        selected,
        optionId => setSelected(prev => (
          prev.includes(optionId) ? prev.filter(x => x !== optionId)
            : choices.mode === 'single' ? [optionId]
              : prev.length < choices.max ? [...prev, optionId] : prev
        )),
      )}
      <textarea
        className="input-field"
        rows={2}
        value={note}
        maxLength={NOTE_MAX_CHARS}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        onChange={e => setNote(e.target.value)}
      />
      {!check.ok && check.error === 'correction_detail_required' && (
        <p className="form-error">Say what should change, or pick the part that’s off.</p>
      )}
      <SecondaryButton onClick={() => check.ok && onSubmit(check.ids, check.note)} disabled={disabled || !check.ok}>
        Continue →
      </SecondaryButton>
    </div>
  );
}
