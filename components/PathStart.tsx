import PrimaryButton from '@/components/PrimaryButton';
import { IDENTITY_REPORT_COPY } from '@/lib/identity-report-copy';

type PathStartProps = {
  onStart: () => void;
  starting: boolean;
  error: string;
};

// #168 follow-up, Part B item 1: the Path start screen is where users land
// right after paying. It opens with the value proposition they bought (the
// /identity "Find your path" bottom section, reused as is, Miroslav
// 2026-11-06), then what they get and how it works.
const WHAT_YOU_GET = [
  'A summary of how Zyrro sees you, for you to check and correct.',
  'Then three path options, with the strongest fit marked.',
];
const HOW_IT_WORKS = [
  'A few questions, building on your Identity Report.',
  'Tap an answer or type your own.',
  'About ten minutes. Stop and come back any time.',
];

export default function PathStart({ onStart, starting, error }: PathStartProps) {
  const copy = IDENTITY_REPORT_COPY.bottomCta;
  const list = (items: string[]) => (
    <ul className="bullet-list path-start-list">
      {items.map(item => (
        <li key={item} className="bullet-item"><span className="bullet-dot" aria-hidden="true" />{item}</li>
      ))}
    </ul>
  );
  return (
    <div className="flow-container gated-container path-start">
      <p className="eyebrow">Your Path</p>
      <h1>{copy.heading}</h1>
      <p>{copy.body}</p>
      <div className="card flex flex-col gap-12">
        <p className="path-question">What you get</p>
        {list(WHAT_YOU_GET)}
      </div>
      <div className="card flex flex-col gap-12">
        <p className="path-question">How it works</p>
        {list(HOW_IT_WORKS)}
      </div>
      {error && <p className="form-error">{error}</p>}
      <PrimaryButton onClick={onStart} disabled={starting}>Start the conversation</PrimaryButton>
    </div>
  );
}
