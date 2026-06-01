# Zyrro Path Options & Path Plan Blueprint v1

## Tier

This document defines the **Paid (one-time)** deliverable.

It sits behind the one-time payment.

It produces two artifacts across two pages:

- `/path` — **Your Path Options** (one cohesive report)
- `/plan` — **Your Path Plan** (the plan for the chosen option)

This is the **directional** stage of the Zyrro model.

The Registered report (`/identity`) describes who the user is.
This stage tells them where it is leading and what to do about it.

---

## The Arc

The whole product is one progression — four stages, each a single noun:

- **Identity** (`/identity`) — who you are · Registered
- **Path** (`/path`) — the direction you commit to · Paid
- **Plan** (`/plan`) — how you will walk it · Paid
- **Action** — walking it, week by week · Subscriber

This document covers **Path** and **Plan**.

`/path` presents options and resolves to one chosen path — mirroring how
`/identity` presents many signatures and resolves to one named identity.

The rolling breakdown plans (quarter / month / week / today) belong to
**Action**: the Mentor takes the Full Path from `/plan` and turns it into
action over time. They are not generated here.

Action is a Subscriber-tier surface (Dashboard, or a dedicated `/action`) —
TBD. The Mentor (`/mentor`) is the conversational layer alongside it, not the
Action surface itself.

---

## Relationship to the Identity Signature Report

This deliverable does not restate the identity report.

It builds on it.

The user has already felt **"This is me."**

This stage must now create a second reaction:

**"So that is where this has been heading — and here is what I do about it."**

Recognition -> Direction.

---

## The Directional Inversion

The Registered report follows the No Coaching Rule:
descriptive only, no "you should," no "your next step."

**This tier inverts that rule.**

Direction, instruction, and "now it is time" language belong here.

This is the only tier where the product tells the user what to do.

---

## Inputs

### Stage A — Your Path Options

Consumes:

- the stored identity report artifact (full JSON)
- the named identity
- the top 5 primary signatures and scores
- the dominant tension pattern

### Stage B — Your Path Plan

Consumes:

- everything from Stage A
- the **chosen path option** (selected by the user on `/path`)

The plan is generated only after a path option is chosen.

---

## Global Output Standards

### Tone

Inherits the identity report tone rules:

- precise
- grounded
- emotionally accurate
- direct
- calm
- honest

Must NOT be:

- motivational
- fluffy
- generic
- mystical
- therapeutic

Plus, for this tier only:

- **directional** — it is allowed and expected to instruct

### Grounding

Every claim must tie back to evidence already established in the identity report.

No new personality claims.
No claims the report did not earn.

### Tense

- Present tense for identity: "You build systems."
- Past tense for evidence: "You rebuilt your practice after your co-founder left."
- Future / imperative for direction: "This phase you will..."

---

# `/path` — YOUR PATH OPTIONS

One cohesive report. Reads as a single document, like the identity report.

Six sections, in order.

---

## Section 1 — What We're Working With

### Purpose

Recap the identity so the directional work has a foundation.

### Length

100–180 words

### Must include

- the named identity
- the top 5 primary signatures (named)
- one tight paragraph on the operating pattern

### Must NOT

Re-deliver the identity report. This is a recap, not a repeat.

---

## Section 2 — What This Means for What's Next

(The Meaning — future-facing.)

### Purpose

Explain what the identity pattern means going forward.

Not just why it exists — what it implies for what comes next.

### Length

250–400 words

### Must establish

- the deeper drive underneath the top signatures
- the through-line connecting their career chapters
- what that pattern is now pushing toward
- the cost of leaving it unexamined

### Must reference

Minimum 2 real story anchors from the identity report.

### Must end on

One sentence naming what this means for their future, in plain language.
This sentence bridges into the Reframe.

---

## Section 3 — Where Your Story Is Pointing

(The Reframe — their true purpose / direction.)

### Purpose

Shift how the user holds their pattern: from limitation or stuckness to direction.

This is the pivot of the entire deliverable.

### Length

200–350 words

### Required

1. **The current frame** — how the user has likely been reading their situation (often as a problem, plateau, or friction). Ground in their stated frustrations.
2. **The reframe** — the truer reading. One clear, declarative shift toward where the story is actually pointing.

### Rules

- Must feel earned, not reassuring.
- Must not flatter.
- The user should feel they have been misreading their own situation, and now see it correctly.

### Must end on

One sentence stating the reframe in shareable form.

Example shape:

"You are not stalled. You have outgrown the structure you built to get here."

---

## Section 4 — Why This Reframe Holds

### Purpose

Justify the reframe so it lands as truth, not motivation.

### Length

150–250 words

### Must

- show why the old frame is incomplete — what it misreads
- back the reframe with evidence from the report (signatures, repeated patterns, pride/energy moments)
- pre-empt the user's likely internal objection and answer it

### Rules

Declarative. Minimal hedging. The reframe must survive scrutiny.

---

## Section 5 — Your Path Options

### Purpose

Show 4 distinct, viable directions the user's identity can move toward.

Each is a coherent answer to "the life they want."

Not 4 flavours of one path. 4 genuinely different bets.

The user does not walk all four. They choose one.

### Quantity

Exactly 4.

### Each option is a structured object

Required fields per option:

#### id

Stable identifier, unique within this option set.

Format: `path_01`, `path_02`, `path_03`, `path_04`

Required. Used to pass the chosen option into plan generation.

#### name

Evocative option name.

2–4 words.

Format: **The [Name]**

#### thesis

One sentence. 8–18 words. Where this option leads.

#### body

150–250 words. Must contain:

1. **What this option is** — the direction, concretely.
2. **Why it fits you** — which of the user's named signatures it draws on.
3. **What it asks of you** — the honest demand, the tension, the cost.
4. **The life it leads toward** — the outcome, made specific and pictureable.

#### signatures_engaged

Array of 2–4 signature names (from the user's top 5) this option most activates.

Required. Used for plan grounding.

#### stretch

One of: `Natural`, `Adjacent`, `Reinvention`

How far this option sits from the user's current trajectory.

Required.

### Distribution rule

Vary `stretch` across the 4 options. At least one `Natural` and one `Reinvention`.

The options must not all be the same distance from where the user is now.

`stretch` should also predict plan horizon: a `Reinvention` option's Path Plan runs longer than a `Natural` one's.

### Quality test per option

- Could the user picture their life on it? If no, rewrite.
- Does it draw on real signatures from the report? If no, rewrite.
- Is it meaningfully different from the other 3? If no, rewrite.
- Does it name an honest cost? If no, rewrite.

---

## Section 6 — Choose Your Path

### Purpose

Convert reading into a decision.

### Required

- a clear CTA to select one option
- selection persists and triggers Path Plan generation (Stage B)

The user selects exactly one option. Selection is logged (see Versioning).
A user may change their selection later; changing it generates the corresponding plan.

---

# `/plan` — YOUR PATH PLAN

The plan for the chosen option. Generated after selection.

---

## Gating and states

Resolves in order:

1. **Unpaid** -> paywall gated state
2. **Paid, no option chosen** -> prompt to choose -> `/path`
3. **Generating** -> waiting experience (poll, same pattern as `/identity`)
4. **Ready** -> full Path Plan
5. **Failed** -> error state with retry

---

## Section 1 — Plan Frame

### Purpose

Connect the plan to the chosen option in one short opening.

### Length

60–120 words

### Must state

- the chosen option by name
- the journey this plan covers, end to end
- the honest total horizon (variable — derived from the option, not fixed)

---

## Section 2 — The Full Path

### Purpose

Show the complete A->B for the chosen option, so the user sees the whole journey clearly.

### Structure

3–5 phases, in sequence.

### Each phase is a structured object

Required fields per phase:

#### phase

Integer, 1..N.

#### name

Short phase name. 2–5 words.

#### outcome

One sentence. What is true at the end of this phase that was not true at the start.

#### estimated_duration

Honest estimate (e.g. "4–6 weeks", "2–3 months"). Variable. Phases need not be equal length.

#### milestones

2–4 concrete checkpoints for the phase.

#### signatures_leaned_on

Which of the chosen option's `signatures_engaged` this phase draws on most.

#### body

80–150 words. What this phase is, why it comes here in the sequence, what makes it hard.

### Arc rule

The phases must compound. Each phase makes the next possible.
The total of `estimated_duration` is the honest horizon stated in the Plan Frame.

---

## Section 3 — Start Here

### Purpose

Give immediate momentum. The user can act tomorrow.

This is the opening of the journey, not the whole of it.

### Structure

5–7 concrete actions for the first stretch (roughly the first 7 days / opening of Phase 1).

### Each action

- specific
- doable soon
- observable (the user can tell if they did it)
- carries a one-line **why**, tied to the chosen option and at least one signature

### Rule

These actions must be wrong for a different option. If a Start Here list would suit any path, it is too generic — rewrite.

---

## Section 4 — Now Let's Implement It

(Subscription bridge.)

### Purpose

Point from the plan to ongoing implementation.

### Length

60–120 words

### Must state

- the Full Path unfolds over [horizon] and the work is in the doing
- week to week, the path needs breaking down, adjusting, and holding to
- this is what ongoing navigation provides

### Must NOT

- hard-sell
- read as an ad

It states the truth — a path is walked over time — which makes ongoing mentorship the obvious next step.

---

# Versioning & Selection (forward-compatible)

Built to support, later, choosing a different option or generating new options — without rework now.

- **Path Options are a versioned artifact.** A user can have more than one option set over time. A new set never overwrites the previous one. Path `id`s are unique within a set; the set has its own id/version.
- **Selection is recorded as an event, not a single overwriting field.** Store "user chose option X, from set Y, at time T." Even if the UI shows only the latest, history is preserved.
- **Each Path Plan is keyed to a specific chosen option** (option set + path id) and versioned. Switching options yields a different plan; returning later for a new set yields a new plan, with the old ones intact.

Today's UI exposes one option set and one active selection. The data model assumes many.

---

# Structural Constraints

`/path` (Your Path Options) must always include:

- Section 1 recap
- Section 2 Meaning
- Section 3 Reframe
- Section 4 Why the reframe holds
- exactly 4 structured Path Options, with varied `stretch`
- Section 6 selection CTA

`/plan` (Your Path Plan) must always include:

- Plan Frame naming the chosen option and honest horizon
- The Full Path: 3–5 structured phases with estimated durations
- Start Here: 5–7 immediate actions
- Now Let's Implement It

---

# Final Test

Before outputting Path Options, ask:

Does this create: **"So that is where this has been heading — and here are my real options."**

Before outputting a Path Plan, ask:

Can the user start tomorrow, and is the journey unmistakably about *their* chosen option?

If not:

It is not ready.

Direction is the product.
