import { createBrowserClient } from '@supabase/ssr'

// Module-level singleton — every caller shares one createBrowserClient()
// instance, instead of a fresh one per call. Good practice on its own (one
// GoTrueClient per tab rather than N), but NOT a fix for #146's lock-
// contention race: the navigator lock (lock:sb-<project-ref>-auth-token) is
// keyed by storage-key name, not by client-object identity, so concurrent
// getUser() calls from separate call sites (Header, BottomNav, /path's own
// effect) still each independently request that same-named lock and still
// contend for it, singleton or not — confirmed live via forced-race repro
// 2026-09-14 (25/25 failures both before and after this change). The real
// fix needs to dedupe/serialize those concurrent calls; out of scope here.
let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}