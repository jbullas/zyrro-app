import type { MergedAnswer } from '@/lib/identity-questions';

interface QuestionAnswerListProps {
  items: MergedAnswer[];
  readOnly?: boolean;
}

// readOnly always true for now (#20) — #61 adds the false branch (textarea + save).
export default function QuestionAnswerList({ items, readOnly = true }: QuestionAnswerListProps) {
  return (
    <div className="report-sections">
      {items.map(item => (
        <div key={item.number} className="card">
          <div className="flex-start-row gap-16">
            <div className="question-number">{item.number}</div>
            <div className="flex-1">
              <p className="question-text" style={{ margin: '0 0 5px' }}>{item.question}</p>
              <p className="question-hint">{item.hint}</p>
            </div>
          </div>
          {readOnly && <p className="qa-answer-text">{item.answer || '—'}</p>}
        </div>
      ))}
    </div>
  );
}
