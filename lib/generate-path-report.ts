import { getChatCompletion } from '@/lib/llm';
import { PATH_REPORT_OUTLINE_PROMPT, PATH_REPORT_ELABORATION_PROMPT } from '@/lib/prompts/path-report';
import type { PrimarySignatureAnalysis } from '@/lib/artifact-schemas';
import { findMustAvoidViolations, type MustAvoidViolation } from '@/lib/generate-path-options-session';

// #134 Slice 3 — "Your Path" final delivery generation. New, standalone
// logic — does NOT call or adapt runStage5Develop/runStage6Report or their
// prompts (lib/generate-path-checkpoint.ts, lib/prompts/path-checkpoint.ts).
// Those expect a richer per-signature evidence_citation/desire_citation/
// grounded_in shape the old Stage 1-4 capability/desire-intersection
// pipeline produced; Direction/Options don't produce that shape (see this
// session's own scoping pass), so bridging into it would mean fabricating
// citation structure the new flow never actually computed. This module
// works directly from what Direction/Options/identity_report really have.
//
// Must-avoid check: reused from lib/generate-path-options-session.ts
// (findMustAvoidViolations — the negation-aware phrase-presence check
// built and validated against real output in Slice 2), not reimplemented.
//
// No material-difference check here, and no over-generate/filter batch
// control flow — that machinery exists in Slice 2 because Options
// generates several independent candidates that must differ from each
// other. This module generates exactly one holistic report; there is
// nothing to compare it against and no "batch" to filter. Control flow:
// generate once, check every text field, one retry with a steer if a
// violation is found. #144-reopened relaxed the final step from a
// hard-fail to log-only — see generatePathReport's own comment for why.
//
// #145 — strategic_decisions was consistently landing at exactly 2 for
// genuinely open-ended paths. A real generation diagnostic ruled out token
// truncation as the cause (finish_reason "stop," well under the 4000
// ceiling every time) — the actual cause was the prompt's own old "could
// be 2, could be 5" framing anchoring toward the floor.
//
// requestReportDraft below is two real LLM calls, not one — an outline
// call (requestOutlineDraft, enumeration only) followed by an elaboration
// call (requestElaboration, full depth on the fixed list the outline
// produced). A single-call version with the same corrected breadth/
// distinctness language was also built and measured for real against this
// one: 9+ attempts each, across all three test personas (Product Scout —
// the persona that surfaced the original complaint —, #139's non-venture
// Internal Systems Lead, and the committed test script's own persona).
// Single-call reliably hit exactly 3 decisions every time (9/9, zero
// variance) — a real fix over the 2-decision baseline, but never above the
// floor of the "3-5 typical" target. Two calls consistently landed higher:
// 4/4/5, 4/4/4, and 4 on the same three personas. Kept two calls for that
// measured reason: this section is what the Mentor CTA sells, and the
// extra ~20s and second API call were judged worth it for results
// comfortably above the floor rather than just at it. See
// lib/prompts/path-report.ts's own header comment for the same history.
// generatePathReport's own control flow (one attempt, one steer-and-retry
// on a must-avoid touch) didn't need to change for any of this — it calls
// requestReportDraft exactly as before, unaware that each "attempt" is now
// two real calls under the hood, not one.
//
// #139 — full content-design rebuild (docs/briefs/139-path-report-redesign.md).
// Confirmed cut: `honest_cost` — its job (naming a real trade-off) is
// absorbed into life_it_leads_toward's friction-as-trade-off beat, not
// replaced by anything else. `thesis` is also removed from this module's
// generated fields entirely — the report's thesis line is now
// chosen_candidate.core_statement, carried straight through from the
// Options candidate the user already picked, never regenerated (the whole
// point: Options already produced a real, hard-checked core_statement for
// this exact candidate; asking this prompt to write a new one risks
// drifting from what the user actually selected). `master_strategy`
// (OutlineObjective[]) is replaced by `strategic_decisions`
// (StrategicDecision[]) — a list of open decisions, not a sequenced task
// list. This is a structural fix, not a prompt-language one: a list of
// decisions has no inherent chronology, so there's no cross-item sequencing
// to get wrong the way master_strategy's per-step timeframes used to.
//
// Two checks carried over unchanged from the pre-#139 version (still
// relevant, no schema-shape dependency): logPlaceholderBracketsInReport
// (log-only backstop for literal "[timeframe]"-style leftover template
// text) and enforceLifeLeadsTowardNonOverlap (strips any sentence in
// life_it_leads_toward that echoes ideal_life rather than developing it).
// Two checks added for #139's new content requirements (see their own
// comments below): logTrajectoryLanguageInSummary (Summary's own stated
// boundary — no future-scale/reputation speculation, that's What This
// Could Be's job) and logResearchClaimsInStrategicDecisions (no confident
// claims about a real market/competitor/industry — nothing here has been
// looked up). One more added for #144 (docs/briefs/144-path-report-live-
// review-fixes.md): logEmDashesInReport, an exact-match backstop for the
// prompt's own new "no em dashes, anywhere" rule. One more added when #144
// reopened (see must_avoids handling below): logHedgeWordsInReport, an
// exact-match backstop for hedged must-avoid exclusion claims.

// #144: was string[] (bare short labels, rendered as flat chips) — "only
// pills are pretty but useless" per live review. Each option now carries a
// short label plus real context, rendered as its own labeled sub-section
// rather than a ChipRow pill (see PathReportFlow.tsx).
export interface LiveOption {
  option: string;
  context: string;
}

export interface StrategicDecision {
  decision: string;
  why_it_matters: string;
  live_options: LiveOption[];
}

// #145: step 1's own output shape for a decision, before elaboration —
// enumeration only, no depth yet. Exported for fixture-testability, same
// precedent as StrategicDecision/LiveOption.
export interface DecisionOutlineEntry {
  decision: string;
  rationale: string;
}

export interface PathReportGenerationContext {
  chosen_candidate: { name: string; description: string; core_statement: string };
  comments: string;
  must_haves: string[];
  must_avoids: string[];
  ideal_life: string;
  primary_constellation: PrimarySignatureAnalysis[];
  energisers: string[];
  friction_points: string[];
}

// The LLM-generated fields only — chosen_candidate/comments/project_name
// (the rest of path_report's persisted content, per the confirmed schema)
// aren't generated here, they're attached by the caller from data it
// already has.
export interface PathReportDraft {
  summary: string;
  what_this_could_be: string;
  why_it_fits: string;
  life_it_leads_toward: string;
  strategic_decisions: StrategicDecision[];
}

// #145: internal-only shapes for the two-step generation pipeline (see this
// file's own header comment) — never exposed outside requestReportDraft.
// ReportOutlineDraft is step 1's raw output; ElaborationDraft is step 2's.
// Assembly combines them into the same public PathReportDraft above, so
// nothing outside this function needs to know generation is two calls.
interface ReportOutlineDraft {
  summary: string;
  what_this_could_be: string;
  why_it_fits: string;
  life_it_leads_toward: string;
  decision_outline: DecisionOutlineEntry[];
}

interface ElaborationDraft {
  strategic_decisions: StrategicDecision[];
}

export type PathReportStatus = 'generating' | 'ready' | 'failed';

// The full persisted content shape — PathReportDraft's generated fields
// plus the fields attached by the caller (chosen_candidate/comments,
// snapshotted from path_options_session at generation time; project_name,
// absent until the user is asked, set to a real string on a genuine pick
// or explicit null on skip). Lives here rather than a dedicated
// lib/path-report.ts module — this artifact's Tier C CRUD is simple enough
// (no state machine beyond a single failed-row-resume case) to live inline
// in app/api/path-report/route.ts, so this file is the natural home for
// its TS shape, the same way PathReportDraft already is for the generated
// subset of it.
export interface PathReportContent extends PathReportDraft {
  chosen_candidate: { id: string; name: string; description: string; core_statement: string };
  comments: string;
  // #144: cover-context-line fields, same pattern as /identity's own cover
  // (`{cover.prepared_for} · {cover.identity_context}`). Both already exist
  // on identityReport.cover, already loaded in app/api/path-report/route.ts
  // — attached here by the route from that existing data, not generated by
  // this prompt.
  prepared_for: string;
  identity_context: string;
  project_name?: string | null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidLiveOptions(v: unknown): v is LiveOption[] {
  return (
    Array.isArray(v) && v.length >= 2 && v.length <= 4 &&
    v.every(o => !!o && typeof o === 'object' && isNonEmptyString(o.option) && isNonEmptyString(o.context))
  );
}

function isValidStrategicDecision(sd: unknown): sd is StrategicDecision {
  return (
    !!sd && typeof sd === 'object' &&
    isNonEmptyString((sd as StrategicDecision).decision) &&
    isNonEmptyString((sd as StrategicDecision).why_it_matters) &&
    isValidLiveOptions((sd as StrategicDecision).live_options)
  );
}

function validatePathReportDraft(data: unknown): data is PathReportDraft {
  const d = data as PathReportDraft | null;
  if (!d || typeof d !== 'object') return false;

  const requiredStrings: (keyof PathReportDraft)[] = [
    'summary', 'what_this_could_be', 'why_it_fits', 'life_it_leads_toward',
  ];
  if (!requiredStrings.every(k => isNonEmptyString(d[k]))) return false;

  if (!Array.isArray(d.strategic_decisions) || d.strategic_decisions.length === 0) return false;
  return d.strategic_decisions.every(isValidStrategicDecision);
}

// #145 — step 1's own raw-output validation: everything except decision
// depth (the enumeration only). No upper/lower bound enforced on
// decision_outline's length here beyond non-empty — the prompt's own
// breadth instruction (3-5 typical) is a content-quality target, not a
// schema constraint; hard-blocking generation on a count the prompt itself
// only asks for, not requires, would trade a content problem for an outage.
function validateOutlineDraft(data: unknown): data is ReportOutlineDraft {
  const d = data as ReportOutlineDraft | null;
  if (!d || typeof d !== 'object') return false;

  const requiredStrings: (keyof ReportOutlineDraft)[] = [
    'summary', 'what_this_could_be', 'why_it_fits', 'life_it_leads_toward',
  ];
  if (!requiredStrings.every(k => isNonEmptyString(d[k]))) return false;

  if (!Array.isArray(d.decision_outline) || d.decision_outline.length === 0) return false;
  return d.decision_outline.every(e =>
    !!e && typeof e === 'object' && isNonEmptyString(e.decision) && isNonEmptyString(e.rationale),
  );
}

// #145 — step 2's own raw-output validation. expectedCount is a hard check
// (not just non-empty): a count mismatch against the outline means a
// decision was genuinely dropped or added, which assembly can't safely
// paper over the way it can a minor wording drift in the echoed decision
// text (see requestReportDraft's own comment).
function validateElaborationDraft(data: unknown, expectedCount: number): data is ElaborationDraft {
  const d = data as ElaborationDraft | null;
  if (!d || typeof d !== 'object') return false;
  if (!Array.isArray(d.strategic_decisions) || d.strategic_decisions.length !== expectedCount) return false;
  return d.strategic_decisions.every(isValidStrategicDecision);
}

// ── Placeholder-bracket check (log-only) ────────────────────────────────

const PLACEHOLDER_BRACKET_PATTERN = /\[[^\]]{1,60}\]/;

/**
 * Scans every text field for literal bracket-placeholder text (e.g.
 * "[specific date]") a model can leave behind when it treats a prompt's own
 * illustrative example as syntax to reproduce rather than a pattern to
 * follow. Log-only — see this file's header for why this doesn't block
 * generation the way the must-avoid check does.
 */
function logPlaceholderBracketsInReport(draft: PathReportDraft): void {
  const fields: Array<[string, string]> = [
    ['summary', draft.summary],
    ['what_this_could_be', draft.what_this_could_be],
    ['why_it_fits', draft.why_it_fits],
    ['life_it_leads_toward', draft.life_it_leads_toward],
    ...draft.strategic_decisions.flatMap((sd, i): Array<[string, string]> => [
      [`strategic_decisions[${i}].decision`, sd.decision],
      [`strategic_decisions[${i}].why_it_matters`, sd.why_it_matters],
      ...sd.live_options.flatMap((o, j): Array<[string, string]> => [
        [`strategic_decisions[${i}].live_options[${j}].option`, o.option],
        [`strategic_decisions[${i}].live_options[${j}].context`, o.context],
      ]),
    ]),
  ];

  const flagged = fields.filter(([, text]) => PLACEHOLDER_BRACKET_PATTERN.test(text));
  if (flagged.length > 0) {
    console.warn(
      'path_report: literal placeholder-bracket text found in generated output:',
      flagged.map(([label, text]) => `${label}: "${text.match(PLACEHOLDER_BRACKET_PATTERN)?.[0]}" in "${text}"`).join(' | '),
    );
  }
}

// ── life_it_leads_toward / ideal_life overlap check (strip when safe) ──

// Same family and same threshold as CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS
// (lib/generate-identity-report.ts) — analogous corpus shape (a short input
// reference text vs. a several-sentence generated field), not the longer
// MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS threshold from
// lib/generate-path-options-session.ts, which was calibrated for much
// longer option-description-vs-option-description comparisons.
const LIFE_IDEAL_MIN_OVERLAP_WORDS = 4;

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function hasOverlappingPhrase(a: string[], b: string[], minWords: number): boolean {
  if (a.length < minWords || b.length < minWords) return false;
  for (let i = 0; i <= a.length - minWords; i++) {
    const window = a.slice(i, i + minWords).join(' ');
    for (let j = 0; j <= b.length - minWords; j++) {
      if (b.slice(j, j + minWords).join(' ') === window) return true;
    }
  }
  return false;
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (matches) return matches.map(s => s.trim()).filter(Boolean);
  return text.trim() ? [text.trim()] : [];
}

/**
 * Strips any sentence in life_it_leads_toward that shares a 4+-word run
 * with ideal_life — same remedy as enforceConstellationSynthesisNonOverlap:
 * there's no deterministic way to turn a restatement into new content, only
 * to remove it. Unlike that function, this one will NOT empty the field
 * entirely even if every sentence overlaps — life_it_leads_toward is a
 * required non-empty field per validatePathReportDraft, and leaving it
 * empty would fail validation and burn the one retry on a much lower-
 * stakes issue than a must-avoid violation. In that rare case, logs a
 * warning and leaves the text untouched instead.
 */
function enforceLifeLeadsTowardNonOverlap(draft: PathReportDraft, idealLife: string): void {
  if (!idealLife || !idealLife.trim()) return;

  const idealLifeWords = normalizeWords(idealLife);
  if (idealLifeWords.length < LIFE_IDEAL_MIN_OVERLAP_WORDS) return;

  const sentences = splitSentences(draft.life_it_leads_toward);
  if (sentences.length === 0) return;

  const kept = sentences.filter(
    sentence => !hasOverlappingPhrase(normalizeWords(sentence), idealLifeWords, LIFE_IDEAL_MIN_OVERLAP_WORDS),
  );

  if (kept.length === sentences.length) return;

  if (kept.length === 0) {
    console.warn(
      `path_report: every sentence in life_it_leads_toward overlapped ideal_life by ${LIFE_IDEAL_MIN_OVERLAP_WORDS}+ words — ` +
      `left untouched rather than emptying a required field. ideal_life="${idealLife}" life_it_leads_toward="${draft.life_it_leads_toward}"`,
    );
    return;
  }

  draft.life_it_leads_toward = kept.join(' ');
}

// ── Summary trajectory-language check (log-only) ────────────────────────

// #139: Summary's own hard boundary is "never speculate about future
// scale, reputation, or trajectory" — that's What This Could Be's job
// entirely. Deliberately log-only, not a retry trigger: this is a register/
// scope violation the same family as a genericness slip, not a trust/
// compliance issue like a must-avoid touch, and the phrase list below is a
// heuristic (a real sentence can legitimately contain one of these words in
// a present-tense, non-speculative sense) — a false positive shouldn't burn
// the one retry this module has.
const TRAJECTORY_LANGUAGE_PATTERN =
  /\b(eventually|one day|over time|in a few years|down the line|down the road|becomes known for|reputation for|grows into|scales? (up|into)|expand(s|ing)? (into|to)|someday)\b/i;

function logTrajectoryLanguageInSummary(draft: PathReportDraft): void {
  if (TRAJECTORY_LANGUAGE_PATTERN.test(draft.summary)) {
    console.warn(
      `path_report: summary contains trajectory/scale-shaped language, which is What This Could Be's job, ` +
      `not Summary's: "${draft.summary}"`,
    );
  }
}

// ── Strategic Decisions research-claim check (log-only) ─────────────────

// #139: "No web search, no research claims" is a hard content rule per the
// brief — the model hasn't looked anything up, so nothing here should read
// as confirmed fact about a real market/competitor/industry. Log-only for
// the same reason as logTrajectoryLanguageInSummary: a phrase heuristic
// over prose that legitimately discusses markets and competition as
// directions to investigate (the section's actual job) will have false
// positives, so this is a backstop to catch a real slip, not a retry
// trigger that could burn the one retry on a borderline phrasing.
const RESEARCH_CLAIM_PATTERN =
  /\b(studies show|research shows|data shows|the market (is|has)|demand (is|has) (high|growing|increasing)|competitors (are|have)|industry (data|reports|trends) show|according to)\b/i;

function logResearchClaimsInStrategicDecisions(draft: PathReportDraft): void {
  const flagged = draft.strategic_decisions.filter(
    sd => RESEARCH_CLAIM_PATTERN.test(sd.why_it_matters) ||
      sd.live_options.some(o => RESEARCH_CLAIM_PATTERN.test(o.option) || RESEARCH_CLAIM_PATTERN.test(o.context)),
  );
  if (flagged.length > 0) {
    console.warn(
      'path_report: strategic_decisions contains language shaped like a confident real-world research claim ' +
      '(the model has not looked anything up):',
      flagged.map(sd => sd.decision).join(', '),
    );
  }
}

// ── Em dash check (log-only) ────────────────────────────────────────────

// #144: "no em dashes, anywhere" is a hard style rule per live review —
// unlike the heuristic phrase checks above, this one is a trivial exact
// character scan with no false-positive risk, so it's a reliable signal on
// whether the prompt's own instruction is actually holding in production.
// Still log-only, not a retry trigger: a stray em dash is a polish issue,
// not a trust/compliance one, same severity class as
// logPlaceholderBracketsInReport.
function logEmDashesInReport(draft: PathReportDraft): void {
  const fields: Array<[string, string]> = [
    ['summary', draft.summary],
    ['what_this_could_be', draft.what_this_could_be],
    ['why_it_fits', draft.why_it_fits],
    ['life_it_leads_toward', draft.life_it_leads_toward],
    ...draft.strategic_decisions.flatMap((sd, i): Array<[string, string]> => [
      [`strategic_decisions[${i}].decision`, sd.decision],
      [`strategic_decisions[${i}].why_it_matters`, sd.why_it_matters],
      ...sd.live_options.flatMap((o, j): Array<[string, string]> => [
        [`strategic_decisions[${i}].live_options[${j}].option`, o.option],
        [`strategic_decisions[${i}].live_options[${j}].context`, o.context],
      ]),
    ]),
  ];

  const flagged = fields.filter(([, text]) => text.includes('—'));
  if (flagged.length > 0) {
    console.warn(
      'path_report: em dash found in generated output despite the prompt\'s explicit ban:',
      flagged.map(([label]) => label).join(', '),
    );
  }
}

// ── Hedge word check (log-only) ──────────────────────────────────────────

// #144-reopened: added after an adversarial live test (a deliberately-
// hedging steer injected directly, bypassing the normal control flow) found
// the prompt's own SELF-CHECK item 10 does not reliably override a hedge
// once something is actively pushing the model toward writing one — 0/3
// adversarial attempts got corrected. Known, accepted limitation, not
// chased further: the self-check catches accidental drift, not deliberate
// adversarial steering, and nothing in this module's own real production
// steer text (see generatePathReport below) attempts the latter — every
// non-adversarial real generation this session stayed clean. Reworking the
// self-check's own wording to defeat a deliberately adversarial input is
// the same dead end this project has already hit chasing phrase-level
// prompt tuning against a determined counter-example; this log-only regex
// is the honest backstop instead — same posture as logEmDashesInReport
// (exact match, no false-positive risk, a reliable production signal, not
// a retry trigger).
const HEDGE_WORDS_PATTERN = /\b(rarely|mostly|occasionally|occasional|for the most part|to some degree|somewhat|largely|usually)\b/i;

function logHedgeWordsInReport(draft: PathReportDraft): void {
  const fields: Array<[string, string]> = [
    ['summary', draft.summary],
    ['what_this_could_be', draft.what_this_could_be],
    ['why_it_fits', draft.why_it_fits],
    ['life_it_leads_toward', draft.life_it_leads_toward],
    ...draft.strategic_decisions.flatMap((sd, i): Array<[string, string]> => [
      [`strategic_decisions[${i}].decision`, sd.decision],
      [`strategic_decisions[${i}].why_it_matters`, sd.why_it_matters],
      ...sd.live_options.flatMap((o, j): Array<[string, string]> => [
        [`strategic_decisions[${i}].live_options[${j}].option`, o.option],
        [`strategic_decisions[${i}].live_options[${j}].context`, o.context],
      ]),
    ]),
  ];

  const flagged = fields.filter(([, text]) => HEDGE_WORDS_PATTERN.test(text));
  if (flagged.length > 0) {
    console.warn(
      'path_report: hedge word found in generated output (may be softening a must-avoid exclusion claim rather ' +
      'than stating it cleanly, per the prompt\'s own must_avoids instruction):',
      flagged.map(([label, text]) => `${label}: "${text.match(HEDGE_WORDS_PATTERN)?.[0]}"`).join(', '),
    );
  }
}

// #145 — step 1: enumeration only, no decision depth yet. See this file's
// own header comment for why this is a separate call from elaboration.
async function requestOutlineDraft(
  context: PathReportGenerationContext,
  steer: string | undefined,
): Promise<ReportOutlineDraft> {
  const payload = {
    chosen_candidate: context.chosen_candidate,
    comments: context.comments,
    must_haves: context.must_haves,
    must_avoids: context.must_avoids,
    ideal_life: context.ideal_life,
    primary_constellation: context.primary_constellation,
    energisers: context.energisers,
    friction_points: context.friction_points,
    ...(steer ? { steer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PATH_REPORT_OUTLINE_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    // Well above what real generation needs (a real run: ~600-900 tokens
    // for the four prose fields plus a lean 3-5-entry outline) — cost
    // isn't the constraint here (brief #145), this ceiling just needs to
    // never be the thing limiting breadth.
    max_tokens: 3000,
    temperature: 0.4,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateOutlineDraft(parsed)) {
    throw new Error('Path report outline generation failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}

// #145 — step 2: full depth (why_it_matters + live_options) for every
// decision in decisionOutline, in one call. The decision list itself is
// fixed by this point — decisionOutline is the source of truth for count
// and order, not something this call can change.
async function requestElaboration(
  context: PathReportGenerationContext,
  decisionOutline: DecisionOutlineEntry[],
  steer: string | undefined,
): Promise<ElaborationDraft> {
  const payload = {
    chosen_candidate: context.chosen_candidate,
    comments: context.comments,
    must_haves: context.must_haves,
    must_avoids: context.must_avoids,
    ideal_life: context.ideal_life,
    primary_constellation: context.primary_constellation,
    energisers: context.energisers,
    friction_points: context.friction_points,
    decision_outline: decisionOutline,
    ...(steer ? { steer } : {}),
  };

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PATH_REPORT_ELABORATION_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    // Generous on purpose (brief #145: "more tokens... explicitly fine
    // here") — up to 5 decisions x (80-140 word why_it_matters + up to 4
    // live_options with real context each) is real content, and this
    // section is the one the CTA is actually selling.
    max_tokens: 6000,
    temperature: 0.4,
  });

  const parsed = JSON.parse(content ?? '{}');
  if (!validateElaborationDraft(parsed, decisionOutline.length)) {
    throw new Error('Path report elaboration failed validation: ' + JSON.stringify(parsed).slice(0, 500));
  }
  return parsed;
}

async function requestReportDraft(
  context: PathReportGenerationContext,
  steer: string | undefined,
): Promise<PathReportDraft> {
  const outline = await requestOutlineDraft(context, steer);
  const elaboration = await requestElaboration(context, outline.decision_outline, steer);

  // Assembly: decision text is authoritative from the outline, matched by
  // array position — not trusted from elaboration's own echoed "decision"
  // field, even though the elaboration prompt asks for it verbatim. This
  // means a minor wording drift in the echo can never corrupt the
  // persisted report; only a genuine count mismatch (already hard-failed
  // by validateElaborationDraft above) is a real problem. Still logged
  // (informational) when the echo drifts, since real drift despite a
  // matching count would be a sign something else is off.
  elaboration.strategic_decisions.forEach((sd, i) => {
    const outlineText = outline.decision_outline[i].decision;
    if (sd.decision.trim().toLowerCase() !== outlineText.trim().toLowerCase()) {
      console.warn(
        `path_report: elaboration echoed a different decision text at position ${i} than the outline gave it ` +
        `(using the outline's own text for the persisted report either way): outline="${outlineText}" elaboration="${sd.decision}"`,
      );
    }
  });

  const draft: PathReportDraft = {
    summary: outline.summary,
    what_this_could_be: outline.what_this_could_be,
    why_it_fits: outline.why_it_fits,
    life_it_leads_toward: outline.life_it_leads_toward,
    strategic_decisions: elaboration.strategic_decisions.map((sd, i) => ({
      decision: outline.decision_outline[i].decision,
      why_it_matters: sd.why_it_matters,
      live_options: sd.live_options,
    })),
  };

  if (!validatePathReportDraft(draft)) {
    throw new Error('Assembled path report draft failed validation: ' + JSON.stringify(draft).slice(0, 500));
  }

  // One pass over the fully assembled draft, same as before the split —
  // no architecture change needed for these (brief #145's own "Assembly"
  // instruction).
  logPlaceholderBracketsInReport(draft);
  enforceLifeLeadsTowardNonOverlap(draft, context.ideal_life);
  logTrajectoryLanguageInSummary(draft);
  logResearchClaimsInStrategicDecisions(draft);
  logEmDashesInReport(draft);
  logHedgeWordsInReport(draft);

  return draft;
}

/**
 * Scans every text field of a draft — including each strategic_decisions
 * entry's decision/why_it_matters/live_options[], not just the top-level
 * prose fields — for must-avoid violations. Deduplicates by must_avoid
 * string so a phrase touched in two different fields is only reported once.
 * Exported (not kept private) so it's directly fixture-testable without a
 * real LLM call, same precedent as lib/generate-path-options-session.ts's
 * own findMustAvoidViolations/findMaterialDuplicates.
 */
export function findMustAvoidViolationsInReport(draft: PathReportDraft, mustAvoids: string[]): MustAvoidViolation[] {
  const fields = [
    draft.summary,
    draft.what_this_could_be,
    draft.why_it_fits,
    draft.life_it_leads_toward,
    ...draft.strategic_decisions.flatMap(sd => [
      sd.decision, sd.why_it_matters,
      ...sd.live_options.flatMap(o => [o.option, o.context]),
    ]),
  ];

  const seen = new Set<string>();
  const violations: MustAvoidViolation[] = [];
  for (const field of fields) {
    for (const violation of findMustAvoidViolations(field, mustAvoids)) {
      if (!seen.has(violation.must_avoid)) {
        seen.add(violation.must_avoid);
        violations.push(violation);
      }
    }
  }
  return violations;
}

export class PathReportGenerationViolationError extends Error {
  constructor(public readonly violations: MustAvoidViolation[]) {
    super(`Generated report still touched must-avoid(s) after one retry: ${violations.map(v => v.must_avoid).join(', ')}`);
    this.name = 'PathReportGenerationViolationError';
  }
}

/**
 * Generates the final path report — one attempt, then one bounded retry
 * (with the violated must-avoids fed back as steering context) if the
 * first attempt touches any.
 *
 * #144-reopened: the final step used to hard-fail (throw
 * PathReportGenerationViolationError) if violations remained after the
 * retry. Relaxed to log-only — findMustAvoidViolations is a negation-aware
 * phrase match, but it can't distinguish a genuine violation from a
 * confident, deliberate claim that this path avoids a must_avoid using the
 * must_avoid's own wording, a pattern the prompt now explicitly encourages
 * (see lib/prompts/path-report.ts's own must_avoids instruction). The
 * prompt's own hedge-detection self-check (item 10) is the real defense
 * against genuine violations now; this mechanical check is a monitoring
 * backstop, not a gate, until something that can actually tell the two
 * apart exists. The retry-with-steer step itself stays — still useful for
 * a genuine violation — but its steer text was reworded (below) so it no
 * longer tells the model to strip out a mention that might be a fine,
 * confident exclusion claim; the old wording assumed any phrase match was
 * bad, which is no longer true.
 */
export async function generatePathReport(context: PathReportGenerationContext): Promise<PathReportDraft> {
  let draft = await requestReportDraft(context, undefined);
  let violations = findMustAvoidViolationsInReport(draft, context.must_avoids);

  if (violations.length > 0) {
    const steer =
      `The previous attempt included phrase(s) matching these must-avoid(s): ` +
      `${violations.map(v => v.must_avoid).join(', ')}. Review each one: if the path genuinely involves or ` +
      `recommends it, revise that out entirely. If you were confidently stating the path avoids it, that's fine ` +
      `and can stay, even in its own wording, but make sure the claim reads clean and unhedged, not softened with ` +
      `words like "rarely," "mostly," or "to some degree."`;
    draft = await requestReportDraft(context, steer);
    violations = findMustAvoidViolationsInReport(draft, context.must_avoids);
  }

  if (violations.length > 0) {
    console.warn(
      `path_report: must-avoid-shaped phrase(s) still present after one retry (log-only, not a hard-fail — see ` +
      `#144-reopened: the phrase match can't distinguish a genuine violation from a confident, correct exclusion ` +
      `claim): ${violations.map(v => v.must_avoid).join(', ')}`,
    );
  }

  return draft;
}
