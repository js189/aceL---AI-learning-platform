import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llm, LLM_FAST_MODEL, LLM_VISION_MODEL } from "@/lib/llm";

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

const TUTOR_SYSTEM = `You are a warm, patient AI tutor. You never give full answers directly; you scaffold by asking one guiding question at a time. You celebrate small correct steps. If the student is stuck after two attempts, break the concept into a smaller sub-question. Use encouraging, non-judgmental language. If they express frustration, acknowledge it with empathy before continuing. Keep responses concise (2-4 sentences).`;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? "anonymous";

    let conceptTitle: string;
    let conceptContext: string | undefined;
    let messages: Array<{ role: "user" | "assistant"; content: string }>;
    let imageFile: File | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      conceptTitle = (formData.get("conceptTitle") as string) ?? "";
      conceptContext = (formData.get("conceptContext") as string) || undefined;
      const messagesStr = formData.get("messages") as string;
      messages = messagesStr ? JSON.parse(messagesStr) : [];
      const file = formData.get("file") as File | null;
      if (file && file.size > 0) {
        const validTypes = ["image/png", "image/jpeg", "image/jpg"];
        if (!validTypes.includes(file.type)) {
          return NextResponse.json({ error: "Only PNG and JPG images are allowed." }, { status: 400 });
        }
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json(
            { error: `Image must be under ${MAX_IMAGE_SIZE_MB}MB.` },
            { status: 400 }
          );
        }
        imageFile = file;
      }
    } else {
      const body = await req.json();
      conceptTitle = body.conceptTitle ?? "";
      conceptContext = body.conceptContext;
      messages = body.messages ?? [];
    }

    if (!conceptTitle || !messages?.length) {
      return NextResponse.json(
        { error: "Missing conceptTitle or messages" },
        { status: 400 }
      );
    }

    const systemContent = `${TUTOR_SYSTEM}\n\nYou are helping the student understand: ${conceptTitle}.${conceptContext ? `\nContext: ${conceptContext}` : ""}\nAsk one question at a time and build on their answers.`;

    const model = imageFile ? LLM_VISION_MODEL : LLM_FAST_MODEL;
    const mappedMessages = messages.slice(-12).map((m: { role: string; content: string }, i: number) => {
      const isLastUser = i === messages.slice(-12).length - 1 && m.role === "user";
      if (isLastUser && imageFile) {
        return {
          role: m.role as "user" | "assistant",
          content: [
            { type: "text" as const, text: m.content || "What can you tell me about this image?" },
            {
              type: "image_url" as const,
              image_url: { url: "" },
            },
          ],
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    if (imageFile) {
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mime = imageFile.type || "image/png";
      const imageUrl = `data:${mime};base64,${base64}`;
      const lastMsg = mappedMessages[mappedMessages.length - 1];
      if (lastMsg && typeof lastMsg.content !== "string" && Array.isArray(lastMsg.content)) {
        const contentArr = lastMsg.content as { type: string; text?: string; image_url?: { url: string } }[];
        const imagePart = contentArr.find((p) => p.type === "image_url");
        if (imagePart && imagePart.image_url) imagePart.image_url.url = imageUrl;
      }
    }

    const completion = await llm.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemContent },
        ...mappedMessages,
      ] as Parameters<typeof llm.chat.completions.create>[0]["messages"],
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
