import type { SupabaseClient } from '@supabase/supabase-js';
import { getChatCompletion } from '@/lib/llm';
import { mergeAnswersWithQuestions, type MergedAnswer } from '@/lib/identity-questions';
import type {
  IdentitySignatureReportArtifactContent,
  SignatureScore,
  PrimarySignatureAnalysis,
  SecondarySignatureAnalysis,
} from '@/lib/artifact-schemas';
import {
  STAGE2_INTERSECTIONS_PROMPT,
  STAGE3_FRICTION_PROMPT,
  STAGE4_CANDIDATES_PROMPT,
  STAGE5_DEVELOP_PROMPT,
  STAGE6_REPORT_PROMPT,
} from '@/lib/prompts/path-checkpoint';

// #129 Stage B — real reasoning for Stages 1-4 of the checkpoint-guided
// path-selection redesign, built on top of Stage A's lib/path-checkpoint.ts
// state machine (not replacing it). See
// docs/briefs/129-stage-b-reasoning-pipeline-brief.md.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface Stage1Context {
  prepared_for: string;
  discovery_answers: MergedAnswer[];
  full_signatures: SignatureScore[];
  used_full_signature_list: boolean;
  primary_constellation: PrimarySignatureAnalysis[];
  secondary_signature_analysis: SecondarySignatureAnalysis[];
  energisers: string[];
  friction_points: string[];
  forward_frame: string;
}

/**
 * Stage 1 — pure retrieval, no LLM call. Assembles the richer input set
 * design doc §3 Stage 1 calls for: raw discovery_answers (not just the
 * report's interpretation of them), the FULL scored signatures[] list
 * (persisted since #62 on raw_signature_analysis, not just the top-5
 * primary_constellation) with a documented fallback for reports that predate
 * that field, energisers/friction_points, and reframe_teaser.forward_frame.
 */
export async function ingestStage1Context(
  supabase: Client,
  userId: string,
  identityReport: IdentitySignatureReportArtifactContent,
): Promise<Stage1Context> {
  const { data: rows, error } = await supabase
    .from('discovery_answers')
    .select('question_number, answer_text')
    .eq('user_id', userId);

  if (error) throw error;

  const discoveryAnswers = mergeAnswersWithQuestions(rows ?? []);

  const rawSignatures = identityReport.raw_signature_analysis?.signatures;
  const usedFull = Array.isArray(rawSignatures) && rawSignatures.length > 0;

  // Fallback only exercised for reports that predate #62 (no
  // raw_signature_analysis persisted) — degrade to the top-5 names/scores
  // the report does have, rather than fail Stage 1 outright. Not a
  // fabrication: every field here is real, just thinner than the full list.
  const fullSignatures: SignatureScore[] = usedFull
    ? rawSignatures!
    : identityReport.primary_constellation.map(p => ({
        name: p.name,
        domain: p.domain,
        definition: '',
        evidence_count: 0,
        supporting_evidence_indexes: [],
        frequency: 0,
        intensity: 0,
        score: p.score,
        score_band: 'moderate',
        confidence: 'medium',
      }));

  return {
    prepared_for: identityReport.cover.prepared_for,
    discovery_answers: discoveryAnswers,
    full_signatures: fullSignatures,
    used_full_signature_list: usedFull,
    primary_constellation: identityReport.primary_constellation,
    secondary_signature_analysis: identityReport.secondary_signature_analysis,
    energisers: identityReport.energisers,
    friction_points: identityReport.friction_points,
    forward_frame: identityReport.reframe_teaser?.forward_frame ?? '',
  };
}

export interface Stage2Overlap {
  signature: string;
  domain: string;
  evidence_citation: string;
  desire_citation: string;
  desire_source: 'energiser' | 'forward_frame';
  rationale: string;
}

export interface Stage2Output {
  overlaps: Stage2Overlap[];
  capability_only: Array<{ signature: string; evidence_citation: string; note: string }>;
  desire_only: Array<{ desire_citation: string; desire_source: string; note: string }>;
  system_checks: Record<string, boolean>;
}

function validateStage2Output(data: unknown): data is Stage2Output {
  const d = data as Stage2Output;
  if (!Array.isArray(d?.overlaps) || !Array.isArray(d?.capability_only) || !Array.isArray(d?.desire_only)) return false;
  return d.overlaps.every(o =>
    typeof o.signature === 'string' && o.signature.length > 0 &&
    typeof o.evidence_citation === 'string' && o.evidence_citation.length > 0 &&
    typeof o.desire_citation === 'string' && o.desire_citation.length > 0 &&
    typeof o.rationale === 'string' && o.rationale.length > 0
  );
}

export async function runStage2Intersections(context: Stage1Context, redoSteer?: string): Promise<Stage2Output> {
  const payload = {
    discovery_answers: context.discovery_answers,
    full_signatures: context.full_signatures,
    primary_constellation: context.primary_constellation,
    secondary_signature_analysis: context.secondary_signature_analysis,
    energisers: context.energisers,
    friction_points: context.friction_points,
    forward_frame: context.forward_frame,
    ...(redoSteer ? { redo_steer: redoSteer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: STAGE2_INTERSECTIONS_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 4000,
    temperature: 0.3,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateStage2Output(parsed)) {
    throw new Error('Stage 2 output failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}

export interface Stage3Output {
  // Each element carries friction_considered on top of Stage2Overlap's
  // fields — element-type intersection, not an array-type intersection
  // (Stage2Overlap[] & Array<{...}>, the original Stage B shape), which
  // left .filter()'s return type ambiguous for Stage C's callers.
  surviving: Array<Stage2Overlap & { friction_considered: string }>;
  dropped: Array<{ signature: string; friction_point_cited: string; reason: string }>;
}

function validateStage3Output(data: unknown): data is Stage3Output {
  const d = data as Stage3Output;
  if (!Array.isArray(d?.surviving) || !Array.isArray(d?.dropped)) return false;
  return d.surviving.every(o =>
    typeof o.signature === 'string' && o.signature.length > 0 &&
    typeof o.evidence_citation === 'string' &&
    typeof o.desire_citation === 'string' &&
    typeof (o as { friction_considered?: string }).friction_considered === 'string'
  );
}

export async function runStage3Friction(stage2: Stage2Output, frictionPoints: string[]): Promise<Stage3Output> {
  const payload = { overlaps: stage2.overlaps, friction_points: frictionPoints };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: STAGE3_FRICTION_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 4000,
    temperature: 0,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateStage3Output(parsed)) {
    throw new Error('Stage 3 output failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}

export interface Stage4Candidate {
  id: string;
  name: string;
  thesis: string;
  signatures_engaged: string[];
  grounded_in: string[];
}

export interface Stage4Output {
  candidates: Stage4Candidate[];
  discarded: Array<{ signature: string; reason: string }>;
  system_checks: Record<string, boolean>;
}

function validateStage4Output(data: unknown): data is Stage4Output {
  const d = data as Stage4Output;
  if (!Array.isArray(d?.candidates) || !Array.isArray(d?.discarded)) return false;
  if (d.candidates.length === 0) return false;
  return d.candidates.every(c =>
    typeof c.id === 'string' && typeof c.name === 'string' && typeof c.thesis === 'string' &&
    Array.isArray(c.signatures_engaged) && Array.isArray(c.grounded_in) && c.grounded_in.length > 0
  );
}

// Only ever reads `.surviving` — accepting the narrower shape (rather than
// a full Stage3Output) means a caller re-running Stage 4 alone (a redo,
// working from an already-recorded Stage 3 result) can pass the real
// `surviving` array it has on hand without fabricating a `dropped: []` it
// doesn't have and doesn't need.
export async function runStage4Candidates(
  stage3: Pick<Stage3Output, 'surviving'>,
  preparedFor: string,
  redoSteer?: string,
): Promise<Stage4Output> {
  const payload = {
    surviving_overlaps: stage3.surviving,
    prepared_for: preparedFor,
    ...(redoSteer ? { redo_steer: redoSteer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: STAGE4_CANDIDATES_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 4000,
    temperature: 0.3,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateStage4Output(parsed)) {
    throw new Error('Stage 4 output failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}

export type StretchType = 'Natural' | 'Adjacent' | 'Reinvention';

export interface Stage5Output {
  developed_thesis: string;
  anchoring_signatures: string[];
  stretch: StretchType;
  stretch_rationale: string;
  evidence_citation: string;
  desire_citation: string;
  desire_source: 'energiser' | 'forward_frame';
  friction_considered: string;
  honest_cost_note: string;
  rationale: string;
}

function validateStage5Output(data: unknown): data is Stage5Output {
  const d = data as Stage5Output;
  return (
    typeof d?.developed_thesis === 'string' && d.developed_thesis.length > 0 &&
    Array.isArray(d.anchoring_signatures) && d.anchoring_signatures.length > 0 &&
    (d.stretch === 'Natural' || d.stretch === 'Adjacent' || d.stretch === 'Reinvention') &&
    typeof d.evidence_citation === 'string' && d.evidence_citation.length > 0 &&
    typeof d.desire_citation === 'string' && d.desire_citation.length > 0 &&
    typeof d.honest_cost_note === 'string' && d.honest_cost_note.length > 0
  );
}

/**
 * Resolves Checkpoint 2's chosen candidate plus the Stage 3 overlaps it
 * consolidates, from a session's stage_outputs — the plain filter step
 * runStage5Develop's callers both need (the initial kickoff in
 * generate-path-options/route.ts, and a Checkpoint 3 redo in
 * path-checkpoint-response/route.ts). Not reasoning, so kept out of the
 * prompt-calling functions themselves.
 */
export function resolveChosenCandidateInputs(
  stageOutputs: Record<string, unknown>,
  chosenCandidateId: string | undefined,
): { chosenCandidate: Stage4Candidate; groundedOverlaps: Stage3Output['surviving'] } {
  const stage3 = stageOutputs.stage3 as Stage3Output;
  const stage4 = stageOutputs.stage4 as Stage4Output;
  const chosenCandidate = stage4.candidates.find(c => c.id === chosenCandidateId);

  if (!chosenCandidateId || !chosenCandidate) {
    throw new Error(`No valid chosen_candidate_id (${chosenCandidateId}) found among stage4.candidates`);
  }

  const groundedOverlaps = stage3.surviving.filter(o => chosenCandidate.grounded_in.includes(o.signature));
  return { chosenCandidate, groundedOverlaps };
}

/**
 * Stage 5 — develop the chosen candidate alone. `groundedOverlaps` is
 * Stage 3's surviving overlaps narrowed to the ones the chosen candidate
 * actually consolidates (via its `grounded_in` signature names) — the
 * caller resolves that narrowing since it's a plain filter, not reasoning.
 */
export async function runStage5Develop(
  chosenCandidate: Stage4Candidate,
  groundedOverlaps: Stage3Output['surviving'],
  frictionPoints: string[],
  preparedFor: string,
  redoSteer?: string,
): Promise<Stage5Output> {
  const payload = {
    chosen_candidate: chosenCandidate,
    grounded_overlaps: groundedOverlaps,
    friction_points: frictionPoints,
    prepared_for: preparedFor,
    ...(redoSteer ? { redo_steer: redoSteer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: STAGE5_DEVELOP_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 3000,
    temperature: 0.3,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateStage5Output(parsed)) {
    throw new Error('Stage 5 output failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}

export interface Stage6MasterStrategyObjective {
  name: string;
  description: string;
  sequencing_rationale: string;
  grounded_in: string[];
}

export interface Stage6Output {
  thesis: string;
  what_it_is: string;
  why_it_fits: string;
  not_this: string;
  honest_cost: string;
  life_it_leads_toward: string;
  master_strategy: Stage6MasterStrategyObjective[];
  plan_seed_actions: string[];
}

function validateStage6Output(data: unknown): data is Stage6Output {
  const d = data as Stage6Output;
  const requiredStrings: (keyof Stage6Output)[] = [
    'thesis', 'what_it_is', 'why_it_fits', 'not_this', 'honest_cost', 'life_it_leads_toward',
  ];
  if (!requiredStrings.every(k => typeof d?.[k] === 'string' && (d[k] as string).length > 0)) return false;
  if (!Array.isArray(d.master_strategy) || d.master_strategy.length === 0) return false;
  if (!d.master_strategy.every(o =>
    typeof o.name === 'string' && o.name.length > 0 &&
    typeof o.description === 'string' && o.description.length > 0 &&
    typeof o.sequencing_rationale === 'string' && o.sequencing_rationale.length > 0 &&
    Array.isArray(o.grounded_in)
  )) return false;
  if (!Array.isArray(d.plan_seed_actions) || d.plan_seed_actions.length === 0) return false;
  return true;
}

export async function runStage6Report(
  developedDirection: Stage5Output,
  discardedCandidates: Stage4Output['discarded'],
  context: Stage1Context,
): Promise<Stage6Output> {
  const payload = {
    developed_direction: developedDirection,
    discarded_candidates: discardedCandidates,
    prepared_for: context.prepared_for,
    full_signatures: context.full_signatures,
    primary_constellation: context.primary_constellation,
    secondary_signature_analysis: context.secondary_signature_analysis,
    discovery_answers: context.discovery_answers,
    energisers: context.energisers,
    friction_points: context.friction_points,
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: STAGE6_REPORT_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 6000,
    temperature: 0.3,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateStage6Output(parsed)) {
    throw new Error('Stage 6 output failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}
