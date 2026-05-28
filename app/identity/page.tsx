'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function IdentityPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [canView, setCanView] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const authenticated = !!data?.user;
      const hasFlag = localStorage.getItem('zyrro_questionnaire_complete') === 'true';
      setCanView(authenticated || hasFlag);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) return null;

  if (!canView) {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">IDENTITY REPORT</p>
        <h2>Your Identity Signature Report lives here.</h2>
        <p>Complete the questionnaire to generate your report.</p>
        <div className="gated-actions">
          <Link href="/login" className="btn-secondary btn-secondary-fill">Log in</Link>
          <Link href="/start" className="btn-secondary btn-secondary-fill">Start the questionnaire</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-container page-inner">
      <p className="eyebrow">IDENTITY REPORT</p>
      <h2>Your Identity Report</h2>
      <p>Your report is being prepared. Check back shortly.</p>
    </div>
  );
}
