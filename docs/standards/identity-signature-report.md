# Identity Signature Report

## Overview
The Identity Signature Report is the primary
deliverable for registered users. It is a
high-accuracy identity mirror — not coaching,
not advice, not personality typing.

The user must feel one thing immediately:
"This is me."

Recognition is the product.

---

## Generation
Pipeline:
lib/prompts/identity-analysis.ts →
lib/prompts/identity-report.ts

Trigger: fires immediately on contact form
submission, simultaneously with magic link
email. Do not wait for email confirmation.

Use a capable model — not a lightweight one.
The report is 2,500–4,500 words of highly
structured, evidence-grounded personalised
prose. Model quality directly affects output
quality. All model configuration in
environment variables only.

Storage: artifacts table
- type: identity_report
- status: generating | ready | failed
- content: full report JSON

Versioned: new version created on each
regeneration. Previous versions never
overwritten.

Status field migration required:
ALTER TABLE artifacts
ADD COLUMN status TEXT DEFAULT 'generating';

---

## /identity Page Behaviour
On landing after magic link confirmation:

status: ready → render report immediately

status: generating → show waiting experience:
  - Subtle spinner
  - "Your Identity Signature Report is being
    prepared. This usually takes about a minute."
  - Auto-poll artifacts table every 3 seconds
  - Render immediately when status = ready

status: failed → show error with retry option

---

## Tone
Must be: precise, intelligent, grounded,
direct, calm, honest.

Must NOT be: motivational, fluffy, generic,
vague, mystical, therapeutic.

Present tense for identity statements.
Past tense for evidence.
Recurrence language throughout: repeatedly,
consistently, across multiple chapters.
Every major claim backed by evidence.
No advice, no direction, no path suggestions.
No generic praise or flattery.

---

## Sections

### 0. Cover
Background: off-white (#F7F6F3)
Layout: centred

Elements:
- Report metadata: "Identity Signature Report",
  eyebrow style, centred
- Identity badge: gradient shield badge,
  80x88px, SVG shield path with brand gradient
  fill, Tabler icon centred inside based on #1
  primary signature. See
  identity-signature-icons.md for mapping.
- Label: "Your Named Identity"
- Named Identity: display heading, centred,
  line break between modifier and core word
- Identity Thesis: 15px italic, #1E1E1E,
  no borders, 16px padding top and bottom
- Context line: [name] · [role] · [industry]
  · [phase], centred
- Date only — DD Month YYYY format,
  read from artifact created_at

Named Identity format: THE [Modifier] [Core]
Examples: The Awakening Architect,
The Pattern Catalyst, The Strategic Builder

Identity Thesis: one sentence capturing the
dominant identity pattern. May include tension.
Example: "You haven't lost your drive.
You've outgrown the structure you built."

### 1. Table of Contents
Hardcoded. Inline card after cover.
Numbered 01–10, anchor links to each section.

### 2. What This Report Is
Hardcoded. Same for every user.

Copy:
"This is pattern recognition — not personality
typing, not a career assessment, not coaching.
Your Identity Signatures are stable, recurring
operating patterns detected from your actual
life and work history. They describe how you
have consistently thought, acted, and perceived
across multiple chapters of your life — not who
you want to be, or who you were once. The report
does not tell you what to do. It shows you what
is already true about how you operate."

### 3. Signature Profile
Three cards:

Card 1 — Primary Constellation (Top 5):
- Gradient numbered circle (1-5)
- Signature name + domain + Frequency × Intensity
- Gradient score bar + score out of 25

Card 2 — Secondary Signatures (next 3):
- Muted numbered circle (6-8)
- Same layout as primary, muted treatment

Card 3 — Domain Profile:
- Pentagon radar chart (Chart.js)
- 5 domains: Visioning, Thinking, Driving,
  Sensing, Connecting
- Values 0-100

### 4. Primary Constellation — Deep Analysis
5 cards, one per primary signature.

Each card:
- Gradient numbered badge (1-5)
- Signature name + domain + score
- Score band: Dominant / Strong / Moderate / Weak
- Core statement: 8-20 words
- Evidence analysis: 150-250 words
  Follows: Pattern → Evidence → Meaning
  Minimum 2 real story anchors
  Present tense for identity, past for evidence
- Tension: one sentence of specific behavioural
  friction this signature creates
- Scoring breakdown: Frequency, Intensity,
  Score, Confidence

Score bands:
- Dominant: 20-25
- Strong: 14-19
- Moderate: 8-13
- Weak: 1-7

Confidence: Low / Mid / High

### 5. Secondary Signature Analysis
3 cards, one per secondary signature (6-8).

Each card:
- Muted numbered badge
- Signature name + domain + score
- Core statement: 8-20 words
- Analysis: 80-150 words
  Where it appears, supporting evidence,
  why it matters as a latent capacity

### 6. Constellation Synthesis
Single card.

Content:
- Named Identity as card heading
- Synthesis: 200-350 words
  How the Top 5 interact as one integrated
  operating system
  Describes: operating style, decision style,
  energy style, leadership style, relational style
  One coherent identity picture, not five
  separate summaries
  Must be earned through evidence, not generic

### 7. How You Operate
Single card with 5 subsections divided by
hairline borders. Each 80-150 words.

- Work Style: pace, structure, environment needs
- Thinking Style: how they process and conclude
- Relationship Style: observable patterns,
  not ideals
- Decision Style: speed, data needs,
  instinct vs analysis
- Stress Pattern: what happens to this identity
  under pressure — honest, specific

### 8. Energisers
6-10 chip tags.
Specific, observable, real-world conditions
that activate this identity.
Not vague states — concrete behaviours
and contexts.

### 9. Friction Points
6-10 chip tags.
Specific, behavioural, pattern-based
constraints this identity creates.
Honest — friction increases recognition
more than flattery.

### 10. Research Foundation
Hardcoded. Same for every user.

Four pillars:

Narrative Identity Theory — McAdams (1993)
Flow Theory — Csikszentmihalyi (1990)
Self-Determination Theory — Deci & Ryan (1985)
Neural Patterning — Doidge (2007)

Each pillar: title + 50-100 word explanation
connecting the theory to the user's report.

### 11. Limits of This Report
Hardcoded. Dark purple background.

Heading: "This report shows you how you
operate. It doesn't show you why you
feel stuck."

Body: "You now have a precise picture of your
identity patterns. But knowing how you operate
doesn't resolve the gap between how you operate
and how your life is actually structured right
now. That gap is costing you — in energy, in
output, and in the quiet sense that something
important is misaligned."

Bullet points:
- This report does not explain what your
  pattern is pointing toward
- It does not identify what you've outgrown
  or why it feels stuck
- It does not show you which direction fits
  who you've become
- It does not give you a path or a plan

CTA: Primary button
"See what your pattern is pointing toward →"
→ /paths (Paid tier gate)

---

## Hardcoded vs AI-Generated

Hardcoded (same for every user):
- What This Report Is (Section 2)
- Table of Contents section titles (Section 1)
- Research Foundation copy (Section 10)
- Limits of This Report copy (Section 11)

AI-generated (personalised):
- Named Identity and Identity Thesis
- Identity Context line
- All signature scores and breakdowns
- All 5 primary constellation analyses
- All 3 secondary signature analyses
- Constellation Synthesis
- How You Operate (all 5 subsections)
- Energisers and Friction Points
- Domain profile scores

---

## 25 Identity Signatures
Visioning: Visionary, Architect, Originator,
  Alchemist, Synthesizer
Thinking: Pattern Seeker, Depth Diver,
  Contextualiser, Contrarian, Futurist
Connecting: Catalyst, Resonator, Amplifier,
  Bridge, Illuminator
Driving: Activator, Pioneer, Builder,
  Optimizer, Finisher
Sensing: Meaning Maker, Truth Seeker,
  Empath, Intuitive, Guardian

---

## Quality Standard
Before finalising any section ask:
- Would this feel specific to this person?
- Could this apply to 1,000 people? If yes: rewrite.
- Is there evidence? If no: rewrite.
- Does this create recognition? If no: rewrite.

Specificity density: high.
Evidence density: high.
Generic language: none.
Flattery: none.
Recognition probability: high.