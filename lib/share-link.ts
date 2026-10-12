import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { getCurrentArtifact } from '@/lib/artifacts';
import { toIdentityHero, type IdentityHeroData } from '@/lib/identity-hero';

// #7: public share links for the top of the Identity report. Server-only:
// identity_share_links has RLS on with no policies, so every read and write
// goes through the service role here (app/api/share-link, app/s/[slug]).

function createServiceClient(): SupabaseClient {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 12 random bytes → 16 base64url characters (96 bits), from a CSPRNG.
const SLUG_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;
function newSlug(): string {
  return randomBytes(12).toString('base64url');
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
}

export function shareUrl(slug: string): string {
  return `${siteUrl()}/s/${slug}`;
}

async function findActiveSlug(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('identity_share_links')
    .select('slug')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.slug ?? null;
}

export async function getActiveShareSlug(userId: string): Promise<string | null> {
  return findActiveSlug(createServiceClient(), userId);
}

// Returns the user's active link, creating one if there isn't one. The
// one-active-per-user partial unique index settles a race between two
// concurrent creates: the loser's insert fails with 23505 and it returns the
// winner's slug. A 23505 with no active row afterwards is a slug collision,
// so it retries with a fresh slug.
export async function createOrGetShareSlug(userId: string): Promise<string> {
  const supabase = createServiceClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await findActiveSlug(supabase, userId);
    if (existing) return existing;
    const slug = newSlug();
    const { error } = await supabase.from('identity_share_links').insert({ user_id: userId, slug });
    if (!error) return slug;
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not create a share link');
}

// Revokes the user's active link, if any. Returns whether one was revoked.
export async function revokeShareSlug(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from('identity_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// The hero for a public slug: the owner's CURRENT ready identity report at
// view time, reduced to hero fields only. null for an unknown, malformed or
// revoked slug, or when the owner has no ready report. Cached per request so
// generateMetadata and the page share one lookup.
export const loadSharedHero = cache(async (slug: string): Promise<IdentityHeroData | null> => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const supabase = createServiceClient();
  const { data: link, error } = await supabase
    .from('identity_share_links')
    .select('user_id')
    .eq('slug', slug)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!link) return null;

  const { data: artifact, error: artifactError } = await getCurrentArtifact<{ content: unknown }>(
    supabase,
    link.user_id,
    'identity_report',
    { status: 'ready', select: 'content' },
  );
  if (artifactError) throw artifactError;
  if (!artifact?.content) return null;
  return toIdentityHero(artifact.content);
});
