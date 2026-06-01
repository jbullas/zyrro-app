import Link from 'next/link';

interface GatedStateProps {
  eyebrow: string;
  heading: string;
  body: string;
}

export default function GatedState({ eyebrow, heading, body }: GatedStateProps) {
  return (
    <div className="flow-container gated-container">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{heading}</h2>
      <p>{body}</p>
      <Link href="/start" className="btn-primary">Start the questionnaire</Link>
      <Link href="/login" className="btn-link">Already have an account? Log in</Link>
    </div>
  );
}
