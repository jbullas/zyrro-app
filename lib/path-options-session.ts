import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentArtifact } from '@/lib/artifacts';

// #134 Slice 2 — Checkpoint 2 "Options": data-access/state-machine layer,
// mirroring lib/path-checkpoint.ts's shape (not lib/path-direction.ts's —
// see that file's own header for why: this type has a real background-
// generation state, path_direction_session doesn't). See
// docs/briefs/134-path-redesign-direction-options-your-path.md §4/§7 and
// the migration file (20260910000000_path_options_session.sql) for the
// schema rationale.
//
// path_options_session is a `type = 'path_options_session'` row on the
// shared artifacts table, mutated in place (one row per user), same
// precedent as path_checkpoint_session and path_direction_session. Unlike
// path_direction_session's flat, replace-per-step content, this content's
// `candidates` array is APPEND-ONLY across the session's life (§7 — the
// whole reason this isn't a path_checkpoint_session migration): each write
// here adds to the array, never replaces it.

// A real 4th value, 'failed', is also written here (by
// generate-path-options-session's calling routes, on a background
// generation crash) but deliberately left out of this union — same gap as
// path_checkpoint_session's own PathCheckpointSessionStatus type, which
// only ever needed to WRITE 'failed' via an untyped Supabase .update(),
// never compare against it in typed code. app/api/path-options/route.ts's
// GET handler is the first place that needs a typed `=== 'failed'` check
// (to resume a crashed generation), which is what surfaced this gap via a
// real tsc error rather than by inspection.
export type PathOptionsSessionStatus = 'generating' | 'awaiting_checkpoint' | 'complete' | 'failed';

// #138 §6: the semantic-check judge's own confidence in its fit_score
// verdict for one option. Deliberately the same literal casing as
// PrimaryConstellationConfidence ('High'|'Medium'|'Low') for consistency of
// casing across the codebase, but NOT an alias of it and NOT reused: that
// type measures the strength of underlying signature evidence: this one
// measures the judge's confidence in its own assessment of a single
// option's fit. The two represent genuinely different things and could
// diverge later (e.g. if PrimaryConstellationConfidence ever needs to grow
// its own "Mid" tolerance further) — keeping them distinct types avoids
// coupling that evolution accidentally.
export type FitConfidence = 'High' | 'Medium' | 'Low';

export interface PathOptionsCandidate {
  id: string;
  name: string;
  description: string;
  // #138 §4: short "select this if..." sentence sharpening what's actually
  // different about THIS option's version of the person's pattern — not a
  // one-line restatement of description. Required (not optional) on every
  // candidate generated after this ships; no backfill for candidates
  // generated before it, but path_options_session rows are short-lived
  // (one session per user, resolved within the same /path visit), so there's
  // no real population of pre-#138 candidates to worry about missing it.
  select_if: string;
  // #138 §6: one short sentence, descriptive/orienting ("what is this path,
  // at a glance?") — deliberately distinct from select_if, which is
  // comparative/decision-oriented ("why pick this one over the others").
  core_statement: string;
  // #138 §6: the single most important honest caveat about this path — a
  // genuine trade-off or partial overlap with something the user wants to
  // avoid, even if it didn't rise to a full §5 rejection. Complements, not
  // duplicates, #139's planned honest_cost: this is a quick cross-option
  // screening signal, honest_cost goes deeper on the one path already
  // chosen.
  tension: string;
  // #138 §6: the name(s) of the signature(s), from the High-confidence set
  // passed into generation (§2), that this option most directly draws on —
  // not a blanket list repeated on every card. Reinforces §1's requirement
  // that every option trace back to real, cited signature evidence.
  signatures_engaged: string[];
  // #138 §6: produced by extending §5's existing semantic-check judge call,
  // not a new separate LLM call. Purely a DISPLAY value — never affects the
  // accept/reject/retry gating §5 already implements and has been verified
  // against. Nullable because generate-path-options-session.ts's
  // validateSemanticVerdicts parses these two fields leniently, per-field,
  // specifically so a malformed/missing value from the judge can never
  // invalidate the underlying pass/fail verdict they ride alongside — an
  // accepted candidate can legitimately have a null fit_score/fit_confidence
  // if the judge's response was malformed just for these display-only
  // fields. UI falls back to '—', same precedent as /identity's
  // `sig.frequency ?? '—'`.
  fit_score: number | null;
  fit_confidence: FitConfidence | null;
  // Which generation batch produced this candidate: 1 = initial 4, 2/3 =
  // the two possible +2 refine rounds. Not used for any DB constraint (see
  // the migration's own comment) — kept for the material-difference check's
  // "every candidate already generated this session" comparison set and for
  // any future UI/debug need to distinguish batches.
  round: number;
}

export interface PathOptionsSessionContent {
  candidates: PathOptionsCandidate[];
  // Both null until the user selects an option and (optionally) adds
  // comments on the same screen (§4) — Your Path reads `comments` from here
  // once that step is scoped.
  selected_candidate_id: string | null;
  comments: string | null;
}

export interface PathOptionsSessionRow {
  id: string;
  user_id: string;
  status: PathOptionsSessionStatus;
  content: PathOptionsSessionContent;
}

const SESSION_SELECT = 'id, user_id, status, content';

const EMPTY_CONTENT: PathOptionsSessionContent = {
  candidates: [],
  selected_candidate_id: null,
  comments: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/**
 * Starts a new path_options_session for a user, or reuses an existing one —
 * whether still in flight or already resolved. `created` tells the caller
 * whether this call should go on to kick off the initial-4 generation, or
 * reuse the returned row as someone else's already-in-flight (or finished)
 * session, same contract as path_checkpoint_session's own
 * startCheckpointSessionWithCreationFlag.
 *
 * Checks for any existing row FIRST, before ever attempting an insert.
 * artifacts_one_path_options_session_generating_per_user (migration
 * 20260910000000_path_options_session.sql) is a *partial* unique index — it
 * only guards two concurrent creation attempts racing to insert while no row
 * exists yet. It does nothing to stop a later call from creating a SECOND
 * row once the first has resolved past 'generating' (to
 * 'awaiting_checkpoint'/'complete') — which is exactly what an
 * insert-first-unconditionally approach used to do here: a returning user's
 * every fresh page mount (this is the bootstrap call lib/use-path-options.ts's
 * hook makes on every mount, not just the first) silently spawned a
 * brand-new empty session, shadowing the real one via getCurrentArtifact's
 * created_at DESC "current row" ordering — discarding the user's actual
 * completed selection and restarting Options from scratch. Confirmed live
 * via #134 Slice 3's own UI verification pass, which reproduced this by
 * seeding an already-'complete' session and loading /path once — the same
 * shape as any real revisit after completion. Same root cause, same fix
 * shape, as app/api/path-report/route.ts's own GET fix in this same
 * session.
 */
export async function startOrReuseOptionsSession(
  supabase: Client,
  userId: string,
): Promise<{ session: PathOptionsSessionRow; created: boolean }> {
  const { data: existing, error: readError } = await getCurrentArtifact<PathOptionsSessionRow>(
    supabase,
    userId,
    'path_options_session',
    { select: SESSION_SELECT },
  );
  if (readError) throw readError;
  if (existing) {
    return { session: existing, created: false };
  }

  // Only reachable now for a genuine concurrent first-ever-creation race
  // (two requests landing here with no row yet) — the read above already
  // handles the common "a row already exists" case, which used to fall
  // through to here unguarded.
  const { data: inserted, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_options_session',
      access_level: 'paid',
      status: 'generating',
      content: EMPTY_CONTENT,
    })
    .select(SESSION_SELECT)
    .single();

  if (error?.code === '23505') {
    const { data: current, error: rereadError } = await getCurrentArtifact<PathOptionsSessionRow>(
      supabase,
      userId,
      'path_options_session',
      { select: SESSION_SELECT },
    );
    if (rereadError || !current) {
      throw rereadError ?? new Error('Lost the session-create race but no existing row was found');
    }
    return { session: current, created: false };
  }

  if (error || !inserted) {
    throw error ?? new Error('Failed to create path_options_session');
  }

  return { session: inserted as PathOptionsSessionRow, created: true };
}

/**
 * Conditionally claims a session row for generation: flips status to
 * 'generating' only if it isn't already — guards the "two concurrent
 * attempts to start a refine round on the same existing row" race, same
 * claimGeneration pattern and same rationale as path-checkpoint.ts's
 * version (the creation-race unique index doesn't reach this case, since
 * it's an UPDATE on an already-existing row, not a competing INSERT).
 * Returns null if another call already holds the claim; the caller should
 * re-read and reuse that row.
 */
export async function claimGeneration(
  supabase: Client,
  sessionId: string,
): Promise<PathOptionsSessionRow | null> {
  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'generating' })
    .eq('id', sessionId)
    .neq('status', 'generating')
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) throw error;
  return (data as PathOptionsSessionRow | null) ?? null;
}

/**
 * Appends a freshly-generated batch to the session's candidate list and
 * moves it to 'awaiting_checkpoint' — append, never replace, per §7.
 * `priorContent` is spread first so `selected_candidate_id`/`comments`
 * (irrelevant to a mid-flow generation call, but harmless to carry through)
 * survive untouched, same prior-content-preserving convention as
 * path-checkpoint.ts's recordStageOutput.
 */
export async function appendCandidates(
  supabase: Client,
  sessionId: string,
  newCandidates: PathOptionsCandidate[],
  priorContent: PathOptionsSessionContent,
): Promise<PathOptionsSessionRow> {
  const nextContent: PathOptionsSessionContent = {
    ...priorContent,
    candidates: [...priorContent.candidates, ...newCandidates],
  };

  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'awaiting_checkpoint', content: nextContent })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to append path_options_session candidates');
  return data as PathOptionsSessionRow;
}

/**
 * Records the user's chosen candidate and any additional comments, and
 * completes the session — §4's "only selecting an option ... allows the
 * process to advance." Defensively rejects a candidateId that isn't
 * actually in this session's own candidates list, the same defensive
 * posture as path-direction.ts's validateSelection (never trust a client-
 * supplied id against a stale or tampered candidate list).
 */
export async function recordSelection(
  supabase: Client,
  sessionId: string,
  candidateId: string,
  comments: string,
  priorContent: PathOptionsSessionContent,
): Promise<PathOptionsSessionRow> {
  if (!priorContent.candidates.some(c => c.id === candidateId)) {
    throw new Error(`candidateId "${candidateId}" is not among this session's generated candidates`);
  }

  const nextContent: PathOptionsSessionContent = {
    ...priorContent,
    selected_candidate_id: candidateId,
    comments: comments.trim() || null,
  };

  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'complete', content: nextContent })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to record path_options_session selection');
  return data as PathOptionsSessionRow;
}
