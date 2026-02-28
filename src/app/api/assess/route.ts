import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { featherless, FEATHERLESS_FAST_MODEL } from "@/lib/featherless";

const ASSESSMENT_SYSTEM = `You are a warm, expert tutor assessing a student's understanding. You must respond with a single JSON object (no markdown, no extra text) in this exact shape:

{
  "score": 0-100,
  "reasoning": "2-4 sentences explaining the overall assessment in an encouraging tone",
  "correct": ["list of points they got right"],
  "misconceptions": ["list of incorrect or confused ideas"],
  "unfamiliar": ["list of concepts they didn't mention or seem not to know"]
}

Rules:
- Be encouraging and growth-minded. Never use judgmental language.
- Score 100 only when the response demonstrates full, accurate, DEEP understanding — not just surface definitions.
- For free-form "Explain to AI": test whether they truly understand. Reward: connections between ideas, application to examples, explanation of "why", nuance, edge cases. Deduct for: only definitions, missing key relationships, wrong facts, superficial coverage.
- For quiz answers: compare to the expected answer and partial credit where appropriate.
- Always explain the "why" in reasoning.`;

export async function POST(req: NextRequest) {
  try {
    await getServerSession(authOptions);

    const body = await req.json();
    const {
      conceptTitle,
      conceptContext,
      studentResponse,
      mode,
      expectedAnswer,
    } = body as {
      conceptTitle: string;
      conceptContext?: string;
      studentResponse: string;
      mode: "explanation" | "quiz";
      expectedAnswer?: string;
    };

    if (!conceptTitle || !studentResponse || !mode) {
      return NextResponse.json(
        { error: "Missing conceptTitle, studentResponse, or mode" },
        { status: 400 }
      );
    }

    const userPrompt =
      mode === "quiz" && expectedAnswer
        ? `Concept: ${conceptTitle}\n${conceptContext ? `Context: ${conceptContext}\n` : ""}Student's answer: ${studentResponse}\nExpected answer (for reference): ${expectedAnswer}\n\nAssess the student's answer and return the JSON object.`
        : `Concept: ${conceptTitle}\n${conceptContext ? `Context: ${conceptContext}\n` : ""}Student's explanation:\n${studentResponse}\n\nAssess for DEEP understanding: Did they explain why, connect ideas, use examples, address nuance? Or just give surface definitions? Return the JSON object.`;

    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_FAST_MODEL,
      messages: [
        { role: "system", content: ASSESSMENT_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: {
      score?: number;
      reasoning?: string;
      correct?: string[];
      misconceptions?: string[];
      unfamiliar?: string[];
    };
    try {
      let cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/g, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];
      parsed = JSON.parse(cleaned);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return NextResponse.json(
            { error: "AI returned invalid JSON", raw: raw.slice(0, 300) },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "AI returned invalid JSON", raw: raw.slice(0, 300) },
          { status: 500 }
        );
      }
    }

    const score = Math.min(100, Math.max(0, Number(parsed.score) ?? 0));
    return NextResponse.json({
      score,
      reasoning: parsed.reasoning ?? "Assessment complete.",
      correct: Array.isArray(parsed.correct) ? parsed.correct : [],
      misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : [],
      unfamiliar: Array.isArray(parsed.unfamiliar) ? parsed.unfamiliar : [],
    });
  } catch (e) {
    console.error("Assessment error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Assessment failed" },
      { status: 500 }
    );
  }
}
