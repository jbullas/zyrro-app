# Zyrro Product Decisions

All visual specs: docs/standards/branding-guidelines.md
All coding rules: docs/standards/coding-standards.md

---

## URLs

`app/` is the source of truth for which routes exist.
This section is the tier/purpose map, not the route source.

- / — homepage (marketing)
- /start — questionnaire
- /identity — Identity Signature Report (Registered)
- /path — Your Path Options (Paid (one-time); paywall gated)
- /plan — Your Path Plan (Paid (one-time); paywall gated)
- /mentor — mentor chat (guest and Registered; conversation persistence)
- /dashboard — logged-in home (Registered; placeholder content)
- /login — magic link login
- /signup — magic link signup

---

## Bottom Navigation
Logged-in: visible on all pages.
Logged-out: hidden on all pages.
The page handles gating, not the nav.

---

## User States and Deliverables

Canonical tier labels: **Anonymous** · **Registered** · **Paid (one-time)** · **Subscriber**

Anonymous:
- Gated state on all app pages
- /identity: single CTA "Start the questionnaire" → /start
- /dashboard, /path, /plan, /mentor: two CTAs —
  "Log in" → /login and "Start the questionnaire" → /start

Registered (authenticated users on the free plan):
- Identity Signature Report on /identity
  Spec: docs/standards/identity-signature-report.md
- /mentor: working mentor chat (guest history handed off on sign-in)
- /path, /plan: paywall gated (Paid (one-time) required)
- /dashboard: placeholder "coming soon" content

Paid (one-time):
- Registered deliverables, plus:
- /path — Your Path Options
  Spec: docs/framework/zyrro_path_plan_blueprint_v_1.md
- /plan — Your Path Plan
  Spec: docs/framework/zyrro_path_plan_blueprint_v_1.md

Subscriber:
- Tier label established; no subscription entitlement or gating
  exists in code. Stripe checkout is one-time payment only
  (`mode: 'payment'`). Future tier.

---

## Questionnaire (/start)
- Multi-screen, app drives screens, no AI calls
- `lib/identity-questions.ts` is the single source
  for question text and hints
- One question per screen with progress bar
- Back and Continue navigation
- Continue disabled until textarea has
  at least 1 character
- Answers stored in localStorage as
  zyrro_discovery_answers
- After last question: generating screen (animated,
  no AI call), then contact collection screen

---

## Registration Flow
- Magic link (passwordless) only
- No password field anywhere in the app
- Contact collection screen at end of /start:
  - Collects name and email
  - Calls supabase.auth.signUp (random UUID
    password, magic link via emailRedirectTo)
  - Sets display_name in Supabase auth metadata
  - Immediately POSTs to /api/generate-report:
    upserts profile row, inserts discovery_answers,
    starts report generation in background
  - Saves name to localStorage as zyrro_user_name
  - CTA: "Get my Identity Report"
- Check your email screen follows
- After magic link confirmed:
  - Redirects to /identity

---

## /identity Page States
State 1 — Anonymous:
- Gated, no report content
- Single CTA: "Start the questionnaire" → /start

State 2 — Registered, questionnaire complete, report generating:
- Spinner with "Your Identity Signature Report is being prepared"
- Polls artifacts table every 3 seconds until status changes

State 3 — Registered, questionnaire complete, report ready:
- Full Identity Signature Report

State 4 — Registered, questionnaire complete, generation failed:
- Error message with disabled "Try again" button

State 5 — Registered, no questionnaire:
- Prompt to complete questionnaire → /start

---

## AI Pipeline
LLM-agnostic. No model names or provider
specifics in this document. All provider
configuration in environment variables only.

Step 1 — Identity Analysis
File: lib/prompts/identity-analysis.ts
Input: discovery answers
Output: structured signature JSON

Step 2 — Identity Report Generation
File: lib/prompts/identity-report.ts
Input: identity analysis JSON
Output: full Identity Signature Report JSON

Both fire after registration, in the background.
Report stored as versioned artifact in
artifacts table (type: identity_report).

---

## Key Source Files
- lib/identity-questions.ts — question text and hints
- lib/prompts/identity-analysis.ts — analysis prompt
- lib/prompts/identity-report.ts — report generation prompt
- app/api/generate-report/route.ts — POST endpoint; upserts
  profile, inserts discovery_answers, fires pipeline
- app/api/mentor/route.ts — POST endpoint; handles guest and
  Registered (`free` plan) chat, and generates the **Registered**
  Identity Signature Report when a guest who completed the
  questionnaire registers (**guest → Registered**)
- lib/conversations.ts — create conversation records
- lib/messages.ts — save messages to DB
- lib/artifact-schemas.ts — artifact type definitions

---

## Standards Files
- docs/standards/coding-standards.md
- docs/standards/branding-guidelines.md
- docs/standards/product-decisions.md
- docs/standards/identity-signature-report.md
- docs/standards/identity-signature-icons.md

---

For git workflow, see `AGENTS.md`.

---

## Framework Reference
Foundational framework documents in docs/framework/:
- zyrro_detection_engine_spec_v_1.md
- zyrro_continuity_memory_blueprint_v_1.md
- zyrro_identity_report_blueprint_v_1.md
- zyrro_named_identity_system_v_1.md
- zyrro_narrative_transformation_rules_v_1.md
- zyrro_path_plan_blueprint_v_1.md

---

## Mentor & Continuity — Philosophy Decisions (2026-07-01)

1. Mentor mode is Zyrro-detected by default, with manual override always
   available. Rationale: the mentor should adapt (support / accountability /
   challenge) to the user's current state on its own, while still letting the
   user override it at any time. Note: this supersedes/extends ticket #15,
   which was scoped as user-selected only.

2. The Reframe (/path, Section 3) should fold in emerging_signatures when
   active, biasing the reframe toward forward-direction language rather than
   pure reinterpretation, without exposing it as a separate "new identity"
   mechanic. Rationale: transparency and consent are satisfied by the reframe
   being evidence-backed and earned, not by a disclosure step. (Implementation
   tracked separately as its own low-priority ticket.)

3. Continuity ("who we said this person is, what path they chose, how today
   connects") surfaces on the Dashboard. The memory table is owned by the
   mentor/continuity system: it stores a per-user working model — named
   identity, chosen path/Project, and rolling session summaries — which the
   mentor reads for continuity and the Dashboard displays. Rationale: this
   resolves the open ownership question noted at the time this doc was first
   written.

4. Zyrro is a daily companion, but its purpose is to progress the user toward
   their chosen path ("Northern Star") through real action and real-world
   people, not to become a substitute relationship. Rationale: this should
   inform the mentor's system prompt design when that work happens.