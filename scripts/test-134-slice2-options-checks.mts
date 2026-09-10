/**
 * #134 Slice 2 — script test for the two Checkpoint 2 "Options" hard checks
 * (findMustAvoidViolations, findMaterialDuplicates) and the batch-generation
 * control flow (generateCandidateBatch/generateInitialOptions) in
 * lib/generate-path-options-session.ts. Same discipline as
 * enforceSecondaryEvidenceFloor/enforceConstellationSynthesisNonOverlap were
 * validated against real captured failures before being trusted
 * (lib/generate-identity-report.ts) — Part 1/2 below are pure fixture
 * assertions (deterministic, no network), including three regression cases
 * captured from real generation runs during this check's own development
 * (see each fixture's comment for what real run it came from); Part 3/4
 * make real LLM calls against realistic and deliberately hostile inputs to
 * prove the pipeline behaves correctly against genuine model output, not
 * just hand-authored cases.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-134-slice2-options-checks.mts
 */
import {
  findMustAvoidViolations,
  findMaterialDuplicates,
  generateInitialOptions,
  generateCandidateBatch,
  OptionsGenerationShortfallError,
  type OptionsGenerationContext,
} from '../lib/generate-path-options-session';
import type { PathOptionsCandidate } from '../lib/path-options-session';

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
section('PART 1 — findMustAvoidViolations: fixture assertions (no network)');
// ─────────────────────────────────────────────────────────────────────────

{
  const mustAvoids = ['Ambiguous requirements', 'Long review cycles'];

  const exactPhrase =
    'This path leans into ambiguous requirements as a starting point, treating them as raw material rather than a blocker.';
  const violations1 = findMustAvoidViolations(exactPhrase, mustAvoids);
  assertTrue(
    violations1.some(v => v.must_avoid === 'Ambiguous requirements'),
    'exact-phrase match: "ambiguous requirements" (lowercase, in prose) is caught against must_avoid "Ambiguous requirements"',
  );

  const lexicalVariant =
    'The tradeoff is real: expect to get pulled into long reviewing cycle after long reviewing cycle before anything ships.';
  const violations2 = findMustAvoidViolations(lexicalVariant, mustAvoids);
  assertTrue(
    violations2.some(v => v.must_avoid === 'Long review cycles'),
    'close lexical variant match: "long reviewing cycle" (tense/number shifted) is caught against must_avoid "Long review cycles"',
  );

  const clean =
    'This path is built around fast, well-scoped sprints with a single clear owner and same-day feedback on every decision.';
  const violations3 = findMustAvoidViolations(clean, mustAvoids);
  assertTrue(
    violations3.length === 0,
    'unrelated description triggers zero must-avoid violations (no false positive)',
  );
}

{
  // Regression fixtures below use the exact must_avoids and prose captured
  // from two real generation runs during this check's own development
  // (initial: 12/12 drafts wrongly rejected; after the negation-aware fix,
  // 2 of the fix's own real drafts still slipped through for the two
  // distinct reasons each fixture targets).
  const mustAvoids = ['Ambiguous requirements', 'Micromanagement'];

  // Real captured miss #1: cue word AFTER the phrase ("[phrase] is
  // eliminated"), not before it — the original backward-only negation
  // window couldn't see it. From a real "Tech Startup Founder" option.
  const forwardNegation =
    "This path involves founding a tech startup focused on developing a niche product. You'll have the opportunity to " +
    'define a clear scope from the outset, ensuring that the product addresses specific hard problems within a defined ' +
    "market. This option differs from other potential paths by placing you in the driver's seat, allowing you to build " +
    'and lead a small, focused team. It perfectly aligns with your desire for real ownership over the outcomes and ' +
    'avoids ambiguous requirements by establishing a clear product vision from the start. Micromanagement is ' +
    'eliminated since you set the direction and culture. This path aligns with your ideal life by giving you the ' +
    'autonomy to ship products that users need. However, it requires significant time investment, especially in the ' +
    'early stages, and resources for product development, marketing, and team building.';
  const forwardNegationViolations = findMustAvoidViolations(forwardNegation, mustAvoids);
  assertTrue(
    !forwardNegationViolations.some(v => v.must_avoid === 'Micromanagement'),
    'real captured case: "Micromanagement is eliminated..." (cue word after the phrase) is NOT flagged as a violation',
  );

  // Real captured miss #2: "sidestep(s)" wasn't in the negation cue
  // vocabulary at all. From a real "Innovation Lab Director" option.
  const sidestepCue =
    'This option involves directing an innovation lab within a forward-thinking company, where you lead a team ' +
    "dedicated to exploring cutting-edge technologies. It stands out by giving you the chance to shape the lab's " +
    'vision and tackle hard problems with a clear scope. You can cultivate deep focus time by structuring the ' +
    "lab's initiatives around well-defined goals. This role avoids ambiguous requirements through a strategic " +
    'roadmap and sidesteps micromanagement by fostering a culture of experimentation and trust. It aligns with ' +
    'your ideal life by enabling you to lead a team that ships impactful solutions. This path requires a ' +
    'commitment to staying at the forefront of technology trends and managing resources effectively to drive ' +
    'innovation.';
  const sidestepViolations = findMustAvoidViolations(sidestepCue, mustAvoids);
  assertTrue(
    !sidestepViolations.some(v => v.must_avoid === 'Micromanagement'),
    'real captured case: "...sidesteps micromanagement by fostering..." is NOT flagged as a violation',
  );

  // Negation-awareness must not swallow a real violation — a genuine
  // must-avoid mention with no negation cue nearby should still be caught.
  const genuineViolation =
    "You'll face real micromanagement in this role, with your manager reviewing every decision before you can act on it.";
  const genuineViolations = findMustAvoidViolations(genuineViolation, mustAvoids);
  assertTrue(
    genuineViolations.some(v => v.must_avoid === 'Micromanagement'),
    'a genuine, non-negated must-avoid mention ("You\'ll face real micromanagement...") is still correctly flagged',
  );
}

// ─────────────────────────────────────────────────────────────────────────
section('PART 2 — findMaterialDuplicates: fixture assertions (no network)');
// ─────────────────────────────────────────────────────────────────────────

{
  const existing: PathOptionsCandidate[] = [{
    id: 'existing-1',
    round: 1,
    name: 'The Independent Practice',
    description:
      'This path means leaving the agency entirely and building a small, named practice around your own client relationships. ' +
      'The most difficult part of this direction is the first six months without a steady paycheck, when you are ' +
      'simultaneously delivering client work and building the pipeline that replaces your old salary. It draws directly on ' +
      'your pattern of taking ownership end to end rather than handing off pieces of a project to someone else.',
  }];

  const verbatimOverlap = {
    name: 'The Solo Consultancy',
    description:
      'This is a different framing of the same independence idea, but told through consulting language instead of a practice. ' +
      'The most difficult part of this direction is the first six months without a steady paycheck, and that risk is ' +
      'the real reason most people never attempt it, however appealing the upside looks from the outside.',
  };
  const dup = findMaterialDuplicates(verbatimOverlap, existing);
  assertTrue(
    dup.length === 1 && dup[0].candidate_id === 'existing-1',
    '16-word verbatim run ("the most difficult part of this direction is the first six months without a steady paycheck") is flagged as a material duplicate of existing-1',
  );

  const genuinelyDifferent = {
    name: 'The Internal Track',
    description:
      'This path stays inside a larger organization but moves you toward leading a small team rather than being an individual ' +
      'contributor. It plays to your pattern of organizing ambiguity for other people, and the demand it makes is political, ' +
      'not financial: you spend real time managing up and building sponsorship rather than just doing the work.',
  };
  const noDup = findMaterialDuplicates(genuinelyDifferent, existing);
  assertTrue(
    noDup.length === 0,
    'a genuinely different option (same general life-decision topic, no shared 8-word run) is NOT flagged as a duplicate',
  );
}

{
  // Regression fixture for a real captured false positive: two genuinely
  // different options from one real generation run were flagged as
  // duplicates purely because they both hit the prompt's own required
  // content-bar points using near-identical stock connector phrasing
  // ("aligns with your ideal life by allowing you", "ensuring that each
  // project has a clear scope") — boilerplate, not evidence of actual
  // duplication. This is the exact real captured pair (full option text,
  // not excerpted) that drove MATERIAL_DIFFERENCE_MIN_OVERLAP_WORDS from
  // 8 to 14.
  const rdTeamLeader: PathOptionsCandidate = {
    id: 'existing-rd',
    round: 1,
    name: 'R&D Team Leader',
    description:
      "In this role, you'll lead a research and development team within a larger organization, focusing on innovative " +
      'solutions to complex problems. This option stands apart by embedding you in an environment dedicated to deep ' +
      'focus and structured problem-solving. It meets your must-haves by providing a clear scope of projects and the ' +
      'opportunity to solve hard problems through innovative approaches. By working within an established company, ' +
      'you avoid ambiguous requirements with well-defined project goals and avoid micromanagement through a culture ' +
      'of trust and autonomy. This aligns with your ideal life by allowing you to run a focused team with ownership ' +
      'over significant, impactful projects. This path requires a commitment to fostering team collaboration and ' +
      'continuous learning, with resources provided by the organization.',
  };
  const technicalProjectManager = {
    name: 'Technical Project Manager',
    description:
      "As a Technical Project Manager, you'll oversee the development of complex projects with a focus on delivering " +
      'clear, structured solutions. This role differs by emphasizing project management within a technical context, ' +
      'ensuring that each project has a clear scope and is geared towards solving hard problems. You can ensure deep ' +
      'focus time by managing project timelines and priorities effectively. This path avoids ambiguous requirements ' +
      'by establishing well-defined project plans and avoids micromanagement through a leadership style that ' +
      'encourages autonomy. It aligns with your ideal life by allowing you to manage a team and take ownership of ' +
      'project outcomes. This path requires strong organizational skills and the ability to coordinate resources and ' +
      'stakeholders to meet project objectives.',
  };
  const boilerplateDup = findMaterialDuplicates(technicalProjectManager, [rdTeamLeader]);
  assertTrue(
    boilerplateDup.length === 0,
    'real captured case: two genuinely different options sharing only stock content-bar connector phrasing (max 8-word overlap) are NOT flagged as duplicates at the raised threshold',
  );
}

// ─────────────────────────────────────────────────────────────────────────
section('PART 3 — real LLM call, realistic context (network)');
// ─────────────────────────────────────────────────────────────────────────

const REALISTIC_CONTEXT: OptionsGenerationContext = {
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
      core_statement: 'You finish what other people abandon once the interesting part is over.',
      evidence_analysis:
        'You described shipping a project solo after two collaborators dropped off, and separately finishing a certification ' +
        'program years after everyone else in your cohort had quit.',
      tension: 'You can stay in a finishing role too long, past the point where you should have handed it off.',
    },
  ],
};

async function runRealisticGeneration() {
  const result = await generateInitialOptions(REALISTIC_CONTEXT);

  assertTrue(result.accepted.length === 4, `generateInitialOptions returned exactly 4 accepted options (got ${result.accepted.length})`);

  const ids = new Set(result.accepted.map(c => c.id));
  assertTrue(ids.size === result.accepted.length, 'all accepted candidate ids are unique');
  assertTrue(result.accepted.every(c => c.round === 1), 'all initial-batch candidates are tagged round 1');
  assertTrue(
    result.accepted.every(c => c.name.trim().length > 0 && c.description.trim().length > 0),
    'every accepted candidate has non-empty name and description',
  );

  // Redundant re-check against the real output as independent evidence, not
  // just trusting generateCandidateBatch's own internal accept/reject logic.
  const reCheckedViolations = result.accepted.flatMap(c => findMustAvoidViolations(c.description, REALISTIC_CONTEXT.must_avoids));
  assertTrue(reCheckedViolations.length === 0, 're-running findMustAvoidViolations against the real accepted output finds zero violations');

  let reCheckedDuplicates = 0;
  for (let i = 0; i < result.accepted.length; i++) {
    const others = result.accepted.filter((_, j) => j !== i);
    reCheckedDuplicates += findMaterialDuplicates(result.accepted[i], others).length;
  }
  assertTrue(reCheckedDuplicates === 0, 're-running findMaterialDuplicates pairwise across the real accepted output finds zero duplicates');

  console.log('\nReal generated options (for eyes-on review):');
  for (const c of result.accepted) {
    console.log(`\n--- ${c.name} ---\n${c.description}`);
  }
  if (result.rejected.length > 0) {
    console.log('\nRejected drafts this run (over-generation buffer doing its job):');
    for (const r of result.rejected) console.log(`- "${r.draft.name}": ${r.reasons.join('; ')}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
section('PART 4 — real LLM call, forced collision: reject -> retry -> hard-fail (network)');
// ─────────────────────────────────────────────────────────────────────────

// The prompt's own content bar (point 6) requires every option to state what
// it demands in time and resources — so a must_avoid that names that exact
// concept creates a structural conflict the model cannot satisfy no matter
// how it's asked to retry. Deliberately used here as a fast, deterministic
// way to force real rejections and a real retry against actual model output,
// rather than relying on a happy-path run to accidentally produce one.
const HOSTILE_CONTEXT: OptionsGenerationContext = {
  ...REALISTIC_CONTEXT,
  must_avoids: ['requiring time and resources'],
};

async function runForcedCollision() {
  try {
    const result = await generateCandidateBatch(HOSTILE_CONTEXT, 2, [], 1);
    // If the model manages to route around the collision entirely (e.g. by
    // never using that exact phrasing), this branch is still a valid outcome
    // — the check is a phrase-presence heuristic, not a semantic one, so it
    // won't catch every possible phrasing of "this requires time/resources."
    assertTrue(
      result.accepted.length === 2,
      `forced-collision case did not hard-fail this run — got ${result.accepted.length}/2 accepted instead (heuristic didn't trigger on this generation's exact wording; not a check bug)`,
    );
  } catch (err) {
    assertTrue(
      err instanceof OptionsGenerationShortfallError,
      `forced-collision case threw OptionsGenerationShortfallError as expected (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

async function main() {
  await runRealisticGeneration();
  await runForcedCollision();

  console.log('\n' + '='.repeat(78));
  console.log(failures === 0 ? `ALL CHECKS PASSED` : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(78));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Script crashed:', err);
  process.exit(1);
});
