'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SPINNER_LATE_COPY_MS, SPINNER_TIMEOUT_MS } from '@/lib/generation-budget';
import type { IdentityReportResponse, LockedIdentityReport } from '@/lib/identity-report-view';

// #162: /identity's poller. Same phases and timings as useGenerationStatus,
// but it polls app/api/identity-report instead of reading artifacts from the
// browser, and the stranded-row flip to 'failed' happens in that route.

export type IdentityReportPhase =
  | { phase: 'loading' }          // first read in flight
  | { phase: 'none' }             // no identity_report row
  | { phase: 'error' }            // signed out, or the read failed
  | { phase: 'spinner'; variant: 'early' | 'late' }
  | { phase: 'come-back-later' }
  | { phase: 'failed' }
  | { phase: 'ready'; locked: false; content: unknown }
  | { phase: 'ready'; locked: true; content: LockedIdentityReport; unlockPrice: string | null };

const POLL_MS = 3000;

/** `active` gates the first read: pass true once auth and the questionnaire check have cleared. */
export function useIdentityReport(active: boolean): {
  report: IdentityReportPhase;
  retry: (action: () => Promise<unknown>) => Promise<void>;
} {
  const [report, setReport] = useState<IdentityReportPhase>({ phase: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function check() {
      let body: IdentityReportResponse | null = null;
      try {
        const res = await fetch('/api/identity-report', { cache: 'no-store' });
        if (res.ok) body = await res.json() as IdentityReportResponse;
      } catch {
        body = null;
      }
      if (cancelled) return;

      if (!body) { setReport({ phase: 'error' }); return; }
      const artifact = body.artifact;
      if (!artifact) { setReport({ phase: 'none' }); return; }

      if (artifact.status === 'ready') {
        setReport(artifact.locked
          ? { phase: 'ready', locked: true, content: artifact.content, unlockPrice: artifact.unlock_price }
          : { phase: 'ready', locked: false, content: artifact.content });
        return;
      }
      if (artifact.status === 'failed') { setReport({ phase: 'failed' }); return; }

      const age = Date.now() - new Date(artifact.created_at).getTime();
      setReport(
        age > SPINNER_TIMEOUT_MS
          ? { phase: 'come-back-later' }
          : age > SPINNER_LATE_COPY_MS
            ? { phase: 'spinner', variant: 'late' }
            : { phase: 'spinner', variant: 'early' },
      );
      timerRef.current = setTimeout(check, POLL_MS);
    }

    check();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active, reloadKey]);

  // Retry: show the spinner straight away (as the old artifactId reset did),
  // run the action (the retry-generation call), then read again, so the read
  // sees the new row rather than the failed one.
  const retry = useCallback(async (action: () => Promise<unknown>) => {
    setReport({ phase: 'spinner', variant: 'early' });
    try { await action(); } catch { /* the re-read shows whatever state resulted */ }
    setReloadKey(k => k + 1);
  }, []);

  return { report, retry };
}
