'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function PlanPage() {
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
        <p className="eyebrow">YOUR PLAN</p>
        <h2>Your action plan is built around your chosen path.</h2>
        <p>Choose a path to unlock your plan.</p>
        <div className="gated-actions">
          <Link href="/login" className="btn-secondary btn-secondary-fill">Log in</Link>
          <Link href="/start" className="btn-secondary btn-secondary-fill">Start the questionnaire</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-container page-inner">
      <p className="eyebrow">YOUR PLAN</p>
      <h2>Your Plan</h2>
      <p>Your plan is coming soon.</p>
    </div>
  );
}
