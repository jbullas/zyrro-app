import OpenAI from 'openai';
import { SIGNATURES, DOMAINS } from '@/lib/signatures';

const DOMAIN_STRUCTURE = DOMAINS.map(domain => {
  const sigs = SIGNATURES.filter(s => s.domain === domain);
  return `${domain}:\n${sigs.map(s => `- ${s.name} — ${s.description}`).join('\n')}`;
}).join('\n\n');

/**
 * #118 Stage 1h: standalone Detection Engine v8, evaluated in isolation per
 * docs/briefs/118-stage1h-detection-engine-v8-separate-review-call.md.
 * NOT wired into generateIdentityReport or any API route.
 * lib/detection-engine-v2/v3/v4/v5/v6/v7.ts all stay as-is, untouched, per
 * each stage's own Definition of Done.
 *
 * Two genuinely separate calls, testing whether removing the shared
 * generation context between draft and review (v7's structure kept both
 * inside one completion) produces real, discriminating review behavior
 * where v5 (single self-applied instruction) and v7 (forced two-phase
 * output, same call) both failed on the same two motivating cases
 * (Matteo's Architect/Contextualiser Q5, Originator/Pioneer Q3).
 *
 * Call A: v5's structure exactly (v3 base + Fix 1 dedup + Fix 3 broader
 * scan), with Fix 2's self-review instruction removed — that's Call B's
 * job now, not something Call A should attempt on its own.
 *
 * Call B: a new prompt/completion that receives only Call A's finished
 * signatures[] output as input — not the original 13 discovery answers,
 * not any extraction reasoning. It reviews each link fresh, with no memory
 * of having produced it.
 */
export const DETECTION_PROMPT_V8_CALL_A = `You are Zyrro's internal Signature Detection Engine (Evidence Extraction stage, signature-first design).

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

You must evaluate EVERY ONE of the 25 signatures listed above, one at a time, grouped by domain. For each signature, ask yourself: does the evidence in these 13 answers genuinely support this signature?

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

## DEDUPLICATION BEFORE EXTRACTION

Before creating a new evidence_unit, check whether the same underlying event or statement already exists as an evidence_unit elsewhere in your response, even if worded differently or paraphrased from a different angle, as long as it draws on the same underlying answer and the same real event. If it does, add a new signature_link to that existing evidence_unit instead of creating a second, separate evidence_unit for the same event.

## BROADER CANDIDATE SCAN BEFORE FINALIZING LINKS

When deciding whether an evidence_unit supports more than one signature, do not limit yourself to whichever signature is already under consideration. Before finalizing an evidence_unit's signature_links, check it against the full set of signatures you've found real evidence for in this person's answers so far, not just the one or two that came to mind first.

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

Now evaluate all 25 signatures against the user's 13 answers.`;

/**
 * Call B receives ONLY Call A's finished output — no discovery_answers,
 * no extraction reasoning, no memory of having produced the draft. It is a
 * cold, independent second opinion on a list handed to it as someone
 * else's work.
 */
export const DETECTION_PROMPT_V8_CALL_B = `You are reviewing a list of evidence-to-signature links that have already been extracted by someone else's analysis. You did not produce this list and have no knowledge of how or why any specific link was made.

For each link, judge it fresh, on its own: does this specific piece of evidence genuinely support this specific signature at the rating it was given? You do not know why the original link was made and should not assume it was reasoned well just because it exists.

If a link doesn't hold up on independent review, downgrade its relevance or remove it entirely. If two links on the same underlying evidence exist (e.g. the same quote linked to two different signatures), you must judge each independently — do not let one signature's strong fit make you more lenient toward the other, and do not let one signature's weak fit make you unfairly harsher toward the other either. Each link stands or falls entirely on its own merits.

Relevance calibration, unchanged from the original extraction:
- Strong = unambiguous, direct evidence, no interpretive stretch needed.
- Normal = a real, defensible link, but requires some interpretation to connect it.
- Weak = plausibly related, but a stretch.

You are not asked to find new evidence or new links. Only review what is given. A signature with an empty evidence array stays empty. Do not add signatures or evidence that weren't in the original list.

Return valid JSON only. No markdown. No commentary outside the JSON.

Use this exact structure:

{
  "reviewed_signatures": [
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

"reviewed_signatures" MUST contain exactly 25 entries, matching every signature_name present in the input list — no duplicates, none missing. For each, include only the evidence entries that survive your independent review, with their final relevance rating (unchanged if it holds, downgraded if it doesn't fully hold, removed entirely if it doesn't belong at all). Do not change quote_or_paraphrase, source_question, or signal_types — only relevance may change, and evidence entries may be removed. lens may be left as given.

Here is the list to review:`;

export type RelevanceLevel = 'Strong' | 'Normal' | 'Weak';

export interface EvidenceEntryV8 {
  quote_or_paraphrase: string;
  source_question: number;
  signal_types: string[];
  emotional_weight: 'low' | 'medium' | 'high';
  relevance: RelevanceLevel;
  lens: string;
}

export interface SignatureEntryV8 {
  signature_name: string;
  evidence: EvidenceEntryV8[];
}

export interface ComputedSignatureScoreV8 {
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

/** Same formula as v2/v3/v4/v5/v6/v7, unchanged. Applied to Call B's reviewed_signatures. */
export function computeSignatureScoresFromV8(signatures: SignatureEntryV8[]): ComputedSignatureScoreV8[] {
  const results: ComputedSignatureScoreV8[] = [];

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

export interface CallResult {
  signatures: SignatureEntryV8[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  latencyMs: number;
  rawParseOk: boolean;
}

/** Call A — same self-contained-client pattern as every prior standalone engine version. */
export async function runDetectionEngineV8CallA(
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>
): Promise<CallResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: DETECTION_PROMPT_V8_CALL_A },
      { role: 'user', content: JSON.stringify(answers) },
    ],
    temperature: 0,
    seed: 42,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content ?? '{}';
  let signatures: SignatureEntryV8[] = [];
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

/**
 * Call B — a genuinely separate completion. Receives ONLY Call A's
 * signatures[] (serialized as its sole user-message content), no
 * discovery_answers, no shared context, no system-prompt overlap with
 * Call A beyond the relevance calibration definitions (restated fresh,
 * not carried over as shared state).
 */
export async function runDetectionEngineV8CallB(callAOutput: SignatureEntryV8[]): Promise<CallResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: DETECTION_PROMPT_V8_CALL_B },
      { role: 'user', content: JSON.stringify({ signatures: callAOutput }) },
    ],
    temperature: 0,
    seed: 42,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content ?? '{}';
  let signatures: SignatureEntryV8[] = [];
  let rawParseOk = true;
  try {
    const parsed = JSON.parse(content);
    signatures = Array.isArray(parsed.reviewed_signatures) ? parsed.reviewed_signatures : [];
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
