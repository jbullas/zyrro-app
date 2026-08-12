import OpenAI from 'openai';
import { SIGNATURES, DOMAINS } from '@/lib/signatures';

const DOMAIN_STRUCTURE = DOMAINS.map(domain => {
  const sigs = SIGNATURES.filter(s => s.domain === domain);
  return `${domain}:\n${sigs.map(s => `- ${s.name} — ${s.description}`).join('\n')}`;
}).join('\n\n');

/**
 * #118 Stage 1f: standalone Detection Engine v6, evaluated in isolation per
 * docs/briefs/118-stage1f-detection-engine-v6-minimal-prompt.md. NOT wired
 * into generateIdentityReport or any API route. lib/detection-engine-v2/v3/v4.ts
 * all stay as-is, untouched, per each stage's own Definition of Done.
 *
 * Deliberately the inverse move from Stage 1e's draft (targeted fixes on
 * top of v3): instead of adding instructions aimed at the reused-evidence
 * bias and missed-link findings, this strips v3 down to what's structurally
 * necessary — the domain/signature list, the output schema, the three-tier
 * relevance calibration, and one plain honesty instruction — and cuts
 * everything else (Hard Constraints, Question Weighting, the "Conflicts You
 * Must Distinguish Carefully" list, and the Step 1/2/3/4 breakdown,
 * collapsed into one direct task instruction). None of Stage 1e's three
 * targeted fixes (deduplication, equal-bar-for-links, broader scan) are
 * added here — this tests whether prompt complexity itself is a
 * contributor, kept separate from whether those specific fixes would help.
 */
export const DETECTION_PROMPT_V6 = `You are Zyrro's internal Signature Detection Engine (Evidence Extraction stage).

Your job is to infer identity from narrative evidence ONLY. You are NOT a coach, writer, or advisor — you do not produce prose, advice, or user-facing explanations. You must analyze the user's 13 discovery answers and return a strict JSON object only.

## SIGNATURES

There are 5 domains, 25 signatures total, 5 per domain:

${DOMAIN_STRUCTURE}

## TASK

Evaluate all 25 signatures against the user's 13 answers. For each signature, cite every real, distinct piece of evidence from the answers that supports it. For each piece of evidence, provide:
- a quote or close paraphrase
- which question it came from (source_question, 1-13)
- its signal type — one of: Energy Peaks, Frustration Patterns, Recurring Themes, Pride Moments
- its emotional weight (low, medium, high)
- a relevance rating for how strongly this specific piece of evidence supports THIS specific signature
- the lens: what THIS signature specifically reads into this event

Relevance calibration:
- Strong = unambiguous, direct evidence, no interpretive stretch needed.
- Normal = a real, defensible link, but requires some interpretation to connect it.
- Weak = plausibly related, but a stretch.

Reserve Strong for genuinely clear cases. Do not default to Strong — if most of your ratings end up Strong, you are not calibrating, you are rubber-stamping. Most real evidence should land on Normal; use Weak whenever the connection is a genuine stretch, not omitted to make the analysis look cleaner or more confident than it is.

Only cite evidence that is actually in the person's answers. If nothing real supports a signature, leave its evidence array empty rather than inventing or stretching something to fill it. An honest zero is a valid, expected result for most of the 25 signatures, for most people.

## OUTPUT FORMAT

Return valid JSON only. No markdown. No commentary outside the JSON.

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

- "signatures" MUST contain exactly 25 entries — one for every signature name listed above, no duplicates, none missing, every single response, regardless of how little or how much evidence exists.
- "signatures[].evidence" may be an empty array — this is expected and valid for most signatures.
- "evidence[].source_question" must be an integer from 1 to 13
- "evidence[].signal_types" must only contain:
  "Energy Peaks", "Frustration Patterns", "Recurring Themes", "Pride Moments"
- "evidence[].emotional_weight" must be one of:
  "low", "medium", "high"
- "evidence[].relevance" must be one of:
  "Strong", "Normal", "Weak"

Now evaluate all 25 signatures against the user's 13 answers.`;

export type RelevanceLevel = 'Strong' | 'Normal' | 'Weak';

export interface EvidenceEntryV6 {
  quote_or_paraphrase: string;
  source_question: number;
  signal_types: string[];
  emotional_weight: 'low' | 'medium' | 'high';
  relevance: RelevanceLevel;
  lens: string;
}

export interface SignatureEntryV6 {
  signature_name: string;
  evidence: EvidenceEntryV6[];
}

export interface ComputedSignatureScoreV6 {
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

/** Same formula as v2/v3/v4, unchanged. */
export function computeSignatureScoresFromV6(signatures: SignatureEntryV6[]): ComputedSignatureScoreV6[] {
  const results: ComputedSignatureScoreV6[] = [];

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

export interface DetectionV6Result {
  signatures: SignatureEntryV6[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  latencyMs: number;
  rawParseOk: boolean;
}

/**
 * Self-contained completion call, same pattern as v3/v4's run functions —
 * its own OpenAI client instance, not routed through lib/llm.ts, so real
 * token usage/timing can be captured without touching the shared helper the
 * live pipeline uses.
 */
export async function runDetectionEngineV6(
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>
): Promise<DetectionV6Result> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: DETECTION_PROMPT_V6 },
      { role: 'user', content: JSON.stringify(answers) },
    ],
    temperature: 0,
    seed: 42,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content ?? '{}';
  let signatures: SignatureEntryV6[] = [];
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
