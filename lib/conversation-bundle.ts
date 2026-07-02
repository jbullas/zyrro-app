import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getChatCompletion } from '@/lib/llm';
import { CONVERSATION_BUNDLE_PROMPT } from '@/lib/prompts/conversation-bundle';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type ConversationBundle = {
  summary: string;
  summary_generated_at: string;
};

export async function resolveConversationBundle(
  conversationId: string,
  userId: string,
): Promise<ConversationBundle | null> {
  const supabase = createServiceClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('summary, summary_generated_at, last_message_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!conversation) return null;

  const stale =
    !conversation.summary_generated_at ||
    (!!conversation.last_message_at &&
      new Date(conversation.last_message_at).getTime() >
        new Date(conversation.summary_generated_at).getTime());

  if (!stale) {
    return {
      summary: conversation.summary ?? '',
      summary_generated_at: conversation.summary_generated_at,
    };
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('Conversation bundle: messages fetch failed:', messagesError);
    return null;
  }

  const content = await getChatCompletion({
    messages: [
      { role: 'system', content: CONVERSATION_BUNDLE_PROMPT },
      { role: 'user', content: JSON.stringify(messages ?? []) },
    ],
    temperature: 0.3,
  });

  const summary = content?.trim() ?? '';
  const summaryGeneratedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ summary, summary_generated_at: summaryGeneratedAt })
    .eq('id', conversationId);

  if (updateError) {
    console.error('Conversation bundle: summary write failed:', updateError);
    return null;
  }

  return { summary, summary_generated_at: summaryGeneratedAt };
}
