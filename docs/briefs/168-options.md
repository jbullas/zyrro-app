# 168-options

Save as `docs/briefs/168-options.md`.

## Context

The Path conversation now ends at a summary card the user confirms (`docs/briefs/168-shorter-flow.md`, `168-followup.md`, `168-direction-and-card.md`, `168-card-fixes.md`, last commit `f239a65`). On "That's right" the server saves the confirmation and shows a holding message (`HOLDING_TEXT` in `lib/path-conversation.ts`); nothing comes after it. This brief builds what comes next: three path options, the user's choice, and naming the chosen path. It also closes the open persona verification of the four earlier briefs.

Before options, one known defect in call A: on about one turn in three it returns no summary changes, so the living summary isn't updated that turn. The options read the summary, so this is checked first.

Product rules come from `docs/framework/path-plan-redesign.md` ("Path options", "What each option contains", "Must-haves and must-avoids"). Where this brief changes the design doc (marked **design doc change**), update the design doc in its own commit before the code that depends on it. Any other contradiction with the design doc: stop and ask. Where this brief conflicts with an earlier 168 brief, this brief wins.

Storage already exists (migration `20261105000000_path_conversation.sql`): `path_profiles.phase` has `options` and `chosen`; `path_conversation_options` (append-only, one row per generation, exactly 3 options, `strongest_fit_id`, `why_strongest`, summary and profile snapshots) and `path_choice` (append-only, the chosen option copied, `was_strongest_fit`, `why_strongest`, `project_name`). Neither is client-writable. Use them as they are; any change to their shape is a migration and a stop.

Repo learnings apply to every prompt: no worked examples, no quotable sentences, no banned-phrase lists. Describe failure modes abstractly. Nothing from any persona's data goes into a prompt. Prefer code over prompt wording wherever code can decide.

## Part A: call A summary updates

1. **Measure first.** Using the existing synthetic personas and saved transcripts (run D replay, Nadia clone, Dana, Priya, Marcus, Tom), log every call A result. For each turn where `summary_changes` came back empty, judge whether the user's message carried something a summary section should hold (direction, pushing, a tension, a connection, the confirmed read). Report: turns checked, empty results, real misses, and which sections were missed.
2. **Fix only real misses.** If the misses are real, Step 0 proposes the fix, preferring code (for example: when a profile item changed this turn but its matching summary section did not, sync it from the profile or retry once for that section only). If an empty result is correct (nothing new), it stays as it is. Report call A timing before and after; it must stay at about 2 to 3 s.

## Part B: options

1. **When they are generated.** On "That's right" (and after the existing "changed risk taps show the card once more" rule), the phase moves to `options` and generation starts in the same turn. No message announces it. The user sees a status line while it runs. A reload during generation resumes the wait, never starts a second generation (the generating unique index already guards this) and never leaves a stranded row: reuse the existing stranded-generation pattern.

2. **What they read.** The confirmed card (read, what they want, direction line, must-haves, must-avoids, risk, limits, hours, deadline), the living summary, the user's own words from the conversation (typed messages and notes, not only the tapped answers), the 13 answers, the report excerpts already in the context digest, and attempts from the profile. Every ref used is resolved to a short excerpt before the call, as call B does.

3. **Three options, one marked strongest** (design doc rules stand: all on target, more than one thread, risk shapes the first step and not the direction, each tied to what the user said). Each option has the design doc's five parts: descriptive name, why it fits you, what it would look like, starting point, what it would cost them. The strongest fit adds why Zyrro picked it over the other two. Step 0 proposes the length of each part (design doc open question 1).

4. **Options rule by direction level (design doc change).** Path is about reinventing the user's life and work, building on their strengths and getting rid of what keeps them stuck, not about how they spend their free time.
   - A clear direction: the three options develop that direction in different forms.
   - A rough sense, or not yet: at least two of the three are new paths built on the user's answers and report evidence; an option that rebalances what they already do (more or less of the same) is one at most.
   - Each option carries a kind (`develops_direction`, `new_path`, `rebalance`) in its stored data, not shown to the user. Code checks the counts against the direction level and retries the generation once on a breach; a second breach is logged and the options are shown. Step 0 says how the kind is set and checked, and whether the stored option shape can carry it without a migration (the content is jsonb).
   - Something the user named about their free time (the direction `aside`) is never the basis of an option.

5. **Attempts are soft background (design doc change).** Replaces "Kept so the options don't re-offer what already failed" in profile item 3. An option is never dropped because it resembles something the user tried. When it does, its starting point or cost says what would be different this time, using only what the user said about why it didn't stick.

6. **Must-haves and must-avoids.** "Why it fits you" refers to the must-haves it meets. "What it would cost them" says plainly if a must-avoid can't be fully avoided. An option that centres on a must-avoid is not offered.

7. **Evidence and voice, checked in code.**
   - Each option carries refs (questionnaire answer, user message, or a card item) for "why it fits you", each with a short quote found in its source, same check as must-haves. An option with no valid ref is regenerated once, then logged and dropped from the round only if a replacement passes. Step 0 proposes the exact rule.
   - Second person throughout. No signature names or report labels in option text, same rule as the conversation (code check against the signature list). No em dashes (`fixDashes`). No internal terms.

8. **Model.** Report which model generates the options. The call runs once per purchase (plus adjustments), so Step 0 also proposes a one-persona comparison with a stronger model for this call only, with cost and time per generation, for Miroslav to decide.

## Part C: if nothing lands

1. Under the three options, a choice "None of these feels right". It opens one Zyrro question about what feels off, with tap choices per option ("close", "not for me") plus a note.
2. Zyrro then generates a new set of three, as a new `path_conversation_options` row with the next round number: an option the user marked close is kept or developed, one marked "not for me" doesn't return, and the note shapes the rest. Same rules as Part B.
3. Step 0 proposes how many adjustment rounds are allowed before Zyrro asks the user to choose the closest one; the token budget itself stays with guardrails (`docs/briefs/168-path-conversation.md`, step 5). Update the design doc's "If nothing lands" line with the agreed number (**design doc change**, in the same commit as Part B items 4 and 5).

## Part D: choice and naming

1. **Choosing.** Each option has a choose control. Choosing one writes a `path_choice` row (the option copied, `was_strongest_fit`, `why_strongest`, `path_options_artifact_id` pointing at that round's row) and moves the phase to `chosen`. One choice per round; the redo is out of scope.
2. **Naming.** After choosing, the existing project-naming system offers three names for the chosen path only, with a skip. Reuse `PROJECT_NAME_PROMPT` (it takes the name and a description; build the description from the chosen option). The current routes (`/api/generate-project-name`, `/api/name-path-result`) and `lib/use-project-naming.ts` serve the current `/path` flow and must not change behaviour. Step 0 proposes how the new flow reaches the same prompt and UI (new routes reading `path_choice`, or a parameter) without touching the current flow. The pick or skip is saved on `path_choice.project_name` by the server (absent = not asked, null = skipped).
3. **End state.** The thread shows the chosen path under its project name (or its descriptive name after skip) and one code-owned line that the plan comes next. Plan itself is not built here.

## Part E: UI

- The step indicator highlights "Your options" from generation onwards.
- Options render as three cards in the thread, using existing report card styles; the strongest fit is marked and shows its "why this one" line. Each card shows the five parts; on mobile the parts must stay readable without a wall of text (Step 0 proposes, e.g. name, why it fits and starting point visible, the rest expandable).
- "None of these feels right" and the per-option close / not for me taps follow the existing pattern: choices inside the assistant bubble, one Continue.
- The naming step reuses the existing naming UI.
- Read-back after reload shows the summary card, every options round, the choice and the name, with no AI call.
- Styling: reuse existing classes; list any new ones.

## Steps (each its own commit; stop after each for approval)

0. **Plan, report only.** Part A item 1's measurement and the proposed fix. For Parts B to D: the generation inputs and output shape, the prompt outline, the kind check, the evidence check, section lengths, the adjustment cap, the naming route approach, the phase and API changes, any migration (none expected), the model comparison proposal, the file list. Also: reset of Miroslav's Preview Nadia Path conversation and user summary, by exact id, if he wants a fresh run. Then stop.
1. **Call A fix** (Part A item 2), only if Step 0 found real misses.
2. **Design doc edit** (Part B items 4 and 5, Part C item 3, and section lengths if agreed), on its own.
3. **Server:** Parts B, C and D.
4. **UI:** Part E.

## Live verification

Synthetic users with real Identity reports, cleaned up by exact id. Run end to end, from the opening read through the card, options, an adjustment where listed, choice and naming. Report full transcripts, every card, every options round (all fields, kind and refs), the choice and the name, plus per-turn timings and tokens per persona. Paste the options in full so Miroslav can judge whether they feel true.

- **Nadia clone** (rough sense of direction, real deadline): at least two of three options are new paths; the deadline shapes the starting points; no option centres on a must-avoid.
- **Clear direction persona:** all three develop the stated direction in different forms.
- **"Not yet" persona:** at least two of three new paths; no option built on a free-time aside.
- **Vague answers persona, contradicting persona, read-rejecting persona** (from `168-shorter-flow.md`): each reaches options; their earlier pass criteria still hold.
- **Adjustment:** one persona answers "None of these feels right", marks one option close; the next round keeps or develops it and drops the others.
- **Attempt overlap:** one persona whose answers include a past attempt similar to a fitting option; the option is still offered and says what would be different.
- **Every persona:** every "why it fits you" ref resolves with its quote; no signature names; second person; no em dashes; the strongest fit is marked and explained; naming offers three names for the chosen path and the pick or skip is saved on `path_choice`.
- Reload during generation, after options, and after choosing: correct state, no duplicate rows, read-back with no AI call.
- After step 4: screenshots at 1280 and 390 of the options round, the adjustment turn, the choice and the naming step.
- Mentor, `/path` (current flow, including its naming), `/identity` and `/dashboard` unchanged.

When this passes, the persona verification for `168-shorter-flow.md`, `168-followup.md`, `168-direction-and-card.md` and `168-card-fixes.md` is done: delete those four briefs and this one in their own commit. `168-path-conversation.md` stays until its step 5 (guardrails and redo) is done.

## Out of scope

- Guardrails and redo (`168-path-conversation.md`, step 5).
- Plan for the chosen path.
- Mentor reading the chosen path.
- Removing the current Path flow.

## Stop conditions

- A contradiction with the design doc not marked as a design doc change: stop and ask.
- Any change to the current `/path` flow (including its naming routes and hook), `/identity` or Mentor's behaviour: stop.
- A migration: stop and propose it.
- Typecheck or build fails, or lint fails in touched files: stop and report.
