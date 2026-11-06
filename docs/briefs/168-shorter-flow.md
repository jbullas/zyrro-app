# Brief: Path conversation, shorter flow and summary card (#168)

Save as `docs/briefs/168-shorter-flow.md`. It sits alongside `docs/briefs/168-path-conversation.md`; where the two briefs conflict, this one wins. Product rules come from the design doc: if this brief contradicts it, stop and ask.

## Context

`docs/framework/path-plan-redesign.md` was revised on 2026-11-06 after a full test run as Nadia\_Kessler. Read it in full first: it is the source for every product rule here. The run worked on content but took 13 exchanges and was weakened by these problems:

- a signature grid with no context
- three separate confirmation turns
- energy and friction picks taken from the report's lists
- the same theme repeated in most replies
- risk appetite left unanswered
- a closing message that repeated on every further message, because nothing came after it

This work rebuilds the conversation to the revised design and ends it at a summary card the user confirms. Path options are not in scope; they follow in the next brief.

## What changes

1. **Profile: six items, not seven.** These are the six items in the design doc:
   - opening read
   - pushing them now
   - tried before
   - direction
   - risk, constraints and time
   - must-haves and must-avoids

   Pattern confirmation and signature reactions are removed, and so are the draining status and `drain_source`.
2. **Opening read replaces the signature grid.** It is the first assistant message after seeding: two or three plain sentences built from the summary, with no signature names, and including any deadline and what's still unknown about it. Code-owned choices (that's right, partly, not quite) plus an optional note.
3. **Conversation order and the enough rule** follow the design doc: about five exchanges. An item is needed only if it would change the options, and a vague needed item gets at most one follow-up.
4. **At most one interpretive reflection,** and never as its own turn: it goes in the same message as the next question. Remove the separate R1 and R2 turns. The limit is on new interpretations; brief acknowledgements of an answer are fine.
5. **Risk, constraints and time are asked as one turn,** with code-owned choices:
   - a scale for the change they're ready to make now (explore on the side, reduce what I do now, make a real move), and a separate multi-select for what they'd put at risk (income, position, location, not sure yet); record the two separately
   - an hours-per-week choice, for time available now (store a representative number, never 0: under 3 stores 2)
   - a direct question about hard limits, with "nothing off the table" as a choice, plus an optional note
6. **Must-haves and must-avoids come from the user.** Remove the energiser and friction tap turns. Call A proposes the items from the 13 answers and the conversation. Each item carries an evidence ref (questionnaire answer or user message) and a short quote of the supporting words. Code drops any item whose ref doesn't resolve or whose quote isn't found in that source. Each item is also marked stated or inferred; inferred items are labelled as such on the card. The items are shown only in the summary card.
7. **No repetition.** Call B receives a list of themes already stated or confirmed in the conversation, maintained by code from the summary. The prompt says a theme may return only to connect it to something new. Describe this abstractly: no example sentences and no banned-phrase lists (see the repo learnings).
8. **The summary uses the questionnaire first.** Seeding draws on the 13 answers first and the report as support. Summary sections follow the design doc, and no single thread may crowd out the others. Corrections and limits stay attached to what they qualify; updates never flatten them into the plain version.
9. **Summary card and phase change.** When the profile is complete, code moves the phase from `conversation` to `summary` and returns the summary card in the same turn. There is no closing message, and the "next, you'll see" text is removed from the prompt. The card:
   - shows how Zyrro sees the user
   - shows what they want, their must-haves and must-avoids, and their risk, limits and hours
   - offers choices (that's right, mostly with changes, that's not it) plus an optional note

   "Mostly" or "that's not it" requires a note or a pick of which part is off (the read, what they want, must-haves, must-avoids, risk and limits). Zyrro may then ask one clarifying question, updates the summary and shows the card again. Each must-have and must-avoid can be removed individually on the card. "That's right" marks it confirmed and shows a holding state saying the options come next (not built in this brief). Apart from that clarifying exchange, no conversation turn runs outside the conversation phase: the API refuses it.
10. **Choice plus note in one turn.** The API accepts tapped choice ids and an optional note together, as one user message. Call A receives both.
11. **No em dashes in user-facing text.** Add the rule to the call B prompt, and replace any em dashes in model output in code before saving.

## UI (step 3c)

- **Page header:** eyebrow "Your Path", an H1, and a two-line subheading. The subheading says what this is, that three path options come at the end, roughly how long it takes, and that the user can stop and resume any time.
- **Step indicator:** About you, A few questions, Your summary, Your options. Highlight the current step.
- **Assistant question and choices form one element.** The choices, the optional note field and the Continue button sit inside the assistant bubble, separated by a thin divider. Continue unlocks when every required choice is answered.
- **Assistant and user messages look clearly different.** Assistant messages sit on the left in Zyrro's style; user messages sit on the right. Tapped choices show as a user message.
- **One input at a time.** On a turn with choices, the bottom free-text box is hidden. It shows only on turns without choices, and never in the summary phase.
- **Summary card:** a distinct card in the thread, using existing report card styles.
- **Typing indicator:** show a short status line while the turn runs.
- **Styling:** reuse existing classes (`.mentor-*`, the `/identity` card styles). Add new classes only where no existing one works, and list them.

## Steps (each its own commit; stop after each for approval)

0. **Plan, report only.**
   - Profile shape changes and a migration if needed. Existing Path rows are test data and can be reset; say how.
   - The new next-step logic.
   - Call A and call B input and output changes.
   - The API contract for choice plus note, and the phase change.
   - The file list.

   Then stop.
1. **Server:** the profile, seeding, the next-step logic, the prompts, must-haves and must-avoids with ref checks, the theme list, the summary phase and API refusals.
2. **UI:** the page frame, step indicator, merged question cards, input pattern, summary card and status line.

## Live verification

Use synthetic users, cleaned up by exact id. Report full transcripts, final profiles and summaries.

- **Personas:** Nadia\_Kessler, plus three new personas:
  - one who gives short, vague answers
  - one who contradicts themselves
  - one who rejects the opening read outright
- **Pass criteria, per persona:**
  - Nadia: at most 6 exchanges before the summary card, and her final summary keeps her qualifiers (troubleshooting but not efficiency work; helping without owning others' development; can afford less income but undecided on leaving; 3 to 4 hours is for exploring now). This is test data: keep it out of prompts. Other personas: no question whose answer changed nothing in the profile, and at most one follow-up per item
  - no signature names
  - no theme restated without a new connection
  - readiness and risk recorded separately (risk may be "not sure yet"); hard limits and hours asked explicitly
  - every must-have and must-avoid has a resolving ref and a quote found in its source
  - the summary card appears in the same turn the profile completes
  - after the card, further typing is impossible
  - no em dashes
- **Report tokens and time per turn** against the step 3b baseline.
- **Regression check:** Mentor, `/path` (the current flow), `/identity` and `/dashboard` are unchanged.

## Stop conditions

- Anything in the design doc contradicts this brief: stop and ask.
- Any change to the current `/path` flow, `/identity`, or Mentor's behaviour: stop.
- A migration beyond what step 0 approved: stop and propose it.
- Typecheck or build fails, or lint fails in the files this work touches: stop and report. Don't paper over type errors.
