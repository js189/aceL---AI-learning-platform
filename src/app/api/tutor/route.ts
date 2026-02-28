import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { featherless, FEATHERLESS_FAST_MODEL } from "@/lib/featherless";

const TUTOR_SYSTEM = `You are a warm, patient AI tutor. You never give full answers directly; you scaffold by asking one guiding question at a time. You celebrate small correct steps. If the student is stuck after two attempts, break the concept into a smaller sub-question. Use encouraging, non-judgmental language. If they express frustration, acknowledge it with empathy before continuing. Keep responses concise (2-4 sentences).`;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? "anonymous";

    const body = await req.json();
    const { topicId, conceptTitle, conceptContext, messages } = body as {
      topicId?: string;
      conceptTitle: string;
      conceptContext?: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!conceptTitle || !messages?.length) {
      return NextResponse.json(
        { error: "Missing conceptTitle or messages" },
        { status: 400 }
      );
    }

    const systemContent = `${TUTOR_SYSTEM}\n\nYou are helping the student understand: ${conceptTitle}.${conceptContext ? `\nContext: ${conceptContext}` : ""}\nAsk one question at a time and build on their answers.`;

    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_FAST_MODEL,
      messages: [
        { role: "system", content: systemContent },
        ...messages.slice(-12).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 350,
      temperature: 0.6,
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? "I'm here to help. What would you like to try first?";

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("Tutor error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Tutor failed" },
      { status: 500 }
    );
  }
}
