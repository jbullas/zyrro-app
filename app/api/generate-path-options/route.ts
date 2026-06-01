import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { PATH_OPTIONS_PROMPT } from '@/lib/prompts/path-options';
import type { PathOptionsArtifactContent } from '@/lib/artifact-schemas';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function validatePathOptions(data: unknown): data is PathOptionsArtifactContent {
  const d = data as PathOptionsArtifactContent;
  if (!d?.recap || !d.meaning || !d.reframe || !d.why) return false;
  if (!Array.isArray(d.options) || d.options.length !== 4) return false;
  const required = ['id', 'name', 'thesis', 'body', 'signatures_engaged', 'stretch'];
  if (!d.options.every(o => required.every(f => f in (o as object)))) return false;
  const stretches = d.options.map(o => o.stretch);
  if (!stretches.includes('Natural') || !stretches.includes('Reinvention')) return false;
  return true;
}

async function runGeneration(artifactId: string, identityReport: unknown) {
  const supabase = createServiceClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PATH_OPTIONS_PROMPT },
        { role: 'user', content: JSON.stringify(identityReport) },
      ],
      max_tokens: 6000,
      temperature: 0,
    });

    const options = JSON.parse(response.choices[0]?.message?.content ?? '{}');

    if (!validatePathOptions(options)) {
      throw new Error('Path options failed validation');
    }

    await supabase
      .from('artifacts')
      .update({ status: 'ready', content: options })
      .eq('id', artifactId);

  } catch (error) {
    console.error('Path options generation failed:', error);
    await supabase
      .from('artifacts')
      .update({ status: 'failed' })
      .eq('id', artifactId);
  }
}

export async function POST(req: NextRequest) {
  const { user_id } = await req.json() as { user_id: string };

  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const entitled = await hasPaidEntitlement(user_id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: identityArtifact } = await supabase
    .from('artifacts')
    .select('content')
    .eq('user_id', user_id)
    .eq('type', 'identity_report')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!identityArtifact) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('artifacts')
    .select('id')
    .eq('user_id', user_id)
    .eq('type', 'path_options')
    .maybeSingle();

  let artifactId: string;

  if (existing) {
    await supabase
      .from('artifacts')
      .update({ status: 'generating', content: {} })
      .eq('id', existing.id);
    artifactId = existing.id;
  } else {
    const { data: newArtifact, error } = await supabase
      .from('artifacts')
      .insert({
        user_id,
        type: 'path_options',
        access_level: 'paid',
        status: 'generating',
        content: {},
      })
      .select('id')
      .single();

    if (error || !newArtifact) {
      console.error('Path options artifact insert error:', error);
      return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
    }
    artifactId = newArtifact.id;
  }

  void runGeneration(artifactId, identityArtifact.content);

  return NextResponse.json({ artifact_id: artifactId });
}
