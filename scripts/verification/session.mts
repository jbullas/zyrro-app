/**
 * Bootstrap and teardown for synthetic test users used in live verification
 * passes. See docs/briefs/49-run-project-skill.md and CC's local memory
 * entry `reference_local_test_auth_bootstrap` for the manual version of
 * this pattern this module replaces.
 *
 * Requires the dev server running at baseUrl (default http://localhost:3000)
 * — bootstrapTestUser drives a real browser through /auth/callback so the
 * app's own route establishes the session, rather than fabricating cookies.
 */

import { chromium } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

export const STORAGE_STATE_DIR = path.join(process.cwd(), '.verification-runs');

export type ArtifactType = 'identity_report' | 'path_options' | 'path_plan';

const ARTIFACT_ACCESS_LEVEL: Record<ArtifactType, 'free' | 'paid'> = {
  identity_report: 'free',
  path_options: 'paid',
  path_plan: 'paid',
};

export interface TestUser {
  userId: string;
  email: string;
  storageStatePath: string;
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Creates a synthetic test user via the service-role key (no password, no
 * email inbox needed) and drives a headless browser through the real
 * /auth/callback route so cookies are set exactly as they are for a real
 * user. Saves the resulting storageState so callers can open as many
 * driver pages as they need without re-bootstrapping.
 *
 * `opts.metadata` is set as the new user's `user_metadata` (via generateLink's
 * `options.data`). Pass `{ discovery_answers, display_name }` here to make
 * hitting /auth/callback fire a REAL generateIdentityReport run through
 * kickoffIdentityGeneration — the strongest form of live verification for
 * anything touching the generation pipeline, since it exercises the actual
 * shipped code path against real (uncontrolled) LLM output, not just a
 * seeded/final artifact.
 */
export async function bootstrapTestUser(
  supabase: SupabaseClient,
  opts: { baseUrl?: string; email?: string; metadata?: Record<string, unknown> } = {}
): Promise<TestUser> {
  const baseUrl = opts.baseUrl ?? 'http://localhost:3000';
  const email = opts.email ?? `zyrro-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: opts.metadata ? { data: opts.metadata } : undefined,
  });
  if (error || !data?.user) {
    throw new Error(`generateLink failed for ${email}: ${error?.message ?? 'no user returned'}`);
  }
  const userId = data.user.id;
  const { hashed_token: tokenHash, verification_type: type } = data.properties;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/auth/callback?token_hash=${tokenHash}&type=${type}`);

    if (new URL(page.url()).pathname === '/login') {
      throw new Error(`/auth/callback redirected to /login for ${email} — token exchange failed`);
    }

    fs.mkdirSync(STORAGE_STATE_DIR, { recursive: true });
    const storageStatePath = path.join(STORAGE_STATE_DIR, `${userId}.json`);
    await context.storageState({ path: storageStatePath });

    return { userId, email, storageStatePath };
  } finally {
    await browser.close();
  }
}

/**
 * Seeds an artifact row for a test user. `content` should match the shape
 * for `type` defined in lib/artifact-schemas.ts — this function does not
 * validate content shape, just inserts it.
 */
export async function seedArtifact(
  supabase: SupabaseClient,
  userId: string,
  params: {
    type: ArtifactType;
    content: object;
    status?: 'ready' | 'generating' | 'failed';
    accessLevel?: 'free' | 'paid';
    conversationId?: string;
    pathOptionsArtifactId?: string;
    pathId?: string;
  }
): Promise<string> {
  // Hitting /auth/callback for a new user fires kickoffIdentityGeneration()
  // in the background (see lib/kickoff-identity-generation.ts), which inserts
  // its own 'generating' identity_report row. artifacts_one_identity_report_per_user
  // allows only one identity_report row per user regardless of status, so a
  // synthetic seed of that type must clear whatever the background kickoff
  // already created before inserting the caller's content.
  if (params.type === 'identity_report') {
    await supabase.from('artifacts').delete().eq('user_id', userId).eq('type', 'identity_report');
  }

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: params.type,
      status: params.status ?? 'ready',
      access_level: params.accessLevel ?? ARTIFACT_ACCESS_LEVEL[params.type],
      content: params.content,
      conversation_id: params.conversationId ?? null,
      path_options_artifact_id: params.pathOptionsArtifactId ?? null,
      path_id: params.pathId ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`seedArtifact failed for user ${userId}: ${error?.message ?? 'no row returned'}`);
  }
  return data.id as string;
}

export async function seedConversation(
  supabase: SupabaseClient,
  userId: string,
  params: { title?: string; status?: 'active' | 'completed' | 'archived' } = {}
): Promise<string> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: params.title ?? null,
      status: params.status ?? 'active',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`seedConversation failed for user ${userId}: ${error?.message ?? 'no row returned'}`);
  }
  return data.id as string;
}

/**
 * Seeds discovery_answers rows. Several pages (e.g. app/identity/page.tsx)
 * gate on having at least one row here before they'll look at any artifact.
 * Shape matches the confirmed insert in lib/kickoff-identity-generation.ts —
 * discovery_answers has no tracked migration, so this mirrors working
 * production code rather than an assumed schema.
 */
export async function seedDiscoveryAnswers(
  supabase: SupabaseClient,
  userId: string,
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>
): Promise<void> {
  const { error } = await supabase
    .from('discovery_answers')
    .insert(answers.map(a => ({ ...a, user_id: userId })));

  if (error) {
    throw new Error(`seedDiscoveryAnswers failed for user ${userId}: ${error.message}`);
  }
}

const CASCADE_TABLES = ['profiles', 'conversations', 'artifacts', 'messages', 'discovery_answers'] as const;

/**
 * Deletes a synthetic test user and confirms no rows survive. discovery_answers
 * has no tracked migration/confirmed FK (see local memory
 * reference_supabase_schema_introspection), so it's deleted explicitly before
 * deleteUser rather than relied on to cascade. Always runs to completion —
 * callers should invoke this from a `finally` block.
 */
export async function teardownTestUser(supabase: SupabaseClient, testUser: TestUser): Promise<void> {
  const { userId } = testUser;

  await supabase.from('discovery_answers').delete().eq('user_id', userId);

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw new Error(`deleteUser failed for ${userId}: ${deleteError.message}`);
  }

  const orphans: string[] = [];
  for (const table of CASCADE_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) {
      orphans.push(`${table}: count check failed (${error.message})`);
    } else if ((count ?? 0) > 0) {
      orphans.push(`${table}: ${count} orphaned row(s)`);
    }
  }

  if (fs.existsSync(testUser.storageStatePath)) {
    fs.rmSync(testUser.storageStatePath);
  }

  if (orphans.length > 0) {
    throw new Error(`teardown left orphaned rows for ${userId}:\n${orphans.join('\n')}`);
  }
}
