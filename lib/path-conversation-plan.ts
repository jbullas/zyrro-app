// #169, brief 169-plan: the Plan for the path chosen in the Path conversation.
// Code owns the structure (decisions of 2026-11-09): how many milestones (an
// ordered list of outcomes, no dates), how many first-stretch actions and the
// effort of each, the first action's due day, and the stretch's span at the
// user's pace from the hours band's lower bound. The model fills in the
// content; its prose never states effort, days or weeks, and never quotes the
// user. Draft for step 1: no page and no saving yet.

import type { PathChoiceContent } from '@/lib/path-options';
import type { PathProfile } from '@/lib/path-profile';
import type { SummaryCard } from '@/lib/chat-choices';

export const PLAN_MILESTONES = 4;
// The first stretch: a fixed amount of effort in a fixed number of actions,
// the first one small so it can be done within a day.
const ACTION_EFFORT_HOURS = [1, 2, 2, 2.5, 2.5];
export const FIRST_STRETCH_EFFORT_HOURS = ACTION_EFFORT_HOURS.reduce((a, b) => a + b, 0);
const FIRST_ACTION_DUE_DAY = 1;

// Lengths, checked in code (decision of 2026-11-09).
export const PLAN_LIMITS = { frame: 300, milestone: 250, title: 60, what: 200, done_when: 150 } as const;

export type PlanShape = {
  hours_per_week: number;
  milestones: number;
  actions: Array<{ index: number; effort_hours: number }>;
  first_action_due_day: number;
  // The code-written line for the stretch's span at the user's pace.
  span_line: string;
};

/** The plan's shape from the hours a week (the band's lower bound). */
export function planShape(hoursPerWeek: number): PlanShape {
  const h = Math.max(1, hoursPerWeek);
  const weeks = Math.max(1, Math.round(FIRST_STRETCH_EFFORT_HOURS / h));
  return {
    hours_per_week: h,
    milestones: PLAN_MILESTONES,
    actions: ACTION_EFFORT_HOURS.map((effort, i) => ({ index: i + 1, effort_hours: effort })),
    first_action_due_day: FIRST_ACTION_DUE_DAY,
    span_line: weeks === 1 ? 'About a week at your pace' : `About ${weeks} weeks at your pace`,
  };
}

/** What the model sees (decision of 2026-11-09): no Identity report; the deadline is context only. */
export function planInput(choice: PathChoiceContent, profile: PathProfile, card: SummaryCard, shape: PlanShape) {
  const o = choice.option;
  const v = profile.risk_time.value;
  const p = profile.pushing_now.value;
  return {
    chosen_path: {
      name: choice.project_name || o.name,
      option_name: o.name,
      what_it_is: o.what_it_is ?? null,
      what_it_looks_like: o.what_it_looks_like,
      why_it_fits: o.why_it_fits,
      starting_point: o.starting_point,
      what_it_costs: o.what_it_costs,
      form: o.form ?? null,
      who_pays: o.who_pays ?? null,
    },
    note_at_choice: choice.note ?? null,
    their_risk_words: (v?.their_words ?? []).map(w => w.text),
    tapped: { readiness: card.risk.readiness, at_stake: card.risk.at_stake, limits: card.risk.limits, hours: card.risk.hours },
    deadline_context: p?.urgency === 'deadline' ? p.deadline ?? null : null,
    summary: {
      how_zyrro_sees_you: card.seen_as,
      what_you_want: card.wants,
      direction: card.direction ?? null,
      must_haves: card.must_haves.map(i => i.text),
      must_avoids: card.must_avoids.map(i => i.text),
    },
    shape: {
      hours_per_week: shape.hours_per_week,
      milestones: shape.milestones,
      first_stretch: shape.actions,
    },
  };
}

export type DraftPlan = {
  frame: string;
  milestones: string[];
  span_line: string;
  actions: Array<{ index: number; effort_hours: number; due_day: number | null; title: string; what: string; done_when: string }>;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/**
 * The model's content on code's shape, with every length checked. Returns the
 * plan (code's effort, due day and span added) and the list of problems; the
 * plan is null when the counts don't fit.
 */
export function parsePlan(parsed: Record<string, unknown> | null, shape: PlanShape): { plan: DraftPlan | null; problems: string[] } {
  const problems: string[] = [];
  const ms = Array.isArray(parsed?.milestones) ? (parsed!.milestones as unknown[]) : [];
  const as = Array.isArray(parsed?.actions) ? (parsed!.actions as Array<Record<string, unknown>>) : [];
  if (ms.length !== shape.milestones) problems.push(`${ms.length} milestones, not ${shape.milestones}`);
  if (as.length !== shape.actions.length) problems.push(`${as.length} actions, not ${shape.actions.length}`);
  if (problems.length) return { plan: null, problems };
  const over = (label: string, text: string, max: number) => {
    if (!text) problems.push(`${label} empty`);
    else if (text.length > max) problems.push(`${label} ${text.length} chars (max ${max})`);
  };
  const frame = str(parsed?.frame);
  over('frame', frame, PLAN_LIMITS.frame);
  const milestones = ms.map((m, i) => {
    const text = str(typeof m === 'string' ? m : (m as Record<string, unknown>)?.outcome);
    over(`milestone ${i + 1}`, text, PLAN_LIMITS.milestone);
    return text;
  });
  const actions = shape.actions.map((a, i) => {
    const title = str(as[i]?.title);
    const what = str(as[i]?.what);
    const done = str(as[i]?.done_when);
    over(`action ${i + 1} title`, title, PLAN_LIMITS.title);
    over(`action ${i + 1} what`, what, PLAN_LIMITS.what);
    over(`action ${i + 1} done_when`, done, PLAN_LIMITS.done_when);
    return { ...a, due_day: i === 0 ? shape.first_action_due_day : null, title, what, done_when: done };
  });
  return { plan: { frame, milestones, span_line: shape.span_line, actions }, problems };
}
