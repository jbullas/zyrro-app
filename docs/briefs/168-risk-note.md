# 168-risk-note: one risk note from the user's own words

Part of #168 (Path conversation). Replaces fix 2 of `168-card-items.md` (notes on risk lines). Design doc: `docs/framework/path-plan-redesign.md`.

## Why

The card's "Risk, limits and time" block must show what the user said about it, including what they haven't decided. Today a model splits the user's risk text into five quoted per-line facts (`line_facts`), code checks the quotes, and call B writes one note per line from those facts. The replay of Miroslav's Preview run (conversation `0c548936-f856-4e4a-bba8-753f078df827`) showed that split failing at every step:
- call A quoted the tapped labels
- it cut quotes to the first sentence
- it put readiness material on the deadline line
- it returned the block outside `profile_updates`

"If the firm says no, I haven't decided whether I'd leave the partnership" never became a fact on any line. A separate risk call, tried earlier the same day, failed in the same way. Prompt rules have not fixed it. The one card that got it right was written by call B straight from the user's message.

## The design (Miroslav approved, 2026-11-09)

- **Tapped values stay** on their five lines (Ready to, Would put at risk, Off the table, Time, Deadline), built by code as now. The deadline line keeps coming from `pushing_now`.
- **The user's risk text is stored verbatim by code.** It is the note sent with the risk-turn answer, plus the note of every card correction, in order, with their message ids. No model extraction, no quote picking, no per-line split.
- **One note under the block,** written by call B from that stored text and nothing else. It covers every part of what the user said about the change they're ready to make, what they'd risk, what's off the table, their time and their timing, including anything they haven't decided. It is in the second person and adds nothing they didn't say. From a correction note it takes only the parts about these topics; must-haves, must-avoids and other corrections are not its concern.
- **The note changes only when the stored text changes:** a new risk-turn note or a correction note. Otherwise the previous note is kept exactly.
- **Options read the user's verbatim risk text,** in place of `line_facts`. Plan (#169) will read the same.
- **Removed:**
  - `line_facts` and the per-line notes
  - the risk-fact quote checks
  - call A's `risk_time` line-facts rule and its correction-mode risk block
  - the risk-block retry and the "one line only" rule
  - the per-line note overlap gate
  - the code comparing facts before and after

  Old `line_facts` in stored profiles are ignored, with no migration.
- **The correction-items call** keeps seeing the risk block (tapped values plus the one note), so a note about risk still never becomes a must-item.

## Decision after step 3: no model writes the risk note (Miroslav, 2026-11-09)

This replaces the risk-note call (decisions 1 to 3 below), the note's 400-character limit, and the parts of step 3 that check a written note.

The risk-note call failed the judge on Miroslav's Preview replay twice:
- it paraphrased away his specifics ("other tasks" for licensing and disputes)
- it kept the note unchanged through corrections that added detail
- a readiness detail that was also a must-have counted as must-item content

The design:
- **The card's risk block** shows the tapped values as now. Under them, it shows the user's own risk-turn note verbatim, with only I, me and my turned to you by code (`swapToSecondPerson`, as for stated must-items). Several risk-turn notes (a follow-up) are joined in order. No risk text means no note.
- **Editing it.** When the user marks "Risk, limits and time" in a card correction, the card shows their risk text in an editable field, prefilled in their own first person. What they save replaces the stored text, with that message as its ref. The field reuses the existing input and textarea classes.
- **Correction notes never change the risk text.** Neither do re-tapped values.
- **Options read the same stored text**, kept as now in `risk_time.their_words`.
- **Deleted:** the risk-note call and its prompt, and anything else only it used.

Step 3 verification for this design, all through the real API and the real page at 1280 and 390:
1. The Preview replay: the note on every card equals Nadia's risk-turn note with only the first person swapped. Corrections 1 and 2 leave it exactly as it was.
2. A correction that marks "Risk, limits and time" and edits the field: the note becomes the edited text, swapped.
3. A correction that doesn't mark it keeps the note exactly.
4. The six scenarios, with the risk-note judge removed. Options still fit the user's hours and readiness.
5. Regression: Mentor, `/identity`, `/dashboard` and `/path` are unchanged. The `168-card-items` must-item checks still pass.

The guardrails below still apply: no new prompt rules anywhere, delete what this replaces, stop and report if a check fails, and report the net change in lines.

## Decisions on step 0 (Miroslav, 2026-11-09)

Decisions 1 to 3 (the risk-note call, the re-tap call and the 400-character limit) are replaced by the decision above.

1. **The note comes from its own small risk-note call**, not call B.
   - Input: only the user's stored risk text (the risk-turn note or notes, and every card correction note, each with its message id), the current tapped values and the previous note.
   - Output: `{ "changed": false }` when nothing new concerns readiness, risk, limits, time or timing; otherwise `{ "changed": true, "note" }`. On `changed: false`, code keeps the previous note exactly.
   - It runs alongside call A whenever new risk text or a correction note arrives. Call B no longer writes risk notes.
2. **A re-tapped risk value with no new text** also runs the risk-note call with the new values, so the note never contradicts a tap.
3. **The note's limit is 400 characters.**
4. **risk_time stays a call A item.** Only the line-facts rule is removed from the prompt, and its branch from `applyProfileUpdates`.
5. **Old cards keep their per-line notes** and render as they are. The card type accepts both shapes, with the legacy `qualifier` as the precedent.
6. **Risk said elsewhere** (typed answers, the direction note) stays out of the note, by design.
7. **A note sent with "Yes, that's right"** is not risk text and runs no call. Options still see it in evidence.
8. **The risk text is stored** in the profile's `risk_time` jsonb as `their_words: [{ ref, text }]`, with no migration.
9. **Options get** the tapped values, the one note and that labelled list.

Guardrails for the build:
- The risk-note prompt stays short: what the note is for, its input, its output and the limit. No rules aimed at a single case.
- No rules are added to call A, call B or the correction-items prompt. In those prompts, only what this design replaces is removed.
- Everything the design replaces is deleted outright, with no dead branches or unused types (old cards' per-line notes still render).
- If a step 3 check fails, stop and report. Prompt rules are not added or reworded to make it pass.
- The report gives the net change: lines removed and added, in prompts and in code.

## Steps

### Step 0: audit, then stop and report

No code changes.
1. List every reader and writer of `line_facts`, the per-line risk notes, the risk-fact checks and call A's `risk_time` rule: server, prompts, the card UI, read-back (`cardMarkdown`), options generation and anything else.
2. Say what options currently receive about risk, and what they would receive under this design.
3. Say how code can tell which stored messages are the risk-turn note and the correction notes. If it can't from the existing data, say what it would need. A migration is out of scope unless you show it's unavoidable.
4. Flag anything in the design that the code makes harder than it looks.

Stop and wait.

### Step 1: design doc

Update `docs/framework/path-plan-redesign.md` to this design: the card's risk block, the living summary if it mentions risk facts, and "A note on a risk line stays on that line" from `168-card-items`, which this replaces. Commit on its own.

### Step 2: build

As designed. Reuse the existing risk note style (`path-risk-note`) and classes; no new classes unless none fits. Prompts keep the rule of no examples.

### Step 3: live verification

All through the real API, and through the real page at 1280 and 390.
- **Miroslav's Preview run, replayed** on a Nadia clone with his exact inputs from `0c548936-f856-4e4a-bba8-753f078df827`. Card 1's note carries his risk answer, including "haven't decided whether I'd leave the partnership". After correction 1 the note still carries it, with his correction's risk parts added. Correction 2 doesn't lose it.
- **The six scenarios** in `scripts/verify-168ci.ad-hoc.mts`, with the per-line checks replaced. A model judge checks that each risk note:
  - covers every part of the user's risk text, including anything undecided
  - adds nothing they didn't say
  - carries nothing that is a must-have or must-avoid
  - has no first person

  Report every risk note's text.
- **A correction with no risk content** returns `changed: false`, and the note stays exactly.
- **A re-tapped value** gives a note that matches the new tap.
- **Options** still reflect the user's risk and time: the starting points fit their hours and readiness.
- **Regression:** Mentor, `/identity`, `/dashboard` and `/path` are unchanged. The `168-card-items` checks on must-items still pass.
- Delete every clone by exact id.

## Stop conditions

- Stop after step 0 and report.
- Stop if the risk note drops an undecided part or carries must-item content in more than one run. That means the design needs rethinking, not a prompt patch.
- Stop if the build would need a migration.

## Conversation-quality list (logged from step 3)

- **Options starting points vs readiness** (Miroslav, 2026-11-09: existing options behaviour, not caused by this build). Marcus (specific_idea, no risk text) tapped "Change my current setup". Two of his three starting points were side pilots alongside his job; the starting-point judge said they fit his hours but not his readiness.

## Out of scope

- Must-item quote quality (fragments, "you dislike" openers): conversation-quality list.
- Zyrro taking back a correct reading when the user denies it (the Q8 caseload case): conversation-quality list.
- The adjust-options UX, guardrails and redo, and the Plan handoff (#169).
