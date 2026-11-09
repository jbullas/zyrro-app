// #168 card fixes (brief docs/briefs/168-card-fixes.md): the checks code runs
// on text the model writes for the Path card and summary, and the code-owned
// fallbacks when a check still fails. Pure functions, no imports, so the
// server and verification scripts can share them.

const normalize = (s: string) => s.toLowerCase().replace(/[‘’`]/g, "'");

function tokens(s: string): string[] {
  return normalize(s).replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
}

// Words that carry no content of their own, for the word-share checks.
const FUNCTION_WORDS = new Set([
  'the', 'and', 'but', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'what', 'when', 'which', 'would',
  'about', 'into', 'than', 'then', 'there', 'will', 'been', 'more', 'some', 'only', 'just', 'also', 'still', 'were',
  'are', 'was', 'not', 'can', 'could', 'should', 'does', 'did', 'doing', 'whether', 'while', 'they', 'them', 'their',
  'its', "it's", 'who', 'how', 'any', 'all', 'one', 'each', 'very', 'much', 'many', 'such', 'too', 'out', 'over',
  'you', 'your', 'yours', 'yourself', "you're", "you've", "you'd", "you'll", 'him', 'his', 'her', 'hers', 'she', 'he',
  "i'd", "i'm", "i've", "i'll", 'myself', 'mine', 'our', 'ours', 'we', 'us',
]);

/** A rough stem, so a light rewording (keep/keeping, likes/like) still counts as their word. */
function stem(w: string): string {
  const x = w.replace(/'s$/, '');
  if (x.length > 5 && x.endsWith('ing')) return x.slice(0, -3);
  if (x.length > 4 && x.endsWith('ed')) return x.slice(0, -2);
  if (x.length > 4 && x.endsWith('es')) return x.slice(0, -2);
  if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss')) return x.slice(0, -1);
  return x;
}

function contentStems(s: string): string[] {
  return tokens(s).filter(w => w.length > 2 && !FUNCTION_WORDS.has(w)).map(stem);
}

/** Share of the text's content words found in the sources (after light stemming). */
export function wordShare(text: string, sources: string[]): number {
  const ws = contentStems(text);
  if (!ws.length) return 0;
  const said = new Set(sources.flatMap(contentStems));
  return ws.filter(w => said.has(w)).length / ws.length;
}

// ── Brief 168-options: starting points ────────────────────────────────────

// Words about time that any starting point may share (their hours, weeks).
const TIME_STEMS = new Set([
  'hour', 'week', 'weekly', 'month', 'day', 'year', 'time', 'now', 'next', 'first', 'few', 'under', 'rather',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'twenty',
]);

function substanceStems(s: string): string[] {
  return contentStems(s).filter(w => !TIME_STEMS.has(w) && !/^\d+$/.test(w));
}

/**
 * Share of a starting point's substance (content words, without time words
 * and numbers) found in the sources: high means it restates them.
 */
export function substanceShare(text: string, sources: string[]): number {
  const ws = substanceStems(text);
  if (!ws.length) return 1;
  const said = new Set(sources.flatMap(substanceStems));
  return ws.filter(w => said.has(w)).length / ws.length;
}

// Words any start can use about starting at all (pace, keeping the job,
// committing or not), as stems: they say nothing about this path.
const GENERIC_START_STEMS = new Set([
  'explore', 'exploration', 'explor', 'alongside', 'begin', 'start', 'within', 'limit', 'available', 'current', 'work',
  'job', 'income', 'salary', 'keep', 'unchang', 'change', 'chang', 'move', 'mov', 'transition', 'commit', 'committ',
  'decision', 'decid', 'direction', 'possibility', 'future', 'gradual', 'step', 'way', 'path', 'option', 'role', 'yet',
  'without', 'before', 'after', 'toward', 'towards', 'room', 'space', 'test', 'try', 'small', 'part', 'outset',
]);

/**
 * The words a starting point shares with its own option (name, what it is,
 * the picture) that are neither in the card's risk and time lines nor
 * generic words about starting: what makes it this path's start.
 */
export function pathSpecificStartWords(start: string, option: string[], riskLines: string[]): string[] {
  const risk = new Set(riskLines.flatMap(substanceStems));
  const own = new Set(option.flatMap(substanceStems));
  return [...new Set(substanceStems(start))].filter(w => !risk.has(w) && !GENERIC_START_STEMS.has(w) && own.has(w));
}

const FIRST_PERSON = /(^|[^\p{L}'])(i|i'm|i'd|i've|i'll|me|my|mine|myself)(?![\p{L}'])/u;

export function hasFirstPerson(text: string): boolean {
  return FIRST_PERSON.test(normalize(text));
}

export function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).map(s => s.trim()).filter(Boolean);
}

// ── Fix 2: the card's direction line ───────────────────────────────────────

export const DIRECTION_LINE_MAX_CHARS = 300;
export const DIRECTION_LINE_MAX_SENTENCES = 2;
// Most of the line's content words must come from what the user wrote. Tuned
// in live runs: faithful lines scored 0.71 to 1.0 (a light rewording turns
// "discovered" into "discovery"), an invented direction 0.0.
const DIRECTION_WORD_SHARE = 0.65;

/** Why the direction line fails its check, or null when it passes. */
export function directionLineProblem(line: string, sources: string[]): string | null {
  if (line.length > DIRECTION_LINE_MAX_CHARS) return `over ${DIRECTION_LINE_MAX_CHARS} chars (${line.length})`;
  if (sentences(line).length > DIRECTION_LINE_MAX_SENTENCES) return `more than ${DIRECTION_LINE_MAX_SENTENCES} sentences`;
  if (hasFirstPerson(line)) return 'first person';
  const share = wordShare(line, sources);
  if (share < DIRECTION_WORD_SHARE) return `only ${share.toFixed(2)} of its words are theirs`;
  return null;
}

// Brief 168-card-items, decision 2: a quote that leans on something said
// before it can't stand on the card. Narrow on purpose: a pointing word at the
// end, or a linking word as the first word (among the first three it also
// caught "cost targets and firefighting", which leans on nothing).
const POINTING_END = new Set(['that', 'it', 'this', 'there', 'them']);
const LINKING_START = new Set(['also', 'and', 'but', 'so']);

/** Why a stated item's quote leans on something earlier, or null. */
export function leansOnEarlier(quote: string): string | null {
  const words = quote.toLowerCase().replace(/[‘’]/g, "'").split(/\s+/).map(w => w.replace(/[^\p{L}']/gu, '')).filter(Boolean);
  const last = words[words.length - 1];
  if (last && POINTING_END.has(last)) return `ends with "${last}"`;
  return words[0] && LINKING_START.has(words[0]) ? `starts with "${words[0]}"` : null;
}

/** "I'd like…" as "You'd like…": pronouns swapped, nothing else changed. */
export function swapToSecondPerson(text: string, capitalize = true): string {
  const swapped = text
    .replace(/[‘’]/g, "'")
    .replace(/\bI am\b/g, 'you are')
    .replace(/\bI was\b/g, 'you were')
    .replace(/\bI'm\b/g, "you're")
    .replace(/\bI'd\b/g, "you'd")
    .replace(/\bI've\b/g, "you've")
    .replace(/\bI'll\b/g, "you'll")
    .replace(/\bI\b/g, 'you')
    .replace(/\bmyself\b/gi, 'yourself')
    .replace(/\bmine\b/gi, 'yours')
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bme\b/gi, 'you')
    .replace(/'/g, '’');
  // "you" opening any sentence takes a capital (not for card items, which are phrases).
  if (!capitalize) return swapped;
  return swapped.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, c: string) => lead + c.toUpperCase());
}

/**
 * The code-owned fallback line: the first sentence of each answer they gave
 * (so a follow-up answer is in it too), up to the limits, with only the
 * pronouns swapped. Never their raw first person.
 */
export function fallbackDirectionLine(sources: string[]): string | null {
  const firsts = sources.length > 1 ? sources.map(s => sentences(s)[0]).filter(Boolean) : sentences(sources[0] ?? '');
  let out = '';
  for (const s of firsts.slice(0, DIRECTION_LINE_MAX_SENTENCES)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > DIRECTION_LINE_MAX_CHARS) break;
    out = next;
  }
  if (!out) return null;
  const line = swapToSecondPerson(out);
  return hasFirstPerson(line) ? null : line;
}

// ── Fix 3: card items in the second person ─────────────────────────────────

const GENDERED = /(^|[^\p{L}'])(she|he|her|hers|him|his|herself|himself|she's|he's)(?![\p{L}'])/u;
const PLURAL_THEY = /(^|[^\p{L}'])(they|them|their|theirs|themselves|they're|they've)(?![\p{L}'])/u;
// Other people an item can name, so "their" can refer to them rather than the user.
const OTHER_PEOPLE = /(^|[^\p{L}])(people|person|others|someone|anyone|everyone|client|clients|colleague|colleagues|customer|customers|child|children|kid|kids|team|teams|student|students|friend|friends|family|member|members|user|users|audience|partner|partners|staff|patient|patients|learner|learners|group|groups|inventor|inventors|neighbour|neighbours|neighbor|neighbors|parent|parents|manager|managers|boss|business|businesses|owner|owners|teenager|teenagers)(?![\p{L}])/u;

/** The word that puts a card item in the third person (about the user), or null. */
export function thirdPersonWord(item: string, firstName: string | null): string | null {
  const t = normalize(item);
  const g = t.match(GENDERED);
  if (g) return g[2];
  if (firstName && firstName.length > 1 && new RegExp(`(^|[^\\p{L}])${firstName.toLowerCase()}(?![\\p{L}])`, 'u').test(t)) return firstName;
  const p = t.match(PLURAL_THEY);
  if (p && !OTHER_PEOPLE.test(t)) return p[2];
  return null;
}

// Words that refer to a person; cutting one out of a phrase leaves it broken.
const PERSON_WORDS = new Set([
  'i', "i'm", "i'd", "i've", "i'll", 'me', 'my', 'mine', 'myself',
  'she', 'he', 'her', 'him', 'his', 'hers', 'herself', 'himself',
  'they', 'them', 'their', 'theirs', 'themselves', "they're", "they've",
]);

const bare = (w: string) => normalize(w).replace(/[^\p{L}\p{N}']/gu, '');

/**
 * Brief 168-card-fixes, step 3: a rewrite that dodged a pronoun by cutting it
 * out ("…but leave me personally unmoved" → "…but personally unmoved"). The
 * item's words appear in order in the source, and the words left out between
 * them include a word for a person. Returns the matching stretch of the
 * source, so the caller can swap its pronouns instead; null when the item
 * is not such a cut.
 */
export function personCutFrom(item: string, source: string): string | null {
  const src = source.replace(/[‘’]/g, "'").split(/\s+/).filter(Boolean);
  const words = item.split(/\s+/).map(bare).filter(Boolean);
  if (words.length < 3) return null;
  const matched: number[] = [];
  let at = 0;
  for (const w of words) {
    while (at < src.length && bare(src[at]) !== w) at++;
    if (at >= src.length) return null;
    matched.push(at++);
  }
  const first = matched[0];
  const last = matched[matched.length - 1];
  const cut = [];
  for (let i = first; i <= last; i++) if (!matched.includes(i)) cut.push(bare(src[i]));
  if (!cut.some(w => PERSON_WORDS.has(w))) return null;
  return src.slice(first, last + 1).join(' ').replace(/[.,;:!?]+$/, '');
}

const VERB_AGREEMENT: Record<string, string> = { is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "doesn't": "don't", "hasn't": "haven't" };

/** Last resort: third-person pronouns about the user swapped for the second person. */
export function mechanicalSecondPerson(item: string): string {
  return item
    .replace(/\b(she|he|they)\s+(\w+'?\w*)/gi, (_, __, verb: string) => {
      const v = verb.toLowerCase();
      const agreed = VERB_AGREEMENT[v] ?? (/[^s]s$/.test(v) && v.length > 3 ? v.slice(0, -1) : v);
      return `you ${agreed}`;
    })
    .replace(/\b(herself|himself|themselves)\b/gi, 'yourself')
    .replace(/\b(him|them)\b/gi, 'you')
    .replace(/\bher\b(?=\s*([.,;:!?)]|$))/gi, 'you')
    .replace(/\b(her|his|their)\b/gi, 'your')
    .replace(/\b(hers|theirs)\b/gi, 'yours')
    .replace(/\b(she|he|they)\b/gi, 'you');
}

// ── Fix 4: a deadline names its timing ─────────────────────────────────────

const TERM_WORDS = /(^|[^\p{L}])(renew|renewal|renewing|renewed|review|term|contract|expire|expires|expiry|deadline|due|vest|vests|notice)(?![\p{L}])/u;
const CALENDAR = /(^|[^\p{L}])(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|spring|summer|autumn|fall|winter)(?![\p{L}])/u;
const NUMBER_WORDS = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|another|next|few|couple of)';
const AMOUNT_OF_TIME = new RegExp(`(^|[^\\p{L}])${NUMBER_WORDS}\\s+(day|days|week|weeks|month|months|year|years|quarter|quarters)(?![\\p{L}])`, 'u');
const END_OF = /(^|[^\p{L}])(end of|by the end|before the end|this|next)\s+(year|month|quarter|summer|spring|autumn|winter)(?![\p{L}])/u;
const DATE = /\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b|\b(19|20)\d{2}\b/;

/** The quote names the timing of a decision: a term, renewal or review, a date, or an amount of time. */
export function namesTiming(quote: string): boolean {
  const t = normalize(quote);
  // "For years" (looking back) is not a timing; a number or "another" with the unit is.
  return TERM_WORDS.test(t) || CALENDAR.test(t) || AMOUNT_OF_TIME.test(t) || END_OF.test(t) || DATE.test(t);
}

// ── Fix 5: the confirmed read ──────────────────────────────────────────────

const GREETING = /^\s*(hi|hello|hey|dear|good (morning|afternoon|evening))\b/i;

// A sentence of the read that mostly reuses one sentence of the opening message is copied from it.
const COPIED_SENTENCE_SHARE = 0.8;

function copiedFrom(sentence: string, openingMessage: string): boolean {
  return sentences(openingMessage).some(o => wordShare(sentence, [o]) >= COPIED_SENTENCE_SHARE);
}

// A sentence that only says something is unclear or not known: Zyrro's gap,
// not how the user stands (live runs: the read kept "…is still unclear").
const UNKNOWN = /(^|[^\p{L}])(unclear|unknown|not (yet )?(clear|known)|remains to be seen)(?![\p{L}])/u;

/** Why a confirmed read is not acceptable, or null. */
export function confirmedReadProblem(text: string, openingMessage: string | null, firstName: string | null): string | null {
  if (GREETING.test(text)) return 'starts with a greeting';
  if (firstName && new RegExp(`^\\s*${firstName}\\s*[,.]`, 'i').test(text)) return 'addressed to the user by name';
  if (hasFirstPerson(text)) return 'Zyrro speaking in the first person';
  const unknown = sentences(text).filter(s => UNKNOWN.test(normalize(s)));
  if (unknown.length) return `says what is not known (${unknown.length} sentence${unknown.length > 1 ? 's' : ''})`;
  if (openingMessage) {
    const copied = sentences(text).filter(s => copiedFrom(s, openingMessage));
    if (copied.length) return `copies the opening message (${copied.length} of ${sentences(text).length} sentences)`;
  }
  return null;
}

/**
 * The read with what isn't the user's standing taken out: a greeting or a
 * sentence addressed to them, and every sentence copied from Zyrro's opening
 * message. Null when nothing of its own is left, or when Zyrro speaks in the
 * first person (then the whole read is Zyrro's message, not a record).
 */
export function cleanConfirmedRead(text: string, openingMessage: string | null, firstName: string | null): string | null {
  const kept = sentences(text).filter((s, i) => {
    if (i === 0 && (GREETING.test(s) || (firstName && new RegExp(`^\\s*${firstName}\\s*[,.!]?\\s*$`, 'i').test(s)))) return false;
    if (UNKNOWN.test(normalize(s))) return false;
    return !(openingMessage && copiedFrom(s, openingMessage));
  });
  const out = kept.join(' ').replace(new RegExp(`^\\s*(hi|hello|hey|dear)\\s+${firstName ?? ''}\\s*[,.!]\\s*`, 'i'), '').trim();
  if (!out || hasFirstPerson(out)) return null;
  return out;
}
