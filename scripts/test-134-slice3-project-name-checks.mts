/**
 * #134 Slice 3 — script test for the rewritten PROJECT_NAME_PROMPT
 * (lib/prompts/project-name.ts), first real exercise of this exact prompt
 * against path_report's real chosen_candidate shape ({ name, description },
 * not the old { name, thesis, signatures_engaged }). Scoped smaller than
 * scripts/test-134-slice3-report-checks.mts on purpose — this prompt has
 * no must-avoid exposure and nothing to restate/echo (it only ever sees
 * name/description), so there's no equivalent hard-check machinery to
 * fixture-test; a single real call with shape/duplicate assertions is
 * proportionate to the actual risk surface.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-134-slice3-project-name-checks.mts
 */
import { getChatCompletion } from '../lib/llm';
import { PROJECT_NAME_PROMPT } from '../lib/prompts/project-name';

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

interface ProjectNameOption {
  name: string;
  rationale: string;
}

function validateProjectNameOptions(data: unknown): data is { options: ProjectNameOption[] } {
  const d = data as { options?: ProjectNameOption[] };
  if (!Array.isArray(d?.options) || d.options.length !== 3) return false;
  return d.options.every(o => typeof o?.name === 'string' && o.name.trim().length > 0
    && typeof o?.rationale === 'string' && o.rationale.trim().length > 0);
}

// Same chosen_candidate used in scripts/test-134-slice3-report-checks.mts,
// for continuity across this session's real-output checks.
const CHOSEN_CANDIDATE = {
  name: 'Independent Systems Consultant',
  description:
    'This path means leaving full-time employment to work independently as a systems consultant, taking on a ' +
    'small number of client engagements at a time with full ownership over scope, timeline, and approach. It ' +
    'differs from staying employed by trading organizational stability for direct control over which problems ' +
    'you take on and how much time you spend on each. It meets your need for clear scope by letting you define ' +
    'engagement boundaries yourself before work begins, and gives you the deep, uninterrupted focus time that a ' +
    'full-time role split across competing priorities rarely allows. It requires building a client pipeline from ' +
    'nothing and handling the business side yourself in the early months.',
};

async function main() {
  section('Real LLM call — PROJECT_NAME_PROMPT against path_report\'s real chosen_candidate shape');

  const content = await getChatCompletion({
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PROJECT_NAME_PROMPT },
      { role: 'user', content: JSON.stringify(CHOSEN_CANDIDATE) },
    ],
    max_tokens: 1000,
    temperature: 0.7,
  });

  const parsed = JSON.parse(content ?? '{}');

  assertTrue(validateProjectNameOptions(parsed), 'response validates: exactly 3 options, each with non-empty name and rationale');

  if (validateProjectNameOptions(parsed)) {
    const names = parsed.options.map(o => o.name.trim().toLowerCase());
    assertTrue(new Set(names).size === names.length, 'all 3 names are distinct (no duplicates)');

    const genericPhrases = ['great fit', 'good choice', 'perfect for you', 'ideal path'];
    const hasGenericRationale = parsed.options.some(o =>
      genericPhrases.some(phrase => o.rationale.toLowerCase().includes(phrase)),
    );
    assertTrue(!hasGenericRationale, 'no rationale falls back to generic praise language');

    console.log('\nReal generated name options (for eyes-on review):\n');
    parsed.options.forEach((o, i) => {
      console.log(`[${i + 1}] ${o.name}`);
      console.log(`    ${o.rationale}\n`);
    });
  }

  console.log('='.repeat(78));
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(78));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Script crashed:', err);
  process.exit(1);
});
