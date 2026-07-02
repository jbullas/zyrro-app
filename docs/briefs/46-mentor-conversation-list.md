# Brief: #46 — /mentor conversation list UI

## Context

Per `docs/framework/zyrro_continuity_memory_blueprint_v_1.md`, `/mentor`'s
default view should be a list of the user's conversations (open and past),
not a chat window. Opening a conversation resolves staleness if needed, then
loads it. A user can end a conversation explicitly, which resolves its
bundle immediately via the existing `POST /api/end-conversation` route.

Two data-access functions this needs don't exist yet:
`listConversations` and `listMessages`. Everything else (the end-conversation
route, `resolveConversationBundle`, the `messages`/`conversations` schema)
is already built.

## Stop conditions

- No new migrations — `conversations` and `messages` already support this.
- Don't touch `/api/mentor` or its system prompt.
- No sort/filter controls — plain reverse-chronological list only (the
  blueprint explicitly defers exact sort/filter to a later pass).
- No meta-bundle work (#45) and no Dashboard changes (#13) — separate
  tickets.
- Preserve the existing auth/subscription gating in `app/mentor/page.tsx`
  exactly as-is (the `authChecked` / `isAuthenticated` / `subscriptionChecked`
  / `isSubscribed` gates and their returned states) — only the subscribed,
  authenticated branch changes.
- Show the diff before committing.

## Task

### 1. `lib/conversations.ts` — add `listConversations`

Add an exported function that fetches the current user's conversations
ordered by `last_message_at` (falling back to `created_at` for
conversations with no messages yet) descending. Select `id`, `status`,
`summary`, `summary_generated_at`, `last_message_at`, `created_at`. Follow
the existing file's pattern (client-side Supabase client, auth check,
throw on error).

### 2. `lib/messages.ts` — add `listMessages`

Add an exported function that fetches all messages for a given
`conversationId`, ordered by `created_at` ascending, returning `role` and
`content` (shape compatible with the existing `ChatMessage` type in
`app/mentor/page.tsx`). Follow the existing file's pattern.

### 3. `app/mentor/page.tsx` — list-first UX

Replace the current behavior (auto-creates and opens a new conversation on
load) with:

- **List view (default).** Once gating passes (subscribed + authenticated),
  fetch and show the conversation list via `listConversations`. Each row
  shows enough to identify it — e.g. last activity date and, if present,
  the `summary` (truncated) as a preview; otherwise show it as untitled /
  in-progress. A "New conversation" action starts a fresh one.
- **Opening a conversation.** Selecting a row loads its messages via
  `listMessages` and switches to the existing chat view (composer, message
  bubbles, markdown rendering — unchanged) populated with that history.
- **New conversation.** Reuses the existing `createConversation` +
  first-message flow, then switches straight to chat view.
- **Ending a conversation.** Add an explicit "End conversation" button in
  the chat view. It calls `POST /api/end-conversation` with the current
  `conversation_id`. On success, return to list view (re-fetch the list so
  the newly-completed conversation's updated summary shows). On failure,
  stay in chat view and surface an inline error — don't lose the user's
  place.
- **Back navigation.** Provide a way to return from chat view to list view
  without ending the conversation (an open conversation should remain
  resumable later, per the blueprint's session-lifecycle rules).

Keep the existing gated-state returns (`!authChecked`, `!isAuthenticated`,
`!subscriptionChecked`, `!isSubscribed`) untouched — this only changes what
renders once all four pass.
