# Brief A — Mentor: grounded rebuild + design + subscription gate

Execution brief for Claude Code. Scaffolding, not a committed artifact.
Read `AGENTS.md` first (branch = `dev`, Next.js docs caveat, session protocol).

This is the first of two briefs. **Brief A = the mentor surface + the entitlement *gate* + the
minimal entitlement plumbing needed to test it.** Brief B (separate session) adds the real
Stripe *subscription billing* that grants the entitlement. Do **no** Stripe work here.

---

## Goal

Turn `/mentor` from what it is today — a second, chat-based copy of the 13-question discovery
flow that renders the identity report inline — into a **grounded, unscripted, subscriber-gated
coaching chat**: "your coach," not a generic chatbot. It opens already knowing who the user is,
which path they chose, and what their plan says, and helps them navigate and stay accountable to it.

---

## Decisions (settled)

1. **Mentor route auth = server-derived.** Resolve the authenticated user **server-side** from the
   cookie session (`utils/supabase/server.ts`); do not trust a body `user_id`/`plan`. This matters
   here specifically because the route loads the user's full profile — trusting a client-supplied
   id would let anyone read another user's identity report/path/plan. (The existing routes share
   the loose pattern but are out of scope; tracked as a separate hardening task.)
2. **Chat model = `process.env.OPENAI_MODEL ?? 'gpt-4o'`.** Env-driven with a 4o fallback,
   consistent with `generate-report`. Drop the hardcoded `gpt-4o-mini`.
3. **Context = distilled.** Inject a compact context block (named identity + primary signature
   names + how-you-operate highlights + chosen path name/thesis + current plan's `start_here`
   actions and phase names), **not** raw artifact JSON. The full report stays viewable on
   `/identity`; on-demand detail recall is a possible later enhancement.
4. **Subscribe CTA = placeholder with final copy (below).** Real subscription checkout is Brief B,
   so the CTA renders but is non-functional (clearly marked TODO). Copy is settled — see §3.

---

## Scope

**In:** `app/api/mentor/route.ts` (rewrite), `app/mentor/page.tsx` (rewrite), `lib/entitlements.ts`
(generalize), `app/api/dev/grant-entitlement/route.ts` (extend), chat styling in `app/globals.css`.

**Out:** all Stripe / subscription-billing work (Brief B). No DB migration — the `entitlements`
table's `product` is free text and `unique(user_id, product)` already allows a user to hold both
`onetime_payment` and `subscription_payment`.

---

## 1. Entitlement plumbing (pure TypeScript, no migration)

`lib/entitlements.ts`:
- Introduce a product type: `type EntitlementProduct = 'onetime_payment' | 'subscription_payment'`.
- Add `hasEntitlement(userId, product)` (generalized form of the current `hasPaidEntitlement`).
- Keep `hasPaidEntitlement(userId)` as a thin wrapper → `hasEntitlement(userId, 'onetime_payment')`
  so existing callers (`select-path`) don't break.
- `grantEntitlement(userId, source, product = 'onetime_payment')` — add the product param with a
  default of `'onetime_payment'` so `verify-checkout`, the Stripe webhook, and the dev route keep
  working unchanged. The unique conflict target stays `user_id,product`.

`app/api/dev/grant-entitlement/route.ts`:
- Accept optional `product` in the body (default `'onetime_payment'`), pass through to
  `grantEntitlement`. Keep the `NODE_ENV === 'production'` guard and the `// DEV ONLY` note.
- This is the test bypass: `POST {user_id, product:'subscription_payment'}` flips a test user to
  subscribed so the gated mentor is fully testable without any real billing.

---

## 2. Mentor route rewrite — `app/api/mentor/route.ts`

**Remove entirely:** `QUESTION_FLOW_PROMPT`, `shouldRunDetection`, `getLastAssistantMessage`,
`runJsonFromPrompt`, the whole `plan === 'free'` report-rendering block, the `AccessPlan` type,
and the imports of `DETECTION_PROMPT` and `LAYER_2_PROMPT`.
(Note: this resolves the deferred `LAYER_2_*` rename concern *for this file* — the import is gone.
`LAYER_2_PROMPT` itself stays in `identity-report.ts`; `generate-report` still uses it.)

**Gate (server-side, defense in depth):** resolve the user from the cookie session; if not
authenticated → 401; if `!hasEntitlement(user.id, 'subscription_payment')` → 403. Mirror the
spirit of `select-path`'s 403.

**Grounding — load and distill, server-side, via the service client:**
- `identity_report` artifact: `artifacts` where `user_id`, `type='identity_report'`,
  `status='ready'` → `content` is `IdentitySignatureReportArtifactContent`.
- Active path selection: latest `path_selections` row (`order created_at desc limit 1`) →
  `{ path_options_artifact_id, path_id }`.
- Chosen path: load that `path_options` artifact (`PathOptionsArtifactContent`); the chosen option
  is `options[].id === path_id` → name / thesis / body / signatures_engaged.
- Path plan: `artifacts` where `type='path_plan'`, matching `path_options_artifact_id` + `path_id`,
  `status='ready'` → `PathPlanArtifactContent`.
- **Defensive:** any piece may be missing (e.g. subscribed but no plan yet). Build the context
  block from whatever exists; never throw on a missing artifact.

**New system prompt (grounded coach).** Replace the scripted questionnaire prompt with a coaching
prompt that:
- Opens personalized — references their named identity and chosen path, then asks what they want to
  work on today (the "What do you want to work on today?" beat, but grounded).
- **Does** give guidance/advice (the old prompt forbade advice — that was for the questionnaire stage;
  invert it here). Helps them act on and stay accountable to their plan's `start_here` actions/phases.
- Keeps the brand voice the old prompt got right: calm, grounded, direct, short clean paragraphs,
  **no therapeutic/soothing language**.
- Stays in career/identity-coaching lane. If a user surfaces serious personal distress, it does not
  play therapist — it responds with care and points toward appropriate human support. Keep this
  proportionate; it's a coaching product, not a crisis tool.
- Never re-runs the questionnaire or generates the identity report (that lives in `/start` +
  `/api/generate-report`).

**Request/response shape.** Input is `{ messages }` (drop `plan`). On the initial trigger message
from the page, return a grounded opening greeting. Otherwise continue the chat with the distilled
context as the system message + conversation history. Use the model per decision #2.

---

## 3. Mentor page rewrite — `app/mentor/page.tsx`

The mentor is now subscriber-only and therefore **always authenticated** — this lets you delete a
lot.

**Remove:** `GUEST_MESSAGES_KEY` and all guest-localStorage logic; `getPlan()`;
`hasCompletedQuestionFlow`; the guest-handoff effect; the `upgradeToLayer2` effect and
`layerUpgradeChecked`/`guestRestoreChecked` state; the "Unlock full identity" button and
`SignupModal` usage; the debug "Conversation ID" line; the custom `<main style={…}>` wrapper
(layout already provides `<main className="app-main">`).

**Gate (client-side, mirror the plan page precedent):**
- `loading` → render nothing.
- Not authenticated → `GatedState` (anonymous copy; e.g. eyebrow "ZYRRO MENTOR").
- Authenticated, read own `entitlements` row directly (RLS allows it) for
  `product='subscription_payment', status='active'`; if absent → inline
  `flow-container gated-container` block with this copy + the **placeholder** Subscribe CTA:
    - eyebrow: `ZYRRO MENTOR`
    - heading: "Your plan is the map. The Mentor walks it with you."
    - body: "The Zyrro Mentor keeps you moving on your chosen path — accountability, momentum, and guidance when you need it."
    - button (`btn-primary`, non-functional placeholder, TODO Brief B): "Start your subscription →"

  Do **not** reuse `GatedState` here — its CTA is hardcoded to the questionnaire, which is why the
  plan page uses an inline block for its unpaid state.
- Subscribed → the chat.

**Keep / clean up:** `ReactMarkdown` assistant rendering; `createConversation` + `saveMessage`
persistence (always persist now — no guest branch); send + Enter handlers. The initial-trigger
effect stays (POST an opening trigger, render the route's grounded greeting).

**Design → parity (decision: do it in this same pass).** Read `app/globals.css` and
`docs/standards/branding-guidelines.md` and build the chat UI from existing design tokens/classes
(`--color-*`, `--font-*`, `--radius-*`, `--spacing-*`, `flow-container`, `eyebrow`, `btn-primary`,
`card`, etc.). The current UI is placeholder-grade (inline styles, bare `<h1>Zyrro</h1>`, raw
input + Send). Add proper chat-message styling (user vs assistant bubbles), a styled input/composer
bar, and a loading indicator consistent with the app's `spinner`. **Do not hardcode color/spacing
literals** — use the `globals.css` vars (drift rule). Add any new chat classes to `globals.css`.

---

## 4. Testing (browser, end-to-end, no billing needed)

1. Run dev. Confirm a logged-in user **without** the entitlement sees the not-subscribed gated
   state (with the placeholder Subscribe CTA), and an anonymous visitor sees `GatedState`.
2. `POST /api/dev/grant-entitlement {user_id, product:'subscription_payment'}` for a test user that
   has already been through report → path → plan.
3. Reload `/mentor`: confirm the grounded opening greeting references their named identity + chosen
   path, that the chat gives plan-aware guidance, that messages persist (refresh restores history),
   and that it never falls into the old questionnaire script.
4. Confirm `/path` and `/plan` one-time gating and their dev grant still work unchanged
   (regression check on the parameterized entitlement layer).
5. Visual parity check against `/plan` / `/identity`.

---

## Out of scope → Brief B (next session)

Recurring Stripe price, `mode:'subscription'` checkout, subscription-lifecycle webhooks
(`customer.subscription.*`, `invoice.*` → grant/revoke `subscription_payment`), and wiring the
real Subscribe CTA. Tested via Stripe CLI forwarding in test mode.
