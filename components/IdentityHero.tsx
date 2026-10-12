import type { ReactNode } from 'react';
import IdentityBadge from '@/components/IdentityBadge';
import { IDENTITY_REPORT_COPY as COPY, signatureHeadline } from '@/lib/identity-report-copy';
import type { IdentityHeroData } from '@/lib/identity-hero';

// #160: three bands only (Weak retired). Scores are frequency × intensity, 1-25.
function getScoreBand(score: number): string {
  if (score >= 20) return 'Dominant';
  if (score >= 10) return 'Strong';
  return 'Moderate';
}

function bandClass(band: string): string {
  switch (band.toLowerCase()) {
    case 'dominant': return 'band-dominant';
    case 'strong':   return 'band-strong';
    default:         return 'band-moderate';
  }
}

// #7: the /identity hero (hero row + primary signature cards), extracted so
// /identity and the public share page /s/[slug] render the same markup. No
// hooks, so the public page renders it on the server. `action` (the owner's
// Share button) sits in the identity card's top-right corner; the public page
// never passes one.
export default function IdentityHero({ hero, action }: { hero: IdentityHeroData; action?: ReactNode }) {
  const domains = Object.entries(hero.domain_profile).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {/* ── Hero row: identity card + domain profile ─────────────── */}
      <div className="grid-split">
        <div className={`card flex flex-col gap-12${action ? ' relative' : ''}`}>
          <p className="eyebrow">{COPY.hero.eyebrow}</p>
          <h1 className="hero-title">{hero.named_identity}</h1>
          <p className="cover-context-line">{COPY.hero.preparedFor(hero.prepared_for)}</p>
          <p className="identity-thesis">{hero.identity_thesis}</p>
          <p>{hero.synthesis}</p>
          {action && <div className="absolute top-[12px] right-[18px]">{action}</div>}
        </div>

        <div className="card flex flex-col gap-12">
          <p className="eyebrow">{COPY.domains.eyebrow}</p>
          <p className="documentation">{COPY.domains.explanation}</p>
          <div className="flex flex-col gap-12">
            {domains.map(([domain, value]) => (
              <div key={domain} className="flex flex-col gap-8">
                <div className="row-between">
                  <span className="sig-name">{domain}</span>
                  <span className="sig-score-label">{value}</span>
                </div>
                <div className="sig-bar-track sig-bar-track--lg">
                  <div className="sig-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Primary signature cards ─────────────────────────────── */}
      <div className="flex flex-col gap-12">
        <p className="eyebrow">{COPY.primarySignatures.eyebrow}</p>
        <div className="grid-5">
          {hero.primary.map(sig => {
            const band = getScoreBand(sig.score);
            return (
              <div key={sig.name} className="card sig-card">
                <IdentityBadge primarySignatureName={sig.name} size="md" />
                <div className="flex flex-col gap-8">
                  <h3>{sig.name}</h3>
                  <p className="card-sub-label">{sig.domain}</p>
                  <p>{signatureHeadline(sig.name)}</p>
                </div>
                <span className={`score-band-pill ${bandClass(band)}`}>{band}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
