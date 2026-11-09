# 168-card-items: must-items in the user's words, and notes on risk lines

Part of #168 (Path conversation). Two fixes to the summary card, from Miroslav's Preview run as Nadia_Kessler at the end of the 2026-11-08 session 2. Design doc: `docs/framework/path-plan-redesign.md`.

## Why

The card is where the user checks that Zyrro has understood them. Two things break that trust:

1. **Must-haves and must-avoids that come from the user's words don't keep their words.** The model rewrites them, and code patches the rewrite after the fact: a voice check, a rewrite call, cut detection and a mechanical pronoun swap. Every patch so far has fixed one form of breakage and let another through. The latest must-avoid came out as "...commercially sensible but unmoving", the third broken version of the same item. Another patch won't end this. The wording has to stop being the model's job for these items.
2. **A correction note that qualifies a risk line ends up as a must-have.** When the user corrects the card with a note that qualifies one of the risk lines (readiness, what's at stake, limits, hours, deadline), the note should change that line. Instead it was added to the must-haves.

## The fix, in principle

1. **Stated items are the user's words.** For a must-have or must-avoid with basis `stated`, the card text is the quote, with only the pronouns turned to the second person by code. The model chooses which words to quote; it never writes the wording. The quote must therefore be the complete phrase that states the item, readable on its own, and no longer than it needs to be. Inferred items keep the model's wording and stay labelled as inferred on the card. This applies wherever items are made: the seed, call A, and the correction-items call (items from a correction note are stated by definition).
2. **A note goes where it belongs.** In a card correction, a note, or the part of a note, that qualifies a risk line becomes that line's fact (`line_facts`), never a must-item. The correction-items call must be able to tell, so it needs to see the card's risk lines.

## Steps

### Step 0: investigate, then stop and report

Don't change code in this step.

1. Find Miroslav's Preview run as Nadia_Kessler (user `91d516aa-32fe-41f4-978d-f157ba04ba45`, the conversation created after the session-2 reset). Read its stored messages, card versions and the logs you can reach.
2. Report:
   - the must-avoid's full history: its source answer, its quote, and the text after each step (seed or call A, rewrite call, cut detection, mechanical swap), naming the step that broke it
   - Miroslav's correction note, the parts he marked, the risk line it qualifies, and what each call (call A, the correction-items call) returned for it
   - whether the principle above covers both cases, or whether something you found changes it
   - which of the current voice and cut code (`inSecondPerson`, `personCutFrom`, the `PATH_ITEM_VOICE_PROMPT` call, `mechanicalSecondPerson`) would still be reachable after fix 1, and for which items
3. Stop and wait.

If the run can't be found, stop and say so.

### Step 1: design doc

Update "Must-haves and must-avoids" in `docs/framework/path-plan-redesign.md`:
- Stated items are shown in the user's words, with only the pronouns turned to "you" by code. Inferred items are in Zyrro's wording and labelled.
- A correction note that qualifies a risk line changes that line and never becomes a must-item.

Commit the doc change on its own.

### Step 2: stated items in the user's words

- Code sets the text of every stated item from its quote, with only the pronouns swapped, after the quote check. This covers the seed, call A, and the correction-items call.
- The swap is first person only (`swapToSecondPerson`). Stated items never go through `mechanicalSecondPerson`, the voice check or the rewrite call: those would turn other people's "they" into "you" (decision of 2026-11-09, from step 0).
- An item is stated only when its quote reads as a complete phrase on the card. When the only statement of it leans on something earlier (such as "that question"), the model makes it inferred: Zyrro's wording, the quote kept as evidence, labelled inferred on the card. The model decides this when it picks the quote. Such an item is not dropped (decision of 2026-11-09). For the correction-items call, which today forces every item to stated, this means its items may come back inferred too.
- Change the prompts so that for stated items the model picks the quote and nothing else matters about its wording: the quote is the whole phrase that states the item, at the scope the user gave it, with every qualifier. Keep the existing rule of no examples in prompts.
- A rewording from a correction note follows the same rule: the new item's text is the note's quote with only the pronouns swapped.
- Cap: an item whose quote is over the card's item cap is dropped and logged, not cut.
- Remove the voice and cut code for whatever step 0 showed is no longer reachable. Keep what inferred items still need.

### Step 3: notes on risk lines

- Give the correction-items call the card's risk lines. A note, or the part of a note, that qualifies a risk line is not an item.
- Make sure call A, in `summary_correction` mode, records that part as the line's fact, with its quote checked as now.
- Call A records the whole part of the note that qualifies the line, not only its first clause. In Miroslav's run the readiness fact kept only "ready to ask about a smaller role before I renew" and lost the rest (decision of 2026-11-09).
- Notes on unchanged risk lines are still kept exactly (decision of 2026-11-07).

### Step 4: live verification

All through the real API, and through the real page at 1280 and 390 for anything you can see.

- **Miroslav's case:** replay his Nadia correction on a Nadia clone. The broken must-avoid appears in the user's words, and his note lands on the risk line it qualifies, with the must-haves unchanged. The readiness line carries both "I still don't know whether I'd leave the partnership" and "leave that question open", and no must-have is made from them.
- **Pronouns of other people:** a stated item whose quote says "they" about someone else keeps that "they".
- **A quote that leans on something earlier** gives an inferred item, labelled on the card, not a stated one and not a dropped one.
- **Across personas** (the Nadia clone, Dana, Priya, the contradicting persona and one more of your choice), code asserts that every stated item on every card equals its quote with only the pronouns swapped. Report each persona's stated items so their readability can be judged. Flag any that don't read as a complete phrase.
- **A correction note that both adds a must-item and qualifies a risk line:** each part goes to its place.
- **Regression:** options still honour the must-items. Mentor, `/identity` and `/dashboard` are unchanged.
- Delete every clone by exact id.

## Stop conditions

- Stop after step 0 and report.
- Stop if more than a few stated items across the persona runs don't read as complete phrases. That means the quote rule needs rethinking, not another patch.
- Stop if the fix would need a migration or a change outside the Path conversation.

## Out of scope

- The conversation-quality list (a must-avoid's scope, a quote that says the opposite, third-person false positives, the card not leading with the tension).
- Guardrails and redo (`168-path-conversation.md`, step 5).
