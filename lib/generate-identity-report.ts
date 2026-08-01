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

    // Defense in depth: code owns domain_profile now, not the LLM — overwrite
    // again in case Layer 2 didn't copy analysis.domain_profile faithfully.
    report.domain_profile = analysis.domain_profile;

    // Layer 2 doesn't reliably respect the zero-evidence fallback tier — see
    // enforceSecondaryEvidenceFloor's doc comment. Runs after sorting since
    // it only rewrites analysis text, not order.
    enforceSecondaryEvidenceFloor(report.secondary_signature_analysis, analysis.evidence_units);

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
