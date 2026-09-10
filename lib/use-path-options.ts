'use client';

import { useEffect, useState } from 'react';
import { useCheckpointSessionStatus, type CheckpointSessionPhase } from '@/lib/checkpoint-status';
import type { PathOptionsSessionStatus, PathOptionsSessionContent } from '@/lib/path-options-session';

// #134 Slice 2 — client-side state for Checkpoint 2 "Options," mirroring
// lib/use-path-direction.ts's shape (bootstrap-on-mount gated by `active`,
// a single shared submitting/submitError pair for whichever action is in
// flight) but layered on top of useCheckpointSessionStatus
// (lib/checkpoint-status.ts) for the piece Direction never needed: a real
// background LLM call for the initial 4 and each refine round.
//
// useCheckpointSessionStatus turned out to be reusable completely
// unmodified — confirmed, not assumed. It's generic over any artifacts row
// (queries by id alone, doesn't care about `type`; current_stage, which
// path_options_session never sets, is simply unused). The one real
// limitation found: its 'complete' phase variant carries no content
// ({ phase: 'complete' }, lib/checkpoint-status.ts), unlike
// 'awaiting_checkpoint' which does — that would have mattered if this hook
// needed to learn about Checkpoint 2's completion through polling, but it
// doesn't. The awaiting_checkpoint -> complete transition happens
// synchronously via submitSelect's own POST response, which already
// carries the final content directly — so `phase` below is only ever
// consulted for the transition it actually carries content for
// (generating -> awaiting_checkpoint), never for select's completion.

export interface PathOptionsState {
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  status: PathOptionsSessionStatus | null;
  content: PathOptionsSessionContent | null;
  // Exposed as-is (not folded into `status`) so the consuming UI can pick
  // early/late/come-back-later/failed spinner copy while status is
  // 'generating' — same responsibility split the old (pre-#134, removed in
  // Slice 1) Checkpoint 2/3 UI used directly off this same hook.
  phase: CheckpointSessionPhase;
  submitting: boolean;
  submitError: string | null;
  submitRefine: (text: string) => Promise<void>;
  submitSelect: (candidateId: string, comments: string) => Promise<void>;
  retry: () => void;
}

type BootstrapResponse = {
  session_id: string;
  status: PathOptionsSessionStatus;
  content: PathOptionsSessionContent;
};

type ActionResponse = {
  status: PathOptionsSessionStatus;
  content: PathOptionsSessionContent;
};

/** `active` gates the bootstrap fetch — pass true once Checkpoint 1 "Direction" has completed. */
export function usePathOptions(active: boolean): PathOptionsState {
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus]       = useState<PathOptionsSessionStatus | null>(null);
  const [content, setContent]     = useState<PathOptionsSessionContent | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // `refreshKey` resumes polling after a refine round flips an already-
  // settled session back to 'generating' (see submitRefine below).
  // `bootstrapKey` exists only so retry() can force the bootstrap effect to
  // re-run — unlike usePathDirection's retry, which resets error/loading
  // but not `content` (its own effect's dependency), so a failed fetch
  // there wouldn't actually re-invoke the effect on its own. Deliberately
  // not copying that gap into new code.
  const [refreshKey, setRefreshKey]   = useState(0);
  const [bootstrapKey, setBootstrapKey] = useState(0);

  useEffect(() => {
    if (!active || sessionId) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/path-options');
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json() as BootstrapResponse;
        setSessionId(data.session_id);
        setStatus(data.status);
        setContent(data.content);
      } else {
        setError('We couldn’t load your Options step. Please try again.');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionId, bootstrapKey]);

  const phase = useCheckpointSessionStatus(sessionId, refreshKey);

  // The initial batch or a refine round finished generating — sync the
  // freshly appended candidates in. The only place `content`/`status` are
  // ever set from polling; submitSelect sets them directly from its own
  // response instead (see this file's header comment).
  useEffect(() => {
    if (phase.phase !== 'awaiting_checkpoint') return;
    setStatus('awaiting_checkpoint');
    setContent(phase.content as unknown as PathOptionsSessionContent);
  }, [phase]);

  async function submitRefine(text: string) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const res = await fetch('/api/path-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refine', text }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { error?: string } | null;
      setSubmitError(errBody?.error ?? 'Something went wrong. Please try again.');
      return;
    }

    const data = await res.json() as ActionResponse;
    setStatus(data.status);
    setContent(data.content);
    // Refine flips an already-settled 'awaiting_checkpoint' session back to
    // 'generating' server-side — useCheckpointSessionStatus has already
    // stopped polling by this point and won't notice on its own (see its
    // own refreshKey doc comment, lib/checkpoint-status.ts). Bumping it
    // forces an immediate re-check and resumes polling until the new round
    // lands.
    setRefreshKey(k => k + 1);
  }

  async function submitSelect(candidateId: string, comments: string) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const res = await fetch('/api/path-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'select', candidate_id: candidateId, comments }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { error?: string } | null;
      setSubmitError(errBody?.error ?? 'Something went wrong. Please try again.');
      return;
    }

    // Synchronous, no LLM call (recordSelection, lib/path-options-session.ts)
    // — the response already carries the final status/content directly, so
    // there's nothing to poll for and no refreshKey bump needed.
    const data = await res.json() as ActionResponse;
    setStatus(data.status);
    setContent(data.content);
  }

  return {
    loading,
    error,
    sessionId,
    status,
    content,
    phase,
    submitting,
    submitError,
    submitRefine,
    submitSelect,
    retry: () => { setError(null); setLoading(true); setBootstrapKey(k => k + 1); },
  };
}
