import { supabase } from '@/lib/supabase'

type MessageRole = 'user' | 'assistant'

type SaveMessageParams = {
  conversationId: string
  role: MessageRole
  content: string
}

export async function saveMessage({
  conversationId,
  role,
  content,
}: SaveMessageParams) {
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
    .from('messages')
    .insert({
      user_id: user.id,
      conversation_id: conversationId,
      role,
      content,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}