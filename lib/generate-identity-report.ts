import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getChatCompletion } from '@/lib/llm';
import { DETECTION_PROMPT } from '@/lib/prompts/identity-analysis';
import { LAYER_2_PROMPT } from '@/lib/prompts/identity-report';
import { DOMAINS } from '@/lib/signatures';
import type { DomainProfile } from '@/lib/artifact-schemas';

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
 */
export function enforceSecondaryEvidenceFloor(
  secondaryAnalysis: unknown,
  evidenceUnits: unknown
): void {
  if (!Array.isArray(secondaryAnalysis) || !Array.isArray(evidenceUnits)) return;

  for (const entry of secondaryAnalysis) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { name?: unknown }).name !== 'string') continue;
    const name = (entry as { name: string }).name;
    const hasEvidence = evidenceUnits.some(
      (u) => u && typeof u === 'object' && (u as { secondary_signature_candidate?: unknown }).secondary_signature_candidate === name
    );
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

const REFRAME_TEASER_RECAP_MIN_WORDS = 45;
const REFRAME_TEASER_REFRAME_MIN_WORDS = 15;
const REFRAME_TEASER_BULLET_MIN_WORDS = 15;

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
  const rt = reframeTeaser as { recap?: unknown; reframe?: unknown; why_bullets?: unknown };

  const gaps: string[] = [];
  const recapWords = countWords(rt.recap);
  if (recapWords < REFRAME_TEASER_RECAP_MIN_WORDS) {
    gaps.push(`recap: ${recapWords} words (floor ${REFRAME_TEASER_RECAP_MIN_WORDS})`);
  }
  const reframeWords = countWords(rt.reframe);
  if (reframeWords < REFRAME_TEASER_REFRAME_MIN_WORDS) {
    gaps.push(`reframe: ${reframeWords} words (floor ${REFRAME_TEASER_REFRAME_MIN_WORDS})`);
  }
  if (Array.isArray(rt.why_bullets)) {
    rt.why_bullets.forEach((bullet, i) => {
      const bulletWords = countWords(bullet);
      if (bulletWords < REFRAME_TEASER_BULLET_MIN_WORDS) {
        gaps.push(`why_bullets[${i}]: ${bulletWords} words (floor ${REFRAME_TEASER_BULLET_MIN_WORDS})`);
      }
    });
  }

  if (gaps.length > 0) {
    console.warn('reframe_teaser landed under its word-count floor:', gaps.join('; '));
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

    // Step B — Report Generation
    const reportContent = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: LAYER_2_PROMPT },
        { role: 'user', content: `User name: ${name}\nAnalysis: ${JSON.stringify(analysis)}` },
      ],
      max_tokens: 8000,
      temperature: 0,
    });

    const report = JSON.parse(reportContent ?? '{}');

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

    // #99: reframe_teaser's prompt-level word-count self-check isn't fully
    // reliable — see logReframeTeaserWordCountGaps's doc comment. Log-only,
    // doesn't rewrite or block anything.
    logReframeTeaserWordCountGaps(report.reframe_teaser);

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

    // Step C — Update artifact to ready
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
