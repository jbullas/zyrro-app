"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createConversation } from "@/lib/conversations";
import { saveMessage } from "@/lib/messages";
import { createClient } from "@/utils/supabase/client";
import GatedState from "@/components/GatedState";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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
    if (messages.length > 0) return;

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
        inputRef.current?.focus();
      }
    }

    startConversation();
  }, [subscriptionChecked, isAuthenticated, isSubscribed, messages.length]);

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

  return (
    <div className="flow-container mentor-chat-container">
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
            <div className="mentor-bubble mentor-bubble--assistant mentor-bubble--loading">
              <span className="spinner spin" />
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
