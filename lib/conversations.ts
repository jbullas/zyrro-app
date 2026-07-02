import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

export async function createConversation() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    throw new Error('No authenticated user found')
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export type ConversationListItem = {
  id: string
  status: string
  summary: string | null
  summary_generated_at: string | null
  last_message_at: string | null
  created_at: string
}

export async function listConversations(): Promise<ConversationListItem[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    throw new Error('No authenticated user found')
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('id, status, summary, summary_generated_at, last_message_at, created_at')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data
}