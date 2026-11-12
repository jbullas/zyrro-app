'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PrimaryButton from '@/components/PrimaryButton';
import Link from 'next/link';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import type { PlanView } from '@/lib/path-plan-generation';
import { milestoneRows } from '@/lib/path-conversation-plan';

// #169, brief 169-plan-page: /plan for a user whose path was chosen in the
// Path conversation. The server route (/api/path-plan) owns the state; this
// polls it while the Plan is generating, so a refresh mid-generation picks up
// where it is. Existing classes and states only. Brief 169-plan-layers: three
// layers, this week (with effort, no due date), after that, and the
// milestones under a code-written go line.

const POLL_MS = 3000;

/** Effort in half hours: whole hours as hours, a half hour as minutes ("1 hour 30 minutes"). */
function effortLabel(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  const h = whole ? `${whole} ${whole === 1 ? 'hour' : 'hours'}` : '';
  const m = minutes ? `${minutes} minutes` : '';
  return [h, m].filter(Boolean).join(' ');
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
        cta={<PrimaryButton href="/path">Go to your Path conversation</PrimaryButton>}
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
            {/* Their note at choice exactly as written, to Zyrro: no pronoun swap. */}
            <p className="mentor-md-p">“{path.in_your_words}”</p>
          </div>
        )}

        <div className="section">
          <p className="mentor-md-p">{plan.frame}</p>
        </div>

        <div className="section">
          <p className="eyebrow">THIS WEEK</p>
          <div className="card">
            {plan.actions.map(a => (
              <div key={a.index} className="start-here-action">
                <p className="start-here-action-text">{a.title}</p>
                <p className="cover-context-line">
                  {/* Effort only: no due date, even on stored Plans that have a due_day. */}
                  {effortLabel(a.effort_hours)}
                </p>
                <p className="mentor-md-p">{a.what}</p>
                <p className="start-here-action-why"><strong>Done when:</strong> {a.done_when}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <p className="eyebrow">AFTER THAT</p>
          <div className="card">
            <ol className="mentor-md-ol">
              {plan.after_that.map((s, i) => (
                <li key={i} className="mentor-md-li">{s}</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="section">
          <p className="eyebrow">MILESTONES</p>
          {/* Code-written, not the model's: milestones assume the path is a go. */}
          <p className="cover-context-line">
            These apply once you know it’s a go. If it’s a no-go, your other two options are saved in Path.{' '}
            <Link href="/path" className="inline-link">See your other options</Link>
          </p>
          <div className="card">
            {/* Like the actions: a bold title, the description beneath, a divider
                between items. The last is headed by code (milestoneRows); stored
                plain-string milestones have no title. */}
            <ol className="mentor-md-ol">
              {milestoneRows(plan.milestones).map((m, i) => (
                <li key={i} className="start-here-action">
                  {m.title && <p className="start-here-action-text">{m.title}</p>}
                  <p className="mentor-md-p">{m.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
