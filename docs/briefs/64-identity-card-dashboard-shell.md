# Brief: #64 — Dashboard Identity card + page shell

## Scope

Two things, inseparable in this ticket:

1. **Identity card** — identity badge, named identity, one-line summary,
   collapsible section containing the domain radar chart and the primary
   signatures bar-list, link to `/identity`.
2. **Dashboard shell** — assemble `app/dashboard/page.tsx` into the layout
   that future cards will each add themselves to. This ticket establishes
   the pattern; later work follows it rather than re-deciding it.

Out of scope: Momentum card content (consistency dial, mentor-conversations
count, tasks-completed count) and Project card content (project name header,
Completed/Open lists) — build the shell to receive these, not the cards
themselves. Neither is part of this ticket.

## 1. Identity card

**Data source**: latest `identity_report` artifact for the user
(`artifacts` table, `type = 'identity_report'`, `status = 'ready'`, most
recent by `created_at`). Relevant fields per `lib/artifact-schemas.ts`'s
`IdentitySignatureReportArtifactContent`:
- `cover.named_identity` — display name (e.g. "THE Strategic System
  Architect")
- `cover.identity_thesis` — 8–18 word one-line summary
- `domain_profile` — the 5-domain score object for the domain chart
- `primary_constellation` — top 5 signatures (`name`, `domain`, `score`),
  needed for both the identity badge's icon and the bar-list below

**Identity badge**: `docs/standards/branding-guidelines.md` explicitly calls
out the gradient shield badge as used "on: dashboard body, as standalone
card on off-white background" and names this exact spot ("the named
identity card on dashboard") — include it even though it wasn't in this
brief's original field list. It currently only exists inline in
`app/identity/page.tsx`'s cover section: a gradient shield (`<svg>` with a
`linearGradient` background) with a signature icon centered on top, the icon
chosen via `SIGNATURE_ICONS[primary_constellation[0].name]` (falls back to
`IconShield`). Extract this into a shared `IdentityBadge` component (shield
+ icon, parameterized on the primary signature name) and use it on both
`/identity` and the dashboard card.

**Layout**: badge left-aligned next to the named identity text (title
weight, not stacked/centered the way `/identity`'s full-page cover does it
— that layout assumes a narrow page-width column; a card needs a tighter
horizontal pairing of badge-then-name), with the one-line thesis running
full-width underneath both.

**Domain chart**: despite how earlier drafts of this brief described it,
`/identity` does **not** render the domain chart as inline SVG — it's
Chart.js, loaded from a CDN (`chart.umd.js` injected into `<head>`) driving
a `<canvas>` via `window.Chart`, initialized in the `useEffect` watching
`report?.domain_profile`. (The `<svg width="80" height="88">` block is
unrelated — that's the identity badge shield above, not the chart.) Extract
this into a shared `components/DomainRadarChart.tsx` — self-contained
`useEffect` + canvas ref, parameterized on `domain_profile` — and use it on
both `/identity` and the dashboard card. Since Chart.js sizes badly against
a hidden/zero-width canvas, only mount it once the collapsible section is
actually expanded, not eagerly on page load.

**Primary signatures bar-list**: also include the compact bar-list view of
`primary_constellation` from `/identity`'s "Signature Profile" section —
per-signature row with name, domain, a score bar, and the score number
(`sig-row`/`sig-bar-fill` markup). This is the compact bar-list form only,
**not** the longer per-signature deep-dive cards (`ConstellationCard`s with
full evidence-analysis prose) further down `/identity` — those stay
report-only, out of scope here. Extract the bar-list into a shared
component alongside the radar chart extraction, same reasoning
(consolidation over duplication per `docs/standards/coding-standards.md`).

Both the domain chart and the primary-signatures bar-list live inside the
**same collapsible section** — collapsed by default, badge + named identity
+ thesis visible immediately.

**Link**: card links through to `/identity` for the full report.

**No artifact / not-ready state**: if no `identity_report` artifact exists
yet, or its `status` isn't `ready`, show an appropriate empty/pending state
rather than erroring — this is a real state (a user who hasn't finished the
questionnaire, or whose report is still generating) not an edge case to
skip.

## 2. Dashboard shell

**Card order**: Identity → Momentum → Project, top to bottom. This was
decided in the 2026-07-21 dashboard-brainstorm session — Momentum sits
directly above where Project will land so low activity numbers are visually
paired with the actionable items that close the gap. Don't re-derive this;
just implement it.

**Current state to preserve**: `app/dashboard/page.tsx` currently renders
only the meta-bundle continuity content (auth-gated via `GatedState`,
fetches `/api/meta-bundle`, shows the bundle content or an empty-state
message). Fold this existing behavior in as part of the shell rather than
replacing it — confirm with live code exactly where it should sit relative
to the three new cards (a reasonable default is below the three status
cards, but this isn't specified anywhere — use judgment and note the
choice in the changelog rather than treating it as pre-decided).

**Loading/empty-state pattern to establish**: each card should independently
handle three states — loading, has-data, no-data-yet — without one card's
fetch blocking another's render. Since a Momentum card and a Project card
will each drop into this shell later with their own data sources, the
pattern this ticket establishes (component boundaries, how each card
manages its own loading/empty state, styling for empty vs. populated) is
what that future work should follow. Make this pattern easy to copy — e.g.
a shared card-loading component or convention — rather than something only
implicit in the Identity card's specific code.

**Styling**: reuse the existing `.card` class and spacing tokens
(`--space-*`) from `globals.css`. No new design tokens unless something
genuinely doesn't fit the existing system — if that comes up, flag it rather
than deciding unilaterally.

## Explicit non-goals / stop conditions

- Do not build Momentum or Project card content — that's separate, later
  work. This ticket's job is the shell it'll render into, plus Identity's
  own card.
- Do not add any new schema or migration.
- Do not include the `/identity` deep-dive `ConstellationCard`s (full
  evidence-analysis prose per signature) in the dashboard's collapsible
  section — bar-list only for primary signatures here.
- Don't guess at where the meta-bundle content should sit relative to the
  new cards without checking live code first — this is a real layout
  decision, not a given.

## Verification

Use the `/run` project skill to live-verify: bootstrap a test user
with a seeded `identity_report` artifact, confirm the dashboard renders the
correct badge icon (matching the seeded top primary signature), named
identity, one-line summary, and — once expanded — the correct domain chart
values and primary-signatures bar-list, matching what `/identity` shows for
the same user, not just that it doesn't throw. Also verify the
no-artifact-yet state renders sensibly for a fresh test user with no
`identity_report` row.
