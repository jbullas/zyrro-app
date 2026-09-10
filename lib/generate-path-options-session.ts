import { randomUUID } from 'node:crypto';
import { getChatCompletion } from '@/lib/llm';
import { PATH_OPTIONS_SESSION_PROMPT } from '@/lib/prompts/path-options-session';
import type { PrimarySignatureAnalysis } from '@/lib/artifact-schemas';
import type { PathOptionsCandidate } from '@/lib/path-options-session';

// #134 Slice 2 — Checkpoint 2 "Options" generation: the LLM call plus the
// two hard checks the brief requires (§4) to run in code rather than trust
// prompt compliance alone, following the same established pattern as
// enforceSecondaryEvidenceFloor/enforceConstellationSynthesisNonOverlap
// (lib/generate-identity-report.ts) — constraint-stacking in prompts alone
// has previously proven unreliable (confirmed across #99/#112/#120). See
// docs/briefs/134-path-redesign-direction-options-your-path.md §4.

export interface OptionsGenerationContext {
  must_haves: string[];
  must_avoids: string[];
  ideal_life: string;
  primary_constellation: PrimarySignatureAnalysis[];
}

export interface OptionDraft {
  name: string;
  description: string;
}

function validateDrafts(data: unknown): OptionDraft[] {
  const options = (data as { options?: unknown } | null)?.options;
  if (!Array.isArray(options)) return [];
  return options.filter((o): o is OptionDraft =>
    !!o && typeof o === 'object' &&
    typeof (o as OptionDraft).name === 'string' && (o as OptionDraft).name.trim().length > 0 &&
    typeof (o as OptionDraft).description === 'string' && (o as OptionDraft).description.trim().length > 0,
  );
}

async function requestOptionDrafts(
  context: OptionsGenerationContext,
  count: number,
  existingCandidates: PathOptionsCandidate[],
  steer: string | undefined,
): Promise<OptionDraft[]> {
  const payload = {
    must_haves: context.must_haves,
    must_avoids: context.must_avoids,
    ideal_life: context.ideal_life,
    primary_constellation: context.primary_constellation,
    existing_options: existingCandidates.map(c => ({ name: c.name, description: c.description })),
    count,
    ...(steer ? { steer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PATH_OPTIONS_SESSION_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 4000,
    temperature: 0.5,
  });

  return validateDrafts(JSON.parse(content ?? '{}'));
}

// ── Hard check 1 — must-avoid involvement ──────────────────────────────
// §4 hard check 1, per this session's confirmed decision: case-insensitive
// phrase-presence against each must_avoid string and close lexical
// variants, scanned over the option description — negation-aware per this
// session's follow-up decision (see NEGATION_CUE_PREFIXES below): a real
// generation run confirmed that content-bar point 4 ("how it avoids every
// must_avoid") reliably produces sentences like "inherently avoids
// ambiguous requirements" / "eliminating any chances of micromanagement" —
// correct, compliant content that a pure phrase-presence check can't tell
// apart from an actual violation. Without this, every compliant option gets
// rejected for correctly explaining its own compliance (confirmed: 12/12
// rejections in one real captured run, script at
// scripts/test-134-slice2-options-checks.mts).

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Deliberately naive suffix-stripping, not a real stemmer — good enough to
 * catch the "close lexical variant" cases that actually show up in short
 * must_avoid phrases (plural/singular, -ing/-ed tense), without adding a
 * dependency. "long review" / "long reviews" / "reviewing" should all
 * collapse to the same stem. Never checked against a huge vocabulary where
 * a naive stemmer's false-positive rate would matter — must_avoid phrases
 * are always short (the brief caps them at 3, drawn from a user's own
 * friction_points selections), so the accidental-collision risk this
 * accepts is small and bounded.
 *
 * The -es branch only fires for a genuine sibilant plural (box -> boxes,
 * watch -> watches) — checked via the preceding letter, not "ends in es"
 * alone. A real captured fixture failure caught the bug this guards
 * against: "cycles" (cycle + s, a word that already ends in e) was
 * stripping 2 chars to "cycl" instead of 1 to "cycle", so it silently
 * stopped matching "cycle" in generated text. Words already ending in e
 * before their plural s (cycle/cycles, phase/phases, state/states) are far
 * more common in this corpus than true sibilant -es plurals, so the plain
 * 1-char strip is the safer default; the sibilant check only overrides it
 * for the narrower case it's actually correct for.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && /(?:[sxz]|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function stemmedWords(text: string): string[] {
  return normalizeWords(text).map(stem);
}

// Checked as a prefix, not exact equality, against already-stemmed words —
// stem() strips different suffixes depending on the inflection actually
// used ("eliminating" -> "eliminat" via the -ing rule, "eliminates" ->
// "eliminate" via the -s rule), so the same root word can land on two
// different stems. A prefix check absorbs that inconsistency without
// needing a real stemmer. 'no'/'none'/'not'/'zero' are checked as exact
// words instead, since prefix-matching short words like "no" would catch
// unrelated words ("normal", "notice"). 'sidestep' added after a real
// captured miss: "sidesteps micromanagement" wasn't covered by the
// original list at all.
const NEGATION_CUE_PREFIXES = ['avoid', 'elimina', 'without', 'unlik', 'never', 'minim', 'remov', 'free', 'sidestep'];
const NEGATION_CUE_EXACT = ['no', 'none', 'not', 'zero'];
// Checked in both directions (see isNegatedOccurrence) — originally
// backward-only, widened after a real captured miss: "Micromanagement is
// eliminated since..." puts the cue word AFTER the phrase, not before it.
const NEGATION_WINDOW_WORDS = 6;

function isNegatedOccurrence(textWords: string[], matchStart: number, matchEnd: number): boolean {
  const windowStart = Math.max(0, matchStart - NEGATION_WINDOW_WORDS);
  const windowEnd = Math.min(textWords.length, matchEnd + NEGATION_WINDOW_WORDS);
  const surrounding = [...textWords.slice(windowStart, matchStart), ...textWords.slice(matchEnd, windowEnd)];
  return surrounding.some(
    w => NEGATION_CUE_EXACT.includes(w) || NEGATION_CUE_PREFIXES.some(prefix => w.startsWith(prefix)),
  );
}

/**
 * True if `phraseWords` appears as a contiguous, non-negated run inside
 * `textWords`, both already stemmed. A phrase can appear more than once
 * (negated one place, not another) — this returns true as soon as it finds
 * one occurrence with no negation cue in either direction, rather than
 * stopping at the first occurrence regardless of polarity.
 *
 * Known limitation, accepted rather than solved: a double-negative like
 * "we don't fully eliminate ambiguous requirements" still reads as
 * negated to this heuristic (the cue word "eliminate" sits next to the
 * phrase) even though the sentence is actually describing a real
 * violation. Same accepted-tradeoff posture as this file's other
 * heuristics (MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS, the naive stemmer
 * above) — catches the common cases confirmed against real generated
 * output, not provably every phrasing. Checking both directions (rather
 * than backward-only) also means an unrelated negation word within the
 * window on either side of a genuine violation can now suppress a real
 * hit — accepted for the same reason: confirmed against real output to
 * fix more than it breaks, not proven to be error-free.
 */
function containsUnnegatedContiguousPhrase(textWords: string[], phraseWords: string[]): boolean {
  if (phraseWords.length === 0 || textWords.length < phraseWords.length) return false;
  for (let i = 0; i <= textWords.length - phraseWords.length; i++) {
    const matchEnd = i + phraseWords.length;
    if (phraseWords.every((w, j) => textWords[i + j] === w) && !isNegatedOccurrence(textWords, i, matchEnd)) {
      return true;
    }
  }
  return false;
}

export interface MustAvoidViolation {
  must_avoid: string;
}

/**
 * Returns every must_avoid the description appears to involve (usually 0 or
 * 1, but not capped at 1) so a caller can build a specific steering message
 * for the retry rather than a generic "something was wrong."
 */
export function findMustAvoidViolations(description: string, mustAvoids: string[]): MustAvoidViolation[] {
  const descriptionWords = stemmedWords(description);
  return mustAvoids
    .filter(mustAvoid => containsUnnegatedContiguousPhrase(descriptionWords, stemmedWords(mustAvoid)))
    .map(mustAvoid => ({ must_avoid: mustAvoid }));
}

// ── Hard check 2 — material difference from every prior candidate ──────
// §4 hard check 2, per this session's confirmed decision: phrase-overlap
// heuristic, same family as enforceConstellationSynthesisNonOverlap
// (lib/generate-identity-report.ts) — reuses that function's sliding-window
// contiguous-run comparison approach, not its threshold (see the constant
// below) or its "strip the offending sentence" remedy: a duplicate here
// taints the whole option, which the batch-generation control flow below
// discards and replaces, rather than trying to edit down to something
// non-duplicate.

// Calibrated against a real captured false-positive pair (same discipline
// as CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS's own calibration, lib/
// generate-identity-report.ts), not picked blind. The original starting
// value (8) was tested against a real generation batch and flagged two
// genuinely different options as duplicates purely because they shared a
// stock 8-word connector sentence the prompt's own rigid content bar
// induces across every option ("aligns with your ideal life by allowing
// you" / "ensuring that each project has a clear scope") — boilerplate
// transition phrasing, not evidence the options themselves were the same
// idea. Raised to 14, comfortably above both observed 8-word false
// positives, while the material-duplicate fixture in
// scripts/test-134-slice2-options-checks.mts (a genuine 16-word verbatim
// overlap) confirms real duplication is still caught at this threshold.
// Still a heuristic, not a semantic check — revisit again if a real near-
// duplicate pair under 14 words surfaces, or if boilerplate phrasing this
// long starts appearing (e.g. if the prompt's content bar is rewritten).
const MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS = 14;

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

export interface MaterialDuplicate {
  candidate_id: string;
  candidate_name: string;
}

/**
 * Compared against `priorCandidates`, which the caller must pass as every
 * candidate already generated THIS SESSION (not just this batch) — brief §4
 * hard check 2 is explicit that this can't be scoped to the current batch
 * alone.
 */
export function findMaterialDuplicates(
  draft: OptionDraft,
  priorCandidates: PathOptionsCandidate[],
): MaterialDuplicate[] {
  const draftWords = normalizeWords(draft.description);
  return priorCandidates
    .filter(c => hasOverlappingPhrase(draftWords, normalizeWords(c.description), MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS))
    .map(c => ({ candidate_id: c.id, candidate_name: c.name }));
}

// ── Batch generation: over-generate, filter, one bounded retry ─────────

// "Over-generate N+2 per batch, take first N passing both checks, one
// bounded retry of the shortfall ... hard-fail if still short after retry" —
// per this session's confirmed decision. The buffer is reapplied to the
// retry batch (sized shortfall + OVERGENERATION_BUFFER, not shortfall
// alone) — this module's own interpretation of "one bounded retry of the
// shortfall": a shortfall-sized retry with zero cushion would have a
// materially worse chance of closing the gap in one shot than the first
// attempt did, for no stated reason to make the retry stingier than the
// original. Flagged here in case that reading isn't what was intended.
const OVERGENERATION_BUFFER = 2;

export class OptionsGenerationShortfallError extends Error {
  constructor(public readonly targetCount: number, public readonly acceptedCount: number) {
    super(`Only generated ${acceptedCount}/${targetCount} compliant options after one retry`);
    this.name = 'OptionsGenerationShortfallError';
  }
}

export interface CandidateBatchResult {
  accepted: PathOptionsCandidate[];
  rejected: Array<{ draft: OptionDraft; reasons: string[] }>;
}

function describeRejection(mustAvoidHits: MustAvoidViolation[], duplicateHits: MaterialDuplicate[]): string[] {
  const reasons: string[] = [];
  for (const hit of mustAvoidHits) reasons.push(`touches must-avoid "${hit.must_avoid}"`);
  for (const hit of duplicateHits) reasons.push(`too similar to already-generated option "${hit.candidate_name}"`);
  return reasons;
}

function buildRetrySteer(baseSteer: string | undefined, rejected: CandidateBatchResult['rejected']): string {
  const rejectionSummary = rejected.map(r => `- "${r.draft.name}": ${r.reasons.join('; ')}`).join('\n');
  const feedback = `The previous attempt had options rejected for these reasons — generate different options that avoid every one of these problems:\n${rejectionSummary}`;
  return baseSteer ? `${baseSteer}\n\n${feedback}` : feedback;
}

/**
 * One round of Checkpoint 2 generation — either the initial 4 (round 1,
 * existingCandidates empty) or a +2 refine round (round 2 or 3). Runs both
 * hard checks against every draft, in order, accepting the first
 * `targetCount` that pass; a draft is checked against existingCandidates
 * PLUS every candidate already accepted earlier in THIS call, so two
 * near-duplicate drafts in the same over-generated batch can't both slip
 * through. One bounded retry (see OVERGENERATION_BUFFER's comment above) if
 * the first attempt falls short; throws OptionsGenerationShortfallError if
 * still short after that — a future API route's job (not built this slice)
 * to catch it and persist a visible failed state, same as every other
 * generation route in this project catches and marks its artifact 'failed'.
 */
export async function generateCandidateBatch(
  context: OptionsGenerationContext,
  targetCount: number,
  existingCandidates: PathOptionsCandidate[],
  round: number,
  steer?: string,
): Promise<CandidateBatchResult> {
  const accepted: PathOptionsCandidate[] = [];
  const rejected: CandidateBatchResult['rejected'] = [];

  async function attempt(count: number, attemptSteer: string | undefined) {
    const drafts = await requestOptionDrafts(context, count, existingCandidates, attemptSteer);

    for (const draft of drafts) {
      if (accepted.length >= targetCount) break;

      const comparisonSet = [...existingCandidates, ...accepted];
      const mustAvoidHits = findMustAvoidViolations(draft.description, context.must_avoids);
      const duplicateHits = mustAvoidHits.length > 0 ? [] : findMaterialDuplicates(draft, comparisonSet);

      if (mustAvoidHits.length > 0 || duplicateHits.length > 0) {
        rejected.push({ draft, reasons: describeRejection(mustAvoidHits, duplicateHits) });
        continue;
      }

      accepted.push({ id: randomUUID(), name: draft.name, description: draft.description, round });
    }
  }

  await attempt(targetCount + OVERGENERATION_BUFFER, steer);

  if (accepted.length < targetCount) {
    const shortfall = targetCount - accepted.length;
    await attempt(shortfall + OVERGENERATION_BUFFER, buildRetrySteer(steer, rejected));
  }

  if (accepted.length < targetCount) {
    console.warn(
      `Path options generation shortfall: ${accepted.length}/${targetCount} after retry.`,
      rejected.map(r => `${r.draft.name}: ${r.reasons.join('; ')}`),
    );
    throw new OptionsGenerationShortfallError(targetCount, accepted.length);
  }

  return { accepted, rejected };
}

export function generateInitialOptions(context: OptionsGenerationContext): Promise<CandidateBatchResult> {
  return generateCandidateBatch(context, 4, [], 1);
}

const MAX_TOTAL_CANDIDATES = 8;
const REFINE_BATCH_SIZE = 2;

/**
 * §4: "up to 2 refinement rounds of +2 each (4 → 6 → 8) ... hard cap: 8
 * total options." round is derived from existingCandidates.length rather
 * than threaded through as a separate counter — matching
 * path_direction_session's "derive step from content shape" precedent
 * (resolveDirectionStep) instead of adding a redundant round-tracking field
 * to the schema.
 */
export function generateRefineOptions(
  context: OptionsGenerationContext,
  existingCandidates: PathOptionsCandidate[],
  steerText: string,
): Promise<CandidateBatchResult> {
  if (existingCandidates.length >= MAX_TOTAL_CANDIDATES) {
    throw new Error(`Already at the ${MAX_TOTAL_CANDIDATES}-candidate cap — refine should not have been offered`);
  }
  const round = existingCandidates.length === 4 ? 2 : existingCandidates.length === 6 ? 3 : NaN;
  if (Number.isNaN(round)) {
    throw new Error(`Unexpected candidate count for a refine round: ${existingCandidates.length}`);
  }
  return generateCandidateBatch(context, REFINE_BATCH_SIZE, existingCandidates, round, steerText);
}
