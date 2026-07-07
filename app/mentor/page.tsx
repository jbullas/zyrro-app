"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createConversation, listConversations, type ConversationListItem } from "@/lib/conversations";
import { saveMessage, listMessages } from "@/lib/messages";
import { createClient } from "@/utils/supabase/client";
import GatedState from "@/components/GatedState";
import SecondaryButton from "@/components/SecondaryButton";
import LinkButton from "@/components/LinkButton";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type View = "list" | "chat";

export default function MentorPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);
  const [view, setView] = useState<View>("list");
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const [endError, setEndError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const supabase = createClient();

    async function checkAuth() {
      const { data, error } = await supabase.auth.getSession();
      setIsAuthenticated(!error && !!data.session);
      setAuthChecked(true);
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setAuthChecked(true);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    if (!isAuthenticated) {
      setSubscriptionChecked(true);
      return;
    }

    const supabase = createClient();

    async function checkSubscription() {
      if (process.env.NEXT_PUBLIC_OPEN_ACCESS === 'true') {
        setIsSubscribed(true);
        setSubscriptionChecked(true);
        return;
      }
      const { data } = await supabase
        .from("entitlements")
        .select("id")
        .eq("product", "subscription_payment")
        .eq("status", "active")
        .maybeSingle();
      setIsSubscribed(!!data);
      setSubscriptionChecked(true);
    }

    checkSubscription();
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    if (!subscriptionChecked || !isAuthenticated || !isSubscribed) return;
    if (view !== "list") return;

    async function refreshConversations() {
      setConversationsLoading(true);
      try {
        const rows = await listConversations();
        setConversations(rows);
      } catch (err) {
        console.error("listConversations failed:", err);
      } finally {
        setConversationsLoading(false);
      }
    }

    refreshConversations();
  }, [subscriptionChecked, isAuthenticated, isSubscribed, view]);

  async function startConversation() {
    setLoading(true);

    try {
      const conversation = await createConversation();
      setConversationId(conversation.id);

      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Start" }],
        }),
      });

      const data: { reply?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      const firstReply = data.reply ?? "No response.";

      await saveMessage({ conversationId: conversation.id, role: "assistant", content: firstReply });
      setMessages([{ role: "assistant", content: firstReply }]);
    } catch (err) {
      console.error("startConversation failed:", err);
      setMessages([{ role: "assistant", content: "Error connecting to mentor." }]);
    } finally {
      setLoading(false);
      setEndError("");
      setView("chat");
      inputRef.current?.focus();
    }
  }

  async function openConversation(id: string) {
    setLoading(true);

    try {
      const rows = await listMessages(id);
      setMessages(rows);
      setConversationId(id);
      setEndError("");
      setView("chat");
    } catch (err) {
      console.error("listMessages failed:", err);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function backToList() {
    setView("list");
  }

  async function handleEndConversation() {
    if (!conversationId || endLoading) return;

    setEndLoading(true);
    setEndError("");

    try {
      const res = await fetch("/api/end-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setView("list");
    } catch (err) {
      console.error("end-conversation failed:", err);
      setEndError("Couldn't end the conversation. Try again.");
    } finally {
      setEndLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      if (conversationId) {
        await saveMessage({ conversationId, role: "user", content: userMessage.content });
      }

      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const data: { reply?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.reply ?? "No response.",
      };

      if (conversationId) {
        await saveMessage({ conversationId, role: "assistant", content: assistantMessage.content });
      }

      setMessages([...updatedMessages, assistantMessage]);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Error: could not get response." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // DEV ONLY — remove before go-live
  async function handleDevGrant() {
    setGrantLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setGrantLoading(false); return; }
    await fetch('/api/dev/grant-entitlement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, product: 'subscription_payment' }),
    });
    window.location.reload();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  if (!authChecked) return null;

  if (!isAuthenticated) {
    return (
      <GatedState
        eyebrow="ZYRRO MENTOR"
        heading="The Zyrro Mentor is ready when you are."
        body="Sign in to access your Mentor."
      />
    );
  }

  if (!subscriptionChecked) return null;

  if (!isSubscribed) {
    return (
      <div className="flow-container gated-container">
        <p className="eyebrow">ZYRRO MENTOR</p>
        <h1>Your plan is the map. The Mentor walks it with you.</h1>
        <p>The Zyrro Mentor keeps you moving on your chosen path — accountability, momentum, and guidance when you need it.</p>
        {/* TODO Brief B: wire up subscription checkout */}
        <button className="btn-primary btn-disabled" aria-disabled="true">
          Start your subscription →
        </button>

        {/* DEV ONLY — remove before go-live */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <button
            onClick={handleDevGrant}
            disabled={grantLoading}
            className="btn-link"
            style={{ fontSize: '12px', color: '#999' }}
          >
            {grantLoading ? 'Granting…' : 'DEV: grant subscription'}
          </button>
        </div>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="flow-container mentor-list-container">
        <div className="mentor-list-header">
          <h2>Your conversations</h2>
          <SecondaryButton onClick={startConversation} disabled={loading} compact>
            New conversation
          </SecondaryButton>
        </div>

        {conversationsLoading ? (
          <p className="mentor-list-empty">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="mentor-list-empty">No conversations yet — start one above.</p>
        ) : (
          conversations.map((c) => (
            <button key={c.id} onClick={() => openConversation(c.id)} className="toc-row">
              <span className={`mentor-list-row-title${c.summary ? "" : " mentor-list-row-title--untitled"}`}>
                {c.summary || "Untitled conversation"}
              </span>
              <span className="mentor-list-row-date">
                {new Date(c.last_message_at ?? c.created_at).toLocaleDateString()}
              </span>
            </button>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flow-container mentor-chat-container">
      <div className="mentor-chat-header">
        <button onClick={backToList} className="btn-back">← Back</button>
        <LinkButton onClick={handleEndConversation} disabled={endLoading} inline>
          {endLoading ? "Ending…" : "End conversation"}
        </LinkButton>
      </div>
      {endError && (
        <div className="mentor-end-error-wrap">
          <p className="form-error">{endError}</p>
        </div>
      )}
      <div className="mentor-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`mentor-message mentor-message--${msg.role}`}>
            <div className={`mentor-bubble mentor-bubble--${msg.role}`}>
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mentor-md-p">{children}</p>,
                    ul: ({ children }) => <ul className="mentor-md-ul">{children}</ul>,
                    ol: ({ children }) => <ol className="mentor-md-ol">{children}</ol>,
                    li: ({ children }) => <li className="mentor-md-li">{children}</li>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="mentor-message mentor-message--assistant">
            <div className="mentor-typing">
              <span className="spinner spin" />
              <span>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="mentor-composer">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your mentor…"
          className="mentor-input"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="mentor-send-btn"
        >
          Send
        </button>
      </div>
    </div>
  );
}
