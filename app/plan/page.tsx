'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import type { PathPlanArtifactContent } from '@/lib/artifact-schemas';
import { useGenerationStatus } from '@/lib/generation-status';

type PageState = 'loading' | 'anonymous' | 'unpaid' | 'no-selection' | 'has-artifact';

export default function PlanPage() {
  const [pageState, setPageState]     = useState<PageState>('loading');
  const [userId, setUserId]           = useState<string | null>(null);
  const [artifactId, setArtifactId]   = useState<string | null>(null);
  const [activeSelection, setActiveSelection] = useState<{
    path_options_artifact_id: string;
    path_id: string;
  } | null>(null);
  const [retrying, setRetrying]       = useState(false);
  // Used only to retry the initial artifact-ID lookup in the edge case where the
  // row hasn't committed yet when the page first loads.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const genPhase = useGenerationStatus(artifactId);
  const plan     = genPhase.phase === 'ready' ? genPhase.content as PathPlanArtifactContent : null;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadPlanArtifact(
      uid: string,
      pathOptionsArtifactId: string,
      pathId: string,
    ) {
      const { data } = await supabase
        .from('artifacts')
        .select('id')
        .eq('user_id', uid)
        .eq('type', 'path_plan')
        .eq('path_options_artifact_id', pathOptionsArtifactId)
        .eq('path_id', pathId)
        .maybeSingle();

      if (cancelled) return;

      if (!data) {
        // select-path always creates the artifact before redirect; this retry handles
        // the edge case where the commit hasn't landed yet.
        if (pollRef.current === null) {
          pollRef.current = setInterval(() => {
            if (!cancelled) loadPlanArtifact(uid, pathOptionsArtifactId, pathId);
          }, 3000);
        }
        return;
      }

      stopPolling();
      setArtifactId(data.id as string);
      setPageState('has-artifact');
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      if (!cancelled) setUserId(user.id);

      if (process.env.NEXT_PUBLIC_OPEN_ACCESS !== 'true') {
        const { data: entitlement } = await supabase
          .from('entitlements')
          .select('id')
          .eq('user_id', user.id)
          .eq('product', 'onetime_payment')
          .eq('status', 'active')
          .maybeSingle();

        if (!entitlement) {
          if (!cancelled) setPageState('unpaid');
          return;
        }
      }

      // Fetch the latest path selection
      const { data: selection } = await supabase
        .from('path_selections')
        .select('path_options_artifact_id, path_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (!selection) {
        setPageState('no-selection');
        return;
      }

      setActiveSelection({
        path_options_artifact_id: selection.path_options_artifact_id as string,
        path_id: selection.path_id as string,
      });

      await loadPlanArtifact(
        user.id,
        selection.path_options_artifact_id as string,
        selection.path_id as string,
      );
    }

    init();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [stopPolling]);

  async function handleRetry() {
    if (!userId || !activeSelection) return;
    setRetrying(true);
    setArtifactId(null);
    const res = await fetch('/api/select-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path_options_artifact_id: activeSelection.path_options_artifact_id,
        path_id: activeSelection.path_id,
      }),
    });
    setRetrying(false);
    if (res.ok) {
      const { artifact_id } = await res.json() as { artifact_id: string };
      setArtifactId(artifact_id);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────
  if (pageState === 'loading') return null;

  // ── Anonymous ─────────────────────────────────────────────────────
  if (pageState === 'anonymous') {
    return (
      <GatedState
        eyebrow="YOUR PLAN"
        heading="Your action plan is built around your chosen path."
        body="Choose a path to unlock your plan."
      />
    );
  }

  // ── Unpaid ────────────────────────────────────────────────────────
  if (pageState === 'unpaid') {
    return (
      <MessageState
        eyebrow="YOUR PLAN"
        heading="Your Plan is waiting on the other side of Path."
        body="Choose one of your four path options on the Path page and your tailored Plan will be generated automatically."
        cta={<PrimaryButton href="/path">See Your Path Options</PrimaryButton>}
      />
    );
  }

  // ── No selection ──────────────────────────────────────────────────
  if (pageState === 'no-selection') {
    return (
      <MessageState
        eyebrow="YOUR PLAN"
        heading="Choose your path first."
        body="Select one of your four path options and your Plan will be generated automatically."
        cta={<PrimaryButton href="/path">See Your Path Options</PrimaryButton>}
      />
    );
  }

  // ── has-artifact: hook-driven generation states ───────────────────
  if (genPhase.phase === 'idle') {
    return (
      <div className="flow-container generating-container">
        <div className="spin spinner" />
        <div className="text-center-col">
          <h2>Your Plan is being prepared.</h2>
          <p className="generating-desc">This usually takes about a minute.</p>
        </div>
      </div>
    );
  }

  if (genPhase.phase === 'spinner') {
    return (
      <div className="flow-container generating-container">
        <div className="spin spinner" />
        <div className="text-center-col">
          <h2>Your Plan is being prepared.</h2>
          <p className="generating-desc">
            {genPhase.variant === 'early'
              ? 'This usually takes about a minute.'
              : 'Still working — this is taking a little longer than usual…'}
          </p>
        </div>
      </div>
    );
  }

  if (genPhase.phase === 'come-back-later') {
    return (
      <div className="flow-container generating-container">
        <div className="text-center-col">
          <p className="generating-desc">
            Your plan is still being prepared. This is taking longer than expected — you can
            leave this page and come back in a few minutes. It&rsquo;ll be here when it&rsquo;s ready.
          </p>
        </div>
      </div>
    );
  }

  if (genPhase.phase === 'failed') {
    return (
      <MessageState
        eyebrow="YOUR PLAN"
        heading="Something went wrong."
        body="We couldn’t generate your Plan. Please try again."
        cta={
          <PrimaryButton onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </PrimaryButton>
        }
      />
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────
  if (!plan) return null;

  const { plan_frame, full_path, start_here, implement_bridge } = plan;

  return (
    <div className="flow-container">
      <div className="report-scroll">

        <div className="report-cover">
          <p className="eyebrow">Your Path Plan</p>
        </div>

        <div className="report-sections">

          {/* Plan Frame */}
          <div className="report-section">
            <p className="eyebrow">PLAN FRAME</p>
            <p>{plan_frame}</p>
          </div>

          {/* Full Path */}
          <div className="report-section">
            <p className="eyebrow">THE FULL PATH</p>
            {full_path.map(phase => (
              <div key={phase.phase_number} className="constellation-card">
                <div className="constellation-card-header">
                  <div className="constellation-badge">{phase.phase_number}</div>
                  <div className="constellation-header-info">
                    <div className="constellation-sig-name">{phase.name}</div>
                    <div className="constellation-sig-meta">{phase.estimated_duration}</div>
                  </div>
                </div>
                <p className="core-statement">{phase.outcome}</p>
                <p className="evidence-analysis">{phase.body}</p>
                {phase.milestones.length > 0 && (
                  <div className="phase-milestones">
                    <p className="card-sub-label">Milestones</p>
                    {phase.milestones.map((m, mi) => (
                      <div key={mi} className="phase-milestone-item">
                        <span className="phase-milestone-dot" />
                        <span>{m}</span>
                      </div>
                    ))}
                  </div>
                )}
                {phase.signatures_leaned_on.length > 0 && (
                  <div className="option-card-sigs">
                    {phase.signatures_leaned_on.map(sig => (
                      <span key={sig} className="chip-tag">{sig}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Start Here */}
          <div className="report-section">
            <p className="eyebrow">START HERE</p>
            <div className="card">
              {start_here.map((item, i) => (
                <div key={i} className="start-here-action">
                  <p className="start-here-action-text">{item.action}</p>
                  <p className="start-here-action-why">{item.why}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Now Let's Implement It */}
        <div className="limits-block">
          <p className="limits-eyebrow">NOW LET&rsquo;S IMPLEMENT IT</p>
          <p className="limits-body">{implement_bridge}</p>
          <PrimaryButton href="/mentor">
            Open the Mentor →
          </PrimaryButton>
        </div>

      </div>
    </div>
  );
}
