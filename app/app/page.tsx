import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from './logout-button'

export default async function AppPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    redirect('/login')
  }

return (
  <main className="p-6">
    <h1 className="text-2xl font-bold">Welcome to Zyrro</h1>
    <p className="mt-2">You are logged in as {data.user.email}</p>

    <LogoutButton />
  </main>
  )
}