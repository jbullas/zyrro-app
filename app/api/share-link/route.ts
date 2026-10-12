import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentArtifact } from '@/lib/artifacts';
import { createOrGetShareSlug, getActiveShareSlug, revokeShareSlug, shareUrl } from '@/lib/share-link';

// #7: the caller's own Identity share link. Every method acts only on the
// signed-in user's link; there is no way to name another user's link here.

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET: the active link, or { url: null } (lets /identity show "Shared" on load).
export async function GET() {
  const { user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const slug = await getActiveShareSlug(user.id);
  return NextResponse.json(slug ? { slug, url: shareUrl(slug) } : { slug: null, url: null });
}

// POST: create the link, or return the existing active one. Needs a ready report.
export async function POST() {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: report } = await getCurrentArtifact<{ id: string }>(
    supabase,
    user.id,
    'identity_report',
    { status: 'ready', select: 'id' },
  );
  if (!report) return NextResponse.json({ error: 'No ready identity report to share' }, { status: 409 });

  const slug = await createOrGetShareSlug(user.id);
  return NextResponse.json({ slug, url: shareUrl(slug) });
}

// DELETE: revoke the active link. The slug stays dead; sharing again makes a new one.
export async function DELETE() {
  const { user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const revoked = await revokeShareSlug(user.id);
  return NextResponse.json({ revoked });
}
