# #143 — Options step: inline select/confirm, per-candidate comments, checkbox toggle

## Problem (confirmed via live testing, 2026-09-13)

Current behavior in `components/OptionsFlow.tsx`: clicking "Select This Path →" on a
candidate card only sets local `tentativeId` state (button becomes "Selected ✓"). The
comment textarea and the "Confirm selection"/"Change selection" buttons then render in
a **separate card at the bottom of the page**, below all four candidate cards —
disconnected from which candidate is actually selected. Screenshot confirmed this reads
as broken: the Confirm button appears visually nested inside the "ANYTHING ELSE?"
comments box, as if commenting were required to proceed.

Separately: `comments` is a single shared string (`useState('')` at the top of
`OptionsFlow`). If a user types a comment while candidate A is tentatively selected,
then switches to candidate B without confirming, A's comment text silently carries over
and would be submitted as if it were B's — wrong data attached to the wrong path, no
warning to the user.

## Required changes

### 1. Checkbox-style select toggle, not a bordered button

Replace the "Select This Path →" / "Selected ✓" `SecondaryButton` with a checkbox-style
toggle, styled with the existing link/brand color treatment (reuse `LinkButton`'s
existing color, don't introduce a new color token — ground rule: reuse styles, avoid
introducing new ones unless necessary). Checking it selects that candidate; unchecking
deselects it. This replaces the button entirely — there is no separate "Change
selection" control.

### 2. Inline comment field + Confirm, inside the selected card

When a candidate is selected, its own card (not a separate card below the list) shows:
- the comment textarea (existing copy/placeholder can stay as-is)
- a "Confirm selection" button

Deselecting collapses this section back down within that same card. No bottom-of-page
box for this — remove that entirely from the awaiting-checkpoint render branch.

### 3. Per-candidate comments, tracked in the parent

Replace the single `comments` string with a map keyed by candidate id — e.g.
`Record<string, string>` — **owned by `OptionsFlow` itself** (the parent), not by
individual candidate sub-components. This is a deliberate choice, not an
implementation detail to skip: if candidate cards are ever restructured into their own
sub-components, or unselected cards are ever hidden/collapsed/rebuilt in a future UI
pass, comment text must not depend on those cards staying mounted to survive. Keeping
the map at the parent level means it can't be lost regardless of what happens to the
card markup around it.

Behavior:
- Selecting a candidate shows its own entry from the map (empty string if none yet).
- Typing updates only that candidate's entry.
- Switching to a different candidate shows that candidate's own entry — never
  leftover text from whichever candidate was selected before.
- Switching back to a previously-commented candidate restores its own text exactly as
  left.
- On Confirm, submit only the active candidate's own entry from the map (existing
  `submitSelect(candidateId, comments)` call, just sourcing `comments` from
  `commentsByCandidate[activeId] ?? ''` instead of the old shared string).

### 4. Confirm selection is a PrimaryButton

Change "Confirm selection" from `SecondaryButton` to `PrimaryButton`. This is a
deliberate, intentional exception to this flow's otherwise-consistent
Secondary-for-progression pattern (Direction's three "Continue" buttons, in
`DirectionFlow.tsx`, are all `SecondaryButton` and should stay that way — don't touch
them). Reasoning, for the record: Confirm is the only action in the entire `/path` flow
that triggers actual report generation (a real LLM call and cost), not just navigation
to the next screen — a substantively different kind of action, not just a more
important-feeling one.

**Also update `docs/framework` or wherever #137's shared-UI-system brief/notes live**
with this reasoning, so a future pass on button consistency (#137) doesn't "correct"
this back to Secondary without knowing why it's intentionally different.

## Explicitly unchanged

- Selecting a different candidate while one is already selected switches directly —
  no requirement to deselect first. Existing behavior, don't change it.
- The refine section ("Want a different option?") still hides once a candidate is
  selected, same guard as today (`!activeId` instead of `!tentativeId`, name change
  only).
- `submitSelect`'s API contract (`lib/use-path-options.ts`) is unchanged — this is a
  client-side rendering/state change in `OptionsFlow.tsx` only, not a route change.

## Verification required

- Real browser pass: select candidate A, type a comment, switch to candidate B
  (confirm B shows an empty comment field, not A's text), switch back to A (confirm
  A's original comment text is still there, exactly as typed).
- Confirm the bottom-of-page "ANYTHING ELSE?" card no longer renders at all in the
  awaiting-checkpoint state.
- Confirm the checkbox visually reads as a toggle, not a button, and uses the existing
  link color rather than a new one.
- Confirm "Confirm selection" renders as `PrimaryButton`'s actual visual style, and
  Direction's three Continue buttons are unchanged (still Secondary).
- Full/expanded terminal output for any test run, not a collapsed summary.
- `tsc` clean project-wide.
