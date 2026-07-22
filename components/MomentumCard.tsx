'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const TRAILING_WINDOW_DAYS = 30;

type CardState = 'loading' | 'ready';

// Currently a single metric (mentor conversations). The consistency dial and
// tasks-completed count land in this same card later, once plan-tasks has a
// data foundation — .momentum-stats-row holds one-or-more .momentum-stat
// items, so those can be added as siblings without restructuring this card.
export default function MomentumCard() {
  const [state, setState] = useState<CardState>('loading');
  const [conversationCount, setConversationCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setState('ready'); return; }

      const cutoff = new Date(Date.now() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { count } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('last_message_at', cutoff);

      if (cancelled) return;

      setConversationCount(count ?? 0);
      setState('ready');
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (state === 'loading') {
    return (
      <div className="card">
        <p className="mentor-list-empty">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="momentum-stats-row">
        <div className="momentum-stat">
          <span className="momentum-stat-value">{conversationCount}</span>
          <span className="momentum-stat-label">
            Mentor conversation{conversationCount === 1 ? '' : 's'} (last 30 days)
          </span>
        </div>
      </div>
    </div>
  );
}
