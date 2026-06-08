# Brief — docs/ reorganisation

**For:** Claude Code (executes Part 1)
**Status:** Part 1 ready to execute. Part 2 is a write-up only — do **not** execute Part 2 here.

## Goal

One home per fact. Each doc has a single responsibility, no internal
contradictions, nothing defined in two places. Code owns volatile facts (routes,
structure, build status, model, schema, design literals); docs reference them,
never restate.

## Hard constraints

- **Targeted edits only.** No wholesale rewrites. Touch the lines that are wrong
  or duplicated; leave the rest.
- **Part 1 is docs-prose only. Do NOT modify any code** (no `app/`, `lib/`,
  `components/`, `globals.css`, migrations). All code changes are written up in
  Part 2 for a later, separate task.
- **Changelogs are append-only history. Do not edit `docs/changelogs/`.** Log this
  reorg in the normal `session end` changelog entry, not by rewriting old ones.
- Where a fact is genuinely ambiguous, **flag it (see "Confirm before
  finalising") — do not guess.**

## Single-source map (the target)

| Thing | Owner | Everyone else |
|---|---|---|
| 25-signature taxonomy (names + meaning) | `docs/framework/zyrro_detection_engine_spec_v_1.md` | reference it; never re-list |
| Shipped Identity Report structure | `docs/standards/identity-signature-report.md` | `report_blueprint` keeps method only |
| Report length / word-count numbers | the prompt (`lib/prompts/*`) | docs describe section *shape*, no numbers |
| Routes | `app/` | docs reference, never enumerate as source |
| Design literals (gradient, hex, type scale, spacing, radius) | `globals.css` CSS vars | `branding-guidelines` = intent/usage, references vars |
| Session + git protocol | `AGENTS.md` | other docs reference it |
| 13 discovery questions | `lib/identity-questions.ts` | (mirror doc retired) |

## Terminology rule (applies to every edit below)

"Layers" is retired. There are **two distinct uses of "Layer N"** — handle them
differently:

**(a) Service-model Layers (value-ladder tiers).** Rename to the canonical
user-state labels defined in `product-decisions.md` → "User States" section. Use
that section's labels exactly; do not invent or paraphrase. Resolved mappings:

- "Layer 2 of the Zyrro service model" / "Layer 2 is descriptive" (the
  descriptive Identity Report) → **Registered**.
- "belongs to Layer 3" (directional content) → **Paid (one-time)** (Path/Plan).
  `product-decisions.md`'s User States section does not yet give this tier a
  standalone label — item 10 establishes it as **Paid (one-time)**, matching
  `path_plan_blueprint.md`'s existing usage.

**(b) The Translation Formula "Layer 1/2/3 = Pattern / Evidence / Meaning."** This
is a writing method, **not** a user state. Do **not** give it a state label and do
**not** rename it to "Step." **Drop the "Layer N" prefix entirely** and refer to
the three by their existing names — **Pattern**, **Evidence**, **Meaning**. The
number was the only thing causing the collision; the names already stand alone.

Target-state writing: write the docs to describe the **target** — **Primary
Signatures**, **Identity Profile**, user-state terminology, zero "Layer N"
references. Two known doc-vs-code mismatches will persist until Part 2 runs (the
`/identity` Section-4 eyebrow still renders `PRIMARY CONSTELLATION`; code symbols
are still `LAYER_2_*`). Expected and accounted for in Part 2.

---

# PART 1 — docs reorg (execute now)

### 1. `docs/standards/identity-signature-report.md` (now the authoritative report spec)

Keep its section structure — it is the owner. Fix only:

- "**Primary Constellation** (Top 5)" → "**Primary Signatures** (Top 5)".
- "**Domain Profile**" → "**Identity Profile**" (matches shipped UI label).
- "Section 4 — **Primary Constellation** — Deep Analysis"
  → "Section 4 — **Primary Signatures** — Deep Analysis".
- "All 5 **primary constellation** analyses" → "All 5 **Primary Signature** analyses".
- Identity Profile radar domain order "Visioning, Thinking, **Driving, Sensing,
  Connecting**" → canonical "Visioning, Thinking, **Connecting, Driving, Sensing**".
- Remove all **word-count / length numbers** ("2,500–4,500 words", "150-250",
  "80-150", "200-350", "50-100 word", "8-20 words", etc.). Describe section shape
  only; the prompt owns the numbers.
- Badge spec: drop the restated "80x88px / SVG shield path / gradient fill"
  literals; reference `identity-signature-icons.md` for the full badge spec (the
  doc already points there for the mapping).
- `status` field: remove the inline "Status field migration required:
  `ALTER TABLE artifacts ADD COLUMN status...`". Replace with a **provenance-neutral**
  statement only — e.g. "Each report artifact carries a `status` of
  `generating | ready | failed`." **Do not claim where the schema is defined**
  (the committed migrations do not create this column; provenance is being
  confirmed separately — see note in Confirm section).
- Keep the data field names `primary_constellation` / `domain_profile` wherever
  the doc refers to the artifact JSON contract — those are the code data contract,
  not display labels. Only user-facing **labels** change.
- Do **not** touch the hardcoded section copy (What This Report Is / Limits /
  Research Foundation) — out of scope.

### 2. `docs/framework/zyrro_identity_report_blueprint_v_1.md` (→ method/philosophy only)

- **Remove the duplicated structural spec** — the per-section field/format block
  running from "REPORT STRUCTURE" through "Structural Constraints" (Section 0…8
  required-fields, formats, lengths, and the structural-constraints list). That
  structure now lives only in `identity-signature-report.md`.
- **Keep the reasoning:** Core Report Objective ("This is me" / recognition is the
  product), the tone *rationale*, the writing/tense *principles*, the Final Test.
  Reframe as method, not spec.
- "This is **Layer 2** of the Zyrro service model: the Identity Signature Report
  (descriptive only)" → "This is the **Registered** tier's deliverable: the
  Identity Signature Report (descriptive only)."
- Remove any word-count numbers in the retained prose.

### 3. `docs/framework/zyrro_narrative_transformation_rules_v_1.md` (narrative method)

- Translation Formula headings: "## Layer 1 — Pattern" → "## Pattern";
  "## Layer 2 — Evidence" → "## Evidence"; "## Layer 3 — Meaning" → "## Meaning".
  Keep the formula line "Pattern → Evidence → Meaning". (Method, not tiers — see
  terminology rule (b).)
- No Coaching Rule: "**Layer 2** is descriptive. Not directional." → "The
  **Registered** tier is descriptive. Not directional." And "That belongs to
  **Layer 3**." → "That belongs to the **Paid (one-time)** tier."
- Remove word-count numbers in "Section Writing Rules" ("150–250", "80–150",
  "200–350"). Keep the content of each (Primary: signature truth, story evidence,
  tension, why it matters; Secondary: where it appears, supporting evidence, latent
  importance; Synthesis: one integrated operating system). Shape, not numbers.

### 4. `docs/framework/zyrro_named_identity_system_v_1.md` (naming method)

- "user's full **Primary Signature Constellation**" → "user's full set of
  **Primary Signatures**".
- Output Format: it shows ALL-CAPS. Generated text is **title case**
  ("The [Modifier] [Core]"); display uppercasing is presentational (the
  `.named-identity` rule in `globals.css`), not in the model output. Rewrite the
  format + examples to title case and add one line stating the uppercase is
  presentational (reference `globals.css`).
- Fix the stray "`n`" typo (lone `n` line under "Pattern Seeker" output options).
- Add a one-line pointer that canonical signature names live in
  `detection-engine-spec.md`. Keep the per-signature naming guidance (modifier/core
  behaviour) — this doc's unique content — but do not restate signature definitions.

### 5. `docs/framework/zyrro_path_plan_blueprint_v_1.md` (Paid (one-time) deliverable spec)

Stays the spec for Path/Plan (no competing twin). Already tier-language. Edits:

- Remove all word-count / length numbers ("100–180", "250–400", "200–350",
  "150–250", "60–120", "80–150"). Keep each section's content rules.
- The structured-object field lists (Path Option fields; Phase fields) restate the
  TypeScript types. Add a reference that the canonical field set lives in
  `lib/artifact-schemas.ts`; keep the per-field *content* rules; don't re-list
  field types as the source.
- Leave the generic "conversational layer" phrase for the Mentor as-is (not a
  tier reference).

### 6. `docs/framework/zyrro_detection_engine_spec_v_1.md` (canonical taxonomy home)

- Add a short note near the top: this is the canonical source for the 25 signature
  names + meaning; other docs reference it.
- No term/number fixes needed (the 1–25 scoring numbers are detection method, not
  report word-counts — keep). No "Layer" refs.

### 7. `docs/standards/coding-standards.md` (trim to genuine code-style rules)

Remove duplicated-owner content; replace each with a one-line reference:

- **Git section** → remove; reference `AGENTS.md` for branch/commit protocol.
- **Session continuity section** → remove entirely, **including its "read
  `product-decisions.md`" line**; reference `AGENTS.md`. Per decision: `session
  start` = read the latest changelog only. **Do NOT add `product-decisions.md`
  to `AGENTS.md`'s session start.**
- **Font weights list** → remove (branding owns the type scale); keep the existing
  "Follow the type scale in branding-guidelines.md" line.
- **Brand gradient literal** → remove; Colours rule says "use the CSS
  variables/classes in `globals.css`" and reference `branding-guidelines.md`.
- **URLs list** → remove; routes are defined by `app/` — reference it.
- **Bottom Navigation section** → remove; tab list owned by
  `components/BottomNav.tsx`, logged-in/out behaviour by `product-decisions.md`,
  visual treatment by `branding-guidelines.md`.
- **Gated pages**: keep "use the shared `<GatedState>` component, never duplicate
  gated markup"; drop the restated literal structure (eyebrow/heading/CTA wiring)
  — that lives in the component and `product-decisions.md`.
- **Keep**: "read branding before coding", Local verification, Styling
  (globals.css single source), Typography pointer, Buttons (.btn-* usage),
  Components, Page layout, Database/Supabase migration discipline.

### 8. `docs/standards/branding-guidelines.md` (→ intent/usage, references vars)

- Replace the **Colors** table, **Gradient exact specification** string,
  **Typography** weights/sizes, and **Spacing & Layout** literals with references
  to the `globals.css` CSS variables. The vars exist and are named:
  `--color-bg`, `--color-text-primary`, `--color-text-secondary`, `--color-accent`,
  `--color-surface`, `--color-grad-1/2/3`, `--color-nav-active`,
  `--color-nav-inactive`, `--gradient`, `--gradient-cta`, `--font-sans`,
  `--font-weight-regular/medium/semibold/bold`,
  `--font-size-display/heading/subheading/body/label/micro`,
  `--spacing-screen-x/card-gap/section-gap`, `--radius-sm/md/card/badge/pill`,
  `--shadow-card`, `--shadow-orb`.
- Keep all **usage/intent** content (when the gradient may/may not appear,
  component patterns, the "gradient is a brand moment" rule). This doc = how/when;
  `globals.css` = values.
- Fix the dangling `![][image1]` logo reference (embedded asset was stripped);
  keep the Drive link.

### 9. `docs/standards/identity-signature-icons.md`

- Shield "Fill: linear-gradient(160deg, #FE5618, #C60567, #510085)" → reference the
  `--gradient` variable in `globals.css` instead of the literal.
- Add a one-line pointer that canonical signature names live in
  `detection-engine-spec.md`. Keep the name→icon mapping (this doc's job); don't
  restate signature meanings.
- Keep `report.primary_constellation[0].name` (code data contract). The shield SVG
  path geometry also lives in the badge component — leave the path but note it
  mirrors the component.

### 10. `docs/standards/product-decisions.md` (sync to built Paid (one-time) tier; tier/state map)

- **User States and Deliverables**: remove "Registered (… **no tier enforcement
  yet**)" and the note "paid/subscriber tier enforcement is not yet implemented".
  Update to built reality: entitlement enforcement exists; `/path` and `/plan` are
  the **Paid (one-time)** deliverables. **Establish the canonical tier labels in
  this section** — Anonymous, Registered, **Paid (one-time)**, Subscriber — so the
  service-model "Layer" renames elsewhere have an exact source.
- **URLs**: remove the stale "placeholder content for authenticated users" on
  `/path`, `/plan`, `/dashboard`; update to current built state. Add a line that
  `app/` is the source of truth for which routes exist; this section is the
  tier/purpose map, not the route source.
- **Key Source Files**: rewrite the `app/api/mentor/route.ts` line. The current
  "handles guest/free plan chat and **layer 2 upgrade**" → describe in user-state
  terms: "POST endpoint; handles guest and Registered (`free` plan) chat, and
  generates the **Registered** Identity Signature Report when a guest who completed
  the questionnaire registers (**guest → Registered**)." (Resolved by reading the
  code — see Confirm-item B, now answered.)
- **Framework Reference** list: add the missing `zyrro_path_plan_blueprint_v_1.md`
  (currently lists only 4 of 5).
- **Standards Files** list: remove `identity-questions.md` (retired — item 11).
- **Questionnaire**: "questions sourced from `lib/identity-questions.ts` … keep
  `identity-questions.md` in sync" → "`lib/identity-questions.ts` is the single
  source for question text and hints."
- **Git Workflow section** → remove; reference `AGENTS.md`.

### 11. Retire `docs/standards/identity-questions.md`

- `git rm` the file. `lib/identity-questions.ts` is the only source. (It also
  wrongly pointed at `lib/questions.ts`, which does not exist.)
- After deletion, grep the repo for remaining references to `identity-questions.md`
  and remove/redirect them (notably the two edits in `product-decisions.md`,
  item 10).

### Part 1 — AGENTS sanity

After items 7 and 10, `AGENTS.md` is the single home for git + session protocol.
Do **not** edit `AGENTS.md`. Verify no other doc still states branch/commit/session
rules as if it owned them.

---

# PART 2 — code follow-up (WRITE-UP ONLY — do not execute here)

A separate, scheduled task. Listed so the Part-1 doc-vs-code mismatches are tracked.
**Do not perform these now.**

1. **Retire "Layer" symbols in code**, renaming by user state / function:
   - `lib/prompts/identity-report.ts`: `LAYER_2_PROMPT`, "Zyrro's Layer 2 Report
     Engine", "the full Layer 2 Identity Signature Report" → Registered-tier names
     (e.g. `IDENTITY_REPORT_PROMPT` / "Identity Report Engine" / "the full Identity
     Signature Report"). Also the in-prompt formula labels "Layer 2 — Evidence" /
     "Layer 3 — Meaning" → drop the number, use "Evidence" / "Meaning" (matches the
     doc fix in Part 1 item 3).
   - `app/api/mentor/route.ts`: import of `LAYER_2_PROMPT`; the `layer2` /
     `layer2Raw` variables; the system-prompt lines "Do not produce Layer 1 or
     Layer 2 outputs directly". "Layer 2" = the Registered Identity Report; **"Layer
     1" mapping needs confirming** (likely the Anonymous named-identity badge from
     the 13-question flow) — confirm before renaming.
   - `app/mentor/page.tsx`: `upgradeToLayer2`, `layerUpgradeChecked` /
     `setLayerUpgradeChecked`, `alreadyHasLayer2`, and
     `console.error("Layer 2 upgrade failed", …)`. Resolved meaning: the **guest →
     Registered** upgrade that generates the Registered report. Rename accordingly
     (e.g. `generateRegisteredReport` / `registeredReportChecked` / "Registered
     report generation failed").
   - Note (out of scope, related): the `AccessPlan = "guest" | "free"` plan names
     map to Anonymous / Registered. Renaming `"free"` is an API-contract change, not
     a "Layer" symbol — leave it unless separately decided.
2. **Fix the `/identity` Section-4 eyebrow.** `app/identity/page.tsx` still renders
   `<p className="eyebrow">PRIMARY CONSTELLATION</p>` → `PRIMARY SIGNATURES`. Data
   field `primary_constellation` stays; only the visible string changes.
3. **One taxonomy const.** A single source for the 25 names+domains that both
   `lib/prompts/identity-analysis.ts` and `SIGNATURE_ICONS` (`app/identity/page.tsx`)
   import, so the in-code copies can't drift. `detection-engine-spec.md` stays the
   canonical human-readable taxonomy; this const is the code mirror.
4. **Optional, observed:** `globals.css` appears to contain two `:root` blocks that
   partly redefine the same tokens — worth consolidating when convenient. Outside
   this brief's scope.

**Known temporary mismatch (until Part 2 runs):** docs say "Primary Signatures"
while the `/identity` Section-4 eyebrow still shows "PRIMARY CONSTELLATION", and
docs avoid "Layer" while code symbols are still `LAYER_2_*`. Expected; resolved by
Part 2.

---

# Notes

**One-time tier label (resolved).** `product-decisions.md` → User States did not
cleanly label the one-time tier (only "paid/subscriber tier" in a note). The
canonical label is **Paid (one-time)** (per `path_plan_blueprint.md`), applied in
the User States update (item 10) and the single "Layer 3" → Paid (one-time) rename
(narrative rules, item 3).

**Standing note — `artifacts.status` provenance (decision 3).** The committed
migrations in `supabase/migrations/` do not create the `artifacts` table or its
`status` column. Part 1 keeps the doc neutral on where the schema is defined; the
real migration history is to be confirmed separately via Claude Code before any doc
claims where this schema lives.

_Resolved (no action needed): one-time tier label (**Paid (one-time)**);
translation-formula "Layer N" (drop number, use names); "layer 2 upgrade" meaning
(guest → Registered, Registered report); session start (changelog only)._
