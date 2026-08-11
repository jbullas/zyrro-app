import OpenAI from 'openai';
import { SIGNATURES, DOMAINS } from '@/lib/signatures';

const DOMAIN_STRUCTURE = DOMAINS.map(domain => {
  const sigs = SIGNATURES.filter(s => s.domain === domain);
  return `${domain}:\n${sigs.map(s => `- ${s.name} — ${s.description}`).join('\n')}`;
}).join('\n\n');

/**
 * #118 Stage 1c: standalone Detection Engine v4, evaluated in isolation per
 * docs/briefs/118-stage1c-detection-engine-v4-separated-rating.md. NOT
 * wired into generateIdentityReport or any API route. lib/detection-engine-v2.ts
 * (Stage 1) and lib/detection-engine-v3.ts (Stage 1b) both stay as-is,
 * untouched, per each stage's own Definition of Done.
 *
 * Same signature-first, all-25-explicit, single-call structure as v3.
 * The one change: v3 asked "does the evidence genuinely support this
 * signature? If yes, cite and rate it" as one combined instruction — this
 * stage's hypothesis (see the brief) is that the "genuine support" framing
 * itself acts as an implicit strength filter before the rating step ever
 * runs, which is why Weak stayed vanishingly rare (0/145 in v2, 1/145 in
 * v3) across two structurally different designs. v4 separates that into
 * two explicit, sequential steps per signature: Step A (inclusion — is
 * there a real, specific reference at all, same bar as v3, not loosened)
 * and Step B (relevance rating — independent of Step A, explicitly told
 * not to default from it).
 */
export const DETECTION_PROMPT_V4 = `You are Zyrro's internal Signature Detection Engine (Evidence Extraction stage, signature-first design with separated inclusion/rating).

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

## TASK

You must evaluate EVERY ONE of the 25 signatures listed above, one at a time, grouped by domain. For each signature, evaluate it in two separate steps. Do not merge these into one judgment — they answer different questions.

**Step A — Inclusion.** Is there a specific, real reference in this person's own answers that could reasonably connect to this signature — a concrete event, behavior, or statement, not a general trait description and not an invented or hypothetical scenario? If no such reference exists, return an empty evidence array for this signature. This bar is not loosened by the existence of a separate rating step below — a reference still has to be real and specific to pass Step A at all.

**Step B — Relevance rating.** For each piece of evidence that passed Step A, rate its relevance to THIS signature separately and honestly:

- Strong = unambiguous, direct evidence, no interpretive stretch needed.
- Normal = a real, defensible link, but requires some interpretation to connect it.
- Weak = plausibly related, but a stretch.

Do not use inclusion as a proxy for strength. A piece of evidence can pass the inclusion test in Step A and still be rated Weak in Step B — that happens whenever the reference is real but the connection to this specific signature requires you to stretch to make it fit. Rate what the evidence actually shows, not how confident you feel about having included it.

Reserve Strong for genuinely clear cases. Do not default to Strong — if most of your ratings end up Strong, you are not calibrating, you are rubber-stamping. Most real evidence should land on Normal; use Weak whenever the connection is a genuine stretch, not omitted to make the analysis look cleaner or more confident than it is.

For each piece of evidence that passes Step A, also provide:
- a quote or close paraphrase
- which question it came from (source_question, 1-13)
- its signal type(s)
- its emotional weight (low, medium, high)
- the lens: what THIS signature specifically reads into this event (if the same evidence also supports a different signature elsewhere in your output, its lens there must describe a genuinely different interpretation — not a reworded copy of this one)

If no real evidence supports a signature: return it anyway, with an empty evidence array. An honest zero is a valid, expected result for most of the 25 signatures, for most people — most people show strong evidence for only a handful of signatures. Do not pad empty signatures with invented or stretched evidence just to avoid returning an empty array; a forced, weak justification is worse than an honest "no evidence."

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
  "signatures": [
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

- "signatures" MUST contain exactly 25 entries — one for every signature name listed in the domain structure above, no duplicates, none missing, every single response, regardless of how little or how much evidence exists.
- "signatures[].evidence" may be an empty array — this is expected and valid for most signatures.
- "evidence[].source_question" must be an integer from 1 to 13
- "evidence[].signal_types" must only contain:
  "Energy Peaks", "Frustration Patterns", "Recurring Themes", "Pride Moments"
- "evidence[].emotional_weight" must be one of:
  "low", "medium", "high"
- "evidence[].relevance" must be one of:
  "Strong", "Normal", "Weak"

Now evaluate all 25 signatures against the user's 13 answers, using the two-step inclusion-then-rating process described above.`;

export type RelevanceLevel = 'Strong' | 'Normal' | 'Weak';

export interface EvidenceEntryV4 {
  quote_or_paraphrase: string;
  source_question: number;
  signal_types: string[];
  emotional_weight: 'low' | 'medium' | 'high';
  relevance: RelevanceLevel;
  lens: string;
}

export interface SignatureEntryV4 {
  signature_name: string;
  evidence: EvidenceEntryV4[];
}

export interface ComputedSignatureScoreV4 {
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

/** Same formula as v2/v3, unchanged per the brief. */
export function computeSignatureScoresFromV4(signatures: SignatureEntryV4[]): ComputedSignatureScoreV4[] {
  const results: ComputedSignatureScoreV4[] = [];

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

export interface DetectionV4Result {
  signatures: SignatureEntryV4[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  latencyMs: number;
  rawParseOk: boolean;
}

/**
 * Self-contained completion call, same pattern as v3's runDetectionEngineV3
 * — its own OpenAI client instance, not routed through lib/llm.ts, so real
 * token usage/timing can be captured without touching the shared helper
 * the live pipeline uses.
 */
export async function runDetectionEngineV4(
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>
): Promise<DetectionV4Result> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: DETECTION_PROMPT_V4 },
      { role: 'user', content: JSON.stringify(answers) },
    ],
    temperature: 0,
    seed: 42,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content ?? '{}';
  let signatures: SignatureEntryV4[] = [];
  let rawParseOk = true;
  try {
    const parsed = JSON.parse(content);
    signatures = Array.isArray(parsed.signatures) ? parsed.signatures : [];
  } catch {
    rawParseOk = false;
  }

  return {
    signatures,
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
