'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';
import IdentityCard from '@/components/IdentityCard';

type MetaBundle = {
  content: string;
  created_at: string;
};

export default function DashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [metaBundle, setMetaBundle] = useState<MetaBundle | null>(null);
  const [metaBundleLoading, setMetaBundleLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data?.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;

    fetch('/api/meta-bundle')
      .then((res) => (res.ok ? res.json() : { bundle: null }))
      .then((data: { bundle: MetaBundle | null }) => setMetaBundle(data.bundle))
      .catch(() => setMetaBundle(null))
      .finally(() => setMetaBundleLoading(false));
  }, [authChecked, isAuthenticated]);

  if (!authChecked) return null;

  if (!isAuthenticated) {
    return (
      <GatedState
        eyebrow="YOUR DASHBOARD"
        heading="Your identity overview is waiting."
        body="Complete the questionnaire to unlock your personal dashboard."
      />
    );
  }

  return (
    <div className="flow-container page-inner">
      <h2>Dashboard</h2>

      {/* Card order: Identity -> Momentum -> Project (2026-07-21 dashboard-brainstorm decision) */}
      <IdentityCard />
      {/* Momentum card renders here next (consistency dial, mentor-conversations count, tasks-completed count) */}
      {/* Project card renders here next (project name header, Completed/Open lists) */}

      {metaBundleLoading ? (
        <p className="mentor-list-empty">Loading…</p>
      ) : metaBundle ? (
        <div className="card">
          <p className="mentor-md-p mentor-md-p--prewrap">{metaBundle.content}</p>
          <p className="mentor-list-empty">
            Last updated on {new Date(metaBundle.created_at).toLocaleDateString()}
          </p>
        </div>
      ) : (
        <p className="mentor-list-empty">
          Your continuity summary will appear here once you&apos;ve had a conversation with your mentor.
        </p>
      )}
    </div>
  );
}
