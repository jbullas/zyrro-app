import { randomUUID } from 'node:crypto';
import { getChatCompletion } from '@/lib/llm';
import { PATH_OPTIONS_SESSION_PROMPT } from '@/lib/prompts/path-options-session';
import { PATH_OPTIONS_SEMANTIC_CHECK_PROMPT } from '@/lib/prompts/path-options-semantic-check';
import type { PrimarySignatureAnalysis, HowYouOperate } from '@/lib/artifact-schemas';
import type { PathOptionsCandidate, FitConfidence } from '@/lib/path-options-session';

// #134 Slice 2 — Checkpoint 2 "Options" generation: the LLM call plus the
// hard checks the brief requires (§4) to run in code rather than trust
// prompt compliance alone, following the same established pattern as
// enforceSecondaryEvidenceFloor/enforceConstellationSynthesisNonOverlap
// (lib/generate-identity-report.ts) — constraint-stacking in prompts alone
// has previously proven unreliable (confirmed across #99/#112/#120). See
// docs/briefs/134-path-redesign-direction-options-your-path.md §4.
//
// #138 rewrote the generation context shape (confidence-filtered signatures
// + how_you_operate, replacing the old always-top-2 primary_constellation),
// added the required select_if field, extended both original hard checks to
// scan select_if alongside description, and added a third hard check for
// job-title-shaped names — a real captured miss from this ticket's own
// prompt-level test run ("Crisis Response Specialist" violated the prompt's
// own stated naming rule in one of two otherwise-identical scenarios),
// confirming the same constraint-stacking-isn't-reliable lesson the other
// two checks already encode.
//
// #138 §5 added a fourth hard check: a single independent LLM judge call per
// generation attempt (see requestSemanticVerdicts below), closing a gap none
// of the phrase-based checks can — an option whose actual substance
// contradicts a must_avoid without ever touching its literal wording. A real
// captured failure during this ticket's own re-testing (2026-09-12): 2/4
// options for an Amara-like profile were team-leadership-framed in substance
// ("Strategic Team Builder," "Outcome-Focused Mentor") against explicit
// delegation/team-management must-avoids, with zero hits from the existing
// phrase-match check. Confirmed decision: no expansion of the must-avoid
// check's phrase vocabulary instead — that's the same brittle mechanism at
// larger scale, permanently one step behind the next euphemism.
//
// #138 §6 added the option-card redesign fields (core_statement, tension,
// signatures_engaged, fit_score, fit_confidence) — see OptionDraft and
// SemanticVerdict below. fit_score/fit_confidence extend the SAME §5 judge
// call rather than adding a new one; validateSemanticVerdicts parses them
// leniently and independently of pass/reasoning specifically so a malformed
// value in either new field can never flip or invalidate a verdict that
// would otherwise have passed/failed exactly as it did before this
// extension — see that function's own comment for why.

export interface OptionsGenerationContext {
  must_haves: string[];
  must_avoids: string[];
  ideal_life: string;
  // #138 §2: already filtered to confidence: High signatures (or the single
  // highest-scoring signature as a fallback when none are High) by the
  // caller (app/api/path-options/route.ts's buildGenerationContext) — this
  // module doesn't do the filtering itself, it just passes through whatever
  // it's given as the primary driver of generation. Renamed from the old
  // primary_constellation (always-top-2) field to signal that shape change.
  signatures: PrimarySignatureAnalysis[];
  how_you_operate: HowYouOperate;
}

export interface OptionDraft {
  name: string;
  // #138 §4: "select this if..." sentence — required on every draft, same
  // hard requirement as name/description.
  select_if: string;
  // #138 §6: option-card redesign fields — see PathOptionsCandidate's own
  // comments (lib/path-options-session.ts) for what each means.
  core_statement: string;
  tension: string;
  signatures_engaged: string[];
  description: string;
}

function validateDrafts(data: unknown): OptionDraft[] {
  const options = (data as { options?: unknown } | null)?.options;
  if (!Array.isArray(options)) return [];
  return options.filter((o): o is OptionDraft =>
    !!o && typeof o === 'object' &&
    typeof (o as OptionDraft).name === 'string' && (o as OptionDraft).name.trim().length > 0 &&
    typeof (o as OptionDraft).select_if === 'string' && (o as OptionDraft).select_if.trim().length > 0 &&
    typeof (o as OptionDraft).core_statement === 'string' && (o as OptionDraft).core_statement.trim().length > 0 &&
    typeof (o as OptionDraft).tension === 'string' && (o as OptionDraft).tension.trim().length > 0 &&
    Array.isArray((o as OptionDraft).signatures_engaged) &&
    (o as OptionDraft).signatures_engaged.length > 0 &&
    (o as OptionDraft).signatures_engaged.every(s => typeof s === 'string' && s.trim().length > 0) &&
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
    signatures: context.signatures,
    how_you_operate: context.how_you_operate,
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
// variants, scanned over the option's user-facing text — negation-aware per
// this session's follow-up decision (see NEGATION_CUE_PREFIXES below): a
// real generation run confirmed that content-bar point 4 ("how it avoids
// every must_avoid") reliably produces sentences like "inherently avoids
// ambiguous requirements" / "eliminating any chances of micromanagement" —
// correct, compliant content that a pure phrase-presence check can't tell
// apart from an actual violation. Without this, every compliant option gets
// rejected for correctly explaining its own compliance (confirmed: 12/12
// rejections in one real captured run, script at
// scripts/test-134-slice2-options-checks.mts). #138 extended this to scan
// select_if as well as description (see the call site in
// generateCandidateBatch below) — select_if is new, real, user-facing text
// on the same candidate and could touch a must-avoid on its own even when
// description is clean.
//
// #138 §6 deliberately did NOT extend this scan to core_statement/tension.
// tension in particular is designed to sometimes name must-avoid-adjacent
// territory as an honest, non-negated partial-overlap caveat ("this asks you
// to coordinate with a small team early on, though not manage them
// long-term") — scanning it here would false-positive on exactly the honest
// content the field exists to contain, since there's no negation cue to
// detect the way there is for compliant description text. Scope stays
// select_if + description only.

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
 * Returns every must_avoid the text appears to involve (usually 0 or 1, but
 * not capped at 1) so a caller can build a specific steering message for the
 * retry rather than a generic "something was wrong." `text` is whatever
 * user-facing content needs scanning — #138's call site passes select_if and
 * description combined, not description alone.
 */
export function findMustAvoidViolations(text: string, mustAvoids: string[]): MustAvoidViolation[] {
  const textWords = stemmedWords(text);
  return mustAvoids
    .filter(mustAvoid => containsUnnegatedContiguousPhrase(textWords, stemmedWords(mustAvoid)))
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
// non-duplicate. #138 extended the compared text to include select_if
// alongside description, both for the draft and for stored candidates
// (PathOptionsCandidate now has a real select_if field to compare).
// core_statement/tension are NOT included here either, for the same reason
// they're excluded from hard check 1's scan — see that comment above.

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

function comparableText(selectIf: string, description: string): string {
  return `${selectIf}\n\n${description}`;
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
  const draftWords = normalizeWords(comparableText(draft.select_if, draft.description));
  return priorCandidates
    .filter(c => hasOverlappingPhrase(draftWords, normalizeWords(comparableText(c.select_if, c.description)), MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS))
    .map(c => ({ candidate_id: c.id, candidate_name: c.name }));
}

// ── Hard check 3 — job-title-shaped name ────────────────────────────────
// §4/§1 hard check, added by #138: a real captured miss from this ticket's
// own prompt-level test run (2026-09-11) — "Crisis Response Specialist"
// violated the prompt's own explicit naming rule (never name an option like
// a job title) in one scenario, while a near-identical option in a parallel
// scenario ("Crisis Response Innovator") correctly avoided it. Same
// constraint-stacking-isn't-reliable lesson hard checks 1/2 already encode,
// applied to naming instead of content. Checks the LAST WORD of the name,
// stemmed (so a plural like "Managers" still matches), against the same
// suffix list the prompt itself states — not a substring scan, so a name
// like "Ledger" doesn't false-positive on "led" and "Speciality Stores"
// doesn't false-positive mid-word.
const JOB_TITLE_NAME_SUFFIXES = ['specialist', 'director', 'lead', 'manager', 'officer'];

export interface JobTitleNameViolation {
  suffix: string;
}

export function findJobTitleNameViolation(name: string): JobTitleNameViolation | null {
  const words = stemmedWords(name);
  const lastWord = words[words.length - 1];
  if (!lastWord) return null;
  const suffix = JOB_TITLE_NAME_SUFFIXES.find(s => s === lastWord);
  return suffix ? { suffix } : null;
}

// ── Hard check 4 — semantic alignment (independent judge) ──────────────
// #138 §5: a single independent LLM call per generation attempt, not per
// option — see PATH_OPTIONS_SEMANTIC_CHECK_PROMPT's own header comment for
// why this has to be a separate call rather than an extension of the
// existing phrase-based checks. Runs unconditionally against every draft in
// the attempt (not just the ones that survive checks 1/3), because it's
// already a single batched request regardless of how many drafts it covers
// — there is no per-draft cost to save by pre-filtering, and pre-filtering
// would mean sending a different set than "every draft from the round,"
// which the brief is explicit about. Its verdict for an already-disqualified
// draft is still used, though: it feeds hard check 2's existing "already
// disqualified, don't bother" skip (see the call site in
// generateCandidateBatch below) and its reasoning is always included in
// describeRejection's output, even when other checks also failed — per this
// session's confirmed decision, richer retry-steer content at zero extra
// cost, no suppression.

export interface SemanticVerdict {
  option_index: number;
  pass: boolean;
  reasoning: string;
  // #138 §6: additive to the pass/fail verdict above, produced by the same
  // call. Nullable — see validateSemanticVerdicts below for why a malformed
  // value here must never affect pass/reasoning.
  fit_score: number | null;
  fit_confidence: FitConfidence | null;
}

function parseLenientFitScore(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : null;
}

function parseLenientFitConfidence(raw: unknown): FitConfidence | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return null;
}

/**
 * Parses and validates the judge's response: must be an array with exactly
 * one entry per input option, each entry a well-formed verdict, indices
 * covering 0..expectedCount-1 with no duplicates. Returns null on ANY
 * deviation in option_index/pass/reasoning — a stray extra/missing verdict,
 * a bad type, an out-of-range or duplicate index, empty reasoning — so the
 * caller can fall back to a single fail-closed default rather than trust a
 * partially-malformed response. This strict all-or-nothing behavior is
 * UNCHANGED from before #138 §6.
 *
 * fit_score/fit_confidence (§6) are deliberately validated OUTSIDE that
 * strict path: parseLenientFitScore/parseLenientFitConfidence above null out
 * only the specific malformed field, never the surrounding verdict and never
 * the whole batch. This is what makes the §6 extension genuinely additive —
 * a model that gets pass/reasoning exactly right but fumbles the display-only
 * fit fields (wrong type, out-of-range score, an unexpected confidence
 * string) must still gate exactly as it would have before this extension,
 * per this session's explicit requirement that §5's accept/reject outcomes
 * not shift as a side effect of adding these fields to the same call.
 */
function validateSemanticVerdicts(data: unknown, expectedCount: number): Map<number, SemanticVerdict> | null {
  const verdicts = (data as { verdicts?: unknown } | null)?.verdicts;
  if (!Array.isArray(verdicts) || verdicts.length !== expectedCount) return null;

  const byIndex = new Map<number, SemanticVerdict>();
  for (const v of verdicts) {
    if (
      !v || typeof v !== 'object' ||
      typeof (v as SemanticVerdict).option_index !== 'number' ||
      typeof (v as SemanticVerdict).pass !== 'boolean' ||
      typeof (v as SemanticVerdict).reasoning !== 'string' ||
      (v as SemanticVerdict).reasoning.trim().length === 0
    ) {
      return null;
    }
    const raw = v as { option_index: number; pass: boolean; reasoning: string; fit_score?: unknown; fit_confidence?: unknown };
    if (raw.option_index < 0 || raw.option_index >= expectedCount || byIndex.has(raw.option_index)) {
      return null;
    }
    byIndex.set(raw.option_index, {
      option_index: raw.option_index,
      pass: raw.pass,
      reasoning: raw.reasoning,
      fit_score: parseLenientFitScore(raw.fit_score),
      fit_confidence: parseLenientFitConfidence(raw.fit_confidence),
    });
  }
  return byIndex.size === expectedCount ? byIndex : null;
}

/**
 * One batched call covering every draft passed in, keyed back by array
 * index (not name — names aren't guaranteed unique pre-acceptance, indices
 * are unambiguous). must_haves/must_avoids/ideal_life only — deliberately
 * NOT signatures/how_you_operate, per §5: this judge checks alignment with
 * what the person actually stated, not whether the option correctly
 * extrapolates their identity pattern (that's the generation prompt's own
 * job, not this independent check's). §6's fit_score/fit_confidence
 * extension didn't change this payload — the judge still only sees the
 * user's stated inputs and the finished drafts.
 *
 * Fail-closed per this session's confirmed decision: malformed or missing
 * judge output rejects every draft in this attempt rather than silently
 * passing them through. This check exists to catch a safety-relevant gap
 * the other checks can't, so an unparseable response must not become a
 * silent pass. This fail-closed fallback is only reached when
 * option_index/pass/reasoning themselves are malformed — see
 * validateSemanticVerdicts's own comment for why fit_score/fit_confidence
 * can never trigger it.
 */
async function requestSemanticVerdicts(
  drafts: OptionDraft[],
  mustHaves: string[],
  mustAvoids: string[],
  idealLife: string,
): Promise<Map<number, SemanticVerdict>> {
  const payload = {
    must_haves: mustHaves,
    must_avoids: mustAvoids,
    ideal_life: idealLife,
    options: drafts.map((d, index) => ({ index, name: d.name, select_if: d.select_if, description: d.description })),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PATH_OPTIONS_SEMANTIC_CHECK_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    max_tokens: 2000,
    temperature: 0,
  });

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content ?? '{}');
  } catch {
    parsed = null;
  }

  const verdicts = validateSemanticVerdicts(parsed, drafts.length);
  if (verdicts) return verdicts;

  console.warn(
    'Semantic alignment check returned malformed output — rejecting all drafts in this attempt as a fail-closed default.',
    content,
  );
  const fallback = new Map<number, SemanticVerdict>();
  drafts.forEach((_, index) => {
    fallback.set(index, {
      option_index: index,
      pass: false,
      reasoning: 'Semantic alignment check returned malformed output for this draft; treated as a fail-closed rejection.',
      fit_score: null,
      fit_confidence: null,
    });
  });
  return fallback;
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

function describeRejection(
  mustAvoidHits: MustAvoidViolation[],
  duplicateHits: MaterialDuplicate[],
  jobTitleHit: JobTitleNameViolation | null,
  semanticVerdict: SemanticVerdict | undefined,
): string[] {
  const reasons: string[] = [];
  for (const hit of mustAvoidHits) reasons.push(`touches must-avoid "${hit.must_avoid}"`);
  for (const hit of duplicateHits) reasons.push(`too similar to already-generated option "${hit.candidate_name}"`);
  if (jobTitleHit) reasons.push(`name is job-title-shaped (ends with "${jobTitleHit.suffix}")`);
  // #138 §5: always included when the semantic check failed, even if other
  // checks also failed this same draft — no suppression, per this session's
  // confirmed decision, since the reasoning is free (already computed once
  // per attempt) and makes the retry steer more complete. Still true, and
  // still the whole point of a semantic-only rejection (no must-avoid/
  // job-title hit): the real judge reasoning IS the value this check adds,
  // so it goes into the retry steer verbatim, never a generic template.
  if (!semanticVerdict?.pass) {
    reasons.push(`failed semantic alignment check: ${semanticVerdict?.reasoning ?? 'malformed judge output'}`);
  }
  return reasons;
}

function buildRetrySteer(baseSteer: string | undefined, rejected: CandidateBatchResult['rejected']): string {
  const rejectionSummary = rejected.map(r => `- "${r.draft.name}": ${r.reasons.join('; ')}`).join('\n');
  const feedback = `The previous attempt had options rejected for these reasons — generate different options that avoid every one of these problems:\n${rejectionSummary}`;
  return baseSteer ? `${baseSteer}\n\n${feedback}` : feedback;
}

/**
 * One round of Checkpoint 2 generation — either the initial 4 (round 1,
 * existingCandidates empty) or a +2 refine round (round 2 or 3). Runs all
 * four hard checks against every draft: the semantic alignment check
 * (#138 §5) once per attempt against the whole drafts array, then per draft
 * in order — must-avoid, job-title, semantic verdict, then (only if none of
 * those three disqualified the draft) material-duplicate — accepting the
 * first `targetCount` that pass everything. A draft is checked against
 * existingCandidates PLUS every candidate already accepted earlier in THIS
 * call, so two near-duplicate drafts in the same over-generated batch can't
 * both slip through. One bounded retry (see OVERGENERATION_BUFFER's comment
 * above) if the first attempt falls short; throws
 * OptionsGenerationShortfallError if still short after that — a future API
 * route's job (not built this slice) to catch it and persist a visible
 * failed state, same as every other generation route in this project
 * catches and marks its artifact 'failed'.
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
    const semanticVerdicts = await requestSemanticVerdicts(
      drafts,
      context.must_haves,
      context.must_avoids,
      context.ideal_life,
    );

    for (let i = 0; i < drafts.length; i++) {
      if (accepted.length >= targetCount) break;
      const draft = drafts[i];

      const comparisonSet = [...existingCandidates, ...accepted];
      const combinedText = comparableText(draft.select_if, draft.description);
      const mustAvoidHits = findMustAvoidViolations(combinedText, context.must_avoids);
      const jobTitleHit = findJobTitleNameViolation(draft.name);
      const semanticVerdict = semanticVerdicts.get(i);
      const semanticFail = !semanticVerdict?.pass;
      const duplicateHits =
        mustAvoidHits.length > 0 || jobTitleHit || semanticFail ? [] : findMaterialDuplicates(draft, comparisonSet);

      if (mustAvoidHits.length > 0 || jobTitleHit || semanticFail || duplicateHits.length > 0) {
        rejected.push({ draft, reasons: describeRejection(mustAvoidHits, duplicateHits, jobTitleHit, semanticVerdict) });
        continue;
      }

      accepted.push({
        id: randomUUID(),
        name: draft.name,
        select_if: draft.select_if,
        core_statement: draft.core_statement,
        tension: draft.tension,
        signatures_engaged: draft.signatures_engaged,
        description: draft.description,
        fit_score: semanticVerdict?.fit_score ?? null,
        fit_confidence: semanticVerdict?.fit_confidence ?? null,
        round,
      });
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
