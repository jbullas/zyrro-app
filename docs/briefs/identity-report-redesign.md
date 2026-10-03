# Identity Report Redesign — Planning Brief

**Status:** Ticketed as #154, not yet built.
**Last updated:** 2026-10-03
**Design canvas:** "Identity Report Mockup (Zyrro brand)" artifact, artboard **V3, Claude's version** (private; share from the canvas Share menu before sending to Jeff). The other two artboards are Jeff's mockup recoloured to Zyrro brand (V1) and the sparing-colour variant (V2), kept for comparison.

## Background

- Jeff sent *ZYRRO — Identity Report UX Redesign Edit Suggestions* (10 points + success criteria). Objective: make the Identity Report immediately understandable, genuinely personal and naturally connected to Paths. Success test: within ~10 seconds a first-time user can answer "Who am I according to Zyrro?", "What are my five primary signatures?" and "What is the next thing I can do?"
- Miroslav replied on 2026-09-23 (agreed items, concerns, six open questions). Jeff has not yet answered those questions in writing.
- Jeff then sent *ZYRRO Identity Text Snapshot*: rewritten report text (not designed) for The Illuminating Originator. It introduces "Your Distinctive Pattern", "The Pattern to Notice" and a closing disclaimer, and rewrites the signature one-liners. V3 uses this text as its sample copy.
- Neither PDF is in the repo. Their content that matters is captured below.

## Decisions made

1. **Navigation:** drop BottomNav completely; main nav moves into the header (all pages, not just /identity). Phase 1: Dashboard, Plan, Mentor shown muted. Mobile: nav collapses to a menu button. `docs/standards/branding-guidelines.md` ("Navigation via bottom nav only") must be updated.
2. **Layout:** wide desktop page (max-width ~1160px) with multi-column rows that collapse to a single column on mobile. One layout, not separate desktop and mobile designs.
3. **Hero visual:** no photo, no identity badge in the hero. Hero row 1 is the identity text card next to the domain chart.
4. **Charts:** two charts, measuring different things. Domain Profile = gradient bars showing each domain's score (10–100, computed in code), plus a one-line explanation of what it measures; no signature labels on the bars. Signature scores = the bars inside the signature rows. The radar chart, the separate Signature Profile chart and the Frequency/Intensity/Score/Confidence chips are removed.
5. **Scores:** signature scores are shown once only, in the signature rows (bar + "x/25"), with the explanation "Score out of 25: how often and how strongly each pattern appears in your answers." Hero cards show the band word only (Dominant / Strong / Moderate). Domain scores appear only on the domain bars.
6. **Signature badges:** every signature (cards and rows) shows its own badge, i.e. the identity-badge shield with that signature's Tabler icon. Secondary signatures use a grey shield.
7. **Secondary signatures:** shown as rows 6–8 directly under the primaries, not labelled "secondary", with accent colours greyed out (grey badge, grey bar, muted text).
8. **How You Operate:** section removed. Its five findings (work, thinking, relationship, decision, stress) move into each expanded signature card.
9. **Your Answers (Q&A):** removed from the report. No reference to the answers anywhere on the page.
10. **About This Report:** removed. Replaced by Jeff's closing disclaimer in the footer.
11. **Read deeper insight:** no extra step. A row's toggle opens the full signature content directly.
12. **Path CTAs:** three placements (hero row 3, text link after Energy/Drains, large gradient strip at the end). Copy must be honest: no "four paths are ready", no 7-day plan, no mentoring. Copy sells value and benefits, not the steps of the Path flow ("tell Zyrro what you want" reads as more work). Price line: "One-time payment of $49".
13. **Hero CTA card:** light orange tint (`#FFF1EA`) with an orange border. The gradient stays reserved for the bottom CTA strip, per the brand rules.
14. **Pairings:** two levels. The "How Your Signatures Work Together" section shows 2–3 pairings as one short line each. Each expanded signature card has a "Works with" sub-section with a mini-block per partner (partner name, 2–3 sentences on how the two interact, one piece of evidence). Pairings are generated per signature (each signature's 1–2 strongest partners), written from that card's side: Illuminator's card says what Originator does for Illuminator, Originator's card says what Illuminator does for Originator. The two directions must say different things. The section's short lines are drawn from the same data, so section and cards cannot contradict.
15. **Pairings vs Distinctive Pattern:** both stay. Pairings = how two specific signatures interact. Distinctive Pattern = the overall sequence the signatures form together.
16. **Energy / Drains items:** each item is a short phrase (about 3–6 words, fits on one line) that reads as a direct answer to its heading's question, e.g. "Exploring untested ideas", "Slow, political decisions". Not a single word, not a full sentence.
17. **Sub-headings:** all sub-headings inside the expanded signature card use the grey eyebrow style, one level below the magenta section eyebrows.

## Page outline (V3)

| # | Section | Content |
|---|---|---|
| 1 | Header (page width) | Logo + tagline, main nav, account |
| 2 | Hero row 1, card 1 | Eyebrow "Your Identity at a Glance" · H1 named identity · "Prepared for [name]" (no identity context) · thesis headline · thesis summary |
| 3 | Hero row 1, card 2 | Domain Profile: explanation line + 5 gradient bars, each with its domain score (10–100) |
| 4 | Hero row 2 | Eyebrow "Your Primary Signatures" · 5 cards: badge, name, domain, short definition, band word (no numbering, no score) |
| 5 | Hero row 3 | Path CTA card: "Your identity points somewhere." + one-line explanation + "Find your path" button |
| 6 | Signature rows | Score explanation line · 8 full-width rows (5 primary + 3 secondary greyed): badge, name, domain, bar, score, toggle. Closed by default. |
| 7 | Expanded signature card | See below |
| 8 | Two columns | How Your Signatures Work Together (2–3 pairings, one short line each) · Your Distinctive Pattern |
| 9 | Two columns | What Gives You Energy · What Drains You (+/– markers, one-line phrases answering the heading) |
| 10 | Path invitation 2 | Text link: these two lists are where Path starts (must-haves / must-avoids) |
| 11 | The Pattern to Notice | Strength-vs-tension section |
| 12 | Large CTA | Gradient strip: "Your identity points somewhere. Find your path." + value and benefits of Path + "One-time payment of $49" |
| 13 | Footer | Disclaimer · logo · Privacy / Terms / Help |

### Expanded signature card

1. Header row: badge, name, domain, bar, score, collapse toggle (active card gets the 1.5px accent border)
2. Headline definition (large) + personal line
3. Main column: **What this means** (2 paragraphs) · **Evidence from your story** (3 observations grounded in the user's answers)
4. Side column: **How this shows up in your life** (list) · **Where this serves you** (list)
5. **Works with:** one mini-block per partner signature (1–2): partner name, 2–3 sentences on how the partner shapes this signature, one piece of evidence. Written from this card's side.
6. **How it shapes the way you operate:** 4 tiles — At work · Thinking · With people · Deciding
7. **Potential friction** + **Under pressure** side by side, on a light warm tint

All sub-headings in the card use the grey eyebrow style.

## Content: existing fields → new sections

| New section | Source today | Change |
|---|---|---|
| H1 | `cover.named_identity` | none |
| Prepared for | `cover.prepared_for` | none |
| Identity context | `cover.identity_context` | **retire**: remove from /identity, from the Path report cover line (`PathReportFlow`), from Path report generation and `app/api/path-report`, and from the identity prompt and schema |
| Thesis headline | `cover.identity_thesis` | none (check tone against Jeff's snapshot) |
| Thesis summary | `constellation_synthesis.synthesis` | check length (Jeff: 80–120 words) |
| Domain bars + scores | `domain_profile` (code-computed, 10–100) | display only |
| Domain profile summary | `domain_profile_summary` (generated paragraph under today's radar) | remove from page and prompt |
| Card short definition | `lib/signatures.ts` `description` | replace with Jeff-style headlines ("Brings clarity to complexity."): static, all 25 to be written |
| Row bars + score | `primary_constellation[].score`, `secondary_signature_analysis[].score` | display only |
| Personal line | `core_statement` | likely reuse |
| What this means + Evidence | `evidence_analysis` (read by /path) | **new** separate fields; `evidence_analysis` keeps being generated unchanged for /path; evidence must cite real answers |
| Shows up / Serves you | none | **new** generated lists |
| Operate tiles + Under pressure | `how_you_operate` (once per report, read by /path Options and Mentor) | **new** per-signature fields; report-level `how_you_operate` keeps being generated, only stops being displayed |
| Potential friction | `tension` | rename, possibly lengthen |
| Works with (card) | none | **new** generated: per signature, 1–2 partners, written from this signature's side; each 2–3 sentences + evidence |
| Secondary rows (expanded) | `secondary_signature_analysis` (core_statement + analysis only) | **new**: same full structure as primaries |
| Pairings (section) | none | top 2–3 pairings as one short line each, drawn from the same per-signature pairing data |
| Distinctive Pattern | none | **new** generated: 3–5 step sequence + 2 paragraphs |
| The Pattern to Notice | none | **new** generated: headline, body, one-line takeaway |
| Energy / Drains | `energisers`, `friction_points` (seed /path Direction, feed Path report) | prompt change: one-line phrases (3–6 words) that answer the heading's question; done together with #136 |
| Path CTAs | `reframe_teaser` → `ReframeCtaBlock` | /identity uses static copy (value and benefits, "One-time payment of $49"); `reframe_teaser` keeps being generated because the /path unpaid paywall screen renders it |
| Disclaimer | static | Jeff's text |

Also remove the "scientific" static copy (Research Foundation: wiring, fixed identity, validated) and the `/start` headline "Find out exactly how you're wired".

## Ticket

One ticket, **#154 Identity Report redesign**, worked in this order:

1. **Generated content** (prompt and schema). Per signature, primaries and secondaries with the same structure: What this means, Evidence from your story, How this shows up, Where this serves you, Works with, four operating notes, Potential friction, Under pressure. Report-level: Pairings short lines, Distinctive Pattern, The Pattern to Notice, Energy/Drains phrasing (with #136). Additive for /path: `reframe_teaser`, `how_you_operate`, `evidence_analysis`, `core_statement`, `tension`, `energisers` and `friction_points` keep being generated. Retire `domain_profile_summary`, `what_this_report_is` and `identity_context` (the last also from the Path report). Jeff's text snapshot is the writing-quality benchmark. Verify by generating against real reports, including a /path run on the new output, before any UI work.
2. **Static copy.** 25 signature headlines, score and domain explanation lines, three Path CTAs, footer disclaimer, removal of scientific claims (including `/start`).
3. **Layout and app shell** per V3, including header nav replacing BottomNav on all pages. Layout comments expected during the build.
4. **Existing reports:** fallback rendering for missing new fields, or regeneration.

Settled since the first draft: secondary signatures get the same full card structure as primaries; /identity uses static CTA copy while `reframe_teaser` stays for the /path paywall; price is $49.

**Constraint:** nothing /path reads may be dropped or changed in meaning. The one deliberate exception is `identity_context`, removed from both reports.

### Effect on other tickets

| Ticket | Change |
|---|---|
| #151 Pullquotes repeat "outgrown" narrative | No change: the pullquote is `reframe_teaser`, which stays for the /path paywall |
| #58 Strip unused generation instructions | #154 retires `domain_profile_summary` and `what_this_report_is`; other identity fields are read by /path or Mentor and stay. Remaining scope: path_options / path_plan audit |
| #88 Identity context career phase | Drop: #154 retires `identity_context` from both the Identity Report and the Path report |
| #56 Renumber signature_number | Drop, unless `signature_number` is read elsewhere |
| #92 Zero-evidence secondary scores render 0 | Already visible today; handle a 0 while building #154's signature rows |
| #133 Content from absent domains | Keep, scope widens to #154's new per-signature fields |
| #136 Direction UI restructure | Do together with #154's Energy/Drains rephrasing, since those fields seed Direction |
| #152 BottomNav mute (Done) | Superseded; muted-item behaviour carries over to the header nav |
| #54 Shared header (homepage) | Review alongside #154's header change |
| #97 British English convention | Do as part of #154's prompt rewrite |
| #60 Tier C regenerate UX | More relevant if existing reports are regenerated |
