'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import {
  IconTelescope, IconBuildingSkyscraper, IconSparkles, IconFlask, IconCirclesRelation,
  IconChartDots, IconArrowBarDown, IconLayersIntersect, IconSwords, IconRocket,
  IconBolt, IconWaveSine, IconSpeakerphone, IconBuildingBridge, IconBulb,
  IconPlayerPlay, IconCompass, IconHammer, IconAdjustments, IconFlag,
  IconAnchor, IconEye, IconHeart, IconHandStop, IconShieldLock,
  IconShield,
} from '@tabler/icons-react';

type PageState = 'loading' | 'anonymous' | 'no-questionnaire' | 'generating' | 'failed' | 'ready';

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

const SIGNATURE_ICONS: Record<string, typeof IconShield> = {
  'Visionary':     IconTelescope,
  'Architect':     IconBuildingSkyscraper,
  'Originator':    IconSparkles,
  'Alchemist':     IconFlask,
  'Synthesizer':   IconCirclesRelation,
  'Pattern Seeker':IconChartDots,
  'Depth Diver':   IconArrowBarDown,
  'Contextualiser':IconLayersIntersect,
  'Contrarian':    IconSwords,
  'Futurist':      IconRocket,
  'Catalyst':      IconBolt,
  'Resonator':     IconWaveSine,
  'Amplifier':     IconSpeakerphone,
  'Bridge':        IconBuildingBridge,
  'Illuminator':   IconBulb,
  'Activator':     IconPlayerPlay,
  'Pioneer':       IconCompass,
  'Builder':       IconHammer,
  'Optimizer':     IconAdjustments,
  'Finisher':      IconFlag,
  'Meaning Maker': IconAnchor,
  'Truth Seeker':  IconEye,
  'Empath':        IconHeart,
  'Intuitive':     IconHandStop,
  'Guardian':      IconShieldLock,
};

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
  const [pageState, setPageState] = useState<PageState>('loading');
  const [report, setReport]       = useState<IdentityReport | null>(null);
  const [reportDate, setReportDate] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartRef        = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstanceRef = useRef<any>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // DEV ONLY — remove before go-live
  const handleRegenerate = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();

    const [
      { data: answersData },
      { data: profileData },
    ] = await Promise.all([
      supabase
        .from('discovery_answers')
        .select('question_number, question_text, answer_text')
        .eq('user_id', userId),
      supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (!answersData?.length) return;

    const name = profileData?.name || 'You';
    const answers = answersData;

    setPageState('generating');
    stopPolling();

    await fetch('/api/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, name, answers }),
    });

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('artifacts')
        .select('id, status, content, created_at')
        .eq('user_id', userId)
        .eq('type', 'identity_report')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.status === 'ready' && data.content) {
        setReport(data.content as IdentityReport);
        setReportDate((data.created_at as string) ?? '');
        setPageState('ready');
        stopPolling();
      } else if (data?.status === 'failed') {
        setPageState('failed');
        stopPolling();
      }
    }, 3000);
  }, [userId, stopPolling]);

  // Chart.js init when report is ready
  useEffect(() => {
    if (pageState !== 'ready' || !report?.domain_profile) return;
    const dp = report.domain_profile;

    const initChart = () => {
      if (!chartRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Chart = (window as any).Chart;
      if (!Chart) return;
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
      chartInstanceRef.current = new Chart(chartRef.current, {
        type: 'radar',
        data: {
          labels: ['Visioning', 'Thinking', 'Driving', 'Sensing', 'Connecting'],
          datasets: [{
            data: [dp.Visioning, dp.Thinking, dp.Driving, dp.Sensing, dp.Connecting],
            borderColor: '#C60567',
            backgroundColor: 'rgba(198,5,103,0.08)',
            pointBackgroundColor: '#C60567',
            borderWidth: 2,
            pointRadius: 4,
          }],
        },
        options: {
          responsive: true,
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { display: false },
              grid: { color: 'rgba(0,0,0,0.06)' },
              pointLabels: { font: { size: 11, weight: '600' }, color: '#6E6E6E' },
            },
          },
          plugins: { legend: { display: false } },
        },
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Chart) {
      initChart();
    } else {
      const existing = document.getElementById('chartjs-cdn');
      if (!existing) {
        const script = document.createElement('script');
        script.id  = 'chartjs-cdn';
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
        script.onload = initChart;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', initChart);
      }
    }

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    };
  }, [pageState, report?.domain_profile]);

  // Main load + polling
  useEffect(() => {
    const supabase = createClient();
    let cancelled  = false;

    async function loadArtifact(userId: string) {
      const { data } = await supabase
        .from('artifacts')
        .select('id, status, content, created_at')
        .eq('user_id', userId)
        .eq('type', 'identity_report')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (!data) {
        setPageState('no-questionnaire');
        return;
      }

      if (data.status === 'ready' && data.content) {
        setReport(data.content as IdentityReport);
        setReportDate((data.created_at as string) ?? '');
        setPageState('ready');
        stopPolling();
      } else if (data.status === 'failed') {
        setPageState('failed');
        stopPolling();
      } else {
        setPageState('generating');
        if (pollRef.current === null) {
          pollRef.current = setInterval(() => {
            if (!cancelled) loadArtifact(userId);
          }, 3000);
        }
      }
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      if (!cancelled) setUserId(user.id);
      if (cancelled) return;

      const { count } = await supabase
        .from('discovery_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (cancelled) return;

      if (!count || count === 0) {
        setPageState('no-questionnaire');
        return;
      }

      await loadArtifact(user.id);
    }

    init();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [stopPolling]);

  // ── Loading ────────────────────────────────────────────────────────
  if (pageState === 'loading') return null;

  // ── State 1: Anonymous ─────────────────────────────────────────────
  if (pageState === 'anonymous') {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>
        <h1>Your Identity Signature Report is waiting.</h1>
        <p>Create a free account to access your Named Identity and full Identity Signature Report.</p>
        <Link href="/start" className="btn-primary">Start the questionnaire</Link>
      </div>
    );
  }

  // ── State 2: No questionnaire ──────────────────────────────────────
  if (pageState === 'no-questionnaire') {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>
        <h1>Your report isn&rsquo;t ready yet.</h1>
        <p>Complete the questionnaire to generate your Identity Signature Report.</p>
        <Link href="/start" className="btn-primary">Start the questionnaire</Link>
      </div>
    );
  }

  // ── State 3a: Generating ───────────────────────────────────────────
  if (pageState === 'generating') {
    return (
      <div className="flow-container generating-container">
        <div className="spin spinner" />
        <div className="text-center-col">
          <h2>Your Identity Signature Report is being prepared.</h2>
          <p className="generating-desc">This usually takes about a minute.</p>
        </div>
      </div>
    );
  }

  // ── State 3b: Failed ───────────────────────────────────────────────
  if (pageState === 'failed') {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>
        <h2>Something went wrong.</h2>
        <p>We couldn&rsquo;t generate your report. Please try again.</p>
        <button className="btn-primary" disabled>Try again</button>
      </div>
    );
  }

  // ── State 3c: Ready ────────────────────────────────────────────────
  if (!report) return null;

  const {
    cover,
    primary_constellation,
    secondary_signature_analysis,
    constellation_synthesis,
    how_you_operate,
    energisers,
    friction_points,
    domain_profile,
  } = report;

  const [nameLine1, nameLine2] = splitNamedIdentity(cover.named_identity);
  const SignatureIcon = SIGNATURE_ICONS[primary_constellation[0]?.name ?? ''] ?? IconShield;

  return (
    <div className="flow-container">
      <div className="report-scroll">

        {/* ── Section 0: Cover ─────────────────────────────── */}
        <div className="report-cover">
          <p className="eyebrow">Identity Signature Report</p>
          <div style={{ position: 'relative', width: '80px', height: '88px', margin: '0 auto' }}>
            <svg width="80" height="88" viewBox="0 0 80 88">
              <defs>
                <linearGradient id="shield-grad" x1="24" y1="4" x2="56" y2="84" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FE5618" />
                  <stop offset="50%" stopColor="#C60567" />
                  <stop offset="100%" stopColor="#510085" />
                </linearGradient>
              </defs>
              <path d="M40 4 L72 16 L72 48 Q72 72 40 84 Q8 72 8 48 L8 16 Z" fill="url(#shield-grad)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SignatureIcon size={28} color="rgba(255,255,255,0.95)" stroke={1.5} />
            </div>
          </div>
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

            <div className="card">
              <p className="card-sub-label">Primary Signatures</p>
              {primary_constellation.map((sig, i) => (
                <div key={sig.name} className="sig-row">
                  <div className="sig-num-circle">{i + 1}</div>
                  <div className="sig-info">
                    <div className="sig-name-meta">
                      <span className="sig-name">{sig.name}</span>
                      <span className="sig-breakdown">{sig.domain}</span>
                    </div>
                    <div className="sig-bar-track">
                      <div className="sig-bar-fill" style={{ width: `${(sig.score / 25) * 100}%` }} />
                    </div>
                  </div>
                  <span className="sig-score-label">{sig.score}</span>
                </div>
              ))}
            </div>

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

            <div className="card">
              <p className="card-sub-label">Identity Profile</p>
              <canvas ref={chartRef} style={{ width: '100%', maxHeight: '260px' }} />
            </div>
          </div>

          {/* Section 4: Primary Constellation Deep Analysis */}
          <div id="section-4" className="report-section">
            <p className="eyebrow">PRIMARY CONSTELLATION</p>
            {primary_constellation.map((sig, i) => {
              const band = getScoreBand(sig.score);
              return (
                <div key={sig.name} className="constellation-card">
                  <div className="constellation-card-header">
                    <div className="constellation-badge">{i + 1}</div>
                    <div className="constellation-header-info">
                      <div className="constellation-sig-name">{sig.name}</div>
                      <div className="constellation-sig-meta">{sig.domain} · {sig.score}/25</div>
                    </div>
                    <span className={`score-band-pill ${bandClass(band)}`}>{band}</span>
                  </div>
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
                </div>
              );
            })}
          </div>

          {/* Section 5: Secondary Signatures */}
          <div id="section-5" className="report-section">
            <p className="eyebrow">SECONDARY SIGNATURES</p>
            {secondary_signature_analysis.map((sig, i) => (
              <div key={sig.name} className="constellation-card">
                <div className="constellation-card-header">
                  <div className="constellation-badge-muted">{i + 6}</div>
                  <div className="constellation-header-info">
                    <div className="constellation-sig-name">{sig.name}</div>
                    <div className="constellation-sig-meta">{sig.domain} · {sig.score}</div>
                  </div>
                </div>
                <p className="core-statement">{sig.core_statement}</p>
                <p className="evidence-analysis">{sig.analysis}</p>
              </div>
            ))}
          </div>

          {/* Section 6: Constellation Synthesis */}
          <div id="section-6" className="report-section">
            <p className="eyebrow">CONSTELLATION SYNTHESIS</p>
            <div className="card">
              <h3 className="named-identity" style={{ marginBottom: '12px' }}>{constellation_synthesis.named_identity}</h3>
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
            <div className="chips-wrap">
              {energisers.map(e => (
                <span key={e} className="chip-tag">{e}</span>
              ))}
            </div>
          </div>

          {/* Section 9: Friction Points */}
          <div id="section-9" className="report-section">
            <p className="eyebrow">FRICTION POINTS</p>
            <div className="chips-wrap">
              {friction_points.map(f => (
                <span key={f} className="chip-friction">{f}</span>
              ))}
            </div>
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

        {/* DEV ONLY — remove before go-live */}
        <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
          <button
            onClick={handleRegenerate}
            style={{ background: 'none', border: 'none', color: '#999', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}
          >
            Regenerate report
          </button>
        </div>

        {/* Section 11: Limits of This Report */}
        <div id="section-11" className="limits-block">
          <p className="limits-eyebrow">LIMITS OF THIS REPORT</p>
          <h2 className="limits-heading">
            This report shows you how you operate. It doesn't show you why you feel stuck.
          </h2>
          <p className="limits-body">
            You now have a precise picture of your identity patterns. But knowing how you operate
            doesn&rsquo;t resolve the gap between how you operate and how your life is actually
            structured right now. That gap is costing you — in energy, in output, and in the quiet
            sense that something important is misaligned.
          </p>
          <ul className="limits-bullets">
            <li className="limits-bullet">This report does not explain what your pattern is pointing toward</li>
            <li className="limits-bullet">It does not identify what you&rsquo;ve outgrown or why it feels stuck</li>
            <li className="limits-bullet">It does not show you which direction fits who you&rsquo;ve become</li>
            <li className="limits-bullet">It does not give you a path or a plan</li>
          </ul>
          <Link href="/paths" className="btn-primary">
            See what your pattern is pointing toward →
          </Link>
        </div>

      </div>{/* end .report-scroll */}
    </div>
  );
}
