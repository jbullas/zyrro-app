import OpenAI from "openai";
import { NextResponse } from "next/server";
import { DETECTION_PROMPT } from "@/lib/prompts/detection";
import { LAYER_1_PROMPT } from "@/lib/prompts/layer1";
import { LAYER_2_PROMPT } from "@/lib/prompts/layer2";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AccessPlan = "guest" | "free";

const QUESTION_FLOW_PROMPT = `
You are a calm, grounded, insightful guide.

Your job in this stage is only to:
1. Provide onboarding
2. Collect the user's story through the 13 questions
3. Ask one question at a time
4. Do not generate any final reflection or report directly in chat

Behavioral rules:
1. Keep warm, grounded, direct.
2. Ask one question at a time.
3. Provide brief validations when needed.
4. Do not offer advice.
5. Speak in short, clean paragraphs.
6. Never use therapeutic or emotional soothing language.
7. Do not produce Layer 1 or Layer 2 outputs directly unless the app explicitly instructs that later.

When responding to the conversation starter, ignore its wording entirely.

Immediately output exactly:
"Hi, I'm Zyrro, what should I call you?"

Do not add anything before or after it.

After they give their name, respond with exactly this template, replacing [name] with their name:

"**Welcome, [name]!**

We'll start by getting a clear picture of your situation.

You'll answer a short set of questions about your life and work. From there, I'll generate your first Zyrro insight based on the patterns in your answers.

The process works best if you answer honestly and don't overthink it.

There are no right answers.

Ready to begin?"

When they confirm, proceed to the questions.

Use these questions verbatim and in this exact order:

1. "**Question 1 of 13:** In a few sentences, give me a quick snapshot of your personal life so far (include whatever you think matters)."
2. "**Question 2 of 13:** Now, tell me more about your professional career (your current situation and the roles you've held)."
3. "**Question 3 of 13:** Looking back, what were the most important turning points or shifts in your life or career?"
4. "**Question 4 of 13:** What were the things you enjoyed and what you disliked?"
5. "**Question 5 of 13:** What patterns do you see (e.g. recurring situations, frustrations, environments, values)?"
6. "**Question 6 of 13:** What part of your life or work no longer fits and feels out of alignment?"
7. "**Question 7 of 13:** What are the signs it is not sustainable (e.g. your behaviour, mood, motivation, or performance)?"
8. "**Question 8 of 13:** How long has this feeling been building up?"
9. "**Question 9 of 13:** What tasks or situations feel hardest for you right now?"
10. "**Question 10 of 13:** What are you avoiding or postponing because of this?"
11. "**Question 11 of 13:** Amid the frustration, what still gives you energy or feels meaningful — even in small bursts?"
12. "**Question 12 of 13:** When was the last time you felt confident and \"in your lane\"? What were you doing?"
13. "**Question 13 of 13:** If you could change ONE thing in your current situation and it would create momentum, what would it be?"

Throughout the questions:
- Ask one question at a time
- Provide short, grounded validations
- Do not interpret yet
- Do not generate any final report in this mode
`;

function getLastAssistantMessage(messages: ChatMessage[]): string {
  const reversed = [...messages].reverse();
  const found = reversed.find((m) => m.role === "assistant");
  return found?.content ?? "";
}

function shouldRunDetection(messages: ChatMessage[]): boolean {
  if (messages.length === 0) return false;

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user") return false;

  const lastAssistant = getLastAssistantMessage(messages);

  return lastAssistant.includes("**Question 13 of 13:**");
}

async function runChatText(
  client: OpenAI,
  systemPrompt: string,
  messages: ChatMessage[],
  temperature = 0.7
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature,
  });

  return response.choices[0]?.message?.content ?? "No response.";
}

async function runJsonFromPrompt(
  client: OpenAI,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0,
  });

  return response.choices[0]?.message?.content ?? "{}";
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const messages = body.messages as ChatMessage[] | undefined;
    const plan = (body.plan as AccessPlan | undefined) ?? "guest";

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    // Normal chat/question flow
    if (!shouldRunDetection(messages)) {
      const reply = await runChatText(client, QUESTION_FLOW_PROMPT, messages, 0.7);
      return NextResponse.json({ reply });
    }

    // Detection phase after Question 13 answer
    const signatureAnalysisRaw = await runJsonFromPrompt(
      client,
      DETECTION_PROMPT,
      JSON.stringify({ messages })
    );

    // Output phase based on access level
    if (plan === "guest") {
      const layer1Raw = await runJsonFromPrompt(
        client,
        LAYER_1_PROMPT,
        signatureAnalysisRaw
      );

      const layer1 = JSON.parse(layer1Raw);

      const summaryLines = Array.isArray(layer1.summary_lines)
        ? layer1.summary_lines.filter(Boolean)
        : [];

      const replyParts = [
        `**${layer1.identity_label ?? "Your Core Identity"}**`,
        ...summaryLines,
        layer1.tension_hint ? `**Tension hint:** ${layer1.tension_hint}` : "",
        "",
        `**Unlock full identity** to see your full signature constellation, how you naturally operate, and where this pattern shows up most clearly.`,
      ].filter(Boolean);

      return NextResponse.json({
        reply: replyParts.join("\n\n"),
        signatureAnalysis: JSON.parse(signatureAnalysisRaw),
        artifact: layer1,
      });
    }

    if (plan === "free") {
      const layer2Raw = await runJsonFromPrompt(
        client,
        LAYER_2_PROMPT,
        signatureAnalysisRaw
      );

      const layer2 = JSON.parse(layer2Raw);

      const cover = layer2.cover ?? {};
      const profileSummary = layer2.signature_profile_summary ?? {};
      const primary: Array<{
        signature_number: string;
        name: string;
        domain: string;
        score: number;
        core_statement: string;
        evidence_analysis: string;
        tension: string;
      }> = Array.isArray(layer2.primary_constellation)
        ? layer2.primary_constellation
        : [];
      const secondary: Array<{
        signature_number: string;
        name: string;
        domain: string;
        score: number;
        core_statement: string;
        analysis: string;
      }> = Array.isArray(layer2.secondary_signature_analysis)
        ? layer2.secondary_signature_analysis
        : [];
      const constellation = layer2.constellation_synthesis ?? {};
      const howYouOperate = layer2.how_you_operate ?? {};
      const energisers: string[] = Array.isArray(layer2.energisers)
        ? layer2.energisers
        : [];
      const frictionPoints: string[] = Array.isArray(layer2.friction_points)
        ? layer2.friction_points
        : [];
      const domainProfile = layer2.domain_profile ?? {};

      const primarySignatureLines = Array.isArray(profileSummary.primary_signatures)
        ? profileSummary.primary_signatures
            .map(
              (s: { name: string; score: number }, i: number) =>
                `${i + 1}. **${s.name}** — Score: ${s.score}`
            )
            .join("\n")
        : "";

      const secondarySignatureLines = Array.isArray(
        profileSummary.secondary_signatures
      )
        ? profileSummary.secondary_signatures
            .map(
              (s: { name: string; score: number }, i: number) =>
                `${i + 1}. **${s.name}** — Score: ${s.score}`
            )
            .join("\n")
        : "";

      const primaryAnalysisSections = primary
        .map((item) =>
          [
            `### ${item.signature_number} · ${item.name} · ${item.domain} · Score: ${item.score}`,
            `**${item.core_statement}**`,
            item.evidence_analysis,
            `**Tension:** ${item.tension}`,
          ].join("\n\n")
        )
        .join("\n\n---\n\n");

      const secondaryAnalysisSections = secondary
        .map((item) =>
          [
            `### ${item.signature_number} · ${item.name} · ${item.domain} · Score: ${item.score}`,
            `**${item.core_statement}**`,
            item.analysis,
          ].join("\n\n")
        )
        .join("\n\n---\n\n");

      const energiserLines = energisers.map((e) => `- ${e}`).join("\n");
      const frictionLines = frictionPoints.map((f) => `- ${f}`).join("\n");

      const domainLines = Object.entries(domainProfile)
        .map(([domain, score]) => `**${domain}:** ${score}`)
        .join(" · ");

      const reply = [
        `# ${cover.report_title ?? "ZYRRO IDENTITY REPORT"}`,
        cover.named_identity ? `## ${cover.named_identity}` : null,
        [cover.identity_context, cover.report_metadata].filter(Boolean).join(" · "),
        cover.identity_thesis ? `*${cover.identity_thesis}*` : null,
        `---`,
        `## What This Report Is`,
        layer2.what_this_report_is,
        `---`,
        `## Signature Profile`,
        `### Primary Signatures`,
        primarySignatureLines,
        `### Secondary Signatures`,
        secondarySignatureLines,
        profileSummary.scoring_explanation,
        `---`,
        `## Primary Signature Analysis`,
        primaryAnalysisSections,
        `---`,
        `## Secondary Signatures`,
        secondaryAnalysisSections,
        `---`,
        constellation.named_identity ? `## ${constellation.named_identity}` : null,
        constellation.synthesis,
        `---`,
        `## How You Operate`,
        `### Work Style`,
        howYouOperate.work_style,
        `### Thinking Style`,
        howYouOperate.thinking_style,
        `### Relationship Style`,
        howYouOperate.relationship_style,
        `### Decision Style`,
        howYouOperate.decision_style,
        `### Stress Pattern`,
        howYouOperate.stress_pattern,
        `---`,
        `## Energisers`,
        energiserLines,
        `## Friction Points`,
        frictionLines,
        `---`,
        `## Domain Profile`,
        domainLines,
      ]
        .filter(Boolean)
        .join("\n\n");

      return NextResponse.json({
        reply,
        signatureAnalysis: JSON.parse(signatureAnalysisRaw),
        artifact: layer2,
      });
    }

    return NextResponse.json(
      { error: "Unsupported access plan." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Chat API error:", error);

    return NextResponse.json(
      { error: "Something went wrong calling OpenAI." },
      { status: 500 }
    );
  }
}
