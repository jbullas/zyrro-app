'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function PathsPage() {
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
        <p className="eyebrow">YOUR PATHS</p>
        <h2>Your path options are generated from your Identity Report.</h2>
        <p>Unlock your Identity Report first to see your paths.</p>
        <div className="gated-actions">
          <Link href="/login" className="btn-secondary btn-secondary-fill">Log in</Link>
          <Link href="/start" className="btn-secondary btn-secondary-fill">Start the questionnaire</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-container page-inner">
      <p className="eyebrow">YOUR PATHS</p>
      <h2>Your Paths</h2>
      <p>Your paths are coming soon.</p>
    </div>
  );
}
