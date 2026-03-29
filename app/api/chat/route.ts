import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Zyrro, a calm and grounded guide.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const reply =
      response.choices[0]?.message?.content || "No response.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);

    return NextResponse.json(
      { error: "Something went wrong calling OpenAI." },
      { status: 500 }
    );
  }
}