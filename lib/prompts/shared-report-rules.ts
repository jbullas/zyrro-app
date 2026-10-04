// #154: rule text shared verbatim by LAYER_2_PROMPT (lib/prompts/identity-report.ts)
// and the Layer 3 deep-dive prompts (lib/prompts/identity-report-deep-dive.ts).
// Extracted rather than paraphrased so both layers are held to the exact same
// wording — edit here, not in either prompt.

export const TENSE_RULES = `### Tense Rules
Use present tense for identity: "You build systems."
Use past tense for evidence: "You rebuilt your practice after your co-founder left."`;

export const VOICE_RULE = `### Voice
Write exclusively in second person, throughout every text field. Never refer to the user by name or in the third person anywhere in the report — the only exception is cover.prepared_for, which is metadata, not narrative prose.`;

// #97 (closed by #154): one spelling rule for every generated identity-report field.
export const BRITISH_ENGLISH_RULE = `### Spelling
Use British English spelling in every text field, without exception: -ise not -ize (organise, recognise, optimise, prioritise, realise), -our not -or (behaviour, favour), -re not -er (centre), analyse not analyze, towards not toward. This applies to every word you write except official signature names (for example Optimizer), which are proper nouns and must be copied exactly.`;

export const WRITING_PRINCIPLE = `## WRITING PRINCIPLE

Do not write about the signature.

Write about the person through the signature.

Weak: "You are a Builder."
Strong: "You have repeatedly stepped into unstable systems and left behind structure that outlasted your presence."

Identity must feel lived. Not labelled.`;

export const EVIDENCE_REUSE_RULE = `## THE EVIDENCE REUSE RULE

Do not reuse the same evidence clause, literally or near-verbatim, across multiple sections. When multiple sections legitimately draw on the same underlying fact, each section must surface a different angle on it — what happened, what it reveals, or what it costs — never restate the same sentence.

secondary_signature_analysis[].analysis must cite raw evidence from the user's actual answers only. Never cite this report's own generated write-up of another signature (e.g. a primary_constellation entry) as if it were source evidence.

This rule applies report-wide, not only within primary_constellation — including how_you_operate and reframe_teaser, both written after most of the report's other content already exists and both at the highest risk of restating it. Before finalizing any field, check it against everything already written earlier in this same response. If a field would restate an idea, theme, or observation already made elsewhere — even reworded — replace it with a different angle grounded in different evidence, not a paraphrase of the same point.

reframe_teaser is a deliberate exception on *content*, not on *wording*: its job is to callback to the report's own strongest evidence, so citing the same anecdote, signature, or fact already used elsewhere is expected and often correct — do not avoid a strong anecdote just because it already appeared earlier. What is not allowed is reusing the same sentence structure or near-identical phrasing already used to describe that fact — describe it in fresh, different concrete language even when the underlying fact is the same one already told.

Avoid these overused connective phrases, found repeating across sections in real generations: "is evident in your," "you may become frustrated when," "you are not easily swayed by," "though it may sometimes lead to," "you thrive in environments where you can." These are filler transitions, not content — replace them with a direct, specific statement instead.`;

export const SPECIFICITY_RULE = `## THE SPECIFICITY RULE

Use concrete language. Avoid abstraction.

Weak: "You enjoy complex challenges."
Strong: "You consistently moved toward roles where complexity, uncertainty, and responsibility converged."

Test: Can another person picture it? If no, rewrite.`;

export const NO_COACHING_RULE = `## THE NO COACHING RULE

Layer 2 is descriptive. Not directional.

Do not say: you should, you need, your next step, now it's time.

No advice. No direction. No path suggestions. That belongs to Layer 3.`;

export const NO_GENERIC_PRAISE_RULE = `## THE NO GENERIC PRAISE RULE

Never flatter. Never inflate.
Avoid: exceptional, gifted, amazing, unique — unless directly evidenced.
The report must feel earned. Not complimentary.`;
