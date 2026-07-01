'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Must match maxDuration on the four generation routes (app/auth/callback,
// app/api/retry-generation, app/api/generate-path-options, app/api/select-path).
// Invariant: SPINNER_LATE_COPY_MS < SPINNER_TIMEOUT_MS < GENERATION_BUDGET_MS
// (75 s < 120 s < 240 s). Adjust any one value while keeping this ordering.
export const GENERATION_BUDGET_MS = 240_000;
export const SPINNER_TIMEOUT_MS   = 120_000;
export const SPINNER_LATE_COPY_MS =  75_000;
export const FLIP_GUARD_MS        =  10_000;

export type GenerationPhase =
  | { phase: 'idle' }
  | { phase: 'spinner'; variant: 'early' | 'late' }
  | { phase: 'come-back-later' }
  | { phase: 'ready'; content: unknown; createdAt: string }
  | { phase: 'failed' };

// Polls an artifact row by ID, softening the spinner copy after SPINNER_LATE_COPY_MS,
// switching to a come-back-later state past SPINNER_TIMEOUT_MS, and flipping a stranded
// generating row to 'failed' once its age exceeds GENERATION_BUDGET_MS + FLIP_GUARD_MS.
export function useGenerationStatus(artifactId: string | null): GenerationPhase {
  const [genPhase, setGenPhase] = useState<GenerationPhase>({ phase: 'idle' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!artifactId) {
      setGenPhase({ phase: 'idle' });
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { data } = await supabase
        .from('artifacts')
        .select('id, status, content, created_at')
        .eq('id', artifactId)
        .single();

      if (cancelled || !data) return;

      if (data.status === 'ready') {
        stopPolling();
        setGenPhase({ phase: 'ready', content: data.content, createdAt: data.created_at as string });
        return;
      }

      if (data.status === 'failed') {
        stopPolling();
        setGenPhase({ phase: 'failed' });
        return;
      }

      const age = Date.now() - new Date(data.created_at as string).getTime();

      if (age > GENERATION_BUDGET_MS + FLIP_GUARD_MS) {
        stopPolling();
        // Idempotent: the and-status guard prevents clobbering a row that just turned ready.
        await supabase
          .from('artifacts')
          .update({ status: 'failed' })
          .eq('id', data.id)
          .eq('status', 'generating');
        if (!cancelled) setGenPhase({ phase: 'failed' });
        return;
      }

      setGenPhase(
        age > SPINNER_TIMEOUT_MS
          ? { phase: 'come-back-later' }
          : age > SPINNER_LATE_COPY_MS
            ? { phase: 'spinner', variant: 'late' }
            : { phase: 'spinner', variant: 'early' },
      );

      if (pollRef.current === null) {
        pollRef.current = setInterval(check, 3000);
      }
    }

    check();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [artifactId, stopPolling]);

  return genPhase;
}
