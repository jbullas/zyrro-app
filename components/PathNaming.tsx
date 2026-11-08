'use client';

import { useState } from 'react';
import LinkButton from '@/components/LinkButton';
import PrimaryButton from '@/components/PrimaryButton';
import type { ChatChoiceSet } from '@/lib/chat-choices';

type PathNamingProps = {
  choices: ChatChoiceSet;
  disabled?: boolean;
  onSubmit: (choiceIds: string[], note: string | null) => void;
};

// #168 options (brief 168-options, Part D item 2 and Part E): naming the chosen
// path inside Zyrro's bubble, with the existing naming UI's pieces
// (.project-name-options and .project-name-card from the current /path
// naming dialog, a primary "Name" button and a Skip link). The suggestions
// come with the choice (purpose 'naming'); the pick or the skip is one tap,
// saved by the server on path_choice.
export default function PathNaming({ choices, disabled, onSubmit }: PathNamingProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const skip = choices.mode === 'groups' ? choices.groups.find(g => g.id === 'name')?.options.find(o => o.id === 'skip') : undefined;
  return (
    <div className="flex flex-col gap-16">
      <div className="project-name-options">
        {(choices.names ?? []).map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => setPicked(prev => (prev === n.id ? null : n.id))}
            className={`project-name-card${picked === n.id ? ' selected' : ''}`}
            aria-pressed={picked === n.id}
            disabled={disabled}
          >
            <div className="project-name-card-title">{n.name}</div>
            <p className="project-name-card-rationale">{n.rationale}</p>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <PrimaryButton onClick={() => picked && onSubmit([`name:${picked}`], null)} disabled={disabled || !picked}>
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
