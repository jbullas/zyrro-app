// #169, briefs 169-plan and 169-plan-layers: the Plan for the path chosen in
// the Path conversation, in three layers. This week: concrete actions the
// model decides first and then estimates honestly. After that: a lighter
// outline up to the point where the user knows whether the path is a go.
// Milestones: the whole path, from "it's a go" to where it leads.
// Code owns no fixed count or effort; it checks bounds only (lengths, counts,
// this week's total against the user's hours band, a small first action), and
// shows the effort itself. The model's prose never states effort, days, weeks
// or dates, and never quotes the user. The last milestone's heading is code's.

import type { PathChoiceContent } from '@/lib/path-options';
import type { PathProfile } from '@/lib/path-profile';
import type { SummaryCard } from '@/lib/chat-choices';

// The fixed heading of the last milestone, the life the path leads to.
export const LAST_MILESTONE_HEADING = 'Where this leads';

// Lengths, checked in code (decision of 2026-11-09; after_that and the
// milestone's 300 from 169-plan-layers, 2026-11-12; milestone_title 2026-11-12).
export const PLAN_LIMITS = { frame: 300, milestone_title: 50, milestone: 300, after_that: 250, title: 60, what: 200, done_when: 150 } as const;

// Bounds, set from 15 generated Plans for five personas (approved 2026-11-12).
// No fixed count or effort: only what a sensible Plan stays within.
export const PLAN_BOUNDS = {
  actions: { min: 1, max: 7 },
  after_that: { min: 3, max: 8 },
  milestones: { min: 3, max: 7 },
  // Each action at least half an hour, in half hours; the first one small.
  effort_step: 0.5,
  first_action_max_hours: 2,
  // This week's total: at least this share of the band's lower end, at most
  // its upper end (or this, for the top band).
  week_total_min_share: 0.75,
  week_total_cap: 40,
} as const;

// The hours a week each band stands for, as a range. The lower bound of the
// top band is its stored hours; it has no upper bound.
const WEEK_HOURS: Record<string, { from: number; to: number | null }> = {
  under_3: { from: 1, to: 3 },
  '3_5': { from: 3, to: 5 },
  '6_10': { from: 6, to: 10 },
  '11_20': { from: 11, to: 20 },
  over_20: { from: 21, to: null },
};
const FALLBACK_BAND = 'under_3';

export type PlanShape = {
  hours_band: string;
  week_hours: { from: number; to: number | null };
};

/** What code knows before the model writes: the user's week, from their hours band. */
export function planShape(hoursBand: string | null | undefined): PlanShape {
  const band = hoursBand && WEEK_HOURS[hoursBand] ? hoursBand : FALLBACK_BAND;
  return { hours_band: band, week_hours: WEEK_HOURS[band] };
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
    hours_this_week: shape.week_hours,
  };
}

// due_day: only on Plans stored before the due date was dropped (2026-11-12);
// it is no longer computed, stored or shown.
export type PlanAction = { index: number; effort_hours: number; due_day?: number | null; title: string; what: string; done_when: string };

export type DraftPlan = {
  frame: string;
  // This week.
  actions: PlanAction[];
  after_that: string[];
  // A plain string is a milestone stored before milestones had titles: it
  // is shown as its description, without a title.
  milestones: Array<PlanMilestone | string>;
};

// title is null on the last milestone: code heads it (LAST_MILESTONE_HEADING).
export type PlanMilestone = { title: string | null; description: string };

/**
 * The milestones as shown: each one's title, the fixed heading on the last,
 * and plain-string milestones (stored before titles) with no title at all.
 */
export function milestoneRows(milestones: Array<PlanMilestone | string>): Array<{ title: string | null; description: string }> {
  return milestones.map((m, i) => {
    if (typeof m === 'string') return { title: null, description: m };
    const last = i === milestones.length - 1;
    return { title: last ? LAST_MILESTONE_HEADING : m.title || null, description: m.description };
  });
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/**
 * The model's three layers, with every length checked. Returns the plan
 * (code's index added) and the list of problems; the plan is null
 * when a layer is missing.
 */
export function parsePlan(parsed: Record<string, unknown> | null, shape: PlanShape): { plan: DraftPlan | null; problems: string[] } {
  const problems: string[] = [];
  const as = list(parsed?.this_week) as Array<Record<string, unknown>>;
  const at = list(parsed?.after_that);
  const ms = list(parsed?.milestones);
  if (!as.length) problems.push('no actions this week');
  if (!at.length) problems.push('no after-that steps');
  if (!ms.length) problems.push('no milestones');
  if (problems.length) return { plan: null, problems };
  const over = (label: string, text: string, max: number) => {
    if (!text) problems.push(`${label} empty`);
    else if (text.length > max) problems.push(`${label} ${text.length} chars (max ${max})`);
  };
  const frame = str(parsed?.frame);
  over('frame', frame, PLAN_LIMITS.frame);
  const texts = (items: unknown[], label: string, max: number) => items.map((m, i) => {
    const text = str(typeof m === 'string' ? m : (m as Record<string, unknown>)?.text);
    over(`${label} ${i + 1}`, text, max);
    return text;
  });
  const actions = as.map((a, i) => {
    const title = str(a?.title);
    const what = str(a?.what);
    const done = str(a?.done_when);
    const effort = Number(a?.effort_hours);
    over(`action ${i + 1} title`, title, PLAN_LIMITS.title);
    over(`action ${i + 1} what`, what, PLAN_LIMITS.what);
    over(`action ${i + 1} done_when`, done, PLAN_LIMITS.done_when);
    if (!Number.isFinite(effort) || effort <= 0) problems.push(`action ${i + 1} effort_hours missing`);
    else if (!Number.isInteger(effort / PLAN_BOUNDS.effort_step)) problems.push(`action ${i + 1} effort_hours ${effort} is not in half hours`);
    return { index: i + 1, effort_hours: effort, title, what, done_when: done };
  });
  const after_that = texts(at, 'after-that step', PLAN_LIMITS.after_that);
  // Every milestone but the last has a title; the last's heading is code's,
  // so any title the model gives it is dropped.
  const milestones: PlanMilestone[] = ms.map((m, i) => {
    const r = (m ?? {}) as Record<string, unknown>;
    const description = str(typeof m === 'string' ? m : r.description);
    over(`milestone ${i + 1} description`, description, PLAN_LIMITS.milestone);
    if (i === ms.length - 1) return { title: null, description };
    const title = str(r.title);
    over(`milestone ${i + 1} title`, title, PLAN_LIMITS.milestone_title);
    return { title, description };
  });
  problems.push(...boundProblems(actions, after_that.length, milestones.length, shape));
  return { plan: { frame, actions, after_that, milestones }, problems };
}

/** The bounds (PLAN_BOUNDS): counts, a small first action, and this week's total against the hours band. */
function boundProblems(actions: PlanAction[], afterThat: number, milestones: number, shape: PlanShape): string[] {
  const b = PLAN_BOUNDS;
  const problems: string[] = [];
  const count = (label: string, n: number, r: { min: number; max: number }) => {
    if (n < r.min || n > r.max) problems.push(`${n} ${label} (between ${r.min} and ${r.max})`);
  };
  count('actions this week', actions.length, b.actions);
  count('after-that steps', afterThat, b.after_that);
  count('milestones', milestones, b.milestones);
  const efforts = actions.map(a => a.effort_hours);
  if (!efforts.every(e => Number.isFinite(e) && e > 0)) return problems;
  if (efforts[0] > b.first_action_max_hours) problems.push(`the first action takes ${efforts[0]} hours (at most ${b.first_action_max_hours})`);
  const total = efforts.reduce((a, e) => a + e, 0);
  const min = shape.week_hours.from * b.week_total_min_share;
  const max = shape.week_hours.to ?? b.week_total_cap;
  if (total < min) problems.push(`this week's actions take ${total} hours in all (at least ${min} for their hours)`);
  if (total > max) problems.push(`this week's actions take ${total} hours in all (at most ${max} for their hours)`);
  return problems;
}

/** A stored Plan in this shape (Plans from before 169-plan-layers are not). */
export function isCurrentPlan(plan: unknown): plan is DraftPlan {
  const p = plan as Partial<DraftPlan> | null | undefined;
  return !!p && Array.isArray(p.actions) && Array.isArray(p.after_that) && Array.isArray(p.milestones);
}
