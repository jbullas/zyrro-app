# 169-plan: Plan for the chosen path

Ticket #169. Depends on #168 (Path conversation), which now stores the chosen path. Design doc: `docs/framework/path-plan-redesign.md`, section "Plan" and open question 2.

## Why

Path ends with a chosen, named path and the line "Your plan for this path comes next", with nothing after it. Plan turns the chosen path and its starting point into action: what needs to happen, and getting the user moving straight away.

## What the design already fixes

- **Two layers:** a milestone outline of the whole journey, from start to where the path leads, and a detailed first stretch of concrete actions.
- **Sized by effort, not days:** the first stretch is a fixed amount of effort spread over the hours the user actually has. Milestone timelines stretch the same way.
- **First action due within a day or two,** whatever the user's pace.
- **Every action ends with something real:** an outcome the user can point to.
- **No detailed long-range steps.**
- For subscribers, Mentor later works from this Plan and updates it (#174, #171). Out of scope here.

Still open (design doc, open question 2): what the milestones and actions contain, and how the Plan is shown. This brief settles that by generating Plans and judging them before any UI is built.

## Principles from #168, applied from the start

- **Code owns the structure:** the number of milestones, the size of the first stretch, due dates from the user's hours. The model fills in content.
- **The user's own words are carried, not reworded:** their note when choosing the path, their risk text, their hours. Where the Plan refers to what they said, it uses their words.
- **No examples in prompts, and no rules aimed at a single case.** If a draft fails, report it; don't add prompt rules to make it pass.

## Decisions on step 0 (Miroslav, 2026-11-09)

1. **Storage:** a new artifact type, `path_conversation_plan`, added to the artifacts type check by a one-line migration. The migration is applied to the Supabase project and confirmed live, not only committed.
2. **What Plan generation sees:**
   - the chosen option (all its parts)
   - the note at choice (`path_choice.note`)
   - the user's risk text verbatim (`risk_time.their_words`)
   - the tapped risk values and hours
   - the confirmed summary card

   It does not see the Identity report. The deadline is context only: no dates are computed from it.
3. **Sizing:** code sizes the plan from the hours band's lower bound. The model fills in the content within that size and can't change the amount. The user's own words shape the content and timing, not the size. Due dates are day offsets from generation.
4. **Where the Plan shows** (the page, the thread or both) is decided in step 2.

## Plan judgement after step 1 (Miroslav, 2026-11-09): the content is good; the shape changes

1. **Milestones have no dates.** They are an ordered list of outcomes. No milestone effort steps or week calculations.
2. **In the first stretch, only the first action has a due date** (within a day or two). The other actions are ordered, each with its effort in hours. Above them, one code-written line gives the stretch's span at the user's pace (for example "About 5 weeks at your pace"), from the hours band as now.
3. **Lengths, checked in code:**
   - frame: up to 300 characters
   - each milestone: up to 250
   - each action: a short title, what to do up to 200, and "Done when" up to 150
4. **The prose never states effort, days or weeks.** The page shows them.
5. **The prose doesn't quote the user.** The page shows their note at choice verbatim and code-owned, like the risk note, so the Plan speaks in plain second person.

These describe what the Plan is; there are no rules aimed at single cases. The three step 1 Plans are regenerated from the inputs saved in that run, without rerunning Path.

## Steps

### Step 0: audit, then stop and report

No code changes.
1. What `/plan` does today, what it reads, and what can be reused (page, components, styles).
2. What Path stores that Plan can start from: the chosen option (all its parts), its starting point, the user's note at choice (`path_choice.note`), the risk text (`risk_time.their_words`), the tapped risk values, the hours, the deadline in the profile, and the confirmed summary.
3. Whether #52's task model (milestone completion tracking) fits a Plan of milestones plus first-stretch actions with due dates, or what the smallest data model is. Say whether it needs a migration.
4. How the user gets from the end of Path to Plan today, and what the "Build my plan" handoff needs.
5. Anything in the design that the code makes harder than it looks.

Stop and wait.

### Step 1: content before UI

- Write a first Plan prompt and a script that generates a Plan from stored Path data. No page, no saving to the user's account.
- Run full Path flows for three personas (Dana, Priya and Marcus or Tom; not Nadia) through to a chosen path, each with a note at choice. Generate one Plan each.
- Report each Plan in full, as plain text, together with the chosen path, the starting point, the note at choice, the risk text and the hours it was built from.
- Delete every clone by exact id.

Stop and wait. Miroslav judges the Plans and decides the shape before step 2.

### Step 2: build (after Miroslav's decision)

Briefed separately from the step 1 decision: storing the Plan, the `/plan` page, and the "Build my plan" handoff that replaces "Your plan for this path comes next".

## Stop conditions

- Stop after step 0 and after step 1.
- Stop if Plan would need a migration not agreed in step 0.

## Out of scope

- Mentor reading or updating the Plan (#174, #171).
- Removing the old Path flow and the old `/plan` data (#170).
- Guardrails and redo for Path, the adjust-options UX, and the conversation-quality list: later in #168.
