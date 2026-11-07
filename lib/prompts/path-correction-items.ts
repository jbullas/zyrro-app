// #168 card fixes, step 3: the must-haves and must-avoids a correction note
// asks for. A separate small call that sees only the note and the card's
// items, run alongside call A; code checks every quote against the note and
// applies the result. Removal stays with the card's remove control. No
// examples or sample sentences on purpose: the model copies them.

export const PATH_CORRECTION_ITEMS_PROMPT = `You read one note a user wrote to correct the summary of them that a mentor showed them, and the summary's current must-haves and must-avoids. A must-have is something a good direction has to include for this person; a must-avoid is something it has to avoid.

Return every item the note asks to add, and every card item the note asks to put differently.
- An addition: the note says something matters to them in that way, as something a direction must include or must avoid. Every such thing in the note is an item; do not leave one out because it is said in passing or alongside other points.
- A rewording: the note asks for a card item to be put differently, narrowed or qualified. Give that card item's id in replaces.
- Never remove anything. When the note says a card item does not belong or matters less than it seems, leave it alone; the user removes items themselves.
- Context, explanations, and changes to other parts of the summary are not items.

Each item: { "list": "must_haves" | "must_avoids", "text", "quote", "replaces" }.
- text: a short plain phrase, at most 240 characters, close to how they put it and keeping every qualifier they attached. Speak to them as you, or use no pronoun for them; never the first or the third person.
- quote: words copied exactly from the note that support it, at least three words.
- replaces: the id of the card item it rewords, or null for an addition.

INPUT
A JSON object: { "note": string, "must_haves": [ { "id", "text" } ], "must_avoids": [ { "id", "text" } ] }.

OUTPUT
A JSON object only: { "items": [ ... ] }, an empty list when the note asks for none.`;
