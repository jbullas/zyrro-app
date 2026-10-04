import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getChatCompletion, getChatCompletionDetailed } from '@/lib/llm';
import { DETECTION_PROMPT } from '@/lib/prompts/identity-analysis';
import { LAYER_2_PROMPT } from '@/lib/prompts/identity-report';
import { LAYER_3_SIGNATURE_PROMPT, LAYER_3_REPORT_LEVEL_PROMPT } from '@/lib/prompts/identity-report-deep-dive';
import { DOMAINS, SIGNATURES } from '@/lib/signatures';
import type {
  DomainProfile,
  SignatureDeepDive,
  EvidenceItem,
  WorksWith,
  PairingLine,
  DistinctivePattern,
  PatternToNotice,
} from '@/lib/artifact-schemas';

export type DiscoveryAnswer = {
  question_number: number;
  question_text: string;
  answer_text: string;
};

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Domains with no scored signature in the Detection Engine's output — or with
// only weak signatures — never fall below this floor. Confirmed against a
// real generation that the `signatures` array only contains signatures with
// actual detected evidence (never all 25 with score: 0 placeholders), so a
// domain's absence from the array means "no evidence strong enough to
// report," not "confirmed zero" — we have no way to positively distinguish
// that from weak-but-real evidence, so both default to the same floor rather
// than letting a weak real score (e.g. round(1/25*100) = 4) render lower than
// a domain with no detected signature at all. Matches the floor already
// established in the detection prompt's own domain_profile rule.
const DOMAIN_FLOOR = 10;

/**
 * Computes domain_profile deterministically from the Detection Engine's real
 * signature scores, replacing the LLM's own disconnected domain_profile
 * judgment (see docs/briefs/1-domain-profile-computed.md). Real signature
 * scores are always integers 1-25 (frequency and intensity are both 1-5) per
 * the detection prompt's schema, but that schema isn't runtime-enforced on
 * the LLM's JSON output, so non-array input, non-finite scores, and
 * out-of-range scores are guarded defensively here.
 */
export function computeDomainProfile(signatures: unknown): DomainProfile {
  const list: Array<{ domain?: unknown; score?: unknown }> = Array.isArray(signatures)
    ? signatures
    : [];

  const profile = {} as DomainProfile;

  for (const domain of DOMAINS) {
    const maxScore = list
      .filter(s => s.domain === domain && typeof s.score === 'number' && Number.isFinite(s.score))
      .reduce((max, s) => Math.max(max, s.score as number), 0);

    const scaled = maxScore > 0 ? Math.round((maxScore / 25) * 100) : 0;
    profile[domain] = Math.min(100, Math.max(DOMAIN_FLOOR, scaled));
  }

  return profile;
}

/**
 * Derives Primary/Secondary categorization from the Detection Engine's own
 * scored `signatures[]` list, replacing Layer 1's own `primary_constellation`/
 * `secondary_signatures` name-array judgment (see docs/briefs/110-detection-categorization-brief.md).
 * Score itself (frequency × intensity) is reliable; only Layer 1's selection
 * of who counts as Primary vs. Secondary from that score is not — this
 * derives the selection deterministically from score instead. Secondary cap
 * stays at 3 (positions 6-8 of the ranked list), matching the existing
 * product decision.
 */
export function categorizePrimarySecondary(signatures: unknown): {
  primary: string[];
  secondary: string[];
} {
  const list: Array<{ name?: unknown; score?: unknown }> = Array.isArray(signatures)
    ? signatures
    : [];
  const sorted = [...list]
    .filter(s => typeof s.name === 'string' && typeof s.score === 'number' && Number.isFinite(s.score))
    .sort((a, b) => (b.score as number) - (a.score as number));

  return {
    primary: sorted.slice(0, 5).map(s => s.name as string),
    secondary: sorted.slice(5, 8).map(s => s.name as string),
  };
}

/**
 * Sorts an array of { score } objects by score descending, in place. Used for
 * every score-ranked list the LLM emits (see docs/briefs/33-primary-signature-ordering.md)
 * since prompt "rank by score" instructions govern *selection*, not
 * guaranteed output array order. No-ops on non-array input rather than
 * throwing, since these come from unvalidated LLM JSON. Missing/non-numeric
 * scores sink to the bottom rather than producing NaN comparator results
 * (unspecified sort behavior) — ties and missing scores haven't been observed
 * in practice, so this is an explicit choice, not a silent one.
 */
export function sortByScoreDescending(items: unknown): void {
  if (!Array.isArray(items)) return;
  items.sort((a: { score?: unknown }, b: { score?: unknown }) => {
    const scoreA = typeof a?.score === 'number' && Number.isFinite(a.score) ? a.score : -Infinity;
    const scoreB = typeof b?.score === 'number' && Number.isFinite(b.score) ? b.score : -Infinity;
    return scoreB - scoreA;
  });
}

/**
 * Layer 2's prompt-level rule (0-1 tagged evidence_units → short fallback
 * instead of a full narrative, see docs/briefs/82-secondary-compressed-format-brief.md)
 * doesn't hold reliably — confirmed via real-user live verification: it wrote
 * a confident, fabricated narrative for a secondary signature Detection
 * Engine tagged zero evidence_units to (inventing "reflections on time and
 * the risks of waiting for 'someday'" for a Futurist entry with no
 * supporting evidence at all), and separately cross-borrowed another
 * signature's tagged evidence in a different case. Three prompt-wording
 * rounds didn't close this — same "inconsistent model compliance on a clear
 * instruction" pattern as C5 (see docs/changelogs/2026-07-29.md) — so the
 * zero-evidence case is enforced here in code instead of trusted to the
 * prompt. Cross-signature borrowing isn't caught by this check (it requires
 * *some* tagged evidence, just from the wrong signature); this only
 * guarantees no signature is ever narrated with literally zero evidence
 * behind it.
 *
 * #92: "tagged" means through EITHER candidate field (taggedEvidenceUnits,
 * the same check Layer 3 uses). Detection often tags a secondary signature's
 * units through primary_signature_candidate; counting only
 * secondary_signature_candidate gave about 1 in 4 stored secondaries the
 * fallback despite real evidence, and fed that fallback to Layer 3 as the
 * secondary's main report text.
 */
export function enforceSecondaryEvidenceFloor(
  secondaryAnalysis: unknown,
  evidenceUnits: unknown
): void {
  if (!Array.isArray(secondaryAnalysis) || !Array.isArray(evidenceUnits)) return;

  for (const entry of secondaryAnalysis) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { name?: unknown }).name !== 'string') continue;
    const name = (entry as { name: string }).name;
    const hasEvidence = taggedEvidenceUnits(evidenceUnits, name).length > 0;
    if (!hasEvidence) {
      (entry as { analysis: string }).analysis =
        `${name} surfaced through detection scoring, but no specific evidence was tagged to it strongly enough to describe here — the score and domain above are the fuller picture for this pattern right now.`;
    }
  }
}

// 4, not the "5+" originally proposed — this session's real Run 1 failure
// ("transform chaos into order" lifted verbatim from identity_thesis) is
// itself only 4 words, and would slip past a 5-word threshold entirely.
// Confirmed via a standalone test against that exact real output before
// wiring this in: 4 catches it with no false positive against an unrelated
// (non-overlapping) synthesis sentence.
const CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS = 4;

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hasOverlappingPhrase(candidateWords: string[], referenceWords: string[], minWords: number): boolean {
  if (candidateWords.length < minWords || referenceWords.length < minWords) return false;
  for (let i = 0; i <= candidateWords.length - minWords; i++) {
    const window = candidateWords.slice(i, i + minWords).join(' ');
    for (let j = 0; j <= referenceWords.length - minWords; j++) {
      if (referenceWords.slice(j, j + minWords).join(' ') === window) return true;
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
 * #102: constellation_synthesis's prompt rules (see lib/prompts/identity-report.ts)
 * explicitly forbid reusing any key phrase from cover.identity_thesis — confirmed via
 * live verification (2026-08-04) that Layer 2 does not reliably follow this: across 4
 * distinct prompt-wording attempts (first-sentence-only rule, any-sentence rule, a
 * structural 3-sentence template) and 8 real generations, at least one sentence per run
 * still lifted a 5+ word run verbatim or near-verbatim from identity_thesis. Same
 * "inconsistent model compliance on a clear instruction" pattern as
 * enforceSecondaryEvidenceFloor above — closed here in code rather than via further
 * prompt iteration, per Miroslav's approval (2026-08-04) to expand this ticket beyond
 * its original prompt-only scope for exactly this failure profile.
 *
 * Detects any shared run of `CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS`+ consecutive
 * words (case-insensitive, punctuation-insensitive) between a synthesis sentence and
 * identity_thesis, and drops that sentence rather than trying to rewrite it — there's
 * no deterministic way to turn a restatement into new content, only to remove it. If
 * every sentence overlaps and this empties the synthesis entirely, logs a warning (this
 * would mean the whole field was just a thesis restatement) but still persists whatever
 * remains rather than blocking generation.
 */
export function enforceConstellationSynthesisNonOverlap(
  constellationSynthesis: unknown,
  identityThesis: unknown
): void {
  if (
    !constellationSynthesis ||
    typeof constellationSynthesis !== 'object' ||
    typeof (constellationSynthesis as { synthesis?: unknown }).synthesis !== 'string' ||
    typeof identityThesis !== 'string' ||
    !identityThesis.trim()
  ) return;

  const entry = constellationSynthesis as { synthesis: string };
  const thesisWords = normalizeWords(identityThesis);
  if (thesisWords.length < CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS) return;

  const sentences = splitSentences(entry.synthesis);
  if (sentences.length === 0) return;

  const kept = sentences.filter(
    sentence => !hasOverlappingPhrase(normalizeWords(sentence), thesisWords, CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS)
  );

  if (kept.length === sentences.length) return;

  if (kept.length === 0) {
    console.warn(
      `constellation_synthesis: every sentence overlapped identity_thesis by ${CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS}+ words — synthesis emptied entirely. ` +
      `identity_thesis="${identityThesis}" original_synthesis="${entry.synthesis}"`
    );
  }

  entry.synthesis = kept.join(' ');
}

/**
 * #112 Stage 1, Part B: the prompt separately bans abstract capability
 * phrasing ("this ability allows/empowers you to...") but nothing checked
 * for it — enforceConstellationSynthesisNonOverlap above only catches
 * literal overlap with identity_thesis, and a real user's report (Leona,
 * 2026-08-10 review) had a sentence that was a near-verbatim match to the
 * prompt's own forbidden example without literally overlapping
 * identity_thesis, so it slipped through uncaught.
 *
 * Log-only, not deletion — unlike the overlap check above, which works
 * from exact shared text (low false-positive risk), this is a fuzzier
 * phrase-pattern heuristic. Deleting a sentence on a heuristic match would
 * leave constellation_synthesis (already only 3 sentences, ~60-90 words
 * total) even shorter on a possibly-wrong call. Log-only surfaces the
 * problem for review without risking that.
 */
const ABSTRACT_CAPABILITY_PATTERN =
  /\b(this (ability|approach|dynamic|pattern|trait|quality))\b[^.]{0,30}\b(allows?|enables?|empowers?)\s+you\s+to\b/i;

function logConstellationSynthesisAbstractLanguage(constellationSynthesis: unknown): void {
  if (
    !constellationSynthesis ||
    typeof constellationSynthesis !== 'object' ||
    typeof (constellationSynthesis as { synthesis?: unknown }).synthesis !== 'string'
  ) return;

  const entry = constellationSynthesis as { synthesis: string };
  const sentences = splitSentences(entry.synthesis);
  const flagged = sentences.filter(s => ABSTRACT_CAPABILITY_PATTERN.test(s));

  if (flagged.length > 0) {
    console.warn(
      'constellation_synthesis: abstract capability language detected (prompt forbids "this ability allows/empowers you to..." phrasing):',
      flagged.join(' | ')
    );
  }
}

const REFRAME_TEASER_RECAP_MIN_WORDS = 45;
const REFRAME_TEASER_REFRAME_MIN_WORDS = 15;
const REFRAME_TEASER_FORWARD_FRAME_MIN_WORDS = 55;

function countWords(text: unknown): number {
  return typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

/**
 * #99: the reframe_teaser prompt instructions (see lib/prompts/identity-report.ts)
 * tell the model to self-check word counts against floors before finalizing
 * each field, but that self-check isn't reliably honored in practice —
 * confirmed via live verification, several real generations landed a few
 * words under floor despite the explicit instruction. Log-only: flags the
 * gap for review rather than silently shipping under-length content, but
 * doesn't block generation or trigger a second LLM call — no regeneration
 * loop, per Miroslav's call (2026-08-09) to keep this observability rather
 * than a retry mechanism.
 */
function logReframeTeaserWordCountGaps(reframeTeaser: unknown): void {
  if (!reframeTeaser || typeof reframeTeaser !== 'object') return;
  const rt = reframeTeaser as { recap?: unknown; reframe?: unknown; forward_frame?: unknown };

  const gaps: string[] = [];
  const recapWords = countWords(rt.recap);
  if (recapWords < REFRAME_TEASER_RECAP_MIN_WORDS) {
    gaps.push(`recap: ${recapWords} words (floor ${REFRAME_TEASER_RECAP_MIN_WORDS})`);
  }
  const reframeWords = countWords(rt.reframe);
  if (reframeWords < REFRAME_TEASER_REFRAME_MIN_WORDS) {
    gaps.push(`reframe: ${reframeWords} words (floor ${REFRAME_TEASER_REFRAME_MIN_WORDS})`);
  }
  const forwardFrameWords = countWords(rt.forward_frame);
  if (forwardFrameWords < REFRAME_TEASER_FORWARD_FRAME_MIN_WORDS) {
    gaps.push(`forward_frame: ${forwardFrameWords} words (floor ${REFRAME_TEASER_FORWARD_FRAME_MIN_WORDS})`);
  }

  if (gaps.length > 0) {
    console.warn('reframe_teaser landed under its word-count floor:', gaps.join('; '));
  }
}

/**
 * #112 Stage 3: reframe_teaser.recap is supposed to callback to the
 * report's own established pattern/evidence (see the prompt's clarified
 * EVIDENCE REUSE RULE) — reusing the same *fact* as identity_thesis or
 * constellation_synthesis is expected, but real generations this stage
 * showed it reusing the same *sentence*, near-verbatim (2026-08-10 Stage 3
 * diagnosis: e.g. a real recap opened by restating constellation_synthesis's
 * own sentence almost word for word).
 *
 * Deliberately log-only, not deletion, unlike enforceConstellationSynthesisNonOverlap
 * above — recap sits close enough to its own 45-word floor
 * (logReframeTeaserWordCountGaps) that stripping an overlapping sentence
 * risks pushing it under floor: confirmed against a real captured recap
 * this session (54 words across 3 sentences; removing the one sentence
 * that overlapped constellation_synthesis would have left 36 words, under
 * the 45-word floor). Reuses the same normalizeWords/hasOverlappingPhrase/
 * splitSentences helpers enforceConstellationSynthesisNonOverlap uses,
 * rather than building separate phrase-matching logic — extending that
 * function itself to also strip from recap was considered and rejected
 * for the floor-risk reason above, plus recap's job (grounding in the
 * already-established pattern) makes some conceptual overlap intentional,
 * unlike constellation_synthesis's relationship to identity_thesis.
 */
function logReframeTeaserRecapOverlap(
  reframeTeaser: unknown,
  identityThesis: unknown,
  constellationSynthesis: unknown
): void {
  if (
    !reframeTeaser ||
    typeof reframeTeaser !== 'object' ||
    typeof (reframeTeaser as { recap?: unknown }).recap !== 'string'
  ) return;

  const sentences = splitSentences((reframeTeaser as { recap: string }).recap);
  if (sentences.length === 0) return;

  const references: Array<{ label: string; words: string[] }> = [];
  if (typeof identityThesis === 'string' && identityThesis.trim()) {
    references.push({ label: 'identity_thesis', words: normalizeWords(identityThesis) });
  }
  const synthesisText = (constellationSynthesis as { synthesis?: unknown } | null)?.synthesis;
  if (typeof synthesisText === 'string' && synthesisText.trim()) {
    references.push({ label: 'constellation_synthesis', words: normalizeWords(synthesisText) });
  }
  if (references.length === 0) return;

  const flagged: string[] = [];
  for (const sentence of sentences) {
    const sentenceWords = normalizeWords(sentence);
    const overlapsWith = references.find(
      ref => hasOverlappingPhrase(sentenceWords, ref.words, CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS)
    );
    if (overlapsWith) {
      flagged.push(`"${sentence.trim()}" (overlaps ${overlapsWith.label})`);
    }
  }

  if (flagged.length > 0) {
    console.warn('reframe_teaser.recap: sentence(s) near-verbatim overlap with identity_thesis/constellation_synthesis:', flagged.join(' | '));
  }
}

// #112 Stage 2: new targets set from Stage 1's real-generation audit
// (2026-08-10 changelog) — the old floors (evidence_analysis 200,
// how_you_operate 120) were never once cleared across 30 real samples
// each, so they were lowered to what the fields actually produce rather
// than kept as an unenforceable aspiration. These are still just a floor
// for the log-only check below, same "not a hard requirement to optimize
// for" framing as the prompt's own new guidance — see
// logStage2WordCountGaps. (#154 retired domain_profile_summary and its
// floor/domain-mention checks along with it.)
const EVIDENCE_ANALYSIS_MIN_WORDS = 140;
const HOW_YOU_OPERATE_MIN_WORDS = 120;

/**
 * #112 Stage 2: same "prompt instruction isn't reliably honored" pattern as
 * logReframeTeaserWordCountGaps above, applied to the fields whose targets
 * were revised this stage. Log-only, no retry loop, same convention as
 * everywhere else in this file.
 */
function logStage2WordCountGaps(report: {
  primary_constellation?: unknown;
  how_you_operate?: unknown;
}): void {
  const gaps: string[] = [];

  if (Array.isArray(report.primary_constellation)) {
    report.primary_constellation.forEach((sig, i) => {
      const wc = countWords((sig as { evidence_analysis?: unknown } | null)?.evidence_analysis);
      if (wc < EVIDENCE_ANALYSIS_MIN_WORDS) {
        gaps.push(`primary_constellation[${i}].evidence_analysis: ${wc} words (floor ${EVIDENCE_ANALYSIS_MIN_WORDS})`);
      }
    });
  }

  if (report.how_you_operate && typeof report.how_you_operate === 'object') {
    for (const [key, value] of Object.entries(report.how_you_operate as Record<string, unknown>)) {
      const wc = countWords(value);
      if (wc < HOW_YOU_OPERATE_MIN_WORDS) {
        gaps.push(`how_you_operate.${key}: ${wc} words (floor ${HOW_YOU_OPERATE_MIN_WORDS})`);
      }
    }
  }

  if (gaps.length > 0) {
    console.warn('#112 Stage 2 word-count floor gap(s):', gaps.join('; '));
  }
}

const ENERGISER_FRICTION_MIN_WORDS = 3;
const ENERGISER_FRICTION_MAX_WORDS = 6;

/**
 * #154: energisers / friction_points are short phrases (minimum 3 words,
 * target 4, maximum 6 — see the Layer 2 prompt). Log-only, same convention
 * as the other log… functions: the exact strings seed /path Direction, which
 * validates selections against them, so they are never rewritten here.
 * Exported so verification scripts can run it against Layer 2 output alone.
 */
const CORE_STATEMENT_MIN_WORDS = 8;

// Light normalisation so a definition restated with "You" + base verb forms
// still matches ("creates lasting systems" vs "You create lasting systems"),
// and British/American -ise/-ize spellings compare equal.
function definitionWords(text: string): string[] {
  return normalizeWords(text).map(w => w.replace(/iz/g, 'is').replace(/([^s])s$/, '$1'));
}

/**
 * #154: core_statement must say how the pattern shows up in this person, not
 * restate the signature's definition (Layer 2 had been copying Detection's
 * signatures[].definition, a 2-4 word label, straight into it). Log-only:
 * flags any core_statement under 8 words, and any that contains its
 * signature's definition as a run of words. Checked against both Detection's
 * definition (what Layer 2 actually saw) and lib/signatures.ts' description.
 * Exported so verification scripts can run it against Layer 2 output alone.
 */
export function logCoreStatementGaps(
  report: { primary_constellation?: unknown; secondary_signature_analysis?: unknown },
  detectionSignatures: unknown,
): void {
  const detected = new Map<string, string>(
    (Array.isArray(detectionSignatures) ? detectionSignatures : [])
      .filter((s): s is { name: string; definition: string } => typeof s?.name === 'string' && typeof s?.definition === 'string')
      .map(s => [s.name, s.definition]),
  );
  for (const key of ['primary_constellation', 'secondary_signature_analysis'] as const) {
    const entries = report[key];
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry: { name?: unknown; core_statement?: unknown }, i) => {
      if (typeof entry?.name !== 'string') return;
      const statement = typeof entry.core_statement === 'string' ? entry.core_statement : '';
      const wc = countWords(statement);
      if (wc < CORE_STATEMENT_MIN_WORDS) {
        console.warn(`#154 ${key}[${i}] ${entry.name}.core_statement: ${wc} words (min ${CORE_STATEMENT_MIN_WORDS}): "${statement}"`);
      }
      const definitions = [detected.get(entry.name), SIGNATURES.find(s => s.name === entry.name)?.description]
        .filter((d): d is string => typeof d === 'string' && d.trim() !== '');
      const statementWords = definitionWords(statement);
      const restated = definitions.find(d => {
        const defWords = definitionWords(d);
        return defWords.length > 0 && hasOverlappingPhrase(statementWords, defWords, Math.min(4, defWords.length));
      });
      if (restated) {
        console.warn(`#154 ${key}[${i}] ${entry.name}.core_statement: restates its definition ("${restated}"): "${statement}"`);
      }
    });
  }
}

export function logEnergiserFrictionLengthGaps(report: { energisers?: unknown; friction_points?: unknown }): void {
  for (const key of ['energisers', 'friction_points'] as const) {
    const items = report[key];
    if (!Array.isArray(items)) continue;
    items.forEach((item, i) => {
      const wc = countWords(item);
      if (wc < ENERGISER_FRICTION_MIN_WORDS || wc > ENERGISER_FRICTION_MAX_WORDS) {
        console.warn(`#154 ${key}[${i}]: "${item}" is ${wc} word(s) (target ${ENERGISER_FRICTION_MIN_WORDS}-${ENERGISER_FRICTION_MAX_WORDS})`);
      }
    });
  }
}

/**
 * #110: Layer 2 receives the code-computed primary/secondary categorization
 * as *given* input, but same "LLM compliance isn't 100% reliable" pattern as
 * enforceSecondaryEvidenceFloor/logReframeTeaserWordCountGaps above — it may
 * not faithfully write up exactly those names. Unlike domain_profile (a
 * number, safely overwritable), primary_constellation/secondary_signature_analysis
 * contain generated prose that can't be synthesized in code if Layer 2
 * diverges — so this is a log-only check, not a rewrite.
 */
/**
 * #154: the named identity always reads "The <X> <Y>". If Layer 2's
 * cover.named_identity doesn't start with "The " (case-insensitive), prepend
 * it and log. Leaves a missing or empty value alone.
 */
export function ensureNamedIdentityArticle(report: { cover?: { named_identity?: unknown } }): void {
  const named = report?.cover?.named_identity;
  if (typeof named !== 'string') return;
  const trimmed = named.trim();
  if (!trimmed || /^the\s/i.test(trimmed)) return;
  report.cover!.named_identity = `The ${trimmed}`;
  console.warn(`#154 cover.named_identity: missing "The", prepended: "${trimmed}" -> "The ${trimmed}"`);
}

function logCategorizationComplianceGaps(
  report: { primary_constellation?: unknown; secondary_signature_analysis?: unknown },
  expected: { primary: string[]; secondary: string[] }
): void {
  const actualPrimary = Array.isArray(report.primary_constellation)
    ? report.primary_constellation.map((s: { name?: unknown }) => s?.name)
    : [];
  const actualSecondary = Array.isArray(report.secondary_signature_analysis)
    ? report.secondary_signature_analysis.map((s: { name?: unknown }) => s?.name)
    : [];
  if (JSON.stringify(actualPrimary) !== JSON.stringify(expected.primary)) {
    console.warn('Layer 2 primary_constellation diverged from code-computed categorization', { expected: expected.primary, actual: actualPrimary });
  }
  if (JSON.stringify(actualSecondary) !== JSON.stringify(expected.secondary)) {
    console.warn('Layer 2 secondary_signature_analysis diverged from code-computed categorization', { expected: expected.secondary, actual: actualSecondary });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// #154 step 1 — Layer 3: per-signature deep dives + report-level sections.
//
// Separate step after Layer 2 rather than a bigger Layer 2 call: Layer 2
// already produces the whole /path-read report in one 8000-token call, and
// a single combined Layer 3 call measurably dropped signatures (5/8 and 3/5
// deep dives in the 2026-10-04 timing probe) where one call per signature
// stayed complete. Shape: one call per signature with ≥1 tagged evidence
// unit, at most LAYER_3_CONCURRENCY in flight (the org's gpt-4o limit is
// 30k TPM — an uncapped 8-way fan-out right after Layer 2 hit 429s in the
// probe), then one report-level call that builds pairings from the deep
// dives' works_with. Calls fail independently: a deep dive that still fails
// after its retries is omitted (that signature renders like the 0-unit
// case), and a failed report-level call omits only pairings /
// distinctive_pattern / pattern_to_notice. Layer 2's report is never lost
// (see buildIdentityReport). Concurrency 3 and 8 rate-limit retries come from
// the 2026-10-04 verification, where 4-way concurrency used up all 5 retries
// on one deep dive.
// ─────────────────────────────────────────────────────────────────────────

const LAYER_3_CONCURRENCY = 3;
const LAYER_3_MAX_EVIDENCE_ITEMS = 3;
const LAYER_3_SIGNATURE_MAX_TOKENS = 3000;
const LAYER_3_REPORT_LEVEL_MAX_TOKENS = 2000;
const LAYER_3_MAX_429_RETRIES = 8;

/** Layer 3 fields, also stripped from the generate-path-plan input (see omitLayer3Fields). */
export const LAYER_3_FIELDS = ['signature_deep_dives', 'pairings', 'distinctive_pattern', 'pattern_to_notice'] as const;

/**
 * #154: copy of an identity report without the Layer 3 fields, for consumers
 * that send the whole report to a prompt and shouldn't grow by Layer 3's
 * size (generate-path-plan). Non-object input is returned unchanged.
 */
export function omitLayer3Fields<T>(report: T): T {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return report;
  const copy = { ...(report as Record<string, unknown>) };
  for (const field of LAYER_3_FIELDS) delete copy[field];
  return copy as T;
}

type EvidenceUnit = {
  quote_or_paraphrase?: unknown;
  source_question?: unknown;
  signal_types?: unknown;
  emotional_weight?: unknown;
  primary_signature_candidate?: unknown;
  secondary_signature_candidate?: unknown;
};

/**
 * Evidence units tagged to a signature through EITHER candidate field. Used
 * by Layer 3 (#154) and by enforceSecondaryEvidenceFloor (#92), so both agree
 * on what counts as evidence for a signature.
 */
function taggedEvidenceUnits(evidenceUnits: unknown, name: string): EvidenceUnit[] {
  if (!Array.isArray(evidenceUnits)) return [];
  return evidenceUnits.filter(
    (u): u is EvidenceUnit =>
      !!u && typeof u === 'object' &&
      ((u as EvidenceUnit).primary_signature_candidate === name || (u as EvidenceUnit).secondary_signature_candidate === name)
  );
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isNonEmptyString);
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * One Layer 3 LLM call: 429s back off and retry (honouring retry-after-ms /
 * retry-after when OpenAI sends them) up to LAYER_3_MAX_429_RETRIES times;
 * any other failure — API error, unparseable JSON, failed shape check — gets
 * exactly one retry. Throws if the retry fails too. SDK-level retries are
 * off so this is the only retry layer. Logs one usage line per successful
 * call (incl. prompt-cache hits).
 */
async function runLayer3Call<T>(
  label: string,
  system: string,
  user: string,
  maxTokens: number,
  validate: (parsed: unknown) => T | null,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const started = Date.now();
      let result: Awaited<ReturnType<typeof getChatCompletionDetailed>> | undefined;
      for (let rateLimitRetry = 0; ; rateLimitRetry++) {
        try {
          result = await getChatCompletionDetailed({
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_tokens: maxTokens,
            temperature: 0,
            maxRetries: 0,
          });
          break;
        } catch (error) {
          const status = (error as { status?: unknown })?.status;
          if (status !== 429 || rateLimitRetry >= LAYER_3_MAX_429_RETRIES) throw error;
          const headers = (error as { headers?: { get?: (name: string) => string | null } })?.headers;
          const retryAfterMs = Number(headers?.get?.('retry-after-ms'));
          const retryAfterS = Number(headers?.get?.('retry-after'));
          const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
            ? retryAfterMs + 250
            : Number.isFinite(retryAfterS) && retryAfterS > 0
              ? retryAfterS * 1000 + 250
              : 1000 * 2 ** rateLimitRetry + Math.floor(Math.random() * 500);
          console.warn(`#154 Layer 3 ${label}: 429 rate limit, retry ${rateLimitRetry + 1}/${LAYER_3_MAX_429_RETRIES} in ${waitMs}ms`);
          await sleep(waitMs);
        }
      }
      const ms = Date.now() - started;
      console.log(
        `#154 Layer 3 ${label}: ${ms}ms prompt=${result.usage.prompt_tokens} cached=${result.usage.cached_tokens} ` +
        `completion=${result.usage.completion_tokens} finish=${result.finish_reason}`
      );
      const parsed = JSON.parse(result.content ?? '');
      const valid = validate(parsed);
      if (valid === null) throw new Error(`${label}: response failed shape check`);
      return valid;
    } catch (error) {
      lastError = error;
      if (attempt === 1) console.warn(`#154 Layer 3 ${label}: attempt 1 failed, retrying once:`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError;
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function isStringPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && isNonEmptyString(v[0]) && isNonEmptyString(v[1]);
}

function validateDeepDive(parsed: unknown): SignatureDeepDive | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const d = parsed as Record<string, unknown>;
  const operating = d.operating as Record<string, unknown> | undefined;
  if (
    !isStringPair(d.what_this_means) ||
    !Array.isArray(d.evidence) ||
    !isStringArray(d.shows_up) ||
    !isStringArray(d.serves_you) ||
    !Array.isArray(d.works_with) ||
    !operating || typeof operating !== 'object' ||
    !isNonEmptyString(operating.at_work) ||
    !isNonEmptyString(operating.thinking) ||
    !isNonEmptyString(operating.with_people) ||
    !isNonEmptyString(operating.deciding) ||
    !isNonEmptyString(d.friction) ||
    !isNonEmptyString(d.under_pressure)
  ) return null;

  return {
    name: typeof d.name === 'string' ? d.name : '',
    what_this_means: [d.what_this_means[0], d.what_this_means[1]],
    evidence: d.evidence
      .filter((e): e is EvidenceItem =>
        !!e && typeof e === 'object' &&
        isNonEmptyString((e as EvidenceItem).text) &&
        typeof (e as EvidenceItem).source_question === 'number')
      .map(e => ({ text: e.text, source_question: e.source_question })),
    shows_up: d.shows_up,
    serves_you: d.serves_you,
    works_with: d.works_with
      .filter((w): w is WorksWith =>
        !!w && typeof w === 'object' &&
        isNonEmptyString((w as WorksWith).partner) &&
        isNonEmptyString((w as WorksWith).text) &&
        isNonEmptyString((w as WorksWith).evidence) &&
        typeof (w as WorksWith).source_question === 'number')
      .map(w => ({
        ...(w.kind === 'synergy' || w.kind === 'tension' ? { kind: w.kind } : {}),
        partner: w.partner, text: w.text, evidence: w.evidence, source_question: w.source_question,
      })),
    operating: {
      at_work: operating.at_work,
      thinking: operating.thinking,
      with_people: operating.with_people,
      deciding: operating.deciding,
    },
    friction: d.friction,
    under_pressure: d.under_pressure,
  };
}

type Layer3ReportLevel = {
  pairings: PairingLine[];
  distinctive_pattern: DistinctivePattern;
  pattern_to_notice: PatternToNotice;
};

function validateReportLevel(parsed: unknown): Layer3ReportLevel | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const r = parsed as Record<string, unknown>;
  const dp = r.distinctive_pattern as Record<string, unknown> | undefined;
  const ptn = r.pattern_to_notice as Record<string, unknown> | undefined;
  if (
    !Array.isArray(r.pairings) ||
    !dp || !isStringArray(dp.steps) ||
    !isStringPair(dp.paragraphs) ||
    !ptn || !isNonEmptyString(ptn.headline) || !isNonEmptyString(ptn.body) || !isNonEmptyString(ptn.takeaway)
  ) return null;

  return {
    pairings: r.pairings
      .filter((p): p is PairingLine =>
        !!p && typeof p === 'object' &&
        isNonEmptyString((p as PairingLine).a) &&
        isNonEmptyString((p as PairingLine).b) &&
        isNonEmptyString((p as PairingLine).line))
      .map(p => ({ a: p.a, b: p.b, line: p.line })),
    distinctive_pattern: { steps: dp.steps, paragraphs: [dp.paragraphs[0], dp.paragraphs[1]] },
    pattern_to_notice: { headline: ptn.headline, body: ptn.body, takeaway: ptn.takeaway },
  };
}

type Layer3Signature = {
  name: string;
  kind: 'primary' | 'secondary';
  domain: unknown;
  score: unknown;
  core_statement: unknown;
  main_report_text: unknown; // evidence_analysis (primary) or analysis (secondary)
  tension: unknown;          // primary only
};

// Every field optional: each is omitted when the call(s) behind it fail.
type Layer3Result = {
  signature_deep_dives?: SignatureDeepDive[];
  pairings?: PairingLine[];
  distinctive_pattern?: DistinctivePattern;
  pattern_to_notice?: PatternToNotice;
};

function layer3Signatures(report: Record<string, unknown>): Layer3Signature[] {
  const primaries = Array.isArray(report.primary_constellation) ? report.primary_constellation : [];
  const secondaries = Array.isArray(report.secondary_signature_analysis) ? report.secondary_signature_analysis : [];
  return [
    ...primaries.map((s: Record<string, unknown>) => ({
      name: s?.name as string, kind: 'primary' as const, domain: s?.domain, score: s?.score,
      core_statement: s?.core_statement, main_report_text: s?.evidence_analysis, tension: s?.tension,
    })),
    ...secondaries.map((s: Record<string, unknown>) => ({
      name: s?.name as string, kind: 'secondary' as const, domain: s?.domain, score: s?.score,
      core_statement: s?.core_statement, main_report_text: s?.analysis, tension: undefined,
    })),
  ].filter(s => isNonEmptyString(s.name));
}

/**
 * A signature with exactly one tagged evidence unit gets the reduced deep
 * dive (requested via evidence_mode, then enforced on the response).
 */
type EvidenceMode = 'standard' | 'reduced';

const REDUCED_LIST_ITEMS = 2;

/**
 * #154 follow-up: pairings may only reference a pair that a kept works_with
 * entry backs (one card naming the other as partner). Any other pairing —
 * including one built on an entry enforceWorksWithKinds dropped — is logged
 * and dropped.
 */
export function filterPairingsToWorksWith(pairings: PairingLine[], dives: SignatureDeepDive[]): PairingLine[] {
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const backed = new Set(dives.flatMap(d => d.works_with.map(w => key(d.name, w.partner))));
  return pairings.filter(p => {
    if (backed.has(key(p.a, p.b))) return true;
    console.warn(`#154 Layer 3: pairing ${p.a} + ${p.b} dropped (not backed by a kept works_with entry)`);
    return false;
  });
}

/**
 * #154 follow-up: works_with is one "Works best with" (synergy) entry plus at
 * most one "Watch out for" (tension) entry with a different partner, and no
 * tension in reduced mode. Enforced here, not trusted to the prompt: an entry
 * without a valid kind is treated as synergy, then extras are logged and
 * dropped (first of each kind kept). Synergy is returned first. Before that,
 * any entry whose partner is the card's own signature or not a signature in
 * this report is logged and dropped (it would render a card for a pattern the
 * report never shows).
 */
export function enforceWorksWithKinds(
  name: string,
  entries: WorksWith[],
  mode: EvidenceMode,
  namesInReport: ReadonlySet<string>,
): WorksWith[] {
  entries = entries.filter(w => {
    if (w.partner === name) {
      console.warn(`#154 Layer 3: ${name}.works_with[${w.partner}] dropped (partner is the card's own signature)`);
      return false;
    }
    if (!namesInReport.has(w.partner)) {
      console.warn(`#154 Layer 3: ${name}.works_with[${w.partner}] dropped (partner is not a signature in this report)`);
      return false;
    }
    return true;
  });
  let synergy: WorksWith | undefined;
  let tension: WorksWith | undefined;
  for (const raw of entries) {
    const w: WorksWith = raw.kind === 'synergy' || raw.kind === 'tension' ? raw : { ...raw, kind: 'synergy' };
    if (w !== raw) console.warn(`#154 Layer 3: ${name}.works_with[${w.partner}] had no valid kind — treated as synergy`);
    if (w.kind === 'synergy') {
      if (!synergy) synergy = w;
      else console.warn(`#154 Layer 3: ${name}.works_with[${w.partner}] dropped (extra synergy; kept ${synergy.partner})`);
    } else if (mode === 'reduced') {
      console.warn(`#154 Layer 3: ${name}.works_with[${w.partner}] dropped (tension not allowed in reduced mode)`);
    } else if (!tension) {
      tension = w;
    } else {
      console.warn(`#154 Layer 3: ${name}.works_with[${w.partner}] dropped (extra tension; kept ${tension.partner})`);
    }
  }
  if (tension && synergy && tension.partner === synergy.partner) {
    console.warn(`#154 Layer 3: ${name}.works_with[${tension.partner}] tension dropped (same partner as synergy)`);
    tension = undefined;
  }
  return [synergy, tension].filter((w): w is WorksWith => !!w);
}

function evidenceModeFor(unitCount: number): EvidenceMode {
  return unitCount === 1 ? 'reduced' : 'standard';
}

/**
 * Generates the Layer 3 fields for an already-post-processed Layer 2 report.
 * A single failed call never throws here: see the section comment above.
 */
async function generateLayer3(report: Record<string, unknown>, evidenceUnits: unknown): Promise<Layer3Result> {
  const signatures = layer3Signatures(report);
  const cover = report.cover as { identity_thesis?: unknown } | undefined;
  const synthesis = (report.constellation_synthesis as { synthesis?: unknown } | undefined)?.synthesis;

  const allEvidenceUnits = Array.isArray(evidenceUnits)
    ? evidenceUnits.map((u: EvidenceUnit) => ({
        source_question: u?.source_question,
        quote_or_paraphrase: u?.quote_or_paraphrase,
        primary_signature_candidate: u?.primary_signature_candidate,
        secondary_signature_candidate: u?.secondary_signature_candidate,
      }))
    : [];
  const signaturesInReport = signatures.map(s => ({ name: s.name, kind: s.kind, domain: s.domain, score: s.score, core_statement: s.core_statement }));
  const namesInReport = new Set(signatures.map(s => s.name));

  // Identical across every deep-dive call for this user and placed first in
  // the user message, so it extends the cached system-prompt prefix. All
  // evidence units are included so works_with can cite the partner's units.
  const reportContext = JSON.stringify({
    signatures_in_report: signaturesInReport,
    identity_thesis: cover?.identity_thesis,
    constellation_synthesis: synthesis,
    how_you_operate: report.how_you_operate,
    energisers: report.energisers,
    friction_points: report.friction_points,
    evidence_units: allEvidenceUnits,
  });

  // #92 handling: a signature with no tagged evidence gets no deep dive at
  // all (enforced here, not left to the prompt), and evidence is capped at
  // the number of units it does have.
  const targets = signatures.map(s => ({ signature: s, units: taggedEvidenceUnits(evidenceUnits, s.name) }));
  for (const t of targets) {
    if (t.units.length === 0) {
      console.warn(`#154 Layer 3: ${t.signature.name} has 0 tagged evidence units — no deep dive generated`);
    } else if (t.units.length === 1) {
      console.log(`#154 Layer 3: ${t.signature.name} has 1 tagged evidence unit — reduced deep dive requested`);
    }
  }
  const withEvidence = targets.filter(t => t.units.length > 0);

  const deepDiveResults = await mapWithConcurrency(withEvidence, LAYER_3_CONCURRENCY, async ({ signature, units }): Promise<SignatureDeepDive | null> => {
    const maxEvidence = Math.min(LAYER_3_MAX_EVIDENCE_ITEMS, units.length);
    const mode = evidenceModeFor(units.length);
    const target = JSON.stringify({
      target_signature: {
        name: signature.name,
        kind: signature.kind,
        domain: signature.domain,
        score: signature.score,
        core_statement: signature.core_statement,
        [signature.kind === 'primary' ? 'evidence_analysis' : 'analysis']: signature.main_report_text,
        ...(signature.kind === 'primary' && { tension: signature.tension }),
      },
      tagged_evidence_units: units.map(u => ({
        source_question: u.source_question,
        quote_or_paraphrase: u.quote_or_paraphrase,
        signal_types: u.signal_types,
        emotional_weight: u.emotional_weight,
      })),
      tagged_unit_count: units.length,
      evidence_mode: mode,
      max_evidence_items: maxEvidence,
    });
    let dive: SignatureDeepDive;
    try {
      dive = await runLayer3Call(
        `deep dive ${signature.name}`,
        LAYER_3_SIGNATURE_PROMPT,
        `REPORT CONTEXT:\n${reportContext}\n\nTARGET:\n${target}`,
        LAYER_3_SIGNATURE_MAX_TOKENS,
        validateDeepDive,
      );
    } catch (error) {
      console.error(`#154 Layer 3: deep dive ${signature.name} failed after its retries — omitted, the rest of the report is kept:`, error instanceof Error ? error.message : error);
      return null;
    }
    if (dive.name !== signature.name) {
      console.warn(`#154 Layer 3: deep dive name "${dive.name}" overwritten with requested signature "${signature.name}"`);
      dive.name = signature.name;
    }
    if (dive.evidence.length > maxEvidence) {
      console.warn(`#154 Layer 3: ${signature.name} evidence trimmed from ${dive.evidence.length} to its cap of ${maxEvidence} (tagged units)`);
      dive.evidence = dive.evidence.slice(0, maxEvidence);
    }
    // Thin evidence: the reduced sizes are enforced, not just requested.
    if (mode === 'reduced') {
      for (const key of ['shows_up', 'serves_you'] as const) {
        if (dive[key].length > REDUCED_LIST_ITEMS) {
          console.warn(`#154 Layer 3: ${signature.name}.${key} trimmed from ${dive[key].length} to ${REDUCED_LIST_ITEMS} (reduced mode)`);
          dive[key] = dive[key].slice(0, REDUCED_LIST_ITEMS);
        }
      }
    }
    dive.works_with = enforceWorksWithKinds(signature.name, dive.works_with, mode, namesInReport);
    return dive;
  });
  const deepDives = deepDiveResults.filter((d): d is SignatureDeepDive => d !== null);

  const reportLevelContext = JSON.stringify({
    signatures_in_report: signaturesInReport,
    how_you_operate: report.how_you_operate,
    energisers: report.energisers,
    friction_points: report.friction_points,
    evidence_units: allEvidenceUnits,
  });
  const alreadyOnPage = JSON.stringify({ identity_thesis: cover?.identity_thesis, constellation_synthesis: synthesis });
  let reportLevel: Layer3ReportLevel | null = null;
  try {
    reportLevel = await runLayer3Call(
      'report-level',
      LAYER_3_REPORT_LEVEL_PROMPT,
      `REPORT CONTEXT:\n${reportLevelContext}\n\nALREADY SHOWN ON THE PAGE (do not restate):\n${alreadyOnPage}\n\nSIGNATURE DEEP DIVES:\n${JSON.stringify(
        deepDives.map(d => ({ name: d.name, what_this_means: d.what_this_means, works_with: d.works_with, friction: d.friction }))
      )}`,
      LAYER_3_REPORT_LEVEL_MAX_TOKENS,
      validateReportLevel,
    );
  } catch (error) {
    console.error('#154 Layer 3: report-level call failed after its retries — pairings, distinctive_pattern and pattern_to_notice omitted:', error instanceof Error ? error.message : error);
  }

  const result: Layer3Result = {};
  if (deepDives.length > 0) result.signature_deep_dives = deepDives;
  if (reportLevel) {
    // Pairings are only ever drawn from works_with: with no works_with data
    // there is nothing to build them from, so they are omitted, not invented.
    if (deepDives.some(d => d.works_with.length > 0)) {
      result.pairings = filterPairingsToWorksWith(reportLevel.pairings, deepDives);
    } else {
      console.warn('#154 Layer 3: no works_with data in any deep dive — pairings omitted');
    }
    result.distinctive_pattern = reportLevel.distinctive_pattern;
    result.pattern_to_notice = reportLevel.pattern_to_notice;
  }
  return result;
}

// Targets from #154 (see docs/changelogs/2026-10-04.md), as
// revised in the 2026-10-04 review of verification 3.
const WHAT_THIS_MEANS_PARAGRAPH_WORDS: Record<EvidenceMode, [number, number]> = { standard: [40, 70], reduced: [30, 50] };
const LIST_ITEMS: Record<EvidenceMode, [number, number]> = { standard: [3, 4], reduced: [2, 2] };
const EVIDENCE_TEXT_MAX_WORDS = 30;
const OPERATING_MIN_WORDS = 12; // floor only; the prompt asks for a target of 16
// Prompt asks for minimum 35, target 50 per paragraph; flag under 35 or over 70.
const DISTINCTIVE_PATTERN_PARAGRAPH_WORDS: [number, number] = [35, 70];

// Overlap with these two fields is still logged, but neither is shown on the
// redesigned /identity, so these lines are informational, not tuning targets.
const INFO_ONLY = '(info only: field not shown on /identity)';

function sentenceCount(text: string): number {
  return splitSentences(text).length;
}

function overlaps(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return hasOverlappingPhrase(normalizeWords(a), normalizeWords(b), CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS);
}

function mentionsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

// Evidence lines should state only what happened. This catches the common
// failure shape: a trailing ", <interpretive -ing verb> …" clause tacked on.
const TRAILING_INTERPRETIVE_CLAUSE =
  /,\s*(?:which\s+\w+\s+)?(indicating|demonstrating|showing|showcasing|highlighting|requiring|seeking|reflecting|revealing|suggesting|signalling|signaling|illustrating|underscoring|emphasising|emphasizing|evidencing|proving|activating|energising|energizing)\b/i;

function firstMentionIndex(text: string, name: string): number {
  const m = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').exec(text);
  return m ? m.index : Infinity;
}

/**
 * #154 follow-up (#158): works_with.text should have the partner as its
 * subject (what the partner does for this card's signature). Simple
 * heuristic, log-only: flags a text that names the card's own signature
 * before the partner (or names only itself). Misses wrong-side texts that
 * name neither signature or put the partner first; can false-positive on a
 * passive sentence such as "your <own> drive is steadied by <partner>".
 */
export function worksWithFromOwnSide(text: string, ownName: string, partner: string): boolean {
  const own = firstMentionIndex(text, ownName);
  return own !== Infinity && own < firstMentionIndex(text, partner);
}

function trailingInterpretiveClause(text: string): string | null {
  const match = TRAILING_INTERPRETIVE_CLAUSE.exec(text);
  return match ? match[1].toLowerCase() : null;
}

function outside(value: number, [min, max]: [number, number]): boolean {
  return value < min || value > max;
}

/**
 * #154: log-only backstops for Layer 3, same convention as the log…
 * functions above — flags for review, never rewrites or blocks. (The
 * enforced rules — 0 units → no deep dive, evidence capped at tagged units,
 * reduced sizes for 1-unit signatures — live in generateLayer3.)
 */
function logLayer3Gaps(result: Layer3Result, report: Record<string, unknown>, evidenceUnits: unknown): void {
  const signatures = layer3Signatures(report);
  const names = new Set(signatures.map(s => s.name));
  const byName = new Map(signatures.map(s => [s.name, s]));
  const thesis = (report.cover as { identity_thesis?: unknown } | undefined)?.identity_thesis;
  const synthesis = (report.constellation_synthesis as { synthesis?: unknown } | undefined)?.synthesis;
  const questionsFor = (name: string) => new Set(taggedEvidenceUnits(evidenceUnits, name).map(u => u.source_question));
  const gaps: string[] = [];
  const dives = result.signature_deep_dives ?? [];

  for (const dive of dives) {
    const sig = byName.get(dive.name);
    const units = taggedEvidenceUnits(evidenceUnits, dive.name);
    const mode = evidenceModeFor(units.length);
    const ownQuestions = questionsFor(dive.name);

    // Evidence: source discipline + counts.
    for (const e of dive.evidence) {
      if (!ownQuestions.has(e.source_question)) {
        gaps.push(`${dive.name}.evidence: source_question ${e.source_question} is not among its tagged units' questions [${[...ownQuestions].join(', ')}]`);
      }
      const wc = countWords(e.text);
      if (wc > EVIDENCE_TEXT_MAX_WORDS) gaps.push(`${dive.name}.evidence: item ${wc} words (max ${EVIDENCE_TEXT_MAX_WORDS})`);
      const clause = trailingInterpretiveClause(e.text);
      if (clause) gaps.push(`${dive.name}.evidence: trailing interpretive clause (", ${clause} …"): "${e.text}"`);
    }
    const evidenceCap = Math.min(LAYER_3_MAX_EVIDENCE_ITEMS, units.length);
    if (dive.evidence.length < evidenceCap) gaps.push(`${dive.name}.evidence: ${dive.evidence.length} items (cap ${evidenceCap})`);

    // what_this_means: per-paragraph size, and about the person, not the signature.
    const paragraphTarget = WHAT_THIS_MEANS_PARAGRAPH_WORDS[mode];
    dive.what_this_means.forEach((para, i) => {
      const wc = countWords(para);
      if (outside(wc, paragraphTarget)) gaps.push(`${dive.name}.what_this_means[${i}]: ${wc} words (target ${paragraphTarget[0]}-${paragraphTarget[1]}, ${mode})`);
    });
    if (dive.what_this_means.some(para => mentionsName(para, dive.name))) {
      gaps.push(`${dive.name}.what_this_means: contains the signature's own name`);
    }

    // List sizes for this mode.
    for (const key of ['shows_up', 'serves_you'] as const) {
      if (outside(dive[key].length, LIST_ITEMS[mode])) gaps.push(`${dive.name}.${key}: ${dive[key].length} items (target ${LIST_ITEMS[mode].join('-')}, ${mode})`);
    }
    const synergies = dive.works_with.filter(w => w.kind !== 'tension').length;
    if (synergies !== 1) gaps.push(`${dive.name}.works_with: ${synergies} synergy entries (target exactly 1)`);
    for (const [key, value] of Object.entries(dive.operating)) {
      const wc = countWords(value);
      if (wc < OPERATING_MIN_WORDS) gaps.push(`${dive.name}.operating.${key}: ${wc} words (floor ${OPERATING_MIN_WORDS})`);
    }
    const frictionSentences = sentenceCount(dive.friction);
    if (frictionSentences < 2 || frictionSentences > 3) gaps.push(`${dive.name}.friction: ${frictionSentences} sentence(s) (target 2-3)`);
    const pressureSentences = sentenceCount(dive.under_pressure);
    if (pressureSentences < 1 || pressureSentences > 2) gaps.push(`${dive.name}.under_pressure: ${pressureSentences} sentence(s) (target 1-2)`);

    // works_with partners and their evidence source.
    for (const w of dive.works_with) {
      if (w.partner === dive.name) gaps.push(`${dive.name}.works_with: partner is the signature itself`);
      else if (!names.has(w.partner)) gaps.push(`${dive.name}.works_with: partner "${w.partner}" is not a signature in this report`);
      const clause = trailingInterpretiveClause(w.evidence);
      if (clause) gaps.push(`${dive.name}.works_with[${w.partner}].evidence: trailing interpretive clause (", ${clause} …"): "${w.evidence}"`);
      const allowed = new Set([...ownQuestions, ...questionsFor(w.partner)]);
      if (!allowed.has(w.source_question)) {
        gaps.push(`${dive.name}.works_with[${w.partner}]: source_question ${w.source_question} is not among ${dive.name}'s or ${w.partner}'s tagged units' questions [${[...allowed].join(', ')}]`);
      }
      if (worksWithFromOwnSide(w.text, dive.name, w.partner)) {
        gaps.push(`${dive.name}.works_with[${w.partner}].text: possibly written from the card's own side (${dive.name} named before ${w.partner}): "${w.text}"`);
      }
      if (w.kind === 'tension') {
        if (overlaps(w.text, dive.friction)) gaps.push(`${dive.name}.works_with[${w.partner}] (tension): overlaps the card's own friction`);
        if (overlaps(w.text, dive.under_pressure)) gaps.push(`${dive.name}.works_with[${w.partner}] (tension): overlaps the card's own under_pressure`);
      }
    }

    // Restatement overlap with main-report fields.
    if (sig) {
      const wtmText = dive.what_this_means.join(' ');
      if (overlaps(wtmText, sig.core_statement)) gaps.push(`${dive.name}.what_this_means: overlaps core_statement`);
      if (overlaps(wtmText, sig.main_report_text)) gaps.push(`${dive.name}.what_this_means: overlaps ${sig.kind === 'primary' ? 'evidence_analysis' : 'analysis'} ${INFO_ONLY}`);
      if (overlaps(dive.friction, sig.tension)) gaps.push(`${dive.name}.friction: overlaps tension ${INFO_ONLY}`);
    }
  }

  // Both directions of a pair must say different things.
  const diveByName = new Map(dives.map(d => [d.name, d]));
  for (const dive of dives) {
    for (const w of dive.works_with) {
      if (dive.name >= w.partner) continue; // each pair once
      const reverse = diveByName.get(w.partner)?.works_with.find(r => r.partner === dive.name);
      if (reverse && overlaps(w.text, reverse.text)) {
        gaps.push(`works_with ${dive.name}↔${w.partner}: the two directions overlap`);
      }
    }
  }

  // Pairings must be backed by works_with.
  if (result.pairings) {
    const backedPairs = new Set(
      dives.flatMap(d => d.works_with.map(w => [d.name, w.partner].sort().join('|')))
    );
    if (result.pairings.length < 2 || result.pairings.length > 3) gaps.push(`pairings: ${result.pairings.length} entries (target 2-3)`);
    for (const p of result.pairings) {
      if (!backedPairs.has([p.a, p.b].sort().join('|'))) gaps.push(`pairings: ${p.a}↔${p.b} not backed by any works_with entry`);
    }
  }

  // Report-level counts, signature names, and restatement.
  const dp = result.distinctive_pattern;
  if (dp) {
    const steps = dp.steps.length;
    if (steps < 3 || steps > 5) gaps.push(`distinctive_pattern.steps: ${steps} (target 3-5)`);
    const dpText = [...dp.steps, ...dp.paragraphs].join(' ');
    const namedInDp = [...names].filter(name => mentionsName(dpText, name));
    if (namedInDp.length > 0) gaps.push(`distinctive_pattern: names signature(s) ${namedInDp.join(', ')}`);
    dp.paragraphs.forEach((para, i) => {
      const wc = countWords(para);
      if (outside(wc, DISTINCTIVE_PATTERN_PARAGRAPH_WORDS)) {
        gaps.push(`distinctive_pattern.paragraphs[${i}]: ${wc} words (target ${DISTINCTIVE_PATTERN_PARAGRAPH_WORDS[0]}-${DISTINCTIVE_PATTERN_PARAGRAPH_WORDS[1]})`);
      }
      if (overlaps(para, synthesis)) gaps.push(`distinctive_pattern.paragraphs[${i}]: overlaps constellation_synthesis`);
      if (overlaps(para, thesis)) gaps.push(`distinctive_pattern.paragraphs[${i}]: overlaps identity_thesis`);
    });
  }
  const ptn = result.pattern_to_notice;
  if (ptn) {
    const bodySentences = sentenceCount(ptn.body);
    if (bodySentences < 2 || bodySentences > 4) gaps.push(`pattern_to_notice.body: ${bodySentences} sentence(s) (target 2-4)`);
    for (const key of ['headline', 'body', 'takeaway'] as const) {
      const text = ptn[key];
      if (overlaps(text, synthesis)) gaps.push(`pattern_to_notice.${key}: overlaps constellation_synthesis`);
      if (overlaps(text, thesis)) gaps.push(`pattern_to_notice.${key}: overlaps identity_thesis`);
    }
  }

  for (const gap of gaps) console.warn(`#154 Layer 3 backstop: ${gap}`);
}

/**
 * #154: Layer 2 kept copying Detection's signatures[].definition — a 2-4
 * word label taken from lib/signatures.ts — straight into core_statement,
 * even with an explicit prompt rule against it (2026-10-04 A/B: backstop
 * flags fell from 19/23 to 3/23 once it was removed). This returns a copy of the
 * analysis with that field removed, for the Layer 2 input only. Detection
 * itself, the stored raw_signature_analysis and Layer 3's inputs keep the
 * full analysis. Exported so verification scripts build the same input.
 */
export function stripDefinitionsForLayer2<T extends { signatures?: unknown }>(analysis: T): T {
  if (!Array.isArray(analysis?.signatures)) return analysis;
  return {
    ...analysis,
    signatures: analysis.signatures.map((s: unknown) => {
      if (!s || typeof s !== 'object') return s;
      const { definition: _definition, ...rest } = s as Record<string, unknown>;
      return rest;
    }),
  };
}

/**
 * Detection → Layer 2 → Layer 3, returning the finished report content.
 * No DB access — generateIdentityReport persists the result. Throws only if
 * Detection or Layer 2 fails; a Layer 3 failure is logged and the report is
 * returned without the Layer 3 fields.
 */
export async function buildIdentityReport({
  answers,
  name,
}: {
  answers: DiscoveryAnswer[];
  name: string;
}): Promise<Record<string, unknown>> {
  // Step A — Identity Analysis
  const analysisContent = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: DETECTION_PROMPT },
      { role: 'user', content: JSON.stringify(answers) },
    ],
    max_tokens: 4000,
    temperature: 0,
    seed: 42,
  });

  const analysis = JSON.parse(analysisContent ?? '{}');

  // domain_profile is computed from real signature scores, not the LLM's
  // own disconnected judgment of it (see docs/briefs/1-domain-profile-computed.md) —
  // overwrite it here so Layer 2's "copy from detection JSON" instruction
  // copies a grounded number.
  analysis.domain_profile = computeDomainProfile(analysis.signatures ?? []);

  // #110: primary_constellation/secondary_signatures are derived from the
  // Detection Engine's own scored signatures[] list rather than trusted
  // to Layer 1's own selection judgment — see categorizePrimarySecondary's
  // doc comment. Same "overwrite before Layer 2 runs" pattern as
  // domain_profile above.
  const categorized = categorizePrimarySecondary(analysis.signatures ?? []);
  analysis.primary_constellation = categorized.primary;
  analysis.secondary_signatures = categorized.secondary;

  // Step B — Report Generation. Layer 2 gets the analysis without
  // signatures[].definition (#154, see stripDefinitionsForLayer2); the full
  // analysis is still what raw_signature_analysis stores and Layer 3 reads.
  const reportContent = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: LAYER_2_PROMPT },
      { role: 'user', content: `User name: ${name}\nAnalysis: ${JSON.stringify(stripDefinitionsForLayer2(analysis))}` },
    ],
    max_tokens: 8000,
    temperature: 0,
  });

  const report = JSON.parse(reportContent ?? '{}');

  // #154: Layer 2 sometimes drops the leading "The" from named_identity
  // ("Pathfinder Illuminator"). Code owns that convention; log when it fires.
  ensureNamedIdentityArticle(report);

  // The detection prompt's "Rank by score" rule governs Top-5 *selection*,
  // not output array order — so array order isn't reliably descending by
  // score across all generations. Enforce it here instead of trusting the
  // LLM. signature_profile_summary carries the identical name+score shape
  // and the same risk (app/api/mentor/route.ts reads primary_signatures in
  // array order into the mentor's context prompt), so it gets the same fix.
  // Consistency sweep confirmed these are the only two consumers of array
  // order anywhere in the app — path-plan.ts/path-options.ts prompts treat
  // primary_constellation as an unordered set, not positional.
  sortByScoreDescending(report.primary_constellation);
  sortByScoreDescending(report.secondary_signature_analysis);
  sortByScoreDescending(report.signature_profile_summary?.primary_signatures);
  sortByScoreDescending(report.signature_profile_summary?.secondary_signatures);

  // #110: log-only check for whether Layer 2 faithfully wrote up the
  // code-computed categorization it was given — see
  // logCategorizationComplianceGaps's doc comment.
  logCategorizationComplianceGaps(report, categorized);

  // Defense in depth: code owns domain_profile now, not the LLM — overwrite
  // again in case Layer 2 didn't copy analysis.domain_profile faithfully.
  report.domain_profile = analysis.domain_profile;

  // Layer 2 doesn't reliably respect the zero-evidence fallback tier — see
  // enforceSecondaryEvidenceFloor's doc comment. Runs after sorting since
  // it only rewrites analysis text, not order.
  enforceSecondaryEvidenceFloor(report.secondary_signature_analysis, analysis.evidence_units);

  // #102: Layer 2 doesn't reliably keep constellation_synthesis from
  // restating identity_thesis — see enforceConstellationSynthesisNonOverlap's
  // doc comment. Runs after sorting/domain_profile since it only rewrites
  // constellation_synthesis.synthesis, nothing positional.
  enforceConstellationSynthesisNonOverlap(report.constellation_synthesis, report.cover?.identity_thesis);

  // #112 Stage 1: log-only backstop for abstract capability phrasing the
  // overlap check above can't catch (no literal overlap with
  // identity_thesis) — see logConstellationSynthesisAbstractLanguage's
  // doc comment. Runs after the overlap check so it inspects the
  // already-cleaned synthesis, not pre-cleanup text.
  logConstellationSynthesisAbstractLanguage(report.constellation_synthesis);

  // #99: reframe_teaser's prompt-level word-count self-check isn't fully
  // reliable — see logReframeTeaserWordCountGaps's doc comment. Log-only,
  // doesn't rewrite or block anything.
  logReframeTeaserWordCountGaps(report.reframe_teaser);

  // #112 Stage 3: log-only check for reframe_teaser.recap near-verbatim
  // overlap with identity_thesis/constellation_synthesis — see
  // logReframeTeaserRecapOverlap's doc comment.
  logReframeTeaserRecapOverlap(report.reframe_teaser, report.cover?.identity_thesis, report.constellation_synthesis);

  // #112 Stage 2: log-only word-count floor checks for
  // evidence_analysis/how_you_operate — see logStage2WordCountGaps's doc
  // comment.
  logStage2WordCountGaps(report);

  // #154: log-only length check on the energisers/friction_points phrases.
  logEnergiserFrictionLengthGaps(report);

  // #154: log-only check that core_statement isn't the signature's definition.
  logCoreStatementGaps(report, analysis.signatures);

  // #62: persist Layer 1's full Detection Engine output alongside Layer 2's
  // report — nothing downstream (Reframe/#43, #100's Emerging/Suppressed
  // cards, mentor longitudinal tracking) can see this after generation
  // completes otherwise. Going-forward only, no backfill (see #62 brief).
  report.raw_signature_analysis = {
    signatures: analysis.signatures ?? [],
    primary_constellation: analysis.primary_constellation ?? [],
    secondary_signatures: analysis.secondary_signatures ?? [],
    emerging_signatures: analysis.emerging_signatures ?? [],
    suppressed_signatures: analysis.suppressed_signatures ?? [],
  };

  // #154: code owns schema_version for 1.4 reports (Layer 3 fields optional,
  // identity_context / what_this_report_is / domain_profile_summary retired).
  report.schema_version = '1.4';

  // Step C — Layer 3 (#154). A failure here never loses the Layer 2 report:
  // log it and return the report without the Layer 3 fields.
  const layer3Started = Date.now();
  try {
    const layer3 = await generateLayer3(report, analysis.evidence_units);
    logLayer3Gaps(layer3, report, analysis.evidence_units);
    Object.assign(report, layer3);
    console.log(
      `#154 Layer 3: completed in ${Date.now() - layer3Started}ms (${layer3.signature_deep_dives?.length ?? 0} deep dives; ` +
      `report-level fields: ${['pairings', 'distinctive_pattern', 'pattern_to_notice'].filter(k => k in layer3).join(', ') || 'none'})`
    );
  } catch (error) {
    console.error(`#154 Layer 3 failed after ${Date.now() - layer3Started}ms — saving the report without Layer 3 fields:`, error);
  }

  return report;
}

export async function generateIdentityReport({
  artifactId,
  answers,
  name,
}: {
  artifactId: string;
  answers: DiscoveryAnswer[];
  name: string;
}): Promise<void> {
  const supabase = createServiceClient();

  try {
    const report = await buildIdentityReport({ answers, name });

    // Update artifact to ready
    await supabase
      .from('artifacts')
      .update({ status: 'ready', content: report })
      .eq('id', artifactId);

  } catch (error) {
    console.error('Report generation failed:', error);
    await supabase
      .from('artifacts')
      .update({ status: 'failed' })
      .eq('id', artifactId);
  }
}
