import { getChatCompletion } from '@/lib/llm';
import { PATH_REPORT_PROMPT } from '@/lib/prompts/path-report';
import type { PrimarySignatureAnalysis } from '@/lib/artifact-schemas';
import { findMustAvoidViolations, type MustAvoidViolation } from '@/lib/generate-path-options-session';

// #134 Slice 3 — "Your Path" final delivery generation. New, standalone
// logic — does NOT call or adapt runStage5Develop/runStage6Report or their
// prompts (lib/generate-path-checkpoint.ts, lib/prompts/path-checkpoint.ts).
// Those expect a richer per-signature evidence_citation/desire_citation/
// grounded_in shape the old Stage 1-4 capability/desire-intersection
// pipeline produced; Direction/Options don't produce that shape (see this
// session's own scoping pass), so bridging into it would mean fabricating
// citation structure the new flow never actually computed. This module
// works directly from what Direction/Options/identity_report really have.
//
// Must-avoid check: reused from lib/generate-path-options-session.ts
// (findMustAvoidViolations — the negation-aware phrase-presence check
// built and validated against real output in Slice 2), not reimplemented.
// Reasoning for reusing it here, worked through explicitly rather than
// assumed: this prompt carries none of Options' content-bar instruction to
// explicitly explain avoidance (the thing that caused Slice 2's real
// 12/12 false-positive run), and chosen_candidate is already a
// Slice-2-hard-checked, must-avoid-clean option by the time it reaches
// this module — so the risk is lower than Options faced. But must_avoids
// are still passed into this prompt as grounding context, and honest_cost
// in particular is a plausible place for an LLM to reach for reassurance
// framing ("unlike roles with heavy oversight...") even without being
// told to, the same spontaneous pattern Slice 2's real output showed. Kept
// as defense-in-depth rather than dropped.
//
// No material-difference check here, and no over-generate/filter batch
// control flow — that machinery exists in Slice 2 because Options
// generates several independent candidates that must differ from each
// other. This module generates exactly one holistic report; there is
// nothing to compare it against and no "batch" to filter. Control flow is
// simpler: generate once, check every text field, one retry with a steer
// if a violation is found, hard-fail if still violating after that.
//
// Two more checks added after the first real generation run (this
// session's own live test, scripts/test-134-slice3-report-checks.mts)
// surfaced them — not assumed necessary up front, confirmed by real
// output:
// - logPlaceholderBracketsInReport: the real run left literal
//   "[specific date]"-style template text in two of three
//   master_strategy names — traced to this prompt's own worked example
//   using bracket notation illustratively, which the model then copied as
//   if it were real syntax. Fixed at the prompt level (the example no
//   longer uses brackets) with this as a log-only backstop, not a
//   retry trigger — a leftover placeholder is a polish problem, not a
//   trust/compliance one, so it doesn't get the same hard-fail treatment
//   as a must-avoid violation.
// - enforceLifeLeadsTowardNonOverlap: life_it_leads_toward's real output
//   closed on a sentence that was a near-verbatim echo of ideal_life
//   rather than a developed destination. Exactly the failure class
//   enforceConstellationSynthesisNonOverlap already solved for
//   constellation_synthesis vs identity_thesis
//   (lib/generate-identity-report.ts) — same fix applied here, not
//   reinvented. Its helpers aren't exported from that file, so the small
//   normalizeWords/splitSentences/hasOverlappingPhrase trio below is a
//   local duplicate — same situation lib/generate-path-options-session.ts
//   was already in for its own overlap check, not a new inconsistency.

export interface PathReportGenerationContext {
  chosen_candidate: { name: string; description: string };
  comments: string;
  must_haves: string[];
  must_avoids: string[];
  ideal_life: string;
  primary_constellation: PrimarySignatureAnalysis[];
}

export interface OutlineObjective {
  name: string;
  description: string;
  sequencing_rationale: string;
}

// The LLM-generated fields only — chosen_candidate/comments/project_name
// (the rest of path_report's persisted content, per the confirmed schema)
// aren't generated here, they're attached by the caller from data it
// already has.
export interface PathReportDraft {
  thesis: string;
  what_it_is: string;
  why_it_fits: string;
  honest_cost: string;
  life_it_leads_toward: string;
  master_strategy: OutlineObjective[];
}

export type PathReportStatus = 'generating' | 'ready' | 'failed';

// The full persisted content shape — PathReportDraft's generated fields
// plus the fields attached by the caller (chosen_candidate/comments,
// snapshotted from path_options_session at generation time; project_name,
// absent until the user is asked, set to a real string on a genuine pick
// or explicit null on skip). Lives here rather than a dedicated
// lib/path-report.ts module — this artifact's Tier C CRUD is simple enough
// (no state machine beyond a single failed-row-resume case) to live inline
// in app/api/path-report/route.ts, so this file is the natural home for
// its TS shape, the same way PathReportDraft already is for the generated
// subset of it.
export interface PathReportContent extends PathReportDraft {
  chosen_candidate: { id: string; name: string; description: string };
  comments: string;
  project_name?: string | null;
}

function validatePathReportDraft(data: unknown): data is PathReportDraft {
  const d = data as PathReportDraft | null;
  if (!d || typeof d !== 'object') return false;

  const requiredStrings: (keyof PathReportDraft)[] = [
    'thesis', 'what_it_is', 'why_it_fits', 'honest_cost', 'life_it_leads_toward',
  ];
  if (!requiredStrings.every(k => typeof d[k] === 'string' && (d[k] as string).trim().length > 0)) return false;

  if (!Array.isArray(d.master_strategy) || d.master_strategy.length === 0) return false;
  return d.master_strategy.every(o =>
    !!o && typeof o === 'object' &&
    typeof o.name === 'string' && o.name.trim().length > 0 &&
    typeof o.description === 'string' && o.description.trim().length > 0 &&
    typeof o.sequencing_rationale === 'string' && o.sequencing_rationale.trim().length > 0,
  );
}

// ── Placeholder-bracket check (log-only) ────────────────────────────────

const PLACEHOLDER_BRACKET_PATTERN = /\[[^\]]{1,60}\]/;

/**
 * Scans every text field for literal bracket-placeholder text (e.g.
 * "[specific date]") a model can leave behind when it treats a prompt's own
 * illustrative example as syntax to reproduce rather than a pattern to
 * follow. Log-only — see this file's header for why this doesn't block
 * generation the way the must-avoid check does.
 */
function logPlaceholderBracketsInReport(draft: PathReportDraft): void {
  const fields: Array<[string, string]> = [
    ['thesis', draft.thesis],
    ['what_it_is', draft.what_it_is],
    ['why_it_fits', draft.why_it_fits],
    ['honest_cost', draft.honest_cost],
    ['life_it_leads_toward', draft.life_it_leads_toward],
    ...draft.master_strategy.flatMap((o, i): Array<[string, string]> => [
      [`master_strategy[${i}].name`, o.name],
      [`master_strategy[${i}].description`, o.description],
      [`master_strategy[${i}].sequencing_rationale`, o.sequencing_rationale],
    ]),
  ];

  const flagged = fields.filter(([, text]) => PLACEHOLDER_BRACKET_PATTERN.test(text));
  if (flagged.length > 0) {
    console.warn(
      'path_report: literal placeholder-bracket text found in generated output:',
      flagged.map(([label, text]) => `${label}: "${text.match(PLACEHOLDER_BRACKET_PATTERN)?.[0]}" in "${text}"`).join(' | '),
    );
  }
}

// ── life_it_leads_toward / ideal_life overlap check (strip when safe) ──

// Same family and same threshold as CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS
// (lib/generate-identity-report.ts) — analogous corpus shape (a short input
// reference text vs. a several-sentence generated field), not the longer
// MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS threshold from
// lib/generate-path-options-session.ts, which was calibrated for much
// longer option-description-vs-option-description comparisons.
const LIFE_IDEAL_MIN_OVERLAP_WORDS = 4;

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function hasOverlappingPhrase(a: string[], b: string[], minWords: number): boolean {
  if (a.length < minWords || b.length < minWords) return false;
  for (let i = 0; i <= a.length - minWords; i++) {
    const window = a.slice(i, i + minWords).join(' ');
    for (let j = 0; j <= b.length - minWords; j++) {
      if (b.slice(j, j + minWords).join(' ') === window) return true;
    }
  }
  return false;
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (matches) return matches.map(s => s.trim()).filter(Boolean);
  return text.trim() ? [text.trim()] : [];
}

/**
 * Strips any sentence in life_it_leads_toward that shares a 4+-word run
 * with ideal_life — same remedy as enforceConstellationSynthesisNonOverlap:
 * there's no deterministic way to turn a restatement into new content, only
 * to remove it. Unlike that function, this one will NOT empty the field
 * entirely even if every sentence overlaps — life_it_leads_toward is a
 * required non-empty field per validatePathReportDraft, and leaving it
 * empty would fail validation and burn the one retry on a much lower-
 * stakes issue than a must-avoid violation. In that rare case, logs a
 * warning and leaves the text untouched instead.
 */
function enforceLifeLeadsTowardNonOverlap(draft: PathReportDraft, idealLife: string): void {
  if (!idealLife || !idealLife.trim()) return;

  const idealLifeWords = normalizeWords(idealLife);
  if (idealLifeWords.length < LIFE_IDEAL_MIN_OVERLAP_WORDS) return;

  const sentences = splitSentences(draft.life_it_leads_toward);
  if (sentences.length === 0) return;

  const kept = sentences.filter(
    sentence => !hasOverlappingPhrase(normalizeWords(sentence), idealLifeWords, LIFE_IDEAL_MIN_OVERLAP_WORDS),
  );

  if (kept.length === sentences.length) return;

  if (kept.length === 0) {
    console.warn(
      `path_report: every sentence in life_it_leads_toward overlapped ideal_life by ${LIFE_IDEAL_MIN_OVERLAP_WORDS}+ words — ` +
      `left untouched rather than emptying a required field. ideal_life="${idealLife}" life_it_leads_toward="${draft.life_it_leads_toward}"`,
    );
    return;
  }

  draft.life_it_leads_toward = kept.join(' ');
}

async function requestReportDraft(
  context: PathReportGenerationContext,
  steer: string | undefined,
): Promise<PathReportDraft> {
  const payload = {
    chosen_candidate: context.chosen_candidate,
    comments: context.comments,
    must_haves: context.must_haves,
    must_avoids: context.must_avoids,
    ideal_life: context.ideal_life,
    primary_constellation: context.primary_constellation,
    ...(steer ? { steer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PATH_REPORT_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 4000,
    temperature: 0.4,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validatePathReportDraft(parsed)) {
    throw new Error('Path report generation failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }

  logPlaceholderBracketsInReport(parsed);
  enforceLifeLeadsTowardNonOverlap(parsed, context.ideal_life);

  return parsed;
}

/**
 * Scans every text field of a draft — including each master_strategy
 * objective's name/description/sequencing_rationale, not just the top-level
 * prose fields — for must-avoid violations. Deduplicates by must_avoid
 * string so a phrase touched in two different fields is only reported once.
 * Exported (not kept private) so it's directly fixture-testable without a
 * real LLM call, same precedent as lib/generate-path-options-session.ts's
 * own findMustAvoidViolations/findMaterialDuplicates.
 */
export function findMustAvoidViolationsInReport(draft: PathReportDraft, mustAvoids: string[]): MustAvoidViolation[] {
  const fields = [
    draft.thesis,
    draft.what_it_is,
    draft.why_it_fits,
    draft.honest_cost,
    draft.life_it_leads_toward,
    ...draft.master_strategy.flatMap(o => [o.name, o.description, o.sequencing_rationale]),
  ];

  const seen = new Set<string>();
  const violations: MustAvoidViolation[] = [];
  for (const field of fields) {
    for (const violation of findMustAvoidViolations(field, mustAvoids)) {
      if (!seen.has(violation.must_avoid)) {
        seen.add(violation.must_avoid);
        violations.push(violation);
      }
    }
  }
  return violations;
}

export class PathReportGenerationViolationError extends Error {
  constructor(public readonly violations: MustAvoidViolation[]) {
    super(`Generated report still touched must-avoid(s) after one retry: ${violations.map(v => v.must_avoid).join(', ')}`);
    this.name = 'PathReportGenerationViolationError';
  }
}

/**
 * Generates the final path report — one attempt, then one bounded retry
 * (with the violated must-avoids fed back as steering context) if the
 * first attempt touches any, then a hard-fail if still violating. A future
 * API route's job (not built this slice) to catch PathReportGenerationViolationError
 * and persist a visible failed state, same as every other generation route
 * in this project catches and marks its artifact 'failed'.
 */
export async function generatePathReport(context: PathReportGenerationContext): Promise<PathReportDraft> {
  let draft = await requestReportDraft(context, undefined);
  let violations = findMustAvoidViolationsInReport(draft, context.must_avoids);

  if (violations.length > 0) {
    const steer =
      `The previous attempt touched these must-avoid(s), which must not appear anywhere in the report: ` +
      `${violations.map(v => v.must_avoid).join(', ')}. Do not name them, reference them, or restate them in ` +
      `any form — write around them entirely.`;
    draft = await requestReportDraft(context, steer);
    violations = findMustAvoidViolationsInReport(draft, context.must_avoids);
  }

  if (violations.length > 0) {
    throw new PathReportGenerationViolationError(violations);
  }

  return draft;
}
