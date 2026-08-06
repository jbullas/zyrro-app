# Brief: #100 — Card consistency & documentation styling pass

**Ticket:** #100 (continuation of the 2026-08-06 restructure, same day). This
refines the visual/markup consistency of what #100 Stage 2 shipped, and
extends one principle site-wide: **every card, in every section and on
every page that uses `ConstellationCard`, should share the same base
styling.** Non-container tags (`<p>`, `<h3>`) should carry no bespoke class
unless they're a genuinely special block (a highlighted callout, a stat
chip, a pill) — plain text gets its styling from the global tag rule, not
a one-off class.

**Files:** `app/identity/page.tsx`, `app/globals.css`,
`components/ConstellationCard.tsx`, `components/PrimarySignatureBars.tsx`.

**Cross-page impact, read this first:** `ConstellationCard` is shared by
`/identity`, `/path`, and `/plan`. `.evidence-analysis` is used identically
for `option.body` on `/path` and `phase.body` on `/plan`, not just
`/identity`. Every change to `ConstellationCard.tsx` and to
`.evidence-analysis`/`.constellation-card`/`.constellation-sig-name` in
`globals.css` affects all three pages. This is intentional — the whole
point is site-wide card consistency — but it means **verification must
cover all three pages**, not just `/identity`.

## 1. `ConstellationCard.tsx` — title becomes a real `<h3>`, merge with `.card`

Current:
```tsx
<div className="constellation-card">
  <div className="constellation-card-header">
    <div className={muted ? 'constellation-badge-muted' : 'constellation-badge'}>{badge}</div>
    <div className="constellation-header-info">
      <div className="constellation-sig-name">{title}</div>
      <div className="constellation-sig-meta">{meta}</div>
    </div>
    {pill}
  </div>
  {children}
</div>
```

Target:
```tsx
<div className="card constellation-card">
  <div className="constellation-card-header">
    <div className={muted ? 'constellation-badge-muted' : 'constellation-badge'}>{badge}</div>
    <div className="constellation-header-info">
      <h3>{title}</h3>
      <div className="constellation-sig-meta">{meta}</div>
    </div>
    {pill}
  </div>
  <div className="constellation-card-body">
    {children}
  </div>
</div>
```

- `title` renders as a bare `<h3>`, no class. `.constellation-sig-name` CSS
  rule is deleted.
- Root div gets both `card` and `constellation-card` classes.
  `.constellation-card` and `.card` already share identical chrome
  (background/border-radius/border/box-shadow) — see CSS section below for
  the resulting delta rule.
- New `.constellation-card-body` wrapper around `children`, carrying the
  padding that individual children (`core-statement`, `evidence-analysis`,
  `tension-block`, `scoring-chips`) currently supply themselves. This is
  what lets those children's own padding/margin be simplified or removed
  in step 3 below without the content touching the card edges.

## 2. New CSS: `.card` + `.constellation-card` consolidation

```css
.constellation-card {
  overflow: hidden;
  padding: 0; /* override .card's 18px — header needs edge-to-edge border-bottom */
}
.constellation-card-body {
  padding: 18px; /* same value .card already uses, kept in sync deliberately */
}
```

Remove the old standalone `.constellation-card { background/border-radius/
border/box-shadow }` properties, since `.card` now supplies them via the
combined class.

## 3. Scoped `<h3>` sizing — do NOT touch the global `h3` rule

The global `h3 { font-size: 18px; font-weight: 600; }` rule is used
elsewhere outside reports (e.g. `IdentityCard.tsx`'s `.named-identity`
heading on the dashboard, which sets `text-transform: uppercase` only and
inherits font-size/weight from the bare `h3` rule). Changing the global
rule would shrink/rebold that heading too — out of scope, don't do it.

Instead, add a scoped rule:
```css
.card h3 {
  font-size: 15px;
  font-weight: 700;
}
```
This single selector covers Domain Profile's card, all five How You
Operate cards, and every `ConstellationCard` (since it now also carries
`.card`) — because they're all literally inside a `.card`-classed element.
Verify `IdentityCard.tsx`'s `.named-identity` heading is NOT itself inside
a `.card` div before assuming it's unaffected — check, don't assume.

## 4. `app/identity/page.tsx` — Domain Profile section

Remove the `<h3>Domain Profile</h3>` heading entirely — the `DOMAIN
PROFILE` eyebrow already labels it, the heading was redundant.

```tsx
<div className="report-section">
  <p className="eyebrow">DOMAIN PROFILE</p>
  <div className="card">
    <DomainRadarChart domainProfile={domain_profile} />
  </div>
  <p className="documentation">{DOMAIN_PROFILE_EXPLANATION}</p>
</div>
```
(`doc-text` → `documentation`, see section 8.)

## 5. `app/identity/page.tsx` — Primary Signatures section

- `PrimarySignatureBars` needs a new optional `showLabel` prop, default
  `true` (see section 7) — called with `showLabel={false}` here, since the
  `PRIMARY SIGNATURES` eyebrow already labels the section.
- Move the explanation paragraph to immediately after the bar chart card,
  before the mapped deep-dive cards (was: after all cards).
- Inside each card's `children`: `evidence-analysis` and `tension-text`
  become bare `<p>` (styling now flows from the `.constellation-card-body`
  wrapper + global `p` rule). `core-statement` and `.tension-block`'s
  wrapper stay classed — genuinely special highlight blocks.

```tsx
<div className="report-section">
  <p className="eyebrow">PRIMARY SIGNATURES</p>
  <div className="card">
    <PrimarySignatureBars signatures={primary_constellation} showLabel={false} />
  </div>
  <p className="documentation">{PRIMARY_SIGNATURES_EXPLANATION}</p>
  {primary_constellation.map((sig, i) => {
    const band = getScoreBand(sig.score);
    return (
      <ConstellationCard key={sig.name} badge={i + 1} title={sig.name}
        meta={`${sig.domain} · ${sig.score}/25`}
        pill={<span className={`score-band-pill ${bandClass(band)}`}>{band}</span>}>
        <p className="core-statement">{sig.core_statement}</p>
        <p>{sig.evidence_analysis}</p>
        <div className="tension-block">
          <span className="tension-label">TENSION</span>
          <p>{sig.tension}</p>
        </div>
        <div className="scoring-chips">{/* unchanged */}</div>
      </ConstellationCard>
    );
  })}
</div>
```

## 6. `app/identity/page.tsx` — Secondary Signatures section

Same two changes as Primary: explanation moves above the deep-dive cards
(after the bars card), `evidence-analysis` (here rendering `sig.analysis`)
becomes a bare `<p>`.

```tsx
{secondary_signature_analysis.length > 0 && (
  <div className="report-section">
    <p className="eyebrow">SECONDARY SIGNATURES</p>
    <p>{secondary_signature_summary}</p>
    <div className="card">{/* bars, unchanged */}</div>
    <p className="documentation">{SECONDARY_SIGNATURES_EXPLANATION}</p>
    {secondary_signature_analysis.map((sig, i) => (
      <ConstellationCard key={sig.name} badge={i + 6} muted title={sig.name}
        meta={`${sig.domain} · ${sig.score}`}>
        <p className="core-statement">{sig.core_statement}</p>
        <p>{sig.analysis}</p>
      </ConstellationCard>
    ))}
  </div>
)}
```

## 7. `components/PrimarySignatureBars.tsx` — new `showLabel` prop

```tsx
type PrimarySignatureBarsProps = {
  signatures: { name: string; domain: string; score: number }[];
  showLabel?: boolean; // default true — /identity passes false, the
                        // dashboard IdentityCard keeps its default
};

export default function PrimarySignatureBars({ signatures, showLabel = true }: PrimarySignatureBarsProps) {
  return (
    <>
      {showLabel && <p className="card-sub-label">Primary Signatures</p>}
      {/* rows, unchanged */}
    </>
  );
}
```
Verify `components/IdentityCard.tsx`'s existing call (no `showLabel`
argument) still renders the label — confirm, don't assume.

## 8. New `.documentation` scope, replaces `doc-label`/`doc-text` entirely

```css
/* Documentation text: smaller, avoid bold, lower contrast than main
   content — including its own headings, which use real h2/h3 tags, not
   a separate label class. */
.documentation {
  font-size: 13px;
  color: #6E6E6E;
  line-height: 1.6;
}
.documentation p {
  font-size: 13px;
  color: #6E6E6E;
  line-height: 1.6;
}
.documentation h2 {
  font-size: 16px;
  font-weight: 500;
  color: #6E6E6E;
  margin: 0 0 4px;
}
.documentation h3 {
  font-size: 13px;
  font-weight: 500;
  color: #6E6E6E;
  margin: 16px 0 4px;
}
.documentation em {
  font-style: italic;
}
```
Remove `.doc-label` and `.doc-text` entirely.

Update the 6 section-level explanation paragraphs (Domain Profile, Primary,
Secondary, How You Operate, Energisers, Friction Points) from
`className="doc-text"` to `className="documentation"`.

## 9. `app/identity/page.tsx` — How You Operate section

- `HOW_OPERATE_LABELS` values rewritten from ALL CAPS to natural case:
  `'Work Style'`, `'Thinking Style'`, `'Relationship Style'`,
  `'Decision Style'`, `'Stress Pattern'`.
- `operate-text` becomes a bare `<p>`.
- Explanation: `doc-text` → `documentation`.

```tsx
const HOW_OPERATE_LABELS: { key: keyof IdentityReport['how_you_operate']; label: string }[] = [
  { key: 'work_style',         label: 'Work Style' },
  { key: 'thinking_style',     label: 'Thinking Style' },
  { key: 'relationship_style', label: 'Relationship Style' },
  { key: 'decision_style',     label: 'Decision Style' },
  { key: 'stress_pattern',     label: 'Stress Pattern' },
];
```
```tsx
<div className="report-section">
  <p className="eyebrow">HOW YOU OPERATE</p>
  {HOW_OPERATE_LABELS.map(({ key, label }) => (
    <div key={key} className="card">
      <h3>{label}</h3>
      <p>{how_you_operate[key]}</p>
    </div>
  ))}
  <p className="documentation">{HOW_YOU_OPERATE_EXPLANATION}</p>
</div>
```

## 10. Energisers, Friction Points — explanation class only

`doc-text` → `documentation`. No other change.

## 11. Bottom documentation block — full rewrite

Current (inline style, `.report-section`, `doc-label`/`doc-text`, bold
titles + separate body paragraphs):
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

Target — new `.report-footer` wrapper (not `.report-section`), no inline
style, real heading hierarchy, research pillars collapsed to single
italicized-lead paragraphs:
```tsx
<div className="report-footer documentation">
  <h2>About This Report</h2>

  <h3>What this report is</h3>
  <p>{WHAT_THIS_REPORT_IS}</p>

  <h3>Research foundation</h3>
  {RESEARCH_PILLARS.map((pillar) => (
    <p key={pillar.title}><em>{pillar.title}.</em> {pillar.body}</p>
  ))}
</div>
```

```css
.report-footer {
  border-top: 0.5px solid rgba(0,0,0,0.07);
  margin-top: 12px;
  padding-top: 24px;
}
```

**Content rewrite required, not just markup** — per the em-dash removal
below, `WHAT_THIS_REPORT_IS` and the `RESEARCH_PILLARS` entries need
light rewording, not just punctuation swaps, to read naturally. This
means the "copied verbatim from #91" instruction from the original
restructure brief no longer fully holds for this content — that's a
deliberate, confirmed decision this time, not a slip.

Rewrite `RESEARCH_PILLARS` titles from em-dash format
(`"Narrative Identity Theory — McAdams (1993)"`) to a plain, comma-based
format suited to the new inline-italic treatment (e.g. `"Narrative
Identity Theory, McAdams (1993)"`), and remove the em dashes inside
`WHAT_THIS_REPORT_IS`'s body and the Flow Theory pillar's body,
rewording each sentence naturally rather than substituting punctuation.

## 12. Section spacing and dividers, all of `.report-sections`

```css
.report-sections {
  gap: 12px; /* down from 20px — most of the visual separation now comes
                from the divider + padding-top below, not raw gap */
}
.report-section + .report-section {
  border-top: 0.5px solid rgba(0,0,0,0.07);
  padding-top: 28px;
}
```
This gives every section after the first a hairline divider plus real
breathing room, reusing the same `0.5px rgba(0,0,0,0.07)` hairline value
already used in four other places on this page (kept consistent, not a
new value). The first section (Domain Profile) gets no divider, since
it directly follows Cover.

## 13. Em dash removal, site-wide within this scope

Every em dash in content touched by this brief is removed: the six
section explanations (already dash-free from the prior brief),
`WHAT_THIS_REPORT_IS`, and all four `RESEARCH_PILLARS` entries. Reword
naturally around the removal, don't just swap in a comma where an em dash
literally was, unless that reads naturally on its own merits.

## Stop conditions

- `app/identity/page.tsx`, `app/globals.css`,
  `components/ConstellationCard.tsx`, `components/PrimarySignatureBars.tsx`
  only.
- Do not touch the global bare `h3` selector — use `.card h3` scoping
  instead (section 3). Verify `IdentityCard.tsx`'s `.named-identity`
  heading is unaffected.
- Do not modify `ChipRow.tsx`, `DomainRadarChart.tsx`, `LimitsBlock.tsx`.
- Do not touch `.chip-tag`, `.chip-friction`, `.chip-energiser`, the
  Energisers/Friction Points sections' structure, or the Emerging/
  Suppressed/Domain-Profile-LLM-text exclusions from the prior brief —
  all still apply, unchanged.
- No inline `style={{ }}` attributes anywhere in this brief's scope.

## Verification (Definition of Done)

Live-verify against a real ready `identity_report`, **and** real (or
seeded) `path_options`/`path_plan` content on `/path` and `/plan`, since
`ConstellationCard` and `.evidence-analysis` changes affect all three:

- `/identity`: Domain Profile has no `<h3>`, all card headings (Domain
  Profile section's own missing one aside, How You Operate's 5, every
  signature title) render at 15px/700 via `.card h3`, not the old 18px/600
  global default.
- `/identity`: Primary/Secondary explanations render immediately after
  their bar charts, before the deep-dive cards, in `.documentation`
  styling (13px, muted, no bold headings inside).
- Zero `.doc-label`/`.doc-text`/`.constellation-sig-name`/`.operate-text`
  classes remain anywhere in the rendered DOM.
- Bottom block: renders as `.report-footer.documentation`, `<h2>About This
  Report</h2>` present, `<h3>` for the two sub-headings, research pillars
  render as single paragraphs with an italicized lead, zero em dashes in
  any documentation text, no inline `style` attribute on the container.
- `PrimarySignatureBars` on `/identity` renders without its label;
  `IdentityCard` on `/dashboard`, expanded, still renders its label.
- `/path` and `/plan`: `ConstellationCard`s render visually equivalent to
  before (same padding, same edge-to-edge header, title now an `<h3>` at
  the same 15px/700 it was styled at via `.constellation-sig-name`
  before) — confirm no unintended visual regression via screenshot
  comparison, not just DOM structure checks.
- Section dividers: hairline border appears between every pair of
  adjacent `.report-section`s, not before the first one.
- Zero console/page errors across all three pages.
- `npx tsc --noEmit` and `npm run build` both clean.
