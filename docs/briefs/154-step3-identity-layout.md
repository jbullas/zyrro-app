# #154 Step 3: Identity Report layout and app shell

**Ticket:** #154 Identity Report redesign, step 3 of 4 (layout and app shell).
**Planning context:** `docs/briefs/identity-report-redesign.md` (decisions 1-17, page outline, field mapping). Read it first. It is planning-only; this file is the one to execute.
**Layout reference:** `docs/briefs/154-step3-v3-mockup.html` (the V3 artboard source, a Design canvas component, not app code). Use it for spacing, sizes, colours and breakpoints. Where it disagrees with this brief or the planning brief's decisions, the briefs win (listed under "Mockup differences").
**Depends on:** step 1 (commit `0ccb77d`): `signature_deep_dives`, `pairings`, `distinctive_pattern`, `pattern_to_notice`, schema `1.4`.
**Out of scope:** step 2 static copy (final wording), step 4 existing-report fallback or regeneration, #136 Direction UI, #54 homepage header.

## Part A: app shell (header nav replaces BottomNav)

1. `components/Header.tsx` becomes the V3 header: gradient background, inner container max-width 1160px. Left: logo + tagline "Know Yourself. Create What's Next." Right: main nav (Dashboard, Identity, Path, Plan, Mentor) then the existing account avatar / login link (keep their current logic).
2. Nav behaviour carries over from `components/BottomNav.tsx` unchanged: same items and hrefs, same muted items (Dashboard, Plan, Mentor) with the "Coming soon" feedback on tap, same active rule (including `/start` highlighting Identity), same visibility rules (hidden on `/`, hidden on `/start` when logged out or auth unchecked). Active item: white, bold, translucent pill. Muted: 45% white. Other: 90% white.
3. Under 700px the nav collapses to a menu button (44px target, `aria-label`, `aria-expanded`) that opens the same items as a list. Keyboard accessible, closes on selection and on Escape.
4. Delete `components/BottomNav.tsx`, its import in `app/layout.tsx` and its CSS. Remove any bottom padding that existed only to clear the bottom nav.
5. Update `docs/standards/branding-guidelines.md`: header now carries the main nav; remove "Navigation via bottom nav only" and the Bottom Navigation section; the gradient "Bottom nav active indicator" placement goes.
6. Other pages keep their current content width and styling. Only the header changes for them.

**Stop after Part A** with the verification below (Part A checks only).

## Part B: /identity layout

Wide page: max-width 1160px, multi-column rows collapsing at 1000px and 700px as in the mockup. One layout for desktop and mobile.

### Sections, top to bottom

| # | Section | Data |
|---|---|---|
| 1 | Hero card: eyebrow "Your Identity at a Glance", H1, "Prepared for [name]", thesis headline, thesis summary | `cover.named_identity`, `cover.prepared_for`, `cover.identity_thesis`, `constellation_synthesis.synthesis`. No identity context, no badge. |
| 2 | Domain Profile card beside the hero: explanation line + 5 gradient bars, each with its score (10-100) | `domain_profile`. No signature names on the bars. |
| 3 | "Your Primary Signatures": 5 cards (badge, name, domain, short definition, band pill) | `primary_constellation[]`; band from existing `getScoreBand`; short definition from `lib/signatures.ts` `description` (placeholder until step 2). No numbering, no score. |
| 4 | Hero Path CTA card (light orange tint, orange border) | Static copy (see Copy). |
| 5 | "Your Signatures in Depth": score explanation line + one row per signature: 5 primaries, then up to 3 secondaries greyed | Rows: badge, name, domain, bar, "x/25", toggle. Secondaries: grey shield, grey bar, muted text, not labelled "secondary". Score from `primary_constellation[].score` / `secondary_signature_analysis[].score`. A score below 1 (#92) shows no bar fill and "–" instead of "0/25". |
| 6 | Expanded card (row toggle, all closed by default, several may be open) | See "Expanded card". Active card gets the 1.5px accent border. |
| 7 | Two columns: "How Your Signatures Work Together" + "Your Distinctive Pattern" | `pairings[]` (title "A + B", line); `distinctive_pattern.steps` as chips with arrows + its two paragraphs. |
| 8 | Two columns: "What Gives You Energy" (green +) and "What Drains You" (red –) | `energisers`, `friction_points`. Reuse the existing `.energiser-bullets` / `.friction-bullets` classes and the `--color-success` / `--color-failure` tokens in `globals.css`. |
| 9 | Path invitation text line + "See how Path works" link | Static copy; link to `/path`. |
| 10 | "The Pattern to Notice" | `pattern_to_notice.headline`, `.body`, `.takeaway` (bold). |
| 11 | Large CTA strip (the only gradient surface on the page besides header, badges and bars) | Static copy, white button, price line. |
| 12 | Footer: disclaimer, logo + tagline, Privacy / Terms / Help | Only link pages that exist; omit any that don't. No dead links. |

### Expanded card

1. Headline definition (large): placeholder from `lib/signatures.ts` until step 2. Personal line: the signature's `core_statement`.
2. Main column: "What this means" (`what_this_means[0]`, `[1]` as two paragraphs) and "Evidence from your story" (`evidence[].text`, gradient rule beside each).
3. Side column: "How this shows up in your life" (`shows_up`), "Where this serves you" (`serves_you`).
4. "Works with": one mini-block per `works_with` entry: partner name (with its badge), `text`, `evidence`. Not the pill row from the mockup (decision 14).
5. "How it shapes the way you operate": 4 tiles from `operating.at_work / thinking / with_people / deciding` (labels At work, Thinking, With people, Deciding).
6. "Potential friction" (`friction`) and "Under pressure" (`under_pressure`) side by side on the warm tint.

Every sub-heading in the card uses the grey eyebrow style (11px, uppercase, letter-spaced, grey): What this means, Evidence from your story, How this shows up in your life, Where this serves you, Works with, How it shapes the way you operate, Potential friction, Under pressure. None of them is a bold heading.

### Missing data (rules for this step only; step 4 decides the real fallback)

- Look up each signature's deep dive by `name` in `signature_deep_dives`. A signature with no deep dive (0 evidence units, a failed Layer 3 call, or a pre-1.4 report) shows its row without a toggle. Its row still renders.
- Any report-level section whose field is missing (`pairings`, `distinctive_pattern`, `pattern_to_notice`) is omitted, including its column; the paired column takes the full width.
- A pre-1.4 report must render without errors: hero, domain bars, signature cards, rows (no toggles), energy/drains, CTAs, footer.
- `what_this_means` may arrive as a string on any report generated between the step 1 iterations; render a string as one paragraph rather than failing.

### Removed from /identity

Radar chart, Signature Profile chart, score chips (frequency/intensity/score/confidence), identity context, How You Operate section, `ReframeCtaBlock` (reframe teaser), About This Report / Research foundation, Q&A list. After removal, delete any component no longer imported anywhere (check `/dashboard` and other pages first; `IdentityCard` and the dashboard may still use the radar or bars). Generating, gated and error states stay as they are.

### Copy (placeholders for step 2)

Put every static string for this page in one module, `lib/identity-report-copy.ts`, so step 2 only edits that file:
- Domain explanation: "How strongly each of the five identity domains shows up in your answers, compared with each other."
- Score explanation: "Score out of 25: how often and how strongly each pattern appears in your answers."
- Hero CTA: "Your identity points somewhere." / "Path turns these signatures into possible directions, shaped by what you want and what you won't accept." / button "Find your path" / "One-time payment of $49".
- Path invitation: "These two lists are where Path starts: you'll choose what a good direction must have and must avoid." / "See how Path works".
- Bottom CTA: "Your identity points somewhere. Find your path." / "[STEP 2 COPY: value and benefits of Path]" / button "Find your path" / "One-time payment of $49".
- Footer disclaimer: "This report is a reflective interpretation of recurring patterns in your answers. It is designed to help you recognise how you naturally think, create and operate, not to place you inside a fixed personality type."

Copy rules (planning brief decision 12): no "four paths are ready", no 7-day plan, no mentoring claims.

### CTA behaviour

Both "Find your path" buttons must do exactly what today's `/identity` CTA does (`ReframeCtaBlock` / `handleCheckout`): start checkout for users without the one-time entitlement, go to `/path` for users who have it. Investigate and report the current behaviour before building; do not change the entitlement or checkout logic.

### Styling

- **Reuse first.** No new class, token or component where an existing one does the job. `globals.css` already has, among others: `.card`, `.section`, `.eyebrow`, `.cover`, `.named-identity`, `.prepared-for-line`, `.identity-thesis`, `.core-statement`, `.documentation`, `.sig-row`, `.sig-info`, `.sig-name`, `.sig-name-meta`, `.sig-bar-track`, `.sig-bar-fill`, `.sig-bar-fill-muted`, `.sig-score-label`, `.sig-score-label-muted`, `.constellation-card*`, `.constellation-badge`, `.constellation-badge-muted`, `.score-band-pill`, `.band-dominant/strong/moderate`, `.tension-block`, `.bullet-list`, `.energiser-bullets`, `.friction-bullets`, `.btn-cta`, `.btn-link`, `.section-cta`, `.row-between`, the `gap-*` / `mb-*` utilities, and components `IdentityBadge`, `PrimaryButton`, `SecondaryButton`, `LinkButton`. Adjust an existing class (checking its other call sites first) before adding a near-duplicate.
- A new class is allowed only for something no existing class covers (e.g. the multi-column grids and their breakpoints). The investigation report must include a table mapping every mockup element to the existing class or component it will use, and list each proposed new class with the reason no existing one fits. Planning approves that list before any CSS is written.
- Same rule for tokens: existing tokens first (`--color-grad-2` is already the magenta `#C60567`; `--color-success` / `--color-failure` for the bullets). Only values with no existing token become new tokens (candidates: hero CTA tint `#FFF1EA`, friction tint `#FFF6F1`, panel `#FAF9F7`, bar track `#EFEDE8`, secondary grey `#A9A6AE`, link `#A0044F`); confirm each against `globals.css` first. No hardcoded hex in components (branding guidelines).
- Styles go in `globals.css` classes, not inline (per #19).
- Badges reuse the `IdentityBadge` shield and the signature icon map; add a size prop and a grey variant rather than a second icon map.
- Touch targets at least 44px; real `<button>` for toggles with `aria-expanded` and `aria-controls`.

### Mockup differences (the briefs win)

- Domain bars in the mockup show signature names; decision 4 says no labels.
- "Works with" in the mockup is a pill row ("Works closely with" + partner names). Decision 14 says one mini-block per partner (partner name with badge, 2-3 sentences on what the partner does for this signature, one piece of evidence). Build the mini-blocks.
- The mockup styles "How this shows up", "Where this serves you", "Potential friction" and "Under pressure" as bold headings; all card sub-headings are grey eyebrows (decision 17).
- The mockup's energy/drains markers are black and grey; they are green + and red – (existing tokens).
- The mockup's bottom CTA price line reads "Adventurer · one-time payment of [PRICE]"; drop "Adventurer". The line is "One-time payment of $49".
- The mockup opens the first row by default; all rows start closed.
- The mockup's bottom CTA copy describes the Path steps; decision 12 forbids that. Use the placeholder above.
- Mockup content is sample text for one person; render real report data.

## Verification

1. **Investigation report first (stop):** the mockup-element-to-existing-class/component table and the proposed new classes and tokens with reasons (see Styling); current CTA behaviour (who sees checkout vs `/path`); every component and CSS class that becomes unused; which footer link targets exist; how the header and nav currently behave on `/` and logged-out `/start`. Wait for approval.
2. `npx tsc --noEmit` and `npx next build` clean after each part.
3. **Part A live check** (`scripts/run-verification.mts`, synthetic logged-in user): nav renders in the header on `/dashboard`, `/identity`, `/path`, `/plan`, `/mentor`, `/account`, logged-in `/start`; correct active item on each; muted tap shows "Coming soon" and does not navigate; Identity and Path navigate; no BottomNav element anywhere; hidden on `/` and logged-out `/start`; at 390px width the menu button opens and closes the nav. Screenshots at 1280 and 390 of `/identity` (old layout) and `/path`. **Stop.**
4. **Part B live check:** seed a synthetic user with a fresh 1.4 report generated by the current pipeline (include one signature with no deep dive). At 1280 and 390: every section renders with real data; each row expands and collapses; the no-deep-dive row has no toggle; secondaries are greyed; a score below 1 shows "–"; both CTAs behave as before for an unpaid and a paid user. Then seed a pre-1.4 report and confirm it renders without errors under the missing-data rules. Save full-page screenshots for both reports at both widths and list their paths so they can be attached to planning.
5. Re-run step 1's verification 4 Direction leg only (must-haves/must-avoids still render from the same report on `/path`).

## Stop conditions

- After the investigation report.
- After Part A.
- If keeping current CTA behaviour would require changing entitlement or checkout code: stop and report.
- If any `/path`-read field would need to change: stop and report.

## Done when

Part A and Part B live-verified as above, screenshots reviewed by planning, committed to `dev`. Then, in separate commits per the brief lifecycle: delete `docs/briefs/154-step1-identity-report-content.md` (step 1 fields now render), this brief and `docs/briefs/154-step3-v3-mockup.html`. `docs/briefs/identity-report-redesign.md` stays until #154 is Done. #154 stays Started (steps 2 and 4 remain).
