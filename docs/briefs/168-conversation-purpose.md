# Brief 168-conversation-purpose: rebuild the Path conversation around its purpose

Ticket #168. Save this brief as docs/briefs/168-conversation-purpose.md.

## Why

The Path conversation feels underwhelming. It collects the read, direction, risk and hours, but the user never feels understood. The prompts were built that way on purpose: Zyrro gets one reflection in the whole conversation, call B sees the report and the summary's tensions and connections on only four turns, every other turn is acknowledge-and-ask, and signature names are banned. Those limits were added to stop echoing and invented insights, but they overcorrected.

Miroslav approved the statement below as the governing purpose of the conversation. Everything else in the design doc and the prompts must follow from it.

## The approved statement (word for word)

### The Path conversation: what it is for

**Why she is here.** The user arrives because of a tension in her life: something pulling her one way while something else holds her back. That tension is the reason she came. The conversation exists to understand it, together with her.

**What Zyrro does.** Zyrro doesn't start from zero. Her Identity report already names the tension in her signatures, her friction points and the pattern it notices. Zyrro starts from that, ties it to her 13 answers, and forms a view of how that tension shows up in her life right now. It opens by saying that view plainly, in her terms.

From then on, every message from Zyrro shows what it understands and moves that understanding forward: where the tension is biting, what it's costing her, and what she wants to do about it. It connects what she says to her answers and her report, names what it notices, and invites her to correct or deepen it. She should feel understood more with every exchange, not questioned.

**The pattern and the path.** Her past shows a pattern. That pattern may be the source of her tension, or it may point to where she's heading, or both. Which it is depends on her, and Zyrro reads it from context, never by rule. Getting this right is the core of the conversation.

**The practical facts.** Direction, readiness, what she'd risk, hard limits and hours still matter, because the options depend on them. Zyrro gathers them as part of understanding her, asked in the light of her tension, not as a separate form at the end.

**Grounded, not invented.** Everything Zyrro says rests on what she wrote or said, or on her report. It never flatters, never echoes her back, and never claims a link the evidence doesn't support. A signature may be named when it helps her see herself, always explained in plain words.

**How long.** As long as it takes to understand her well enough, usually a handful of exchanges. It ends when Zyrro can describe her tension, her pattern and her constraints in a way she confirms on the summary card.

**What comes out.** Options that grow out of that understanding. A path may surprise her, but it should click when she reads it: she recognises herself in it.

## Step 1: design doc (draft only, stop for approval)

1. Draft a rewrite of the conversation sections of docs/framework/path-plan-redesign.md so the whole doc says one thing. Put the statement first, as "What the conversation is for". Then rewrite every section it contradicts. At least these: Conversation order, When Zyrro has enough, Living user summary (the single reflection, the four-exchange target, acknowledge-and-ask turns), the signature rule in the profile section, and the options sections, so options grow out of her pattern and tension.
2. Keep principles, not formulas. No fixed steps or required fields for pattern or tension.
3. List the other docs in docs/framework where this principle belongs, and propose where it should go, without copying it everywhere.
4. Show the full drafted sections and the list. Do not commit. Stop and wait for approval.

## Step 2: implementation plan (after the design doc is approved, stop again)

Read only. Propose, in short plain words with no code:

1. Call B: what it should see on every turn (the report's tensions, friction points and patterns, and the summary's tensions and connections) and how its prompt changes.
2. Seed and call A: what is needed so the starting summary leads with the tension the report names, tied to her answers.
3. Code that strips context from call B, and which checks or retries would block the new behaviour.
4. The conversation order and when it ends.
5. What stays as it is: the living summary, the update and reply split, evidence checks, the card, options format and UI.

Stop for approval before building.

## Not in scope

No code changes in this brief until both stops are approved. #168 stays Started.
