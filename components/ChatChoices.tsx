'use client';

import { useState } from 'react';
import SecondaryButton from '@/components/SecondaryButton';
import SelectableList from '@/components/SelectableList';
import type { ChatChoiceSet } from '@/lib/chat-choices';

type ChatChoicesProps = {
  choices: ChatChoiceSet;
  disabled?: boolean;
  onSubmit: (choiceIds: string[]) => void;
};

// #168: tap-to-confirm choices under the latest assistant message
// (docs/framework/path-plan-redesign.md, "Tap to confirm"). Single choices
// send on tap; multi choices reuse /path's SelectableList with a Continue
// button; a matrix (the signature grid) is one SelectableList per row, each
// answered once, then Continue. Typing in the composer stays available.
export default function ChatChoices({ choices, disabled, onSubmit }: ChatChoicesProps) {
  const [selected, setSelected] = useState<string[]>([]);

  if (choices.mode === 'single') {
    return (
      <div className="card">
        {choices.options.map(option => (
          <SecondaryButton key={option.id} onClick={() => onSubmit([option.id])} disabled={disabled}>
            {option.label}
          </SecondaryButton>
        ))}
      </div>
    );
  }

  // #168 shorter flow: groups (opening read, risk and time, summary card) and
  // the note-only clarifying question are rendered by the step 2 UI.
  if (choices.mode === 'groups' || choices.mode === 'note') return null;

  const labelOf = (id: string) => choices.options.find(o => o.id === id)?.label ?? '';
  const idOf = (label: string) => choices.options.find(o => o.label === label)?.id;

  return (
    <div className="card">
      <SelectableList
        items={choices.options.map(o => o.label)}
        selected={selected.map(labelOf)}
        max={choices.max}
        variant="positive"
        disabled={disabled}
        onToggle={label => {
          const id = idOf(label);
          if (!id) return;
          setSelected(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
        }}
      />
      <SecondaryButton onClick={() => onSubmit(selected)} disabled={disabled || selected.length === 0}>
        Continue →
      </SecondaryButton>
    </div>
  );
}
