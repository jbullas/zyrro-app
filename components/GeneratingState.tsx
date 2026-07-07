type GeneratingStateProps = {
  spinner?: boolean; // default true
  heading?: string; // omit entirely if no heading for this state
  description?: React.ReactNode; // omit entirely if no description for this state
};

export default function GeneratingState({ spinner, heading, description }: GeneratingStateProps) {
  return (
    <div className="flow-container generating-container">
      {spinner !== false && <div className="spin spinner" />}
      <div className="text-center-col">
        {heading && <h2>{heading}</h2>}
        {description && <p className="generating-desc">{description}</p>}
      </div>
    </div>
  );
}
