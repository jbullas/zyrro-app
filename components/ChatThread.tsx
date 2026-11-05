'use client';

import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';

export type ChatThreadMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatThreadProps<M extends ChatThreadMessage> = {
  messages: M[];
  loading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  // #168: rendered as its own row under an assistant message (e.g. Path's tap
  // choices). Mentor doesn't pass it, so its DOM is unchanged.
  renderAfterAssistant?: (message: M, index: number) => ReactNode;
};

// #168 step 2: the chat body shared by Mentor and Path: message list,
// markdown bubbles, typing indicator, auto-scroll, and the composer. Headers,
// gating and data loading/saving stay with each page.
export default function ChatThread<M extends ChatThreadMessage>({
  messages,
  loading,
  input,
  onInputChange,
  onSend,
  placeholder,
  inputRef,
  renderAfterAssistant,
}: ChatThreadProps<M>) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <>
      <div className="mentor-messages">
        {messages.map((msg, i) => (
          <Fragment key={i}>
            <div className={`mentor-message mentor-message--${msg.role}`}>
              <div className={`mentor-bubble mentor-bubble--${msg.role}`}>
                {msg.role === 'assistant' ? (
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
            {msg.role === 'assistant' && renderAfterAssistant?.(msg, i)}
          </Fragment>
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
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="input-field flex-1"
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          className="mentor-send-btn"
        >
          Send
        </button>
      </div>
    </>
  );
}
