import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/utils/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { hasEntitlement } from "@/lib/entitlements";
import { getChatCompletion } from "@/lib/llm";
import type {
  IdentitySignatureReportArtifactContent,
  PathOptionsArtifactContent,
  PathPlanArtifactContent,
} from "@/lib/artifact-schemas";
import { getCurrentArtifact } from "@/lib/artifacts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function buildContextBlock(userId: string): Promise<string> {
  const supabase = createServiceClient();
  const parts: string[] = [];

  const { data: reportArtifact } = await getCurrentArtifact<{ content: unknown }>(
    supabase,
    userId,
    "identity_report",
    { status: "ready", select: "content" },
  );

  const report = reportArtifact?.content as IdentitySignatureReportArtifactContent | null;

  if (report) {
    const named = report.cover?.named_identity ?? "";
    const primaryNames = (report.signature_profile_summary?.primary_signatures ?? [])
      .map((s) => s.name)
      .join(", ");
    const workStyle = report.how_you_operate?.work_style ?? "";
    const thinkingStyle = report.how_you_operate?.thinking_style ?? "";

    parts.push("## Identity");
    if (named) parts.push(`Named Identity: ${named}`);
    if (primaryNames) parts.push(`Primary Signatures: ${primaryNames}`);
    if (workStyle) parts.push(`Work Style: ${workStyle}`);
    if (thinkingStyle) parts.push(`Thinking Style: ${thinkingStyle}`);
  }

  const { data: selection } = await supabase
    .from("path_selections")
    .select("path_options_artifact_id, path_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selection) {
    const { data: pathOptionsArtifact } = await supabase
      .from("artifacts")
      .select("content")
      .eq("id", selection.path_options_artifact_id)
      .eq("type", "path_options")
      .maybeSingle();

    const pathOptions = pathOptionsArtifact?.content as PathOptionsArtifactContent | null;
    const chosenPath = pathOptions?.options?.find((o) => o.id === selection.path_id);

    if (chosenPath) {
      parts.push("\n## Chosen Path");
      parts.push(`Name: ${chosenPath.name}`);
      parts.push(`Thesis: ${chosenPath.thesis}`);
    }

    const { data: planArtifact } = await getCurrentArtifact<{ content: unknown }>(
      supabase,
      userId,
      "path_plan",
      {
        match: {
          path_options_artifact_id: selection.path_options_artifact_id,
          path_id: selection.path_id,
        },
        status: "ready",
        select: "content",
      },
    );

    const plan = planArtifact?.content as PathPlanArtifactContent | null;

    if (plan) {
      const phaseNames = (plan.full_path ?? [])
        .map((p) => `Phase ${p.phase_number}: ${p.name}`)
        .join(", ");
      const startHere = (plan.start_here ?? [])
        .map((a) => `- ${a.action}`)
        .join("\n");

      parts.push("\n## Current Plan");
      if (phaseNames) parts.push(`Phases: ${phaseNames}`);
      if (startHere) parts.push(`Start Here Actions:\n${startHere}`);
    }
  } else {
    // #129 Stage D: path_selections is the old 4-card flow's own storage.
    // A user who named a project through the new checkpoint-guided flow has
    // no row here at all — writing one would leave /plan polling forever
    // for a path_plan artifact the new flow never generates (see
    // docs/changelogs/2026-08-26.md). Fall back to path_checkpoint_result
    // directly so Mentor still has real path/plan context for these users,
    // without touching path_selections or /plan at all.
    const { data: resultArtifact } = await getCurrentArtifact<{ content: unknown }>(
      supabase,
      userId,
      "path_checkpoint_result",
      { status: "ready", select: "content" },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resultArtifact?.content as any;

    if (result) {
      parts.push("\n## Chosen Path");
      if (result.project_name) parts.push(`Name: ${result.project_name}`);
      if (result.thesis) parts.push(`Thesis: ${result.thesis}`);

      const objectiveNames = Array.isArray(result.master_strategy)
        ? result.master_strategy.map((o: { name: string }) => o.name).join(", ")
        : "";
      const seedActions = Array.isArray(result.plan_seed_actions)
        ? result.plan_seed_actions.map((a: string) => `- ${a}`).join("\n")
        : "";

      parts.push("\n## Current Plan");
      if (objectiveNames) parts.push(`Objectives: ${objectiveNames}`);
      if (seedActions) parts.push(`Start Here Actions:\n${seedActions}`);
    }
  }

  return parts.length ? parts.join("\n") : "(No profile context loaded yet.)";
}

function buildSystemPrompt(contextBlock: string): string {
  return `You are the Zyrro Mentor — a grounded, direct career and identity coach. You already know who this user is from their completed Identity Report, chosen path, and plan.

${contextBlock}

Your role:
- Help the user act on and stay accountable to their plan's Start Here actions and phases.
- Give clear, direct guidance. Do not withhold your perspective.
- When they bring a decision, situation, or stuck point — engage with it concretely. Reference their signatures, path, or plan actions where relevant.
- Keep the conversation focused on career, identity, and their chosen path. If serious personal distress surfaces, respond with care and point toward appropriate human support — do not play therapist.
- Never re-run the questionnaire. Never re-generate the identity report. That work is done.

Voice: calm, grounded, direct. Short clean paragraphs. No therapeutic or soothing language.

On the first message (the trigger), open with a brief personalised greeting that names their identity and chosen path, then ask what they want to work on today. Keep it to 2-3 short paragraphs.`;
}

async function runChat(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const content = await getChatCompletion({
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: 0.7,
  });
  return content ?? "No response.";
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitled = await hasEntitlement(user.id, "subscription_payment");
    if (!entitled) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    const body = await req.json();
    const messages = body.messages as ChatMessage[] | undefined;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    const contextBlock = await buildContextBlock(user.id);
    const systemPrompt = buildSystemPrompt(contextBlock);
    const reply = await runChat(systemPrompt, messages);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Mentor API error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
