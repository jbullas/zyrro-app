type LimitsBlockProps = {
  id?: string; // /identity's section-11 jump-nav anchor target — /plan has none
  eyebrow: string;
  heading?: string; // /identity only — /plan has none
  body: React.ReactNode;
  bullets?: string[]; // /identity only — /plan has none
  cta: React.ReactNode; // always a <PrimaryButton>/<Link className="btn-primary">
};

export default function LimitsBlock({ id, eyebrow, heading, body, bullets, cta }: LimitsBlockProps) {
  return (
    <div id={id} className="limits-block">
      <p className="limits-eyebrow">{eyebrow}</p>
      {heading && <h2 className="limits-heading">{heading}</h2>}
      <p className="limits-body">{body}</p>
      {bullets && (
        <ul className="limits-bullets">
          {bullets.map(b => <li key={b} className="limits-bullet">{b}</li>)}
        </ul>
      )}
      {cta}
    </div>
  );
}
