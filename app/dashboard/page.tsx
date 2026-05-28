'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function DashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data?.user);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) return null;

  if (!isAuthenticated) {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">YOUR DASHBOARD</p>
        <h2>Your identity overview is waiting.</h2>
        <p>Complete the questionnaire to unlock your personal dashboard.</p>
        <div className="gated-actions">
          <Link href="/login" className="btn-secondary btn-secondary-fill">Log in</Link>
          <Link href="/start" className="btn-secondary btn-secondary-fill">Start the questionnaire</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-container page-inner">
      <h2>Dashboard</h2>
      <p>Your dashboard is coming soon.</p>
    </div>
  );
}
