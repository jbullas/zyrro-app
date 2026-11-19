// #181 (brief 181-project-naming): naming the path the user chose in the Path
// conversation. Three calls (lib/project-naming.ts): source words, names built
// from them, and a filter. Code checks the names between the second and third
// call and orders the survivors into pages of 5. The design comes from five
// investigation rounds (.verification-runs/181-naming-*).
//
// No example names and no real brands in any prompt: examples get copied, and
// a named brand gets imitated.

/** Call 1 (gpt-6.1-sol): 4 to 6 concrete words central to the chosen path. */
export const NAMING_SOURCE_WORDS_PROMPT = `You help name a project for a person using Zyrro. The project is the path the person has chosen for the next chapter of their working life. You receive that path as JSON: its name, what it is, what it would look like, its starting point, and anything the person asked to keep in mind about it.

Pick 4 to 6 concrete nouns central to where this person is heading on this path: things, places or objects at the heart of what they do or make on it. Prefer short words.

Do not pick:
- verbs, activities, or words ending in -ing
- work or duties the path moves them away from, or hands to other people
- how they are paid, or the admin around the work
- abstract or generic words
- words that only appear in passing

No two words may share a stem: each word must start differently from every other word in its first four letters.

Each word is a single English noun. For each, give a one-line reason it is central to this path.

Return valid JSON only, no commentary:

{ "words": [ { "word": "", "reason": "" } ] }`;

/** Call 2 (gpt-4.1, temperature 1.0): 6 names per source word. */
export const NAMING_NAMES_PROMPT = `You make up names for a person's project: the path they have chosen for the next chapter of their working life. You receive a list of source words as JSON.

For each source word, make 6 names. Build each name like this:
- It starts with the first syllable of its source word, or its first two syllables if the word is short, spelled exactly as in that word. The kept part must read as the source word on its own, so a stranger can spot the word at first sight.
- It adds only a short ending, so the result sounds like a name and is not a plain English word.
- Keep the whole name short: at most 7 letters.
- It is one word of two syllables or fewer.
- The letters Z, X, Q, J and K are welcome, but only where the name still reads easily on first sight.

Return each name with the source word it was built from.

Return valid JSON only, no commentary:

{ "names": [ { "name": "", "source_word": "" } ] }`;

/** Call 3 (gpt-6.1-sol): only the names to drop, each with a reason. */
export const NAMING_FILTER_PROMPT = `You check candidate names for a personal project before a person sees them.

Drop a name only if:
- it has a bad, rude or embarrassing meaning in English or in another major language, or
- part of it reads as a rude or awkward word, or the whole name is easily misread or misheard as one, or
- it is the same as or close to a well-known brand, company or product name.

Do not judge quality, do not rank, and do not drop names for any other reason.

Return valid JSON only, no commentary:

{ "drop": [ { "name": "", "reason": "" } ] }

Use an empty array if nothing should be dropped.`;
