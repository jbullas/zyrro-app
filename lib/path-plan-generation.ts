// #169, brief 169-plan-page: the Plan for the path chosen in the Path
// conversation, generated in the background and stored as a
// path_conversation_plan artifact (one per path_choice; the latest ready row
// for the current choice is the Plan). The same pattern as options
// (lib/path-options.ts): a generating row now, the work in after(), a flip of
// stranded rows to failed on read-back, and one automatic retry that names
// what was wrong. The content and shape come from lib/path-conversation-plan.ts.

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withPipelineDeadline } from '@/lib/llm';
import { FLIP_GUARD_MS, GENERATION_BUDGET_MS } from '@/lib/generation-budget';
import { createServiceClient, listConversationMessages, type ConversationRow } from '@/lib/chat-turn';
import { chatJson, getProfileRow } from '@/lib/path-conversation';
import { isCurrentPlan, parsePlan, planInput, planShape, type DraftPlan } from '@/lib/path-conversation-plan';
import { PATH_CONVERSATION_PLAN_PROMPT } from '@/lib/prompts/path-conversation-plan';
import { withMetaDefaults, type PathProfile } from '@/lib/path-profile';
import type { PathChoiceContent } from '@/lib/path-options';
import type { ChatChoiceSet, SummaryCard } from '@/lib/chat-choices';

export const PLAN_TYPE = 'path_conversation_plan';
const CHOICE_TYPE = 'path_choice';
const PLAN_MODEL = 'gpt-6.1-sol';

// artifacts.content, jsonb (no migration beyond the type and its policies).
export type PlanContent = {
  choice_id: string;
  plan?: DraftPlan;
  model?: string;
  checks?: { attempts: number; problems_first: string[]; problems_kept: string[] };
};

type PlanRow = { id: string; status: string; created_at: string; content: PlanContent };
type ChoiceRow = { id: string; content: PathChoiceContent };

async function currentChoice(supabase: SupabaseClient, conversationId: string): Promise<ChoiceRow | null> {
  const { data, error } = await supabase.from('artifacts').select('id, content')
    .eq('conversation_id', conversationId).eq('type', CHOICE_TYPE).eq('status', 'ready')
    .order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return (data?.[0] as ChoiceRow | undefined) ?? null;
}

async function planRows(supabase: SupabaseClient, conversationId: string): Promise<PlanRow[]> {
  const { data, error } = await supabase.from('artifacts').select('id, status, created_at, content')
    .eq('conversation_id', conversationId).eq('type', PLAN_TYPE).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanRow[];
}

/** A generation past its budget (a timed-out function) is failed, so a retry can start. */
async function flipStranded(supabase: SupabaseClient, rows: PlanRow[]): Promise<void> {
  for (const r of rows) {
    if (r.status !== 'generating') continue;
    if (Date.now() - new Date(r.created_at).getTime() <= GENERATION_BUDGET_MS + FLIP_GUARD_MS) continue;
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', r.id).eq('status', 'generating');
    const { data } = await supabase.from('artifacts').select('status').eq('id', r.id).single();
    r.status = (data?.status as string | undefined) ?? 'failed';
    console.warn(`[path plan] stranded generation ${r.id} flipped to ${r.status}`);
  }
}

/** Naming is still open: the latest message offers the name suggestions. */
async function namingPending(supabase: SupabaseClient, conversationId: string): Promise<boolean> {
  const [latest] = await listConversationMessages(supabase, conversationId, 1);
  return (latest?.choices as ChatChoiceSet | null | undefined)?.purpose === 'naming';
}

export type PlanStatus = 'no_choice' | 'naming' | 'started' | 'running' | 'failed' | 'ready';

/**
 * Starts the Plan generation for the current path choice, if one is due,
 * exactly once: after naming (or when names were unavailable), on read-back
 * (a choice made before Plans existed, or a stranded row), and on retry.
 * Must run inside a route handler (after()).
 */
export async function ensurePlanGeneration(
  supabase: SupabaseClient,
  conversation: Pick<ConversationRow, 'id' | 'user_id'>,
  opts: { retry?: boolean } = {},
): Promise<PlanStatus> {
  const choice = await currentChoice(supabase, conversation.id);
  if (!choice) return 'no_choice';
  if (await namingPending(supabase, conversation.id)) return 'naming';
  const rows = await planRows(supabase, conversation.id);
  await flipStranded(supabase, rows);
  if (rows.some(r => r.status === 'generating')) return 'running';
  const forChoice = rows.filter(r => r.content?.choice_id === choice.id);
  if (forChoice.some(r => r.status === 'ready' && isCurrentPlan(r.content.plan))) return 'ready';
  // A Plan from before 169-plan-layers counts as failed: it is rebuilt on
  // retry, never on its own.
  if (forChoice.some(r => r.status === 'failed' || r.status === 'ready') && !opts.retry) return 'failed';

  const { data, error } = await supabase.from('artifacts').insert({
    user_id: conversation.user_id,
    conversation_id: conversation.id,
    type: PLAN_TYPE,
    status: 'generating',
    content: { choice_id: choice.id } satisfies PlanContent,
  }).select('id').single();
  // The one-generating-plan-per-user index: another request started it.
  if (error?.code === '23505') return 'running';
  if (error || !data) throw error ?? new Error('plan row insert returned nothing');
  const id = data.id as string;
  console.info(`[path plan] conversation ${conversation.id}: generation ${id} started for choice ${choice.id}`);
  after(() => withPipelineDeadline(() => runPlanGeneration(id)));
  return 'started';
}

/** The generation itself: one model call, and one retry naming what was wrong. */
export async function runPlanGeneration(artifactId: string): Promise<void> {
  const supabase = createServiceClient();
  const fail = async (checks: PlanContent['checks'] | undefined, why: string) => {
    console.warn(`[path plan] generation ${artifactId} failed: ${why}`);
    const { data: row } = await supabase.from('artifacts').select('content').eq('id', artifactId).single();
    await supabase.from('artifacts').update({ status: 'failed', content: { ...(row?.content as PlanContent), ...(checks && { checks }) } })
      .eq('id', artifactId).eq('status', 'generating');
  };
  try {
    const { data: art, error } = await supabase.from('artifacts').select('id, status, conversation_id, content').eq('id', artifactId).single();
    if (error || !art) throw error ?? new Error('plan row missing');
    if (art.status !== 'generating') return;
    const content = art.content as PlanContent;
    const conversationId = art.conversation_id as string;
    const [{ data: choiceRow }, row] = await Promise.all([
      supabase.from('artifacts').select('id, content').eq('id', content.choice_id).single(),
      getProfileRow(supabase, conversationId),
    ]);
    const card = (row?.summary as { card?: SummaryCard } | null)?.card;
    if (!choiceRow || !row || !card) throw new Error('no chosen path or confirmed card');
    const profile = withMetaDefaults(row.profile as PathProfile);
    const shape = planShape(profile.risk_time.value?.hours_band);
    const input = planInput(choiceRow.content as PathChoiceContent, profile, card, shape);
    const base = [
      { role: 'system' as const, content: PATH_CONVERSATION_PLAN_PROMPT },
      { role: 'user' as const, content: JSON.stringify(input) },
    ];

    const first = await chatJson(base, undefined, 'path plan', PLAN_MODEL, conversationId);
    let result = parsePlan(first.parsed, shape);
    const checks = { attempts: 1, problems_first: result.problems, problems_kept: result.problems };
    if (!result.plan || result.problems.length) {
      // One retry that names what was wrong, as options do; no new prompt rule.
      console.warn(`[path plan] first plan not usable as is; retrying once: ${result.problems.join('; ')}`);
      checks.attempts = 2;
      const retry = await chatJson([
        ...base,
        { role: 'assistant', content: JSON.stringify(first.parsed ?? {}) },
        { role: 'system', content: `Your plan was not usable: ${result.problems.join('; ')}. Return the full JSON again with these fixed. Every other rule still applies.` },
      ], undefined, 'path plan (retry)', PLAN_MODEL, conversationId);
      result = parsePlan(retry.parsed, shape);
      checks.problems_kept = result.problems;
    }
    if (!result.plan || result.problems.length) return await fail(checks, result.problems.join('; '));

    const { error: upError } = await supabase.from('artifacts')
      .update({ status: 'ready', content: { ...content, plan: result.plan, model: PLAN_MODEL, checks } satisfies PlanContent })
      .eq('id', artifactId).eq('status', 'generating');
    if (upError) throw upError;
    console.info(`[path plan] generation ${artifactId} ready (${checks.attempts} attempt${checks.attempts > 1 ? 's' : ''})`);
  } catch (err) {
    await fail(undefined, String((err as Error)?.message ?? err));
  }
}

// ── What the browser sees ───────────────────────────────────────────────────

export type PlanView = {
  status: 'no_choice' | 'naming' | 'generating' | 'failed' | 'ready';
  path: { name: string; what_it_is: string | null; in_your_words: string | null } | null;
  plan: DraftPlan | null;
  // When the Plan was generated: the first action's due day counts from it.
  generated_at: string | null;
};

/** The Plan state for /plan: no model call. */
export async function planView(supabase: SupabaseClient, conversationId: string): Promise<PlanView> {
  const choice = await currentChoice(supabase, conversationId);
  if (!choice) return { status: 'no_choice', path: null, plan: null, generated_at: null };
  const c = choice.content;
  const note = c.note?.trim();
  const path = {
    name: c.project_name || c.option.name,
    what_it_is: c.option.what_it_is ?? null,
    // The note at choice exactly as the user wrote it: it is written to Zyrro
    // ("Help me…"), so a pronoun swap would break it (Miroslav, 2026-11-09).
    in_your_words: note || null,
  };
  const rows = (await planRows(supabase, conversationId)).filter(r => r.content?.choice_id === choice.id);
  const latest = rows[rows.length - 1];
  const ready = [...rows].reverse().find(r => r.status === 'ready' && isCurrentPlan(r.content.plan));
  if (latest?.status === 'generating') return { status: 'generating', path, plan: null, generated_at: null };
  if (ready?.content.plan) return { status: 'ready', path, plan: ready.content.plan, generated_at: ready.created_at };
  // A failed generation, or only a Plan from before 169-plan-layers: offer the retry.
  if (latest?.status === 'failed' || latest?.status === 'ready') return { status: 'failed', path, plan: null, generated_at: null };
  return { status: (await namingPending(supabase, conversationId)) ? 'naming' : 'generating', path, plan: null, generated_at: null };
}
