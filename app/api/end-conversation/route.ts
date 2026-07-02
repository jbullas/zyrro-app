import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { resolveConversationBundle } from '@/lib/conversation-bundle';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { conversation_id } = await req.json() as { conversation_id: string };

  if (!conversation_id) {
    return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversation_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ status: 'completed' })
    .eq('id', conversation_id);

  if (updateError) {
    console.error('end-conversation: status update failed:', updateError);
    return NextResponse.json({ error: 'Failed to end conversation' }, { status: 500 });
  }

  const bundle = await resolveConversationBundle(conversation_id, user.id);

  if (!bundle) {
    return NextResponse.json({ error: 'Failed to generate conversation bundle' }, { status: 500 });
  }

  return NextResponse.json(bundle);
}
