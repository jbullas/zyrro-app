'use client';

import { useState } from 'react';
import LinkButton from '@/components/LinkButton';
import PrimaryButton from '@/components/PrimaryButton';
import { PROJECT_NAME_MAX_CHARS, typedNameProblem, type ChatChoiceSet } from '@/lib/chat-choices';

type PathNamingProps = {
  choices: ChatChoiceSet;
  disabled?: boolean;
  onSubmit: (choiceIds: string[], note: string | null) => void;
};

// #168 options (brief 168-options, Part D item 2 and Part E): naming the chosen
// path inside Zyrro's bubble, with the existing naming dialog's pieces and
// behaviour (current /path, components/PathReportFlow.tsx): .project-name-card
// suggestions that fill the "Or write your own" field (.input-field), a
// primary "Name this path" button and a Skip link. A suggestion is sent as its
// tap; anything else typed is sent as the user's own name (the note), which
// the server checks the same way (typedNameProblem) and saves on path_choice.
export default function PathNaming({ choices, disabled, onSubmit }: PathNamingProps) {
  const [name, setName] = useState('');
  const names = choices.names ?? [];
  const skip = choices.mode === 'groups' ? choices.groups.find(g => g.id === 'name')?.options.find(o => o.id === 'skip') : undefined;
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const suggestion = names.find(n => n.name === trimmed);
  const problem = trimmed && !suggestion ? typedNameProblem(trimmed) : null;

  function submit() {
    if (!trimmed || problem) return;
    if (suggestion) onSubmit([`name:${suggestion.id}`], null);
    else onSubmit([], trimmed);
  }

  return (
    <div className="flex flex-col gap-16">
      <div className="project-name-options">
        {names.map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => setName(n.name)}
            className={`project-name-card${suggestion?.id === n.id ? ' selected' : ''}`}
            aria-pressed={suggestion?.id === n.id}
            disabled={disabled}
          >
            <div className="project-name-card-title">{n.name}</div>
            <p className="project-name-card-rationale">{n.rationale}</p>
          </button>
        ))}
      </div>
      <input
        className="input-field"
        type="text"
        placeholder="Or write your own"
        aria-label="Or write your own"
        value={name}
        maxLength={PROJECT_NAME_MAX_CHARS + 20}
        disabled={disabled}
        onChange={e => setName(e.target.value)}
      />
      {problem === 'too_long' && <p className="form-error">Keep the name to {PROJECT_NAME_MAX_CHARS} characters or fewer.</p>}
      {problem === 'dash' && <p className="form-error">Use a hyphen or a space instead of a long dash.</p>}
      <div className="dialog-actions">
        <PrimaryButton onClick={submit} disabled={disabled || !trimmed || !!problem}>
          Name this path
        </PrimaryButton>
        {skip && (
          <LinkButton onClick={() => onSubmit(['name:skip'], null)} disabled={disabled}>
            {skip.label}
          </LinkButton>
        )}
      </div>
    </div>
  );
}
