import { NextRequest, NextResponse, after } from 'next/server';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import type { PathDirectionSessionContent } from '@/lib/path-direction';
import type { PathOptionsSessionContent } from '@/lib/path-options-session';
import {
  generatePathReport,
  PathReportGenerationViolationError,
  type PathReportGenerationContext,
  type PathReportContent,
} from '@/lib/generate-path-report';

// #134 Slice 3 — "Your Path" final delivery API surface. GET only: unlike
// path_options_session, this artifact has no user-facing accept/adjust
// checkpoint on its content (brief §5), so there's nothing for a POST to
// mutate here — naming (a separate concern, see app/api/generate-project-name
// and app/api/name-path-result) is deliberately its own pair of routes, not
// folded in here, per this session's own scoping pass.
//
// path_report is a Tier C append-only artifact (not a mutated-in-place
// session like path_direction_session/path_options_session) — its CRUD is
// simple enough (no state machine beyond a single failed-row-resume case)
// to live inline here rather than in a dedicated lib/path-report.ts module,
// per this session's own decision.

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

/** Same defensive posture as /api/path-options's own Direction-complete check. */
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
 * Returns the options session's content only once a real selection has been
 * made — status alone isn't the right gate here (unlike Direction/Options'
 * own completion checks), since path_options_session's status vocabulary
 * doesn't have a distinct "selection made" state; selected_candidate_id
 * being set is the actual signal.
 */
async function loadOptionsSessionWithSelection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<PathOptionsSessionContent | null> {
  const { data } = await getCurrentArtifact<{ content: PathOptionsSessionContent }>(
    supabase,
    userId,
    'path_options_session',
    { select: 'content' },
  );
  if (!data || !data.content.selected_candidate_id) return null;
  return data.content;
}

function buildGenerationContext(
  identityReport: IdentitySignatureReportArtifactContent,
  directionContent: PathDirectionSessionContent,
  optionsContent: PathOptionsSessionContent,
): { context: PathReportGenerationContext; chosenCandidateId: string } | null {
  const chosen = optionsContent.candidates.find(c => c.id === optionsContent.selected_candidate_id);
  if (!chosen) return null;

  return {
    context: {
      chosen_candidate: { name: chosen.name, description: chosen.description },
      comments: optionsContent.comments ?? '',
      must_haves: directionContent.must_haves ?? [],
      must_avoids: directionContent.must_avoids ?? [],
      ideal_life: directionContent.ideal_life ?? '',
      primary_constellation: identityReport.primary_constellation,
    },
    chosenCandidateId: chosen.id,
  };
}

/**
 * Background generation — runs on genuine first creation, and again to
 * resume a previously-failed row (see GET's own resume branch). Catches
 * PathReportGenerationViolationError the same way it catches any other
 * failure: marks the row 'failed'. A future client hook's job (not built
 * this slice) to surface that visibly, same as every other generation
 * route in this project.
 */
async function runGeneration(
  sessionId: string,
  context: PathReportGenerationContext,
  chosenCandidateId: string,
) {
  const supabase = createServiceClient();
  try {
    const draft = await generatePathReport(context);
    const content: PathReportContent = {
      ...draft,
      chosen_candidate: {
        id: chosenCandidateId,
        name: context.chosen_candidate.name,
        description: context.chosen_candidate.description,
      },
      comments: context.comments,
    };
    await supabase.from('artifacts').update({ status: 'ready', content }).eq('id', sessionId);
  } catch (error) {
    console.error(
      'Path report generation failed:',
      error instanceof PathReportGenerationViolationError ? error.message : error,
    );
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

// Loose shape for reads before a row is known to be 'ready' — content is
// genuinely partial/placeholder while 'generating', so casting it to the
// full PathReportContent type here would be dishonest. Only runGeneration
// above ever constructs a real PathReportContent, right before persisting it.
type PathReportRowRaw = {
  id: string;
  user_id: string;
  status: string;
  content: unknown;
};

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

  const optionsContent = await loadOptionsSessionWithSelection(supabase, user.id);
  if (!optionsContent) {
    return NextResponse.json({ error: 'Options step is not complete (no selection made yet)' }, { status: 409 });
  }

  const directionContent = await loadCompletedDirectionContent(supabase, user.id);
  if (!directionContent) {
    return NextResponse.json({ error: 'Direction step is not complete' }, { status: 409 });
  }

  const identityReport = await loadIdentityReport(supabase, user.id);
  if (!identityReport) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  const built = buildGenerationContext(identityReport, directionContent, optionsContent);
  if (!built) {
    return NextResponse.json({ error: 'Selected candidate not found in options session' }, { status: 409 });
  }
  const { context, chosenCandidateId } = built;

  // Standard Tier C creation-race pattern — insert, catch 23505, reread —
  // matching identity_report's own precedent, not path_options_session's
  // claimGeneration-based session pattern: path_report is a Tier C row, not
  // a mutated-in-place session.
  const { data: inserted, error: insertError } = await supabase
    .from('artifacts')
    .insert({
      user_id: user.id,
      type: 'path_report',
      access_level: 'paid',
      status: 'generating',
      // Genuinely partial at this point — only what's already known before
      // generation runs. Not cast to PathReportContent; see
      // PathReportRowRaw's own comment above.
      content: {
        chosen_candidate: { id: chosenCandidateId, name: context.chosen_candidate.name, description: context.chosen_candidate.description },
        comments: context.comments,
      },
    })
    .select('id, user_id, status, content')
    .single();

  let session: PathReportRowRaw;
  let created: boolean;

  if (insertError?.code === '23505') {
    const { data: current, error: readError } = await getCurrentArtifact<PathReportRowRaw>(
      supabase,
      user.id,
      'path_report',
      { select: 'id, user_id, status, content' },
    );
    if (readError || !current) {
      throw readError ?? new Error('Lost the path_report creation race but no existing row was found');
    }
    session = current;
    created = false;
  } else if (insertError || !inserted) {
    throw insertError ?? new Error('Failed to create path_report');
  } else {
    session = inserted as PathReportRowRaw;
    created = true;
  }

  if (created) {
    after(() => runGeneration(session.id, context, chosenCandidateId));
    return NextResponse.json({ status: session.status, content: session.content });
  }

  // Reused an existing row. If a prior generation attempt crashed (status
  // 'failed'), this GET is the only place that can ever resume it — same
  // claim-then-rerun shape as /api/path-options's own GET fix, applying
  // that lesson rather than repeating the gap.
  if (session.status === 'failed') {
    const { data: claimed } = await supabase
      .from('artifacts')
      .update({ status: 'generating' })
      .eq('id', session.id)
      .neq('status', 'generating')
      .select('id, user_id, status, content')
      .maybeSingle();

    if (claimed) {
      after(() => runGeneration(session.id, context, chosenCandidateId));
      return NextResponse.json({ status: (claimed as PathReportRowRaw).status, content: (claimed as PathReportRowRaw).content });
    }
    // Lost the claim race — another concurrent request already claimed it
    // and will run the resume. Report 'generating' (the now-true state),
    // not the stale 'failed' this read predates — same precedent as
    // /api/path-options's own claim-race handling.
    return NextResponse.json({ status: 'generating', content: session.content });
  }

  return NextResponse.json({ status: session.status, content: session.content });
}
