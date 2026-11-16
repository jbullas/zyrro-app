'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuthUser } from '@/lib/use-auth-user';
import GatedState from '@/components/GatedState';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import ConversationPlan from '@/components/ConversationPlan';
import type { PlanView } from '@/lib/path-plan-generation';

type PageState = 'loading' | 'anonymous' | 'unpaid' | 'no-selection' | 'new-flow';

export default function PlanPage() {
  const [pageState, setPageState]     = useState<PageState>('loading');
  const [conversationPlan, setConversationPlan] = useState<PlanView | null>(null);

  const { user: authUser, loading: authLoading } = useAuthUser();

  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    let cancelled = false;

    async function init() {
      const user = authUser;

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('product', 'onetime_payment')
        .eq('status', 'active')
        .maybeSingle();

      if (!entitlement) {
        if (!cancelled) setPageState('unpaid');
        return;
      }

      // #169: the Plan for the path chosen in the Path conversation. The
      // server route owns that state.
      const planRes = await fetch('/api/path-plan');
      if (planRes.ok) {
        const view = await planRes.json() as PlanView;
        if (view.status !== 'no_choice') {
          if (!cancelled) { setConversationPlan(view); setPageState('new-flow'); }
          return;
        }
      }
      if (!cancelled) setPageState('no-selection');
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser]);

  // ── Loading ───────────────────────────────────────────────────────
  if (pageState === 'loading') return null;

  // ── Anonymous ─────────────────────────────────────────────────────
  if (pageState === 'anonymous') {
    return (
      <GatedState
        eyebrow="YOUR PLAN"
        heading="Your action plan is built around your chosen path."
        body="Choose a path to unlock your plan."
      />
    );
  }

  // ── Unpaid ────────────────────────────────────────────────────────
  if (pageState === 'unpaid') {
    return (
      <MessageState
        eyebrow="YOUR PLAN"
        heading="Your Plan is waiting on the other side of Path."
        body="Choose one of your four path options on the Path page and your tailored Plan will be generated automatically."
        cta={<PrimaryButton href="/path">See Your Path Options</PrimaryButton>}
      />
    );
  }

  // ── The Path conversation's Plan (#169) ───────────────────────────
  if (pageState === 'new-flow' && conversationPlan) {
    return <ConversationPlan initial={conversationPlan} />;
  }

  // ── No Plan yet: the empty state (brief 169-plan-page, decision 2)
  return <ConversationPlan initial={{ status: 'no_choice', path: null, plan: null, generated_at: null }} />;
}
