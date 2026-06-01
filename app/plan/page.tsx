'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import GatedState from '@/components/GatedState';

type PageState = 'loading' | 'anonymous' | 'unpaid' | 'paid';

export default function PlanPage() {
  const [pageState, setPageState] = useState<PageState>('loading');

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setPageState('anonymous');
        return;
      }

      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('product', 'onetime_payment')
        .eq('status', 'active')
        .maybeSingle();

      setPageState(entitlement ? 'paid' : 'unpaid');
    }

    init();
  }, []);

  if (pageState === 'loading') return null;

  if (pageState === 'anonymous') {
    return (
      <GatedState
        eyebrow="YOUR PLAN"
        heading="Your action plan is built around your chosen path."
        body="Choose a path to unlock your plan."
      />
    );
  }

  if (pageState === 'unpaid') {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">YOUR PLAN</p>
        <h2>Your Plan is waiting on the other side of Path.</h2>
        <p>
          Choose one of your four path options on the Path page and your
          tailored Plan will be generated automatically.
        </p>
        <Link href="/path" className="btn-primary">See Your Path Options</Link>
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
