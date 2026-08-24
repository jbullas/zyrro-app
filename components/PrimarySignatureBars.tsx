type PrimarySignatureBarsProps = {
  signatures: { name: string; domain: string; score: number }[];
  showLabel?: boolean; // default true — /identity passes false, the
                        // dashboard IdentityCard keeps its default
  startBadge?: number; // default 1 — /identity's Signature Profile card
                        // passes 6 for the secondary-signature call so its
                        // badges continue the primary list's 1-5 numbering
};

export default function PrimarySignatureBars({ signatures, showLabel = true, startBadge = 1 }: PrimarySignatureBarsProps) {
  return (
    <>
      {showLabel && <p className="card-sub-label">Primary Signatures</p>}
      {signatures.map((sig, i) => (
        <div key={sig.name} className="sig-row">
          <div className="sig-num-circle">{startBadge + i}</div>
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
