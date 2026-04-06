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