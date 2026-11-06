# 168-followup

Save as `docs/briefs/168-followup.md`.

## Context

Follow-up to `docs/briefs/168-shorter-flow.md` (steps 1 and 2 are done: `8b8c0d7`, `f1c03a8`), from Miroslav's live run as Nadia\_Kessler on Preview on 2026-11-06. The run reached a confirmed summary card in about five exchanges, and the content was true to her. These fixes come first because the options step will read the confirmed summary.

Product rules come from `docs/framework/path-plan-redesign.md`. Where this brief and `168-shorter-flow.md` conflict, this brief wins. Where this brief extends the design doc (marked **design doc change**), update the design doc in its own commit before the code that depends on it. Any other contradiction with the design doc: stop and ask.

Repo learnings apply to every prompt change: no worked examples, no quotable sentences, no banned-phrase lists. Describe failure modes abstractly. Nothing from Nadia's data goes into a prompt.

## Part A: server

1. **Repetition, tracked by source.** Theme labels failed: the same idea came back three times under different labels. Track what has been said by the source refs it rests on (questionnaire answer or user message). An idea resting on a source already used may come back only to connect it to something new. Replace the label-based `stated_themes` with this.
2. **Speed.** A turn takes 21 to 31 s; call A alone about 16.5 s. Trim call A's input and output (for example, don't rewrite unchanged summary sections) to get a turn back to about 14 s. Report per-call timings before and after.
3. **Deadlines from seeding.** A decision the user says they are postponing, with a term, renewal or date attached, counts as a deadline. Nadia's run missed one and the opening read said nothing forces a decision. When a deadline is found, the opening read names it, along with what is still unknown about it. When none is found, the read says nothing about deadlines and the tap group alone asks. The card shows any deadline under risk, limits and time, as something that limits how long the user can explore.
4. **Plain spoken language.** Replies and choice labels use words people say. Internal terms ("read", "profile", "item") never reach the user.
5. **One thing per question.** Every question asks about one thing, can be answered with a tap or a sentence, and matches the choices attached to it. The direction question asks whether they already have something in mind, with taps for a specific idea, a rough leaning, or not yet, and the note for what it is.
6. **Must-avoid wording.** A must-avoid names what the user objects to in their terms, not the activity in general. In the run, a user who enjoys being consulted got "being the expert people consult" when her objection was to always being cast as the expert.
7. **Removals.** A removed item blocks only that item. A reworded item the user asks for in their correction is still added.
8. **Correcting tapped answers.** Readiness, what's at stake, limits and hours are tapped and code-owned, so a card correction could not change them. When the user marks risk and limits as off, the next card message re-offers those tap groups, pre-filled with the current answers, alongside the note. Code applies the new taps as before.
9. **One voice on the card.** The card speaks to the user in the second person throughout. A note the user typed is not pasted onto the card. Its qualifiers are attached to the line they qualify (readiness, at stake, limits or time), in the second person. The note itself stays in the saved messages.
10. **Readiness choices** (**design doc change**). The labels say concretely what changes, and a "not sure yet" choice is added:
    - explore alongside current work, nothing changes yet
    - change the current setup: fewer hours or a different role
    - leave or make a big change: a new job, field or way of life
    - not sure yet

    Update the readiness list in the design doc's profile and conversation order sections to match.

## Part B: UI

1. **Start screen as the post-payment intro.** This is where users land right after paying, and today it has one line above the button. It should:
   - open with the value proposition, reused from the `/identity` "Find your path" section (`lib/identity-report-copy.ts`), so the promise matches what they bought;
   - say what they get: a summary to check, then three path options with the strongest fit marked;
   - say how it works: a few questions, tap or type, about ten minutes, stop and come back any time.
2. **Contrast.** Group labels become questions in normal text colour, not pale small capitals. Stronger radio circles, checkboxes and option borders. A locked Continue still looks like a button. On the card: section labels, the + and – markers and the inferred tag are readable.
3. **Inferred tag** reads "Zyrro's guess".
4. **Multi-answer groups** show "Pick any that apply" under the label and use square checkboxes. Single-answer groups keep round radios.
5. **Remove on each card item.** A remove control on each must-have and must-avoid replaces the separate Remove list.
6. **Choice-label copy** follows Part A item 4. Replace at least these code-owned labels:

| Now | Instead |
| --- | --- |
| This read (group label) | Does this sound like you? |
| Anything forcing a decision | Is anything forcing a decision? |
| What's off, if anything? (optional) | Anything I got wrong? (optional) |

Styling: reuse existing classes; list any new ones.

## Steps (each its own commit; stop after each for approval)

0. **Plan, report only.** The changes per item, any migration (none expected), the design doc edit for Part A item 10, and the file list. Then stop.
1. **Design doc edit** (Part A item 10), on its own.
2. **Part A, server.**
3. **Part B, UI.**

## Live verification

A Nadia clone run after step 2 and again after step 3, synthetic users cleaned up by exact id. Report the transcript, every card and per-turn timings.

- No idea restated without a new connection, judged by source refs.
- Turns at about 14 s or report why not.
- The partnership renewal appears in the opening read and on the card as a deadline.
- No internal terms in any reply or label.
- A card correction that marks risk and limits off re-offers those taps pre-filled, and changing them updates the next card.
- A removed item stays removed; a reworded replacement the user asks for is added.
- The card is in the second person throughout, with qualifiers on the lines they qualify.
- After step 3: screenshots at 1280 and 390 of the Start screen, the opening read, a multi-answer group and the card.
- Mentor, `/path` (current flow), `/identity` and `/dashboard` unchanged.

## Stop conditions

- A contradiction with the design doc not marked as a design doc change: stop and ask.
- Any change to the current `/path` flow, `/identity` or Mentor's behaviour: stop.
- A migration: stop and propose it.
- Typecheck or build fails, or lint fails in touched files: stop and report.
