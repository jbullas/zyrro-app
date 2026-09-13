/**
 * #134 Slice 3 / #139 — script test for "Your Path" final delivery
 * generation (lib/generate-path-report.ts). Same discipline as
 * scripts/test-134-slice2-options-checks.mts: Part 1 is pure fixture
 * assertions (deterministic, no network) against
 * findMustAvoidViolationsInReport; Part 2 makes a real LLM call against
 * realistic Direction+Options+identity_report inputs and asserts on real
 * output shape, printing the full generated content for review.
 *
 * #139 rewrote this file's schema throughout — thesis/what_it_is/
 * honest_cost/master_strategy are gone; summary/what_this_could_be/
 * why_it_fits(now 2 paragraphs)/life_it_leads_toward/strategic_decisions
 * replace them. See docs/briefs/139-path-report-redesign.md (already
 * deleted by the time this comment is read, per the session-end brief-
 * deletion protocol — this file's own git history is the record).
 *
 * Run: npx tsx --env-file=.env.local scripts/test-134-slice3-report-checks.mts
 */
import {
  generatePathReport,
  findMustAvoidViolationsInReport,
  type PathReportGenerationContext,
  type PathReportDraft,
} from '../lib/generate-path-report';

let failures = 0;
function assertTrue(cond: boolean, msg: string) {
  if (cond) console.log(`PASS: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failures++; }
}
function section(title: string) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

// ─────────────────────────────────────────────────────────────────────────
section('PART 1 — findMustAvoidViolationsInReport: fixture assertions (no network)');
// ─────────────────────────────────────────────────────────────────────────

const MUST_AVOIDS = ['Ambiguous requirements', 'Micromanagement'];

function cleanDraft(): PathReportDraft {
  return {
    summary:
      'This path means leaving full-time employment to work independently, taking on a small number of clients ' +
      'at a time and owning the full scope of each engagement — from diagnosing the real problem to shipping the fix.',
    what_this_could_be:
      'Over time this could stay a solo practice built entirely around your own reputation, or grow into a small ' +
      'studio where you bring in one or two other people for larger engagements — which shape it takes is still open.',
    why_it_fits:
      'You have already shown you can see the structure beneath a messy situation and finish what you start, ' +
      'even after collaborators drop off.\n\n' +
      'What actually draws you here is the clear scope and deep focus a solo engagement offers, rather than the ' +
      'fragmented attention of a full-time role split across many priorities — the overlap between what you can ' +
      'do and what you want is exactly this: sustained ownership of one hard problem at a time.',
    life_it_leads_toward:
      'A working week built around one or two deep engagements at a time, with long, uninterrupted blocks for the ' +
      'actual problem-solving work. The focus and autonomy you need to do your best thinking show up daily, since ' +
      'you set engagement boundaries before work begins rather than inheriting someone else’s. The real trade-off ' +
      'is income unpredictability in slow months, since there is no steady paycheck absorbing the gap between ' +
      'engagements the way employment did.',
    strategic_decisions: [
      {
        decision: 'How this actually reaches its first clients',
        why_it_matters: 'Without a first real engagement, everything else here is theoretical.',
        live_options: [
          'Referral-only through your existing network',
          'A visible body of writing that pulls inbound interest',
          'Direct outreach to a short, named list of target companies',
        ],
      },
      {
        decision: 'How much of the business side you handle yourself',
        why_it_matters: 'Admin and business development compete directly with billable hours in the early months.',
        live_options: [
          'Handle everything yourself at first',
          'Hire a part-time bookkeeper once there are 2+ clients',
        ],
      },
    ],
  };
}

{
  const clean = cleanDraft();
  const violations = findMustAvoidViolationsInReport(clean, MUST_AVOIDS);
  assertTrue(violations.length === 0, 'a clean draft (no field touches any must-avoid) produces zero violations');
}

{
  const draft = cleanDraft();
  draft.life_it_leads_toward =
    'The hardest part is the ambiguous requirements you will face early on, before a client relationship is established.';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.some(v => v.must_avoid === 'Ambiguous requirements'),
    'a violation in a top-level field (life_it_leads_toward) is detected',
  );
}

{
  const draft = cleanDraft();
  draft.strategic_decisions[1].why_it_matters =
    'Avoid slipping into micromanagement of your own future subcontractors once the workload grows.';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.length === 0,
    'a negated mention inside a strategic_decisions entry\'s why_it_matters ("avoid... micromanagement") is correctly NOT flagged',
  );
}

{
  const draft = cleanDraft();
  draft.strategic_decisions[0].live_options[0] = 'Tolerate real micromanagement from early clients while you establish trust';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.some(v => v.must_avoid === 'Micromanagement'),
    'a genuine (non-negated) violation nested inside strategic_decisions[i].live_options is detected — proves the field-flattening actually reaches into the array, not just the top-level prose fields',
  );
}

{
  const draft = cleanDraft();
  draft.why_it_fits += ' This path also structurally avoids ambiguous requirements from day one.';
  draft.life_it_leads_toward += ' A life with no ambiguous requirements clouding your work.';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.length === 0,
    'a must-avoid mentioned in a negated/avoidance frame across two different fields is correctly not flagged in either',
  );
}

// ─────────────────────────────────────────────────────────────────────────
section('PART 2 — real LLM call, realistic Direction+Options+identity_report context (network)');
// ─────────────────────────────────────────────────────────────────────────

// Same context family already validated in scripts/test-134-slice2-options-checks.mts
// this session, plus the chosen-candidate/comments layer Options itself adds,
// plus #139's new core_statement/energisers/friction_points inputs.
const REALISTIC_CONTEXT: PathReportGenerationContext = {
  chosen_candidate: {
    name: 'Independent Systems Consultant',
    description:
      'This path means leaving full-time employment to work independently as a systems consultant, taking on a ' +
      'small number of client engagements at a time with full ownership over scope, timeline, and approach. It ' +
      'differs from staying employed by trading organizational stability for direct control over which problems ' +
      'you take on and how much time you spend on each. It meets your need for clear scope by letting you define ' +
      'engagement boundaries yourself before work begins, and gives you the deep, uninterrupted focus time that a ' +
      'full-time role split across competing priorities rarely allows. It requires building a client pipeline from ' +
      'nothing and handling the business side yourself in the early months.',
    core_statement: 'You trade organizational stability for direct control over which hard problems you solve, and how.',
  },
  comments: 'Please keep the first milestone realistic — I only have evenings free for this right now.',
  must_haves: ['Clear scope', 'Deep focus time', 'Solving hard problems'],
  must_avoids: ['Ambiguous requirements', 'Micromanagement'],
  ideal_life:
    'Running a small, focused team that ships things people actually use, with real ownership over the outcome.',
  primary_constellation: [
    {
      signature_number: '01',
      name: 'The Systems Architect',
      domain: 'Thinking',
      score: 24,
      confidence: 'High',
      core_statement: 'You see the structure beneath a problem before anyone else names it.',
      evidence_analysis:
        'Across multiple discovery answers you described redesigning how a team worked, not just what it produced — ' +
        'restructuring a broken intake process at a prior job, then again reorganizing how a side project split its work.',
      tension: 'This strength can tip into over-engineering a problem that needed a quick, ugly fix.',
    },
    {
      signature_number: '02',
      name: 'The Quiet Closer',
      domain: 'Driving',
      score: 21,
      confidence: 'High',
      core_statement: 'You finish what other people abandon once the interesting part is over.',
      evidence_analysis:
        'You described shipping a project solo after two collaborators dropped off, and separately finishing a certification ' +
        'program years after everyone else in your cohort had quit.',
      tension: 'You can stay in a finishing role too long, past the point where you should have handed it off.',
    },
  ],
  energisers: [
    'Deep, uninterrupted focus time', 'Owning a problem end to end', 'Clear, well-scoped work',
    'Solving genuinely hard problems', 'Working with people who trust your judgment', 'Seeing a fix actually ship',
  ],
  friction_points: [
    'Ambiguous, shifting requirements', 'Being second-guessed on decisions already made', 'Constant context-switching',
    'Work with no clear owner', 'Long approval chains', 'Having to defend obvious decisions repeatedly',
  ],
};

async function runRealGeneration() {
  const report = await generatePathReport(REALISTIC_CONTEXT);

  assertTrue(typeof report.summary === 'string' && report.summary.trim().length > 0, 'summary is present and non-empty');
  assertTrue(
    typeof report.what_this_could_be === 'string' && report.what_this_could_be.trim().length > 0,
    'what_this_could_be is present and non-empty',
  );
  assertTrue(typeof report.why_it_fits === 'string' && report.why_it_fits.trim().length > 0, 'why_it_fits is present and non-empty');
  const whyItFitsParagraphs = report.why_it_fits.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  assertTrue(
    whyItFitsParagraphs.length === 2,
    `why_it_fits is exactly two paragraphs separated by a blank line (got ${whyItFitsParagraphs.length})`,
  );
  assertTrue(
    typeof report.life_it_leads_toward === 'string' && report.life_it_leads_toward.trim().length > 0,
    'life_it_leads_toward is present and non-empty',
  );
  assertTrue(Array.isArray(report.strategic_decisions) && report.strategic_decisions.length > 0, 'strategic_decisions is a non-empty array');
  assertTrue(
    report.strategic_decisions.every(sd =>
      sd.decision.trim().length > 0 && sd.why_it_matters.trim().length > 0 &&
      sd.live_options.length >= 2 && sd.live_options.length <= 4 &&
      sd.live_options.every(o => o.trim().length > 0),
    ),
    'every strategic_decisions entry has non-empty decision/why_it_matters and 2-4 non-empty live_options',
  );
  assertTrue(
    !('thesis' in report) && !('honest_cost' in report) && !('master_strategy' in report) && !('what_it_is' in report),
    'the real output carries none of the retired #139 fields (thesis/honest_cost/master_strategy/what_it_is)',
  );

  // Redundant re-check against the real output as independent evidence, not
  // just trusting generatePathReport's own internal check.
  const reCheckedViolations = findMustAvoidViolationsInReport(report, REALISTIC_CONTEXT.must_avoids);
  assertTrue(reCheckedViolations.length === 0, 're-running findMustAvoidViolationsInReport against the real output finds zero violations');

  console.log('\nReal generated report (for eyes-on review):\n');
  console.log('--- summary ---\n' + report.summary);
  console.log('\n--- what_this_could_be ---\n' + report.what_this_could_be);
  console.log('\n--- why_it_fits (paragraph 1 — capability) ---\n' + whyItFitsParagraphs[0]);
  console.log('\n--- why_it_fits (paragraph 2 — desire + overlap) ---\n' + (whyItFitsParagraphs[1] ?? '(missing second paragraph)'));
  console.log('\n--- life_it_leads_toward ---\n' + report.life_it_leads_toward);
  console.log('\n--- strategic_decisions ---');
  report.strategic_decisions.forEach((sd, i) => {
    console.log(`\n[${i + 1}] ${sd.decision}`);
    console.log(`    why_it_matters: ${sd.why_it_matters}`);
    console.log(`    live_options: ${JSON.stringify(sd.live_options)}`);
  });
}

async function main() {
  await runRealGeneration();

  console.log('\n' + '='.repeat(78));
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(78));
  // process.exitCode, not process.exit() — an explicit exit() forces
  // immediate teardown while this script's earlier LLM API call may still
  // have libuv handles mid-close, which crashes with a native
  // "UV_HANDLE_CLOSING" assertion on Windows (confirmed via a real repro
  // this session: identical run, only this one change, crash disappears).
  // Setting exitCode and letting main() return lets Node drain the event
  // loop naturally instead.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('Script crashed:', err);
  process.exitCode = 1;
});
