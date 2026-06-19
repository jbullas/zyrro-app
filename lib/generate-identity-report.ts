import OpenAI from 'openai';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // Step A — Identity Analysis
    const analysisResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DETECTION_PROMPT },
        { role: 'user', content: JSON.stringify(answers) },
      ],
      max_tokens: 4000,
      temperature: 0,
    });

    const analysis = JSON.parse(
      analysisResponse.choices[0]?.message?.content ?? '{}'
    );

    // Step B — Report Generation
    const reportResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: LAYER_2_PROMPT },
        { role: 'user', content: `User name: ${name}\nAnalysis: ${JSON.stringify(analysis)}` },
      ],
      max_tokens: 8000,
      temperature: 0,
    });

    const report = JSON.parse(
      reportResponse.choices[0]?.message?.content ?? '{}'
    );

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
