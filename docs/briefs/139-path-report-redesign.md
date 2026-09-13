# #139 — "Your Path" report: full content-design rebuild

Full redesign of the final `/path` report, replacing the current thin, task-list-shaped
version with a structure built specifically to avoid genericness, overlap between
sections, and false claims of researched fact. This brief is the product of an extended
design conversation — every structural choice below has a stated reason; don't
second-guess the shape, but the actual prose/prompt wording is yours to write well.

## Confirmed: `honest_cost` is cut

The current report has an `honest_cost` section (a real, specific demand the path
makes). It is NOT part of the redesigned structure below — confirmed cut, not an
oversight. Remove it from schema, prompt, and render entirely. Its job (naming a real
trade-off) is absorbed into "Life It Leads To"'s friction-points-as-trade-offs framing.

## Final report structure

1. **Hero** (includes Summary)
2. **What This Could Be**
3. **Why It Fits**
4. **Life It Leads To**
5. **How You Get There — Strategic Decisions**
6. **CTA**

## 1. Hero (includes Summary)

- Eyebrow: "Your Path" (unchanged)
- H1: `chosen_candidate.name` — always, no fallback logic needed elsewhere
- Thesis line: `chosen_candidate.core_statement` — **carried over from the Options
  candidate the user picked, NOT regenerated.** The current schema doesn't carry
  `core_statement` this far — `buildGenerationContext` in
  `app/api/path-report/route.ts` currently extracts only `{ name, description }` from
  the chosen candidate (`optionsContent.candidates.find(...)`), discarding
  `core_statement`. Add it to both `PathReportGenerationContext.chosen_candidate` and
  the final `PathReportContent.chosen_candidate` shape (see Schema below). The
  `thesis` field is REMOVED from `PathReportDraft` entirely — it's no longer generated
  by this prompt at all, just carried through.
- **Summary paragraph** — folded into the Hero/cover section itself, not a separate
  card below it. There's precedent for a full paragraph living inside a cover section:
  `OptionsFlow.tsx`'s own cover already renders `OPTIONS_INTRO` (a full paragraph)
  styled via the existing `identity-thesis` class — reuse that same treatment here for
  consistency rather than inventing new cover styling. Content requirements unchanged
  from the original "Summary" spec: strictly concrete, present-tense only, grounded
  in `chosen_candidate.description`, developed further not just restated. Hard
  boundary: never speculate about future scale, reputation, or trajectory — that's
  section 2's job entirely. If a draft does this, it's a violation to catch and
  rewrite.

## 2. What This Could Be

New section. Narrative, exploratory prose — genuinely open on anything the user hasn't
told us (solo vs. team vs. multi-location/multi-context; which concrete form this takes
if there's more than one honest possibility). Explicit hard boundary, the mirror image
of section 2's: **never re-describe what the work concretely involves** — that's
already been said in "Summary"; restating it here is the violation to catch. This
section is specifically about trajectory and identity/reputation over time, not the
day-to-day activity.

## 3. Why It Fits

Unchanged in substance from today's version — two distinct threads (capability from
`primary_constellation`, desire from `must_haves`/`ideal_life`), explicit named overlap.
Render as two paragraphs instead of one flowing block (capability paragraph, then
desire+overlap paragraph) — a rendering change in `PathReportFlow.tsx`, not a content
change.

## 4. Life It Leads To

Content requirement expanded — needs real data not currently passed into generation.
One flowing paragraph covering, in order: the picture (built from `ideal_life`, same
no-echo rule as today), how the energisers show up (prioritized to `must_haves`), how
the friction points get minimized or surface as honest trade-offs (prioritized to
`must_avoids`). **`energisers` and `friction_points` are not currently in
`PathReportGenerationContext` at all** — they exist on `identityReport` already loaded
in the route; add both to the context type and to `buildGenerationContext`'s return
value.

## 5. How You Get There — Strategic Decisions

Replaces `master_strategy` entirely. This is the section that most needed to change —
the original ticket's complaint ("it's a task list, not a strategy," inconsistent
per-step timeframes) is fixed structurally here, not by prompt language alone: **a list
of open decisions has no inherent sequence, so there's no cross-item chronology to get
wrong.**

Each entry in the list:
- `decision` — name of a real open decision this specific path actually has.
- `why_it_matters` — why this needs resolving, tied to something concrete about this
  path (not a generic "this is important" line).
- `live_options` — 2-4 short, concrete, real directions for this decision — genuinely
  live options, not a forced single answer, not a fake-balanced "on one hand / other
  hand" pair.

**Critical instruction for the prompt — no fixed template of decision types.** Do NOT
hard-code "Positioning" and "UVP" as required entries. Some paths are venture-shaped
(building something, competing for customers/employers/attention) and will naturally
surface positioning- and differentiation-shaped decisions; others are not
venture-shaped at all (a role, a practice, a pursuit with no market) and those
decision-types simply won't apply — other real decisions take their place instead
(e.g. how much time this realistically gets, who else needs to be involved, whether
this happens alongside something else). The model generates whatever decisions are
real for *this* path — don't force a shape onto a path that doesn't have it. This
deliberately avoids a separate "classify the path's shape first" step — the range of
possible decision-types just naturally includes some that are moot for a given path.

If more than one plausible venture shape exists (e.g. this could become a service, a
product, or something else) and the user hasn't indicated a preference, that itself
becomes one of the strategic decisions — "which shape this actually takes" — with the
different plausible shapes as its `live_options`, rather than the report picking one.

**First moves.** Fold near-term, non-committal first moves into the `live_options` of
relevant decisions where the natural next step IS resolving that decision (e.g. a
decision about market fit might have "talk to 3-5 people already doing this" as one of
its live options) — don't add a separate "First Objectives" section; it collapsed into
this structure naturally once decisions replaced a fixed sequence. This is what still
bridges into the Mentor CTA — "here's what you'd actually go find out first" — without
being a committed plan (that's `/plan`'s job, unchanged, out of scope here).

**No web search, no research claims.** Nothing in this section should read as
researched fact about a real market, competitor, or industry — the model has not
looked anything up. Frame everything as directions worth the user's own investigation,
never as confirmed findings. This is a hard content rule, not a suggestion — treat
false-confidence claims about the outside world the same severity as a must-avoid
violation.

Render: one card per decision, reusing `ConstellationCard` (badge = number, title =
`decision`), body containing `why_it_matters` and `live_options` (a `ChipRow` or short
bulleted list — Claude Code's call on which reads better for 2-4 short phrases).

## 6. CTA

Same shape as today (name the project, Mentor pitch) — no content changes needed here
beyond whatever copy tweaks naturally follow from the rest of the redesign.

## Schema changes (`lib/generate-path-report.ts`)

```ts
interface StrategicDecision {
  decision: string;
  why_it_matters: string;
  live_options: string[];
}

interface PathReportDraft {
  summary: string;
  what_this_could_be: string;
  why_it_fits: string;
  life_it_leads_toward: string;
  strategic_decisions: StrategicDecision[];
}

interface PathReportGenerationContext {
  chosen_candidate: { name: string; description: string; core_statement: string };
  comments: string;
  must_haves: string[];
  must_avoids: string[];
  ideal_life: string;
  primary_constellation: PrimarySignatureAnalysis[];
  energisers: string[];
  friction_points: string[];
}

interface PathReportContent extends PathReportDraft {
  chosen_candidate: { id: string; name: string; description: string; core_statement: string };
  comments: string;
  project_name?: string | null;
}
```

`thesis` is removed from the draft entirely (see Hero, above). `master_strategy` is
removed, replaced by `strategic_decisions`.

## Route changes (`app/api/path-report/route.ts`)

- `buildGenerationContext`: extract `core_statement` from the chosen candidate
  (currently only `name`/`description` are pulled) and add `energisers`/
  `friction_points` from the already-loaded `identityReport`.
- `runGeneration`: thread `core_statement` through into the final `chosen_candidate`
  object attached to `content`, same as `name`/`description` today.

## Validation / must-avoid checks

- Existing `findMustAvoidViolations` reuse: scan every text field including each
  `strategic_decisions[].decision`/`why_it_matters`/`live_options[]` entry, same
  severity as today's fields.
- New self-checks (log-only or hard-fail, your call per severity):
  - "Summary" contains no future-trajectory/scale language (violation of its own
    stated boundary).
  - "What This Could Be" doesn't restate the concrete work already covered in
    "Summary."
  - No sentence in "Strategic Decisions" makes a confident factual claim about a real
    market/competitor/industry — everything reads as a direction to investigate.

## PathReportFlow.tsx render changes

**Reuse existing markup wherever the section already exists — don't rebuild from
scratch.** "Why It Fits" and "Life It Leads To" already have working card markup in
this file today; keep that structure (eyebrow + documentation line + card) and only
change the content/copy feeding into it. "What This Could Be" is new, but should copy
the exact same card pattern as its neighbors rather than inventing a different visual
treatment. "Strategic Decisions" reuses `ConstellationCard` exactly as `master_strategy`
does today (badge/title/body) — same component, just fed different props
(`decision`/`why_it_matters`/`live_options` instead of `name`/`sequencing_rationale`).
The dialog markup and CTA block are structurally untouched.

- Hero cover: `thesis` prop source changes to `content.chosen_candidate.core_statement`;
  add the Summary paragraph into the cover markup itself, styled via the existing
  `identity-thesis` class (see `OptionsFlow.tsx`'s `OPTIONS_INTRO` for the precedent) —
  not a new card, not a new section below the cover.
- New "What This Could Be" section, same card pattern as "Why It Fits"/"Life It Leads
  To."
- "Why It Fits" card renders two paragraphs instead of one (same card, two `<p>`s).
- `master_strategy.map(...)` block's `ConstellationCard` reused as-is for
  `strategic_decisions.map(...)` — swap props, keep the component and its surrounding
  section markup.
- Remove `honest_cost` section from render entirely.

## Verification required

- Real generation run against a live test persona (or several — this content needs
  human judgment on tone/substance, a single run isn't enough to trust). Check
  specifically: no overlap between "Summary"/"What This Could Be", no confident
  claims-about-the-world language in Strategic Decisions, `live_options` reads as
  genuinely open (not a fake-balanced pair, not a forced single answer dressed up as
  options).
- Full/expanded terminal output for any test run.
- `tsc` clean project-wide.
