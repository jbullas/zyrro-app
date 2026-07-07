# Ticket #13 — Dashboard wiring

Wire the meta-bundle into the Dashboard so it answers "where do I stand" using `resolveMetaBundle()`.

## Context

`lib/meta-bundle.ts` (`resolveMetaBundle(userId)`) already exists and is fully self-contained: it resolves any stale per-conversation bundles, re-synthesizes the meta-bundle only if something newer exists, persists the result to `meta_bundles`, and returns `{ content, created_at }` or `null` on failure. Nothing in this ticket touches that file.

`app/dashboard/page.tsx` currently only does an auth check and renders a "Dashboard — coming soon" placeholder. No fetch, no meta-bundle rendering, exists yet.

## Scope

- Add a server-side (or client-side via a new API route — implementer's call, follow the pattern already used elsewhere in the repo, e.g. `app/api/end-conversation/route.ts`) call to `resolveMetaBundle(userId)` from the Dashboard.
- Render the returned `content` as the Dashboard's continuity view. Plain, readable presentation — this is prose, not structured data; no need to parse it further.
- Handle the three real outcomes:
  1. **`null` with no conversations yet** — user hasn't used `/mentor` yet. Show a simple empty-state, not an error (e.g. "Your continuity summary will appear here once you've had a conversation with your mentor").
  2. **`null` due to an actual failure** (fetch/write error inside `resolveMetaBundle`) — show a generic, non-alarming fallback state. `resolveMetaBundle` already logs the underlying error server-side; the Dashboard doesn't need to distinguish failure from empty-state at the UI level beyond that both render gracefully.
  3. **Success** — render `content`, and optionally the `created_at` timestamp (e.g. "Last updated on [date]") if it fits the existing Dashboard visual style.
- Keep the existing auth-gate / `GatedState` behavior for unauthenticated users untouched.

## Out of scope

- Any change to `resolveMetaBundle()`, `meta_bundles` schema, or the synthesis prompt.
- Any change to `/mentor` itself.
- Building out any other planned Dashboard sections beyond the meta-bundle continuity view — this ticket is the meta-bundle wiring only.

## Stop conditions

- Do not touch `lib/meta-bundle.ts`, `lib/conversation-bundle.ts`, or their prompts.
- Do not add polling or background jobs — `resolveMetaBundle()` is synchronous by design; call it directly on page load / route hit.
- If rendering requires a new API route, follow the existing session-derived-user pattern (see `app/api/end-conversation/route.ts`) rather than trusting a client-supplied user id.
