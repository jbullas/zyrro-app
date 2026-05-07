"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createConversation } from "@/lib/conversations";
import { saveMessage } from "@/lib/messages";
import { createClient } from "@/utils/supabase/client";
import SignupModal from "@/components/SignupModal";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const GUEST_MESSAGES_KEY = "zyrro_guest_messages";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [guestRestoreChecked, setGuestRestoreChecked] = useState(false);
  const [layerUpgradeChecked, setLayerUpgradeChecked] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function getPlan(): "guest" | "free" {
    return isAuthenticated ? "free" : "guest";
  }

  function saveGuestMessagesToStorage(nextMessages: ChatMessage[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(GUEST_MESSAGES_KEY, JSON.stringify(nextMessages));
  }

  function hasCompletedQuestionFlow(currentMessages: ChatMessage[]) {
    return currentMessages.some(
      (message) =>
        message.role === "assistant" &&
        message.content.includes("**Question 13 of 13:**")
    );
  }

  useEffect(() => {
    const supabase = createClient();

    async function checkAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (!error && data.session) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }

      setAuthChecked(true);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setAuthChecked(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedMessages = localStorage.getItem(GUEST_MESSAGES_KEY);

    if (storedMessages) {
      try {
        const parsedMessages = JSON.parse(storedMessages) as ChatMessage[];

        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          setMessages(parsedMessages);
        }
      } catch (error) {
        console.error("Failed to restore guest messages:", error);
      }
    }

    setGuestRestoreChecked(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (messages.length > 0) {
      saveGuestMessagesToStorage(messages);
    } else {
      localStorage.removeItem(GUEST_MESSAGES_KEY);
    }
  }, [messages]);

  useEffect(() => {
    if (!authChecked || !guestRestoreChecked) return;
    if (!isAuthenticated) return;
    if (conversationId) return;
    if (messages.length === 0) return;

    async function handoffGuestChat() {
      try {
        const conversation = await createConversation();
        setConversationId(conversation.id);

        for (const message of messages) {
          await saveMessage({
            conversationId: conversation.id,
            role: message.role,
            content: message.content,
          });
        }

        console.log("Guest chat handed off to database:", conversation.id);
      } catch (error) {
        console.error("Guest handoff failed:", error);
      }
    }

    handoffGuestChat();
  }, [
    authChecked,
    guestRestoreChecked,
    isAuthenticated,
    conversationId,
    messages,
  ]);

  useEffect(() => {
    if (!authChecked || !guestRestoreChecked) return;
    if (messages.length > 0) return;

    async function startConversation() {
      setLoading(true);

      try {
        let activeConversationId = "";

        if (isAuthenticated) {
          const conversation = await createConversation();
          setConversationId(conversation.id);
          activeConversationId = conversation.id;
          console.log("Chat page conversation created:", conversation);
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan: getPlan(),
            messages: [
              {
                role: "user",
                content: "Start",
              },
            ],
          }),
        });

        const data: { reply?: string; error?: string } = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }

        const firstAssistantReply = data.reply || "No response.";

        if (isAuthenticated && activeConversationId) {
          await saveMessage({
            conversationId: activeConversationId,
            role: "assistant",
            content: firstAssistantReply,
          });
        }

        setMessages([
          {
            role: "assistant",
            content: firstAssistantReply,
          },
        ]);
      } catch (error) {
        console.error("startConversation failed:", error);

        setMessages([
          {
            role: "assistant",
            content: "Demo mode: waiting for API activation.",
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    }

    startConversation();
  }, [authChecked, guestRestoreChecked, messages.length, isAuthenticated]);

  useEffect(() => {
    if (!authChecked || !guestRestoreChecked) return;
    if (!isAuthenticated) return;
    if (layerUpgradeChecked) return;
    if (messages.length === 0) return;

    const alreadyHasLayer2 = messages.some(
      (message) =>
        message.role === "assistant" &&
        (message.content.includes("## Primary Signature Analysis") ||
          message.content.includes("## What This Report Is") ||
          message.content.includes("## How You Operate"))
    );

    if (alreadyHasLayer2) {
      setLayerUpgradeChecked(true);
      return;
    }

    const completedQuestionFlow = hasCompletedQuestionFlow(messages);

    if (!completedQuestionFlow) {
      setLayerUpgradeChecked(true);
      return;
    }

    async function upgradeToLayer2() {
      try {
        setLoading(true);

        let activeConversationId = conversationId;

        if (!activeConversationId) {
          const conversation = await createConversation();
          setConversationId(conversation.id);
          activeConversationId = conversation.id;
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan: "free",
            messages,
          }),
        });

        const data: { reply?: string; error?: string } = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply || "No response.",
        };

        await saveMessage({
          conversationId: activeConversationId,
          role: "assistant",
          content: assistantMessage.content,
        });

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error("Layer 2 upgrade failed:", error);
      } finally {
        setLayerUpgradeChecked(true);
        setLoading(false);
      }
    }

    upgradeToLayer2();
  }, [
    authChecked,
    guestRestoreChecked,
    isAuthenticated,
    layerUpgradeChecked,
    messages,
    conversationId,
  ]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      if (isAuthenticated && conversationId) {
        await saveMessage({
          conversationId,
          role: "user",
          content: userMessage.content,
        });
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: getPlan(),
          messages: updatedMessages,
        }),
      });

      const data: { reply?: string; error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.reply || "No response.",
      };

      if (isAuthenticated && conversationId) {
        await saveMessage({
          conversationId,
          role: "assistant",
          content: assistantMessage.content,
        });
      }

      setMessages([...updatedMessages, assistantMessage]);
    } catch {
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Error: could not get response.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  const lastAssistantContent =
    [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const showUnlockButton =
    !isAuthenticated && lastAssistantContent.includes("Unlock full identity");

  return (
    <main style={{ padding: "20px", maxWidth: "700px" }}>
      <h1>Zyrro</h1>

      <div style={{ marginBottom: "20px" }}>
        {messages.map((message, index) => (
          <div key={index} style={{ marginBottom: "16px" }}>
            <strong>{message.role === "user" ? "You" : "Zyrro"}:</strong>
            <div style={{ marginTop: "6px" }}>
              {message.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p style={{ margin: "0 0 12px 0", lineHeight: "1.5" }}>
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul style={{ margin: "0 0 12px 20px", padding: 0 }}>
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol style={{ margin: "0 0 12px 20px", padding: 0 }}>
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: "6px" }}>{children}</li>
                    ),
                    strong: ({ children }) => <strong>{children}</strong>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div>
            <strong>Zyrro:</strong> Thinking...
          </div>
        )}
      </div>

      {showUnlockButton && (
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setShowSignupModal(true)}
            style={{ padding: "10px 20px", cursor: "pointer" }}
          >
            Get your full Identity Report →
          </button>
        </div>
      )}

      {conversationId && (
        <p style={{ marginBottom: "12px", fontSize: "14px", color: "#666" }}>
          <strong>Conversation ID:</strong> {conversationId}
        </p>
      )}

      <div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer"
          style={{ width: "70%", marginRight: "10px", padding: "8px" }}
        />
        <button onClick={handleSend} disabled={loading}>
          Send
        </button>
      </div>

      <SignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        onSuccess={() => setShowSignupModal(false)}
      />
    </main>
  );
}
