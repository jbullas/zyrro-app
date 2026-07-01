'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import GatedState from '@/components/GatedState';
import type { PathOptionsArtifactContent, PathOption, StretchType } from '@/lib/artifact-schemas';
import { useGenerationStatus } from '@/lib/generation-status';

type PageState = 'loading' | 'anonymous' | 'verifying' | 'unpaid' | 'has-artifact';

const OFFER_FEATURES = [
  { title: 'Your Meaning',      body: 'Why your current situation makes complete sense given who you are.' },
  { title: 'Your Reframe',      body: 'How to see your Identity Signatures as assets, not limitations.' },
  { title: 'Four Path Options', body: 'Each aligned to your constellation — not generic career advice.' },
  { title: 'Your Plan',         body: 'A tailored action plan built around the path you choose.' },
];

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

  // pathOptionsArtifactId doubles as the hook's artifact ID
  const genPhase   = useGenerationStatus(pathOptionsArtifactId);
  const pathOptions = genPhase.phase === 'ready' ? genPhase.content as PathOptionsArtifactContent : null;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadPathOptions(uid: string) {
      const { data } = await supabase
        .from('artifacts')
        .select('id')
        .eq('user_id', uid)
        .eq('type', 'path_options')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

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

      if (process.env.NEXT_PUBLIC_OPEN_ACCESS !== 'true') {
        const { data: entitlement } = await supabase
          .from('entitlements')
          .select('id')
          .eq('user_id', user.id)
          .eq('product', 'onetime_payment')
          .eq('status', 'active')
          .maybeSingle();

        if (!entitlement) {
          const { data: artifact } = await supabase
            .from('artifacts')
            .select('content')
            .eq('user_id', user.id)
            .eq('type', 'identity_report')
            .eq('status', 'ready')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!cancelled) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const name = (artifact?.content as any)?.cover?.named_identity ?? null;
            setNamedIdentity(name);
            setPageState('unpaid');
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

  async function handleConfirmSelect() {
    if (!confirmPending || !userId || !pathOptionsArtifactId || selectingId) return;
    const option = confirmPending;
    setSelectingId(option.id);
    setConfirmPending(null);
    const res = await fetch('/api/select-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path_options_artifact_id: pathOptionsArtifactId,
        path_id: option.id,
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
      <div className="flow-container generating-container">
        <div className="spin spinner" />
        <div className="text-center-col">
          {pageState === 'verifying' && <h2>Confirming your payment…</h2>}
        </div>
      </div>
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

  // ── has-artifact: hook-driven generation states ───────────────────
  if (pageState === 'has-artifact') {
    if (startFailed) {
      return (
        <div className="flow-container gated-container">
          <p className="eyebrow">YOUR PATH</p>
          <h2>Something went wrong.</h2>
          <p>We couldn&rsquo;t generate your Path Options. Please try again.</p>
          <button onClick={handleRetry} className="btn-primary">Try again</button>
        </div>
      );
    }

    if (genPhase.phase === 'idle') {
      return (
        <div className="flow-container generating-container">
          <div className="spin spinner" />
          <div className="text-center-col">
            <h2>Your Path Options are being prepared.</h2>
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
            <h2>Your Path Options are being prepared.</h2>
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
              Your Path Options are still being prepared. This is taking longer than expected — you
              can leave this page and come back in a few minutes. It&rsquo;ll be here when it&rsquo;s ready.
            </p>
          </div>
        </div>
      );
    }

    if (genPhase.phase === 'failed') {
      return (
        <div className="flow-container gated-container">
          <p className="eyebrow">YOUR PATH</p>
          <h2>Something went wrong.</h2>
          <p>We couldn&rsquo;t generate your Path Options. Please try again.</p>
          <button onClick={handleRetry} className="btn-primary">Try again</button>
        </div>
      );
    }
    // phase === 'ready': fall through to report render below
  }

  // ── Unpaid: offer page ────────────────────────────────────────────
  if (pageState === 'unpaid') {
    const headline = namedIdentity
      ? `See where ${namedIdentity} is heading.`
      : 'See where your identity is pointing.';

    return (
      <>
        <div className="flow-container">
          <div className="scroll-area" style={{ padding: '48px 24px 40px' }}>
            <p className="eyebrow">YOUR PATH</p>

            <h1>{headline}</h1>

            <p>
              Your Identity Report showed you how you&rsquo;re wired. Path & Plan shows you
              what to do with it — four options aligned to your signatures, and a tailored
              plan built around the one you choose.
            </p>

            <div className="deliverables-list">
              {OFFER_FEATURES.map(f => (
                <div key={f.title} className="offer-row">
                  <div className="deliverable-icon">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <span className="deliverable-label" style={{ fontWeight: 700 }}>{f.title}</span>
                    <p style={{ margin: '2px 0 0', fontSize: '14px' }}>{f.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {process.env.NEXT_PUBLIC_PRICE_DISPLAY && (
              <div className="stats-pill">
                <span className="stats-label" style={{ fontWeight: 700, fontSize: '15px' }}>
                  {process.env.NEXT_PUBLIC_PRICE_DISPLAY}
                </span>
                <span className="sep-dot" />
                <span className="stats-label">One-time · Yours forever</span>
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className={`btn-primary${checkoutLoading ? ' btn-disabled' : ''}`}
            >
              {checkoutLoading ? 'Redirecting…' : 'Get My Path & Plan'}
            </button>

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

  const { recap, meaning, reframe, why, options } = pathOptions;

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
              <button
                onClick={handleConfirmSelect}
                disabled={!!selectingId}
                className={`btn-primary${selectingId ? ' btn-disabled' : ''}`}
              >
                {selectingId ? 'Generating…' : 'Generate my Plan'}
              </button>
              <button onClick={() => setConfirmPending(null)} className="btn-link">
                Not yet
              </button>
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

            {/* Section 1: Recap */}
            <div className="report-section">
              <p className="eyebrow">WHAT WE&rsquo;RE WORKING WITH</p>
              <p>{recap}</p>
            </div>

            {/* Section 2: Meaning */}
            <div className="report-section">
              <p className="eyebrow">WHAT THIS MEANS FOR WHAT&rsquo;S NEXT</p>
              <p>{meaning}</p>
            </div>

            {/* Section 3: Reframe */}
            <div className="report-section">
              <p className="eyebrow">WHERE YOUR STORY IS POINTING</p>
              <p>{reframe}</p>
            </div>

            {/* Section 4: Why */}
            <div className="report-section">
              <p className="eyebrow">WHY THE REFRAME HOLDS</p>
              <p>{why}</p>
            </div>

            {/* Section 5: Options */}
            <div className="report-section">
              <p className="eyebrow">YOUR PATH OPTIONS</p>
              {options.map((option, i) => (
                <div key={option.id} className="constellation-card">
                  <div className="constellation-card-header">
                    <div className="constellation-badge">{i + 1}</div>
                    <div className="constellation-header-info">
                      <div className="constellation-sig-name">{option.name}</div>
                      <div className="constellation-sig-meta">{option.thesis}</div>
                    </div>
                    <span className={`score-band-pill ${stretchClass(option.stretch)}`}>
                      {option.stretch}
                    </span>
                  </div>
                  <p className="evidence-analysis">{option.body}</p>
                  <div className="option-card-sigs">
                    {option.signatures_engaged.map(sig => (
                      <span key={sig} className="chip-tag">{sig}</span>
                    ))}
                  </div>
                  <div className="option-card-footer">
                    <button
                      onClick={() => setConfirmPending(option)}
                      disabled={!!selectingId}
                      className={`btn-primary${selectingId ? ' btn-disabled' : ''}`}
                    >
                      {selectingId === option.id ? 'Generating…' : 'Select This Path →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
