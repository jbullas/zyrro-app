'use client';

import { useEffect, useState } from 'react';
import { resolveDirectionStep, type PathDirectionSessionContent, type DirectionStep } from '@/lib/path-direction';

// #134 Slice 1 — client-side state machine for Checkpoint 1 "Direction",
// kept in its own hook (rather than inline in app/path/page.tsx) for the
// same reason useCheckpointSessionStatus (lib/checkpoint-status.ts) is its
// own hook: PathPage's render body is large enough that TypeScript's
// control-flow analysis for the older discriminated-union state
// (checkpointPhase, finalResult) silently stopped narrowing correctly once
// this flow's state/effects were added inline — confirmed by moving this
// logic out, which fixed it. Not just a style preference.

export interface PathDirectionState {
  loading: boolean;
  error: string | null;
  content: PathDirectionSessionContent | null;
  step: DirectionStep | null;
  energisers: string[];
  frictionPoints: string[];
  preparedFor: string;
  submitting: boolean;
  submitError: string | null;
  submitMustHaves: (selected: string[]) => Promise<void>;
  submitMustAvoids: (selected: string[]) => Promise<void>;
  submitIdealLife: (text: string) => Promise<void>;
  retry: () => void;
}

type BootstrapResponse = {
  content: PathDirectionSessionContent;
  energisers: string[];
  friction_points: string[];
  prepared_for: string;
};

/** `active` gates the bootstrap fetch — pass true once entry gating (auth/paid/identity_report) has cleared. */
export function usePathDirection(active: boolean): PathDirectionState {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [content, setContent]   = useState<PathDirectionSessionContent | null>(null);
  const [energisers, setEnergisers]         = useState<string[]>([]);
  const [frictionPoints, setFrictionPoints] = useState<string[]>([]);
  const [preparedFor, setPreparedFor]       = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState<string | null>(null);

  useEffect(() => {
    if (!active || content) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/path-direction');
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json() as BootstrapResponse;
        setContent(data.content);
        setEnergisers(data.energisers);
        setFrictionPoints(data.friction_points);
        setPreparedFor(data.prepared_for);
      } else {
        setError('We couldn’t load your Direction step. Please try again.');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [active, content]);

  async function submitStep(step: 'must_haves' | 'must_avoids' | 'ideal_life', body: object) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const res = await fetch('/api/path-direction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, ...body }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { error?: string } | null;
      setSubmitError(errBody?.error ?? 'Something went wrong. Please try again.');
      return;
    }

    const data = await res.json() as { content: PathDirectionSessionContent };
    setContent(data.content);
  }

  return {
    loading,
    error,
    content,
    step: content ? resolveDirectionStep(content) : null,
    energisers,
    frictionPoints,
    preparedFor,
    submitting,
    submitError,
    submitMustHaves: (selected: string[]) => submitStep('must_haves', { selected }),
    submitMustAvoids: (selected: string[]) => submitStep('must_avoids', { selected }),
    submitIdealLife: (text: string) => submitStep('ideal_life', { text }),
    retry: () => { setError(null); setLoading(true); },
  };
}
