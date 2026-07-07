# Brief: Mentor CSS fixes (#17, #21)

Two small, isolated CSS fixes in the mentor chat UI. No inline-style migration work here — separate from ticket #19.

## #21 — Ordered list numbers not showing in mentor replies

Root cause: `globals.css` imports Tailwind (`@import "tailwindcss"`), whose Preflight
resets `list-style: none` on all `ul`/`ol`. `.mentor-md-ol` (applied via the
ReactMarkdown `ol` renderer in `app/mentor/page.tsx`) never restores it.

Fix: in `globals.css`, add `list-style-type: decimal;` to `.mentor-md-ol`.
While there, check `.mentor-md-ul` — same root cause likely strips bullets too.
If so, add `list-style-type: disc;` there as well. This is the same CSS rule
block and the same root cause, not a separate ticket.

## #17 — Mentor loading indicator shouldn't look like a chat bubble

Current (`app/mentor/page.tsx`, the `{loading && (...)}` block):
```jsx
{loading && (
  <div className="mentor-message mentor-message--assistant">
    <div className="mentor-bubble mentor-bubble--assistant mentor-bubble--loading">
      <span className="spinner spin" />
    </div>
  </div>
)}
```

Replace the inner bubble with a plain inline row — no card background, border,
shadow, or radius. Small spinner + static text "Thinking...". Keep the outer
`.mentor-message.mentor-message--assistant` wrapper for left-alignment/spacing
consistency with other assistant messages.

Add to `globals.css`:
```css
.mentor-typing {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.mentor-typing .spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
```

Update the JSX to:
```jsx
{loading && (
  <div className="mentor-message mentor-message--assistant">
    <div className="mentor-typing">
      <span className="spinner spin" />
      <span>Thinking...</span>
    </div>
  </div>
)}
```

Remove `.mentor-bubble--loading` and its `.spinner` override from `globals.css`
once nothing references it — confirm with a search first.

## Stop conditions

- Do not touch `.mentor-bubble`, `.mentor-bubble--user`, `.mentor-bubble--assistant`
  (the real message bubbles) — only the loading state changes.
- Do not touch the shared `.spin` / `.spinner` base classes used by
  /identity, /path, /start — those stay as-is (ticket #17 confirmed those are fine).
- Do not touch `.mentor-md-p`, `.mentor-md-li`, or any other mentor markdown styling.
- Visual check on /mentor: send a message, confirm the "Thinking..." row has no
  box/border/shadow around it, and confirm a numbered-list reply now shows numbers.
- No new dependencies, no schema changes, no unrelated refactors.
