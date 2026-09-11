'use client';

import { useEffect, useState } from 'react';
import { useGenerationStatus, type GenerationPhase } from '@/lib/generation-status';
import type { PathReportContent } from '@/lib/generate-path-report';

// #134 Slice 3 UI — client-side state for the final "Your Path" report.
// path_report is a Tier C artifact ('generating' | 'ready' | 'failed'), the
// same family as identity_report — NOT a checkpoint session like
// path_direction_session/path_options_session, so this mirrors
// app/identity/page.tsx's own bootstrap-then-poll shape (find the artifact,
// hand its id to useGenerationStatus) rather than usePathOptions/
// useCheckpointSessionStatus. GET /api/path-report is the only way to
// create/resume the row (and now returns `id` directly, added this slice
// specifically so this hook doesn't need a second getCurrentArtifact
// round-trip the way identity's page does), so the bootstrap fetch still
// goes through the route rather than a plain client-side select.
//
// No refine/select actions here, unlike usePathOptions — path_report has no
// user-facing accept/adjust step of its own (brief §5; see this session's
// own scoping pass). The one thing that can still mutate this hook's
// content after 'ready' is naming (project_name), and that's deliberately
// NOT handled by folding naming's generate/save actions into this hook —
// see lib/use-project-naming.ts's own header for why that's kept separate.
// setProjectName exists purely as the seam between the two: the naming
// hook's save() has no way to reach into useGenerationStatus's internal
// state, so the consuming component calls this after a successful save to
// patch content locally, the same way usePathOptions's submitSelect sets
// state directly from a synchronous response instead of waiting on a poll.

export interface PathReportState {
  loading: boolean;
  error: string | null;
  phase: GenerationPhase;
  content: PathReportContent | null;
  setProjectName: (name: string | null) => void;
  retry: () => void;
}

type BootstrapResponse = {
  id: string;
  status: 'generating' | 'ready' | 'failed';
  content: unknown;
};

/** `active` gates the bootstrap fetch — pass true once Checkpoint 2 "Options" has completed. */
export function usePathReport(active: boolean): PathReportState {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [override, setOverride]     = useState<PathReportContent | null>(null);
  const [bootstrapKey, setBootstrapKey] = useState(0);

  useEffect(() => {
    if (!active || artifactId) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/path-report');
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json() as BootstrapResponse;
        setArtifactId(data.id);
      } else {
        setError('We couldn’t load your Path report. Please try again.');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, artifactId, bootstrapKey]);

  const phase = useGenerationStatus(artifactId);

  // A fresh poll result always wins over any prior local naming override —
  // 'ready' only ever lands once per artifact (useGenerationStatus stops
  // polling once it does), so this only actually fires the instant content
  // first arrives, before any naming action could have run.
  useEffect(() => {
    if (phase.phase === 'ready') {
      setOverride(phase.content as PathReportContent);
    }
  }, [phase]);

  return {
    loading,
    error,
    phase,
    content: override,
    setProjectName: (name: string | null) => {
      setOverride(prev => prev ? { ...prev, project_name: name } : prev);
    },
    retry: () => { setError(null); setLoading(true); setArtifactId(null); setBootstrapKey(k => k + 1); },
  };
}
