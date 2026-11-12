'use client';

import { useEffect, useRef, useState } from 'react';
import MessageState from '@/components/MessageState';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import ChatThread from '@/components/ChatThread';
import ChatChoices from '@/components/ChatChoices';
import PathSummaryCard from '@/components/PathSummaryCard';
import PathOptionsRound from '@/components/PathOptionsRound';
import PathNaming from '@/components/PathNaming';
import PathStart from '@/components/PathStart';
import PathChosen, { type ChosenPath } from '@/components/PathChosen';
import SecondaryButton from '@/components/SecondaryButton';
import {
  choiceAnswerRows,
  choiceContent,
  MESSAGE_MAX_CHARS,
  noteFromContent,
  optionsRetryLimitText,
  PATH_REFUSAL_FALLBACK,
  PATH_REFUSAL_TEXT,
  SUMMARY_TAP_ID,
  SUMMARY_TAP_LABEL,
  SUMMARY_TAP_TURN,
  type ChatChoiceSet,
  type ChoicePurpose,
} from '@/lib/chat-choices';

// #168: the Path conversation, the paid home of /path (Miroslav, 2026-11-09).
// /path renders this once its own gates have passed (signed in, report
// ready, paid), so it has no unpaid or no-report screens of its own:
// - no conversation yet: the intro (PathStart), then the conversation in place
// - in progress: the conversation, resumed where it was
// - chosen and named: "Your path" (PathChosen), with the conversation readable from there
// The server owns the conversation: this only reads it back and sends typed
// answers, or tapped choices with an optional note (brief 168-shorter-flow, "UI").

type PathMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  choices: ChatChoiceSet | null;
  selected_choice_ids: string[] | null;
};

type PathPhase = 'seeding' | 'conversation' | 'summary' | 'options' | 'chosen';

// The options generation's state (brief 168-options): generating, failed or ready.
type OptionsState = { status: 'generating' | 'failed' | 'ready' | null; round: number | null };

// The one redo (brief 168-guardrails-redo): used once started; in progress
// until a path is chosen in it.
type RedoState = { used: boolean; in_progress: boolean };

type ConversationResponse = {
  conversation: { id: string; phase: PathPhase; summary_confirmed: boolean; turns?: number; options?: OptionsState; chosen?: ChosenPath | null; redo?: RedoState };
  messages: PathMessage[];
};

/** The code-owned line for a refused send (brief 168-guardrails-redo). */
async function refusalText(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: string; retry_in_minutes?: number };
  if (body.error === 'retry_limited' && typeof body.retry_in_minutes === 'number') return optionsRetryLimitText(body.retry_in_minutes);
  return (body.error && PATH_REFUSAL_TEXT[body.error]) || PATH_REFUSAL_FALLBACK;
}

type TurnResponse = { messages: PathMessage[]; phase: PathPhase; summary_confirmed: boolean; turns?: number; options?: OptionsState };

// Choices still answerable once the summary is confirmed.
const AFTER_SUMMARY: ChoicePurpose[] = ['options', 'options_feedback', 'naming'];

const OPTIONS_POLL_MS = 3000;
const OPTIONS_STATUS = 'Putting your three path options together. This takes about half a minute…';
const NEW_OPTIONS_STATUS = 'Putting three new options together. This takes about half a minute…';
const SUMMARY_TAP_STATUS = 'Putting your summary together…';

type PageState = 'loading' | 'not-started' | 'chat' | 'error';

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

export default function PathConversation() {
  const [pageState, setPageState] = useState<PageState>('loading');
  // Once the path is chosen and named: "Your path", or the conversation read back.
  const [chosen, setChosen] = useState<ChosenPath | null>(null);
  const [view, setView] = useState<'path' | 'conversation'>('path');
  const [conversationId, setConversationId] = useState('');
  const [phase, setPhase] = useState<PathPhase>('seeding');
  const [confirmed, setConfirmed] = useState(false);
  const [messages, setMessages] = useState<PathMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [sendError, setSendError] = useState('');
  const [options, setOptions] = useState<OptionsState>({ status: null, round: null });
  const [retrying, setRetrying] = useState(false);
  const [redo, setRedo] = useState<RedoState>({ used: false, in_progress: false });
  // User turns so far: "See your summary" shows from SUMMARY_TAP_TURN.
  const [turns, setTurns] = useState(0);
  const [redoStarting, setRedoStarting] = useState(false);
  const [redoError, setRedoError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function showConversation(data: ConversationResponse) {
    setRedo(data.conversation.redo ?? { used: false, in_progress: false });
    setTurns(data.conversation.turns ?? 0);
    setConversationId(data.conversation.id);
    setPhase(data.conversation.phase);
    setConfirmed(data.conversation.summary_confirmed);
    setOptions(data.conversation.options ?? { status: null, round: null });
    setChosen(data.conversation.chosen ?? null);
    setMessages(data.messages);
    setPageState('chat');
  }

  // While options are being put together (after "That's right" or "what
  // feels off"), the thread shows a status line and reads the conversation
  // back until the new round arrives. A reload lands here too and simply
  // keeps waiting: the server never starts a second generation.
  const generating = phase === 'options' && options.status === 'generating';
  useEffect(() => {
    if (!generating) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/path-conversation');
        if (!res.ok || cancelled) return;
        const data = await res.json() as ConversationResponse;
        if (cancelled || data.conversation.options?.status === 'generating') return;
        showConversation(data);
      } catch {
        // Try again on the next tick.
      }
    }, OPTIONS_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [generating]);

  async function handleRetryOptions() {
    setRetrying(true);
    setSendError('');
    try {
      const res = await fetch('/api/path-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options_retry', conversation_id: conversationId }),
      });
      if (!res.ok) {
        setSendError(res.status === 429 ? await refusalText(res) : 'Couldn’t start that again. Try again in a moment.');
        return;
      }
      showConversation(await res.json() as ConversationResponse);
    } catch (err) {
      console.error(err);
      setSendError('Couldn’t start that again. Try again in a moment.');
    } finally {
      setRetrying(false);
    }
  }

  // The one redo, from "Your path" (brief 168-guardrails-redo): it opens on
  // the confirmed summary in the conversation.
  async function handleRedo() {
    setRedoStarting(true);
    setRedoError('');
    try {
      const res = await fetch('/api/path-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redo', conversation_id: conversationId }),
      });
      if (!res.ok) {
        setRedoError(await refusalText(res));
        return;
      }
      showConversation(await res.json() as ConversationResponse);
      setView('conversation');
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      setRedoError(PATH_REFUSAL_FALLBACK);
    } finally {
      setRedoStarting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/path-conversation');
      if (cancelled) return;
      if (res.status === 404) return setPageState('not-started');
      if (!res.ok) return setPageState('error');
      showConversation(await res.json() as ConversationResponse);
    })().catch(() => { if (!cancelled) setPageState('error'); });

    return () => { cancelled = true; };
  }, []);

  // Naming just answered: the turn's reply carries no chosen path, so it is
  // read back once to show "Your path" (handleChoice drops the copy loaded
  // before naming, which has no name yet).
  const latestMessage = messages[messages.length - 1];
  const namingDone = phase === 'chosen' && latestMessage?.role === 'assistant' && latestMessage.choices?.purpose !== 'naming';
  useEffect(() => {
    if (!namingDone || chosen) return;
    let cancelled = false;
    fetch('/api/path-conversation')
      .then(res => (res.ok ? res.json() as Promise<ConversationResponse> : null))
      .then(data => {
        if (!data || cancelled) return;
        setChosen(data.conversation.chosen ?? null);
        setRedo(data.conversation.redo ?? { used: false, in_progress: false });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [namingDone, chosen]);

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
      if (!res.ok) {
        // A refusal: its own line (brief 168-guardrails-redo). Nothing was saved.
        setMessages(prev => prev.filter(m => m !== pending));
        setSendError(await refusalText(res));
        return false;
      }
      const data = await res.json() as TurnResponse;
      setMessages(prev => [...prev.filter(m => m !== pending), ...data.messages]);
      setPhase(data.phase);
      setConfirmed(data.summary_confirmed);
      setTurns(data.turns ?? 0);
      if (data.options) setOptions(data.options);
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

  function handleChoice(message: PathMessage, choiceIds: string[], note: string | null, riskText?: string) {
    if (sending || !message.choices) return;
    const purpose = message.choices.purpose;
    if (purpose === 'naming') setChosen(null);
    const statusLine =
      choiceIds.includes(SUMMARY_TAP_ID) ? SUMMARY_TAP_STATUS
      : purpose === 'summary' && choiceIds.includes('verdict:right') ? OPTIONS_STATUS
        : purpose === 'summary' || purpose === 'summary_clarify' ? 'Updating your summary…'
          : purpose === 'risk_time' ? 'Putting your summary together…'
            : purpose === 'options' ? (choiceIds.includes('pick:none') ? 'One moment…' : 'Saving your choice and finding names for this path…')
              : purpose === 'options_feedback' ? NEW_OPTIONS_STATUS
                : purpose === 'naming' ? 'Saving…'
                  : 'Reading your answer…';
    sendTurn(
      { action: 'choice', message_id: message.id, choice_ids: choiceIds, note, ...(riskText !== undefined && { risk_text: riskText }) },
      { id: 'pending', role: 'user', content: choiceContent(message.choices, choiceIds, note), choices: null, selected_choice_ids: choiceIds },
      statusLine,
    );
  }

  // "See your summary" as a link, on a reply without a list of options of its own.
  function handleSummaryTap(message: PathMessage) {
    if (sending) return;
    sendTurn(
      { action: 'choice', message_id: message.id, choice_ids: [SUMMARY_TAP_ID] },
      { id: 'pending', role: 'user', content: SUMMARY_TAP_LABEL, choices: null, selected_choice_ids: [SUMMARY_TAP_ID] },
      SUMMARY_TAP_STATUS,
    );
  }

  if (pageState === 'loading') return null;

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

  // Chosen and named: "Your path" first; the conversation stays readable from
  // there. While the one redo is unfinished, the path chosen before it is
  // still the user's path (brief 168-guardrails-redo).
  const showPath = !!chosen && (namingDone || redo.in_progress);
  if (showPath && view === 'path') {
    return (
      <PathChosen
        chosen={chosen!}
        onViewConversation={() => { setView('conversation'); window.scrollTo(0, 0); }}
        redo={{ ...redo, available: namingDone && !redo.used }}
        onRedo={handleRedo}
        redoStarting={redoStarting}
        redoError={redoError}
      />
    );
  }

  const latest = messages[messages.length - 1];
  // Only the latest assistant message takes an answer. Once the summary is
  // confirmed, only the options, "what feels off" and the names do.
  const answerable = (m: PathMessage) => m === latest && m.role === 'assistant' && !sending
    && (!confirmed || (!!m.choices?.purpose && AFTER_SUMMARY.includes(m.choices.purpose)));
  // One input at a time: the free-text box only on an open question in the conversation phase.
  const showComposer = phase === 'conversation' && !(latest?.role === 'assistant' && latest.choices);
  const optionsFailed = phase === 'options' && options.status === 'failed' && latest?.role === 'user';
  // From SUMMARY_TAP_TURN: a link under the text box, or under grouped choices;
  // a list of options carries it as one more option (server).
  const summaryLink = phase === 'conversation' && turns >= SUMMARY_TAP_TURN && latest?.role === 'assistant'
    && (!latest.choices || latest.choices.mode === 'groups') && !sending;
  const waitingStatus = (options.round ?? 1) > 1 ? NEW_OPTIONS_STATUS : OPTIONS_STATUS;

  return (
    <div className="flow-container mentor-chat-container">
      {sendError && (
        <div className="mentor-end-error-wrap">
          <p className="form-error">{sendError}</p>
        </div>
      )}
      <ChatThread
        messages={messages}
        loading={sending || generating}
        statusText={sending ? status : waitingStatus}
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        placeholder="Type your answer…"
        inputRef={inputRef}
        maxLength={MESSAGE_MAX_CHARS}
        header={
          <>
            {showPath && (
              <div className="mb-8">
                <LinkButton onClick={() => setView('path')}>Back to your path</LinkButton>
              </div>
            )}
            <PathHeader step={currentStep(phase, confirmed, messages)} />
          </>
        }
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
                onSubmit={(ids, note, riskText) => handleChoice(message, ids, note, riskText)}
              />
            </div>
          ) : message.choices?.purpose === 'options' && message.choices.options_round ? (
            // An options round: three cards in the thread (brief 168-options, Part E).
            <PathOptionsRound
              key={message.id}
              round={message.choices.options_round}
              choices={answerable(message) ? message.choices : null}
              disabled={sending}
              onSubmit={(ids, note) => handleChoice(message, ids, note)}
            />
          ) : null
        }
        renderInBubble={message =>
          // The end of Path: a code-owned "See your plan" button under the
          // last message once the path is chosen and named (brief
          // 169-plan-page, decision 2), old end messages included.
          phase === 'chosen' && !message.choices && message.id === latest?.id && message.role === 'assistant' ? (
            <div className="mt-2">
              <PrimaryButton href="/plan">See your plan</PrimaryButton>
            </div>
          )
          : !message.choices || message.choices.card || !answerable(message) ? null
            : message.choices.purpose === 'naming' ? (
              <PathNaming
                key={message.id}
                choices={message.choices}
                disabled={sending}
                onSubmit={(ids, note) => handleChoice(message, ids, note)}
              />
            ) : (
              <ChatChoices
                key={message.id}
                choices={message.choices}
                disabled={sending}
                onSubmit={(ids, note) => handleChoice(message, ids, note)}
              />
            )
        }
      />
      {summaryLink && (
        <div className="flex-shrink-0 pb-16">
          <LinkButton onClick={() => handleSummaryTap(latest)}>{SUMMARY_TAP_LABEL}</LinkButton>
        </div>
      )}
      {optionsFailed && (
        <div className="mentor-composer path-options-retry">
          <p className="flex-1">We couldn’t put your options together this time.</p>
          <SecondaryButton onClick={handleRetryOptions} disabled={retrying}>
            {retrying ? 'Starting…' : 'Try again'}
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
