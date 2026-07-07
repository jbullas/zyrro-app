# Brief: Extract `MessageState` component

Second component extraction from the content-blocks blueprint. Covers the eyebrow + heading +
body + single-CTA pattern currently hand-typed at 9 call sites across `/identity` (3), `/path`
(2), `/plan` (3), `/mentor` (1).

## Why this one (concrete proof, not just the general pattern)

`/path` has **two byte-identical copies of this block in the same file** — one guarded by
`startFailed`, one by `genPhase.phase === 'failed'`. That's real, present-tense duplication
risk, not a hypothetical: if someone updates the failed-state copy, they have to remember
there's a second one nearby to update too.

## Component: `components/MessageState.tsx`

```tsx
type MessageStateProps = {
  eyebrow: string;
  heading: string;
  headingLevel?: 'h1' | 'h2';  // default 'h2'
  body: React.ReactNode;
  cta?: React.ReactNode;       // usually a <PrimaryButton>/<LinkButton>, but any node —
                                // see the /mentor exception below
};
```

Renders:
```tsx
<div className="flow-container gated-container">
  <p className="eyebrow">{eyebrow}</p>
  {headingLevel === 'h1' ? <h1>{heading}</h1> : <h2>{heading}</h2>}
  <p>{body}</p>
  {cta}
</div>
```

`headingLevel` exists because it's a real, intentional distinction, not an oversight:
`/identity`'s anonymous and no-questionnaire states use `<h1>` (legitimate page-level heading
when there's nothing else on the page), everything else uses `<h2>` (a failed/empty state
nested within an otherwise-contentful page). Preserve this exactly — do not flatten to one level.

## Migration — all 9 call sites

| Page | State | Heading | CTA |
|---|---|---|---|
| `/identity` | anonymous | h1 "Your Identity Signature Report is waiting." | `<PrimaryButton href="/start">` |
| `/identity` | no-questionnaire | h1 "Your report isn't ready yet." | `<PrimaryButton href="/start">` |
| `/identity` | failed | h2 "Something went wrong." | `<PrimaryButton onClick={handleRetry}>` |
| `/path` | startFailed | h2 "Something went wrong." | `<PrimaryButton onClick={handleRetry}>` |
| `/path` | genPhase failed | h2 "Something went wrong." | `<PrimaryButton onClick={handleRetry}>` |
| `/plan` | unpaid | h2 "Your Plan is waiting on the other side of Path." | `<PrimaryButton href="/path">` |
| `/plan` | no-selection | h2 "Choose your path first." | `<PrimaryButton href="/path">` |
| `/plan` | failed | h2 "Something went wrong." | `<PrimaryButton onClick={handleRetry} disabled={retrying}>{retrying ? 'Retrying…' : 'Try again'}</PrimaryButton>` |
| `/mentor` | subscription placeholder | h1 "Your plan is the map..." | **Exception — see below** |

For every row except `/mentor`, replace the whole `<div className="flow-container
gated-container">...</div>` block with `<MessageState eyebrow=... heading=... cta={<PrimaryButton ...>...}>{body text}</MessageState>`.

### `/mentor` exception

The CTA here is the same known exception from the button-family brief (`aria-disabled="true"`,
no `onClick`, marked `TODO Brief B` — doesn't fit `PrimaryButton`). Still use `MessageState` for
the eyebrow/heading/body shell (it removes real duplication of that wrapper too), but pass the
existing hand-typed button as-is via the `cta` prop — `cta` accepts any `React.ReactNode`,
so this doesn't require extending anything. Do not change that button's markup or behavior.

Leave the `{/* DEV ONLY — remove before go-live */}` grant button that follows immediately
after in `/mentor` completely untouched — it's outside `.gated-container` and not part of
this pattern.

## Stop conditions

- Do not change any heading level, eyebrow text, body copy, or button label — text and
  semantics must match exactly.
- Do not touch `.gated-container`/`.flow-container` CSS — component consumes them as-is.
- Preserve `/plan`'s `retrying` disabled-state text-swap exactly as it is today.
- Do not migrate `/mentor`'s exception CTA into `PrimaryButton` — pass it through as `cta`
  unchanged, per the button-family brief's prior decision.
- Typecheck clean after each page's migration, not just at the end.
- Visually verify all 9 states — reuse the saved Playwright `storageState` pattern from the
  button-family session where an authenticated session is needed (`/plan`'s unpaid/no-selection,
  `/mentor`'s placeholder); logged-out/no-artifact states can use a plain unauthenticated visit.
- Diff review before commit. Changelog entry per `AGENTS.md`.
