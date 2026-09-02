'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import ReframeCtaBlock from '@/components/ReframeCtaBlock';
import DirectionFlow from '@/components/DirectionFlow';
import type { ReframeTeaser } from '@/lib/artifact-schemas';
import { useCheckpointSessionStatus } from '@/lib/checkpoint-status';
import { getCurrentArtifact } from '@/lib/artifacts';
import { usePathDirection } from '@/lib/use-path-direction';

type PageState = 'loading' | 'anonymous' | 'no-report' | 'verifying' | 'unpaid' | 'checkpoint-flow';

export default function PathPage() {
  const [pageState, setPageState]             = useState<PageState>('loading');
  const [userId, setUserId]                   = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [grantLoading, setGrantLoading]       = useState(false);
  const [reframeTeaser, setReframeTeaser]     = useState<ReframeTeaser | null>(null);
  const [primaryConstellation, setPrimaryConstellation] = useState<{ name: string }[]>([]);

  // ── Checkpoint flow state — only sessionId/refreshKey survive #134's
  //    dead-code removal, since stage5NotYetRun below still reads
  //    checkpointPhase (itself derived from these two). Everything else
  //    that used to live in this block (startFailed, submitting, submitError,
  //    redoText, selectedCandidateId, capExceededNotice) was only read/set by
  //    the old Checkpoint 2/3/final-report/naming UI, removed below. sessionId
  //    itself has no setter left — nothing writes to it anymore (the old
  //    bootstrap effect that used to call setSessionId was removed earlier
  //    this same cleanup), so it stays permanently null. ──────────────────
  const [sessionId]                       = useState<string | null>(null);
  const [refreshKey, setRefreshKey]       = useState(0);

  const checkpointPhase = useCheckpointSessionStatus(sessionId, refreshKey);

  const direction = usePathDirection(pageState === 'checkpoint-flow');
  const [draftMustHaves, setDraftMustHaves]   = useState<string[]>([]);
  const [draftMustAvoids, setDraftMustAvoids] = useState<string[]>([]);
  const [draftIdealLife, setDraftIdealLife]   = useState('');

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

  // The old "kick off/resume the checkpoint session" bootstrap effect that
  // used to live here (POSTing /api/generate-path-options, setting sessionId/
  // startFailed) is removed, not just unwired — #134 Slice 1's Direction
  // bootstrap (usePathDirection) replaces it. Leaving it in place would have
  // kept invisibly kicking off the old Stage 1/2 pipeline (real LLM calls) on
  // every page load with nothing left in the render tree to consume the
  // result, since sessionId/checkpointPhase are no longer rendered below.

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

  // The "fetch the final report once the session completes" and "offer
  // naming once" effects that used to live here, plus submitCheckpointResponse/
  // handleGenerateNames/handleSaveName below, are removed along with the old
  // Checkpoint 2/3/final-report/naming UI they only ever served — see the
  // dead-code removal note further down, at the point that UI used to render.

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

  // ── Checkpoint 1 "Direction" (#134 Slice 1) ──────────────────────────
  // Every remaining pageState value returned above, so pageState is
  // 'checkpoint-flow' from here on. This block fully owns rendering for it
  // in this slice — nothing below (the old sessionId/checkpointPhase flow)
  // is reachable, since nothing here ever sets sessionId.
  if (direction.loading) {
    return (
      <GeneratingState heading="Loading your Direction step." />
    );
  }

  if (direction.error || !direction.content || !direction.step) {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Something went wrong."
        body={direction.error ?? 'We couldn’t load your Direction step. Please try again.'}
        cta={<PrimaryButton onClick={direction.retry}>Try again</PrimaryButton>}
      />
    );
  }

  // direction.content/direction.step are guaranteed non-null past the guard
  // above, but TS can't see that through the object property access alone —
  // narrow via local consts so DirectionFlow's stricter prop type checks out.
  const directionContent = direction.content;
  const directionStep = direction.step;

  return (
    <DirectionFlow
      direction={{ ...direction, content: directionContent, step: directionStep }}
      draftMustHaves={draftMustHaves}
      setDraftMustHaves={setDraftMustHaves}
      draftMustAvoids={draftMustAvoids}
      setDraftMustAvoids={setDraftMustAvoids}
      draftIdealLife={draftIdealLife}
      setDraftIdealLife={setDraftIdealLife}
    />
  );

  // The old Checkpoint 2/3/final-report/naming UI that used to render from
  // here to the end of this component is removed, not left dead. It became
  // permanently unreachable once #134 Slice 1 replaced the old checkpoint
  // bootstrap with usePathDirection (sessionId is never set anymore, so
  // checkpointPhase never leaves 'idle' and finalResult never gets set) —
  // and, being unreachable, it no longer type-checks under strict control-
  // flow narrowing (TypeScript stops narrowing checkpointPhase/finalResult
  // for code it can prove is dead). Superseded by #134's new Checkpoint
  // 2 ("Options") and final delivery, not yet built. See lib/path-checkpoint.ts
  // and lib/generate-path-checkpoint.ts for the still-intact Stage 5/6
  // reasoning pipeline and API routes this UI used to call into — none of
  // that backend code was touched by this removal.
}
