# Identity Signature Report

## Overview
The Identity Signature Report is the primary 
deliverable for registered users. It is generated 
once after registration and stored as a versioned 
artifact. It is a high-accuracy identity mirror — 
not coaching, not advice, not personality typing.

The user must feel one thing immediately: 
"This is me."

## Generation

Pipeline: lib/prompts/identity-analysis.ts 
→ lib/prompts/identity-report.ts

Trigger: fires immediately on contact form 
submission, simultaneously with magic link email.
Do not wait for email confirmation before 
starting generation.

Use a capable model — not a lightweight one.
Report is 2,500-4,500 words of highly structured,
evidence-grounded personalised prose. Model 
quality directly affects output quality.
All model configuration in environment 
variables only.

Storage: artifacts table
- type: identity_report
- status: generating | ready | failed
- content: full report JSON (written on completion)

Versioned: yes. Each regeneration creates a 
new version, previous versions never overwritten.

Status field requires migration:
ALTER TABLE artifacts 
ADD COLUMN status TEXT DEFAULT 'generating';

## /identity Page Behaviour
On landing after magic link confirmation:

status: ready → render report immediately
status: generating → show waiting experience:
  - Subtle spinner
  - "Your Identity Signature Report is being 
    prepared. This usually takes about a minute."
  - Auto-poll artifacts table every 3 seconds
  - Render immediately when status changes to ready
status: failed → show error with retry option

## Tone and Writing Standards
- Precise, intelligent, grounded, direct, calm
- Never motivational, fluffy, generic, or vague
- Present tense for identity statements
- Past tense for evidence
- Recurrence language throughout: repeatedly, 
  consistently, across multiple chapters
- Every major claim backed by evidence
- No advice, no direction, no path suggestions
- No generic praise or flattery

## Sections

### 0. Cover
Background: #F7F6F3
Layout: centred throughout

Elements:
- Report metadata: "Zyrro Identity Report 
  · Version 1.0 · [year]"
- Identity badge: gradient circle with user 
  initials, 64px, centred
- Label: "Your Named Identity" 
  (eyebrow style, centred)
- Named Identity: 28px, 700, #1E1E1E, centred,
  line break between modifier and core word
- Identity Thesis: 13px, italic, #6E6E6E, 
  centred, 8-18 words
- Context line: role · industry · phase, 
  11px, #6E6E6E, centred
- "Prepared for [first name]" in #C60567

Named Identity format: THE [Modifier] [Core]
Examples: The Awakening Architect, 
The Pattern Catalyst, The Strategic Builder

Identity Thesis: one sentence capturing the 
dominant identity pattern. May include tension.
Example: "You haven't lost your drive. 
You've outgrown the structure you built."

### 1. Table of Contents
Hardcoded. Inline card after cover.
Numbered 01-10, one row per section,
arrow icon on right, anchor links to sections.

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
- Signature name + domain + Frequency x Intensity
- Gradient score bar + score number
- Scores out of 25 (Frequency x Intensity, 
  each 1-5)

Card 2 — Secondary Signatures (next 3):
- Muted numbered circle (6-8)
- Same layout as primary, muted treatment
- Scores out of 25

Card 3 — Domain Profile:
- Pentagon radar chart (Chart.js)
- 5 domains: Visioning, Thinking, Driving, 
  Sensing, Connecting
- Values 0-100
- Border colour: #C60567
- Fill: rgba(198,5,103,0.08)

### 4. Primary Constellation Deep Analysis
5 cards, one per primary signature.

Each card contains:
- Gradient numbered badge (1-5)
- Signature name + domain + score
- Score band pill: Dominant / Strong / Moderate
- Core statement: 8-20 words, bold, 
  left border #C60567, off-white background
- Evidence analysis: 150-250 words
  Must follow: Pattern → Evidence → Meaning
  Minimum 2 real story anchors
  Present tense for identity, past for evidence
- Tension: one sentence, specific behavioural 
  friction, left border #FE5618, 
  warm orange background
- Scoring breakdown: 4 chips — Frequency, 
  Intensity, Score, Confidence

Score bands:
- Dominant: 20-25
- Strong: 14-19
- Moderate: 8-13
- Weak: 1-7

Confidence: Low / Mid / High

### 5. Secondary Signature Analysis
3 cards, one per secondary signature (6-8).

Each card contains:
- Muted numbered badge
- Signature name + domain + score
- Core statement
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
  Must describe operating style, decision style,
  energy style, leadership style, relational style
  Not five separate summaries — one coherent 
  identity picture
  Must be earned through evidence, not generic

### 7. How You Operate
Single card with 5 subsections, 
divided by hairline borders.

Subsections (each 80-150 words):
- Work Style: pace, structure, environment needs
- Thinking Style: how they process and conclude
- Relationship Style: observable patterns 
  with others, not ideals
- Decision Style: speed, data needs, 
  instinct vs analysis
- Stress Pattern: what happens to this identity 
  under pressure — honest, specific

### 8. Energisers
6-10 chip tags.
Each: specific, observable, real-world condition 
that activates this identity.
Not vague states — concrete behaviours 
and contexts.
Style: off-white background, standard border.

### 9. Friction Points
6-10 chip tags.
Each: specific, behavioural, pattern-based 
constraint this identity creates.
Must be honest — friction increases recognition 
more than flattery.
Style: warm orange tint background, 
orange border.

### 10. Research Foundation
Hardcoded. Same for every user.

Four pillars:

Narrative Identity Theory — McAdams (1993)
"Identity is not a fixed trait but an evolving 
personal narrative constructed from life 
experience. The Zyrro detection process works 
with this narrative structure — analysing the 
recurring themes, turning points, and emotional 
peaks across your story to identify stable 
operating patterns that persist across contexts."

Flow Theory — Csikszentmihalyi (1990)
"Peak performance states occur when challenge 
matches capability and intrinsic motivation is 
high. Your Energisers map directly to your flow 
conditions — the specific contexts where your 
signature combination operates at maximum 
capacity. Friction Points map to the conditions 
that block flow most reliably for your 
identity type."

Self-Determination Theory — Deci & Ryan (1985)
"Sustained motivation requires autonomy, 
competence, and relatedness. Your Meaning Maker 
signature reflects a high autonomy and purpose 
requirement — environments that satisfy 
competence but not autonomy or meaning produce 
the disengagement patterns visible in your 
career transitions."

Neural Patterning — Doidge (2007)
"Repeated cognitive and behavioural patterns 
strengthen neural pathways over time, making 
them increasingly automatic and identity-level. 
The signatures detected in your report are not 
preferences or styles — they are deeply wired 
operating patterns that have been reinforced 
across decades of lived experience."

### 11. Limits of This Report
Hardcoded. Background: #2D0A45.
All text: rgba(255,255,255,0.75).

Eyebrow: LIMITS OF THIS REPORT
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

## Quality Standards
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