import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { NameSuggestion } from '@/lib/chat-choices';
import { chatJson, fixDashes } from '@/lib/path-conversation';
import { NAMING_FILTER_PROMPT, NAMING_NAMES_PROMPT, NAMING_SOURCE_WORDS_PROMPT } from '@/lib/prompts/project-name';
// Ordinary English words: the SCOWL lists up to level 60 (about 75,000 common
// words). Rare words (level 70 and up) are left out on purpose, so a name that
// only happens to be an obscure word isn't dropped. Server-only.
import words10 from 'wordlist-english/english-words-10.json';
import words20 from 'wordlist-english/english-words-20.json';
import words35 from 'wordlist-english/english-words-35.json';
import words40 from 'wordlist-english/english-words-40.json';
import words50 from 'wordlist-english/english-words-50.json';
import words55 from 'wordlist-english/english-words-55.json';
import words60 from 'wordlist-english/english-words-60.json';

// #181 (brief 181-project-naming): names for the path the user chose. Source
// words first (call 1), then 6 names per source word (call 2), code checks,
// then a filter for bad meanings and brand clashes (call 3). The survivors are
// shuffled into pages of 5 with at most 2 names from one source word per page
// while that's possible. Runs in the background (runNamingGeneration in
// lib/path-options.ts); the whole ordered set is saved on the naming message.

const SOURCE_MODEL = 'gpt-6.1-sol';
const NAMES_MODEL = 'gpt-4.1';
const NAMES_TEMPERATURE = 1.0;
const FILTER_MODEL = 'gpt-6.1-sol';

const NAMES_PER_SOURCE = 6;
export const NAMES_PAGE_SIZE = 5;
const MAX_PER_SOURCE_ON_PAGE = 2;
// Names Miroslav picked in testing were all 5 or 6 letters (brief 181-naming-tuning).
const MAX_NAME_LETTERS = 7;

let englishWords: Set<string> | null = null;
function isEnglishWord(lower: string): boolean {
  englishWords ??= new Set([words10, words20, words35, words40, words50, words55, words60].flat().map(w => w.toLowerCase()));
  return englishWords.has(lower);
}

// what_it_is is absent on options generated before it existed.
export type NamingOption = { name: string; what_it_is?: string; what_it_looks_like: string; starting_point: string };
type Candidate = { name: string; source: string };

const str = (v: unknown) => (typeof v === 'string' ? fixDashes(v.trim()) : '');

/** One JSON call, tried twice; null when both tries fail (an error or unusable output). */
async function callTwice(
  label: string,
  system: string,
  input: unknown,
  model: string,
  temperature: number | undefined,
  usable: (parsed: Record<string, unknown> | null) => boolean,
  conversationId: string,
): Promise<{ parsed: Record<string, unknown> | null; tokens: number }> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(input) },
  ];
  let tokens = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await chatJson(messages, temperature, label, model, conversationId);
      tokens += r.tokens;
      if (usable(r.parsed)) return { parsed: r.parsed, tokens };
      console.warn(`[path names] ${label}: unusable output (attempt ${attempt})`);
    } catch (err) {
      console.warn(`[path names] ${label}: call failed (attempt ${attempt}):`, err);
    }
  }
  return { parsed: null, tokens };
}

/** The code checks between the names call and the filter: why a name is dropped, or null. */
function codeCheck(c: Candidate, sources: string[], seen: Set<string>): string | null {
  const lower = c.name.toLowerCase();
  if (!/^[A-Za-z]+$/.test(c.name)) return 'not a single word of letters A to Z';
  if (/[A-Z]/.test(c.name.slice(1))) return 'capital letter after the start';
  if (c.name.length > MAX_NAME_LETTERS) return `longer than ${MAX_NAME_LETTERS} letters`;
  if (!/[aeiouy]/.test(lower.slice(-2))) return 'no vowel in the last two letters';
  if (!sources.includes(c.source)) return 'source word not in the list';
  if (!lower.startsWith(c.source.slice(0, 3))) return "doesn't start with the first 3 letters of its source word";
  if (isEnglishWord(lower)) return 'ordinary English word';
  if (seen.has(lower)) return 'repeat';
  return null;
}

/** Calls 2 and 3 with the code checks between them: the names that survive. */
async function namesRound(sources: string[], seen: Set<string>, conversationId: string, attempt: number) {
  const wanted = sources.length * NAMES_PER_SOURCE;
  const gen = await callTwice(
    'path names: names', NAMING_NAMES_PROMPT, { source_words: sources }, NAMES_MODEL, NAMES_TEMPERATURE,
    p => Array.isArray(p?.names) && (p.names as unknown[]).filter(x => str((x as Record<string, unknown>)?.name)).length >= Math.ceil(wanted * 0.75),
    conversationId,
  );
  let tokens = gen.tokens;
  if (!gen.parsed) return { survivors: null, tokens };

  const generated: Candidate[] = (gen.parsed.names as unknown[]).map(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const name = str(o.name);
    // The source words go in lower case and the model sometimes answers in
    // lower case too: a name always starts with a capital (#182 verification).
    return { name: name.charAt(0).toUpperCase() + name.slice(1), source: str(o.source_word).toLowerCase() };
  }).filter(c => c.name);
  const passed: Candidate[] = [];
  const codeDrops: string[] = [];
  for (const c of generated) {
    const problem = codeCheck(c, sources, seen);
    seen.add(c.name.toLowerCase());
    if (problem) codeDrops.push(`${c.name} (${problem})`);
    else passed.push(c);
  }

  const filter = await callTwice(
    'path names: filter', NAMING_FILTER_PROMPT, { names: passed.map(c => c.name) }, FILTER_MODEL, undefined,
    p => Array.isArray(p?.drop),
    conversationId,
  );
  tokens += filter.tokens;
  if (!filter.parsed) return { survivors: null, tokens };
  const drops = (filter.parsed.drop as unknown[]).map(d => {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    return { name: str(o.name), reason: str(o.reason) };
  }).filter(d => d.name);
  const dropped = new Set(drops.map(d => d.name.toLowerCase()));
  const survivors = passed.filter(c => !dropped.has(c.name.toLowerCase()));

  console.info(`[path names] conversation ${conversationId}: round ${attempt}: ${generated.length} generated, ${codeDrops.length} dropped by code, ${drops.length} by the filter, ${survivors.length} left`);
  if (codeDrops.length) console.info(`[path names] conversation ${conversationId}: code drops: ${codeDrops.join('; ')}`);
  if (drops.length) console.info(`[path names] conversation ${conversationId}: filter drops: ${drops.map(d => `${d.name} (${d.reason})`).join('; ')}`);
  return { survivors, tokens };
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffled into pages of 5, at most 2 names from one source word per page while that's possible. */
export function orderIntoPages<T extends { source: string }>(items: T[], pageSize = NAMES_PAGE_SIZE, maxPerSource = MAX_PER_SOURCE_ON_PAGE): T[] {
  const rest = shuffle(items);
  const ordered: T[] = [];
  while (rest.length) {
    const page: T[] = [];
    const count = new Map<string, number>();
    // Within the per-source limit first, then whatever is left.
    for (const strict of [true, false]) {
      for (let i = 0; i < rest.length && page.length < pageSize;) {
        const n = count.get(rest[i].source) ?? 0;
        if (strict && n >= maxPerSource) { i++; continue; }
        const [item] = rest.splice(i, 1);
        page.push(item);
        count.set(item.source, n + 1);
      }
    }
    ordered.push(...page);
  }
  return ordered;
}

/**
 * The names for a chosen path: the whole ordered set, or null when fewer
 * than a page survive after one extra names round, or a call fails twice.
 * Never throws. Logs the counts at each stage and the filter's reasons.
 */
export async function generateProjectNames(
  option: NamingOption,
  note: string | null,
  conversationId: string,
): Promise<{ names: NameSuggestion[] | null; tokens: number }> {
  let tokens = 0;
  const src = await callTwice(
    'path names: source words', NAMING_SOURCE_WORDS_PROMPT,
    { name: option.name, what_it_is: option.what_it_is, what_it_looks_like: option.what_it_looks_like, starting_point: option.starting_point, user_note: note },
    SOURCE_MODEL, undefined,
    p => Array.isArray(p?.words) && (p.words as unknown[]).filter(w => /^[A-Za-z]+$/.test(str((w as Record<string, unknown>)?.word))).length >= 4,
    conversationId,
  );
  tokens += src.tokens;
  if (!src.parsed) return { names: null, tokens };

  // Single words, lower case, no two sharing their first four letters, at most 6.
  const sources: string[] = [];
  for (const w of src.parsed.words as unknown[]) {
    const word = str((w as Record<string, unknown>)?.word).toLowerCase();
    if (!/^[a-z]+$/.test(word) || sources.some(s => s.slice(0, 4) === word.slice(0, 4))) continue;
    sources.push(word);
    if (sources.length === 6) break;
  }
  console.info(`[path names] conversation ${conversationId}: source words: ${sources.join(', ')}`);

  const seen = new Set<string>();
  const survivors: Candidate[] = [];
  for (let attempt = 1; attempt <= 2 && survivors.length < NAMES_PAGE_SIZE; attempt++) {
    const round = await namesRound(sources, seen, conversationId, attempt);
    tokens += round.tokens;
    if (!round.survivors) return { names: null, tokens };
    survivors.push(...round.survivors);
  }
  if (survivors.length < NAMES_PAGE_SIZE) {
    console.warn(`[path names] conversation ${conversationId}: only ${survivors.length} names survived; ending without naming`);
    return { names: null, tokens };
  }

  const ordered = orderIntoPages(survivors);
  console.info(`[path names] conversation ${conversationId}: ${ordered.length} names offered`);
  return { names: ordered.map((c, i) => ({ id: `n${i + 1}`, name: c.name })), tokens };
}
