import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getChatCompletion } from '@/lib/llm';
import { DETECTION_PROMPT } from '@/lib/prompts/identity-analysis';
import { LAYER_2_PROMPT } from '@/lib/prompts/identity-report';

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
    });

    const analysis = JSON.parse(analysisContent ?? '{}');

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
