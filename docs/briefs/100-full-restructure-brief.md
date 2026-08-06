# Brief: #100 Stage 2 (re-scoped 2026-08-05) — /identity full section restructure

**Ticket:** #100. Supersedes the "unified all-tier chart + tier pill" plan
entirely — see #100's revised Description on the board. Emerging/Suppressed
signatures are explicitly out of scope (tracked separately as #104). The
Domain Profile LLM-generated narrative text is explicitly out of scope
(tracked separately as #103) — this brief only builds the chart + fixed
explanation for that section.

**Primary file:** `app/identity/page.tsx`. Supporting: `app/globals.css`
(new classes/tokens), `components/ChipRow.tsx` is NOT modified (already
supports `itemClassName` override, just needs a new class value passed in).

**Reference:** `docs/content/100-fixed-copy-final.md` (save the copy
provided separately alongside this brief) — the exact wording for all six
new documentation paragraphs, plus the bottom-of-page content already
preserved in `docs/content/identity-static-content-for-91.md`
(`WHAT_THIS_REPORT_IS`, `RESEARCH_PILLARS`).

## Governing visual rule

**Card = main content. No card + smaller text = documentation.** Every
piece of new fixed/explanatory copy in this brief renders as a plain
paragraph with the new documentation class, never inside a `.card` div,
never inside a `ConstellationCard`.

## New CSS (add to `app/globals.css`)

```css
/* Documentation-style text — replaces the old .research-* classes,
   which are removed as part of this brief (their only consumer, the old
   Research Foundation section, was removed in #100 Stage 1). */
.doc-label {
  font-size: 14px;
  font-weight: 700;
  color: #1E1E1E;
  margin: 0 0 6px;
}
.doc-text {
  font-size: 14px;
  color: #6E6E6E;
  line-height: 1.6;
}

/* Semantic color tokens */
:root {
  --color-success: #1E8E5A;
  --color-failure: #D8483B;
}

/* Energisers — NEW class, do not reuse .chip-tag (shared with /path
   and /plan's signature chips — recoloring it would affect those pages
   too). */
.chip-energiser {
  padding: 6px 12px;
  background: rgba(30,142,90,0.10);
  border: 0.5px solid rgba(30,142,90,0.30);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: #155E3B;
}

/* Friction Points — existing .chip-friction rule, recolor from
   accent-orange to --color-failure red (real visual change, confirmed). */
.chip-friction {
  padding: 6px 12px;
  background: rgba(216,72,59,0.08);
  border: 0.5px solid rgba(216,72,59,0.28);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: #8C2F26;
}
```

Remove the old `.research-row` / `.research-title` / `.research-body`
rules entirely — replaced by `.doc-label` / `.doc-text` above, and
currently unused dead CSS since Stage 1 removed their only consumer.

## Target section-by-section structure

Replace everything from the Signature Profile section through the end of
`.report-sections` (i.e. everything currently between Cover and What's
Next) with the following, in this order:

### 1. Domain Profile (new top-level section)

```tsx
<div className="report-section">
  <p className="eyebrow">DOMAIN PROFILE</p>
  <div className="card">
    <h3>Domain Profile</h3>
    <DomainRadarChart domainProfile={domain_profile} />
  </div>
  <p className="doc-text">{DOMAIN_PROFILE_EXPLANATION}</p>
</div>
```

- Renamed from "Identity Profile" to "Domain Profile", both the eyebrow
  and the heading. The heading changes from `card-sub-label` (a `<p>`) to
  a real `<h3>`.
- No LLM-generated narrative paragraph here, out of scope, see #103.
- `DOMAIN_PROFILE_EXPLANATION` is a new constant holding copy piece #1
  from `docs/content/100-fixed-copy-final.md`. Plain `<p className="doc-text">`,
  no card, positioned after the card.

### 2. Primary Signatures (merges the old bar-chart card + deep-dive cards)

```tsx
<div className="report-section">
  <p className="eyebrow">PRIMARY SIGNATURES</p>
  <div className="card">
    <PrimarySignatureBars signatures={primary_constellation} />
  </div>
  {primary_constellation.map((sig, i) => (
    <ConstellationCard key={sig.name} badge={i + 1} title={sig.name}
      meta={`${sig.domain} · ${sig.score}/25`}
      pill={<span className={`score-band-pill ${bandClass(getScoreBand(sig.score))}`}>{getScoreBand(sig.score)}</span>}>
      {/* core_statement, evidence_analysis, tension-block, scoring-chips — unchanged from current code */}
    </ConstellationCard>
  ))}
  <p className="doc-text">{PRIMARY_SIGNATURES_EXPLANATION}</p>
</div>
```

- `PrimarySignatureBars` renders numbered (no `numbered={false}` — the
  earlier bar-chart merge/revert this session settled that Primary stays
  numbered).
- Deep-dive card bodies (core statement, evidence analysis, tension block,
  scoring chips) are unchanged from the current `PRIMARY SIGNATURES`
  section, only the container/position changes, not the card contents.
- `PRIMARY_SIGNATURES_EXPLANATION` = copy piece #2, plain `<p className="doc-text">`
  after all the cards, no card wrapper.

### 3. Secondary Signatures (only when non-empty, same treatment)

```tsx
{secondary_signature_analysis.length > 0 && (
  <div className="report-section">
    <p className="eyebrow">SECONDARY SIGNATURES</p>
    <p>{secondary_signature_summary}</p>
    <div className="card">
      {/* Secondary's existing inline bar rows — .sig-num-circle-muted,
          .sig-bar-fill-muted, etc. — unchanged, wrapped in one card. */}
    </div>
    {secondary_signature_analysis.map((sig) => (
      <ConstellationCard key={sig.name} muted title={sig.name}
        meta={`${sig.domain} · ${sig.score}`}>
        {/* core_statement, analysis — unchanged from current code */}
      </ConstellationCard>
    ))}
    <p className="doc-text">{SECONDARY_SIGNATURES_EXPLANATION}</p>
  </div>
)}
```

- `secondary_signature_summary` text: keep it, positioned immediately
  after the eyebrow, before the bar card (matches its current position
  relative to the deep-dive cards today, don't relocate it relative to
  the new explanation text).
- `SECONDARY_SIGNATURES_EXPLANATION` = copy piece #3.
- Whole section (bars + cards + explanation) only renders when
  `secondary_signature_analysis.length > 0`, matches existing behavior,
  now gating a full section instead of just the bar sub-block.

### 4. Emerging Signatures, Suppressed Signatures, NOT built

Explicitly excluded. Do not add sections, do not add cross-referencing
logic against `raw_signature_analysis`. Tracked as #104.

### 5. How You Operate

```tsx
<div className="report-section">
  <p className="eyebrow">HOW YOU OPERATE</p>
  {HOW_OPERATE_LABELS.map(({ key, label }) => (
    <div key={key} className="card">
      <h3>{label}</h3>
      <p className="operate-text">{how_you_operate[key]}</p>
    </div>
  ))}
  <p className="doc-text">{HOW_YOU_OPERATE_EXPLANATION}</p>
</div>
```

- Five separate `.card` divs (was one shared card wrapping an
  `.operate-section` per field), each gets its own card, `<h3>` instead
  of the current `eyebrow` `<p>` for the label.
- `HOW_OPERATE_LABELS` array stays as-is (already has the right
  key/label pairs), just change how each entry renders.
- `HOW_YOU_OPERATE_EXPLANATION` = copy piece #4, one instance for the
  whole section, after all five cards, no card wrapper.

### 6. Energisers (standalone top-level section again)

```tsx
<div className="report-section">
  <p className="eyebrow">ENERGISERS</p>
  <ChipRow items={energisers} wrapperClassName="chips-wrap" itemClassName="chip-energiser" />
  <p className="doc-text">{ENERGISERS_EXPLANATION}</p>
</div>
```

- Reverses the 2026-08-04 Stage 1 fold-in, back to a standalone
  `.report-section`, not nested under How You Operate.
- New `itemClassName="chip-energiser"` — a dedicated class, not the
  shared default `.chip-tag`.
- `ENERGISERS_EXPLANATION` = copy piece #5.

### 7. Friction Points (standalone top-level section again)

```tsx
<div className="report-section">
  <p className="eyebrow">FRICTION POINTS</p>
  <ChipRow items={friction_points} wrapperClassName="chips-wrap" itemClassName="chip-friction" />
  <p className="doc-text">{FRICTION_POINTS_EXPLANATION}</p>
</div>
```

- Same reversal as Energisers. `itemClassName="chip-friction"` unchanged
  (already correct today), only the CSS rule's colors change (see CSS
  section above), not this call site.
- `FRICTION_POINTS_EXPLANATION` = copy piece #6.

### 8. What's Next — untouched

The existing `#98` CTA/reveal block (`LimitsBlock` pre-click,
spinner/come-back-later/failed/reframe-revealed states) stays exactly as
it is today, same position, same internal logic. Do not alter this
section's structure, content, or conditions.

### 9. Bottom documentation (new, after What's Next)

```tsx
<div className="report-section" style={{ borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
  <p className="doc-label">What this report is</p>
  <p className="doc-text">{WHAT_THIS_REPORT_IS}</p>

  <p className="doc-label">Research foundation</p>
  {RESEARCH_PILLARS.map((pillar) => (
    <div key={pillar.title}>
      <p className="doc-label">{pillar.title}</p>
      <p className="doc-text">{pillar.body}</p>
    </div>
  ))}
</div>
```

- Placed after the entire What's Next block (both its pre-click and
  post-click states are one section, do not insert this in between them).
- Divider style: check `globals.css` for an existing hairline-divider
  pattern (e.g. the same `0.5px rgba(0,0,0,0.07)` style used elsewhere)
  and reuse it rather than inventing a new one, the value above is a
  placeholder if nothing existing fits.
- `WHAT_THIS_REPORT_IS` and `RESEARCH_PILLARS` constants: copy from
  `docs/content/identity-static-content-for-91.md` into `page.tsx`
  verbatim, unchanged content. This resolves `#91`'s placement question.
- No cards anywhere in this block, `.doc-label`/`.doc-text` only, per the
  governing visual rule.
- Once this content is consumed here, flag in the changelog that
  `docs/content/identity-static-content-for-91.md` is now safe to delete,
  confirm with Miroslav before deleting rather than assuming.

## Dead code removal

- `SCORING_EXPLANATION` constant and its render call: removed entirely
  (superseded by copy pieces #2/#3, split across the Primary/Secondary
  sections instead of shown once).
- `TOC_ITEMS`: already removed in Stage 1, not touched here, just
  confirming no TOC-related code should be resurrected by this brief.

## Stop conditions

- `app/identity/page.tsx` and `app/globals.css` only, plus flagging (not
  necessarily deleting without confirmation) `docs/content/identity-static-content-for-91.md`
  once its content is consumed.
- Do not modify `components/ChipRow.tsx`, `components/ConstellationCard.tsx`,
  `components/PrimarySignatureBars.tsx`, or `components/DomainRadarChart.tsx`,
  all existing props already support what this brief needs.
- Do not touch `.chip-tag`, shared with `/path` and `/plan`.
- Do not build Emerging/Suppressed sections or any cross-referencing logic
  against `raw_signature_analysis` for them.
- Do not add the Domain Profile LLM narrative text or any placeholder for
  it, that field doesn't exist in the schema yet (#103).
- Do not alter the What's Next (`#98`) section's internal logic or states.
- No card wrapper on any `.doc-label`/`.doc-text` content, anywhere.

## Verification (Definition of Done)

Live-verify against a real ready `identity_report` (existing
`withVerificationSession` pattern), covering:

- Section order top to bottom: Cover, Domain Profile, Primary Signatures,
  Secondary Signatures (only if non-empty, test both cases), How You
  Operate (5 separate cards), Energisers, Friction Points, What's Next,
  bottom documentation.
- Domain Profile: heading reads "Domain Profile" not "Identity Profile",
  chart renders, explanation text present with `.doc-text` class, no card
  wrapping the explanation.
- Primary Signatures: bar chart card + all deep-dive cards + explanation,
  all under one `PRIMARY SIGNATURES` eyebrow, no separate `SIGNATURE
  PROFILE` eyebrow remaining anywhere.
- Secondary Signatures empty case: confirm the entire section (eyebrow,
  cards, explanation) is absent, not just the cards.
- How You Operate: 5 distinct `.card` elements, each with an `<h3>`, one
  shared explanation after all 5, not per-card.
- Energisers pills use `.chip-energiser` (green, `--color-success`),
  confirm `/path` and `/plan`'s own chip rows are visually unaffected
  (still grey `.chip-tag`).
- Friction Points pills now render in `--color-failure` red, not the old
  accent-orange.
- No Emerging/Suppressed content anywhere.
- No Domain Profile narrative paragraph beyond the fixed explanation.
- Bottom documentation: renders after What's Next's CTA/reveal block
  (test both pre-click and post-click states still render normally above
  it), no cards, `.doc-label`/`.doc-text` styling, divider present.
- Zero console/page errors.
- `npx tsc --noEmit` and `npm run build` both clean.
