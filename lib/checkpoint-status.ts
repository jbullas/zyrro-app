'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  GENERATION_BUDGET_MS,
  SPINNER_TIMEOUT_MS,
  SPINNER_LATE_COPY_MS,
  FLIP_GUARD_MS,
} from '@/lib/generation-status';

// #129 Stage D — same polling shape as lib/generation-status.ts's
// useGenerationStatus (same timing constants, same spinner/come-back-later/
// stranded-row-flip behavior), adapted for path_checkpoint_session's own
// status vocabulary ('generating' | 'awaiting_checkpoint' | 'complete')
// instead of the Tier C 'generating' | 'ready' | 'failed' every other
// artifact type uses. Not a fork of that hook's logic by accident — the two
// genuinely can't share an implementation since "arrived" means a different
// status value here, but the UX rhythm (early spinner copy, late spinner
// copy, come-back-later, flip a stranded row after budget) is worth keeping
// identical rather than reinventing.

export type CheckpointSessionPhase =
  | { phase: 'idle' }
  | { phase: 'spinner'; variant: 'early' | 'late' }
  | { phase: 'come-back-later' }
  | { phase: 'awaiting_checkpoint'; currentStage: number; content: Record<string, unknown> }
  | { phase: 'complete' }
  | { phase: 'failed' };

/**
 * `refreshKey`: bump this (e.g. a counter incremented on every checkpoint
 * response submission) to force an immediate re-check and resume polling.
 * Necessary, not optional — once this hook lands on 'awaiting_checkpoint'
 * or 'complete' it stops polling (correct, so an idle checkpoint screen
 * doesn't keep hitting the DB) — but a session that's been redone/proceeded
 * flips back to 'generating' server-side, and nothing would notice without
 * this, since sessionId itself doesn't change across a multi-checkpoint
 * flow.
 */
export function useCheckpointSessionStatus(sessionId: string | null, refreshKey: number = 0): CheckpointSessionPhase {
  const [phase, setPhase] = useState<CheckpointSessionPhase>({ phase: 'idle' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setPhase({ phase: 'idle' });
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { data } = await supabase
        .from('artifacts')
        .select('id, status, current_stage, content, created_at, updated_at')
        .eq('id', sessionId)
        .single();

      if (cancelled || !data) return;

      if (data.status === 'awaiting_checkpoint') {
        stopPolling();
        setPhase({
          phase: 'awaiting_checkpoint',
          currentStage: data.current_stage as number,
          content: data.content as Record<string, unknown>,
        });
        return;
      }

      if (data.status === 'complete') {
        stopPolling();
        setPhase({ phase: 'complete' });
        return;
      }

      if (data.status === 'failed') {
        stopPolling();
        setPhase({ phase: 'failed' });
        return;
      }

      // status === 'generating' — age off `updated_at` (the last claim/
      // status-settle), not `created_at`: a session that's been through
      // several stages already has an old created_at, and would otherwise
      // look "stranded" the instant it's claimed for the next stage.
      const age = Date.now() - new Date((data.updated_at as string) ?? (data.created_at as string)).getTime();

      if (age > GENERATION_BUDGET_MS + FLIP_GUARD_MS) {
        stopPolling();
        await supabase
          .from('artifacts')
          .update({ status: 'failed' })
          .eq('id', data.id)
          .eq('status', 'generating');
        if (!cancelled) setPhase({ phase: 'failed' });
        return;
      }

      setPhase(
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
  }, [sessionId, refreshKey, stopPolling]);

  return phase;
}
