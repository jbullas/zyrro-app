# 169-plan-page: storing the Plan, the /plan page and the handoff from Path

Ticket #169, step 2 of `169-plan.md`. The Plan's content and shape were settled in step 1 (brief `169-plan.md`, Miroslav's plan judgement). The plan code `lib/path-conversation-plan.ts` and its prompt `lib/prompts/path-conversation-plan.ts` exist, uncommitted. The artifact type `path_conversation_plan` is live (migration `a74de72`).

## Why

Path ends with "Your plan for this path comes next", with nothing after it. This brief makes the Plan real: generated, stored, and shown on `/plan`, reached straight from the end of Path.

## Decisions (Miroslav, 2026-11-09)

1. **Generation starts automatically** once the path is chosen and named (or naming is skipped), in the background, the same way options do: a generating row now, the work after the response, and polling. No extra click to start it.
2. **The Plan lives on `/plan`.** The end message in the Path thread gets a code-owned "See your plan" button to `/plan`, replacing "Your plan for this path comes next". The Plan is not shown in the thread.
3. **The header's Plan link** works for a user who has a new-flow Plan. Its muted state stays for everyone else.

## Decisions on step 0 (Miroslav, 2026-11-09)

1. **One migration:**
   - it adds `path_conversation_plan` to the three browser-write policies (insert, update, delete), so the browser can't write plan rows
   - it adds a partial unique index allowing only one generating `path_conversation_plan` row per user, as options have

   Miroslav runs it in the Supabase SQL Editor. It is then verified live: a browser-side insert, update and delete of a plan row are refused, and a second generating row is refused. The migration file is committed after that.
2. **A user with no plan in either flow** sees the new empty state, linking to `/path/conversation`.
3. **A plan that fails the length checks gets one automatic retry** that names what was over: the same mechanism options use, with no new prompt rule. If the retry fails too, the page shows the failed state with the user's retry.
4. **The step 0 build plan is approved:**
   - generation starts in the commit of the naming turn, and of the choose turn when name suggestions are unavailable
   - the page shows a "See your plan" button under the end message, old end messages included
   - the header asks per page load whether the user has a plan
   - a small server route reads the state, flips stranded generations to failed, and starts a retry

Step 2's live verification runs only after the migration is confirmed live.

## The /plan page for a new-flow user

The page reads the current `path_choice` and its `path_conversation_plan`. In order:
- the path's name (`project_name`, or the option's name when naming was skipped) and the option's "what it is"
- **"In your words:"**, the user's note at choice, verbatim with only I/me/my turned to you by code. Use the same label and body styles as the summary card's risk note. Leave it out when there is no note.
- the frame
- **First stretch:** the span line (for example "About 5 weeks at your pace"), then the actions in order. Each action shows its title, the first action's due day as a date in the browser's time zone with the effort on every action, then what to do and "Done when".
- **Milestones:** the ordered list, with no dates

States:
- generating, with the existing generating state
- failed, with a retry that starts a new generation
- no Plan yet, with a link back to `/path/conversation`

A refresh mid-generation picks up where it is.

Reuse the existing `/plan` components, states and classes. No new classes unless none fits.

## Old and new flows side by side

Until #170, `/plan` keeps its current behaviour for users with a `path_selections` row (the old flow). The new branch applies to users with a current `path_choice`. If a user somehow has both, the new flow wins. Mentor is untouched; it reads the new Plan in #174.

## Out of scope

- Marking actions done, and any mutable state (#52).
- Redo (#168), and what a redo does to an existing Plan.
- Mentor reading the Plan (#174), and removing the old flow (#170).

## Steps

### Step 0: check, then stop and report

No code changes. Say how you'll do decisions 1 to 3 and the page, and flag anything that conflicts with the code: the end message, the header link, the old `/plan` branch, and the polling. Stop and wait.

### Step 1: build

Commit the plan code and prompt as they are first, in their own commit, then build.

### Step 2: live verification

All through the real API, and through the real page at 1280 and 390.
- Two personas (not Nadia) from the full Path flow to a chosen, named path: generation starts by itself, "See your plan" leads to `/plan`, the generating state shows, then the Plan, matching the shape above.
- Naming skipped: the page uses the option's name.
- No note at choice: no "In your words:" block.
- Refresh during generation: the page resumes and shows the Plan when it's ready.
- A forced failure (a test-only preload, not committed): the failed state and retry work.
- The header Plan link works for these users and stays muted for a user with no Plan.
- **Regression:** the old `/plan` for an old-flow user is unchanged, and Mentor, `/identity`, `/dashboard` and `/path` are unchanged.
- Delete every clone by exact id, and report what was deleted.

## Stop conditions

- Stop after step 0.
- If a check fails, stop and report. Add no prompt rules to make it pass.
- Stop if this needs a migration.
