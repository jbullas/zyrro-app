'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthUser } from '@/lib/use-auth-user';
import GatedState from '@/components/GatedState';
import MessageState from '@/components/MessageState';
import PrimaryButton from '@/components/PrimaryButton';
import ChatThread from '@/components/ChatThread';
import ChatChoices from '@/components/ChatChoices';
import PathSummaryCard from '@/components/PathSummaryCard';
import PathStart from '@/components/PathStart';
import { choiceAnswerRows, choiceContent, noteFromContent, type ChatChoiceSet } from '@/lib/chat-choices';

// #168: the new Path conversation, built alongside the current /path flow
// (which stays untouched until the switchover). Temporary route, reachable
// by URL only. The server owns the conversation: this page only reads it
// back and sends typed answers, or tapped choices with an optional note
// (brief docs/briefs/168-shorter-flow.md, "UI").

type PathMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  choices: ChatChoiceSet | null;
  selected_choice_ids: string[] | null;
};

type PathPhase = 'seeding' | 'conversation' | 'summary' | 'options' | 'chosen';

type ConversationResponse = {
  conversation: { id: string; phase: PathPhase; summary_confirmed: boolean };
  messages: PathMessage[];
};

type TurnResponse = { messages: PathMessage[]; phase: PathPhase; summary_confirmed: boolean };

type PageState = 'loading' | 'unpaid' | 'not-started' | 'no-report' | 'chat' | 'error';

const STEPS = ['About you', 'A few questions', 'Your summary', 'Your options'] as const;

function currentStep(phase: PathPhase, confirmed: boolean, messages: PathMessage[]): number {
  if (confirmed || phase === 'options' || phase === 'chosen') return 3;
  if (phase === 'summary') return 2;
  return messages.some(m => m.role === 'user') ? 1 : 0;
}

/**
 * A tapped answer in the user's bubble (brief 168-direction-and-card, Part B
 * item 5): each question muted with the answer under it in normal text, then
 * the note. Rebuilt from the tapped ids and the choices on the message they
 * answered, so the saved thread reads the same on reload. Null for a typed
 * message, so ChatThread shows it as it is (a plain function, not a
 * component: a component element is never null, and would blank the bubble).
 */
function tappedAnswer(messages: PathMessage[], index: number) {
  const message = messages[index];
  if (!message.selected_choice_ids) return null;
  const answered = messages.slice(0, index).reverse().find(m => m.role === 'assistant');
  const choices = answered?.choices;
  if (!choices) return null;
  const rows = choiceAnswerRows(choices, message.selected_choice_ids);
  const note = noteFromContent(choices, message.selected_choice_ids, message.content);
  if (!rows.length && !note) return null;
  return (
    <span className="flex flex-col gap-8">
      {rows.map(row => (
        <span key={`${row.question ?? ''}:${row.answer}`} className="flex flex-col">
          {row.question && <span className="path-tap-question">{row.question}</span>}
          <span>{row.answer}</span>
        </span>
      ))}
      {note && <span className="whitespace-pre-wrap">{note}</span>}
    </span>
  );
}

function PathHeader({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-12 mb-8">
      <p className="eyebrow">Your Path</p>
      <h1>Where you go from here</h1>
      <p>
        A short conversation that builds on your Identity Report and ends with three path options.
        It takes about ten minutes, and you can stop and pick it up again any time.
      </p>
      <ol className="path-steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`path-step${i === step ? ' path-step--current' : i < step ? ' path-step--done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="path-step-dot" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function PathConversationPage() {
  const { user, loading: authLoading } = useAuthUser();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [conversationId, setConversationId] = useState('');
  const [phase, setPhase] = useState<PathPhase>('seeding');
  const [confirmed, setConfirmed] = useState(false);
  const [messages, setMessages] = useState<PathMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [sendError, setSendError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function showConversation(data: ConversationResponse) {
    setConversationId(data.conversation.id);
    setPhase(data.conversation.phase);
    setConfirmed(data.conversation.summary_confirmed);
    setMessages(data.messages);
    setPageState('chat');
  }

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/path-conversation');
      if (cancelled) return;
      if (res.status === 403) return setPageState('unpaid');
      if (res.status === 404) return setPageState('not-started');
      if (!res.ok) return setPageState('error');
      showConversation(await res.json() as ConversationResponse);
    })().catch(() => { if (!cancelled) setPageState('error'); });

    return () => { cancelled = true; };
  }, [authLoading, user]);

  async function handleStart() {
    setPageState('chat');
    setSending(true);
    setStatus('Reading your report and answers…');
    setSendError('');
    try {
      const res = await fetch('/api/path-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (res.status === 409) {
        const data = await res.json() as { error?: string };
        if (data.error === 'no_identity_report') return setPageState('no-report');
      }
      if (!res.ok) throw new Error(`start failed: ${res.status}`);
      showConversation(await res.json() as ConversationResponse);
    } catch (err) {
      console.error(err);
      setPageState('not-started');
      setSendError('Couldn’t start the conversation. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function sendTurn(body: Record<string, unknown>, pending: PathMessage, statusLine: string) {
    setSending(true);
    setStatus(statusLine);
    setSendError('');
    setMessages(prev => [...prev, pending]);
    try {
      const res = await fetch('/api/path-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, conversation_id: conversationId }),
      });
      if (!res.ok) throw new Error(`turn failed: ${res.status}`);
      const data = await res.json() as TurnResponse;
      setMessages(prev => [...prev.filter(m => m !== pending), ...data.messages]);
      setPhase(data.phase);
      setConfirmed(data.summary_confirmed);
      return true;
    } catch (err) {
      console.error(err);
      // Nothing was saved server-side; take the pending message back out.
      setMessages(prev => prev.filter(m => m !== pending));
      setSendError('Couldn’t send that. Try again.');
      return false;
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const ok = await sendTurn(
      { action: 'message', text },
      { id: 'pending', role: 'user', content: text, choices: null, selected_choice_ids: null },
      'Reading your answer…',
    );
    if (!ok) setInput(text);
  }

  function handleChoice(message: PathMessage, choiceIds: string[], note: string | null) {
    if (sending || !message.choices) return;
    const purpose = message.choices.purpose;
    const statusLine = purpose === 'summary' || purpose === 'summary_clarify'
      ? 'Updating your summary…'
      : purpose === 'risk_time' ? 'Putting your summary together…' : 'Reading your answer…';
    sendTurn(
      { action: 'choice', message_id: message.id, choice_ids: choiceIds, note },
      { id: 'pending', role: 'user', content: choiceContent(message.choices, choiceIds, note), choices: null, selected_choice_ids: choiceIds },
      statusLine,
    );
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <GatedState
        eyebrow="YOUR PATH"
        heading="Your path starts with who you are."
        body="Sign in to continue to your Path conversation."
      />
    );
  }

  if (pageState === 'loading') return null;

  if (pageState === 'unpaid') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="The Path conversation comes with Path and Plan."
        body="Unlock Path and Plan to work out your direction with Zyrro."
        cta={<PrimaryButton href="/path">See Path and Plan</PrimaryButton>}
      />
    );
  }

  if (pageState === 'no-report') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Your Identity Report comes first."
        body="The Path conversation starts from your Identity Report. Finish it first, then come back."
        cta={<PrimaryButton href="/identity">Go to your report</PrimaryButton>}
      />
    );
  }

  if (pageState === 'error') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Something went wrong."
        body="We couldn’t load your Path conversation. Refresh the page to try again."
      />
    );
  }

  if (pageState === 'not-started') {
    return <PathStart onStart={handleStart} starting={sending} error={sendError} />;
  }

  const latest = messages[messages.length - 1];
  // Only the latest assistant message takes an answer, and nothing once the summary is confirmed.
  const answerable = (m: PathMessage) => m === latest && m.role === 'assistant' && !sending && !confirmed;
  // One input at a time: the free-text box only on an open question in the conversation phase.
  const showComposer = phase === 'conversation' && !(latest?.role === 'assistant' && latest.choices);

  return (
    <div className="flow-container mentor-chat-container">
      {sendError && (
        <div className="mentor-end-error-wrap">
          <p className="form-error">{sendError}</p>
        </div>
      )}
      <ChatThread
        messages={messages}
        loading={sending}
        statusText={status}
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        placeholder="Type your answer…"
        inputRef={inputRef}
        header={<PathHeader step={currentStep(phase, confirmed, messages)} />}
        preserveUserLineBreaks
        renderUser={(_, i) => tappedAnswer(messages, i)}
        hideComposer={!showComposer}
        renderAssistant={message =>
          message.choices?.card ? (
            // Every card after the first opens with its code-owned context line,
            // as an ordinary assistant bubble above the card in the same message
            // (brief 168-card-fixes, fix 1).
            <div className="flex flex-col gap-8 w-full">
              {message.choices.card.intro && (
                <div className="mentor-bubble mentor-bubble--assistant self-start">
                  <p className="mentor-md-p">{message.choices.card.intro}</p>
                </div>
              )}
              <PathSummaryCard
                card={message.choices.card}
                choices={answerable(message) ? message.choices : null}
                disabled={sending}
                onSubmit={(ids, note) => handleChoice(message, ids, note)}
              />
            </div>
          ) : null
        }
        renderInBubble={message =>
          message.choices && !message.choices.card && answerable(message) ? (
            <ChatChoices
              key={message.id}
              choices={message.choices}
              disabled={sending}
              onSubmit={(ids, note) => handleChoice(message, ids, note)}
            />
          ) : null
        }
      />
    </div>
  );
}
