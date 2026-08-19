import OpenAI from 'openai';
import { SIGNATURES, DOMAINS } from '@/lib/signatures';

const SIGNATURE_LIST = DOMAINS.map(domain => {
  const sigs = SIGNATURES.filter(s => s.domain === domain);
  return `${domain}:\n${sigs.map(s => `- ${s.name} — ${s.description}`).join('\n')}`;
}).join('\n\n');

/**
 * #119 Stage 5: standalone Call 1 (Read & Write) of the new blank-slate
 * observe-then-name pipeline, per
 * docs/briefs/119-stage5-newpipeline-call1-test.md. NOT wired into
 * generateIdentityReport, any API route, or any artifact type.
 *
 * Departs deliberately from the live DETECTION_PROMPT/LAYER_2_PROMPT
 * pipeline: one call reads and writes together (no separate detection +
 * scoring-then-writing split), no signal-type taxonomy or frequency/
 * intensity rubric, and minimal per-signature reference text (name +
 * one-line description only, same SIGNATURES source as the live
 * DETECTION_PROMPT interpolation, not the richer core-pattern/signal/
 * language shape in docs/framework/zyrro_detection_engine_spec_v_1.md).
 *
 * Prompt text below is copied verbatim from the Stage 5 brief's fenced
 * prompt block, with only the signature list interpolated in place of
 * the bracketed placeholder, plus two additions per
 * docs/briefs/119-stage6-call1-voice-repetition-fix.md: a second-person
 * voice instruction (Stage 5's real output mixed "you" and "they" across
 * personas, since the prompt never specified a voice) and a
 * vary-the-phrasing instruction (Stage 5's real output leaned on the same
 * stock transitions — "This pattern is consistent," "the cost is..." —
 * across entries within a single report). Both phrased positively per
 * that brief's stated reasoning: negative "don't do X" framings tend to
 * get satisfied narrowly without fixing the underlying pattern.
 */
export const PIPELINE_V2_CALL1_PROMPT = `You are reading one person's real answers to 13 questions. Their answers
tell a story — read it as a whole, not as isolated answers to isolated
questions.

You are not looking for what they say they are. You're looking for what
their story repeatedly reveals: behaviour that recurs, choices they keep
making, tensions that keep showing up, what visibly energises them, and
outcomes that keep happening.

From the 25 signatures below, identify exactly 8 that most define this
person. Base this on what genuinely recurs in their story — not what
they said they wish they were, or what they admire in others.

${SIGNATURE_LIST}

For each of the 8 signatures: name it, and write about it in a way that
makes this person say "that's me" — not something that could apply to
anyone with this signature.

Four things need to come through, in whatever order and however many
sentences it takes:

- What it actually looks like when they do this — specific enough that
  only someone like them would recognize it, not the trait described in
  the abstract.
- Why they do it — the real driver underneath the behaviour, not just
  what they do but what it's in service of.
- How solid the pattern actually is — does it show up regularly, across
  different situations, or only here and there? Is there a clear, repeated
  demonstration of it, or is it implied or guessed from a single
  reference? Say which, honestly.
- What it costs them — the specific friction this pattern creates for
  them. Be honest; unearned praise reads as flattery and undercuts
  everything else.

If the real evidence is thin, say so and keep the entry short rather than
stretching it to hit all four — a short, honest entry is correct when
that's what the evidence supports.

Write directly to the person, in second person — "you," not "they" or
"this person." Zyrro is speaking to them, not describing them to someone
else.

Each of the 8 entries should read like it was written fresh for that
specific signature. Vary how you open each one and how you land on the
cost at the end; if you notice yourself reaching for a phrase you already
used in an earlier entry, find a different way to say it this time.

Return valid JSON only. No markdown. No commentary outside the JSON.

{
  "signatures": [
    { "slot": 1, "name": "", "write_up": "" },
    { "slot": 2, "name": "", "write_up": "" },
    { "slot": 3, "name": "", "write_up": "" },
    { "slot": 4, "name": "", "write_up": "" },
    { "slot": 5, "name": "", "write_up": "" },
    { "slot": 6, "name": "", "write_up": "" },
    { "slot": 7, "name": "", "write_up": "" },
    { "slot": 8, "name": "", "write_up": "" }
  ]
}`;

export interface PipelineV2Call1Slot {
  slot: number;
  name: string;
  write_up: string;
}

export interface PipelineV2Call1Result {
  raw: string;
  parsed: { signatures: PipelineV2Call1Slot[] } | null;
  rawParseOk: boolean;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  latencyMs: number;
}

/**
 * Self-contained completion call, own OpenAI client instance — same
 * pattern as every prior standalone engine version in this repo (e.g.
 * lib/detection-engine-v9.ts), not routed through lib/llm.ts.
 */
export async function runPipelineV2Call1(
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>
): Promise<PipelineV2Call1Result> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: PIPELINE_V2_CALL1_PROMPT },
      { role: 'user', content: JSON.stringify(answers) },
    ],
    temperature: 0,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const latencyMs = Date.now() - start;

  const raw = response.choices[0]?.message?.content ?? '{}';
  let parsed: { signatures: PipelineV2Call1Slot[] } | null = null;
  let rawParseOk = true;
  try {
    parsed = JSON.parse(raw);
  } catch {
    rawParseOk = false;
  }

  return {
    raw,
    parsed,
    rawParseOk,
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null,
    latencyMs,
  };
}
