type ConstellationCardProps = {
  badge: React.ReactNode; // the number/rank shown in the badge circle
  muted?: boolean; // use constellation-badge-muted instead of constellation-badge
  title: string;
  meta: React.ReactNode;
  pill?: React.ReactNode; // optional score-band/stretch pill — caller renders it fully,
                           // this component just places it, doesn't compute its class
  children: React.ReactNode; // body — varies per call site, not this component's concern
};

export default function ConstellationCard({ badge, muted, title, meta, pill, children }: ConstellationCardProps) {
  return (
    <div className="card constellation-card">
      <div className="constellation-card-header">
        <div className={muted ? 'constellation-badge-muted' : 'constellation-badge'}>{badge}</div>
        <div className="constellation-header-info">
          <h3>{title}</h3>
          <div className="constellation-sig-meta">{meta}</div>
        </div>
        {pill}
      </div>
      <div className="constellation-card-body">
        {children}
      </div>
    </div>
  );
}
