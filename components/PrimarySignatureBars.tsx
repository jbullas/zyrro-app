type PrimarySignatureBarsProps = {
  signatures: { name: string; domain: string; score: number }[];
};

export default function PrimarySignatureBars({ signatures }: PrimarySignatureBarsProps) {
  return (
    <>
      <p className="card-sub-label">Primary Signatures</p>
      {signatures.map((sig, i) => (
        <div key={sig.name} className="sig-row">
          <div className="sig-num-circle">{i + 1}</div>
          <div className="sig-info">
            <div className="sig-name-meta">
              <span className="sig-name">{sig.name}</span>
              <span className="sig-breakdown">{sig.domain}</span>
            </div>
            <div className="sig-bar-track">
              <div className="sig-bar-fill" style={{ width: `${(sig.score / 25) * 100}%` }} />
            </div>
          </div>
          <span className="sig-score-label">{sig.score}</span>
        </div>
      ))}
    </>
  );
}
