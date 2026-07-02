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
