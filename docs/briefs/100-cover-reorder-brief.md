# Brief: #100 Stage 2 — Cover section reorder (context line, date removal, Constellation Synthesis merge)

**Ticket:** #100 (Stage 2 addendum — not in the original Stage 2 scope note, which
listed only the unified chart/pill, Emerging/Suppressed cards, and the #102
shortened synthesis text render. This is a fourth Stage 2 item: Cover-only
JSX reorder, decided during the 2026-08-05 planning walkthrough.)

**File:** `app/identity/page.tsx` only. No other file should change.

## Scope

Pure JSX reorder/removal inside the Cover block. No data model changes,
no prompt changes, no new components, no CSS file edits.

### Current Cover markup (for reference)

```tsx
<div className="report-cover">
  <p className="eyebrow">Identity Signature Report</p>
  <IdentityBadge primarySignatureName={primary_constellation[0]?.name} />
  <h1>{nameLine1}<br/>{nameLine2}</h1>
  <p className="identity-thesis">{cover.identity_thesis}</p>
  <p className="cover-context-line">{cover.prepared_for} · {cover.identity_context}</p>
  <p className="prepared-for-line">{reportDate ? formatDate(reportDate) : ''}</p>
</div>

<div className="report-sections">
  <div className="report-section">
    <p className="eyebrow">CONSTELLATION SYNTHESIS</p>
    <div className="card">
      <h3 className="named-identity mb-12">{constellation_synthesis.named_identity}</h3>
      <p>{constellation_synthesis.synthesis}</p>
    </div>
  </div>
  ...
```

### Target Cover markup

```tsx
<div className="report-cover">
  <p className="eyebrow">Identity Signature Report</p>
  <IdentityBadge primarySignatureName={primary_constellation[0]?.name} />
  <h1>{nameLine1}<br/>{nameLine2}</h1>
  <p className="cover-context-line">{cover.prepared_for} · {cover.identity_context}</p>
  <p className="identity-thesis">{cover.identity_thesis}</p>
  <p>{constellation_synthesis.synthesis}</p>
</div>

<div className="report-sections">
  {/* Constellation Synthesis's .report-section block removed entirely — its
      only content (constellation_synthesis.synthesis) now renders as a plain
      <p> inside .report-cover, directly above. Everything else in
      .report-sections (Signature Profile onward) is unchanged. */}
  ...
```

### Specific changes

1. **Context line** (`cover.prepared_for · cover.identity_context`) moves from
   below the thesis to directly under the `<h1>` named-identity heading —
   i.e. it now comes *before* `identity-thesis`, not after.
2. **Date line** (`prepared-for-line` / `reportDate`/`formatDate`) is deleted
   outright, not relocated. If `reportDate` and/or `formatDate` become unused
   elsewhere in this file as a result, remove the now-dead
   variable/import/prop — but only if actually unused; check first, don't
   assume.
3. **Constellation Synthesis** moves into `.report-cover`, positioned
   immediately after `identity-thesis`. Its standalone `.report-section`
   wrapper in `.report-sections` is removed entirely — not left as an empty
   shell.
   - The `"CONSTELLATION SYNTHESIS"` eyebrow is dropped — not rendered
     anywhere.
   - The `<h3 className="named-identity mb-12">{constellation_synthesis.named_identity}</h3>`
     heading is dropped. `constellation_synthesis.named_identity` becomes
     unused in this file as a result — that's expected, not a bug to fix.
   - The `.card` wrapper div is removed. `constellation_synthesis.synthesis`
     renders as a bare `<p>` with no wrapping div and no `className`.

## Stop conditions

- Do not touch Signature Profile, Primary Signatures, Secondary Signatures,
  How You Operate, or What's Next — only the Cover block and the now-removed
  Constellation Synthesis `.report-section` are in scope.
- Do not edit any CSS file. If this reorder leaves a CSS rule (e.g. for
  `.card` in this context, or `.prepared-for-line`) fully orphaned
  repo-wide, flag it in the changelog rather than deleting it — CSS cleanup
  is explicitly Stage 3's job, not this ticket's.
- Do not change how `constellation_synthesis`, `cover`, or `reportDate` are
  fetched/queried/typed — this is a render-order change only.
- No new components, no prompt changes, no migration.

## Verification (Definition of Done)

Live-verify against a real ready `identity_report` (existing
`withVerificationSession` pattern is fine, no new generation needed — this
ticket makes no content changes). Confirm via a real page load:

- DOM order inside `.report-cover`: eyebrow → badge → `<h1>` → context line →
  identity thesis → constellation synthesis paragraph, in that order.
- No date text renders anywhere on the page.
- Constellation synthesis text renders as a plain `<p>`, not inside a `.card`
  div, with no eyebrow and no heading above it.
- `.report-sections`' first child is now Signature Profile (Constellation
  Synthesis's old `.report-section` is gone, not just emptied).
- Zero console/page errors.
- `npx tsc --noEmit` and `npm run build` both clean.
