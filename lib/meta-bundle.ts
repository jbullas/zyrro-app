import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getChatCompletion } from '@/lib/llm';
import { resolveConversationBundle } from '@/lib/conversation-bundle';
import { META_BUNDLE_PROMPT } from '@/lib/prompts/meta-bundle';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type MetaBundle = {
  content: string;
  created_at: string;
};

export async function resolveMetaBundle(userId: string): Promise<MetaBundle | null> {
  const supabase = createServiceClient();

  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select('id, summary, summary_generated_at, last_message_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (conversationsError) {
    console.error('Meta bundle: conversations fetch failed:', conversationsError);
    return null;
  }

  if (!conversations || conversations.length === 0) return null;

  const resolved: { summary: string | null; summary_generated_at: string | null }[] = [];

  for (const conversation of conversations) {
    const stale =
      !conversation.summary_generated_at ||
      (!!conversation.last_message_at &&
        new Date(conversation.last_message_at).getTime() >
          new Date(conversation.summary_generated_at).getTime());

    if (stale) {
      const bundle = await resolveConversationBundle(conversation.id, userId);
      if (!bundle) return null;
      resolved.push(bundle);
    } else {
      resolved.push({
        summary: conversation.summary,
        summary_generated_at: conversation.summary_generated_at,
      });
    }
  }

  const summaries = resolved
    .map((r) => r.summary)
    .filter((summary): summary is string => !!summary);

  if (summaries.length === 0) return null;

  const summaryGeneratedTimestamps = resolved
    .map((r) => r.summary_generated_at)
    .filter((d): d is string => !!d);

  const latestSummaryGeneratedAt = summaryGeneratedTimestamps.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest
  );

  const { data: latestMetaBundle, error: metaBundleError } = await supabase
    .from('meta_bundles')
    .select('content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metaBundleError) {
    console.error('Meta bundle: latest fetch failed:', metaBundleError);
    return null;
  }

  const stale =
    !latestMetaBundle ||
    new Date(latestSummaryGeneratedAt).getTime() > new Date(latestMetaBundle.created_at).getTime();

  if (!stale) {
    return { content: latestMetaBundle.content, created_at: latestMetaBundle.created_at };
  }

  const content = await getChatCompletion({
    messages: [
      { role: 'system', content: META_BUNDLE_PROMPT },
      { role: 'user', content: JSON.stringify(summaries) },
    ],
    temperature: 0.3,
  });

  const synthesized = content?.trim() ?? '';

  const { data: inserted, error: insertError } = await supabase
    .from('meta_bundles')
    .insert({ user_id: userId, content: synthesized })
    .select('content, created_at')
    .single();

  if (insertError || !inserted) {
    console.error('Meta bundle: insert failed:', insertError);
    return null;
  }

  return { content: inserted.content, created_at: inserted.created_at };
}
