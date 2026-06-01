'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';

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
      <GatedState
        eyebrow="YOUR PATHS"
        heading="Your path options are generated from your Identity Report."
        body="Unlock your Identity Report first to see your paths."
      />
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
