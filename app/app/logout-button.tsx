'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      console.error('signOut failed:', error)
    }

    // Defensive cleanup regardless of success/failure — a failed signOut()
    // (e.g. a network error on the server-side revocation call) causes the
    // Supabase SDK to skip its own local session cleanup entirely, leaving
    // the previous session's cookies intact for any new tab on this browser
    // to read. This app's browser client stores its session in cookies (no
    // custom `cookies` option passed to createBrowserClient — see
    // utils/supabase/client.ts), not localStorage, so cookies are cleared
    // first; localStorage/sessionStorage are cleared too as a harmless
    // backstop in case that configuration ever changes.
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim()
      if (name.startsWith('sb-')) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
      }
    })
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    })
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith('sb-')) sessionStorage.removeItem(key)
    })
    // /start's zyrro_discovery_answers/zyrro_user_name are stamped with an
    // ownerId and already self-clear for the next visitor on their own
    // (see app/start/page.tsx), but clearing here too means this account's
    // data never even briefly outlives the session it belongs to.
    localStorage.removeItem('zyrro_discovery_answers')
    localStorage.removeItem('zyrro_user_name')

    router.push('/login')
  }

  return (
    <button onClick={handleLogout} className="border rounded p-2 mt-4">
      Log out
    </button>
  )
}
