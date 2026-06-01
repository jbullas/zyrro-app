'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import GatedState from '@/components/GatedState';

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
      <GatedState
        eyebrow="YOUR PLAN"
        heading="Your action plan is built around your chosen path."
        body="Choose a path to unlock your plan."
      />
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
