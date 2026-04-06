"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createConversation } from "@/lib/conversations";
import { saveMessage } from "@/lib/messages";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function startConversation() {
      setLoading(true);

      try {
		const conversation = await createConversation();
		setConversationId(conversation.id);
		console.log("Chat page conversation created:", conversation);

	  const res = await fetch("/api/chat", {
	  method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
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

		await saveMessage({
		  conversationId: conversation.id,
		  role: "assistant",
		  content: firstAssistantReply,
		});

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
  }, []);

  async function handleSend() {
    if (!input.trim() || loading || !conversationId) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
	
	await saveMessage({
	  conversationId,
	  role: "user",
	  content: userMessage.content,
	});

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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

		await saveMessage({
		  conversationId,
		  role: "assistant",
		  content: assistantMessage.content,
		});

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
      <p style={{ margin: "0 0 12px 0", lineHeight: "1.5" }}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul style={{ margin: "0 0 12px 20px", padding: 0 }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ margin: "0 0 12px 20px", padding: 0 }}>{children}</ol>
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
    </main>
  );
}