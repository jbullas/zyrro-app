'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PrimaryButton from '@/components/PrimaryButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import type { PlanView } from '@/lib/path-plan-generation';

// #169, brief 169-plan-page: /plan for a user whose path was chosen in the
// Path conversation. The server route (/api/path-plan) owns the state; this
// polls it while the Plan is generating, so a refresh mid-generation picks up
// where it is. Existing classes and states only.

const POLL_MS = 3000;

function effortLabel(hours: number): string {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** The first action's due day as a date in the browser's time zone, counted from generation. */
function dueDate(generatedAt: string, dueDay: number): string {
  const d = new Date(generatedAt);
  d.setDate(d.getDate() + dueDay);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ConversationPlan({ initial }: { initial: PlanView }) {
  const [view, setView] = useState<PlanView>(initial);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch('/api/path-plan');
    if (res.ok) setView(await res.json() as PlanView);
  }, []);

  useEffect(() => {
    if (view.status !== 'generating') return;
    pollRef.current = setTimeout(poll, POLL_MS);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [view, poll]);

  async function handleRetry() {
    setRetrying(true);
    const res = await fetch('/api/path-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry' }),
    });
    setRetrying(false);
    if (res.ok) setView(await res.json() as PlanView);
    else await poll();
  }

  if (view.status === 'no_choice' || view.status === 'naming') {
    return (
      <MessageState
        eyebrow="YOUR PLAN"
        heading="Your Plan starts with your path."
        body="Finish your Path conversation and choose your path. Your Plan will be built from it."
        cta={<PrimaryButton href="/path/conversation">Go to your Path conversation</PrimaryButton>}
      />
    );
  }

  if (view.status === 'generating') {
    return <GeneratingState heading="Your Plan is being prepared." description="This usually takes about a minute." />;
  }

  if (view.status === 'failed' || !view.plan || !view.path) {
    return (
      <MessageState
        eyebrow="YOUR PLAN"
        heading="Something went wrong."
        body="We couldn’t build your Plan. Please try again."
        cta={
          <PrimaryButton onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </PrimaryButton>
        }
      />
    );
  }

  const { path, plan } = view;
  return (
    <div className="flow-container">
      <div className="scroll">
        <div className="section cover">
          <p className="eyebrow">YOUR PLAN</p>
          <h1 className="section-title">{path.name}</h1>
          {path.what_it_is && <p className="cover-context-line">{path.what_it_is}</p>}
        </div>

        {path.in_your_words && (
          <div className="section">
            <p className="card-sub-label">In your words:</p>
            <p className="mentor-md-p">{path.in_your_words}</p>
          </div>
        )}

        <div className="section">
          <p className="mentor-md-p">{plan.frame}</p>
        </div>

        <div className="section">
          <p className="eyebrow">FIRST STRETCH</p>
          <p className="cover-context-line">{plan.span_line}</p>
          <div className="card">
            {plan.actions.map(a => (
              <div key={a.index} className="start-here-action">
                <p className="start-here-action-text">{a.title}</p>
                <p className="cover-context-line">
                  {a.due_day !== null && view.generated_at ? `Due ${dueDate(view.generated_at, a.due_day)} · ` : ''}
                  {effortLabel(a.effort_hours)}
                </p>
                <p className="mentor-md-p">{a.what}</p>
                <p className="start-here-action-why"><strong>Done when:</strong> {a.done_when}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <p className="eyebrow">MILESTONES</p>
          <div className="card">
            <div className="phase-milestones">
              {plan.milestones.map((m, i) => (
                <div key={i} className="phase-milestone-item">
                  <span className="phase-milestone-dot" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
