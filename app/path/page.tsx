'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import GatedState from '@/components/GatedState';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import ConstellationCard from '@/components/ConstellationCard';
import ChipRow from '@/components/ChipRow';
import type { PathOptionsArtifactContent, PathOption, StretchType, IdentityReframeArtifactContent } from '@/lib/artifact-schemas';
import { useGenerationStatus } from '@/lib/generation-status';
import { getCurrentArtifact } from '@/lib/artifacts';

type PageState = 'loading' | 'anonymous' | 'no-report' | 'verifying' | 'unpaid' | 'has-artifact';

function stretchClass(stretch: StretchType): string {
  switch (stretch) {
    case 'Natural':     return 'band-strong';
    case 'Adjacent':    return 'band-moderate';
    case 'Reinvention': return 'band-dominant';
  }
}

export default function PathPage() {
  const router = useRouter();
  const [pageState, setPageState]                   = useState<PageState>('loading');
  const [userId, setUserId]                         = useState<string | null>(null);
  const [namedIdentity, setNamedIdentity]           = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading]       = useState(false);
  const [grantLoading, setGrantLoading]             = useState(false);
  const [pathOptionsArtifactId, setPathOptionsArtifactId] = useState<string | null>(null);
  const [confirmPending, setConfirmPending]         = useState<PathOption | null>(null);
  const [selectingId, setSelectingId]               = useState<string | null>(null);
  const [startFailed, setStartFailed]               = useState(false);
  const [namingOption, setNamingOption]             = useState<PathOption | null>(null);
  const [namingLoading, setNamingLoading]           = useState(false);
  const [nameOptions, setNameOptions]               = useState<{ name: string; rationale: string }[]>([]);
  const [selectedName, setSelectedName]             = useState<string | null>(null);
  const [customName, setCustomName]                 = useState('');
  const [reframeArtifactId, setReframeArtifactId]   = useState<string | null>(null);
  const [reframeStartFailed, setReframeStartFailed] = useState(false);

  // pathOptionsArtifactId doubles as the hook's artifact ID
  const genPhase   = useGenerationStatus(pathOptionsArtifactId);
  const pathOptions = genPhase.phase === 'ready' ? genPhase.content as PathOptionsArtifactContent : null;

  // #98/#113: unpaid pitch — eager, unconditional generation trigger. /path
  // is now the sole trigger point for identity_reframe (moved off /identity
  // in #113, which folded a short teaser into identity_report itself instead).
  const reframeGenPhase = useGenerationStatus(reframeArtifactId);
  const reframeContent = reframeGenPhase.phase === 'ready' ? reframeGenPhase.content as IdentityReframeArtifactContent : null;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadOrStartReframe(uid: string) {
      const { data } = await getCurrentArtifact<{ id: string }>(
        supabase,
        uid,
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
      } else {
        setReframeStartFailed(true);
      }
    }

    async function loadPathOptions(uid: string) {
      const { data } = await getCurrentArtifact<{ id: string }>(
        supabase,
        uid,
        'path_options',
        { select: 'id' },
      );

      if (cancelled) return;

      if (!data) {
        setPageState('has-artifact'); // show spinner while the generate call is in flight
        const res = await fetch('/api/generate-path-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!cancelled) {
          if (res.ok) {
            const { artifact_id } = await res.json() as { artifact_id: string };
            setPathOptionsArtifactId(artifact_id);
          } else {
            setStartFailed(true);
          }
        }
        return;
      }

      setPathOptionsArtifactId(data.id as string);
      setPageState('has-artifact');
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      if (!cancelled) setUserId(user.id);

      // Handle return from Stripe Checkout
      const sessionId = new URLSearchParams(window.location.search).get('session_id');
      if (sessionId) {
        if (!cancelled) setPageState('verifying');
        const res = await fetch('/api/verify-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const { granted } = await res.json() as { granted: boolean };
        window.history.replaceState({}, '', '/path');
        if (cancelled) return;
        if (granted) {
          await loadPathOptions(user.id);
          return;
        }
      }

      if (cancelled) return;

      // #98: no identity_report yet is a distinct state — the unpaid pitch
      // below renders real identity_reframe content now, and that content
      // can't exist without identity_report, so there's nothing to
      // gracefully fall back to. Explicit check before the entitlement
      // check, same pattern as the 'anonymous' state.
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
            const name = (reportArtifact.content as any)?.cover?.named_identity ?? null;
            setNamedIdentity(name);
            setPageState('unpaid');
            await loadOrStartReframe(user.id);
          }
          return;
        }
      }

      await loadPathOptions(user.id);
    }

    init();
    return () => { cancelled = true; };
  }, []);

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

  async function handleRetry() {
    if (!userId) return;
    setStartFailed(false);
    setPathOptionsArtifactId(null);
    const res = await fetch('/api/generate-path-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const { artifact_id } = await res.json() as { artifact_id: string };
      setPathOptionsArtifactId(artifact_id);
    } else {
      setStartFailed(true);
    }
  }

  async function handleRetryReframe() {
    setReframeStartFailed(false);
    setReframeArtifactId(null);
    const res = await fetch('/api/generate-identity-reframe', { method: 'POST' });
    if (res.ok) {
      const { artifact_id } = await res.json() as { artifact_id: string };
      setReframeArtifactId(artifact_id);
    } else {
      setReframeStartFailed(true);
    }
  }

  async function handleProceedToNaming() {
    if (!confirmPending || !userId || !pathOptionsArtifactId) return;
    const option = confirmPending;
    setConfirmPending(null);
    setNamingOption(option);
    setNameOptions([]);
    setSelectedName(null);
    setCustomName('');
    setNamingLoading(true);
    const res = await fetch('/api/generate-project-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path_options_artifact_id: pathOptionsArtifactId,
        path_id: option.id,
      }),
    });
    setNamingLoading(false);
    if (res.ok) {
      const { options: generated } = await res.json() as { options: { name: string; rationale: string }[] };
      setNameOptions(generated);
    }
  }

  async function handleFinalizeSelect(projectName?: string) {
    if (!namingOption || !userId || !pathOptionsArtifactId || selectingId) return;
    const option = namingOption;
    setSelectingId(option.id);
    setNamingOption(null);
    const res = await fetch('/api/select-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path_options_artifact_id: pathOptionsArtifactId,
        path_id: option.id,
        ...(projectName ? { project_name: projectName } : {}),
      }),
    });
    if (res.ok) {
      router.push('/plan');
    } else {
      setSelectingId(null);
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
        heading="Your path options are generated from your Identity Report."
        body="Unlock your Identity Report first to see your paths."
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

  // ── has-artifact: hook-driven generation states ───────────────────
  if (pageState === 'has-artifact') {
    if (startFailed) {
      return (
        <MessageState
          eyebrow="YOUR PATH"
          heading="Something went wrong."
          body="We couldn’t generate your Path Options. Please try again."
          cta={<PrimaryButton onClick={handleRetry}>Try again</PrimaryButton>}
        />
      );
    }

    if (genPhase.phase === 'idle') {
      return (
        <GeneratingState
          heading="Your Path Options are being prepared."
          description="This usually takes about a minute."
        />
      );
    }

    if (genPhase.phase === 'spinner') {
      return (
        <GeneratingState
          heading="Your Path Options are being prepared."
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
          description="Your Path Options are still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It’ll be here when it’s ready."
        />
      );
    }

    if (genPhase.phase === 'failed') {
      return (
        <MessageState
          eyebrow="YOUR PATH"
          heading="Something went wrong."
          body="We couldn’t generate your Path Options. Please try again."
          cta={<PrimaryButton onClick={handleRetry}>Try again</PrimaryButton>}
        />
      );
    }
    // phase === 'ready': fall through to report render below
  }

  // ── Unpaid: identity_reframe pitch ─────────────────────────────────
  if (pageState === 'unpaid') {
    const headline = namedIdentity
      ? `See where ${namedIdentity} is heading.`
      : 'See where your identity is pointing.';

    if (reframeStartFailed || reframeGenPhase.phase === 'failed') {
      return (
        <MessageState
          eyebrow="YOUR PATH"
          heading="Something went wrong."
          body="We couldn’t prepare your preview. Please try again."
          cta={<PrimaryButton onClick={handleRetryReframe}>Try again</PrimaryButton>}
        />
      );
    }

    if (reframeGenPhase.phase === 'idle' || reframeGenPhase.phase === 'spinner') {
      return (
        <GeneratingState
          heading="Your preview is being prepared."
          description={
            reframeGenPhase.phase === 'spinner' && reframeGenPhase.variant === 'late'
              ? 'Still working — this is taking a little longer than usual…'
              : 'This usually takes about a minute.'
          }
        />
      );
    }

    if (reframeGenPhase.phase === 'come-back-later') {
      return (
        <GeneratingState
          spinner={false}
          description="This is taking longer than expected — you can leave this page and come back in a few minutes. It’ll be here when it’s ready."
        />
      );
    }

    if (!reframeContent) return null;
    const { recap, meaning, reframe, why } = reframeContent;

    return (
      <>
        <div className="flow-container">
          <div className="scroll-area scroll-area--wide-bottom">
            <p className="eyebrow">YOUR PATH</p>

            <h1>{headline}</h1>

            <p className="eyebrow">WHAT WE&rsquo;RE WORKING WITH</p>
            <p>{recap}</p>

            <p className="eyebrow">WHAT THIS MEANS FOR WHAT&rsquo;S NEXT</p>
            <p>{meaning}</p>

            <p className="eyebrow">WHERE YOUR STORY IS POINTING</p>
            <p>{reframe}</p>

            <p className="eyebrow">WHY THE REFRAME HOLDS</p>
            <p>{why}</p>

            {process.env.NEXT_PUBLIC_PRICE_DISPLAY && (
              <div className="stats-pill">
                <span className="stats-label" style={{ fontWeight: 700, fontSize: '15px' }}>
                  {process.env.NEXT_PUBLIC_PRICE_DISPLAY}
                </span>
                <span className="sep-dot" />
                <span className="stats-label">One-time · Yours forever</span>
              </div>
            )}

            <PrimaryButton onClick={handleCheckout} disabled={checkoutLoading}>
              {checkoutLoading ? 'Redirecting…' : 'Get My Path & Plan'}
            </PrimaryButton>

            <p className="form-helper">One-time payment · No subscription · Instant access</p>

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
      </>
    );
  }

  // ── Ready: full report ────────────────────────────────────────────
  if (!pathOptions) return null;

  const { options } = pathOptions;

  return (
    <>
      {/* Confirm dialog */}
      {confirmPending && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <p className="eyebrow">CONFIRM YOUR CHOICE</p>
            <h2>You&rsquo;ve chosen {confirmPending.name}.</h2>
            <p>This will generate your personalised Plan. You can change your path later.</p>
            <div className="dialog-actions">
              <PrimaryButton onClick={handleProceedToNaming}>
                Continue
              </PrimaryButton>
              <LinkButton onClick={() => setConfirmPending(null)}>
                Not yet
              </LinkButton>
            </div>
          </div>
        </div>
      )}

      {/* Project naming dialog */}
      {namingOption && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <p className="eyebrow">NAME YOUR PROJECT</p>
            <h2>Want to name this?</h2>
            <p>
              Give {namingOption.name} a name of its own, or skip — your path proceeds
              either way.
            </p>

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
                onClick={() => handleFinalizeSelect(selectedName ?? (customName.trim() || undefined))}
                disabled={!!selectingId || (!selectedName && !customName.trim())}
              >
                {selectingId ? 'Generating…' : 'Name my Project'}
              </PrimaryButton>
              <LinkButton
                onClick={() => handleFinalizeSelect(undefined)}
                disabled={!!selectingId}
              >
                Skip
              </LinkButton>
            </div>
          </div>
        </div>
      )}

      <div className="flow-container">
        <div className="report-scroll">

          <div className="report-cover">
            <p className="eyebrow">Your Path Options</p>
          </div>

          <div className="report-sections">

            {/* Section 1: Options */}
            <div className="report-section">
              <p className="eyebrow">YOUR PATH OPTIONS</p>
              {options.map((option, i) => (
                <ConstellationCard
                  key={option.id}
                  badge={i + 1}
                  title={option.name}
                  meta={option.thesis}
                  pill={
                    <span className={`score-band-pill ${stretchClass(option.stretch)}`}>
                      {option.stretch}
                    </span>
                  }
                >
                  <p className="evidence-analysis">{option.body}</p>
                  <ChipRow items={option.signatures_engaged} wrapperClassName="option-card-sigs" />
                  <div className="option-card-footer">
                    <PrimaryButton
                      onClick={() => setConfirmPending(option)}
                      disabled={!!selectingId}
                    >
                      {selectingId === option.id ? 'Generating…' : 'Select This Path →'}
                    </PrimaryButton>
                  </div>
                </ConstellationCard>
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
