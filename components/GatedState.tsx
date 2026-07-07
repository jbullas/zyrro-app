import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';

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
      <PrimaryButton href="/start">Start the questionnaire</PrimaryButton>
      <LinkButton href="/login">Already have an account? Log in</LinkButton>
    </div>
  );
}
