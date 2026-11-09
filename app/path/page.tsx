'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { useAuthUser } from '@/lib/use-auth-user';
import GatedState from '@/components/GatedState';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import ReframeCtaBlock from '@/components/ReframeCtaBlock';
import PathConversation from '@/components/PathConversation';
import type { ReframeTeaser } from '@/lib/artifact-schemas';
import type { IdentityReportResponse } from '@/lib/identity-report-view';

type PageState = 'loading' | 'anonymous' | 'no-report' | 'verifying' | 'unpaid' | 'conversation' | 'error';

export default function PathPage() {
  const [pageState, setPageState]             = useState<PageState>('loading');
  const [entryError, setEntryError]           = useState<string | null>(null);
  const [entryRetryKey, setEntryRetryKey]     = useState(0);
  const [userId, setUserId]                   = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [grantLoading, setGrantLoading]       = useState(false);
  const [reframeTeaser, setReframeTeaser]     = useState<ReframeTeaser | null>(null);
  const [primaryConstellation, setPrimaryConstellation] = useState<{ name: string }[]>([]);

  // The old Direction/Options checkpoint flow's hooks used to live here. A
  // paid user now gets the Path conversation instead (Miroslav, 2026-11-09),
  // so they are removed from this page: left in place they would start the
  // old pipeline on every visit. Their files stay until #170 removes them.

  const { user: authUser, loading: authLoading, error: authError } = useAuthUser();

  // ── Entry gating ──────────────────────────────────────────────────
  useEffect(() => {
    // First run waits for the shared, deduped getUser() fetch (see
    // lib/use-auth-user.ts, #146's real fix) rather than calling getUser()
    // itself — this is what removes this effect's own contribution to the
    // Header/BottomNav/path concurrent-lock race.
    if (entryRetryKey === 0 && authLoading) return;

    const supabase = createClient();
    let cancelled = false;

    async function init() {
      try {
        // A retry click performs its own fresh getUser() call instead of
        // reusing the shared one-shot fetch — deliberate: useAuthUser()
        // fetches exactly once per page load and never refetches, so
        // reusing it here would make "Try again" retry nothing. A retry is
        // a one-off, user-triggered action that fires well after mount,
        // never concurrent with Header/BottomNav's own mount-time calls, so
        // a direct call here doesn't reintroduce the race this effect
        // exists to avoid.
        const { data: { user }, error: getUserError } = entryRetryKey > 0
          ? await supabase.auth.getUser()
          : { data: { user: authUser }, error: authError };

        // getUser() doesn't always throw on failure — a retryable fetch
        // failure (e.g. an #141-style transient Supabase outage) resolves as
        // { user: null, error: AuthRetryableFetchError } rather than
        // rejecting, so it has to be checked explicitly here or it silently
        // reads as "not logged in". A genuinely missing session also
        // resolves this way (AuthSessionMissingError) — that one IS the real
        // "not logged in" case, so it's excluded from the throw below.
        if (getUserError && !isAuthSessionMissingError(getUserError)) {
          throw getUserError;
        }

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
            if (!cancelled) setPageState('conversation');
            return;
          }
        }

        if (cancelled) return;

        // #162: the latest ready report, read through the paywalled route
        // rather than artifacts directly. A failed read counts as no report,
        // as the direct read's error did.
        const reportArtifact = await fetch('/api/identity-report?status=ready', { cache: 'no-store' })
          .then(res => (res.ok ? res.json() as Promise<IdentityReportResponse> : null))
          .then(body => body?.artifact ?? null)
          .catch(() => null);

        if (!reportArtifact || reportArtifact.status !== 'ready') {
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
              // A locked projection (#162) carries reframe_teaser and the
              // primary names in its hero; the full report has them as before.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const content = reportArtifact.content as any;
              setReframeTeaser(content?.reframe_teaser ?? null);
              const primaries = reportArtifact.locked ? content?.hero?.primary : content?.primary_constellation;
              setPrimaryConstellation(Array.isArray(primaries) ? primaries : []);
              setPageState('unpaid');
            }
            return;
          }
        }

        if (!cancelled) setPageState('conversation');
      } catch (err) {
        console.error('Path entry gating failed:', err);
        if (!cancelled) {
          setEntryError(err instanceof Error ? err.message : 'Something went wrong.');
          setPageState('error');
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [entryRetryKey, authLoading, authUser, authError]);

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

  // ── Entry gating failed (#146 backstop) ─────────────────────────────
  if (pageState === 'error') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Something went wrong."
        body={entryError ?? 'We couldn’t load this page. Please try again.'}
        cta={
          <PrimaryButton
            onClick={() => {
              setEntryError(null);
              setPageState('loading');
              setEntryRetryKey(k => k + 1);
            }}
          >
            Try again
          </PrimaryButton>
        }
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

  // ── Paid: the Path conversation, its intro and "Your path" ──────────
  // (Miroslav, 2026-11-09). Every other pageState returned above, so this
  // is the paid, report-ready user. The old Direction/Options flow is no
  // longer reachable from here; #170 removes its code.
  return <PathConversation />;
}
