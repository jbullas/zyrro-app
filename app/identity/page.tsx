'use client';

import { useEffect, useState } from 'react';
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

const TOC_ITEMS = [
  { num: '01', title: 'What this report is',   id: 'section-2' },
  { num: '02', title: 'Signature profile',      id: 'section-3' },
  { num: '03', title: 'Primary signatures',     id: 'section-4' },
  { num: '04', title: 'Secondary signatures',   id: 'section-5' },
  { num: '05', title: 'Constellation synthesis',id: 'section-6' },
  { num: '06', title: 'How you operate',        id: 'section-7' },
  { num: '07', title: 'Energisers',             id: 'section-8' },
  { num: '08', title: 'Friction points',        id: 'section-9' },
  { num: '09', title: 'Research foundation',    id: 'section-10' },
  { num: '10', title: 'Limits of this report',  id: 'section-11' },
];

const WHAT_THIS_REPORT_IS =
  'This is pattern recognition — not personality typing, not a career assessment, not coaching. ' +
  'Your Identity Signatures are stable, recurring operating patterns detected from your actual ' +
  'life and work history. They describe how you have consistently thought, acted, and perceived ' +
  'across multiple chapters of your life — not who you want to be, or who you were once. The report ' +
  'does not tell you what to do. It shows you what is already true about how you operate.';

const SCORING_EXPLANATION =
  'Each signature score reflects two dimensions: Frequency, how often the pattern shows up across ' +
  'your history, and Intensity, how strongly it shows up when it does. The five highest-scoring ' +
  'signatures form your Primary Constellation — the patterns that most consistently and forcefully ' +
  'define how you operate. Beyond the Top 5, any pattern that still cleared the evidence bar appears ' +
  'as a Secondary Signature: a real, established pattern that shows up less often or with less force, ' +
  'but still shapes how you think, act, and respond under specific conditions. Together, these describe ' +
  'not just what you do, but how reliably and how strongly you do it.';

const RESEARCH_PILLARS = [
  {
    title: 'Narrative Identity Theory — McAdams (1993)',
    body:  'Your Identity Signature Report is grounded in narrative identity research, which holds that identity is constructed through the stories we tell about ourselves across time. The patterns detected in your report reflect recurring themes across your personal narrative — not isolated moments, but the operating logic that appears consistently across different chapters of your life.',
  },
  {
    title: 'Flow Theory — Csikszentmihalyi (1990)',
    body:  'Flow research identifies states of peak performance where skill meets challenge. Your Energisers map directly to the conditions most likely to produce your flow states — environments and activities that align with your signature operating patterns. Misalignment between your signatures and your current context produces the friction described in this report.',
  },
  {
    title: 'Self-Determination Theory — Deci & Ryan (1985)',
    body:  'SDT establishes that sustained motivation requires autonomy, competence, and relatedness. Your Identity Signatures reveal which environments support these three needs and which work against them. The Stress Pattern section identifies what specifically threatens your sense of competence and autonomy under pressure.',
  },
  {
    title: 'Neural Patterning — Doidge (2007)',
    body:  'Neuroplasticity research confirms that repeated patterns of thought and behaviour become hardwired over time. The signatures identified in your report are not preferences or values — they are neural grooves formed through years of consistent activation. They describe how your brain has learned to process and respond to the world.',
  },
];

const HOW_OPERATE_LABELS: { key: keyof IdentityReport['how_you_operate']; label: string }[] = [
  { key: 'work_style',         label: 'WORK STYLE' },
  { key: 'thinking_style',     label: 'THINKING STYLE' },
  { key: 'relationship_style', label: 'RELATIONSHIP STYLE' },
  { key: 'decision_style',     label: 'DECISION STYLE' },
  { key: 'stress_pattern',     label: 'STRESS PATTERN' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

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

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export default function IdentityPage() {
  const router = useRouter();
  const [pageState, setPageState]   = useState<PageState>('loading');
  const [artifactId, setArtifactId] = useState<string | null>(null);

  const genPhase   = useGenerationStatus(artifactId);
  const report     = genPhase.phase === 'ready' ? genPhase.content as IdentityReport : null;
  const reportDate = genPhase.phase === 'ready' ? genPhase.createdAt : '';

  // Main load — finds the artifact ID and hands polling to useGenerationStatus
  useEffect(() => {
    const supabase = createClient();
    let cancelled  = false;

    async function loadArtifact(userId: string) {
      const { data, error } = await getCurrentArtifact<{ id: string }>(
        supabase,
        userId,
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
          <p className="identity-thesis">{cover.identity_thesis}</p>
          <p className="cover-context-line">{cover.prepared_for} · {cover.identity_context}</p>
          <p className="prepared-for-line">{reportDate ? formatDate(reportDate) : ''}</p>
        </div>

        {/* ── Sections 1–10 ────────────────────────────────── */}
        <div className="report-sections">

          {/* Section 1: Table of Contents */}
          <div id="section-1" className="report-section">
            <div className="card">
              <p className="eyebrow">IN THIS REPORT</p>
              <div className="toc-rows-wrap">
                {TOC_ITEMS.map(item => (
                  <button
                    key={item.num}
                    className="toc-row"
                    onClick={() => scrollTo(item.id)}
                  >
                    <span className="toc-num">{item.num}</span>
                    <span className="toc-title">{item.title}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C60567" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: What This Report Is */}
          <div id="section-2" className="report-section">
            <p className="eyebrow">WHAT THIS REPORT IS</p>
            <p>{WHAT_THIS_REPORT_IS}</p>
          </div>

          {/* Section 3: Signature Profile */}
          <div id="section-3" className="report-section">
            <p className="eyebrow">SIGNATURE PROFILE</p>
            <p>{SCORING_EXPLANATION}</p>

            <div className="card">
              <PrimarySignatureBars signatures={primary_constellation} />
            </div>

            {secondary_signature_analysis.length > 0 && (
              <div className="card">
                <p className="card-sub-label">Secondary Signatures</p>
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
            )}

            <div className="card">
              <p className="card-sub-label">Identity Profile</p>
              <DomainRadarChart domainProfile={domain_profile} />
            </div>
          </div>

          {/* Section 4: Primary Constellation Deep Analysis */}
          <div id="section-4" className="report-section">
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

          {/* Section 5: Secondary Signatures */}
          <div id="section-5" className="report-section">
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

          {/* Section 6: Constellation Synthesis */}
          <div id="section-6" className="report-section">
            <p className="eyebrow">CONSTELLATION SYNTHESIS</p>
            <div className="card">
              <h3 className="named-identity mb-12">{constellation_synthesis.named_identity}</h3>
              <p>{constellation_synthesis.synthesis}</p>
            </div>
          </div>

          {/* Section 7: How You Operate */}
          <div id="section-7" className="report-section">
            <p className="eyebrow">HOW YOU OPERATE</p>
            <div className="card">
              {HOW_OPERATE_LABELS.map(({ key, label }) => (
                <div key={key} className="operate-section">
                  <p className="eyebrow">{label}</p>
                  <p className="operate-text">{how_you_operate[key]}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 8: Energisers */}
          <div id="section-8" className="report-section">
            <p className="eyebrow">ENERGISERS</p>
            <ChipRow items={energisers} wrapperClassName="chips-wrap" />
          </div>

          {/* Section 9: Friction Points */}
          <div id="section-9" className="report-section">
            <p className="eyebrow">FRICTION POINTS</p>
            <ChipRow items={friction_points} wrapperClassName="chips-wrap" itemClassName="chip-friction" />
          </div>

          {/* Section 10: Research Foundation */}
          <div id="section-10" className="report-section">
            <p className="eyebrow">RESEARCH FOUNDATION</p>
            <div className="card">
              {RESEARCH_PILLARS.map(pillar => (
                <div key={pillar.title} className="research-row">
                  <p className="research-title">{pillar.title}</p>
                  <p className="research-body">{pillar.body}</p>
                </div>
              ))}
            </div>
          </div>

        </div>{/* end .report-sections */}

        {/* Section 11: Limits of This Report */}
        <LimitsBlock
          id="section-11"
          eyebrow="LIMITS OF THIS REPORT"
          heading="This report shows you how you operate. It doesn't show you why you feel stuck."
          body="You now have a precise picture of your identity patterns. But knowing how you operate doesn’t resolve the gap between how you operate and how your life is actually structured right now. That gap is costing you — in energy, in output, and in the quiet sense that something important is misaligned."
          bullets={[
            'This report does not explain what your pattern is pointing toward',
            'It does not identify what you’ve outgrown or why it feels stuck',
            'It does not show you which direction fits who you’ve become',
            'It does not give you a path or a plan',
          ]}
          cta={<PrimaryButton href="/path">See what your pattern is pointing toward →</PrimaryButton>}
        />

      </div>{/* end .report-scroll */}
    </div>
  );
}
