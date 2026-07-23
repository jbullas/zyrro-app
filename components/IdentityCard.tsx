'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import LinkButton from '@/components/LinkButton';
import IdentityBadge from '@/components/IdentityBadge';
import DomainRadarChart from '@/components/DomainRadarChart';
import PrimarySignatureBars from '@/components/PrimarySignatureBars';
import type { DomainProfile } from '@/lib/artifact-schemas';
import { getCurrentArtifact } from '@/lib/artifacts';

type CardState = 'loading' | 'no-artifact' | 'pending' | 'ready';

type IdentityCardContent = {
  named_identity: string;
  identity_thesis: string;
  domain_profile: DomainProfile;
  primary_signatures: { name: string; domain: string; score: number }[];
};

export default function IdentityCard() {
  const [state, setState]     = useState<CardState>('loading');
  const [content, setContent] = useState<IdentityCardContent | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setState('no-artifact'); return; }

      const { data, error } = await getCurrentArtifact<{ status: string; content: unknown }>(
        supabase,
        user.id,
        'identity_report',
        { select: 'status, content' },
      );

      if (cancelled) return;

      if (error || !data) { setState('no-artifact'); return; }
      if (data.status !== 'ready') { setState('pending'); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const report = data.content as any;
      setContent({
        named_identity: report.cover.named_identity,
        identity_thesis: report.cover.identity_thesis,
        domain_profile: report.domain_profile,
        primary_signatures: report.primary_constellation,
      });
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

  if (state === 'no-artifact' || state === 'pending') {
    return (
      <div className="card">
        <p className="mentor-list-empty">
          {state === 'pending'
            ? 'Your Identity Signature Report is still being generated — check back soon.'
            : 'Complete the questionnaire to generate your Identity Signature Report.'}
        </p>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="card">
      <div className="identity-card-header">
        <IdentityBadge primarySignatureName={content.primary_signatures[0]?.name} />
        <h3 className="named-identity">{content.named_identity}</h3>
      </div>

      <div className="identity-card-body">
        <p className="identity-card-thesis">{content.identity_thesis}</p>

        <LinkButton onClick={() => setExpanded((v) => !v)} inline>
          {expanded ? 'Hide identity profile' : 'Show identity profile'}
        </LinkButton>

        {expanded && (
          <div className="identity-card-expanded">
            <DomainRadarChart domainProfile={content.domain_profile} />
            <PrimarySignatureBars signatures={content.primary_signatures} />
          </div>
        )}

        <LinkButton href="/identity" inline>View full report →</LinkButton>
      </div>
    </div>
  );
}
