# Zyrro Path and Plan Redesign (draft)

Status: draft, 2026-11-05, revised 2026-11-06 after the Nadia\_Kessler test run (shorter conversation, no signature discussion). Miroslav signs off on this design. It replaces the current Path flow (Direction, Options, Your Path) as the design target; the current flow is not used as a starting point.

## Goal

Path should give the user the same feeling as the Identity report: "Zyrro knows me." The conversation must feel on point, every path option must feel true, and at least one option must feel like "yes, this is exactly the direction I want to be going, or should be going."

## Approach

Path is a short, guardrailed mentor session. Zyrro works out the user's path options with them, in conversation. Users differ in life stage and state of mind, so there is no fixed set of screens. The goals of the conversation are fixed; the order, depth and tone adapt to the user.

The rule for every turn: it exists only if its answer could change the path options. No turn confirms what is already confirmed, and no turn restates what Zyrro has already said.

Basic assumption: most users feel stuck in their current lives and need help to move forward.

## The profile

Behind the conversation sits a profile that fills in as the user talks. Six items:

1. **Opening read:** the user has confirmed or corrected Zyrro's plain-language read of them.
2. **What's pushing them now,** and any deadline.
3. **What they've tried before** to change things, and why it didn't stick.
4. **Clarity of direction:** a specific idea, a rough leaning, or no idea.
5. **Risk, constraints and time:** the change they're ready to make now (explore on the side, reduce what they do now, make a real move); what they're willing to put at risk (income, position, location, or not sure yet); hard limits (money, family, location, other commitments); and hours available per week for this now. Hard limits and hours are always asked explicitly.
6. **Must-haves and must-avoids:** what a good direction has to include and what it has to avoid, taken from what the user said.

Signatures are not a profile item. The user never confirms, rates or discusses individual signatures, and no signature names appear in the conversation. The report is supporting evidence, not something the user is asked to grade.

## Where each item comes from

Zyrro never asks what the user has already told it. Before the conversation, one step reads the user's 13 answers and their report and marks each item as known, inferred or missing for that user. The questionnaire comes first; the report supports it.

| Item | Source | Status at start |
| --- | --- | --- |
| Opening read | Questionnaire first, report as support | Always shown, always confirmed or corrected |
| Pushing them now | Q6 to Q10, Q13 | Usually known. Not asked separately; folded into the opening read |
| Tried before | Q3, Q5, Q10 partly | Usually partial. Ask |
| Direction | Q13 says what to change, not where to go | Missing. Ask |
| Risk, constraints, time | Hints only: Q1, Q2, Q3, Q10 | Missing. Ask, as one turn |
| Must-haves and must-avoids | Q4, Q7, Q9, Q11, Q12 and the conversation | Derived by Zyrro, confirmed in the summary |

## Conversation order

About five exchanges, then the summary. Five is a target, not a cap: a vague answer, a contradiction or a rejected read can justify an extra question, but only one whose answer would change the options. If the user gives something away early, Zyrro records it and skips the question later.

1. **Opening read.** Two or three plain sentences on how Zyrro sees the user and what's pressing on them now, including any deadline and what's still unknown about it. No signature names. Tap choices (that's right, partly, not quite) plus room to say what's off. The user's corrections here feed everything after.
2. **What they've tried before.** What they tried, and what got in the way.
3. **Where they want to go.** Zyrro adapts to a specific idea, a rough leaning, or no idea. If it has noticed a connection the user hasn't made, it offers it in the same message as this question, not as a separate turn.
4. **Risk, constraints and time, together.** Last on purpose: by now the user has imagined something, so what they can put on the line for it is concrete. Tap choices for the change they're ready to make now and for what they'd put at risk (including "not sure yet"), a choice of hours per week, and a direct question about hard limits, with "nothing off the table" as a choice.
5. **Summary.** The one explicit confirmation before options (see Summary before options).

## When Zyrro has enough

An item is needed only if its answer would change the options. Each needed item must be answered or explicitly marked as not known. "I don't know where I want to go" is a valid answer and changes the kind of options, not whether they're generated. When a needed item comes back vague, Zyrro may ask one follow-up for it, then moves on.

- Opening read: confirmed or corrected.
- Pushing them: the main pressure is known, plus whether there's a deadline ("no rush" counts).
- Tried before: at least one past attempt and why it stalled, or a clear "never tried".
- Direction: specific idea, rough leaning, or no idea.
- Risk, constraints, time: the change they're ready for now, what they'd put at risk (or not sure yet), hard limits (or none), hours per week now.

## Summary before options

When the needed items are filled, the conversation phase ends and the summary card appears in the same turn. No message announces it. The card shows how Zyrro sees the user (not a list of their answers), what they want, their must-haves and must-avoids, and their risk, limits and hours.

- Choices: that's right, mostly (with changes), that's not it, plus an optional note.
- "Mostly" or "that's not it" needs a note or a pick of which part is off (the read, what they want, must-haves, must-avoids, risk and limits). Zyrro may ask one clarifying question, then updates the summary and shows it again. Each must-have and must-avoid can also be removed on its own.
- Only after confirmation are options generated.
- The free-text box is not shown once the conversation phase has ended.

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
- **All on target.** No option exists for variety. All point the right way; they differ in approach, not just in setting.
- **More than one thread.** Options draw on the whole confirmed summary, not only its strongest theme.
- **Risk shapes the first step, not the direction.** A cautious user can get a bold direction that starts as a side project or research; a user ready for change gets it starting as a real move.
- **In the user's own words.** Each option ties back to the confirmed summary and what the user said in the conversation.
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
| Reopening after options are generated | Counts as the one redo | Its own smaller budget, starting from the confirmed summary |
| Anything beyond the redo | Goes to Mentor | Mentor subscription |

If the budget runs out mid-conversation, Zyrro wraps up with what it has, shows the summary, and generates options. The user never leaves with nothing.

## What each option contains

1. **Descriptive name.** A few words saying plainly what the path is. Clarity matters most while the user compares three.
2. **Why it fits you.** Tied to the confirmed summary and what the user said in the conversation.
3. **What it would look like.** A short picture of life on that path.
4. **Starting point.** One line on the shape of the start, pitched at the user's risk level: a side project alongside their job, a few months of research, or a real move now. No tasks; those belong to the Plan.
5. **What it would cost them.** The honest trade-off, given their constraints, including any must-avoid it can't fully avoid.

The strongest fit adds one line: why Zyrro picked it over the other two.

**After the user picks:** the existing project-naming system generates a brand-style name for the chosen path only. Plan and Mentor refer to the path by that name.

**Option versus Plan:** the option's starting point sets the frame ("start this as a side project"); the Plan turns it into concrete actions ("this week, do these three things").

## Must-haves and must-avoids

The report's energiser and friction lists are not offered as choices in Path. They describe the user's signatures, not always what the user said, and can miss what matters most for the path.

- **Derived from the user.** Zyrro derives the must-haves and must-avoids from the 13 answers and the conversation.
- **Evidence required.** Each item points to the questionnaire answer or user message it came from and quotes the words that support it. Code checks that the reference exists and that the quote appears in that source, and drops any item that fails. A valid reference alone doesn't prove the item, so each is also marked stated (the user said it) or inferred (Zyrro's reading), and inferred items are labelled as such on the card.
- **Confirmed in the summary,** where the user can correct them. No separate turn asks for them.
- **The options honour them.** "Why it fits you" refers to the must-haves; "What it would cost them" says so honestly if a must-avoid can't be avoided.

## Tap to confirm

Whenever Zyrro already knows or suspects something and only needs confirmation, it shows choices to tap instead of asking the user to type. Typing is for what only the user can tell Zyrro.

- On a turn with choices, the user can tap and add an optional note; both are sent together with one Continue button.
- On a turn without choices, the user types and sends.

This is a capability of the shared chat engine, so Mentor can use it too (check-ins, picking a focus, confirming changes), with typing staying the default there. The Mentor use is out of scope for this redesign and gets its own ticket.

## Living user summary

Recording answers accurately is not enough. Zyrro has to show the user that it understands them: connecting what they say to what they said earlier and to their report, and naming tensions in their own terms. The first build asked one call to both update the profile and write the reply, and the replies became form-filling.

So a living user summary sits underneath the conversation, as a shared foundation layer: Path uses it now, Plan and Mentor later.

- **It belongs to the user, not to a conversation.** One per user, server-only.
- **Fixed sections, fixed size.** The confirmed read, tensions and contradictions, connections between answers, what they've tried, what's pushing them, current direction, must-haves and must-avoids, open questions. Each section has a cap, and so does the whole.
- **Balanced threads.** No single theme crowds out the rest; each distinct thread the user has shown keeps its place. Corrections and limits stay attached to what they qualify: an activity enjoyed in one form but not another, a change they can afford but haven't decided on, time available now for exploring rather than as a lasting commitment. Updates never flatten these into the plain version.
- **Rewritten, never appended to.** Each update merges new information, replaces what is outdated and drops what no longer matters. The full history stays in the messages.
- **Seeded at the start of Path** from the questionnaire first, and the Identity report as support.

**Each user answer takes two steps.**

1. **Update.** Updates the six profile items and rewrites the summary with anything new: links to earlier answers or the report, tensions, corrections.
2. **Reply.** Written from the summary. Its job is to show what Zyrro now understands, using the user's own words, then ask the next question. It does not echo the answer back or narrate the session.

The reply sees the evidence itself, not just a pointer to it: before it is written, every reference it relies on is resolved to a short excerpt of the source (the questionnaire answer, the user's message, or the report text).

**No repetition.** The reply receives the themes already stated or confirmed in the conversation. It may bring one back only to connect it to something new, never to restate it. This is a structural input, not a list of banned phrases.

**One interpretive reflection at most.** At most once in the conversation, Zyrro offers an interpretation the user hasn't made, in the same message as the next question, never as its own turn. The user can confirm or push back in their answer. The summary card is the only standalone confirmation. Brief acknowledgements of an answer are fine; the limit is on new interpretations.

## Plan

The Plan turns the chosen path and its starting point into action. Its job is to show the user what needs to happen and to get them moving straight away.

- **Two layers.** A milestone outline of the whole journey, from start to where the path leads, and a detailed first stretch of concrete actions.
- **Sized by effort, not days.** The first stretch is a fixed amount of effort spread over the time the user actually has. Someone going all in gets a dense first week; someone with two hours at weekends gets the same kind of first steps over about a month. Milestone timelines stretch the same way.
- **First action within a day or two,** whatever the user's pace.
- **No detailed long-range plan.** Precise steps months ahead go stale as life changes and the user learns.

Time available per week is part of the risk, constraints and time item and is always asked explicitly.

**Plan and Mentor.** The one-time payment includes Path and Plan, with no Mentor. For a subscriber, Mentor and Plan are inseparable: Mentor knows the Plan, keeps the user on track against it, turns the next milestone into actions, and updates the Plan when it needs to change.

## Open questions

1. Length of each option section.
2. What the Plan's milestones and first-stretch actions contain, and how the Plan is shown.
3. What a redo resets beyond the conversation, for example whether an already chosen path and its Plan are kept.
4. Values for the guardrails: stall threshold, hard cap, token budget, message length, rate limits.
5. Build plan: what replaces the current Path flow, and which open Path and Plan tickets are closed or rewritten (#135, #136, #137, #147, #148, #150, #161, #52, #159).

## Out of scope

- LinkedIn profile and writing as extra sources: logged separately (#166).
- Fixing the Identity report's energiser, friction and Pattern to Notice generation: logged separately (#172).
