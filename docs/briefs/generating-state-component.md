# Brief: Extract `GeneratingState` component

Third component extraction from the content-blocks blueprint. Covers the spinner/heading/
description pattern currently hand-typed at 10 call sites: `/identity` (3), `/path` (4),
`/plan` (3).

## Component: `components/GeneratingState.tsx`

```tsx
type GeneratingStateProps = {
  spinner?: boolean;             // default true
  heading?: string;               // omit entirely if no heading for this state
  description?: React.ReactNode;  // omit entirely if no description for this state
};
```

Renders:
```tsx
<div className="flow-container generating-container">
  {spinner !== false && <div className="spin spinner" />}
  <div className="text-center-col">
    {heading && <h2>{heading}</h2>}
    {description && <p className="generating-desc">{description}</p>}
  </div>
</div>
```

## Migration — all 10 call sites

Each page has the same `genPhase.phase` pattern (`'idle'` / `'spinner'` / `'come-back-later'`)
from the shared `useGenerationStatus` hook, plus `/path` has one additional page-level
loading/verifying state. Preserve every string and every conditional exactly.

| Page | State | heading | description | spinner |
|---|---|---|---|---|
| `/identity` | `genPhase.phase === 'idle'` | "Your Identity Signature Report is being prepared." | "This usually takes about a minute." | yes |
| `/identity` | `genPhase.phase === 'spinner'` | same heading | `{genPhase.variant === 'early' ? 'This usually takes about a minute.' : 'Still working — this is taking a little longer than usual…'}` | yes |
| `/identity` | `genPhase.phase === 'come-back-later'` | *(none)* | "Your report is still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It'll be here when it's ready." | no |
| `/path` | `pageState === 'loading' \|\| 'verifying'` | `{pageState === 'verifying' && 'Confirming your payment…'}` (conditional — pass as `heading={pageState === 'verifying' ? 'Confirming your payment…' : undefined}`) | *(none)* | yes |
| `/path` | `genPhase.phase === 'idle'` | "Your Path Options are being prepared." | "This usually takes about a minute." | yes |
| `/path` | `genPhase.phase === 'spinner'` | same heading | same early/late ternary as identity, text says "Path Options" — reuse `/identity`'s exact ternary pattern | yes |
| `/path` | `genPhase.phase === 'come-back-later'` | *(none)* | "Your Path Options are still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It'll be here when it's ready." | no |
| `/plan` | `genPhase.phase === 'idle'` | "Your Plan is being prepared." | "This usually takes about a minute." | yes |
| `/plan` | `genPhase.phase === 'spinner'` | same heading | same early/late ternary, text says "taking a little longer than usual…" | yes |
| `/plan` | `genPhase.phase === 'come-back-later'` | *(none)* | "Your plan is still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It'll be here when it's ready." | no |

Note on `/path`'s loading/verifying state: the original renders an *empty* `.text-center-col`
when `pageState === 'loading'` (not `'verifying'`) — no heading, no description, just the
spinner. `heading={undefined}` naturally produces this since the conditional `{heading && ...}`
renders nothing. Confirm this empty-state case specifically during verification, not just the
`'verifying'` case with visible text.

Do **not** touch the `genPhase.phase === 'idle'` vs `'spinner'`+`'early'` redundancy (they
render identical content today) — that's hook logic, not markup, and out of scope for a
component extraction. Flag it in the changelog as a possible future simplification, don't fix
it here.

## Stop conditions

- Do not change any heading text, description text, or the early/late ternary conditions —
  preserve exactly, including the `come-back-later` states' apostrophes (`It'll`, `it's`).
- Do not touch `.generating-container`, `.spin`, `.spinner`, `.text-center-col`,
  `.generating-desc` CSS — component consumes them as-is.
- Do not touch the `useGenerationStatus` hook itself or `genPhase` logic — markup-only change.
- Typecheck clean after each page's migration, not just at the end.
- Visually verify all 10 states. Several require the same seeded-artifact-status pattern used
  in the `MessageState` session (`status: 'generating'` or equivalent for `idle`/`spinner`
  phases — check `lib/generation-status.ts` for the exact status values the hook expects rather
  than guessing). `/path`'s loading vs. verifying distinction needs both the empty-heading and
  visible-heading cases checked separately.
- Diff review before commit. Changelog entry per `AGENTS.md`, including a note on the
  `idle`/`spinner`-early redundancy for future consideration (not fixed in this brief).
