type MessageStateProps = {
  eyebrow: string;
  heading: string;
  headingLevel?: 'h1' | 'h2'; // default 'h2'
  body: React.ReactNode;
  cta?: React.ReactNode; // usually a <PrimaryButton>/<LinkButton>, but any node
};

export default function MessageState({ eyebrow, heading, headingLevel, body, cta }: MessageStateProps) {
  return (
    <div className="flow-container gated-container">
      <p className="eyebrow">{eyebrow}</p>
      {headingLevel === 'h1' ? <h1>{heading}</h1> : <h2>{heading}</h2>}
      <p>{body}</p>
      {cta}
    </div>
  );
}
