'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import ConstellationCard from '@/components/ConstellationCard';
import ChipRow from '@/components/ChipRow';
import ReframeCtaBlock from '@/components/ReframeCtaBlock';
import type { ReframeTeaser } from '@/lib/artifact-schemas';
import type {
  Stage2Output,
  Stage4Output,
  Stage5Output,
  Stage6Output,
  StretchType,
} from '@/lib/generate-path-checkpoint';
import { useCheckpointSessionStatus } from '@/lib/checkpoint-status';
import { getCurrentArtifact } from '@/lib/artifacts';

type PageState = 'loading' | 'anonymous' | 'no-report' | 'verifying' | 'unpaid' | 'checkpoint-flow';

type PathCheckpointResultContent = Stage6Output & { project_name?: string | null };

function stretchClass(stretch: StretchType): string {
  switch (stretch) {
    case 'Natural':     return 'band-strong';
    case 'Adjacent':    return 'band-moderate';
    case 'Reinvention': return 'band-dominant';
  }
}

// ── Static, Zyrro-authored copy for each section — matches /identity's
// descriptive, non-promotional register throughout, not gated on paid tier
// (per /identity's own precedent — see app/identity/page.tsx's constants). ──
const CHECKPOINT1_EXPLANATION =
  'This is where what you’re demonstrably capable of and what actually draws you start to line up. ' +
  'Evidence alone isn’t enough — a strength with no real energy behind it can just as easily be ' +
  'obligation as fulfillment. These are the signatures where both are present.';

const CHECKPOINT2_EXPLANATION =
  'These are the directions your evidence and energy actually support — not a fixed menu, exactly ' +
  'as many as your data genuinely earns. Pick the one you want to go deep on. The others aren’t ' +
  'wrong, they’re just not this one.';

const CHECKPOINT3_EXPLANATION =
  'Before the full write-up, here’s how this direction is shaping up — what it draws on, how far it ' +
  'stretches you, and what it will honestly cost. If this isn’t right yet, say so.';

const WHAT_IT_IS_EXPLANATION = 'The direction itself, stated plainly.';

const WHY_IT_FITS_EXPLANATION =
  'Two separate things have to be true for a direction to be real: you have to be capable of it, and ' +
  'it has to be something you actually want. This is where both get named, and where they overlap.';

const NOT_THIS_EXPLANATION =
  'Choosing one direction means ruling others out. This is what got set aside, and why this one is ' +
  'right instead.';

const HONEST_COST_EXPLANATION =
  'Every real direction asks something of you. This names the specific cost, tied to a real friction ' +
  'point, not a vague warning.';

const DESTINATION_EXPLANATION =
  'What actually doing this would look like, concretely, given who you demonstrably are. Not a ' +
  'promise of happiness — just an honest picture.';

const STRATEGY_EXPLANATION =
  'The few things that actually determine whether this path succeeds, in the order they need to ' +
  'happen and why.';

const PLAN_SEED_EXPLANATION =
  'A few concrete places to start, grounded in the first objective above.';

// Top-level, not defined inside PathPage: a function component defined
// inside another component's render body gets a new reference every
// render, so React treats <RedoField /> as a brand-new component type on
// every re-render and remounts its DOM — the <textarea> would lose focus
// after every keystroke (each keystroke calls setRedoText, triggering
// exactly that re-render). Takes its state as props instead of closing
// over PathPage's state directly.
function RedoField({
  redoText, setRedoText, submitting, onSubmit,
}: {
  redoText: string;
  setRedoText: (text: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="card">
      <p className="card-sub-label">Not quite right?</p>
      <textarea
        className="input-field input-field--textarea"
        value={redoText}
        onChange={(e) => setRedoText(e.target.value)}
        placeholder="Tell us what’s missing or off, and we’ll take another pass."
        disabled={submitting}
      />
      <div className="option-card-footer">
        <LinkButton onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Working on it…' : 'Try again with this'}
        </LinkButton>
      </div>
    </div>
  );
}

function CapNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <div className="card" style={{ background: 'rgba(0,0,0,0.03)' }}>
      <p>{notice}</p>
    </div>
  );
}

function SubmitError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="card" style={{ background: 'rgba(198,5,103,0.06)' }}>
      <p>{error}</p>
    </div>
  );
}

export default function PathPage() {
  const [pageState, setPageState]             = useState<PageState>('loading');
  const [userId, setUserId]                   = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [grantLoading, setGrantLoading]       = useState(false);
  const [reframeTeaser, setReframeTeaser]     = useState<ReframeTeaser | null>(null);
  const [primaryConstellation, setPrimaryConstellation] = useState<{ name: string }[]>([]);

  // ── Checkpoint flow state ──────────────────────────────────────────
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [startFailed, setStartFailed]     = useState(false);
  const [refreshKey, setRefreshKey]       = useState(0);
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [redoText, setRedoText]           = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [capExceededNotice, setCapExceededNotice]     = useState<string | null>(null);

  const checkpointPhase = useCheckpointSessionStatus(sessionId, refreshKey);

  // ── Final report state ──────────────────────────────────────────────
  const [finalResultId, setFinalResultId]   = useState<string | null>(null);
  const [finalResult, setFinalResult]       = useState<PathCheckpointResultContent | null>(null);

  // ── Naming state ──────────────────────────────────────────────────
  const [namingOpen, setNamingOpen]       = useState(false);
  const [namingLoading, setNamingLoading] = useState(false);
  const [nameOptions, setNameOptions]     = useState<{ name: string; rationale: string }[]>([]);
  const [selectedName, setSelectedName]   = useState<string | null>(null);
  const [customName, setCustomName]       = useState('');
  const [namingSaving, setNamingSaving]   = useState(false);
  const [namingAutoOffered, setNamingAutoOffered] = useState(false);

  // ── Entry gating — unchanged from the pre-Stage-D page ──────────────
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      if (!cancelled) setUserId(user.id);

      const sessionIdParam = new URLSearchParams(window.location.search).get('session_id');
      if (sessionIdParam) {
        if (!cancelled) setPageState('verifying');
        const res = await fetch('/api/verify-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionIdParam }),
        });
        const { granted } = await res.json() as { granted: boolean };
        window.history.replaceState({}, '', '/path');
        if (cancelled) return;
        if (granted) {
          if (!cancelled) setPageState('checkpoint-flow');
          return;
        }
      }

      if (cancelled) return;

      const { data: reportArtifact } = await getCurrentArtifact<{ content: unknown }>(
        supabase,
        user.id,
        'identity_report',
        { status: 'ready', select: 'content' },
      );

      if (!reportArtifact) {
        if (!cancelled) setPageState('no-report');
        return;
      }

      if (process.env.NEXT_PUBLIC_OPEN_ACCESS !== 'true') {
        const { data: entitlement } = await supabase
          .from('entitlements')
          .select('id')
          .eq('user_id', user.id)
          .eq('product', 'onetime_payment')
          .eq('status', 'active')
          .maybeSingle();

        if (!entitlement) {
          if (!cancelled) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content = reportArtifact.content as any;
            setReframeTeaser(content?.reframe_teaser ?? null);
            setPrimaryConstellation(Array.isArray(content?.primary_constellation) ? content.primary_constellation : []);
            setPageState('unpaid');
          }
          return;
        }
      }

      if (!cancelled) setPageState('checkpoint-flow');
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Kick off / resume the checkpoint session once gating clears ─────
  useEffect(() => {
    if (pageState !== 'checkpoint-flow' || sessionId) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/generate-path-options', { method: 'POST' });
      if (cancelled) return;
      if (res.ok) {
        const { session_id } = await res.json() as { session_id: string };
        setSessionId(session_id);
      } else {
        setStartFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [pageState, sessionId]);

  // ── Resume-trigger Stage 5's kickoff ─────────────────────────────────
  // recordChosenCandidate (Checkpoint 2's proceed, Stage B) only PARKS the
  // session at current_stage=5 — it never runs Stage 5 itself. The actual
  // kickoff only happens inside POST /api/generate-path-options's own
  // resume branch (#129 Stage C), so something has to call that route again
  // once we land here with no stage5 output yet, or this would sit on a
  // spinner forever. Depends on primitive values, not the whole
  // checkpointPhase object (which gets a new reference on every poll tick),
  // so this only actually fires on a real state transition.
  const stage5NotYetRun =
    checkpointPhase.phase === 'awaiting_checkpoint' &&
    checkpointPhase.currentStage === 5 &&
    !(checkpointPhase.content.stage_outputs as Record<string, unknown>).stage5;

  useEffect(() => {
    if (!stage5NotYetRun) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/generate-path-options', { method: 'POST' });
      if (cancelled || !res.ok) return;
      setRefreshKey(k => k + 1);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage5NotYetRun]);

  // ── Fetch the final report once the session completes ───────────────
  useEffect(() => {
    if (checkpointPhase.phase !== 'complete' || !userId || finalResult) return;
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data } = await getCurrentArtifact<{ id: string; content: PathCheckpointResultContent }>(
        supabase,
        userId,
        'path_checkpoint_result',
        { status: 'ready', select: 'id, content' },
      );
      if (cancelled || !data) return;
      setFinalResultId(data.id);
      setFinalResult(data.content);
    })();

    return () => { cancelled = true; };
  }, [checkpointPhase.phase, userId, finalResult]);

  // ── Offer naming once, the first time the report appears with no
  //    project_name key at all (never asked yet — distinct from `null`,
  //    which means "asked and skipped") ──────────────────────────────
  useEffect(() => {
    if (!finalResult || namingAutoOffered) return;
    if (!('project_name' in finalResult)) {
      setNamingAutoOffered(true);
      setNamingOpen(true);
      handleGenerateNames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalResult, namingAutoOffered]);

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

  // DEV ONLY — remove before go-live
  async function handleDevGrant() {
    if (!userId) return;
    setGrantLoading(true);
    await fetch('/api/dev/grant-entitlement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    setGrantLoading(false);
    window.location.reload();
  }

  async function submitCheckpointResponse(role: 'proceed' | 'redo', extra?: { text?: string; choice?: string }) {
    if (!sessionId || submitting) return;
    const stageAtSubmit = checkpointPhase.phase === 'awaiting_checkpoint' ? checkpointPhase.currentStage : null;

    setSubmitting(true);
    setSubmitError(null);
    setCapExceededNotice(null);

    const res = await fetch('/api/path-checkpoint-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, ...extra }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setSubmitError(body?.error ?? 'Something went wrong. Please try again.');
      return;
    }

    setRedoText('');
    setSelectedCandidateId(null);

    // Cap-exceeded detection: a redo that got auto-forced into a proceed
    // isn't reflected in this response's shape at all (it looks identical
    // to a normal redo-accepted response) — the only signal is the exchange
    // log itself, per the brief's own instruction to check it directly.
    if (role === 'redo' && stageAtSubmit !== null) {
      const supabase = createClient();
      const { data } = await supabase
        .from('path_checkpoint_exchanges')
        .select('role, content')
        .eq('session_id', sessionId)
        .eq('stage', stageAtSubmit)
        .order('created_at', { ascending: false })
        .limit(1);
      const latest = data?.[0] as { role: string; content: { auto_forced?: boolean } } | undefined;
      if (latest?.role === 'proceed' && latest.content?.auto_forced) {
        setCapExceededNotice(
          'You’ve used up your redos for this step — moving forward with the latest version instead of trying again.',
        );
      }
    }

    setRefreshKey(k => k + 1);
  }

  async function handleGenerateNames() {
    if (!finalResultId) return;
    setNamingLoading(true);
    setNameOptions([]);
    setSelectedName(null);
    setCustomName('');
    const res = await fetch('/api/generate-project-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path_checkpoint_result_id: finalResultId }),
    });
    setNamingLoading(false);
    if (res.ok) {
      const { options } = await res.json() as { options: { name: string; rationale: string }[] };
      setNameOptions(options);
    }
  }

  async function handleSaveName(name: string | null) {
    if (!finalResultId || namingSaving) return;
    setNamingSaving(true);
    const res = await fetch('/api/name-path-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path_checkpoint_result_id: finalResultId, project_name: name }),
    });
    setNamingSaving(false);
    if (res.ok) {
      setFinalResult(prev => prev ? { ...prev, project_name: name } : prev);
      setNamingOpen(false);
    }
  }

  // ── Loading / Verifying ───────────────────────────────────────────
  if (pageState === 'loading' || pageState === 'verifying') {
    return (
      <GeneratingState
        heading={pageState === 'verifying' ? 'Confirming your payment…' : undefined}
      />
    );
  }

  // ── Anonymous ─────────────────────────────────────────────────────
  if (pageState === 'anonymous') {
    return (
      <GatedState
        eyebrow="YOUR PATH"
        heading="Your path is generated from your Identity Report."
        body="Unlock your Identity Report first to see your path."
      />
    );
  }

  // ── No identity_report yet ──────────────────────────────────────────
  if (pageState === 'no-report') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Your Path is generated from your Identity Report."
        body="Finish your Identity Report first — your Path will be ready once it is."
        cta={<PrimaryButton href="/identity">Go to your Identity Report</PrimaryButton>}
      />
    );
  }

  // ── Unpaid: reframe teaser CTA — same composition as /identity ─────
  if (pageState === 'unpaid') {
    if (!reframeTeaser) return null;

    return (
      <div className="flow-container">
        <div className="scroll-area scroll-area--wide-bottom">
          <p className="eyebrow">YOUR PATH</p>

          <ReframeCtaBlock
            reframeTeaser={reframeTeaser}
            primaryConstellation={primaryConstellation}
            onCheckout={handleCheckout}
            checkoutLoading={checkoutLoading}
          />

          {/* DEV ONLY — remove before go-live */}
          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <button
              onClick={handleDevGrant}
              disabled={grantLoading}
              className="btn-link"
              style={{ fontSize: '12px', color: '#999' }}
            >
              {grantLoading ? 'Granting…' : 'DEV: Grant entitlement'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── checkpoint-flow: session start failed ───────────────────────────
  if (startFailed) {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Something went wrong."
        body="We couldn’t start your Path. Please try again."
        cta={<PrimaryButton onClick={() => { setStartFailed(false); setSessionId(null); }}>Try again</PrimaryButton>}
      />
    );
  }

  // ── checkpoint-flow: not yet resumed / hook still idle ──────────────
  if (!sessionId || checkpointPhase.phase === 'idle') {
    return (
      <GeneratingState
        heading="Your Path is being prepared."
        description="This usually takes about a minute."
      />
    );
  }

  if (checkpointPhase.phase === 'spinner') {
    return (
      <GeneratingState
        heading="Your Path is being prepared."
        description={
          checkpointPhase.variant === 'early'
            ? 'This usually takes about a minute.'
            : 'Still working — this is taking a little longer than usual…'
        }
      />
    );
  }

  if (checkpointPhase.phase === 'come-back-later') {
    return (
      <GeneratingState
        spinner={false}
        description="Your Path is still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It’ll be here when it’s ready."
      />
    );
  }

  if (checkpointPhase.phase === 'failed') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Something went wrong."
        body="We couldn’t prepare your Path. Please try again."
        cta={<PrimaryButton onClick={() => { setSessionId(null); setPageState('loading'); setPageState('checkpoint-flow'); }}>Try again</PrimaryButton>}
      />
    );
  }


  // ── awaiting_checkpoint: render the active checkpoint ───────────────
  if (checkpointPhase.phase === 'awaiting_checkpoint') {
    const { currentStage, content } = checkpointPhase;
    const stageOutputs = content.stage_outputs as Record<string, unknown>;

    // ── Checkpoint 1 (stage 2) ──────────────────────────────────────
    if (currentStage === 2) {
      const stage2 = stageOutputs.stage2 as Stage2Output;
      return (
        <div className="flow-container">
          <div className="scroll">
            <div className="section cover">
              <p className="eyebrow">Your Path</p>
            </div>
            <div className="section">
              <p className="eyebrow">CHECKPOINT 1 · EVIDENCE AND ENERGY</p>
              <p className="documentation">{CHECKPOINT1_EXPLANATION}</p>
              <CapNotice notice={capExceededNotice} />
              {stage2.overlaps.map((o, i) => (
                <ConstellationCard key={o.signature} badge={i + 1} title={o.signature} meta={o.domain}>
                  <p>{o.rationale}</p>
                  <div className="tension-block">
                    <span className="tension-label">EVIDENCE</span>
                    <p>{o.evidence_citation}</p>
                  </div>
                  <div className="tension-block">
                    <span className="tension-label">ENERGY</span>
                    <p>{o.desire_citation}</p>
                  </div>
                </ConstellationCard>
              ))}
              <SubmitError error={submitError} />
              <div className="card">
                <PrimaryButton onClick={() => submitCheckpointResponse('proceed')} disabled={submitting}>
                  {submitting ? 'Working on it…' : 'Yes, this reads right →'}
                </PrimaryButton>
              </div>
              <RedoField
                redoText={redoText}
                setRedoText={setRedoText}
                submitting={submitting}
                onSubmit={() => submitCheckpointResponse('redo', { text: redoText })}
              />
            </div>
          </div>
        </div>
      );
    }

    // ── Checkpoint 2 (stage 4) — the real fork ───────────────────────
    if (currentStage === 4) {
      const stage4 = stageOutputs.stage4 as Stage4Output;
      return (
        <div className="flow-container">
          <div className="scroll">
            <div className="section cover">
              <p className="eyebrow">Your Path</p>
            </div>
            <div className="section">
              <p className="eyebrow">CHECKPOINT 2 · THE DIRECTIONS THAT FIT YOU</p>
              <p className="documentation">{CHECKPOINT2_EXPLANATION}</p>
              <CapNotice notice={capExceededNotice} />
              <div className="project-name-options">
                {stage4.candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(c.id)}
                    className={`project-name-card${selectedCandidateId === c.id ? ' selected' : ''}`}
                    disabled={submitting}
                  >
                    <div className="project-name-card-title">{c.name}</div>
                    <p className="project-name-card-rationale">{c.thesis}</p>
                  </button>
                ))}
              </div>
              <SubmitError error={submitError} />
              <div className="card">
                <PrimaryButton
                  onClick={() => selectedCandidateId && submitCheckpointResponse('proceed', { choice: selectedCandidateId })}
                  disabled={!selectedCandidateId || submitting}
                >
                  {submitting ? 'Working on it…' : 'Choose this direction →'}
                </PrimaryButton>
              </div>
              <RedoField
                redoText={redoText}
                setRedoText={setRedoText}
                submitting={submitting}
                onSubmit={() => submitCheckpointResponse('redo', { text: redoText })}
              />
            </div>
          </div>
        </div>
      );
    }

    // ── Checkpoint 3 (stage 5) ────────────────────────────────────────
    if (currentStage === 5) {
      const stage5 = stageOutputs.stage5 as Stage5Output | undefined;

      // Parked by Checkpoint 2's proceed, Stage 5 not kicked off yet —
      // resuming (re-polling /api/generate-path-options) triggers it. This
      // window is normally very short (the same request that landed here
      // already kicks it off server-side), so a brief spinner is enough.
      if (!stage5) {
        return (
          <GeneratingState
            heading="Developing your chosen direction."
            description="This usually takes about a minute."
          />
        );
      }

      return (
        <div className="flow-container">
          <div className="scroll">
            <div className="section cover">
              <p className="eyebrow">Your Path</p>
            </div>
            <div className="section">
              <p className="eyebrow">CHECKPOINT 3 · HOW THIS IS SHAPING UP</p>
              <p className="documentation">{CHECKPOINT3_EXPLANATION}</p>
              <CapNotice notice={capExceededNotice} />
              <ConstellationCard
                badge="◉"
                title={stage5.developed_thesis}
                meta="Developed direction"
                pill={<span className={`score-band-pill ${stretchClass(stage5.stretch)}`}>{stage5.stretch}</span>}
              >
                <ChipRow items={stage5.anchoring_signatures} wrapperClassName="option-card-sigs" />
                <div className="tension-block">
                  <span className="tension-label">HONEST COST</span>
                  <p>{stage5.honest_cost_note}</p>
                </div>
              </ConstellationCard>
              <SubmitError error={submitError} />
              <div className="card">
                <PrimaryButton onClick={() => submitCheckpointResponse('proceed')} disabled={submitting}>
                  {submitting ? 'Working on it…' : 'Yes, this is right →'}
                </PrimaryButton>
              </div>
              <RedoField
                redoText={redoText}
                setRedoText={setRedoText}
                submitting={submitting}
                onSubmit={() => submitCheckpointResponse('redo', { text: redoText })}
              />
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // ── complete: final report ──────────────────────────────────────────
  if (checkpointPhase.phase !== 'complete' || !finalResult) return null;

  const {
    thesis, what_it_is, why_it_fits, not_this, honest_cost,
    life_it_leads_toward, master_strategy, plan_seed_actions, project_name,
  } = finalResult;

  return (
    <>
      {namingOpen && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <p className="eyebrow">NAME YOUR PROJECT</p>
            <h2>Want to name this?</h2>
            <p>Give this direction a name of its own, or skip — your Path stays exactly as it is either way.</p>

            {namingLoading && <div className="spin spinner" />}

            {!namingLoading && nameOptions.length > 0 && (
              <div className="project-name-options">
                {nameOptions.map(opt => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => { setSelectedName(opt.name); setCustomName(''); }}
                    className={`project-name-card${selectedName === opt.name ? ' selected' : ''}`}
                  >
                    <div className="project-name-card-title">{opt.name}</div>
                    <p className="project-name-card-rationale">{opt.rationale}</p>
                  </button>
                ))}
              </div>
            )}

            {!namingLoading && (
              <input
                className="input-field"
                type="text"
                placeholder="Or write your own"
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  setSelectedName(null);
                }}
              />
            )}

            <div className="dialog-actions">
              <PrimaryButton
                onClick={() => handleSaveName(selectedName ?? (customName.trim() || null))}
                disabled={namingSaving || (!selectedName && !customName.trim())}
              >
                {namingSaving ? 'Saving…' : 'Name this Project'}
              </PrimaryButton>
              <LinkButton onClick={() => handleSaveName(null)} disabled={namingSaving}>
                Skip
              </LinkButton>
            </div>
          </div>
        </div>
      )}

      <div className="flow-container">
        <div className="scroll">

          <div className="section cover">
            <p className="eyebrow">Your Path</p>
            {project_name && <p className="cover-context-line">{project_name}</p>}
            <p className="identity-thesis">{thesis}</p>
          </div>

          {/* Cap-exceeded can fire at Checkpoint 3 (the last checkpoint) and
              jump straight through Stage 6 to this completed report — there's
              no intermediate checkpoint screen left to show the notice on in
              that case, so it has to render here too, not just on the
              checkpoint screens themselves. */}
          {capExceededNotice && (
            <div className="section">
              <CapNotice notice={capExceededNotice} />
            </div>
          )}

          <div className="section">
            <p className="eyebrow">WHAT THIS PATH IS</p>
            <p className="documentation">{WHAT_IT_IS_EXPLANATION}</p>
            <div className="card"><p>{what_it_is}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">WHY IT FITS</p>
            <p className="documentation">{WHY_IT_FITS_EXPLANATION}</p>
            <div className="card"><p>{why_it_fits}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">WHAT THIS PATH ISN&rsquo;T</p>
            <p className="documentation">{NOT_THIS_EXPLANATION}</p>
            <div className="card"><p>{not_this}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">THE HONEST COST</p>
            <p className="documentation">{HONEST_COST_EXPLANATION}</p>
            <div className="card"><p>{honest_cost}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">WHERE THIS LEADS</p>
            <p className="documentation">{DESTINATION_EXPLANATION}</p>
            <div className="card"><p>{life_it_leads_toward}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">YOUR STRATEGY</p>
            <p className="documentation">{STRATEGY_EXPLANATION}</p>
            {master_strategy.map((objective, i) => (
              <ConstellationCard
                key={objective.name}
                badge={i + 1}
                title={objective.name}
                meta={i === 0 ? 'Start here' : `Step ${i + 1}`}
              >
                <p className="evidence-analysis">{objective.description}</p>
                <div className="tension-block">
                  <span className="tension-label">WHY NOW</span>
                  <p>{objective.sequencing_rationale}</p>
                </div>
              </ConstellationCard>
            ))}
          </div>

          <div className="section">
            <p className="eyebrow">A FEW PLACES TO START</p>
            <p className="documentation">{PLAN_SEED_EXPLANATION}</p>
            <div className="card">
              {plan_seed_actions.map((action, i) => (
                <div key={i} className="start-here-action">
                  <p className="start-here-action-text">{action}</p>
                </div>
              ))}
            </div>
          </div>

          {'project_name' in finalResult && (
            <div className="section">
              <div className="card" style={{ textAlign: 'center' }}>
                {project_name ? (
                  <>
                    <p>You&rsquo;re calling this <strong>{project_name}</strong>.</p>
                    <LinkButton onClick={() => { setNamingOpen(true); handleGenerateNames(); }}>
                      Rename it
                    </LinkButton>
                  </>
                ) : (
                  <LinkButton onClick={() => { setNamingOpen(true); handleGenerateNames(); }}>
                    Name this project
                  </LinkButton>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
