'use client';

import { useState } from 'react';
import SecondaryButton from '@/components/SecondaryButton';
import SelectableList from '@/components/SelectableList';
import { NOTE_MAX_CHARS, type ChatChoiceSet, type OptionsRoundView, type PathOptionView } from '@/lib/chat-choices';

type PathOptionsRoundProps = {
  round: OptionsRoundView;
  // The round's choices, only while it is the message waiting for an answer.
  choices: ChatChoiceSet | null;
  disabled?: boolean;
  onSubmit: (choiceIds: string[], note: string | null) => void;
};

// #168 options (brief 168-options, Part E): one round of three path options in
// the Path thread, as cards in the Identity report's card style (.card
// .constellation-card, like the summary card). The parts follow the design
// doc's order; the strongest fit is marked and shows why Zyrro picked it. On
// a phone the last three parts fold behind "More about this path", so a card
// reads as a name, what it is and the picture first. Above the cards, the
// round's code-owned line says what to do. Choosing follows the thread's
// pattern: tap "Choose this path" (or "Adjust these options" under the
// cards), add an optional note, then one Continue: the note goes with the
// choice in the same turn. Earlier rounds stay in the thread without their
// controls.
export default function PathOptionsRound({ round, choices, disabled, onSubmit }: PathOptionsRoundProps) {
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const placeholder = pick === 'none' ? 'What should change? (Optional)' : choices?.note?.placeholder ?? 'Anything to add? (Optional)';
  const pickGroup = choices?.mode === 'groups' ? choices.groups.find(g => g.id === 'pick') : undefined;
  const noneOption = pickGroup?.options.find(o => o.id === 'none');

  return (
    <div className="path-option-list">
      {round.intro && (
        <div className="mentor-bubble mentor-bubble--assistant self-start">
          <p className="mentor-md-p">{round.intro}</p>
        </div>
      )}
      {round.options.map((option, i) => (
        <PathOptionCard
          key={option.id}
          option={option}
          index={i}
          strongest={option.id === round.strongest_fit_id ? round.why_strongest : null}
          chosen={pick === option.id}
          onChoose={pickGroup ? () => setPick(prev => (prev === option.id ? null : option.id)) : null}
          disabled={disabled}
        />
      ))}
      {pickGroup && (
        <div className="path-choices path-option-controls flex flex-col gap-16">
          {noneOption && (
            <SelectableList
              items={[noneOption.label]}
              selected={pick === 'none' ? [noneOption.label] : []}
              max={1}
              variant="positive"
              disabled={disabled}
              onToggle={() => setPick(prev => (prev === 'none' ? null : 'none'))}
            />
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
          <SecondaryButton onClick={() => pick && onSubmit([`pick:${pick}`], note.trim() || null)} disabled={disabled || !pick}>
            Continue →
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}

// Also used by the "Your path" view on /path (components/PathChosen.tsx):
// label replaces "Option N", and initiallyOpen shows every part on a phone too.
export function PathOptionCard({
  option,
  index,
  strongest,
  chosen,
  onChoose,
  disabled,
  label,
  initiallyOpen = false,
}: {
  option: PathOptionView;
  index: number;
  strongest: string | null;
  chosen: boolean;
  onChoose: (() => void) | null;
  disabled?: boolean;
  label?: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className={`card constellation-card path-option-card${open ? ' path-option-card--open' : ''}${chosen ? ' path-option-card--chosen' : ''}`}>
      <div className="constellation-card-header">
        <p className="eyebrow">{label ?? `Option ${index + 1}`}</p>
        {strongest && <span className="path-option-tag">Zyrro’s strongest fit</span>}
      </div>
      <div className="constellation-card-body">
        <div>
          <h3 className="path-option-name">{option.name}</h3>
          {option.what_it_is && <p className="mentor-md-p path-option-what">{option.what_it_is}</p>}
        </div>
        <div>
          <p className="card-sub-label">What it would look like</p>
          <p className="mentor-md-p">{option.what_it_looks_like}</p>
        </div>
        <div className="path-option-more">
          <p className="card-sub-label">Why it fits you</p>
          <p className="mentor-md-p">{option.why_it_fits}</p>
        </div>
        <div className="path-option-more">
          <p className="card-sub-label">Starting point</p>
          <p className="mentor-md-p">{option.starting_point}</p>
        </div>
        <div className="path-option-more">
          <p className="card-sub-label">What it would cost you</p>
          <p className="mentor-md-p">{option.what_it_costs}</p>
        </div>
        {strongest && (
          <div className="path-option-why">
            <p className="card-sub-label">Why Zyrro picked this one</p>
            <p className="mentor-md-p">{strongest}</p>
          </div>
        )}
        <button type="button" className="path-option-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? 'Show less' : 'More about this path'}
        </button>
        {onChoose && (
          <div className="path-choices">
            <SelectableList
              items={['Choose this path']}
              selected={chosen ? ['Choose this path'] : []}
              max={1}
              variant="positive"
              disabled={disabled}
              onToggle={onChoose}
            />
          </div>
        )}
      </div>
    </div>
  );
}
