'use client';

import { useId, useState } from 'react';
import ChatChoices from '@/components/ChatChoices';
import { NOTE_MAX_CHARS, type ChatChoiceSet, type RiskLine, type SummaryCard, type SummaryCardItem } from '@/lib/chat-choices';

// The label of the card's risk field (brief 168-risk-note; Miroslav, 2026-11-09).
const RISK_FIELD_LABEL = 'Your words about risk and time. Edit them here.';

type PathSummaryCardProps = {
  card: SummaryCard;
  // The card's choices, only while it is the one waiting for an answer.
  choices: ChatChoiceSet | null;
  disabled?: boolean;
  // riskText: what the user saved in the risk field, sent only when they
  // marked "Risk, limits and time" (brief 168-risk-note).
  onSubmit: (choiceIds: string[], note: string | null, riskText?: string) => void;
};

// #168: the summary card in the Path thread (briefs 168-shorter-flow and
// 168-followup). Built from the Identity report's card styles: .card with a
// header strip and body, and /identity's +/– bullet lists. Each must-have and
// must-avoid has its own remove control (part of the card's answer, ids
// "remove:<id>"). Risk, limits and time show one line each, a Deadline line
// when there is one, and one note under them (brief 168-risk-note); cards
// from before it keep a note under each line. Earlier rounds stay in the
// thread without their choices.
export default function PathSummaryCard({ card, choices, disabled, onSubmit }: PathSummaryCardProps) {
  const [selected, setSelected] = useState<string[]>(choices?.preselected ?? []);
  // The user's risk text in their own words, editable once they mark
  // "Risk, limits and time" as off (brief 168-risk-note).
  const [riskText, setRiskText] = useState(choices?.risk_text ?? '');
  const riskFieldOpen = !!choices && choices.risk_text !== undefined && selected.includes('part:risk');
  const riskFieldId = useId();
  const removable = new Set(
    choices?.mode === 'groups' ? choices.groups.find(g => g.id === 'remove')?.options.map(o => o.id) ?? [] : [],
  );
  const removed = (id: string) => selected.includes(`remove:${id}`);
  const toggleRemove = (id: string) =>
    setSelected(prev => (removed(id) ? prev.filter(x => x !== `remove:${id}`) : [...prev, `remove:${id}`]));

  const items = (list: SummaryCardItem[], className: string, icon: string) =>
    list.length ? (
      <ul className={className}>
        {list.map(item => (
          <li key={item.id} className={removed(item.id) ? 'path-item--removed' : undefined}>
            <span className="bullet-icon">{icon}</span>
            <span className="flex-1">
              {item.text}
              {item.inferred && <span className="path-inferred-tag">Zyrro’s guess</span>}
            </span>
            {choices && removable.has(item.id) && (
              <button
                type="button"
                className="path-remove-btn"
                onClick={() => toggleRemove(item.id)}
                disabled={disabled}
                aria-pressed={removed(item.id)}
                aria-label={removed(item.id) ? `Keep ${item.text}` : `Remove ${item.text}`}
              >
                {removed(item.id) ? 'Undo' : 'Remove'}
              </button>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p>None recorded</p>
    );

  const risk = card.risk;
  const lines: Array<[string, string, RiskLine]> = [
    ['Ready to', risk.readiness, 'readiness'],
    ['Would put at risk', risk.at_stake, 'at_stake'],
    ['Off the table', risk.limits, 'limits'],
    ['Time', risk.hours, 'hours'],
    ...(risk.deadline ? [['Deadline', risk.deadline, 'deadline'] as [string, string, RiskLine]] : []),
  ];

  return (
    <div className="card constellation-card path-summary-card">
      <div className="constellation-card-header">
        <p className="eyebrow">Your summary</p>
      </div>
      <div className="constellation-card-body">
        <div>
          <p className="card-sub-label">How Zyrro sees you</p>
          <p className="mentor-md-p">{card.seen_as}</p>
        </div>
        <div>
          <p className="card-sub-label">What you want</p>
          <p className="mentor-md-p">{card.wants}</p>
        </div>
        {card.direction && (
          <div>
            <p className="card-sub-label">Your direction</p>
            <p className="mentor-md-p">
              <strong>{card.direction.level}.</strong>
              {card.direction.text && <> {card.direction.text}</>}
            </p>
          </div>
        )}
        <div>
          <p className="card-sub-label">Must-haves</p>
          {items(card.must_haves, 'energiser-bullets', '+')}
        </div>
        <div>
          <p className="card-sub-label">Must-avoids</p>
          {items(card.must_avoids, 'friction-bullets', '–')}
        </div>
        <div>
          <p className="card-sub-label">Risk, limits and time</p>
          <ul className="bullet-list path-risk-lines">
            {lines.map(([label, value, key]) => (
              <li key={key}>
                <span><strong>{label}:</strong> {value}</span>
                {risk.notes?.[key] && <span className="path-risk-note">{risk.notes[key]}</span>}
              </li>
            ))}
            {risk.qualifier && <li>{risk.qualifier}</li>}
          </ul>
          {/* The user's own risk text: the section's main content, not a footnote. */}
          {risk.note && (
            <div className="mt-4">
              <p className="card-sub-label">In your words:</p>
              <p className="mentor-md-p">{risk.note}</p>
            </div>
          )}
        </div>
        {choices && (
          <div className="divided-list">
            <div />
            <ChatChoices
              choices={choices}
              disabled={disabled}
              onSubmit={(ids, note) => onSubmit(ids, note, riskFieldOpen ? riskText : undefined)}
              selected={selected}
              onSelectedChange={setSelected}
              hiddenGroups={['remove']}
              // The risk field opens right under "What's off?", where the user
              // marks "Risk, limits and time", so it can't open out of view.
              afterGroup={riskFieldOpen ? {
                id: 'part',
                content: (
                  <div className="flex flex-col gap-8 mt-2">
                    <label htmlFor={riskFieldId} className="path-question">{RISK_FIELD_LABEL}</label>
                    <textarea
                      id={riskFieldId}
                      className="input-field"
                      rows={4}
                      value={riskText}
                      maxLength={NOTE_MAX_CHARS}
                      disabled={disabled}
                      onChange={e => setRiskText(e.target.value)}
                    />
                  </div>
                ),
              } : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
