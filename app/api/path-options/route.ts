import { NextRequest, NextResponse, after } from 'next/server';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import type { PathDirectionSessionContent } from '@/lib/path-direction';
import {
  startOrReuseOptionsSession,
  claimGeneration,
  appendCandidates,
  recordSelection,
  type PathOptionsSessionRow,
  type PathOptionsSessionContent,
  type PathOptionsCandidate,
} from '@/lib/path-options-session';
import {
  generateInitialOptions,
  generateRefineOptions,
  type OptionsGenerationContext,
} from '@/lib/generate-path-options-session';

// #134 Slice 2 — Checkpoint 2 "Options" API surface. Same GET-bootstraps
// POST-acts-on-one-existing-row split as /api/path-direction, not
// /api/generate-path-options's single-purpose POST — this resource has
// three distinct operations (bootstrap+kick off initial 4, refine +2,
// select) behind one route file. Unlike path_direction_session,
// path_options_session has a real background-generation state (a real LLM
// call for the initial 4 and each refine round), so GET also returns
// session.id — the client's polling hook needs it to target
// useCheckpointSessionStatus-style polling, the same way the old
// path_checkpoint_session flow's session_id was returned for that reason.
// See docs/briefs/134-path-redesign-direction-options-your-path.md §4.

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function loadIdentityReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<IdentitySignatureReportArtifactContent | null> {
  const { data } = await getCurrentArtifact<{ content: IdentitySignatureReportArtifactContent }>(
    supabase,
    userId,
    'identity_report',
    { status: 'ready', select: 'content' },
  );
  return data?.content ?? null;
}

/**
 * Defensive server-side check that Checkpoint 1 "Direction" actually
 * finished — same posture as /api/path-direction's own identity_report-
 * existence check, applied here even though app/path/page.tsx already
 * won't render Checkpoint 2's UI until direction.step === 'complete': the
 * client-side gate isn't a substitute for the API trusting its own
 * precondition. Returns null both when no direction session exists at all
 * and when one exists but isn't complete — callers don't need to
 * distinguish the two, both mean "not ready for Checkpoint 2."
 */
async function loadCompletedDirectionContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<PathDirectionSessionContent | null> {
  const { data } = await getCurrentArtifact<{ status: string; content: PathDirectionSessionContent }>(
    supabase,
    userId,
    'path_direction_session',
    { select: 'status, content' },
  );
  if (!data || data.status !== 'complete') return null;
  return data.content;
}

/**
 * §4's generation inputs: the curated must-haves/avoids/ideal-life from
 * Checkpoint 1, plus the user's strongest signatures — never the full
 * discovery answers or scored signature list Stage 1 of the old flow used.
 * `?? []`/`?? ''` fallbacks exist only because PathDirectionSessionContent's
 * type allows null for "not yet submitted" (lib/path-direction.ts) — by the
 * time this runs, loadCompletedDirectionContent has already confirmed
 * status === 'complete', which resolveDirectionStep guarantees means all
 * three fields are set, but the type itself doesn't narrow that.
 */
function buildGenerationContext(
  identityReport: IdentitySignatureReportArtifactContent,
  directionContent: PathDirectionSessionContent,
): OptionsGenerationContext {
  return {
    must_haves: directionContent.must_haves ?? [],
    must_avoids: directionContent.must_avoids ?? [],
    ideal_life: directionContent.ideal_life ?? '',
    primary_constellation: identityReport.primary_constellation,
  };
}

/**
 * Background kickoff for the initial 4 — mirrors runStage1AndStage2's
 * catch-and-mark-failed shape (app/api/generate-path-options/route.ts,
 * pre-#134): on failure, flips status to 'failed' so
 * useCheckpointSessionStatus's stranded-row logic doesn't need to be the
 * only thing that ever notices. GET below also calls this to RESUME a
 * previously-failed session, not just to start a brand new one — see its
 * `session.status === 'failed'` branch.
 */
async function runInitialGeneration(
  sessionId: string,
  context: OptionsGenerationContext,
  priorContent: PathOptionsSessionContent,
) {
  const supabase = createServiceClient();
  try {
    const result = await generateInitialOptions(context);
    await appendCandidates(supabase, sessionId, result.accepted, priorContent);
  } catch (error) {
    console.error('Path options initial generation failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

/** Background kickoff for a +2 refine round — same failure handling as runInitialGeneration. */
async function runRefineGeneration(
  sessionId: string,
  context: OptionsGenerationContext,
  existingCandidates: PathOptionsCandidate[],
  steerText: string,
  priorContent: PathOptionsSessionContent,
) {
  const supabase = createServiceClient();
  try {
    const result = await generateRefineOptions(context, existingCandidates, steerText);
    await appendCandidates(supabase, sessionId, result.accepted, priorContent);
  } catch (error) {
    console.error('Path options refine generation failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

export async function GET(_req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const identityReport = await loadIdentityReport(supabase, user.id);
  if (!identityReport) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  const directionContent = await loadCompletedDirectionContent(supabase, user.id);
  if (!directionContent) {
    return NextResponse.json({ error: 'Direction step is not complete' }, { status: 409 });
  }

  const { session, created } = await startOrReuseOptionsSession(supabase, user.id);
  const context = buildGenerationContext(identityReport, directionContent);

  // Lost the create race (concurrent double-load) — someone else's request
  // already owns this session and will run the initial generation. Don't
  // run it twice, same contract as path_direction_session/
  // path_checkpoint_session's own creation-race handling.
  if (created) {
    after(() => runInitialGeneration(session.id, context, session.content));
    return NextResponse.json({ session_id: session.id, status: session.status, content: session.content });
  }

  // Reused an existing row. If a prior generation attempt crashed (status
  // 'failed' — written by runInitialGeneration/runRefineGeneration's own
  // catch block, or by useCheckpointSessionStatus's client-side stranded-
  // row flip), this GET is the only place that can ever resume it: nothing
  // else re-polls a session nobody is actively viewing. claimGeneration's
  // conditional UPDATE (flips to 'generating' only if not already
  // 'generating') guards the same "two concurrent requests both try to
  // resume it" race the old generate-path-options route relied on it for.
  if (session.status === 'failed') {
    const claimed = await claimGeneration(supabase, session.id);
    if (claimed) {
      after(() => runInitialGeneration(session.id, context, claimed.content));
      return NextResponse.json({ session_id: session.id, status: claimed.status, content: claimed.content });
    }
    // Lost the claim race — another concurrent request already claimed it
    // and will run the resume. Report 'generating' (the now-true state),
    // not the stale 'failed' this read predates — same precedent as the
    // old generate-path-options route's own claim-race handling.
    return NextResponse.json({ session_id: session.id, status: 'generating', content: session.content });
  }

  return NextResponse.json({
    session_id: session.id,
    status: session.status,
    content: session.content,
  });
}

type Body =
  | { action: 'refine'; text?: unknown }
  | { action: 'select'; candidate_id?: unknown; comments?: unknown };

export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  if (body.action !== 'refine' && body.action !== 'select') {
    return NextResponse.json({ error: 'action must be "refine" or "select"' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session } = await getCurrentArtifact<PathOptionsSessionRow>(
    supabase,
    user.id,
    'path_options_session',
    { select: 'id, user_id, status, content' },
  );
  if (!session) {
    return NextResponse.json({ error: 'No path_options_session found — GET first to start one' }, { status: 404 });
  }

  // Both actions only make sense once a candidate batch has actually been
  // presented — not while a generation round is already in flight, and not
  // once the session is already complete (§4: "only selecting an option...
  // allows the process to advance").
  if (session.status !== 'awaiting_checkpoint') {
    return NextResponse.json(
      { error: `Session is not awaiting a response (status: "${session.status}")` },
      { status: 409 },
    );
  }

  if (body.action === 'select') {
    if (typeof body.candidate_id !== 'string' || typeof body.comments !== 'string') {
      return NextResponse.json({ error: 'candidate_id and comments must be strings' }, { status: 400 });
    }

    let updated: PathOptionsSessionRow;
    try {
      updated = await recordSelection(supabase, session.id, body.candidate_id, body.comments, session.content);
    } catch (error) {
      // recordSelection throws when candidate_id isn't among this
      // session's real candidates (lib/path-options-session.ts) — a client
      // bug or a stale/tampered id, not a server fault.
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to record selection' },
        { status: 400 },
      );
    }

    return NextResponse.json({ session_id: session.id, status: updated.status, content: updated.content });
  }

  // action === 'refine'
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 });
  }

  // §4: "hard cap: 8 total options ... the 'provide free-text alternative
  // input' branch simply stops being offered." Client-side hides this
  // option past 8, but the route enforces it too rather than trusting that.
  if (session.content.candidates.length >= 8) {
    return NextResponse.json({ error: 'Already at the 8-candidate cap' }, { status: 409 });
  }

  // Validate/load everything the background job needs BEFORE claiming
  // generation — claiming flips status to 'generating', and a failure past
  // that point would leave the row stuck generating with nothing running to
  // finish it. Same ordering concern documented in
  // lib/path-options-session.ts's claimGeneration.
  const identityReport = await loadIdentityReport(supabase, user.id);
  if (!identityReport) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  const directionContent = await loadCompletedDirectionContent(supabase, user.id);
  if (!directionContent) {
    return NextResponse.json({ error: 'Direction step is not complete' }, { status: 409 });
  }

  const claimed = await claimGeneration(supabase, session.id);
  if (!claimed) {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 });
  }

  const context = buildGenerationContext(identityReport, directionContent);
  const steerText = body.text;
  after(() => runRefineGeneration(session.id, context, claimed.content.candidates, steerText, claimed.content));

  return NextResponse.json({ session_id: session.id, status: claimed.status, content: claimed.content });
}
