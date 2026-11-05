'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthUser } from '@/lib/use-auth-user';
import GatedState from '@/components/GatedState';
import MessageState from '@/components/MessageState';
import PrimaryButton from '@/components/PrimaryButton';
import ChatThread from '@/components/ChatThread';
import ChatChoices from '@/components/ChatChoices';
import { choiceContent, type ChatChoiceSet } from '@/lib/chat-choices';

// #168: the new Path conversation, built alongside the current /path flow
// (which stays untouched until the switchover). Temporary route, reachable
// by URL only. The server owns the conversation: this page only reads it
// back and sends new messages or tapped choices.

type PathMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  choices: ChatChoiceSet | null;
  selected_choice_ids: string[] | null;
};

type ConversationResponse = {
  conversation: { id: string; phase: string };
  messages: PathMessage[];
  profile_complete: boolean;
};

type PageState = 'loading' | 'unpaid' | 'not-started' | 'no-report' | 'chat' | 'error';

export default function PathConversationPage() {
  const { user, loading: authLoading } = useAuthUser();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<PathMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function showConversation(data: ConversationResponse) {
    setConversationId(data.conversation.id);
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

  async function sendTurn(body: Record<string, unknown>, pending: PathMessage) {
    setSending(true);
    setSendError('');
    setMessages(prev => [...prev, pending]);
    try {
      const res = await fetch('/api/path-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, conversation_id: conversationId }),
      });
      if (!res.ok) throw new Error(`turn failed: ${res.status}`);
      const data = await res.json() as { messages: PathMessage[] };
      setMessages(prev => [...prev.filter(m => m !== pending), ...data.messages]);
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
    );
    if (!ok) setInput(text);
  }

  function handleChoice(message: PathMessage, choiceIds: string[]) {
    if (sending || !message.choices) return;
    sendTurn(
      { action: 'choice', message_id: message.id, choice_ids: choiceIds },
      { id: 'pending', role: 'user', content: choiceContent(message.choices, choiceIds), choices: null, selected_choice_ids: choiceIds },
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
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Let’s work out where you’re going."
        body={sendError || 'A short conversation, built on your Identity Report. Zyrro asks only what it doesn’t already know, then turns it into path options.'}
        cta={<PrimaryButton onClick={handleStart} disabled={sending}>Start the conversation</PrimaryButton>}
      />
    );
  }

  const latest = messages[messages.length - 1];

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
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        placeholder="Type your answer…"
        inputRef={inputRef}
        renderAfterAssistant={message =>
          message === latest && message.choices && !sending ? (
            <ChatChoices choices={message.choices} disabled={sending} onSubmit={ids => handleChoice(message, ids)} />
          ) : null
        }
      />
    </div>
  );
}
