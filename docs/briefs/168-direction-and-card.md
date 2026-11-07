# 168-direction-and-card

Save as `docs/briefs/168-direction-and-card.md`.

## Context

Follow-up to `docs/briefs/168-shorter-flow.md` and `docs/briefs/168-followup.md` (both built: `8b8c0d7`, `f1c03a8`, `dfb46a0`, `fe37f4b`), from Miroslav's live run as Nadia\_Kessler on Preview on 2026-11-07. The run reached a confirmed card in four exchanges, and the length, the deadline, plain language, removals and second-person card all worked. But Zyrro came out of it without enough basis for options:

- **Direction is weak.** "Do you already have something in mind?" doesn't say what for. She had to guess ("If you mean what I'd like to do with more time") and answered about her free time. Zyrro took the tap ("a rough idea") and moved on, and the card never shows her direction at all.
- **"What have you tried?"** re-asked what her questionnaire answers already covered (the reduced caseload and why it didn't help), and on its own it tells the options little.

These fixes come before the options brief, because options will read the confirmed card and its new direction line.

Product rules come from `docs/framework/path-plan-redesign.md`. Where this brief changes the design doc (marked **design doc change**), update the design doc in its own commit before the code that depends on it. Any other contradiction with the design doc: stop and ask. Where this brief conflicts with the two earlier 168 briefs, this brief wins.

Repo learnings apply to every prompt change: no worked examples, no quotable sentences, no banned-phrase lists. Describe failure modes abstractly. Nothing from Nadia's data goes into a prompt.

## Part A: direction replaces tried before (design doc change)

1. **Drop the tried-before question.** Zyrro no longer asks what the user has tried. Attempts already described in the 13 answers are kept as quiet context, so options don't re-offer what already failed: each needs an answer ref and an exact quote, checked in code like must-haves; anything that fails the check is dropped, not asked about. They are not shown on the card. (The seeding comment in `lib/path-profile.ts` explains why open seeding of attempts was turned off: it counted things that weren't attempts. That is why the ref and quote check is required.)
2. **The direction question takes its place.** One turn, after the opening read:
   - tap group label: **"Do you have a sense of the direction you want to move in?"** Single answer: "Yes, a clear one", "A rough sense", "Not yet". The wording must not assume they have one; "Not yet" is a full answer.
   - note in the same turn: **"If you have one, what is it?"** Optional, so the user can explain in their own words before Zyrro replies.
   - the message carrying the question makes clear it is about where their life and work go from here, not how they spend free time. The tap label itself stays as above.
3. **One follow-up, only when needed.** If the user picked a clear or rough direction and what they wrote is missing or too broad to build options on, Zyrro asks one question to sharpen it. That question may include whether they have tried it and what got in the way. At most one follow-up, enforced in code. No follow-up after "Not yet".
4. **Something named is an input, not automatically the direction.** If the user names an activity that belongs to their free time rather than where their life and work are heading, it is recorded with their words, but it isn't stored as the direction.
5. **Design doc edits** (own commit, before the code): profile item 3 (tried before) becomes context from the answers only, not asked; item 4 (clarity of direction) uses the three new levels and the user's own words; update the "Where each item comes from" table, "Conversation order" (remove step 2, rewrite step 3 to match items 2 to 4 above), and "When Zyrro has enough" (direction: a level plus their words when they have one; tried before removed). Add the direction line to the card contents in "Summary before options".

## Part B: other fixes

1. **Opening-read note.** Placeholder becomes **"Anything you'd like to add or correct? (Optional)"**. The server currently treats this note as a correction only (`stillNeeded` for `opening_read`, and call A). It must treat it as added context or a correction, whichever it is: context sent with "That's right" is kept and used in later replies and the summary, and is not read as a correction.
2. **"Zyrro's guess" is decided in code.** The model sets stated or inferred today, and it marked two items as guesses that came straight from her correction note. Code sets it instead: an item whose ref is one of the user's messages in this conversation, or that came in through `added_from_note`, is always stated. Only items from the questionnaire answers keep the model's call.
3. **Qualifiers on the right line only.** On the card, "not replacing law with another full-time commitment" sat under Off the table (family, where she lives), and it already appeared under What you want. The call B prompt already says a note belongs on the line it qualifies; the model broke that rule anyway. A risk note goes only on the line it qualifies and never repeats another section. Step 0 proposes how to enforce it, preferring code over more prompt wording.
4. **Deadline note.** The Deadline note restated its line and added a claim the user never made ("the date by which you must decide is still unclear"). A note adds only what the user said that qualifies the line; when there is nothing, it is null.
5. **User bubbles after a tap.** A tapped answer shows as "Does this summary sound right? Yes, that's right", which reads as if the user asked the question. Show the question muted and the answer in normal text, or the answer only. Applies to every tapped turn and to the saved thread on reload.

## Part C: the card

1. **A direction line.** Between "What you want" and Must-haves: the level and, when the user gave one, their direction in their own words (second person, light cleanup only). After "Not yet", a short code-owned line saying the options will start from their strengths. It can be corrected like the other sections: add direction to the "What's off?" picks.
2. Styling: reuse existing classes; list any new ones.

## Steps (each its own commit; stop after each for approval)

0. **Plan, report only.** Per item: the change, the profile and summary shape changes, any migration (none expected), how Part B items 3 and 4 are enforced, the design doc edit, and the file list. Also: reset of Miroslav's Preview Nadia Path conversation and its user summary, by exact id. Then stop.
1. **Design doc edit** (Part A item 5), on its own.
2. **Server:** Parts A and B items 1 to 4, and the card data for Part C.
3. **UI:** Part B item 5 and Part C.

## Live verification

Synthetic users, cleaned up by exact id. Run after step 2 and again after step 3. Report the transcript, every card and per-turn timings.

- **Nadia clone:** never asked what she has tried; the reduced caseload is in the profile as context with a resolving ref and quote; the direction question appears as worded above; her direction (or its absence) is on the card in her words; no "Zyrro's guess" on items from her messages or note; no risk note repeats another section; the Deadline note adds nothing she didn't say.
- **Persona with no direction** (taps "Not yet"): no follow-up; the card shows the code-owned line.
- **Persona with a vague direction:** exactly one sharpening follow-up, then moves on.
- **Persona with a clear direction:** no follow-up; the card shows it in their words.
- **Opening-read note** sent with "That's right": the added context shows up later in the summary and is not treated as a correction.
- After step 3: screenshots at 1280 and 390 of the direction turn, a tapped user bubble and the card.
- Mentor, `/path` (current flow), `/identity` and `/dashboard` unchanged.

## Out of scope

Path options. The next brief builds them, including this rule: with a clear direction, the three options develop it in different forms; with a rough sense or none, at least two of the three are new paths built on the user's signatures and answers, and a rebalance of what they already do is one option at most.

## Stop conditions

- A contradiction with the design doc not marked as a design doc change: stop and ask.
- Any change to the current `/path` flow, `/identity` or Mentor's behaviour: stop.
- A migration: stop and propose it.
- Typecheck or build fails, or lint fails in touched files: stop and report.
