import { createClient } from '@/utils/supabase/client'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function persistGuestMessages(
  conversationId: string,
  messages: ChatMessage[]
) {
  const supabase = createClient()

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

  if (!messages.length) {
    return
  }

  const rows = messages.map((message) => ({
    user_id: user.id,
    conversation_id: conversationId,
    role: message.role,
    content: message.content,
  }))

  const { error } = await supabase.from('messages').insert(rows)

  if (error) {
    throw error
  }
}