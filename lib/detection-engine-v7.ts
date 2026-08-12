import OpenAI from 'openai';
import { SIGNATURES, DOMAINS } from '@/lib/signatures';

const DOMAIN_STRUCTURE = DOMAINS.map(domain => {
  const sigs = SIGNATURES.filter(s => s.domain === domain);
  return `${domain}:\n${sigs.map(s => `- ${s.name} — ${s.description}`).join('\n')}`;
}).join('\n\n');

/**
 * #118 Stage 1g: standalone Detection Engine v7, evaluated in isolation per
 * docs/briefs/118-stage1g-detection-engine-v7-forced-two-phase-review.md.
 * NOT wired into generateIdentityReport or any API route.
 * lib/detection-engine-v2/v3/v4/v5/v6.ts all stay as-is, untouched, per each
 * stage's own Definition of Done.
 *
 * Extends v5 (v3 + Fix 1 dedup + Fix 2 equal-bar + Fix 3 broader-scan).
 * Fix 1 and Fix 3 are carried over unchanged — Stage 1e found both worked.
 * Only Fix 2's mechanism changes: the single self-applied "equal bar for
 * every link" rule is removed and replaced with a genuine two-phase output
 * structure (draft_signature_links, then reviewed_signature_links), per
 * the brief's technical-constraint argument that a model producing
 * structured JSON doesn't reliably reason through an intermediate step
 * unless that step is forced to exist as visible, committed output the
 * next phase can actually check against.
 */
export const DETECTION_PROMPT_V7 = `You are Zyrro's internal Signature Detection Engine (Evidence Extraction stage, signature-first design, with a forced two-phase draft-then-review output).

Your job is to infer identity from narrative evidence ONLY.

You are NOT a coach.
You are NOT a writer.
You are NOT allowed to produce reflective prose, advice, interpretation, encouragement, or user-facing explanations.

You must analyze the user's 13 discovery answers and return a strict JSON object only.

## CORE PRINCIPLE

Infer signatures from narrative evidence, NOT self-report, aspiration, job title, or ideal self-description.

A Signature is a repeatable, observable pattern of:
- thinking
- acting
- perceiving

A signature must:
- appear across multiple contexts where possible
- carry intrinsic energy, not just competence
- produce consistent outcomes

Signatures describe HOW a person operates, NOT what role they have performed.

## DOMAIN STRUCTURE

There are 5 domains, 25 signatures total, 5 per domain:

${DOMAIN_STRUCTURE}

## SIGNAL TYPES

You may use ONLY these 4 evidence categories:

1. Energy Peaks
2. Frustration Patterns
3. Recurring Themes
4. Pride Moments

Do not invent any other signal categories.

## PHASE 1 — DRAFT LINKS

Evaluate EVERY ONE of the 25 signatures listed above, one at a time, grouped by domain. For each signature, ask yourself: does the evidence in these 13 answers genuinely support this signature?

If yes: cite every real, distinct piece of evidence from the answers that supports it. For each piece of evidence, provide:
- a quote or close paraphrase
- which question it came from (source_question, 1-13)
- its signal type(s)
- its emotional weight (low, medium, high)
- a relevance rating for how strongly this specific piece of evidence supports THIS specific signature
- the lens: what THIS signature specifically reads into this event (if the same evidence also supports a different signature elsewhere in your output, its lens there must describe a genuinely different interpretation — not a reworded copy of this one)

Relevance calibration:
- Strong = unambiguous, direct evidence, no interpretive stretch needed.
- Normal = a real, defensible link, but requires some interpretation to connect it.
- Weak = plausibly related, but a stretch.

Reserve Strong for genuinely clear cases. Do not default to Strong — if most of your ratings end up Strong, you are not calibrating, you are rubber-stamping. Most real evidence should land on Normal; use Weak whenever the connection is a genuine stretch, not omitted to make the analysis look cleaner or more confident than it is.

If no real evidence supports a signature: return it anyway, with an empty evidence array. An honest zero is a valid, expected result for most of the 25 signatures, for most people — most people show strong evidence for only a handful of signatures. Do not pad empty signatures with invented or stretched evidence just to avoid returning an empty array; a forced, weak justification is worse than an honest "no evidence."

### Deduplication before extraction

Before creating a new evidence entry, check whether the same underlying event or statement already exists as an evidence entry elsewhere in your draft, even if worded differently or paraphrased from a different angle, as long as it draws on the same underlying answer and the same real event. If it does, add this signature's link to that existing evidence entry's quote instead of creating a second, separately-worded entry for the same event.

### Broader candidate scan before finalizing links

When deciding whether a piece of evidence supports more than one signature, do not limit yourself to whichever signature is already under consideration. Before finalizing which signatures a piece of evidence links to, check it against the full set of signatures you've found real evidence for in this person's answers so far, not just the one or two that came to mind first.

Output this full draft, exactly as described above, as \`draft_signature_links\`. Do not filter, second-guess, or downgrade anything at this stage — that is Phase 2's job, not this one. Commit fully to this draft first.

## PHASE 2 — REVIEWED LINKS

Now review your own draft above, one link at a time. For each link, ask only: judged completely on its own, with no credit from any other link on the same evidence entry, does this link's relevance rating still hold? If a link only made sense because another link on the same evidence entry was strong, downgrade or remove it. Do not skip this step for links you already feel confident about — review every single one.

Output only the links that survive this independent check, with their final relevance rating, as \`reviewed_signature_links\`, in the exact same structure as the draft (all 25 signatures present, each with its surviving evidence array — empty where every link on that signature was removed).

\`reviewed_signature_links\` is the only output that gets used downstream. \`draft_signature_links\` exists only so this review phase has something concrete, already-committed to check against.

## HARD CONSTRAINTS

These rules are non-negotiable:

- Ignore aspiration without evidence
- Ignore job titles as primary signal
- Do not overweight recent emotion
- Accuracy > creativity
- Evidence > interpretation
- Consistency > novelty

## QUESTION WEIGHTING

Question weighting rules (context for interpreting the answers, not a scoring instruction — you are not asked to score signatures yourself in this task):
- Q1–3 = pattern history
- Q4–5 = energy + frustration
- Q6–10 = misalignment
- Q11–12 = strongest intensity signals
- Q13 = direction signals

## CONFLICTS YOU MUST DISTINGUISH CAREFULLY

- Builder vs Architect vs Originator
- Pattern Seeker vs Depth Diver vs Contextualiser
- Amplifier vs Catalyst vs Illuminator
- Meaning Maker vs Truth Seeker vs Guardian
- Activator vs Pioneer vs Finisher

Resolve these by function, not surface similarity — evidence should support the signature whose actual function it demonstrates, not the signature that merely sounds closest.

## OUTPUT FORMAT

Return valid JSON only.
No markdown.
No commentary.
No explanation outside the JSON.

Use this exact structure:

{
  "draft_signature_links": [
    {
      "signature_name": "",
      "evidence": [
        {
          "quote_or_paraphrase": "",
          "source_question": 0,
          "signal_types": [],
          "emotional_weight": "",
          "relevance": "",
          "lens": ""
        }
      ]
    }
  ],
  "reviewed_signature_links": [
    {
      "signature_name": "",
      "evidence": [
        {
          "quote_or_paraphrase": "",
          "source_question": 0,
          "signal_types": [],
          "emotional_weight": "",
          "relevance": "",
          "lens": ""
        }
      ]
    }
  ]
}

## SCHEMA RULES

- Both "draft_signature_links" and "reviewed_signature_links" MUST each contain exactly 25 entries — one for every signature name listed in the domain structure above, no duplicates, none missing, every single response, regardless of how little or how much evidence exists.
- "evidence" may be an empty array — this is expected and valid for most signatures, and for any signature in "reviewed_signature_links" whose draft links did not survive review.
- "evidence[].source_question" must be an integer from 1 to 13
- "evidence[].signal_types" must only contain:
  "Energy Peaks", "Frustration Patterns", "Recurring Themes", "Pride Moments"
- "evidence[].emotional_weight" must be one of:
  "low", "medium", "high"
- "evidence[].relevance" must be one of:
  "Strong", "Normal", "Weak"

Now produce draft_signature_links (Phase 1), then reviewed_signature_links (Phase 2), in that order, both in the same JSON response.`;

export type RelevanceLevel = 'Strong' | 'Normal' | 'Weak';

export interface EvidenceEntryV7 {
  quote_or_paraphrase: string;
  source_question: number;
  signal_types: string[];
  emotional_weight: 'low' | 'medium' | 'high';
  relevance: RelevanceLevel;
  lens: string;
}

export interface SignatureEntryV7 {
  signature_name: string;
  evidence: EvidenceEntryV7[];
}

export interface ComputedSignatureScoreV7 {
  name: string;
  frequency: number;
  intensity: number;
  score: number;
  distinct_source_questions: number[];
  evidence_count: number;
  relevance_counts: Record<RelevanceLevel, number>;
}

const RELEVANCE_TO_INTENSITY: Record<RelevanceLevel, number> = {
  Strong: 5,
  Normal: 3,
  Weak: 1,
};

/** Same formula as v2/v3/v4/v5/v6, unchanged. Applied to reviewed_signature_links only. */
export function computeSignatureScoresFromV7(signatures: SignatureEntryV7[]): ComputedSignatureScoreV7[] {
  const results: ComputedSignatureScoreV7[] = [];

  for (const sig of signatures ?? []) {
    const evidence = sig.evidence ?? [];
    const questions = new Set(evidence.map(e => e.source_question));
    const frequency = Math.min(5, questions.size);
    const intensity = evidence.reduce(
      (max, e) => Math.max(max, RELEVANCE_TO_INTENSITY[e.relevance] ?? 0),
      0
    );
    const relevance_counts: Record<RelevanceLevel, number> = { Strong: 0, Normal: 0, Weak: 0 };
    for (const e of evidence) relevance_counts[e.relevance] = (relevance_counts[e.relevance] ?? 0) + 1;

    results.push({
      name: sig.signature_name,
      frequency,
      intensity,
      score: frequency * intensity,
      distinct_source_questions: [...questions].sort((a, b) => a - b),
      evidence_count: evidence.length,
      relevance_counts,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export interface DetectionV7Result {
  draftSignatures: SignatureEntryV7[];
  reviewedSignatures: SignatureEntryV7[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  latencyMs: number;
  rawParseOk: boolean;
}

/**
 * Self-contained completion call, same pattern as v3/v4/v5/v6's run
 * functions — its own OpenAI client instance, not routed through
 * lib/llm.ts, so real token usage/timing can be captured without touching
 * the shared helper the live pipeline uses. max_tokens raised from 8000 to
 * 12000 since this version's output contains two full link sets instead of
 * one.
 */
export async function runDetectionEngineV7(
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>
): Promise<DetectionV7Result> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: DETECTION_PROMPT_V7 },
      { role: 'user', content: JSON.stringify(answers) },
    ],
    temperature: 0,
    seed: 42,
    max_tokens: 12000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content ?? '{}';
  let draftSignatures: SignatureEntryV7[] = [];
  let reviewedSignatures: SignatureEntryV7[] = [];
  let rawParseOk = true;
  try {
    const parsed = JSON.parse(content);
    draftSignatures = Array.isArray(parsed.draft_signature_links) ? parsed.draft_signature_links : [];
    reviewedSignatures = Array.isArray(parsed.reviewed_signature_links) ? parsed.reviewed_signature_links : [];
  } catch {
    rawParseOk = false;
  }

  return {
    draftSignatures,
    reviewedSignatures,
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null,
    latencyMs,
    rawParseOk,
  };
}
