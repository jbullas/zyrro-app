// #162: what app/api/identity-report returns. Unpaid users under the
// paywall get toLockedIdentityReport's projection, built field by field, so
// nothing locked (deep dives, core_statement, pairings, the distinctive
// pattern, the pattern to notice) can reach them: only presence flags do.
import { toIdentityHero, type IdentityHeroData } from '@/lib/identity-hero';

export type IdentityReportStatus = 'generating' | 'ready' | 'failed';

// A Signatures in Depth row: the free part, and whether a deep dive sits behind it.
export interface LockedSignatureRow {
  name: string;
  domain: string;
  score: number;
  secondary: boolean;
  has_deep_dive: boolean;
}

export interface LockedIdentityReport {
  hero: IdentityHeroData;
  rows: LockedSignatureRow[];
  energisers: string[];
  friction_points: string[];
  has_pairings: boolean;
  has_distinctive_pattern: boolean;
  has_pattern_to_notice: boolean;
  // Not a locked section: /path's unpaid teaser reads it (#162 decision C).
  reframe_teaser: unknown;
}

// `content` is null until the row is ready; then it's the stored report when
// locked is false, or the projection when locked is true. A locked report
// also carries the unlock price, formatted from the Stripe price ("$19"), or
// null if it can't be read.
export type IdentityReportArtifact =
  | { id: string; status: Exclude<IdentityReportStatus, 'ready'>; created_at: string; locked: false; content: null }
  | { id: string; status: 'ready'; created_at: string; locked: false; content: unknown }
  | { id: string; status: 'ready'; created_at: string; locked: true; content: LockedIdentityReport; unlock_price: string | null };

export interface IdentityReportResponse {
  artifact: IdentityReportArtifact | null;
}

// Same presence rules /identity uses to omit a section when it's missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toLockedIdentityReport(report: any): LockedIdentityReport {
  const deepDiveNames = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (report.signature_deep_dives ?? []).map((d: any) => d.name),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (s: any, secondary: boolean): LockedSignatureRow => ({
    name: s.name,
    domain: s.domain,
    score: s.score,
    secondary,
    has_deep_dive: deepDiveNames.has(s.name),
  });
  return {
    hero: toIdentityHero(report),
    rows: [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...report.primary_constellation.map((s: any) => row(s, false)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(report.secondary_signature_analysis ?? []).map((s: any) => row(s, true)),
    ],
    energisers: report.energisers,
    friction_points: report.friction_points,
    has_pairings: Array.isArray(report.pairings) && report.pairings.length > 0,
    has_distinctive_pattern: !!report.distinctive_pattern,
    has_pattern_to_notice: !!report.pattern_to_notice,
    reframe_teaser: report.reframe_teaser ?? null,
  };
}
