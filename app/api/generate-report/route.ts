import { NextRequest, NextResponse, after } from 'next/server';

export const maxDuration = 60;
import OpenAI from 'openai';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { DETECTION_PROMPT } from '@/lib/prompts/identity-analysis';
import { LAYER_2_PROMPT } from '@/lib/prompts/identity-report';

type DiscoveryAnswer = {
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

console.log('[generate-report] SUPABASE_SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0);
console.log('[generate-report] OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length ?? 0);
console.log('[generate-report] OPENAI_API_KEY prefix:', process.env.OPENAI_API_KEY?.slice(0, 5) ?? 'undefined');

async function runGeneration(artifactId: string, answers: DiscoveryAnswer[], name: string) {
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

export async function POST(req: NextRequest) {
  const body = await req.json() as { user_id: string; name: string; answers: DiscoveryAnswer[] };
  const { user_id, name, answers } = body;

  if (!user_id || !name || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'Missing user_id, name, or answers' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Insert profile row
  await supabase
    .from('profiles')
    .upsert({ user_id, name }, { onConflict: 'user_id' });

  // Insert discovery answers
  await supabase
    .from('discovery_answers')
    .insert(answers.map(a => ({ ...a, user_id })));

  const { data: existing } = await supabase
    .from('artifacts')
    .select('id')
    .eq('user_id', user_id)
    .eq('type', 'identity_report')
    .maybeSingle();

  let artifactId: string;

  if (existing) {
    await supabase
      .from('artifacts')
      .update({ status: 'generating', content: {} })
      .eq('id', existing.id);
    artifactId = existing.id;
  } else {
    const { data: artifact, error: insertError } = await supabase
      .from('artifacts')
      .insert({
        user_id,
        type: 'identity_report',
        access_level: 'free',
        status: 'generating',
        content: {},
      })
      .select('id')
      .single();

    if (insertError || !artifact) {
      console.error('Artifact insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
    }
    artifactId = artifact.id;
  }

  after(() => runGeneration(artifactId, answers, name));

  return NextResponse.json({ artifact_id: artifactId });
}
