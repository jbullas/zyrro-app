// Extracted from app/path/page.tsx (#134 Slice 1) so components/DirectionFlow.tsx
// can share it without duplicating this markup — was previously a local
// function component only page.tsx needed.
export default function SubmitError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="card" style={{ background: 'rgba(198,5,103,0.06)' }}>
      <p>{error}</p>
    </div>
  );
}
