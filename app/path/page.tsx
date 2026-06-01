'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';

type PageState = 'loading' | 'anonymous' | 'verifying' | 'unpaid' | 'paid';

const OFFER_FEATURES = [
  { title: 'Your Meaning',      body: 'Why your current situation makes complete sense given who you are.' },
  { title: 'Your Reframe',      body: 'How to see your Identity Signatures as assets, not limitations.' },
  { title: 'Four Path Options', body: 'Each aligned to your constellation — not generic career advice.' },
  { title: 'Your Plan',         body: 'A tailored action plan built around the path you choose.' },
];

export default function PathPage() {
  const [pageState, setPageState]         = useState<PageState>('loading');
  const [userId, setUserId]               = useState<string | null>(null);
  const [namedIdentity, setNamedIdentity] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [grantLoading, setGrantLoading]   = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setPageState('anonymous');
        return;
      }

      setUserId(user.id);

      // Handle return from Stripe Checkout
      const sessionId = new URLSearchParams(window.location.search).get('session_id');
      if (sessionId) {
        setPageState('verifying');
        const res = await fetch('/api/verify-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, user_id: user.id }),
        });
        const { granted } = await res.json() as { granted: boolean };
        // Clean the URL
        window.history.replaceState({}, '', '/path');
        if (granted) {
          setPageState('paid');
          return;
        }
      }

      // Check entitlement directly (user can read own rows via RLS)
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('product', 'onetime_payment')
        .eq('status', 'active')
        .maybeSingle();

      if (entitlement) {
        setPageState('paid');
        return;
      }

      // Fetch named identity for offer personalisation
      const { data: artifact } = await supabase
        .from('artifacts')
        .select('content')
        .eq('user_id', user.id)
        .eq('type', 'identity_report')
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (artifact?.content as any)?.cover?.named_identity ?? null;
      setNamedIdentity(name);
      setPageState('unpaid');
    }

    init();
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
    setPageState('paid');
    setGrantLoading(false);
  }

  if (pageState === 'loading' || pageState === 'verifying') {
    return (
      <div className="flow-container generating-container">
        <div className="spin spinner" />
        <div className="text-center-col">
          <h2>{pageState === 'verifying' ? 'Confirming your payment…' : ''}</h2>
        </div>
      </div>
    );
  }

  if (pageState === 'anonymous') {
    return (
      <GatedState
        eyebrow="YOUR PATH"
        heading="Your path options are generated from your Identity Report."
        body="Unlock your Identity Report first to see your paths."
      />
    );
  }

  if (pageState === 'paid') {
    return (
      <div className="flow-container page-inner">
        <p className="eyebrow">YOUR PATH</p>
        <h2>Your Path & Plan access is confirmed.</h2>
        <p>Full Path and Plan content is coming in the next update.</p>

        {/* DEV ONLY — remove before go-live */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p className="eyebrow" style={{ color: '#999', marginBottom: '8px' }}>DEV — entitlement active</p>
        </div>
      </div>
    );
  }

  // ── Unpaid: offer page ────────────────────────────────────────────
  const headline = namedIdentity
    ? `See where ${namedIdentity} is heading.`
    : 'See where your identity is pointing.';

  return (
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
  );
}
