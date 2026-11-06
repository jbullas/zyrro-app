'use client';

import ChatChoices from '@/components/ChatChoices';
import type { ChatChoiceSet, SummaryCard, SummaryCardItem } from '@/lib/chat-choices';

type PathSummaryCardProps = {
  card: SummaryCard;
  // The card's choices, only while it is the one waiting for an answer.
  choices: ChatChoiceSet | null;
  disabled?: boolean;
  onSubmit: (choiceIds: string[], note: string | null) => void;
};

// #168 shorter flow: the summary card in the Path thread (brief
// docs/briefs/168-shorter-flow.md, "Summary card"). Built from the Identity
// report's card styles: .card with a header strip and body, and /identity's
// +/– bullet lists for must-haves and must-avoids. Earlier rounds stay in the
// thread without their choices.
export default function PathSummaryCard({ card, choices, disabled, onSubmit }: PathSummaryCardProps) {
  const items = (list: SummaryCardItem[], className: string, icon: string) =>
    list.length ? (
      <ul className={className}>
        {list.map(item => (
          <li key={item.id}>
            <span className="bullet-icon">{icon}</span>
            <span>
              {item.text}
              {item.inferred && <span className="path-inferred-tag">Zyrro’s reading</span>}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p>None recorded</p>
    );

  const risk = [
    ['Ready to', card.risk.readiness],
    ['Would put at risk', card.risk.at_stake],
    ['Hard limits', card.risk.limits],
    ['Time', card.risk.hours],
  ] as const;

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
          <ul className="bullet-list">
            {risk.map(([label, value]) => (
              <li key={label}><strong>{label}:</strong> {value}</li>
            ))}
            {card.risk.qualifier && <li>{card.risk.qualifier}</li>}
          </ul>
        </div>
        {choices && (
          <div className="divided-list">
            <div />
            <ChatChoices choices={choices} disabled={disabled} onSubmit={onSubmit} />
          </div>
        )}
      </div>
    </div>
  );
}
