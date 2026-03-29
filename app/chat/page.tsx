"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: could not get response.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "20px", maxWidth: "700px" }}>
      <h1>Zyrro Chat Test</h1>

      <div style={{ marginBottom: "20px" }}>
        {messages.map((message, index) => (
          <div key={index} style={{ marginBottom: "12px" }}>
            <strong>{message.role === "user" ? "You" : "Zyrro"}:</strong>{" "}
            {message.content}
          </div>
        ))}

        {loading && (
          <div>
            <strong>Zyrro:</strong> Thinking...
          </div>
        )}
      </div>

      <div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message"
          style={{ width: "70%", marginRight: "10px", padding: "8px" }}
        />
        <button onClick={handleSend} disabled={loading}>
          Send
        </button>
      </div>
    </main>
  );
}