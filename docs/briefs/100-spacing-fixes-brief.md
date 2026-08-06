# Brief: #100 — Spacing fixes (cover divider, card vertical rhythm, documentation paragraphs, footer width)

**Ticket:** #100. Four small, independent CSS fixes surfaced by reviewing
the live restructured report (Ingrid sample), following the
2026-08-06 card-consistency pass.

**Files:** `app/globals.css` only. No JSX/component changes needed for any
of these four.

**Cross-page impact, read first:** Fix 2 touches
`.constellation-card-body`, `.core-statement`, `.tension-block`, and
`.scoring-chips` — all shared by `/identity`, `/path`, and `/plan` via
`ConstellationCard`. Verify all three pages, not just `/identity`, same as
the last brief.

## Fix 1 — No divider between Cover and Domain Profile

**Root cause:** `.report-section + .report-section` only fires between
adjacent sections. Domain Profile is `.report-sections`' first child,
preceded by the separate `.report-cover` div — the adjacent-sibling
selector never applies to it, so it has no divider above it while every
other section does.

```css
.report-sections {
  border-top: 0.5px solid rgba(0,0,0,0.07); /* new */
  padding: 28px 18px 0; /* was: 8px 18px 0 — now matches the 28px used by
                            .report-section + .report-section, for a
                            consistent divider-to-content gap everywhere */
}
```

## Fix 2 — Core-statement/tension-block vertical spacing, real regression

**Root cause:** `.constellation-card-body` (added last brief) gives every
card `18px` padding on all sides. `.core-statement` and `.tension-block`
still carry their own `margin: 14px 16px 0` from before that wrapper
existed — so the actual top gap is now `18px + 14px = 32px` ("too much
space on top"), while the plain `<p>` right after `.core-statement`
(formerly `.evidence-analysis`, now bare) lost the `padding: 14px 16px 0`
it used to carry, leaving zero gap below the highlight box ("not enough
at the bottom"). Same issue on `/path`/`/plan`, since neither page's
`ConstellationCard` usage was touched.

**Fix — move vertical spacing to the container, per the same "container
owns spacing" principle from the last brief.** Keep each special block's
own padding/border/background (what makes them visually special) but stop
them from managing their own gap to neighbors — `.constellation-card-body`
owns that uniformly instead.

```css
.constellation-card-body > * + * {
  margin-top: 16px;
}

.core-statement {
  margin: 0 16px; /* was: 14px 16px 0 — vertical spacing now owned by the parent rule above */
  padding: 12px 14px;
  border-left: 3px solid #C60567;
  background: #F7F6F3;
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  font-weight: 700;
  color: #1E1E1E;
  line-height: 1.45;
}

.tension-block {
  margin: 0 16px; /* was: 14px 16px 0, same reasoning */
  padding: 12px 14px;
  border-left: 3px solid #FE5618;
  background: rgba(254,86,24,0.05);
  border-radius: 0 8px 8px 0;
}

.scoring-chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 14px 16px;
  margin-top: 0; /* was: 14px — spacing now owned by .constellation-card-body > * + *; the border-top below still provides its own visual divider on top of that spacing */
  border-top: 0.5px solid rgba(0,0,0,0.07);
}
```

Also remove the now-fully-dead `.constellation-card .evidence-analysis:last-child
{ padding-bottom: 14px; }` rule — `.evidence-analysis` stopped being
applied to any element in the previous brief (collapsed to a bare `<p>`),
so this selector matches nothing. Cleanup, not required for the fix to
work, but flag if you'd rather leave dead CSS alone and skip this part.

## Fix 3 — Documentation paragraph spacing

**Root cause:** `.documentation p` sets no `margin`; the global `p` rule
is `margin: 0`. Consecutive paragraphs (the 4 Research Foundation
pillars especially) stack with zero gap between them.

```css
.documentation p + p {
  margin-top: 12px;
}
```
Only between paragraphs — not before the first paragraph following a
heading, which already has adequate spacing from `.documentation h2`/`h3`'s
own margin.

## Fix 4 — `.report-footer` wider than the rest of the page

**Root cause:** `.report-footer` is a sibling of `.report-sections`, not
nested inside it, and their shared parent (`.report-scroll`) carries no
horizontal padding of its own. `.report-sections` gets its `18px` side
inset from its own rule; `.report-footer` never got the equivalent, so it
renders edge-to-edge.

```css
.report-footer {
  border-top: 0.5px solid rgba(0,0,0,0.07);
  margin-top: 12px;
  padding: 24px 18px 0; /* was: padding-top: 24px only — now matches .report-sections' 18px horizontal inset */
}
```

## Stop conditions

- `app/globals.css` only.
- No changes to `app/identity/page.tsx`, `ConstellationCard.tsx`,
  `PrimarySignatureBars.tsx`, or any other component.
- Don't touch `.documentation h2`/`h3`'s own margin values — only adding
  the new `p + p` rule.
- Don't touch horizontal spacing/indentation anywhere except
  `.report-footer` (fix 4) — fixes 1-3 are vertical-spacing-only.

## Verification (Definition of Done)

Live-verify against a real ready `identity_report`, **and** `/path`/`/plan`
content (fix 2's blast radius), with actual pixel measurements this time
for vertical spacing specifically — the last brief's verification measured
horizontal offsets only, which is how this regression got through:

- `/identity`: a hairline divider renders between `.report-cover` and the
  Domain Profile section, matching the same visual weight as dividers
  between later sections.
- `/identity`, `/path`, `/plan`: measure `getBoundingClientRect()` top
  offsets to confirm the gap between `.constellation-card-body`'s top edge
  and `.core-statement`'s top edge is `18px` (not `32px`), and the gap
  between `.core-statement`'s bottom edge and the next element's top edge
  is `16px` (not `0px`). Repeat for `.tension-block` and `.scoring-chips`.
- `/identity`: measure the gap between consecutive `.documentation`
  paragraphs (the 4 Research Foundation pillar paragraphs) is `12px`, not
  `0px`.
- `/identity`: `.report-footer`'s rendered width/left-right edges match
  `.report-sections`' width/edges exactly — same horizontal inset, not
  wider.
- No visual regression elsewhere on `/path`/`/plan` (screenshot comparison
  against the prior brief's saved screenshots, same as last time).
- Zero console/page errors.
- `npx tsc --noEmit` and `npm run build` both clean (build check still
  relevant even for a CSS-only change, to catch any accidental syntax
  error).
