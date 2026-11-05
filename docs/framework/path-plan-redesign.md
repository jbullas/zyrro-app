# Zyrro Path and Plan Redesign (draft)

Status: draft, 2026-11-05. Decisions from the planning session with Miroslav, who signs off on this design. This replaces the current Path flow (Direction, Options, Your Path) as the design target; the current flow is not used as a starting point.

## Goal

Path should give the user the same feeling as the Identity report: "Zyrro knows me." The conversation must feel on point, every path option must feel true, and at least one option must feel like "yes, this is exactly the direction I want to be going, or should be going."

## Approach

Path becomes a guardrailed mentor session. Zyrro walks the user through generating their path options with them, in conversation. Users differ in their life stage and their state of mind, so there is no fixed set of screens. The goals of the conversation are fixed; the order, depth and tone adapt to the user.

Basic assumption: most users feel stuck in their current lives and need help to move forward.

## The profile

Behind the conversation sits a profile that fills in as the user talks. Seven items:

1. **Pattern confirmation:** does the user recognise the report's patterns as truly theirs.
2. **Risk appetite:** from "keep my job, explore on the side" to "ready to change everything".
3. **Clarity of direction:** a specific idea, a rough leaning, or no idea.
4. **Constraints:** money, family, other hard limits, and time available per week (always asked explicitly).
5. **What's pushing them now, and how urgent it is.**
6. **What they've tried before** to change things, and why it didn't stick.
7. **What must hold:** the energisers the path must include and the friction points it must avoid.

## Where each item comes from

Zyrro never asks what the user has already told it. Before the conversation, one step reads the user's 13 answers and their report and marks each item as known, inferred or missing for that user.

- Said directly in the questionnaire: **known**, used without asking.
- Inferred by the report: **confirmed**, not asked ("it looks like stability matters a lot to you, is that right?").
- Not covered: **asked**.

Some known facts change with timing (general risk appetite versus risk appetite right now), so these get a quick check against the current situation.

| Item | Questionnaire | Report | Status |
| --- | --- | --- | --- |
| Pattern confirmation | Source evidence for all patterns | Primary signatures, synthesis, distinctive pattern, pattern to notice, energisers, friction points, how you operate | Inferred, never confirmed. Confirm. |
| Risk appetite | Hints only: Q3, Q10 | Hints only: decision style, stress pattern, under pressure | Missing. Ask, starting from the hints. |
| Clarity of direction | Q13 says what to change, not where to go | Forward frame is a question to the user, not their answer | Missing. Ask. |
| Constraints | Q1, Q2 if the user mentioned them | None | Partial, varies by user. Confirm what's there, ask the rest. |
| What's pushing them | Q6 to Q10, Q13 | Friction points, pattern to notice, stress pattern | Well covered. Quick urgency check only. |
| What they've tried | Q3, Q5, Q10 partly | None | Partial. Ask. |
| What must hold | Q4, Q9, Q11, Q12 | Energisers, friction points | Full lists known; which matter most is not. Infer from the conversation, or offer as tap choices. |

## Conversation order

The default order. If the user gives something away early, Zyrro records it and skips it later.

1. **Confirm the patterns.** Opens from the report the user has just read. Builds trust; corrections feed everything after.
2. **What's pushing them now.** Mostly known; a quick check on whether anything is forcing a decision.
3. **What they've tried before.** What they tried to change and why it didn't stick.
4. **Where they want to go.** Zyrro adapts to a specific idea, a rough leaning, or no idea.
5. **Risk and constraints, together.** Last on purpose: by now the user has imagined something, so what they can put on the line for it is concrete.

## When Zyrro has enough

Each item must be confirmed by the user or explicitly marked as not known. "I don't know where I want to go" is a valid answer and changes the kind of options, not whether they're generated.

- Patterns: the user has reacted to their top signatures (confirmed, or a correction recorded).
- Pushing them: the main pressure is known, plus whether there's a deadline ("no rush" counts).
- Tried before: at least one past attempt and why it stalled, or a clear "never tried".
- Direction: specific idea, rough leaning, or no idea, plus which energisers and friction points must hold.
- Risk and constraints: a rough level, plus any hard limits.

When every item is filled, Zyrro shows a short summary of what it understood. The user confirms or corrects it. Only then are options generated.

## Guardrails

- **Length by progress, not count.** If the last few exchanges haven't filled or changed any profile item, Zyrro moves to the summary with what it has. A hard cap sits behind this only as a safety net, high enough that a real user never reaches it.
- **Lenient on topic.** Anything about the user's life, work, feelings or history is on topic, however roundabout. Only clearly unrelated requests (write a cover letter, help with code) get a polite redirect. Zyrro never ends a conversation on its own judgment of what's on topic.
- **Token budget per user** for this step. This is the only hard stop: mechanical, so it can't misjudge anyone.
- **Message length cap,** so whole documents can't be pasted in.
- **One conversation per purchase,** plus one redo (see Returning to the conversation).
- **Rate limits** on how fast messages can be sent.

The open-ended ongoing conversation belongs to the Mentor subscription; these limits protect that tier.

## Path options

- **Three options** in the first go: the strongest fit plus two alternatives.
- **Zyrro commits to one.** It marks the strongest fit and says why.
- **All on target.** No option exists for variety. All point the right way; they differ in approach.
- **Risk shapes the first step, not the direction.** A cautious user can get a bold direction that starts as a side project or research; a user ready for change gets it starting as a real move.
- **In the user's own words.** Each option ties back to the patterns they confirmed and what they said in the conversation.
- **If nothing lands, keep talking.** Zyrro asks what feels off and adjusts, instead of generating a fresh batch.

## Where it lives

The Path conversation runs under /path, not /mentor. The conversation, the options and the chosen path all live at /path.

- **Same engine.** Path reuses the Mentor's chat engine and interface; no second chat is built.
- **Payment stays clean.** Path is the one-time payment and Mentor is the subscription. Keeping the conversation under /path keeps access rules and guardrails separate.
- **Clear for the user.** Mentor is ongoing, open help; Path is one focused session with an outcome.
- **Upsell.** The Path conversation is a taste of Mentor, which becomes the natural next step.

## Returning to the conversation

The conversation is saved. What the user can do depends on where they are.

| Case | Allowed | Token cost |
| --- | --- | --- |
| Reading it back | Always | None: saved messages, no AI call |
| Finishing an unfinished conversation | Always; resumes where they left off, profile as saved | Same budget as the original. Resumes from the saved profile and recent messages, not the full transcript |
| Reopening after options are generated | Counts as the one redo | Its own smaller budget, starting from the confirmed profile |
| Anything beyond the redo | Goes to Mentor | Mentor subscription |

If the budget runs out mid-conversation, Zyrro wraps up with what it has, shows the summary, and generates options. The user never leaves with nothing.

## What each option contains

1. **Descriptive name.** A few words saying plainly what the path is. Clarity matters most while the user compares three.
2. **Why it fits you.** Tied to the patterns the user confirmed and what they said in the conversation.
3. **What it would look like.** A short picture of life on that path.
4. **Starting point.** One line on the shape of the start, pitched at the user's risk level: a side project alongside their job, a few months of research, or a real move now. No tasks; those belong to the Plan.
5. **What it would cost them.** The honest trade-off, given their constraints.

The strongest fit adds one line: why Zyrro picked it over the other two.

**After the user picks:** the existing project-naming system generates a brand-style name for the chosen path only. Plan and Mentor refer to the path by that name.

**Option versus Plan:** the option's starting point sets the frame ("start this as a side project"); the Plan turns it into concrete actions ("this week, do these three things").

## Energisers and friction points

The Path conversation does not repeat the Identity report's full lists. Instead, Zyrro learns which energisers must be part of the path and which friction points it must avoid.

- **Handled like any profile item.** If the conversation has already made it clear what matters, Zyrro records it and does not ask. It shows the choices only when it is still unclear. No fixed slot, nothing mechanical.
- **Asked during stage 4, Direction,** since it is about what the path must be.
- **The options honour the picks.** "Why it fits you" refers to them; "What it would cost them" says so honestly if a friction point can't be avoided.

## Tap to confirm

Whenever Zyrro already knows or suspects something and only needs confirmation, it shows choices to tap instead of asking the user to type. This applies across the conversation: patterns, energisers and friction points, constraints, risk. Typing is for what only the user can tell Zyrro.

This is a capability of the shared chat engine, so Mentor can use it too (check-ins, picking a focus, confirming changes), with typing staying the default there. The Mentor use is out of scope for this redesign and gets its own ticket.

## Plan

The Plan turns the chosen path and its starting point into action. Its job is to show the user what needs to happen and to get them moving straight away.

- **Two layers.** A milestone outline of the whole journey, from start to where the path leads, and a detailed first stretch of concrete actions.
- **Sized by effort, not days.** The first stretch is a fixed amount of effort spread over the time the user actually has. Someone going all in gets a dense first week; someone with two hours at weekends gets the same kind of first steps over about a month. Milestone timelines stretch the same way.
- **First action within a day or two,** whatever the user's pace.
- **No detailed long-range plan.** Precise steps months ahead go stale as life changes and the user learns.

Time available per week is part of the Constraints item and is always asked explicitly.

**Plan and Mentor.** The one-time payment includes Path and Plan, with no Mentor. For a subscriber, Mentor and Plan are inseparable: Mentor knows the Plan, keeps the user on track against it, turns the next milestone into actions, and updates the Plan when it needs to change.

## Open questions

1. Length of each option section.
2. What the Plan's milestones and first-stretch actions contain, and how the Plan is shown.
3. What a redo resets beyond the conversation, for example whether an already chosen path and its Plan are kept.
4. Values for the guardrails: stall threshold, hard cap, token budget, message length, rate limits.
5. Build plan: what replaces the current Path flow, and which open Path and Plan tickets are closed or rewritten (#135, #136, #137, #147, #148, #150, #161, #52, #159).

## Out of scope

- LinkedIn profile and writing as extra sources: logged separately (#166).
