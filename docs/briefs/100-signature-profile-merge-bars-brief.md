# Brief: #100 Stage 2 — Signature Profile: merge Primary+Secondary bars into one card, remove numbering

**Ticket:** #100 (Stage 2 addendum, decided during the 2026-08-05 planning
walkthrough). Scaled-down first step toward the eventual unified all-tier
chart — Emerging/Suppressed are explicitly deferred, not part of this brief.

**Files:** `app/identity/page.tsx` and `components/PrimarySignatureBars.tsx`
only.

## Current state (confirmed against a live screenshot)

Signature Profile currently renders two separate `.card` divs:
1. Primary Signatures — `<PrimarySignatureBars signatures={primary_constellation} />`,
   numbered circles 1-5, gradient bar fill.
2. Secondary Signatures — hand-rolled inline in `page.tsx`, numbered circles
   6-8 (muted grey), grey bar fill.

`PrimarySignatureBars` is **also used by `components/IdentityCard.tsx`**
(the dashboard's collapsible identity card, `#64`), numbered, Primary-only.
That usage is out of scope and must not change.

## Changes

1. **`components/PrimarySignatureBars.tsx`** — add an optional `numbered`
   prop, `default true`. When `false`, don't render `.sig-num-circle` at
   all for any row — drop the leading numbered circle entirely, keep name,
   domain, bar, and score unchanged. Default behavior (numbered) must stay
   identical to today for any caller that doesn't pass the prop.

2. **`app/identity/page.tsx`, Signature Profile section:**
   - Call `<PrimarySignatureBars signatures={primary_constellation} numbered={false} />`.
   - Remove the inline Secondary block's `.sig-num-circle-muted` div from
     each row — same "drop the circle, keep everything else" treatment.
   - Merge the two separate `.card` divs (Primary's, Secondary's) into a
     single `.card` wrapping both blocks in sequence: Primary's rows first
     (still under its own `card-sub-label`, "Primary Signatures"), then
     Secondary's rows (still under "Secondary Signatures"). Each retains its
     own `card-sub-label`/group identity inside the one card — this is a
     container merge, not a data merge.
   - The Domain Radar's own `.card` is untouched, stays separate.

## Stop conditions

- `app/identity/page.tsx` and `components/PrimarySignatureBars.tsx` only.
- No changes to Emerging or Suppressed signatures — not in scope.
- No CSS file edits — conditional rendering of the circle via the `numbered`
  prop should need no new CSS; if it turns out to need any, flag it and stop
  rather than editing `globals.css` without confirming first.
- `components/IdentityCard.tsx` is not touched. Its existing
  `<PrimarySignatureBars signatures={content.primary_signatures} />` call
  passes no `numbered` prop, so it must keep rendering numbered by default —
  confirm this explicitly during verification, don't just assume the default
  holds.
- No changes to bar colors, fonts, spacing, or any other visual property
  beyond removing the numbered circle and merging the two card containers.

## Verification (Definition of Done)

Live-verify against a real ready `identity_report` (existing
`withVerificationSession` pattern, no new generation needed):

- `/identity`'s Signature Profile renders Primary and Secondary inside a
  single `.card` element (not two).
- No `.sig-num-circle` or `.sig-num-circle-muted` renders anywhere inside
  that card.
- Primary and Secondary rows otherwise render identically to before (name,
  domain, bar fill color/style, score) — only the circle is gone.
- `/dashboard`'s Identity Card, when expanded, still renders
  `PrimarySignatureBars` **with** numbered circles (1-5) — confirms the
  `numbered` prop's default wasn't broken.
- Zero console/page errors on both `/identity` and `/dashboard`.
- `npx tsc --noEmit` and `npm run build` both clean.
