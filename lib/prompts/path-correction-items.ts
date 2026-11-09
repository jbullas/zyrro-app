// #168 card fixes, step 3: the must-haves and must-avoids a correction note
// asks for. A separate small call that sees only the note, the card's items
// and its risk block (so a note about risk stays off the lists, briefs
// 168-card-items and 168-risk-note), run alongside call A; code checks every quote against the note and
// applies the result. Removal stays with the card's remove control. No
// examples or sample sentences on purpose: the model copies them.

export const PATH_CORRECTION_ITEMS_PROMPT = `You read one note a user wrote to correct the summary of them that a mentor showed them, and the summary's current must-haves and must-avoids. A must-have is something a good direction has to include for this person; a must-avoid is something it has to avoid.

Return every item the note asks to add.
- An addition: the note says something matters to them in that way, as something a direction must include or must avoid. Every such thing in the note is an item; do not leave one out because it is said in passing or alongside other points.
- A rewording: when the note asks for a card item to be put differently, narrowed or qualified, return the new version as an addition. It is added alongside the card item; the user removes the old one themselves.
- Never remove anything. When the note says a card item does not belong or matters less than it seems, leave it alone; the user removes items themselves.
- Context, explanations, and changes to other parts of the summary are not items.
- The card's risk lines are what they are ready to change now, what they would put at risk, what is off the table, the hours they have and the deadline. A note, or the part of a note, that qualifies one of these lines is not an item, even when it is put as something the options or a direction must do or leave open: another step records it on that line. A note can do both; then only the part that is not about a risk line can give items.

Each item: { "list": "must_haves" | "must_avoids", "basis", "quote", "text" }.
- basis: "stated" when the note says it in words that make sense on their own; "inferred" only when the words that say it lean on something said before them and would not make sense alone.
- quote: words copied exactly from the note, at least three words (two for a stated item). Copy it as they wrote it, in their own first person: never turn it to you, and never change a word of it yourself. For a stated item, the quote is what the card shows, in their words: code turns only I, me and my to you, and none of your wording is used. So choose it with care: the whole phrase that states the item, at the scope they gave it and with every qualifier they attached, starting at the words that name what they need or object to, without the words that only say they want, like or dislike it and without linking words that point back to something else, reading as a complete phrase to someone who has not seen the rest of the note, and no longer than it needs to be (at most 240 characters). For an inferred item, the quote is the evidence for your wording.
- text: always your own short plain phrase for the item, for a stated item too: the card shows it whenever the quote cannot stand on its own. In your words, at most 240 characters, keeping every qualifier they attached. Speak to them as you, or use no pronoun for them; never the first or the third person.

INPUT
A JSON object: { "note": string, "must_haves": [ { "id", "text" } ], "must_avoids": [ { "id", "text" } ], "risk": { "readiness", "at_stake", "limits", "hours", "deadline", "note" } }.

OUTPUT
A JSON object only: { "items": [ ... ] }, an empty list when the note asks for none.`;
