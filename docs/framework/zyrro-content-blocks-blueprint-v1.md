# Zyrro Content Blocks Blueprint v1

## Goal

A finite set of reusable React components — a "theme" — that covers the large majority of
the app's markup. Reusable brand *variables* (fonts, colors, spacing) already exist as CSS
custom properties in `globals.css`; this blueprint is the equivalent discipline one level up,
for *content structure*. A CSS class is styling only. A component is the actual reusable
markup (JSX + props) that assembles those classes into a structure — e.g. `.constellation-card`
already exists and is shared, but the `<div className="constellation-card">...` JSX that uses
it is currently hand-written separately in three different page files. Extracting a component
means a new `.tsx` file (e.g. `components/blocks/ConstellationCard.tsx`) holding that JSX once,
taking props, which pages import instead of retyping the structure.

This supersedes ticket #19 as originally scoped (moving inline styles into classes page by
page). Extracting shared components first means styling most of these blocks gets fixed once,
inside the component, instead of three times across `/identity`, `/path`, `/plan`. What's left
after extraction — genuinely page-specific markup on `/start`, `/` (homepage), `/dashboard` —
is the reduced scope for a follow-up inline-style pass, not eliminated but much smaller.

## Two duplication findings that motivated this (already confirmed in the code)

- `/` (homepage) hand-codes its own header nav markup instead of importing the existing
  `components/Header.tsx` — a real component going unused on one page, not a missing one.
- `.constellation-card` (numbered badge + header pattern) is copy-pasted identically across
  `app/identity/page.tsx`, `app/path/page.tsx`, `app/plan/page.tsx`.

## Component list

Role/appearance describes what each component *is* — stable regardless of which pages call it.
(Which pages currently call it is a code-state fact; that lives in the code, not here.)

### Layout primitives

`FlowContainer`, `Card`, and `Eyebrow` were considered and deliberately **dropped** from this
list. Each is just a className applied directly with no per-instance logic inside — CSS alone
already guarantees consistency. A component would add indirection without removing any real
risk. Use the classes directly.

| Component | Function |
|---|---|
| `MessageState` | Covers every "nothing to show yet" screen (anonymous, no-questionnaire, generation-failed, unpaid, no-selection). Takes a label, a heading, a body message, and a single call-to-action that's either a navigation link or a retry handler — that branching is currently hand-typed separately at each of 8+ call sites. |

### Form / button primitives
| Component | Function |
|---|---|
| `PrimaryButton` | The conversion/primary action button. Handles the disabled-state condition in one place instead of a hand-typed class string per call site. |
| `SecondaryButton` | The progress-action button (Continue, Next, Submit). Same disabled-state handling as above. |
| `LinkButton` | A text-only action that behaves like a button. |
| `BackButton` | Backward navigation — pairs a leading icon with a label. |
| `FormField` | An input paired with its helper text and error message, so the show-helper-or-show-error branching lives in one place instead of per page. |

### Generic content patterns
| Component | Function |
|---|---|
| `GeneratingState` | Shown while an artifact is being generated — takes a heading and description as content. |
| `StatsPill` | Displays one or more inline stat/metadata values. |
| `DeliverableItem` | One item in a "what you'll get" list — icon plus label. |
| `TocRow` | A clickable row linking to a report section, given a number, title, and destination. |
| `ScoreBandPill` | Labels which score band an item falls into (dominant / strong / moderate / weak) — takes the band as a prop and resolves the right variant. |

### Report composites (the biggest win — /identity, /path, /plan all render report-style content)
| Component | Function |
|---|---|
| `ReportShell` | The cover-plus-sections skeleton every generated report (Identity/Path/Plan) is built inside. |
| `ConstellationCard` | The unit for presenting one scored item (a signature, a path option, a plan phase) — takes a badge number/value, a title, meta text, and a body; handles the active/muted variant branching currently hand-typed per call site. |
| `ChipRow` / `ChipTag` | A row of tags, given a list of labels. |
| `LimitsBlock` | Explains what a report or plan doesn't cover, given a heading and a list of items. |
| `CoreStatement` | Highlights a single key statement, given the statement text. |
| `EvidenceBlock` | Holds supporting analysis/evidence copy. |

### Mentor-specific (already fairly self-contained — lower duplication risk, lower priority)
`MentorBubble` (chat message bubble, user/assistant variants), `MentorTyping` (inline waiting
indicator), `MentorComposer` (bottom input bar) — extract only if/when a second surface needs
them beyond `/mentor` itself.

~20 components total. Genuinely page-specific markup (the `/start` quiz flow, `/dashboard`'s
own layout, homepage hero/sections) stays as page-local JSX — the goal is eliminating
duplication, not eliminating every unique page.

## Extraction order

1. **Homepage to `Header`** — not an extraction, a one-line fix (import the existing component
   instead of duplicating its markup). Trivial, zero risk, do first as a quick win.
2. **Primitives** — `FlowContainer`, `Card`, `Eyebrow`, the button family, `FormField`. Touch
   every page but are close to 1:1 swaps (wrap existing markup, no visual change expected).
   Lowest risk, highest reach — do these before anything domain-specific.
3. **`GeneratingState`** — one component, three call sites, currently byte-for-byte duplicated.
   Good proof-of-concept for the composite tier before tackling the larger report components.
4. **Report composites** — `ReportShell`, `ConstellationCard`, `ChipRow`, `LimitsBlock`,
   `CoreStatement`, `EvidenceBlock`. The biggest single win: three pages' worth of duplicated
   markup collapses into one set of components. Do these together since they compose into
   each other (a `ReportShell` contains `ConstellationCard`s which contain `ChipRow`s).
5. **Remaining page-specific inline styles** — whatever's left on `/start` and the homepage
   that isn't a shared pattern (this is #19's reduced scope, done last).

## Migration approach (per component)

Same discipline as prior briefs in this project:
- One component (or tightly-coupled group, per step 4 above) per brief.
- Extract the component with a typed props interface — the interface is the documentation;
  no separate content-blocks doc listing call sites to maintain and let drift.
- Replace all call sites in the same brief, not partial rollout — a component with one caller
  and two un-migrated duplicates is worse than not extracting at all.
- Visual check on every affected route before commit (same live-verification pattern already
  in use: local dev server + Playwright + magic-link test session).
- Diff review, changelog entry, commit — standard session-end protocol.

## Ticket #19 — redefined scope

Suggested board text (short title + one descriptive sentence, matching existing ticket format):

> **Content block extraction & standardization sweep** -- Extract the ~20 finite reusable
> components in zyrro_content_blocks_blueprint_v_1.md, replacing duplicated markup across
> pages; move any remaining page-specific inline styles into classes once extraction is done.

Board is Miroslav's to edit -- this is just the suggested replacement text, not applied anywhere.

## Open question for Miroslav/Jeff before execution starts

Component file location: `components/blocks/` (new directory) vs. flat under `components/`
alongside `Header.tsx`/`GatedState.tsx`?
