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

/** "I'd like…" as "You'd like…": pronouns swapped, nothing else changed. */
export function swapToSecondPerson(text: string): string {
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
  // "you" opening any sentence takes a capital.
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
