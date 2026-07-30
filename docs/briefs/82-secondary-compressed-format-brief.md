# Brief: #82 — Secondary signature compressed format + no forced count

Ticket: **#82** (combines original C4b — score-0 secondaries written as if evidenced —
and C4, folded in 2026-07-28 — secondaries generally reading as filler regardless of score).

Design settled in planning session 2026-07-29. Root cause identified before drafting this
brief: Detection Engine never outputs a literal score-0 signature — a signature only appears
in its output (`signatures[]`, `secondary_signatures`) if real evidence was found for it. The
current defect exists because Layer 2's field requirements demand **exactly 3** entries in
`secondary_signature_analysis`, forcing the model to invent a signature from nothing whenever
Detection Engine surfaces fewer than 3 real secondary candidates. Removing that forced count
eliminates the score-0 fabrication case structurally — no separate "if score is 0" gating logic
is needed.

## Scope

Files: `lib/prompts/identity-report.ts` (Layer 2 prompt), `lib/artifact-schemas.ts`
(schema shape), `app/identity/page.tsx` (rendering — this ticket changes layout, not just JSON).

### 1. No forced secondary count
Remove the "exactly 3 entries" requirement for `secondary_signature_analysis`. Write one
section per secondary candidate Detection Engine's `secondary_signatures` list actually
contains — 0, 1, 2, or 3. Do not pad, do not invent a signature to reach a target count. Do
not draw from the broader `signatures[]` pool beyond what `secondary_signatures` already
surfaced — keep the existing upstream "up to 3" cap; this ticket removes the *forcing*, not
the cap itself.

Update the `## OUTPUT FORMAT` verification block's `secondary_signature_analysis has exactly
3 entries` check accordingly (0–3, matching whatever `secondary_signatures` contained).

### 2. Evidence-tied summary mini-section (always present)
Add a short synthesis field summarizing the person's secondary-signature landscape
specifically — not a generic structural preamble. When one or more secondaries exist, it
should connect them as latent capacities relative to the primary constellation. When zero
secondaries exist, this section is the *only* content under Secondary Signatures, and should
state — grounded in the actual detection result — that no additional pattern surfaced with
strong enough evidence to name. This is a real, specific claim about this person's detection
result, not a placeholder; it must not read as apologetic or as padding.

### 3. Per-secondary compressed format (replaces old full-paragraph format)
For each secondary signature that does exist, replace the old independent 80–150 word
paragraph with a compressed, comparative write-up:

- **No word floor.** Let genuinely thin evidence produce a short section; do not force length.
- **Ceiling ~100–120 words**, clearly shorter than the old secondary range and nowhere near
  the primary `evidence_analysis` range (200+ words) — the compression should be visually
  obvious on the page, not just marginally shorter.
- **Must anchor to one specific evidence circumstance** for this secondary — a concrete thing
  the person described, not a general trait claim.
- **Must contrast against one named primary signature**, using the fixed phrasing convention
  **"your primary [Name] signature"** (not "your [Name] pattern," not the bare name) — this
  makes the primary/secondary hierarchy explicit in the sentence itself.
- **Must not reuse the named primary's own `evidence_analysis` text** to construct the
  contrast — same anti-reuse principle as #86 (this session, same day): the contrast must
  point at something drawn from the secondary's own evidence, not restate/paraphrase the
  primary's write-up.
- **Plain text only.** No bold, no markdown syntax. Rich-text rendering support is explicitly
  out of scope here — tracked separately under #90.

Worked examples validated informally in planning (not live-tested — treat as directional, not
verified):

> You surface as an Amplifier when leading rather than solo-executing — mentoring newer crew
> members on lighting fundamentals and, on a regional production, coaching junior technicians
> alongside the creative director. Where your primary Activator signature drives you to start
> something and push it into motion, this pattern shows up once momentum already exists: your
> energy shifts toward building other people's competence inside a project you're already
> running, not toward generating the initial spark yourself.

> A Catalyst thread shows up in how consistently you describe thriving on high-trust,
> collaborative sets rather than solo work. Unlike your primary Pioneer signature, which is
> about pushing into unfamiliar territory, this is about the environment that lets you do your
> best work once you're there — trust and collaboration as fuel, not direction.

### 4. Schema
`secondary_signature_analysis` becomes a variable-length array (0–3 entries) rather than a
fixed-3 array. Bump `schema_version`. Add the new summary mini-section field.

### 5. Rendering (`app/identity/page.tsx`)
- Handle 0, 1, 2, and 3-entry cases in the Secondary Signatures section layout — not just a
  loop that assumes 3 cards exist.
- Zero-secondary case: only the summary mini-section renders under the section heading; no
  empty card slots, no broken grid.
- Confirm visually, not just via JSON — this is the one part of this ticket that a passing
  build/typecheck cannot catch.

## Out of scope (explicitly deferred)

- Bolding secondary/primary names in the compressed write-up — deferred to **#90** (rich-text
  formatting support across report prose fields, identity/path/plan), which needs its own
  scoping since it applies report-wide, not just to this field.
- Drawing secondaries from the broader `signatures[]` pool beyond the existing "up to 3" cap.

## Stop conditions

- If the compressed-format word ceiling (100–120) turns out to force either fabrication (too
  tight) or drift back toward filler-length (too loose) during live testing, stop and report
  back with what the real outputs look like before locking the number — same pattern as C5's
  five-iteration history this session: don't keep patching wording blind, surface the actual
  generated text.
- If the zero-secondaries summary line reads as apologetic/hedging rather than a plain,
  confident statement of the detection result, stop and report back — tone matters here as
  much as mechanics, same as the Named Identity "quality filter" already applied elsewhere in
  this prompt.

## Verification (Definition of Done — live-verified, not diff-only)

- `npx tsc --noEmit` and `npm run build` clean.
- Controlled A/B against a fixed Detection Engine output, confirming no fields outside the
  targeted areas change.
- Real end-to-end generation via `scripts/run-verification.mts` against at least:
  - A case with 3 real secondary candidates (e.g. Jordan or Rowan's real answer sets, reused
    from this session — real Detection Engine output already on file for both).
  - A case with fewer than 3 (thin secondary evidence) or, if none of the 12 real users
    naturally produce this, a constructed test case designed to surface it — do not skip this
    case; it's the one this ticket exists to fix.
- Visual confirmation on `/identity` (screenshot or direct DOM check) for both the populated
  and zero-secondary rendering states — JSON correctness alone does not verify this ticket.
- Teardown confirmed, no orphaned `zyrro-verify-*` users, same standard as every prior session.
- All ad hoc verification scripts deleted before commit, confirmed via `git status --short`
  (full repo, not just `scripts/`) before finalizing — per the confusion earlier this session,
  confirm this explicitly rather than assuming a wildcard delete worked.
