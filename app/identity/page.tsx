'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowRight, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { createClient } from '@/utils/supabase/client';
import { useAuthUser } from '@/lib/use-auth-user';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import IdentityBadge from '@/components/IdentityBadge';
import { useGenerationStatus } from '@/lib/generation-status';
import { getCurrentArtifact } from '@/lib/artifacts';
import { IDENTITY_REPORT_COPY as COPY, signatureHeadline } from '@/lib/identity-report-copy';
import type {
  SignatureDeepDive,
  PairingLine,
  DistinctivePattern,
  PatternToNotice,
} from '@/lib/artifact-schemas';

type PageState = 'loading' | 'anonymous' | 'no-questionnaire' | 'has-artifact';

interface PrimarySignatureEntry {
  name: string;
  domain: string;
  score: number;
  core_statement: string;
}

interface SecondarySignatureEntry {
  name: string;
  domain: string;
  score: number;
  core_statement: string;
}

// Only the fields /identity renders. Layer 3 fields (#154 step 1) are optional:
// absent on pre-1.4 reports and on any 1.4 report whose Layer 3 call failed.
interface IdentityReport {
  cover: {
    prepared_for: string;
    named_identity: string;
    identity_thesis: string;
  };
  primary_constellation: PrimarySignatureEntry[];
  secondary_signature_analysis?: SecondarySignatureEntry[];
  constellation_synthesis: { synthesis: string };
  energisers: string[];
  friction_points: string[];
  domain_profile: Record<string, number>;
  signature_deep_dives?: SignatureDeepDive[];
  pairings?: PairingLine[];
  distinctive_pattern?: DistinctivePattern;
  pattern_to_notice?: PatternToNotice;
}

type SignatureRowData = {
  name: string;
  domain: string;
  score: number;
  coreStatement: string;
  secondary: boolean;
};

function getScoreBand(score: number): string {
  if (score >= 20) return 'Dominant';
  if (score >= 14) return 'Strong';
  if (score >= 8)  return 'Moderate';
  return 'Weak';
}

// Hero signature cards show Dominant / Strong / Moderate only (#154): a score
// that would be "Weak" shows Moderate. Applied here, not inside getScoreBand.
function heroBand(score: number): string {
  const band = getScoreBand(score);
  return band === 'Weak' ? 'Moderate' : band;
}

function bandClass(band: string): string {
  switch (band.toLowerCase()) {
    case 'dominant': return 'band-dominant';
    case 'strong':   return 'band-strong';
    default:         return 'band-moderate';
  }
}

// what_this_means is a [string, string] on current reports, but reports from
// between the step 1 iterations stored a single string: render that as one
// paragraph rather than failing.
function paragraphs(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

// Distinctive Pattern steps sometimes arrive lowercase ("explore"); show them
// sentence-cased on the chips.
function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function rowId(name: string): string {
  return `deep-dive-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export default function IdentityPage() {
  const router = useRouter();
  const [pageState, setPageState]   = useState<PageState>('loading');
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [userId, setUserId]         = useState<string | null>(null);
  // Same entitlement read as app/path/page.tsx: null until checked.
  const [entitled, setEntitled]     = useState<boolean | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [openRows, setOpenRows]     = useState<Set<string>>(new Set());

  const genPhase   = useGenerationStatus(artifactId);
  const report     = genPhase.phase === 'ready' ? genPhase.content as IdentityReport : null;

  const { user: authUser, loading: authLoading } = useAuthUser();

  // Main load — finds the artifact ID and hands polling to useGenerationStatus
  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    let cancelled  = false;

    async function loadArtifact(uid: string) {
      const { data, error } = await getCurrentArtifact<{ id: string }>(
        supabase,
        uid,
        'identity_report',
        { select: 'id' },
      );

      if (cancelled) return;
      if (error) { router.push('/login'); return; }
      if (!data) { setPageState('no-questionnaire'); return; }

      setArtifactId(data.id as string);
      setPageState('has-artifact');
    }

    function readAnswersCount(uid: string) {
      return supabase
        .from('discovery_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
    }

    // Mirrors app/path/page.tsx's entitlement gate exactly, including the
    // NEXT_PUBLIC_OPEN_ACCESS bypass. Read-only: entitlement and checkout
    // logic are unchanged.
    async function loadEntitlement(uid: string) {
      if (process.env.NEXT_PUBLIC_OPEN_ACCESS === 'true') {
        if (!cancelled) setEntitled(true);
        return;
      }
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', uid)
        .eq('product', 'onetime_payment')
        .eq('status', 'active')
        .maybeSingle();
      if (!cancelled) setEntitled(!!entitlement);
    }

    async function init() {
      const user = authUser;

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      if (cancelled) return;
      setUserId(user.id);

      const { count, error } = await readAnswersCount(user.id);
      if (cancelled) return;

      if (error) {
        router.push('/login');
        return;
      }

      if (!count || count === 0) {
        setPageState('no-questionnaire');
        return;
      }

      await loadArtifact(user.id);
      await loadEntitlement(user.id);
    }

    init();
    return () => { cancelled = true; };
  }, [router, authLoading, authUser]);

  // ── Loading ────────────────────────────────────────────────────────
  if (pageState === 'loading') return null;

  // ── State 1: Anonymous ─────────────────────────────────────────────
  if (pageState === 'anonymous') {
    return (
      <MessageState
        eyebrow="IDENTITY SIGNATURE REPORT"
        heading="Your Identity Signature Report is waiting."
        headingLevel="h1"
        body="Create a free account to access your Named Identity and full Identity Signature Report."
        cta={<PrimaryButton href="/start">Start the questionnaire</PrimaryButton>}
      />
    );
  }

  // ── State 2: No questionnaire ──────────────────────────────────────
  if (pageState === 'no-questionnaire') {
    return (
      <MessageState
        eyebrow="IDENTITY SIGNATURE REPORT"
        heading="Your report isn’t ready yet."
        headingLevel="h1"
        body="Complete the questionnaire to generate your Identity Signature Report."
        cta={<PrimaryButton href="/start">Start the questionnaire</PrimaryButton>}
      />
    );
  }

  async function handleRetry() {
    setArtifactId(null);
    const supabase = createClient();
    await fetch('/api/retry-generation', { method: 'POST' });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await getCurrentArtifact<{ id: string }>(
      supabase,
      user.id,
      'identity_report',
      { select: 'id' },
    );
    if (data) setArtifactId(data.id);
  }

  async function handleCheckout() {
    if (!userId) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const { url, error } = await res.json() as { url?: string; error?: string };
      if (error || !url) throw new Error(error ?? 'No checkout URL');
      window.location.href = url;
    } catch (err) {
      console.error('Checkout failed:', err);
      setCheckoutLoading(false);
    }
  }

  // Both "Find your path" buttons: entitled users go straight to /path, everyone
  // else starts the existing checkout.
  function handleFindPath() {
    if (entitled) {
      router.push('/path');
      return;
    }
    handleCheckout();
  }

  // ── has-artifact: hook-driven generation states ────────────────────
  if (genPhase.phase === 'idle') {
    return (
      <GeneratingState
        heading="Your Identity Signature Report is being prepared."
        description="This usually takes about a minute."
      />
    );
  }

  if (genPhase.phase === 'spinner') {
    return (
      <GeneratingState
        heading="Your Identity Signature Report is being prepared."
        description={
          genPhase.variant === 'early'
            ? 'This usually takes about a minute.'
            : 'Still working — this is taking a little longer than usual…'
        }
      />
    );
  }

  if (genPhase.phase === 'come-back-later') {
    return (
      <GeneratingState
        spinner={false}
        description="Your report is still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It’ll be here when it’s ready."
      />
    );
  }

  if (genPhase.phase === 'failed') {
    return (
      <MessageState
        eyebrow="IDENTITY SIGNATURE REPORT"
        heading="Something went wrong."
        body="We couldn’t generate your report. Please try again."
        cta={<PrimaryButton onClick={handleRetry}>Try again</PrimaryButton>}
      />
    );
  }

  // ── State 3c: Ready ────────────────────────────────────────────────
  if (!report) return null;

  const {
    cover,
    primary_constellation,
    constellation_synthesis,
    energisers,
    friction_points,
    domain_profile,
    pairings,
    distinctive_pattern,
    pattern_to_notice,
  } = report;
  const secondaries = report.secondary_signature_analysis ?? [];

  const deepDives = new Map((report.signature_deep_dives ?? []).map(d => [d.name, d]));
  const secondaryNames = new Set(secondaries.map(s => s.name));
  const rows: SignatureRowData[] = [
    ...primary_constellation.map(s => ({ name: s.name, domain: s.domain, score: s.score, coreStatement: s.core_statement, secondary: false })),
    ...secondaries.map(s => ({ name: s.name, domain: s.domain, score: s.score, coreStatement: s.core_statement, secondary: true })),
  ];
  const domains = Object.entries(domain_profile ?? {}).sort((a, b) => b[1] - a[1]);
  const hasPairings = Array.isArray(pairings) && pairings.length > 0;
  const hasPattern = !!distinctive_pattern;
  const ctaDisabled = checkoutLoading || entitled === null;

  function toggleRow(name: string) {
    setOpenRows(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function findPathButton(label: string, light = false) {
    return (
      <button
        type="button"
        className={`btn-cta${light ? ' btn-cta--light' : ''}`}
        onClick={handleFindPath}
        disabled={ctaDisabled}
      >
        {checkoutLoading ? 'Redirecting…' : label}
        <IconArrowRight size={18} stroke={2.2} aria-hidden="true" />
      </button>
    );
  }

  const pairingsCard = hasPairings && (
    <div className="card flex flex-col gap-12">
      <p className="eyebrow">{COPY.pairings.eyebrow}</p>
      <div className="divided-list">
        {pairings!.map(p => (
          <div key={`${p.a}|${p.b}`} className="flex flex-col gap-8">
            <h3>{COPY.pairings.title(p.a, p.b)}</h3>
            <p>{p.line}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const patternCard = hasPattern && (
    <div className="card flex flex-col gap-12">
      <p className="eyebrow">{COPY.distinctivePattern.eyebrow}</p>
      <div className="chips-wrap items-center">
        {distinctive_pattern!.steps.map((step, i) => (
          <span key={`${step}-${i}`} className="inline-flex items-center gap-8">
            <span className="chip-tag">{capitalise(step)}</span>
            {i < distinctive_pattern!.steps.length - 1 && (
              <IconArrowRight size={18} stroke={2.2} color="var(--color-grad-2)" aria-hidden="true" />
            )}
          </span>
        ))}
      </div>
      {paragraphs(distinctive_pattern!.paragraphs).map((para, i) => <p key={i}>{para}</p>)}
    </div>
  );

  return (
    <div className="flow-container flow-container--wide">
      <div className="scroll gap-16">

        {/* ── Hero row: identity card + domain profile ─────────────── */}
        <div className="grid-split">
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.hero.eyebrow}</p>
            <h1 className="hero-title">{cover.named_identity}</h1>
            <p className="cover-context-line">{COPY.hero.preparedFor(cover.prepared_for)}</p>
            <p className="identity-thesis">{cover.identity_thesis}</p>
            <p>{constellation_synthesis.synthesis}</p>
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
            {primary_constellation.map(sig => {
              const band = heroBand(sig.score);
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

        {/* ── Hero Path CTA ───────────────────────────────────────── */}
        <div className="cta-card">
          <div className="flex flex-col gap-8">
            <h3>{COPY.heroCta.heading}</h3>
            <p>{COPY.heroCta.body}</p>
            <p className="cover-context-line">{COPY.heroCta.price}</p>
          </div>
          {findPathButton(COPY.heroCta.button)}
        </div>

        {/* ── Signatures in depth: one row per signature ──────────── */}
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-8">
            <p className="eyebrow">{COPY.depth.eyebrow}</p>
            <p className="documentation">{COPY.depth.scoreExplanation}</p>
          </div>
          {rows.map(row => {
            const dive = deepDives.get(row.name);
            const open = !!dive && openRows.has(row.name);
            const scored = row.score >= 1;
            const id = rowId(row.name);
            return (
              <div key={row.name} className={`card flex flex-col gap-20${open ? ' card--active' : ''}`}>
                <div className="sig-depth-row">
                  <IdentityBadge primarySignatureName={row.name} size="sm" muted={row.secondary} />
                  <div className="flex flex-col gap-4">
                    <h3>{row.name}</h3>
                    <p className="card-sub-label">{row.domain}</p>
                  </div>
                  <div className="sig-bar-track sig-bar-track--lg">
                    {scored && (
                      <div
                        className={row.secondary ? 'sig-bar-fill-muted' : 'sig-bar-fill'}
                        style={{ width: `${Math.min(100, (row.score / 25) * 100)}%` }}
                      />
                    )}
                  </div>
                  <span className={row.secondary ? 'sig-score-label-muted' : 'sig-score-label'}>
                    {scored ? COPY.depth.scoreOutOf(row.score) : COPY.depth.noScore}
                  </span>
                  {dive ? (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-expanded={open}
                      aria-controls={id}
                      aria-label={open ? COPY.depth.collapse(row.name) : COPY.depth.expand(row.name)}
                      onClick={() => toggleRow(row.name)}
                    >
                      {open ? <IconChevronUp size={20} stroke={2} /> : <IconChevronDown size={20} stroke={2} />}
                    </button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>
                {dive && open && (
                  <DeepDive
                    id={id}
                    name={row.name}
                    coreStatement={row.coreStatement}
                    dive={dive}
                    secondaryNames={secondaryNames}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Pairings + Distinctive Pattern (each omitted when missing) ── */}
        {pairingsCard && patternCard ? (
          <div className="grid-2">{pairingsCard}{patternCard}</div>
        ) : (pairingsCard || patternCard || null)}

        {/* ── Energy / Drains ─────────────────────────────────────── */}
        <div className="grid-2">
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.energy.eyebrow}</p>
            <ul className="energiser-bullets">
              {energisers.map(item => (
                <li key={item}><span className="bullet-icon">+</span><span>{item}</span></li>
              ))}
            </ul>
          </div>
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.drains.eyebrow}</p>
            <ul className="friction-bullets">
              {friction_points.map(item => (
                <li key={item}><span className="bullet-icon">–</span><span>{item}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Path invitation ─────────────────────────────────────── */}
        <div className="row-between flex-wrap gap-16">
          <p>{COPY.pathInvitation.body}</p>
          <LinkButton href="/path" inline>
            <span className="inline-flex items-center gap-8">
              {COPY.pathInvitation.link}
              <IconArrowRight size={16} stroke={2.2} aria-hidden="true" />
            </span>
          </LinkButton>
        </div>

        {/* ── The Pattern to Notice ───────────────────────────────── */}
        {pattern_to_notice && (
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.patternToNotice.eyebrow}</p>
            <h2>{pattern_to_notice.headline}</h2>
            <p>{pattern_to_notice.body}</p>
            <p><strong>{pattern_to_notice.takeaway}</strong></p>
          </div>
        )}

        {/* ── Bottom CTA strip ────────────────────────────────────── */}
        <div className="section-cta section-cta--report">
          <div className="flex flex-col gap-8">
            <h2>{COPY.bottomCta.heading}</h2>
            <p>{COPY.bottomCta.body}</p>
          </div>
          <div>
            {findPathButton(COPY.bottomCta.button, true)}
            <p>{COPY.bottomCta.price}</p>
          </div>
        </div>

        {/* ── Footer (no links until Privacy/Terms/Help pages exist — #157) ── */}
        <footer className="report-footer">
          <p className="documentation">{COPY.footer.disclaimer}</p>
        </footer>

      </div>{/* end .scroll */}
    </div>
  );
}

function DeepDive({
  id,
  name,
  coreStatement,
  dive,
  secondaryNames,
}: {
  id: string;
  name: string;
  coreStatement: string;
  dive: SignatureDeepDive;
  secondaryNames: Set<string>;
}) {
  const labels = COPY.deepDive.operatingLabels;
  return (
    <div id={id} className="flex flex-col gap-20">
      <div className="flex flex-col gap-8">
        <h2>{signatureHeadline(name)}</h2>
        <p>{coreStatement}</p>
      </div>

      <div className="grid-split">
        <div className="flex flex-col gap-20">
          <div className="flex flex-col gap-8">
            <p className="eyebrow">{COPY.deepDive.whatThisMeans}</p>
            {paragraphs(dive.what_this_means).map((para, i) => <p key={i}>{para}</p>)}
          </div>
          {dive.evidence.length > 0 && (
            <div className="flex flex-col gap-12">
              <p className="eyebrow">{COPY.deepDive.evidence}</p>
              {dive.evidence.map((e, i) => <p key={i} className="evidence-item">{e.text}</p>)}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-12">
          <div className="panel flex flex-col gap-8">
            <p className="eyebrow">{COPY.deepDive.showsUp}</p>
            <ul className="bullet-list">
              {dive.shows_up.map(item => <li key={item} className="bullet-item"><span className="bullet-dot" />{item}</li>)}
            </ul>
          </div>
          <div className="panel flex flex-col gap-8">
            <p className="eyebrow">{COPY.deepDive.servesYou}</p>
            <ul className="bullet-list">
              {dive.serves_you.map(item => <li key={item} className="bullet-item"><span className="bullet-dot" />{item}</li>)}
            </ul>
          </div>
        </div>
      </div>

      {dive.works_with.length > 0 && (
        <div className="flex flex-col gap-12">
          <p className="eyebrow">{COPY.deepDive.worksWith}</p>
          <div className="grid-2">
            {dive.works_with.map(w => (
              <div key={w.partner} className="panel flex flex-col gap-8">
                <div className="flex items-center gap-12">
                  <IdentityBadge primarySignatureName={w.partner} size="sm" muted={secondaryNames.has(w.partner)} />
                  <h3>{w.partner}</h3>
                </div>
                <p>{w.text}</p>
                <p className="evidence-item">{w.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-12">
        <p className="eyebrow">{COPY.deepDive.operating}</p>
        <div className="grid-4">
          {(Object.keys(labels) as (keyof typeof labels)[]).map(key => (
            <div key={key} className="panel flex flex-col gap-8">
              <h3>{labels[key]}</h3>
              <p>{dive.operating[key]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel panel--warm flex flex-col gap-8">
          <p className="eyebrow">{COPY.deepDive.friction}</p>
          <p>{dive.friction}</p>
        </div>
        <div className="panel panel--warm flex flex-col gap-8">
          <p className="eyebrow">{COPY.deepDive.underPressure}</p>
          <p>{dive.under_pressure}</p>
        </div>
      </div>
    </div>
  );
}
