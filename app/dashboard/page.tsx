'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';

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
      <p>Your dashboard is coming soon.</p>
    </div>
  );
}
