'use client';

import { useState } from 'react';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import LinkButton from '@/components/LinkButton';
import { PathOptionCard } from '@/components/PathOptionsRound';
import type { PathOptionView } from '@/lib/chat-choices';

// "Your path" on /path once a path is chosen and named (Miroslav, 2026-11-09):
// the chosen option in full with a button to /plan, the other two options of
// the round it was chosen from folded away to reread, and a link to the
// conversation. Existing components and classes only.

export type ChosenPath = {
  name: string;
  option: PathOptionView;
  was_strongest_fit: boolean;
  why_strongest: string | null;
  others: Array<{ option: PathOptionView; strongest: boolean }>;
};

// The one redo (brief 168-guardrails-redo). available: a path is chosen and
// named and the redo is unused; in_progress: started, no path chosen in it yet.
export type PathRedo = { available: boolean; used: boolean; in_progress: boolean };

const REDO_LINE = 'You can do this once. You’ll start from the summary you confirmed, change what’s different now and get new options. Your current path and plan stay until you choose a new one.';
const REDO_IN_PROGRESS_LINE = 'Your current path and plan stay until you choose a new one.';
const REDO_USED_LINE = 'You’ve used your one fresh start.';

export default function PathChosen({
  chosen,
  onViewConversation,
  redo,
  onRedo,
  redoStarting,
  redoError,
}: {
  chosen: ChosenPath;
  onViewConversation: () => void;
  redo?: PathRedo;
  onRedo?: () => void;
  redoStarting?: boolean;
  redoError?: string;
}) {
  const [othersOpen, setOthersOpen] = useState(false);
  return (
    <div className="flow-container">
      <div className="scroll">
        <div className="section cover">
          <p className="eyebrow">YOUR PATH</p>
          <h1 className="section-title">{chosen.name}</h1>
        </div>

        <div className="section flex flex-col gap-16">
          <PathOptionCard
            option={chosen.option}
            index={0}
            label="The path you chose"
            strongest={chosen.was_strongest_fit ? chosen.why_strongest : null}
            chosen={false}
            onChoose={null}
            initiallyOpen
          />
          <PrimaryButton href="/plan">See your plan</PrimaryButton>
        </div>

        {chosen.others.length > 0 && (
          <div className="section flex flex-col gap-16">
            <SecondaryButton onClick={() => setOthersOpen(o => !o)}>
              {othersOpen ? 'Hide the other options' : `Reread the other ${chosen.others.length === 1 ? 'option' : `${chosen.others.length} options`}`}
            </SecondaryButton>
            {othersOpen && chosen.others.map((o, i) => (
              <PathOptionCard
                key={o.option.id}
                option={o.option}
                index={i}
                label="Another option"
                strongest={o.strongest ? chosen.why_strongest : null}
                chosen={false}
                onChoose={null}
              />
            ))}
          </div>
        )}

        {redo && (redo.available || redo.used) && (
          <div className="section flex flex-col gap-16">
            {redo.in_progress ? (
              <>
                <p className="mentor-md-p">{REDO_IN_PROGRESS_LINE}</p>
                <SecondaryButton onClick={onViewConversation}>Continue your fresh start</SecondaryButton>
              </>
            ) : redo.used ? (
              <p className="mentor-md-p">{REDO_USED_LINE}</p>
            ) : (
              <>
                <p className="mentor-md-p">{REDO_LINE}</p>
                <SecondaryButton onClick={onRedo} disabled={redoStarting}>
                  {redoStarting ? 'Starting…' : 'Start again from your summary'}
                </SecondaryButton>
              </>
            )}
            {redoError && <p className="form-error">{redoError}</p>}
          </div>
        )}

        <div className="section">
          <LinkButton onClick={onViewConversation}>View the conversation</LinkButton>
        </div>
      </div>
    </div>
  );
}
