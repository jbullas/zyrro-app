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
  // #168 shorter flow: Path-only extensions. Mentor passes none of them, so
  // its DOM is unchanged.
  // header: rendered at the top of the scrolling message list.
  header?: ReactNode;
  // renderInBubble: extra content inside the assistant bubble (Path's choices,
  // note and Continue), below the message and separated by a thin divider.
  renderInBubble?: (message: M, index: number) => ReactNode;
  // renderAssistant: replaces the assistant bubble entirely when it returns
  // something (Path's summary card).
  renderAssistant?: (message: M, index: number) => ReactNode;
  // preserveUserLineBreaks: a tapped answer is several lines (one per question).
  preserveUserLineBreaks?: boolean;
  // renderUser: replaces the user bubble's content when it returns something
  // (Path's tapped answers: the question muted, the answer in normal text).
  renderUser?: (message: M, index: number) => ReactNode;
  // statusText: the typing indicator's line (default "Thinking...").
  statusText?: string;
  // hideComposer: one input at a time; Path hides the free-text box on turns with choices.
  hideComposer?: boolean;
  // maxLength: caps the free-text box and shows a count while typing (Path,
  // brief 168-guardrails-redo). Mentor passes none: its box is unchanged.
  maxLength?: number;
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
  header,
  renderInBubble,
  renderAssistant,
  preserveUserLineBreaks,
  renderUser,
  statusText,
  hideComposer,
  maxLength,
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
        {header}
        {messages.map((msg, i) => {
          const replaced = msg.role === 'assistant' ? renderAssistant?.(msg, i) : null;
          const markdown = (
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
          );
          const inBubble = msg.role === 'assistant' ? renderInBubble?.(msg, i) : null;
          const userContent = msg.role === 'user' ? renderUser?.(msg, i) : null;
          return (
            <Fragment key={i}>
              {replaced ? (
                <div className={`mentor-message mentor-message--${msg.role}`}>{replaced}</div>
              ) : (
                <div className={`mentor-message mentor-message--${msg.role}`}>
                  <div className={`mentor-bubble mentor-bubble--${msg.role}`}>
                    {msg.role === 'assistant' ? (
                      inBubble ? (
                        <div className="divided-list">
                          <div>{markdown}</div>
                          <div>{inBubble}</div>
                        </div>
                      ) : markdown
                    ) : userContent ? (
                      userContent
                    ) : preserveUserLineBreaks ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && renderAfterAssistant?.(msg, i)}
            </Fragment>
          );
        })}
        {loading && (
          <div className="mentor-message mentor-message--assistant">
            <div className="mentor-typing">
              <span className="spinner spin" />
              <span>{statusText ?? 'Thinking...'}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!hideComposer && (
        <div className="mentor-composer">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="input-field flex-1"
            {...(maxLength !== undefined && { maxLength })}
          />
          {maxLength !== undefined && input.length > 0 && (
            <span className="path-risk-note self-center whitespace-nowrap" aria-live="polite">
              {input.length.toLocaleString('en-US')} / {maxLength.toLocaleString('en-US')}
            </span>
          )}
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="mentor-send-btn"
          >
            Send
          </button>
        </div>
      )}
    </>
  );
}
