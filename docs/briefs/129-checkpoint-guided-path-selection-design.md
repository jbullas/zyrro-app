# #129 — Staged path-options redesign: checkpoint-guided single-path selection

Design doc for sign-off. Not an execution brief — no code changes should start
from this doc directly; each stage gets its own brief once this is approved.

Supersedes #25 (Path Options quality/genericness) and #44 (full report for the
chosen path). Both should move to Dropped, pointing here, once this is signed
off.

---

## 1. Why this exists

The current path-options pipeline is a single LLM call, temperature 0, that
produces 4 summary-card options from `identity_report` + (dead) `identity_reframe`
context. Two problems drove this redesign, discovered stepping back to review
the pipeline before touching #25's genericness fix directly:

1. **Live bug**: `generate-path-options/route.ts` still hard-requires a ready
   `identity_reframe` artifact and 409s without one. #124 retired
   `identity_reframe` generation entirely (folded into `reframe_teaser` on
   `identity_report`). As shipped, **no new paying user can generate path
   options at all** until this is fixed. This should land ahead of or as part
   of Stage B below — it is not optional and not part of the redesign's
   ambition, it is a blocking correctness bug.

2. **Product goal, not just a quality bug**: the intent isn't "4 good options,"
   it's *"what were you born for"* — a path that fits both what someone is
   demonstrably capable of (signature evidence) and what actually draws them
   (energisers, `forward_frame`), not just the strongest evidence-only pattern.
   #25's genericness finding (options converging on 4 cultural-default
   archetypes regardless of user data) is a symptom of generating from a
   summary of a summary, at temperature 0, in one undifferentiated pass that
   both selects and writes simultaneously. Better prompting alone was judged
   unlikely to fix this — the process itself needed restructuring.

## 2. Product decisions locked in this session

- **Zyrro proposes, the user decides.** Zyrro never unilaterally picks "the"
  path. It surfaces its most honest, differentiated set of candidate
  directions; the user's own choice is what makes the final path theirs.
- **Capability alone is not sufficient grounding.** A strongly-evidenced
  signature with no support in `energisers`/`forward_frame` is something the
  person *can* do, not necessarily something they're *drawn to* — it may
  reflect obligation, early reward, or coping rather than fulfillment. Every
  candidate direction must be anchored in both evidence (capability) and
  energiser/forward_frame signal (desire), with the overlap between them
  explicitly what the direction is built from.
- **`friction_points` is a disqualifier, not flavor text.** A direction that
  leans structurally into something the person is drained by gets reshaped or
  dropped before it's ever shown to the user, regardless of how strong its
  evidence otherwise looks.
- **No happiness promises.** Zyrro can evidence that a path engages what
  energises someone and avoids what drains them. It cannot claim the path
  "will make you happy" — that's a subjective-future claim no evidence can
  back, and it breaks the grounding discipline already enforced everywhere
  else in the report (no claim the evidence hasn't earned).
- **The self-check for every candidate**: could this exact direction be handed
  to a different user with different evidence and still make sense? If yes,
  it's still generic underneath specific-sounding language, and isn't ready.
- **Stretch distribution (Natural/Adjacent/Adjacent/Reinvention) is not
  sacred.** It was manufacturing spread on a template basis. The number and
  shape of candidate directions should come from how many genuine
  capability-desire intersections actually exist in this person's data, not a
  fixed quota.
- **End state changes from "4 options" to "1 chosen, fully-developed path."**
  Path selection and path planning (today: separate `path_options` →
  user click → `path_plan` generation, #10/#44/#52 territory) collapse into
  one continuous guided arc ending in a single report + plan.
- **No new pre-payment question series.** The fulfillment-oriented signal
  Zyrro needs (Q10–13-derived) already exists via `forward_frame` — it's
  currently just not wired into path generation. Wire in and test what already
  exists (raw `discovery_answers`, full `signatures[]`, `energisers`,
  `friction_points`, `forward_frame`) before considering new data collection.
- **No live conversational pause mid-generation.** Checkpoints are structured,
  async-safe stops (numbered choice = proceed / free text = redo), not a chat.
  This keeps `/path` a guided sequence, not a Mentor-style conversation
  surface — that already exists post-purchase for open-ended follow-up.
- **Project naming (#10, code unchanged) moves from path-selection to final
  delivery.** In the old flow, naming happened at the single "pick a card"
  moment. In this flow, that moment is split and provisional across
  Checkpoints 2–3 (the pick can still be redone). Naming fits better at Stage
  6's completed report+plan — the point of peak investment, and a natural
  bridge line into the Mentor subscription CTA ("you've named it, let's keep
  it moving").

## 3. The process

### Stage 1 — Ingest full context
Pull raw `discovery_answers` (all 13, verbatim — not just `identity_report`'s
interpretation of them), the full scored `signatures[]` list (persisted since
#62, not just top-5 `primary_constellation`), `energisers`, `friction_points`,
and `reframe_teaser.forward_frame`. No user interaction — retrieval only.

### Stage 2 — Find capability/desire intersections
For each evidenced signature, check whether it also shows up in
`energisers`/`forward_frame`. Surface: overlaps (strong on both — the real
candidate pool), capability-only signatures (evidenced, not energising),
desire-only signals (energising, thin evidence).

**◉ Checkpoint 1 — "Here's where your evidence and your energy line up"**
Show the intersections found (and briefly what didn't overlap). Numbered
choices = which overlaps feel most true / "yes, this reads right" → proceed.
Free text = "no, that's missing something" → redo Stage 2 with the input
folded in as a steer, not pasted verbatim (same fabrication caution as #120).

### Stage 3 — Friction-test the candidates
Check each surviving intersection against `friction_points`; drop or reshape
anything that leans hard into what drains the person. No user input needed —
this is a filter, not a decision point.

### Stage 4 — Derive candidate directions
From what survives Stages 2–3, generate a working set of evidence-grounded
direction themes — not yet full options, not forced to any fixed count.

**◉ Checkpoint 2 — "Here are the directions that fit you"** *(the real fork)*
Zyrro presents its strongest candidate directions (however many the evidence
genuinely supports) as numbered choices, each with enough detail to choose
from (name + thesis). **The user picks one.** Free text = "none of these are
it" → redo Stage 4 with their steer folded in.

### Stage 5 — Develop the chosen path
Take the user's actual pick and go deep on it alone: re-run the
friction/evidence check specifically against this one direction now that it's
committed, resolve remaining shape questions (how far a stretch it is, which
signatures anchor it) with full attention on one path instead of splitting
effort across four.

**◉ Checkpoint 3 — "Here's how I'm shaping this for you"**
Show the developed direction before full write-up — thesis, what it draws on,
the honest cost. Numbered = "yes, this is right" → proceed to full write-up.
Free text = "adjust this" → redo Stage 5 with the note.

### Stage 6 — Write the full path report + plan
Full elaborated write-up and the actionable plan, generated together, since
selection already happened. Content structure (see §4). Project-naming
trigger (#10) fires here, at completion, ahead of/alongside the Mentor
subscription CTA.

**Final delivery** — one path, chosen by the user, fully developed, plan
attached, named.

### Checkpoint tally
3 checkpoints. Best case (no redos): 3 user interactions between kickoff and
final delivery. Redo loops capped per stage (proposed 2–3 max — see §6 open
questions) rather than unbounded, matching the "iterate 2-3 rounds, then log
the residual gap" discipline already used in #85/#96/#112.

## 4. Final path content structure

Replaces today's separate `PATH_OPTIONS_PROMPT` (4×150-250 word cards) and
`PATH_PLAN_PROMPT` with one path's content, structured as:

1. **Opening thesis** — one strong sentence, same spirit as `identity_thesis`,
   giving the reader the core of it before the unpacking starts. New —
   doesn't exist in today's option cards, added because this is now a single
   weightier deliverable, not one of four competing for attention.
2. **What this path is** — the direction, concretely.
3. **Why it fits** — evidence (capability) and energy (desire) named as two
   *distinct* threads, with the overlap between them explicitly called out.
   Not one blended "you're good at this and drawn to it" paragraph — the
   separation is the whole point of the capability/desire work upstream
   actually showing up in the output.
4. **What it's choosing not to be** — a sentence or two naming what got ruled
   out (reusing Stage 4's discarded candidates) and why this direction is
   right instead. Makes the single choice feel considered, not default.
5. **The honest cost** — tied to a specific `friction_point`, not generic
   difficulty ("this will be hard"). Must be as specific and evidenced as the
   fit section.
6. **The life it leads toward** — concrete and evidenced (what a day/year
   genuinely doing this would look like, given who they demonstrably are).
   Never a happiness promise — stays in the same grounded register as the
   rest of the report.

## 5. Staging (execution order, matching the #100/#118 precedent)

Each stage independently verified against real personas before the next
depends on it — if a later stage turns out harder than expected, that risk is
contained rather than blocking the whole redesign.

- **Stage A — Checkpoint infrastructure.** Needs to survive a closed tab or
  lost connection, and needs an answer for "user never responds to a
  checkpoint." Should be proven with placeholder content before real prompts
  are built on top of it. Three distinct pieces, not one "versioning"
  mechanism (correcting earlier loose framing in this doc — see design
  discussion, 2026-08-26):
  - **Session state** — one mutable row per user (proposed type
    `path_selection_session`) tracking current stage, status
    (`awaiting_checkpoint` / `generating` / `complete`), and each stage's
    *current* confirmed output (Stage 2's intersections, Stage 4's
    candidates — including discarded ones, needed later for §4.4 — Stage 5's
    developed direction). Mutated in place as the session progresses; this is
    working state, not a deliverable, so it does **not** need Tier C
    append-only treatment. Standard generating-status concurrency guard
    (same partial-unique-index pattern as #59/#71), but no version history
    requirement.
  - **Checkpoint exchange log** — what Zyrro presented at each checkpoint,
    what the user chose or typed. Structurally identical to the
    `conversations`/`messages` turn-taking shape, so reuse that *shape*
    rather than reinvent it — but likely a new, separate table (or a `kind`
    discriminator on the existing one) rather than literally writing into
    mentor's own `conversations`/`messages`, since those carry
    mentor-specific machinery (meta-bundle resolution, `last_message_at`
    staleness triggers, the ongoing-relationship continuity model from #45)
    this bounded, one-off session shouldn't get pulled into. Decide the exact
    shape (new table vs. scoped reuse) during Stage A implementation.
  - **Final path + plan artifact** — written once, at Stage 6 completion, as
    a normal append-only Tier C artifact (new type, or a merged
    replacement for today's separate `path_options`/`path_plan` types), same
    `getCurrentArtifact` read pattern as identity_report/path_options/path_plan
    today. This is the one piece of this flow that *is* a permanent
    deliverable and does follow the existing versioning policy. The session
    row can be cleared or marked complete once this is written.

  This likely intersects with #79 (standardized artifact lineage) and #80
  (downstream consistency/active-version policy) — both still undecided.
  Recommend this becomes the forcing function to finally resolve them, rather
  than inventing a fourth one-off mechanism; confirm during Stage A whether
  session state / exchange log / final artifact should each register with
  whatever #79/#80 land on, or predate and inform that decision.
- **Stage B — Reasoning pipeline + Checkpoints 1–2.** Stages 1–4 above:
  full-context ingestion, capability/desire intersection-finding,
  friction-testing, candidate derivation. Includes fixing the blocking
  `identity_reframe` 409 bug as part of the input rewrite (§1.1), and resolves
  `lib/prompts/path-options.ts`'s stale `identity_reframe` context input
  (previously deferred to #25).
- **Stage C — Single-path content rewrite + Checkpoint 3.** Stages 5–6 above:
  development of the chosen path, the 6-part content structure from §4,
  merged report+plan generation.
- **Stage D — `/path` UX rebuild + naming relocation.** Replace the 4-card
  browse UX with the checkpoint flow; move #10's naming trigger from
  path-selection to final delivery per §2.

## 6. Open questions (not blocking sign-off, need resolving during execution)

- Redo-loop cap: proposed 2–3 max per checkpoint. What happens on exceeding
  it — escalate to Mentor-style open conversation? Force a numbered choice
  with no further free text? Undecided.
- Does the user need to *see* the discarded Stage 4 candidates at all beyond
  the one-sentence callback in §4.4, or is Checkpoint 2's moment (seeing them,
  choosing) sufficient for a feeling of agency? Currently assumed the callback
  is enough — worth confirming once real output exists to react to.
- Cost/latency is now variable (redo-dependent) rather than fixed. Accepted
  given the paid-tier "done for you" positioning, but worth watching once
  real usage data exists — could read as premium and deliberate, or as slow,
  depending on pacing.
- Checkpoint exchange log: new table vs. scoped reuse of `conversations`/
  `messages` with a `kind` discriminator — leaning new table (see §5 Stage A),
  final call during Stage A implementation.
- Whether Stage A's three pieces (session state / exchange log / final
  artifact) should register with #79/#80's eventual lineage/versioning
  standard, or predate and inform that decision — recommend the latter,
  not decided.

## 7. Ticket disposition

- **#25** (Path Options quality) → Dropped, superseded by this design.
  Genericness hypothesis folded into the redesign rather than tested
  standalone.
- **#44** (Path Report) → Dropped, superseded by this design. Full elaborated
  single-path report is Stage C's output; rename affordance is Stage D
  (naming trigger relocation).
- **New ticket** (staged #129 scope) opened to carry this work, referencing
  this doc.
