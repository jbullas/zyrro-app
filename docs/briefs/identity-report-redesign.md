# Identity Report Redesign — Planning Brief

**Status:** Design agreed (V3 mockup), not yet ticketed or built.
**Last updated:** 2026-10-02
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
4. **Charts:** two charts, measuring different things. Domain Profile = gradient bars with no numbers, plus a one-line explanation. Signature scores = the bars inside the signature rows. The radar chart, the separate Signature Profile chart and the Frequency/Intensity/Score/Confidence chips are removed.
5. **Scores:** shown once only, in the signature rows (bar + "x/25"), with the explanation "Score out of 25: how often and how strongly each pattern appears in your answers." Hero cards show the band word only (Dominant / Strong / Moderate).
6. **Signature badges:** every signature (cards and rows) shows its own badge, i.e. the identity-badge shield with that signature's Tabler icon. Secondary signatures use a grey shield.
7. **Secondary signatures:** shown as rows 6–8 directly under the primaries, not labelled "secondary", with accent colours greyed out (grey badge, grey bar, muted text).
8. **How You Operate:** section removed. Its five findings (work, thinking, relationship, decision, stress) move into each expanded signature card.
9. **Your Answers (Q&A):** removed from the report. No reference to the answers anywhere on the page.
10. **About This Report:** removed. Replaced by Jeff's closing disclaimer in the footer.
11. **Read deeper insight:** no extra step. A row's toggle opens the full signature content directly.
12. **Path CTAs:** three placements (hero row 3, text link after Energy/Drains, large gradient strip at the end). Copy must be honest: no "four paths are ready", no 7-day plan, no mentoring; state that Path is a one-time payment.
13. **Hero CTA card:** light orange tint (`#FFF1EA`) with an orange border. The gradient stays reserved for the bottom CTA strip, per the brand rules.

## Page outline (V3)

| # | Section | Content |
|---|---|---|
| 1 | Header (page width) | Logo + tagline, main nav, account |
| 2 | Hero row 1, card 1 | Eyebrow "Your Identity at a Glance" · H1 named identity · "Prepared for [name]" (no identity context) · thesis headline · thesis summary |
| 3 | Hero row 1, card 2 | Domain Profile: explanation line + 5 gradient bars (no numbers), each labelled with the user's signatures in that domain |
| 4 | Hero row 2 | Eyebrow "Your Primary Signatures" · 5 cards: badge, name, domain, short definition, band word (no numbering, no score) |
| 5 | Hero row 3 | Path CTA card: "Your identity points somewhere." + one-line explanation + "Find your path" button |
| 6 | Signature rows | Score explanation line · 8 full-width rows (5 primary + 3 secondary greyed): badge, name, domain, bar, score, toggle. Closed by default. |
| 7 | Expanded signature card | See below |
| 8 | Two columns | How Your Signatures Work Together (pairings) · Your Distinctive Pattern |
| 9 | Two columns | What Gives You Energy · What Drains You (+/– markers, short noun phrases) |
| 10 | Path invitation 2 | Text link: these two lists are where Path starts (must-haves / must-avoids) |
| 11 | The Pattern to Notice | Strength-vs-tension section |
| 12 | Large CTA | Gradient strip: "Your identity points somewhere. Find your path." + accurate description of the Path flow + price |
| 13 | Footer | Disclaimer · logo · Privacy / Terms / Help |

### Expanded signature card

1. Header row: badge, name, domain, bar, score, collapse toggle (active card gets the 1.5px accent border)
2. Headline definition (large) + personal line
3. Main column: **What this means** (2 paragraphs) · **Evidence from your story** (3 observations grounded in the user's answers)
4. Side column: **How this shows up in your life** (list) · **Where this serves you** (list) · **Works closely with** (signature chips)
5. **How it shapes the way you operate:** 4 tiles — At work · Thinking · With people · Deciding
6. **Potential friction** + **Under pressure** side by side, on a light warm tint

## Content: existing fields → new sections

| New section | Source today | Change |
|---|---|---|
| H1 | `cover.named_identity` | none |
| Prepared for | `cover.prepared_for` | drop `identity_context` from display |
| Thesis headline | `cover.identity_thesis` | none (check tone against Jeff's snapshot) |
| Thesis summary | `constellation_synthesis.synthesis` | check length (Jeff: 80–120 words) |
| Domain bars | `domain_profile` (code-computed) | display only; `domain_profile_summary` no longer shown |
| Card short definition | `lib/signatures.ts` `description` | replace with Jeff-style headlines ("Brings clarity to complexity."): static, all 25 to be written |
| Row bars + score | `primary_constellation[].score`, `secondary_signature_analysis[].score` | display only |
| Personal line | `core_statement` | likely reuse |
| What this means + Evidence | `evidence_analysis` | split into two fields; evidence must cite real answers |
| Shows up / Serves you | none | **new** generated lists |
| Operate tiles + Under pressure | `how_you_operate` (once per report) | **new** per-signature fields; retire report-level `how_you_operate` |
| Potential friction | `tension` | rename, possibly lengthen |
| Works closely with | none | derive from pairings, or new field |
| Secondary rows (expanded) | `secondary_signature_analysis` (core_statement + analysis only) | **open:** full depth or shorter card |
| Pairings | none | **new** generated (2–3 pairings) |
| Distinctive Pattern | none | **new** generated: 3–5 step sequence + 2 paragraphs |
| The Pattern to Notice | none | **new** generated: headline, body, one-line takeaway |
| Energy / Drains | `energisers`, `friction_points` | prompt change to short noun phrases |
| Path CTAs | `reframe_teaser` → `ReframeCtaBlock` | **open:** retire generated teaser in favour of static copy |
| Disclaimer | static | Jeff's text |

Also remove the "scientific" static copy (Research Foundation: wiring, fixed identity, validated) and the `/start` headline "Find out exactly how you're wired".

## Proposed tickets

1. **App shell: header nav, remove BottomNav** (all pages, plus brand-guidelines update).
2. **Identity Report: layout pass, no AI changes.** Sections 2–6 and 8–13 using existing fields; remove radar, Signature Profile chart, score chips, How You Operate section, About This Report, Q&A. Expanded cards show the existing fields until ticket 4 lands.
3. **Identity Report: static copy.** 25 signature headlines, three CTA texts, disclaimer, removal of scientific claims (including `/start`).
4. **Identity Report: expanded signature structure (generation).** Meaning, evidence, shows up, serves, 4 operate notes, friction, under pressure; retire report-level `how_you_operate`.
5. **Identity Report: Distinctive Pattern + Pattern to Notice (generation).**
6. **Identity Report: pairings (generation).** Build only if it stays clearly distinct from Distinctive Pattern; otherwise drop.
7. **Identity Report: Energy/Drains phrasing (generation).**
8. **Identity Report: writing quality.** Fold in #151; use Jeff's snapshot as the benchmark text.
9. **Existing reports:** fallback rendering for missing new fields, or regeneration.

Tickets 4–7 change the report prompt and schema, so they can be one generation pass or sequenced. Ticket 2 ships first (Jeff's Priority 1).

## Open questions

1. Secondary signatures: generate the full expanded structure (more tokens), or accept a shorter expanded card?
2. Pairings vs Distinctive Pattern: keep both, or drop pairings (Jeff's snapshot has only the pattern)?
3. Retire `reframe_teaser` (generated) in favour of static Path CTA copy?
4. CTA wording and price: confirm with Jeff.
5. Share V3 with Jeff for sign-off before ticketing.
6. Still unanswered from the 2026-09-23 reply: Jeff's view on generating a writing-quality benchmark (his snapshot may now serve as one).
