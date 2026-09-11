'use client';

import { useState } from 'react';

// #134 Slice 3 UI — project naming as its own hook, deliberately kept
// separate from lib/use-path-report.ts even though it only ever matters
// once that hook's content is 'ready'. path_report's own bootstrap/poll has
// no client-driven mutation of its own content (no refine/select, unlike
// path_options_session) — naming is the one thing that touches it after the
// fact, and it's a genuinely distinct concern (a two-step LLM-backed
// sub-flow: generate 3 suggestions, then persist a pick or an explicit
// skip), with its own loading/submitting/error state that has nothing to
// do with getting the report to 'ready' in the first place. Same
// "sequential step, separate file" convention usePathOptions/
// usePathDirection already use for Checkpoint 1 vs Checkpoint 2, despite
// living on the same page and depending on each other's completion.
//
// Neither /api/generate-project-name nor /api/name-path-result take a
// path_report id in the body — both resolve the user's current ready
// path_report server-side (see those routes' own header comments), so this
// hook doesn't need to know the report's artifact id either.
//
// save()'s return value (the persisted project_name, or undefined on
// failure) is the seam back to lib/use-path-report.ts: this hook has no way
// to reach into that hook's state, so the consuming component is
// responsible for calling pathReport.setProjectName(result) once save()
// resolves successfully.

export interface ProjectNameOption {
  name: string;
  rationale: string;
}

export interface ProjectNamingState {
  open: boolean;
  loading: boolean;
  options: ProjectNameOption[];
  saving: boolean;
  error: string | null;
  openAndGenerate: () => Promise<void>;
  save: (name: string | null) => Promise<string | null | undefined>;
  close: () => void;
}

export function useProjectNaming(): ProjectNamingState {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ProjectNameOption[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function openAndGenerate() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setOptions([]);

    const res = await fetch('/api/generate-project-name', { method: 'POST' });

    setLoading(false);

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { error?: string } | null;
      setError(errBody?.error ?? 'We couldn’t generate name suggestions. Please try again.');
      return;
    }

    const data = await res.json() as { options: ProjectNameOption[] };
    setOptions(data.options);
  }

  async function save(name: string | null): Promise<string | null | undefined> {
    if (saving) return undefined;
    setSaving(true);
    setError(null);

    const res = await fetch('/api/name-path-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: name }),
    });

    setSaving(false);

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { error?: string } | null;
      setError(errBody?.error ?? 'We couldn’t save that. Please try again.');
      return undefined;
    }

    const data = await res.json() as { ok: true; project_name: string | null };
    setOpen(false);
    return data.project_name;
  }

  return {
    open,
    loading,
    options,
    saving,
    error,
    openAndGenerate,
    save,
    close: () => setOpen(false),
  };
}
