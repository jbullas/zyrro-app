# Zyrro Continuity & Memory Blueprint v1

## Tier

Subscriber. This is the machinery behind the daily companion experience
and the Dashboard's continuity promise.

## Purpose

Give the mentor and the Dashboard an accurate, current picture of the
user without rebuilding it from scratch every time, and without needing
background infrastructure.

---

## Two-Tier Bundle Model

- **Conversation bundle** — one summary per conversation, capturing what
  that thread covered.
- **Meta-bundle** — a synthesis across all conversation bundles,
  versioned/append-only, giving Zyrro (and the Dashboard) the user's
  evolving baseline over time.

Static facts (Identity, chosen Path, current Plan) are never duplicated
into either bundle — they are read live from their source artifacts, as
the mentor already does today.

---

## Staleness & Regeneration

Reuses the existing generating/ready/failed pattern already proven for
Identity/Path/Plan.

- **Conversation bundle** is stale if `conversations.last_message_at` is
  more recent than the bundle's own last-updated timestamp. Resolved
  when the conversation is opened.
- **Meta-bundle** is stale if any conversation bundle has updated since
  the meta-bundle's last version. Resolved on Dashboard load — which
  first resolves any stale conversation bundles, then checks the
  meta-bundle against those freshly-updated bundles.

No cron jobs, no background workers — resolution only ever runs when a
user is about to look at something that needs it.

---

## Session Lifecycle

- Multiple conversations can be open simultaneously — there is no
  single "the" mentor thread.
- A user can end a conversation explicitly (button), which
  creates/updates its bundle immediately.
- A conversation left open with no explicit end is treated as stale
  once its bundle falls behind its last message — resolved
  opportunistically per the rule above, not on a timer.

---

## `/mentor` UX

Default view is a list of the user's conversations (open and past), not
a chat window. Supports sorting/filtering (recent, important,
difficult — exact set TBD at implementation). Opening a conversation
resolves staleness if needed, then loads it.

---

## Dashboard Boundary

Dashboard and `/mentor` read overlapping data but answer different
questions:

- **Dashboard** — "what gets me there fastest" — priority, next steps,
  meta-bundle.
- **`/mentor`** — "what I'm in the middle of" — the working set of
  active/recent conversations.

Dashboard shows a lightweight preview of open conversations (not a full
duplicate list) that deep-links into `/mentor`.

---

## Explicitly Out of Scope (this version)

- Redesigning `messages` for richer threading/search — deferred,
  separate decision.
- Sub-topics/threads within a single conversation — deferred, will live
  in structured bundle fields later.
- Exact `/mentor` sort/filter set — implementation detail, not a
  blueprint-level decision.
