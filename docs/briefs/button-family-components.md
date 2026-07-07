# Brief: Extract button-family components

First real component extraction from the content-blocks blueprint. Creates four components in
`components/` (flat, per the agreed location) and replaces every hand-typed button call site
across all pages. `FlowContainer`/`Card`/`Eyebrow` are deliberately NOT part of this brief —
they stay as plain CSS classes (see blueprint doc for why).

## Why these four (not a style change — a logic-centralization change)

Every button already looks consistent (CSS handles that). What's duplicated is the *logic*
around them — conditional disabled-class strings, icon+label composition, loading-text swaps —
hand-typed slightly differently at each of the ~30 call sites. Example of the risk this removes:

```jsx
// current, /start — string concatenation for the disabled variant
className={`btn-secondary${canContinue ? '' : ' btn-disabled'}`}
```
A second page could write that condition wrong in a dozen subtly different ways. A component
makes it impossible to get wrong twice.

## Components to create

### `components/PrimaryButton.tsx`
```tsx
type PrimaryButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  href?: string;       // renders a Link instead of a button when present
};
```
Renders `<button className="btn-primary">` (or `<Link className="btn-primary">` when `href`
is passed). When `disabled`, add `btn-disabled` and (for `<button>`) the native `disabled`
attribute — both together, matching current behavior exactly.

### `components/SecondaryButton.tsx`
Same shape as `PrimaryButton` but for `.btn-secondary`. Also accept an optional `compact`
boolean prop that adds `btn-secondary-compact` (used today in `/account`, `/mentor`).

### `components/LinkButton.tsx`
Backs `.btn-link`. Props: `children`, `onClick`, `href`, and an `inline` boolean that adds
`btn-link-inline` (used today in `/account`, `/mentor`).

### `components/BackButton.tsx`
Backs `.btn-back`. Always renders the `IconArrowLeft` + label pattern seen in `/start` and
`/mentor` — take `onClick` and an optional `label` prop (default `"Back"`).

## Migration

Replace every call site using these classes across all pages (`app/**/page.tsx`,
`components/GatedState.tsx`) with the matching new component. Do this page-by-page, not all
at once — after each page, typecheck and visually spot-check that page before moving to the
next, same discipline as prior briefs. Suggested order: `/signup`, `/login` (simplest, fewest
call sites) → `/account` → `/start` (has the loading-text and disabled-class patterns called
out above — the two riskiest call sites) → `/path`, `/plan`, `/identity` → `/mentor` →
`GatedState.tsx`.

Preserve exact current behavior at every call site — this brief is a refactor, not a redesign.
If a call site does something the prop shapes above don't cover, stop and flag it rather than
guessing at a new prop.

## Stop conditions

- Do not touch `.btn-primary`, `.btn-secondary`, `.btn-link`, `.btn-back`, `.btn-disabled`,
  `.btn-secondary-compact`, `.btn-link-inline` in `globals.css` — components consume these
  classes as-is, no style changes.
- Do not touch `FlowContainer`/`Card`/`Eyebrow` — explicitly out of scope per the blueprint.
- Do not touch `.btn-cta` (homepage-specific anchor CTA) — different pattern, not part of this
  brief.
- Do not change any button's visible text, click behavior, or disabled condition — only how
  the markup is assembled.
- Typecheck (`npx tsc --noEmit`) clean after each page's migration, not just at the end.
- Visual spot-check each page after its migration (dev server + a quick look, or Playwright if
  a computed-style check is genuinely warranted — plain visual inspection is enough for a
  markup-only refactor with no CSS changes).
- Diff review before commit. One commit for the whole brief is fine if all pages are done in
  one session; otherwise commit per page with a note in the changelog on what's left.
