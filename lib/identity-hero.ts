// #7: the top of the Identity report, shared by /identity and the public
// share page /s/[slug]. toIdentityHero is the ONLY way report content reaches
// the public page: it copies the hero fields and nothing else, so the full
// report (deep dives, evidence, secondaries, energisers, …) never leaves the
// server there.

export interface IdentityHeroSignature {
  name: string;
  domain: string;
  score: number;
}

export interface IdentityHeroData {
  named_identity: string;
  prepared_for: string;
  identity_thesis: string;
  synthesis: string;
  domain_profile: Record<string, number>;
  primary: IdentityHeroSignature[];
}

// Same missing-data handling /identity has always had: domain_profile may be
// absent (rendered as no bars); everything else is present on every ready
// report.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toIdentityHero(report: any): IdentityHeroData {
  return {
    named_identity: report.cover.named_identity,
    prepared_for: report.cover.prepared_for,
    identity_thesis: report.cover.identity_thesis,
    synthesis: report.constellation_synthesis.synthesis,
    domain_profile: report.domain_profile ?? {},
    primary: (report.primary_constellation as IdentityHeroSignature[]).map(s => ({
      name: s.name,
      domain: s.domain,
      score: s.score,
    })),
  };
}
