'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function IdentityPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [canView, setCanView] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user ?? null;
      const hasFlag = localStorage.getItem('zyrro_questionnaire_complete') === 'true';
      setCanView(!!user || hasFlag);
      setAuthChecked(true);

      if (user) {
        const stored = localStorage.getItem('zyrro_discovery_answers');
        if (stored) {
          try {
            const answers = JSON.parse(stored) as Array<{
              question_number: number;
              question_text: string;
              answer_text: string;
            }>;
            if (Array.isArray(answers) && answers.length > 0) {
              const { error } = await supabase.from('discovery_answers').insert(
                answers.map(a => ({
                  user_id: user.id,
                  question_number: a.question_number,
                  question_text: a.question_text,
                  answer_text: a.answer_text,
                }))
              );
              if (!error) {
                localStorage.removeItem('zyrro_discovery_answers');
                const name = localStorage.getItem('zyrro_user_name');
                if (name) {
                  await supabase.auth.updateUser({ data: { display_name: name } });
                }
              } else {
                console.error('Failed to migrate discovery answers:', error.message);
              }
            }
          } catch (err) {
            console.error('Failed to migrate discovery answers:', err);
          }
        }
      }
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
