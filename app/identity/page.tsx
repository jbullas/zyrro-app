'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import ConstellationCard from '@/components/ConstellationCard';
import ChipRow from '@/components/ChipRow';
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
  domain_profile_summary?: string;
}

const DOMAIN_PROFILE_EXPLANATION =
  'Your identity lives at the intersection of 5 domains: Visioning, Thinking, Connecting, Driving, ' +
  'and Sensing. Each domain is made up of 5 possible signatures, the specific patterns that define ' +
  'how you operate. Your Domain Profile score is calculated from the combined strength of whichever ' +
  'signatures were detected within each domain: a high score means more of your strongest patterns ' +
  'cluster there, a low score means fewer do. This is a summary view of the same evidence used to ' +
  'identify the signatures below.';

const PRIMARY_SIGNATURES_EXPLANATION =
  'Your Primary Signatures are the patterns that most consistently and forcefully define how you ' +
  'operate. They are not preferences you’ve expressed, but patterns detected directly in what you ' +
  'described about your own history. Each is scored on two dimensions: Frequency, how often it shows ' +
  'up across your history, and Intensity, how strongly it shows up when it does. The five ' +
  'highest-scoring patterns form your Primary Constellation.';

const SECONDARY_SIGNATURES_EXPLANATION =
  'Secondary Signatures are patterns detected in your history that cleared the evidence bar, but ' +
  'showed up less often or with less force than the patterns in your Primary Constellation. They are ' +
  'still real, established patterns, not weaker guesses, and they still shape how you think, act, and ' +
  'respond in specific situations, just not as consistently as your top five. If this section is short ' +
  'or empty, that’s informative too: it means your operating patterns are concentrated rather than ' +
  'spread across many active signatures.';

const HOW_YOU_OPERATE_EXPLANATION =
  'Your signatures describe stable patterns. How You Operate shows what those patterns actually look ' +
  'like in practice: the conditions you gravitate toward at work, the way your mind naturally works ' +
  'through a problem, how you show up in relationships with colleagues and collaborators, what ' +
  'actually drives a decision once you’re in one, and what specifically breaks down when the pressure ' +
  'is on. None of this is separate from your signatures. It’s the same evidence, described at the ' +
  'level of daily behaviour rather than underlying pattern.';

const ENERGISERS_EXPLANATION =
  'Energisers are the conditions, activities, and types of work that align with how you naturally ' +
  'operate: situations where your patterns are an asset rather than friction. They’re drawn from your ' +
  'own history, from moments you described feeling most effective, engaged, or in flow.';

const FRICTION_POINTS_EXPLANATION =
  'Friction Points are the conditions that work against how you naturally operate: situations that ' +
  'consistently cost you energy or performance because they run counter to your patterns. Like ' +
  'Energisers, they’re drawn from your own history, not a general list of workplace stressors. These ' +
  'are the specific frictions your patterns predict for you.';

const WHAT_THIS_REPORT_IS =
  'This is pattern recognition, not personality typing, not a career assessment, and not coaching. ' +
  'Your Identity Signatures are stable, recurring operating patterns detected from your actual ' +
  'life and work history. They describe how you have consistently thought, acted, and perceived ' +
  'across multiple chapters of your life, not who you want to be, or who you were once. The report ' +
  'does not tell you what to do. It shows you what is already true about how you operate.';

const RESEARCH_PILLARS = [
  {
    title: 'Narrative Identity Theory, McAdams (1993)',
    body:  'Your Identity Signature Report is grounded in narrative identity research, which holds that identity is constructed through the stories we tell about ourselves across time. The patterns detected in your report reflect recurring themes across your personal narrative: not isolated moments, but the operating logic that appears consistently across different chapters of your life.',
  },
  {
    title: 'Flow Theory, Csikszentmihalyi (1990)',
    body:  'Flow research identifies states of peak performance where skill meets challenge. Your Energisers map directly to the conditions most likely to produce your flow states: environments and activities that align with your signature operating patterns. Misalignment between your signatures and your current context produces the friction described in this report.',
  },
  {
    title: 'Self-Determination Theory, Deci & Ryan (1985)',
    body:  'SDT establishes that sustained motivation requires autonomy, competence, and relatedness. Your Identity Signatures reveal which environments support these three needs and which work against them. The Stress Pattern section identifies what specifically threatens your sense of competence and autonomy under pressure.',
  },
  {
    title: 'Neural Patterning, Doidge (2007)',
    body:  'Neuroplasticity research confirms that repeated patterns of thought and behaviour become hardwired over time. The signatures identified in your report are not preferences or values. They are neural grooves formed through years of consistent activation. They describe how your brain has learned to process and respond to the world.',
  },
];

const HOW_OPERATE_LABELS: { key: keyof IdentityReport['how_you_operate']; label: string }[] = [
  { key: 'work_style',         label: 'Work Style' },
  { key: 'thinking_style',     label: 'Thinking Style' },
  { key: 'relationship_style', label: 'Relationship Style' },
  { key: 'decision_style',     label: 'Decision Style' },
  { key: 'stress_pattern',     label: 'Stress Pattern' },
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
  // eagerly the moment the report finishes rendering, and renders as soon as
  // it's ready, with no click gate in front of it.
  const [reframeArtifactId, setReframeArtifactId] = useState<string | null>(null);
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
    domain_profile_summary,
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

        {/* #100 Stage 2 (2026-08-05 full restructure, refined 2026-08-06):
            Domain Profile / Primary Signatures / Secondary Signatures / How
            You Operate / Energisers / Friction Points, each a standalone
            top-level section with its own fixed .documentation explanation
            near its card(s) — see docs/briefs/100-full-restructure-brief.md
            and docs/briefs/100-card-consistency-brief.md. */}
        <div className="report-sections">

          {/* ── Domain Profile ───────────────────────────────────────── */}
          <div className="report-section">
            <p className="eyebrow">DOMAIN PROFILE</p>
            <div className="card">
              <DomainRadarChart domainProfile={domain_profile} />
              {domain_profile_summary && <p>{domain_profile_summary}</p>}
            </div>
            <p className="documentation">{DOMAIN_PROFILE_EXPLANATION}</p>
          </div>

          {/* ── Primary Signatures — bar chart card + deep-dive cards ─── */}
          <div className="report-section">
            <p className="eyebrow">PRIMARY SIGNATURES</p>
            <div className="card">
              <PrimarySignatureBars signatures={primary_constellation} showLabel={false} />
            </div>
            <p className="documentation">{PRIMARY_SIGNATURES_EXPLANATION}</p>
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
                  <p>{sig.evidence_analysis}</p>
                  <div className="tension-block">
                    <span className="tension-label">TENSION</span>
                    <p>{sig.tension}</p>
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

          {/* ── Secondary Signatures — only when non-empty ────────────── */}
          {secondary_signature_analysis.length > 0 && (
            <div className="report-section">
              <p className="eyebrow">SECONDARY SIGNATURES</p>
              <p>{secondary_signature_summary}</p>
              <div className="card">
                {secondary_signature_analysis.map((sig, i) => (
                  <div key={sig.name} className="sig-row">
                    <div className="sig-num-circle-muted">{i + 6}</div>
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
              </div>
              <p className="documentation">{SECONDARY_SIGNATURES_EXPLANATION}</p>
              {secondary_signature_analysis.map((sig, i) => (
                <ConstellationCard
                  key={sig.name}
                  badge={i + 6}
                  muted
                  title={sig.name}
                  meta={`${sig.domain} · ${sig.score}`}
                >
                  <p className="core-statement">{sig.core_statement}</p>
                  <p>{sig.analysis}</p>
                </ConstellationCard>
              ))}
            </div>
          )}

          {/* ── How You Operate — 5 separate cards ────────────────────── */}
          <div className="report-section">
            <p className="eyebrow">HOW YOU OPERATE</p>
            {HOW_OPERATE_LABELS.map(({ key, label }) => (
              <div key={key} className="card">
                <h3>{label}</h3>
                <p>{how_you_operate[key]}</p>
              </div>
            ))}
            <p className="documentation">{HOW_YOU_OPERATE_EXPLANATION}</p>
          </div>

          {/* ── Energisers ─────────────────────────────────────────────  */}
          <div className="report-section">
            <p className="eyebrow">ENERGISERS</p>
            <ChipRow items={energisers} wrapperClassName="chips-wrap" itemClassName="chip-energiser" />
            <p className="documentation">{ENERGISERS_EXPLANATION}</p>
          </div>

          {/* ── Friction Points ────────────────────────────────────────  */}
          <div className="report-section">
            <p className="eyebrow">FRICTION POINTS</p>
            <ChipRow items={friction_points} wrapperClassName="chips-wrap" itemClassName="chip-friction" />
            <p className="documentation">{FRICTION_POINTS_EXPLANATION}</p>
          </div>

        </div>{/* end .report-sections */}

        {/* What's Next: identity_reframe pitch (#98) — renders unconditionally
            as soon as reframeGenPhase produces content, no click gate. */}
        <div className="report-section">
          {(reframeGenPhase.phase === 'idle' || reframeGenPhase.phase === 'spinner') && (
            <div className="limits-block" style={{ textAlign: 'center' }}>
              <p className="limits-body">Generating your next step…</p>
              <div className="spin spinner" />
            </div>
          )}

          {reframeGenPhase.phase === 'come-back-later' && (
            <div className="limits-block">
              <p className="limits-body">This is taking longer than expected — check back in a few minutes.</p>
            </div>
          )}

          {reframeGenPhase.phase === 'failed' && (
            <div className="limits-block">
              <p className="limits-body">Something went wrong preparing this.</p>
              <PrimaryButton onClick={handleRetryReframe}>Try again</PrimaryButton>
            </div>
          )}

          {reframe && (
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

        {/* Bottom documentation: What This Report Is / Research Foundation
            — reinstated from docs/content/identity-static-content-for-91.md
            per #100's restructure brief, resolves #91's placement question. */}
        <div className="report-footer documentation">
          <h2>About This Report</h2>

          <h3>What this report is</h3>
          <p>{WHAT_THIS_REPORT_IS}</p>

          <h3>Research foundation</h3>
          {RESEARCH_PILLARS.map((pillar) => (
            <p key={pillar.title}><em>{pillar.title}.</em> {pillar.body}</p>
          ))}
        </div>

      </div>{/* end .report-scroll */}
    </div>
  );
}
