'use client';

import { useState } from 'react';
import SecondaryButton from '@/components/SecondaryButton';
import SelectableList from '@/components/SelectableList';

export type ChatChoiceSet = {
  mode: 'single' | 'multi';
  max: number;
  options: Array<{ id: string; label: string }>;
};

type ChatChoicesProps = {
  choices: ChatChoiceSet;
  disabled?: boolean;
  onSubmit: (choiceIds: string[]) => void;
};

// #168: tap-to-confirm choices under the latest assistant message
// (docs/framework/path-plan-redesign.md, "Tap to confirm"). Single choices
// send on tap; multi choices reuse /path's SelectableList with a Continue
// button. Typing in the composer stays available either way.
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

  const labelToId = new Map(choices.options.map(o => [o.label, o.id]));
  return (
    <div className="card">
      <SelectableList
        items={choices.options.map(o => o.label)}
        selected={selected.map(id => choices.options.find(o => o.id === id)?.label ?? '')}
        max={choices.max}
        variant="positive"
        disabled={disabled}
        onToggle={label => {
          const id = labelToId.get(label);
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
