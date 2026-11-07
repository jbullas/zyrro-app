# 168-card-fixes

Save as `docs/briefs/168-card-fixes.md`.

## Context

Follow-up to `docs/briefs/168-direction-and-card.md` (built and pushed: `295e9e4`, `0420181`, `6898336`, `640f6b6`), from Miroslav's Preview run as Nadia\_Kessler on 2026-11-07 (version C). The direction question worked: her answer and the one follow-up gave real material for options. These six fixes come before the options brief, because options will read the confirmed card.

Product rules come from `docs/framework/path-plan-redesign.md`. None of these fixes is meant to change it; if one would, stop and ask. Where this brief conflicts with an earlier 168 brief, this brief wins.

Repo learnings apply to every prompt change: no worked examples, no quotable sentences, no banned-phrase lists. Describe failure modes abstractly. Nothing from Nadia's data goes into a prompt. Prefer code over more prompt wording wherever code can decide.

## Fixes

1. **Context line on every card after a correction.** In the run, the second card appeared with no explanation and the risk taps pre-filled, and she wasn't sure whether to answer them again. Every card after the first opens with one code-owned line, in the same assistant message, above the card:

   > Here's the updated summary with your changes. Your earlier answers are already filled in, so just check it and confirm, or change anything that's still off.

   The first card has no such line. The pre-filled taps stay as they are.

2. **The direction line.** The card showed her direction note pasted verbatim: two paragraphs, in the first person. It also left out her follow-up answer (which parts of the work she would keep and drop, and the boundaries she wants), which is the most useful part for options. After her correction, card 2 lost that work detail from every section.
   - First, find out and report why the card fell back to her stored words (call B returned null, failed the words check, exceeded the length cap, or something else).
   - The line: the level, then one or two sentences in the second person built from her direction answer and her follow-up answer together, keeping her own words for the substance. It adds nothing she didn't say.
   - The check must accept a faithful second-person version of what she wrote; if it can't, the fallback is still never her raw first-person text pasted onto the card. Step 0 proposes the check and the fallback.
   - A card correction keeps this content unless the user changes the direction itself.

3. **Second person on card items.** A must-avoid read "...but leave them unmoved". Must-haves and must-avoids are written in the second person or without pronouns, never in the third person, including items added from a correction note. Step 0 proposes how code enforces it.

4. **The Deadline line only for a real deadline.** In step 2's persona runs, the Deadline line showed things that aren't deadlines ("finishing bookkeeping qualification and discussing progression with manager", "decision about the bike workshop idea"). The rule already in the design doc stands: a deadline is a decision the user is putting off with a term, renewal, review or date attached. Anything else is pressure, not a deadline, and gets no Deadline line. Step 0 proposes how code checks it (for example a checked ref and quote naming the timing).

5. **The confirmed read is not a copy of Zyrro's first message.** The stored confirmed read sometimes copies the opening message whole, including the greeting and lines like "I don't yet know when you have to decide". It must say how the user now stands, as they confirmed or corrected it, with anything they added. No greeting, nothing addressed to them as a message, nothing Zyrro said it doesn't know.

6. **One interpretation per conversation.** The design allows Zyrro one interpretation of the user the user hasn't made, in the same message as the next question. In the run, three replies each offered a new interpretation (before the direction question, after her direction answer, after the follow-up). Outside the one reflection, a reply acknowledges what the user said in their terms and asks the next question; it does not attach the answer to a theme of Zyrro's or offer a new reading of them. Step 0 proposes how this is enforced, preferring code where it can decide.

## Steps (each its own commit; stop after each for approval)

0. **Plan, report only.** Per fix: the cause where it isn't obvious (fix 2 in particular), the change, how code enforces it, any shape changes, and the file list. Any migration (none expected). Then stop.
1. **Server:** fixes 2 to 6, and the card data for fix 1.
2. **UI:** fix 1, if it needs a UI change.

## Live verification

Synthetic users, cleaned up by exact id. Report the transcript, every card and per-turn timings.

- **Nadia clone,** answering the direction question and the follow-up with substance on both work and life, then correcting the card (must-avoids, and risk, limits and time):
  - card 2 opens with the context line; card 1 doesn't
  - the direction line on both cards is second person, one or two sentences, and includes her follow-up content
  - no third-person pronouns in any card item
  - exactly one interpretation in the whole conversation
  - the stored confirmed read has no greeting and doesn't copy the opening message
- **A persona whose pressure has no term or date:** no Deadline line.
- **A persona with a real deadline:** the Deadline line names the decision and its timing.
- List every risk note the overlap check drops, with the line and the section it matched.
- Mentor, `/path` (current flow), `/identity` and `/dashboard` unchanged.

## Out of scope

Path options: the next brief.

## Stop conditions

- Anything that would change the design doc: stop and ask.
- Any change to the current `/path` flow, `/identity` or Mentor's behaviour: stop.
- A migration: stop and propose it.
- Typecheck or build fails, or lint fails in touched files: stop and report.
