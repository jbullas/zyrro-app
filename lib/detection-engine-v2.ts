import { SIGNATURES, DOMAINS } from '@/lib/signatures';

const DOMAIN_STRUCTURE = DOMAINS.map(domain => {
  const sigs = SIGNATURES.filter(s => s.domain === domain);
  return `${domain}:\n${sigs.map(s => `- ${s.name} — ${s.description}`).join('\n')}`;
}).join('\n\n');

/**
 * #118 Stage 1: standalone Detection Engine v2 prompt, evaluated in
 * isolation per docs/briefs/118-stage0-stage1-evidence-audit-and-detection-engine-v2.md.
 * NOT wired into generateIdentityReport or any API route — the live pipeline
 * still uses lib/prompts/identity-analysis.ts's DETECTION_PROMPT unchanged.
 *
 * Scope is deliberately narrower than DETECTION_PROMPT: this stage only
 * tests evidence extraction + multi-signature linking (evidence_units with
 * signature_links). signatures[]/primary_constellation/named_identity/
 * domain_profile are out of scope here — under this design those become
 * entirely code-computed from evidence_units downstream (see
 * computeSignatureScoresFromEvidenceUnits below), not model output, so
 * asking the model to also emit them here would test something this stage
 * isn't trying to verify.
 */
export const DETECTION_PROMPT_V2 = `You are Zyrro's internal Signature Detection Engine (Evidence Extraction stage).

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

There are 5 domains:

${DOMAIN_STRUCTURE}

## SIGNAL TYPES

You may use ONLY these 4 evidence categories:

1. Energy Peaks
2. Frustration Patterns
3. Recurring Themes
4. Pride Moments

Do not invent any other signal categories.

## REQUIRED ANALYSIS LAYERS

You must analyze at all 3 levels:
1. Answer-level
2. Cross-answer pattern-level
3. Whole narrative level

Always prioritize cross-answer consistency over isolated statements.

## EVIDENCE EXTRACTION PROCESS

Step 1:
Segment the answers into evidence units, such as:
- behaviors
- motivations
- frustrations
- energizers
- repeated patterns

Step 2:
Tag each evidence unit with:
- one or more valid signal types
- emotional weight: low, medium, or high

Step 3:
For each evidence unit, identify every signature it provides real evidence for — not just one primary candidate. Most evidence units will link to only one signature; some will genuinely support more than one. For every signature you link, state the lens: what THAT signature specifically reads into this event. Each link's lens must differ genuinely from any other link's lens on the same evidence unit — describe what is distinct about how each signature interprets this same piece of evidence, not a reworded restatement of the same interpretation.

Step 4:
For every link, rate its relevance:

- Strong = unambiguous, direct evidence, no interpretive stretch needed.
- Normal = a real, defensible link, but requires some interpretation to connect it.
- Weak = plausibly related, but a stretch.

Reserve Strong for genuinely clear cases. Do not default to Strong — if most of your links end up Strong, you are not calibrating, you are rubber-stamping. Most real evidence should land on Normal; Weak should be used whenever the connection is a genuine stretch, not omitted to make the analysis look cleaner.

Do not link a signature just to be thorough or to hedge your bets — only link signatures the evidence unit genuinely supports. There is no cap on the number of links per evidence unit, but every additional link must earn its place with a real, distinct lens and an honest relevance rating.

## HARD CONSTRAINTS

These rules are non-negotiable:

- No top signature from a single weak mention
- Ignore aspiration without evidence
- Ignore job titles as primary signal
- Do not overweight recent emotion
- Resolve conflicts by FUNCTION, not similarity
- Accuracy > creativity
- Evidence > interpretation
- Consistency > novelty

## QUESTION WEIGHTING

Question weighting rules:
- Q1–3 = pattern history
- Q4–5 = energy + frustration
- Q6–10 = misalignment
- Q11–12 = strongest intensity signals
- Q13 = direction signals

Q11–12 must strongly influence intensity scoring.

## CONFLICTS YOU MUST DISTINGUISH CAREFULLY

- Builder vs Architect vs Originator
- Pattern Seeker vs Depth Diver vs Contextualiser
- Amplifier vs Catalyst vs Illuminator
- Meaning Maker vs Truth Seeker vs Guardian
- Activator vs Pioneer vs Finisher

Resolve these by function, not surface similarity.

## OUTPUT FORMAT

Return valid JSON only.
No markdown.
No commentary.
No explanation outside the JSON.

Use this exact structure:

{
  "evidence_units": [
    {
      "quote_or_paraphrase": "",
      "source_question": 0,
      "signal_types": [],
      "emotional_weight": "",
      "signature_links": [
        {
          "signature_name": "",
          "lens": "",
          "relevance": ""
        }
      ]
    }
  ]
}

## SCHEMA RULES

- "source_question" must be an integer from 1 to 13
- "signal_types" must only contain:
  "Energy Peaks", "Frustration Patterns", "Recurring Themes", "Pride Moments"
- "emotional_weight" must be one of:
  "low", "medium", "high"
- "signature_links" must contain at least 1 entry. No maximum — link every signature the evidence unit genuinely supports, no more.
- "signature_links[].signature_name" must be an official signature name from the domain structure above.
- "signature_links[].relevance" must be one of:
  "Strong", "Normal", "Weak"

## INSUFFICIENT EVIDENCE RULE

If the evidence is insufficient for reliable linking on a given answer:
- still return whatever evidence units you can extract
- do not invent certainty
- do not force a link that isn't real

Now analyze the user's 13 answers.`;

export type RelevanceLevel = 'Strong' | 'Normal' | 'Weak';

export interface SignatureLinkV2 {
  signature_name: string;
  lens: string;
  relevance: RelevanceLevel;
}

export interface EvidenceUnitV2 {
  quote_or_paraphrase: string;
  source_question: number;
  signal_types: string[];
  emotional_weight: 'low' | 'medium' | 'high';
  signature_links: SignatureLinkV2[];
}

export interface ComputedSignatureScoreV2 {
  name: string;
  frequency: number;
  intensity: number;
  score: number;
  distinct_source_questions: number[];
  link_count: number;
  relevance_counts: Record<RelevanceLevel, number>;
}

const RELEVANCE_TO_INTENSITY: Record<RelevanceLevel, number> = {
  Strong: 5,
  Normal: 3,
  Weak: 1,
};

/**
 * #118 Stage 1: code-computed frequency/intensity/score from evidence_units'
 * signature_links, replacing the model-asserted frequency/intensity/score
 * DETECTION_PROMPT (v1) currently self-reports. First-pass formula per the
 * brief, explicitly provisional pending this stage's real-data verification:
 *
 * Frequency (1-5): breadth — number of distinct source_questions
 * contributing a link to this signature. 1 question -> 1, 2 -> 2, 3 -> 3,
 * 4 -> 4, 5+ -> 5.
 *
 * Intensity (1-5): derived from relevance ratings of this signature's own
 * links, mapped Strong=5/Normal=3/Weak=1, taking the MAX (not average) —
 * one strong link should establish real intensity; averaging would dilute
 * it by combining with weaker links to the same signature.
 *
 * Score = Frequency x Intensity, same formula as the live pipeline's
 * Detection Engine v1.
 */
export function computeSignatureScoresFromEvidenceUnits(
  evidenceUnits: EvidenceUnitV2[]
): ComputedSignatureScoreV2[] {
  const bySignature = new Map<string, { questions: Set<number>; relevances: RelevanceLevel[] }>();

  for (const unit of evidenceUnits) {
    for (const link of unit.signature_links ?? []) {
      if (!link?.signature_name) continue;
      let entry = bySignature.get(link.signature_name);
      if (!entry) {
        entry = { questions: new Set(), relevances: [] };
        bySignature.set(link.signature_name, entry);
      }
      entry.questions.add(unit.source_question);
      if (link.relevance) entry.relevances.push(link.relevance);
    }
  }

  const results: ComputedSignatureScoreV2[] = [];
  for (const [name, entry] of bySignature.entries()) {
    const frequency = Math.min(5, entry.questions.size);
    const intensity = entry.relevances.reduce(
      (max, r) => Math.max(max, RELEVANCE_TO_INTENSITY[r] ?? 0),
      0
    );
    const relevance_counts: Record<RelevanceLevel, number> = { Strong: 0, Normal: 0, Weak: 0 };
    for (const r of entry.relevances) relevance_counts[r] = (relevance_counts[r] ?? 0) + 1;

    results.push({
      name,
      frequency,
      intensity,
      score: frequency * intensity,
      distinct_source_questions: [...entry.questions].sort((a, b) => a - b),
      link_count: entry.relevances.length,
      relevance_counts,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
