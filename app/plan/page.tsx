'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import GatedState from '@/components/GatedState';
import type { PathPlanArtifactContent } from '@/lib/artifact-schemas';

type PageState = 'loading' | 'anonymous' | 'unpaid' | 'no-selection' | 'generating' | 'ready' | 'failed';

export default function PlanPage() {
  const [pageState, setPageState]     = useState<PageState>('loading');
  const [userId, setUserId]           = useState<string | null>(null);
  const [plan, setPlan]               = useState<PathPlanArtifactContent | null>(null);
  const [activeSelection, setActiveSelection] = useState<{
    path_options_artifact_id: string;
    path_id: string;
  } | null>(null);
  const [retrying, setRetrying]       = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

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
        .select('id, status, content')
        .eq('user_id', uid)
        .eq('type', 'path_plan')
        .eq('path_options_artifact_id', pathOptionsArtifactId)
        .eq('path_id', pathId)
        .maybeSingle();

      if (cancelled) return;

      if (data?.status === 'ready' && data.content) {
        setPlan(data.content as PathPlanArtifactContent);
        setPageState('ready');
        stopPolling();
      } else if (data?.status === 'failed') {
        setPageState('failed');
        stopPolling();
      } else {
        setPageState('generating');
        if (pollRef.current === null) {
          pollRef.current = setInterval(() => {
            if (!cancelled) loadPlanArtifact(uid, pathOptionsArtifactId, pathId);
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
    await fetch('/api/select-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        path_options_artifact_id: activeSelection.path_options_artifact_id,
        path_id: activeSelection.path_id,
      }),
    });
    setRetrying(false);
    window.location.reload();
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
      <div className="flow-container gated-container">
        <p className="eyebrow">YOUR PLAN</p>
        <h2>Your Plan is waiting on the other side of Path.</h2>
        <p>
          Choose one of your four path options on the Path page and your
          tailored Plan will be generated automatically.
        </p>
        <Link href="/path" className="btn-primary">See Your Path Options</Link>
      </div>
    );
  }

  // ── No selection ──────────────────────────────────────────────────
  if (pageState === 'no-selection') {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">YOUR PLAN</p>
        <h2>Choose your path first.</h2>
        <p>Select one of your four path options and your Plan will be generated automatically.</p>
        <Link href="/path" className="btn-primary">See Your Path Options</Link>
      </div>
    );
  }

  // ── Generating ────────────────────────────────────────────────────
  if (pageState === 'generating') {
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

  // ── Failed ────────────────────────────────────────────────────────
  if (pageState === 'failed') {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">YOUR PLAN</p>
        <h2>Something went wrong.</h2>
        <p>We couldn&rsquo;t generate your Plan. Please try again.</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className={`btn-primary${retrying ? ' btn-disabled' : ''}`}
        >
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      </div>
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
          <Link href="/mentor" className="btn-primary">
            Open the Mentor →
          </Link>
        </div>

      </div>
    </div>
  );
}
