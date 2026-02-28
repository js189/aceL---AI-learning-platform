import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { featherless, FEATHERLESS_CHAT_MODEL } from "@/lib/featherless";

const QUIZ_SYSTEM = `You are an expert tutor creating a comprehensive quiz that tests deep understanding.

CRITICAL: Output ONLY a valid JSON object. No markdown, no code blocks, no explanation, no other text. Start with { and end with }.

{
  "questions": [
    {
      "id": "q1",
      "type": "mcq" | "short",
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "expectedAnswer": "Correct answer or key points"
    }
  ]
}

Rules:
- Generate a MINIMUM of 2-3 questions per concept in the checklist. More if content is substantial.
- Vary question types: application (apply knowledge to new situations), analysis (compare, contrast, explain why), edge cases (what happens when X?), not just recall.
- Test deep understanding — avoid surface-level definitions. Ask "why", "how would you", "what if", "compare", "explain the relationship".
- Mix MCQ and short-answer. Short answers should require 2-4 sentences.
- Base strictly on the provided concepts. Be clear and fair.`;

export async function POST(req: NextRequest) {
  try {
    await getServerSession(authOptions);

    const body = await req.json();
    const { concepts, style, sourceMaterial, freshRecall } = body as {
      concepts: Array<{ title: string; description?: string }>;
      style?: string;
      sourceMaterial?: boolean;
      freshRecall?: boolean;
    };

    if (!concepts?.length) {
      return NextResponse.json(
        { error: "Missing or empty concepts" },
        { status: 400 }
      );
    }

    const text = concepts
      .map((c) => `${c.title}${c.description ? `: ${c.description}` : ""}`)
      .join("\n");

    const varietyHint = freshRecall
      ? `\n\nIMPORTANT: Generate completely NEW and DIFFERENT questions from previous sessions. Vary the question types, angles, and wording. Do not repeat questions.`
      : "";
    const sourceHint = sourceMaterial && freshRecall
      ? "\n\nThis is a RETRY. Generate completely DIFFERENT questions covering the same material. New wording, different angles."
      : "";
    const userPrompt = sourceMaterial
      ? `Learning style: ${style ?? "mixed"}\n\nChecklist items (source material just studied — generate a SHORT quiz of 3-5 questions TOTAL, strictly from these):\n${text}\n\nGenerate a short quiz JSON. Base questions STRICTLY on the source material listed. Mix 1-2 MCQ and 1-2 short-answer.${sourceHint}`
      : `Learning style: ${style ?? "mixed"}\n\nConcepts (generate 2-3+ questions per concept):\n${text}\n\nGenerate a comprehensive quiz JSON. Include application, analysis, and edge-case questions — not just recall.${varietyHint}`;

    const messages = [
      { role: "system" as const, content: QUIZ_SYSTEM },
      { role: "user" as const, content: userPrompt },
    ];
    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_CHAT_MODEL,
      messages,
      max_tokens: 2000,
      temperature: freshRecall ? 0.5 : 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: { questions?: Array<{ id: string; type: string; question: string; options?: string[]; expectedAnswer: string }> };
    const extractJson = (s: string): string | null => {
      const start = s.indexOf("{");
      if (start < 0) return null;
      let depth = 0;
      let inStr = false;
      let strChar = "";
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
          if (c === "\\" && i + 1 < s.length) {
            i++;
            continue;
          }
          if (c === strChar) inStr = false;
          continue;
        }
        if (c === '"' || c === "'") {
          inStr = true;
          strChar = c;
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) return s.slice(start, i + 1);
        }
      }
      return null;
    };
    try {
      let cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/g, "")
        .trim();
      const extracted = extractJson(cleaned) ?? cleaned.match(/\{[\s\S]*\}/)?.[0];
      parsed = JSON.parse(extracted ?? cleaned);
    } catch {
      const extracted = extractJson(raw) ?? raw.match(/\{[\s\S]*\}/)?.[0];
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch {
          console.warn("Quiz JSON parse failed, using fallback. Raw:", raw.slice(0, 500));
          parsed = { questions: [] };
        }
      } else {
        console.warn("Quiz: no JSON found, using fallback. Raw:", raw.slice(0, 500));
        parsed = { questions: [] };
      }
    }

    let questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((q) => q && typeof q.question === "string")
      .map((q, i) => ({
        id: String(q?.id ?? `q${i + 1}`),
        type: (q?.type === "mcq" ? "mcq" : "short") as "mcq" | "short",
        question: String(q.question ?? ""),
        options: Array.isArray(q?.options) ? q.options.filter((o) => typeof o === "string") : undefined,
        expectedAnswer: String(q?.expectedAnswer ?? ""),
      }))
      .filter((q) => q.question.length > 0);
    if (sourceMaterial && questions.length > 5) {
      questions = questions.slice(0, 5);
    }
    if (questions.length === 0) {
      questions = concepts.slice(0, 5).map((c, i) => ({
        id: `fallback-q${i + 1}`,
        type: "short" as const,
        question: `Explain ${c.title} in your own words. What are the key ideas?`,
        expectedAnswer: c.description ?? `Key points about ${c.title}`,
        options: undefined as string[] | undefined,
      }));
    }
    return NextResponse.json({ questions });
  } catch (e) {
    console.error("Quiz generation error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quiz generation failed" },
      { status: 500 }
    );
  }
}
