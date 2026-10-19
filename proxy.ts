import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { PATH_ENABLED } from '@/lib/feature-flags'

// #162: with Path switched off, these routes and their sub-paths go to /identity.
const PATH_ROUTES = /^\/(dashboard|path|plan|mentor)(\/|$)/

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)
  if (PATH_ENABLED || !PATH_ROUTES.test(request.nextUrl.pathname)) return response

  // Redirect only after updateSession's getUser, carrying over any auth
  // cookies it refreshed so the redirect doesn't drop them.
  const redirect = NextResponse.redirect(new URL('/identity', request.url))
  response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
  return redirect
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
