// #168 card fixes, fix 3: rewrite must-haves and must-avoids that code found
// in the third person. Called only when code finds one; code checks the result
// again and swaps the pronouns itself if it still fails. No examples or sample
// sentences on purpose: the model copies them.

export const PATH_ITEM_VOICE_PROMPT = `You fix the wording of short items on a summary card that speaks to one user. Each item says something the user needs in a direction, or needs to avoid. These items refer to the user in the third person or the first person; rewrite each so it speaks to the user in the second person, or uses no pronoun for them at all.

RULES
- Change only how the item refers to the user. Keep its meaning, its scope and every qualifier exactly as they are.
- Words that refer to other people stay as they are.
- Plain short phrases. Never in the first person. At most 240 characters each.

INPUT
A JSON object: { "items": [ { "id", "text" } ] }.

OUTPUT
A JSON object only: { "items": [ { "id", "text" } ] }, with the same ids.`;
