/**
 * #134 Slice 3 — script test for "Your Path" final delivery generation
 * (lib/generate-path-report.ts). Same discipline as
 * scripts/test-134-slice2-options-checks.mts: Part 1 is pure fixture
 * assertions (deterministic, no network) against
 * findMustAvoidViolationsInReport; Part 2 makes a real LLM call against
 * realistic Direction+Options+identity_report inputs and asserts on real
 * output shape, printing the full generated content for review — this is
 * the first time this exact prompt has been exercised against real inputs.
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
    thesis: 'You build your own consultancy around the systems work you already do best, on your own terms.',
    what_it_is:
      'This path means leaving full-time employment to work independently, taking on a small number of clients ' +
      'at a time and owning the full scope of each engagement — from diagnosing the real problem to shipping the fix.',
    why_it_fits:
      'You have already shown you can see the structure beneath a messy situation and finish what you start, ' +
      'even after collaborators drop off. What actually draws you here is the clear scope and deep focus a solo ' +
      'engagement offers, rather than the fragmented attention of a full-time role split across many priorities.',
    honest_cost:
      'The first six months carry real income uncertainty while you build a client pipeline, and you will be doing ' +
      'business development and admin work yourself rather than handing it to someone else.',
    life_it_leads_toward:
      'A working week built around one or two deep engagements at a time, with long, uninterrupted blocks for the ' +
      'actual problem-solving work, and full ownership over which clients and problems you take on next.',
    master_strategy: [
      {
        name: 'Land one paying engagement within 90 days so there is real income and a real case study to build from',
        description: 'Reach out to your existing network first, since trust is already established there.',
        sequencing_rationale: 'This has to come first — nothing else here works without a first real client.',
      },
      {
        name: 'Formalize a simple intake process by month four so each new engagement starts with a clear scope',
        description: 'A short written brief template used before any engagement is accepted.',
        sequencing_rationale: 'Priority, not hard dependency — could be built earlier, but matters more once real demand exists.',
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
  draft.honest_cost =
    'The hardest part is the ambiguous requirements you will face early on, before a client relationship is established.';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.some(v => v.must_avoid === 'Ambiguous requirements'),
    'a violation in a top-level field (honest_cost) is detected',
  );
}

{
  const draft = cleanDraft();
  draft.master_strategy[1].description =
    'Avoid slipping into micromanagement of your own future subcontractors once the workload grows.';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.length === 0,
    'a negated mention inside a master_strategy objective\'s description ("avoid... micromanagement") is correctly NOT flagged',
  );
}

{
  const draft = cleanDraft();
  draft.master_strategy[0].description =
    'You will need to tolerate real micromanagement from early clients while you establish trust and a track record.';
  const violations = findMustAvoidViolationsInReport(draft, MUST_AVOIDS);
  assertTrue(
    violations.some(v => v.must_avoid === 'Micromanagement'),
    'a genuine (non-negated) violation nested inside master_strategy[i].description is detected — proves the field-flattening actually reaches into the array, not just the top-level prose fields',
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
// this session, plus the chosen-candidate/comments layer Options itself adds.
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
};

async function runRealGeneration() {
  const report = await generatePathReport(REALISTIC_CONTEXT);

  assertTrue(typeof report.thesis === 'string' && report.thesis.trim().length > 0, 'thesis is present and non-empty');
  assertTrue(typeof report.what_it_is === 'string' && report.what_it_is.trim().length > 0, 'what_it_is is present and non-empty');
  assertTrue(typeof report.why_it_fits === 'string' && report.why_it_fits.trim().length > 0, 'why_it_fits is present and non-empty');
  assertTrue(typeof report.honest_cost === 'string' && report.honest_cost.trim().length > 0, 'honest_cost is present and non-empty');
  assertTrue(
    typeof report.life_it_leads_toward === 'string' && report.life_it_leads_toward.trim().length > 0,
    'life_it_leads_toward is present and non-empty',
  );
  assertTrue(Array.isArray(report.master_strategy) && report.master_strategy.length > 0, 'master_strategy is a non-empty array');
  assertTrue(
    report.master_strategy.every(o => o.name.trim().length > 0 && o.description.trim().length > 0 && o.sequencing_rationale.trim().length > 0),
    'every master_strategy objective has non-empty name/description/sequencing_rationale',
  );
  assertTrue(
    !('not_this' in report) && !('plan_seed_actions' in report),
    'the real output carries no not_this or plan_seed_actions field (confirms the prompt is actually standalone, not echoing the old Stage 6 shape)',
  );

  // Redundant re-check against the real output as independent evidence, not
  // just trusting generatePathReport's own internal check.
  const reCheckedViolations = findMustAvoidViolationsInReport(report, REALISTIC_CONTEXT.must_avoids);
  assertTrue(reCheckedViolations.length === 0, 're-running findMustAvoidViolationsInReport against the real output finds zero violations');

  console.log('\nReal generated report (for eyes-on review):\n');
  console.log('--- thesis ---\n' + report.thesis);
  console.log('\n--- what_it_is ---\n' + report.what_it_is);
  console.log('\n--- why_it_fits ---\n' + report.why_it_fits);
  console.log('\n--- honest_cost ---\n' + report.honest_cost);
  console.log('\n--- life_it_leads_toward ---\n' + report.life_it_leads_toward);
  console.log('\n--- master_strategy ---');
  report.master_strategy.forEach((o, i) => {
    console.log(`\n[${i + 1}] ${o.name}`);
    console.log(`    description: ${o.description}`);
    console.log(`    sequencing_rationale: ${o.sequencing_rationale}`);
  });
}

async function main() {
  await runRealGeneration();

  console.log('\n' + '='.repeat(78));
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(78));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Script crashed:', err);
  process.exit(1);
});
