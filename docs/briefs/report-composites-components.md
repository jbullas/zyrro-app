# Brief: Extract `ConstellationCard`, `ChipRow`, `LimitsBlock`

Fourth component extraction from the content-blocks blueprint — the narrowed report-composites
scope. `ReportShell`, `CoreStatement`, and `EvidenceBlock` were deliberately dropped from the
original 6-component plan: each is just a class on a div/paragraph with no per-instance logic,
same reasoning that dropped `FlowContainer`/`Card`/`Eyebrow` earlier. Use those classes directly.

## 1. `components/ConstellationCard.tsx`

Only the **header** is genuinely identical across all 4 call sites — body content diverges too
much (tension block + scoring grid on `/identity`'s primary signatures; a footer button on
`/path`; conditional milestones on `/plan`) to force into shared props. Body stays as
`children`.

```tsx
type ConstellationCardProps = {
  badge: React.ReactNode;    // the number/rank shown in the badge circle
  muted?: boolean;            // use constellation-badge-muted instead of constellation-badge
  title: string;
  meta: React.ReactNode;
  pill?: React.ReactNode;     // optional score-band/stretch pill — caller renders it fully
                                // (e.g. <span className={`score-band-pill ${bandClass(band)}`}>{band}</span>),
                                // this component just places it, doesn't compute its class
  children: React.ReactNode;  // body — varies per call site, not this component's concern
};
```

Renders:
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

### Migration — all 4 call sites (header only; body content stays as-is, just moved to children)

- **`/identity` primary signatures** (`badge={i + 1}`, no `muted`, `title={sig.name}`,
  `meta={`${sig.domain} · ${sig.score}/25`}`, `pill={<span className={`score-band-pill ${bandClass(band)}`}>{band}</span>}`).
  Body (core-statement, evidence-analysis, tension-block, scoring-chips) becomes `children`,
  unchanged.
- **`/identity` secondary signatures** (`badge={i + 6}`, `muted`, `title={sig.name}`,
  `meta={`${sig.domain} · ${sig.score}`}`, no `pill`). Body (core-statement, evidence-analysis)
  becomes `children`, unchanged.
- **`/path` options** (`badge={i + 1}`, no `muted`, `title={option.name}`, `meta={option.thesis}`,
  `pill={<span className={`score-band-pill ${stretchClass(option.stretch)}`}>{option.stretch}</span>}`).
  Body (evidence-analysis, the `.option-card-sigs` chip row, `.option-card-footer` button)
  becomes `children`, unchanged. This is the one call site with real interactivity in its
  body — do not move the button logic anywhere, it just moves inside `children` as-is.
- **`/plan` phases** (`badge={phase.phase_number}`, no `muted`, `title={phase.name}`,
  `meta={phase.estimated_duration}`, no `pill`). Body (core-statement, evidence-analysis,
  conditional milestones block, conditional chip row) becomes `children`, unchanged, including
  both `.length > 0` guards exactly as they are.

## 2. `components/ChipRow.tsx`

```tsx
type ChipRowProps = {
  items: string[];
  wrapperClassName: string;  // required, not defaulted — `.chips-wrap` and `.option-card-sigs`
                               // are genuinely different CSS (different padding/gap), don't
                               // silently pick one as a default for the other
};
```

Renders:
```tsx
<div className={wrapperClassName}>
  {items.map(item => <span key={item} className="chip-tag">{item}</span>)}
</div>
```

### Migration — all 4 call sites

- `/identity` section 8 and section 9 chip lists → `wrapperClassName="chips-wrap"`.
- `/path` options' `signatures_engaged` chip row → `wrapperClassName="option-card-sigs"`.
- `/plan` phases' `signatures_leaned_on` chip row (inside the `.length > 0` guard) →
  `wrapperClassName="option-card-sigs"`.

## 3. `components/LimitsBlock.tsx`

```tsx
type LimitsBlockProps = {
  eyebrow: string;
  heading?: string;         // /identity only — /plan has none
  body: React.ReactNode;
  bullets?: string[];        // /identity only — /plan has none
  cta: React.ReactNode;      // always a <Link className="btn-primary">
};
```

Renders:
```tsx
<div className="limits-block">
  <p className="limits-eyebrow">{eyebrow}</p>
  {heading && <h2 className="limits-heading">{heading}</h2>}
  <p className="limits-body">{body}</p>
  {bullets && (
    <ul className="limits-bullets">
      {bullets.map(b => <li key={b} className="limits-bullet">{b}</li>)}
    </ul>
  )}
  {cta}
</div>
```

### Migration — both call sites

- **`/identity`**: eyebrow "LIMITS OF THIS REPORT", heading present, body present, all 4
  bullets present (preserve exact text and apostrophes), `cta={<Link href="/path" className="btn-primary">See what your pattern is pointing toward →</Link>}`.
- **`/plan`**: eyebrow "NOW LET'S IMPLEMENT IT", no `heading`, `body={implement_bridge}`, no
  `bullets`, `cta={<Link href="/mentor" className="btn-primary">Open the Mentor →</Link>}`.

## Stop conditions

- Do not extract `ReportShell`, `CoreStatement`, or `EvidenceBlock` — explicitly out of scope,
  keep using `.report-scroll`/`.report-cover`/`.report-sections`/`.report-section`/
  `.core-statement`/`.evidence-analysis` as plain classes.
- Do not change any text, computed value, or conditional — this is a markup-only extraction.
- Do not touch `bandClass()`/`stretchClass()` or any other page-local helper function — they
  keep living in their pages, `ConstellationCard` just receives their output via `pill`.
- Do not touch `.constellation-card`/`.constellation-card-header`/`.constellation-badge`/
  `.constellation-badge-muted`/`.chips-wrap`/`.option-card-sigs`/`.chip-tag`/`.limits-block`
  (and siblings) CSS — components consume them as-is.
- Preserve `/path`'s button logic (`onClick`, `disabled`, the `selectingId` conditional label)
  exactly as `children` content — no changes to that logic.
- Preserve `/plan`'s two `.length > 0` conditional guards around milestones and the chip row
  exactly as they are.
- Typecheck clean after each page's migration, not just at the end.
- Visually verify: `/identity`'s report (both primary and secondary signature sections, and the
  limits block at the bottom), `/path`'s options (including that the "Select This Path" button
  still works — click it, don't just look at it), `/plan`'s phases (including a phase with zero
  milestones to confirm the conditional still hides that block) and its limits block.
- Diff review before commit. Changelog entry per `AGENTS.md`.
