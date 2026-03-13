import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llm, LLM_VISION_MODEL } from "@/lib/llm";

const OCR_SYSTEM = `You are an OCR assistant for student handwritten notes. Your task:
1. Extract ALL readable text from the image, preserving structure (headings, bullet points, numbered lists).
2. For diagrams or figures, describe them in one line of text (e.g. "Diagram showing X and Y").
3. If any part of the handwriting is unclear or ambiguous, include it in your response but wrap it in [UNCLEAR: your best guess] so the student can confirm or correct.
4. Output only the extracted text, no preamble. Use markdown for headings (# ##) and lists where appropriate.`;

export async function POST(req: NextRequest) {
  try {
    await getServerSession(authOptions);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const imageUrl = formData.get("imageUrl") as string | null;

    let imageContent: { type: "image_url"; image_url: { url: string } } | null = null;

    if (file) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mime = file.type || "image/png";
      imageContent = {
        type: "image_url",
        image_url: { url: `data:${mime};base64,${base64}` },
      };
    } else if (imageUrl) {
      imageContent = {
        type: "image_url",
        image_url: { url: imageUrl },
      };
    }

    if (!imageContent) {
      return NextResponse.json(
        { error: "Provide either 'file' (image) or 'imageUrl'" },
        { status: 400 }
      );
    }

    const completion = await llm.chat.completions.create({
      model: LLM_VISION_MODEL,
      messages: [
        { role: "system", content: OCR_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text from this image of handwritten notes. Follow the instructions in the system message." },
            imageContent,
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const hasUnclear = /\[UNCLEAR:/.test(text);

    return NextResponse.json({
      text,
      sourceLabel: "handwritten",
      hasUnclear,
    });
  } catch (e) {
    console.error("OCR error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OCR failed" },
      { status: 500 }
    );
  }
}
