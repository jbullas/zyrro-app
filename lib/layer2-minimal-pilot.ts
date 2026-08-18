import OpenAI from 'openai';

/**
 * #119 Stage 0: standalone Layer 2 prompt A/B pilot, per
 * docs/briefs/119-stage0-minimal-layer2-prompt-ab-test.md. NOT wired into
 * generateIdentityReport or any API route. Tests whether the current live
 * LAYER_2_PROMPT's (lib/prompts/identity-report.ts) large accumulated rule
 * stack is load-bearing, by running an identical Detection Engine output
 * through it (Variant A, unchanged) and through this minimal replacement
 * (Variant B) and comparing real output.
 *
 * VARIANT_B_LAYER2_PROMPT is the exact text specified in the brief's
 * "Variant B — minimal Layer 2 prompt" section — role framing, the 5-step
 * work-through order, and the JSON schema kept; every rule (translation
 * formula, evidence rule, evidence reuse rule, tension rule, specificity
 * rule, repetition rule, frustration inversion rule, no-coaching rule,
 * no-generic-praise rule, named identity hard rules, recognition test,
 * per-field word floors/ceilings, banned-word lists, cross-field
 * echo-checking) stripped. The JSON schema block below is copied verbatim
 * from LAYER_2_PROMPT's OUTPUT FORMAT section (lib/prompts/identity-report.ts)
 * so the two variants are a drop-in comparison on identical output shape —
 * not retyped, to avoid an accidental schema drift becoming a second
 * confound alongside the prompt-wording one this test exists to isolate.
 */
export const VARIANT_B_LAYER2_PROMPT = `You are Zyrro's Report Writer. You receive this person's signature
evidence and scores, already identified and ranked. Write their Identity
Signature Report as JSON matching the schema below. Write in second
person, addressed directly to them.

Work through it in this order:
1. Write a signature card for each of the 5 primary and up to 3 secondary
   signatures you've been given (core_statement, evidence_analysis,
   tension) — grounded in the real evidence provided for each.
2. Write the five How You Operate fields (work_style, thinking_style,
   relationship_style, decision_style, stress_pattern).
3. Using what you wrote in 1 and 2, write the Domain Profile summary,
   the Cover fields (named identity, identity thesis), and the
   constellation synthesis.
4. Write the reframe teaser (recap, reframe, why_bullets).
5. Write energisers and friction_points.

Return valid JSON only. No markdown. No commentary outside the JSON. Use this exact structure:

{
  "artifact_type": "identity_signature_report",
  "schema_version": "1.1",
  "cover": {
    "report_title": "ZYRRO IDENTITY REPORT",
    "prepared_for": "",
    "named_identity": "",
    "identity_context": "",
    "report_metadata": "",
    "identity_thesis": ""
  },
  "what_this_report_is": "",
  "signature_profile_summary": {
    "primary_signatures": [
      { "name": "", "score": 0 }
    ],
    "secondary_signatures": [
      { "name": "", "score": 0 }
    ]
  },
  "primary_constellation": [
    {
      "signature_number": "",
      "name": "",
      "domain": "",
      "score": 0,
      "frequency": 0,
      "intensity": 0,
      "confidence": "",
      "core_statement": "",
      "evidence_analysis": "",
      "tension": ""
    }
  ],
  "secondary_signature_summary": "",
  "secondary_signature_analysis": [
    {
      "signature_number": "",
      "name": "",
      "domain": "",
      "score": 0,
      "core_statement": "",
      "analysis": ""
    }
  ],
  "constellation_synthesis": {
    "named_identity": "",
    "synthesis": ""
  },
  "how_you_operate": {
    "work_style": "",
    "thinking_style": "",
    "relationship_style": "",
    "decision_style": "",
    "stress_pattern": ""
  },
  "energisers": [],
  "friction_points": [],
  "domain_profile": {
    "Visioning": 0,
    "Thinking": 0,
    "Connecting": 0,
    "Driving": 0,
    "Sensing": 0
  },
  "domain_profile_summary": "",
  "reframe_teaser": {
    "recap": "",
    "reframe": "",
    "why_bullets": ["", "", ""]
  },
  "derived_from_signature_analysis": true
}

Now generate the full Identity Signature Report from the provided signature analysis JSON.`;

export interface Layer2PilotRunResult {
  report: Record<string, unknown> | null;
  raw: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  latencyMs: number;
  rawParseOk: boolean;
}

/**
 * Runs one Layer 2 generation against a given prompt variant. Shared by
 * both Variant A (the live LAYER_2_PROMPT, imported unchanged from
 * lib/prompts/identity-report.ts by the caller) and Variant B
 * (VARIANT_B_LAYER2_PROMPT above) so the only difference between the two
 * runs is the prompt text — same model, same temperature, no seed, same
 * max_tokens, matching lib/generate-identity-report.ts's real Step B call
 * exactly (no seed on Layer 2 in the live pipeline, unlike Layer 1).
 */
export async function runLayer2Variant(
  prompt: string,
  analysis: unknown,
  name: string
): Promise<Layer2PilotRunResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: `User name: ${name}\nAnalysis: ${JSON.stringify(analysis)}` },
    ],
    temperature: 0,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const raw = response.choices[0]?.message?.content ?? '{}';
  let report: Record<string, unknown> | null = null;
  let rawParseOk = true;
  try {
    report = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    rawParseOk = false;
  }

  return {
    report,
    raw,
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
