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
    <div className="constellation-card">
      <div className="constellation-card-header">
        <div className={muted ? 'constellation-badge-muted' : 'constellation-badge'}>{badge}</div>
        <div className="constellation-header-info">
          <div className="constellation-sig-name">{title}</div>
          <div className="constellation-sig-meta">{meta}</div>
        </div>
        {pill}
      </div>
      {children}
    </div>
  );
}
