# Zyrro Product Decisions

All visual specs: docs/standards/branding-guidelines.md
All coding rules: docs/standards/coding-standards.md

---

## URLs
- / — homepage (marketing)
- /start — questionnaire
- /identity — Identity Signature Report
- /path — path options (gated; placeholder content for authenticated users)
- /plan — action plan (gated; placeholder content for authenticated users)
- /mentor — mentor chat (gated; working chat UI with guest/free plan and conversation persistence)
- /dashboard — logged-in home (gated; placeholder content for authenticated users)
- /login — magic link login
- /signup — magic link signup

---

## Bottom Navigation
Logged-in: visible on all pages.
Logged-out: hidden on all pages.
The page handles gating, not the nav.

---

## User States and Deliverables
Anonymous:
- Gated state on all app pages
- /identity: single CTA "Start the questionnaire" → /start
- /dashboard, /path, /plan, /mentor: two CTAs —
  "Log in" → /login and "Start the questionnaire" → /start

Registered (all authenticated users, no tier enforcement yet):
- Identity Signature Report on /identity
  Spec: docs/standards/identity-signature-report.md
- /path, /plan, /dashboard: placeholder "coming soon" content
- /mentor: working mentor chat (guest history handed off on sign-in)

Note: paid/subscriber tier enforcement is not yet implemented
in the code. All authenticated users reach the same content.

---

## Questionnaire (/start)
- Multi-screen, app drives screens, no AI calls
- questions sourced from lib/identity-questions.ts
- To update questions: edit lib/identity-questions.ts
  and keep docs/standards/identity-questions.md in sync
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
- app/api/mentor/route.ts — POST endpoint; handles guest/free
  plan chat and layer 2 upgrade
- lib/conversations.ts — create conversation records
- lib/messages.ts — save messages to DB
- lib/artifact-schemas.ts — artifact type definitions

---

## Standards Files
- docs/standards/coding-standards.md
- docs/standards/branding-guidelines.md
- docs/standards/identity-questions.md
- docs/standards/product-decisions.md
- docs/standards/identity-signature-report.md
- docs/standards/identity-signature-icons.md

---

## Git Workflow
- All development on dev branch
- dev branch = staging site on Vercel
- main branch = live site at zyrro.ai
- Never commit directly to main
- Merge dev to main only when ready to go live
- Commit and push to dev at end of every session

---

## Framework Reference
Foundational framework documents in docs/framework/:
- zyrro_detection_engine_spec_v_1.md
- zyrro_identity_report_blueprint_v_1.md
- zyrro_named_identity_system_v_1.md
- zyrro_narrative_transformation_rules_v_1.md