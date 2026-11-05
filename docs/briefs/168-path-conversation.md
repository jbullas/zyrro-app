# Brief: Path conversation (profile, options and choice)

## Context

Path is being rebuilt as a guided conversation on the Mentor chat engine. The product design is in `docs/framework/path-plan-redesign.md`. Read it in full first; it is the source for every product rule in this brief (profile items, conversation order, the "enough" rule, summary, three options, option contents, naming, redo, guardrails, returning to the conversation).

The Mentor engine investigation found that Mentor's browser owns the conversation: it creates the conversation row, saves messages itself and resends the full history every turn, and `app/api/mentor/route.ts` trusts that history. Path can't work that way. Budgets, one conversation per purchase and the saved profile can only be enforced if the server owns the conversation.

Access: users with an active `onetime_payment` entitlement.

## Decisions already made

1. **One set of tables.** Path conversations live in the existing `conversations` and `messages` tables, with a new `kind` column on `conversations` (`mentor` or `path`, existing rows `mentor`). `listConversations` (`lib/conversations.ts`) and `resolveMetaBundle` (`lib/meta-bundle.ts`) filter to `kind = 'mentor'`, so Path conversations never appear in Mentor's list or the dashboard meta-bundle.
2. **Server-owned turn handler.** New shared server function: check login, check the entitlement passed in, load the conversation by id and confirm ownership, build context (builder passed in), call the AI, save both messages with server credentials, track tokens, return the reply. The browser sends only the conversation id and the new message (or the tapped choice).
3. **Path uses the new handler. Mentor is not changed** in this work, apart from the shared chat component extraction (step 2), which must not change Mentor's behaviour or rendering.
4. **No streaming.** Each turn returns one JSON response.
5. **Built alongside the current flow.** The new flow lives at a temporary route under `/path/` (propose the name in step 0). The current Direction / Options / Your Path flow at `/path` stays untouched and working. It is removed later, in separate work.

## Reuse

- `lib/llm.ts`: `getChatCompletionDetailed` (token usage), `response_format: { type: 'json_object' }`, `withRetry`, and a retry setting modelled on `MENTOR_RETRY`.
- `getCurrentArtifact` (`lib/artifacts.ts`), `hasEntitlement` (`lib/entitlements.ts`).
- The 13 answers: `discovery_answers` plus `mergeAnswersWithQuestions` (`lib/identity-questions.ts`).
- The Identity report: the latest ready `identity_report` artifact, read server-side.
- The existing project-naming system, for naming the chosen path only.
- The Mentor bubble markup and `.mentor-*` styles, through the shared component. No new CSS classes where existing ones work.

## Step 0: plan (report only, no code)

Report:

1. **Migration SQL** (as text, not applied): `conversations.kind`; token tracking on the conversation (running total and budget); a per-conversation profile store, writable only by the server (no client insert/update policy); a nullable JSON choices column on assistant messages and a record of which choice was tapped on the user message; storage for the summary, the three options and the chosen path. Say where the chosen path and the options are stored, and why (new artifact type or new table), keeping in mind Plan and Mentor will read the chosen path later.
2. **Profile JSON shape:** the seven items, each with value, status (known, inferred, missing, confirmed, not known) and source (questionnaire, report, conversation).
3. **Seeding step:** how the profile is pre-filled from the 13 answers and the report before the first message (one LLM call or more, inputs, output shape).
4. **Turn contract:** request and response shapes for the Path API; the per-turn LLM output (reply, profile updates, optional choices); how the prompt is built from the system prompt, the saved profile and the last N messages.
5. **Prompt approach** for the conversation, summary and option generation, at outline level. Apply the repo learnings: no worked examples or quotable sentences in prompts (the model copies them verbatim at temperature 0); describe failure modes abstractly.
6. **Route name** for the temporary page, and the file list: new files, changed files, the shared chat component boundary.
7. **Open questions** for anything the design doc leaves open that blocks the build. Leave the doc's other open items to be settled during build.

Then stop for approval.

## Build steps (each its own commit, stop after each for approval)

1. **Migration.** Write the approved migration. Miroslav applies it in the Supabase SQL Editor. Confirm it is applied (columns, policies) before continuing. Add the `kind = 'mentor'` filters. Live check: Mentor's conversation list and the dashboard render identically to before.
2. **Shared chat component.** Extract the message list, bubbles, typing indicator and input from `app/mentor/page.tsx` into a component with an extras slot under assistant messages (for tap choices). Mentor uses it. Live check: Mentor's DOM identical to before, unsubscribed and subscribed, at 1280 and 390.
3. **Conversation.** Server-owned turn handler, Path API route, seeding step, the temporary page, tap choices, saving and resuming from the saved profile plus recent messages, read-back. One Path conversation per purchase, created by the server.
4. **Summary, options and choice.** Summary to confirm or correct; three options with the strongest fit marked and explained; adjusting when none lands; choosing one; naming the chosen path.
5. **Guardrails and redo.** Token budget per purchase across all sittings, with wrap-up (summary, then options) when it runs out; stall detection; message length cap; rate limit; lenient on topic, never ending the conversation on the model's judgement; one redo with its own smaller budget, starting from the confirmed profile. Propose the numeric values in this step.

## Live verification

Use `scripts/run-verification.mts` with synthetic users, cleaned up by exact id. Report full, uncollapsed output.

- Access: no entitlement and `identity_unlock` only get no Path conversation (page and API); `onetime_payment` does.
- Ownership: a user can't read or post to another user's conversation; the browser can't write the profile, messages or token totals directly.
- Steps 3 to 5: at least three synthetic personas that differ in risk appetite and clarity of direction (one with no idea, one with a specific idea), each run end to end. Paste the full transcripts, profiles and options so Miroslav can judge whether the conversation feels on point and the options feel true.
- Resume mid-conversation; read back after options; redo; budget exhaustion still ends with options.
- Mentor, `/path` (current flow), `/identity` and `/dashboard` unchanged.

## Stop conditions

- Anything in the design doc contradicts this brief: stop and ask.
- Any change to the current `/path` flow, `/identity`, or Mentor's behaviour: stop.
- Mentor or dashboard rendering differs after steps 1 or 2: stop and report the diff.
- A migration is needed beyond the one approved in step 0: stop and propose it.
- Typecheck, lint or build fails: stop and report. Don't paper over type errors.
