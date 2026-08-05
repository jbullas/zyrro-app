'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import ConstellationCard from '@/components/ConstellationCard';
import ChipRow from '@/components/ChipRow';
import LimitsBlock from '@/components/LimitsBlock';
import IdentityBadge from '@/components/IdentityBadge';
import DomainRadarChart from '@/components/DomainRadarChart';
import PrimarySignatureBars from '@/components/PrimarySignatureBars';
import { useGenerationStatus } from '@/lib/generation-status';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentityReframeArtifactContent } from '@/lib/artifact-schemas';

type PageState = 'loading' | 'anonymous' | 'no-questionnaire' | 'has-artifact';

interface PrimarySignatureEntry {
  signature_number: string;
  name: string;
  domain: string;
  score: number;
  core_statement: string;
  evidence_analysis: string;
  tension: string;
  frequency?: number;
  intensity?: number;
  confidence?: string;
}

interface SecondarySignatureEntry {
  signature_number: string;
  name: string;
  domain: string;
  score: number;
  core_statement: string;
  analysis: string;
}

interface IdentityReport {
  cover: {
    prepared_for: string;
    named_identity: string;
    identity_context: string;
    report_metadata: string;
    identity_thesis: string;
  };
  primary_constellation: PrimarySignatureEntry[];
  secondary_signature_summary: string;
  secondary_signature_analysis: SecondarySignatureEntry[];
  constellation_synthesis: {
    named_identity: string;
    synthesis: string;
  };
  how_you_operate: {
    work_style: string;
    thinking_style: string;
    relationship_style: string;
    decision_style: string;
    stress_pattern: string;
  };
  energisers: string[];
  friction_points: string[];
  domain_profile: {
    Visioning: number;
    Thinking: number;
    Connecting: number;
    Driving: number;
    Sensing: number;
  };
}

const SCORING_EXPLANATION =
  'Each signature score reflects two dimensions: Frequency, how often the pattern shows up across ' +
  'your history, and Intensity, how strongly it shows up when it does. The five highest-scoring ' +
  'signatures form your Primary Constellation — the patterns that most consistently and forcefully ' +
  'define how you operate. Beyond the Top 5, any pattern that still cleared the evidence bar appears ' +
  'as a Secondary Signature: a real, established pattern that shows up less often or with less force, ' +
  'but still shapes how you think, act, and respond under specific conditions. Together, these describe ' +
  'not just what you do, but how reliably and how strongly you do it.';

const HOW_OPERATE_LABELS: { key: keyof IdentityReport['how_you_operate']; label: string }[] = [
  { key: 'work_style',         label: 'WORK STYLE' },
  { key: 'thinking_style',     label: 'THINKING STYLE' },
  { key: 'relationship_style', label: 'RELATIONSHIP STYLE' },
  { key: 'decision_style',     label: 'DECISION STYLE' },
  { key: 'stress_pattern',     label: 'STRESS PATTERN' },
];

function splitNamedIdentity(namedIdentity: string): [string, string] {
  const idx = namedIdentity.lastIndexOf(' ');
  if (idx === -1) return [namedIdentity, ''];
  return [namedIdentity.slice(0, idx), namedIdentity.slice(idx + 1)];
}

function getScoreBand(score: number): string {
  if (score >= 20) return 'Dominant';
  if (score >= 14) return 'Strong';
  if (score >= 8)  return 'Moderate';
  return 'Weak';
}

function bandClass(band: string): string {
  switch (band.toLowerCase()) {
    case 'dominant': return 'band-dominant';
    case 'strong':   return 'band-strong';
    case 'moderate': return 'band-moderate';
    default:         return 'band-weak';
  }
}

export default function IdentityPage() {
  const router = useRouter();
  const [pageState, setPageState]   = useState<PageState>('loading');
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [userId, setUserId]         = useState<string | null>(null);

  const genPhase   = useGenerationStatus(artifactId);
  const report     = genPhase.phase === 'ready' ? genPhase.content as IdentityReport : null;

  // #98: "What does this mean?" pitch (identity_reframe) — generation fires
  // eagerly the moment the report finishes rendering, independent of the
  // click; the click only gates visibility (see reframeRevealed below).
  const [reframeArtifactId, setReframeArtifactId] = useState<string | null>(null);
  const [reframeRevealed, setReframeRevealed]     = useState(false);
  const [checkoutLoading, setCheckoutLoading]     = useState(false);
  const reframeFired = useRef(false);

  const reframeGenPhase = useGenerationStatus(reframeArtifactId);
  const reframe = reframeGenPhase.phase === 'ready' ? reframeGenPhase.content as IdentityReframeArtifactContent : null;

  useEffect(() => {
    if (genPhase.phase !== 'ready' || !userId || reframeFired.current) return;
    reframeFired.current = true;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data } = await getCurrentArtifact<{ id: string }>(
        supabase,
        userId,
        'identity_reframe',
        { select: 'id' },
      );
      if (cancelled) return;
      if (data) {
        setReframeArtifactId(data.id as string);
        return;
      }
      const res = await fetch('/api/generate-identity-reframe', { method: 'POST' });
      if (cancelled) return;
      if (res.ok) {
        const { artifact_id } = await res.json() as { artifact_id: string };
        setReframeArtifactId(artifact_id);
      }
    })();

    return () => { cancelled = true; };
  }, [genPhase.phase, userId]);

  async function handleRevealReframe() {
    setReframeRevealed(true);
  }

  async function handleRetryReframe() {
    setReframeArtifactId(null);
    const res = await fetch('/api/generate-identity-reframe', { method: 'POST' });
    if (res.ok) {
      const { artifact_id } = await res.json() as { artifact_id: string };
      setReframeArtifactId(artifact_id);
    }
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

  // Main load — finds the artifact ID and hands polling to useGenerationStatus
  useEffect(() => {
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

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

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
    }

    init();
    return () => { cancelled = true; };
  }, [router]);

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
    secondary_signature_summary,
    secondary_signature_analysis,
    constellation_synthesis,
    how_you_operate,
    energisers,
    friction_points,
    domain_profile,
  } = report;

  const [nameLine1, nameLine2] = splitNamedIdentity(cover.named_identity);

  return (
    <div className="flow-container">
      <div className="report-scroll">

        {/* ── Section 0: Cover ─────────────────────────────── */}
        <div className="report-cover">
          <p className="eyebrow">Identity Signature Report</p>
          <IdentityBadge primarySignatureName={primary_constellation[0]?.name} />
          <h1>
            {nameLine2 ? <>{nameLine1}<br />{nameLine2}</> : nameLine1}
          </h1>
          <p className="cover-context-line">{cover.prepared_for} · {cover.identity_context}</p>
          <p className="identity-thesis">{cover.identity_thesis}</p>
          <p>{constellation_synthesis.synthesis}</p>
        </div>

        {/* #100 Stage 1 (2026-08-04): reordered into Cover / Signatures /
            How You Operate / What's Next — see brief for the target order
            and the removal list (TOC, What This Report Is, Research
            Foundation all dropped; content preserved for #91 in
            docs/content/identity-static-content-for-91.md, not rendered). */}
        <div className="report-sections">

          {/* ── Cover (cont'd): Signature Profile — score list + radar ─── */}
          <div className="report-section">
            <p className="eyebrow">SIGNATURE PROFILE</p>
            <p>{SCORING_EXPLANATION}</p>

            <div className="card">
              <PrimarySignatureBars signatures={primary_constellation} numbered={false} />

              {secondary_signature_analysis.length > 0 && (
                <>
                  <p className="card-sub-label">Secondary Signatures</p>
                  {secondary_signature_analysis.map((sig) => (
                    <div key={sig.name} className="sig-row">
                      <div className="sig-info">
                        <div className="sig-name-meta">
                          <span className="sig-name">{sig.name}</span>
                          <span className="sig-breakdown">{sig.domain}</span>
                        </div>
                        <div className="sig-bar-track">
                          <div className="sig-bar-fill-muted" style={{ width: `${(sig.score / 25) * 100}%` }} />
                        </div>
                      </div>
                      <span className="sig-score-label-muted">{sig.score}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="card">
              <p className="card-sub-label">Identity Profile</p>
              <DomainRadarChart domainProfile={domain_profile} />
            </div>
          </div>

          {/* ── Signatures: Primary ──────────────────────────────────── */}
          <div className="report-section">
            <p className="eyebrow">PRIMARY SIGNATURES</p>
            {primary_constellation.map((sig, i) => {
              const band = getScoreBand(sig.score);
              return (
                <ConstellationCard
                  key={sig.name}
                  badge={i + 1}
                  title={sig.name}
                  meta={`${sig.domain} · ${sig.score}/25`}
                  pill={<span className={`score-band-pill ${bandClass(band)}`}>{band}</span>}
                >
                  <p className="core-statement">{sig.core_statement}</p>
                  <p className="evidence-analysis">{sig.evidence_analysis}</p>
                  <div className="tension-block">
                    <span className="tension-label">TENSION</span>
                    <p className="tension-text">{sig.tension}</p>
                  </div>
                  <div className="scoring-chips">
                    <div className="score-chip">
                      <span className="score-chip-label">Frequency</span>
                      <span className="score-chip-value">{sig.frequency ?? '—'}</span>
                    </div>
                    <div className="score-chip">
                      <span className="score-chip-label">Intensity</span>
                      <span className="score-chip-value">{sig.intensity ?? '—'}</span>
                    </div>
                    <div className="score-chip">
                      <span className="score-chip-label">Score</span>
                      <span className="score-chip-value">{sig.score}</span>
                    </div>
                    <div className="score-chip">
                      <span className="score-chip-label">Confidence</span>
                      <span className="score-chip-value">{sig.confidence ?? '—'}</span>
                    </div>
                  </div>
                </ConstellationCard>
              );
            })}
          </div>

          {/* ── Signatures: Secondary ────────────────────────────────── */}
          <div className="report-section">
            <p className="eyebrow">SECONDARY SIGNATURES</p>
            <p>{secondary_signature_summary}</p>
            {secondary_signature_analysis.map((sig, i) => (
              <ConstellationCard
                key={sig.name}
                badge={i + 6}
                muted
                title={sig.name}
                meta={`${sig.domain} · ${sig.score}`}
              >
                <p className="core-statement">{sig.core_statement}</p>
                <p className="evidence-analysis">{sig.analysis}</p>
              </ConstellationCard>
            ))}
          </div>

          {/* ── How You Operate — Energisers and Friction Points folded in
              here rather than standing alone as separate top-level sections
              (2026-08-04 decision). ────────────────────────────────────── */}
          <div className="report-section">
            <p className="eyebrow">HOW YOU OPERATE</p>
            <div className="card">
              {HOW_OPERATE_LABELS.map(({ key, label }) => (
                <div key={key} className="operate-section">
                  <p className="eyebrow">{label}</p>
                  <p className="operate-text">{how_you_operate[key]}</p>
                </div>
              ))}
            </div>

            <p className="eyebrow">ENERGISERS</p>
            <ChipRow items={energisers} wrapperClassName="chips-wrap" />

            <p className="eyebrow">FRICTION POINTS</p>
            <ChipRow items={friction_points} wrapperClassName="chips-wrap" itemClassName="chip-friction" />
          </div>

        </div>{/* end .report-sections */}

        {/* What's Next: click-gated identity_reframe pitch (#98) — unchanged
            behavior/position, per #100 Stage 1's protected exception. */}
        <div className="report-section">
          {!reframeRevealed && (
            <LimitsBlock
              eyebrow="WHAT DOES THIS MEAN?"
              body="You now have a precise picture of your identity patterns. There’s more to what it’s pointing toward."
              cta={<PrimaryButton onClick={handleRevealReframe}>What does this mean? →</PrimaryButton>}
            />
          )}

          {reframeRevealed && (reframeGenPhase.phase === 'idle' || reframeGenPhase.phase === 'spinner') && (
            <div className="limits-block" style={{ textAlign: 'center' }}>
              <div className="spin spinner" />
            </div>
          )}

          {reframeRevealed && reframeGenPhase.phase === 'come-back-later' && (
            <div className="limits-block">
              <p className="limits-body">This is taking longer than expected — check back in a few minutes.</p>
            </div>
          )}

          {reframeRevealed && reframeGenPhase.phase === 'failed' && (
            <div className="limits-block">
              <p className="limits-body">Something went wrong preparing this.</p>
              <PrimaryButton onClick={handleRetryReframe}>Try again</PrimaryButton>
            </div>
          )}

          {reframeRevealed && reframe && (
            <div className="limits-block">
              <p className="eyebrow">WHAT WE&rsquo;RE WORKING WITH</p>
              <p>{reframe.recap}</p>

              <p className="eyebrow">WHAT THIS MEANS FOR WHAT&rsquo;S NEXT</p>
              <p>{reframe.meaning}</p>

              <p className="eyebrow">WHERE YOUR STORY IS POINTING</p>
              <p>{reframe.reframe}</p>

              <p className="eyebrow">WHY THE REFRAME HOLDS</p>
              <p>{reframe.why}</p>

              <PrimaryButton onClick={handleCheckout} disabled={checkoutLoading}>
                {checkoutLoading ? 'Redirecting…' : 'Get My Path & Plan'}
              </PrimaryButton>
            </div>
          )}
        </div>

      </div>{/* end .report-scroll */}
    </div>
  );
}
