import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { featherless, FEATHERLESS_FAST_MODEL } from "@/lib/featherless";

const STYLE_SYSTEM = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no other text.

{
  "mode": "visual" | "reading_writing" | "auditory_video" | "kinesthetic",
  "preferredInput": "watch" | "read" | "draw" | "talk",
  "whenStuck": "example" | "diagram" | "story" | "steps",
  "reviewStyle": "flashcards" | "notes" | "mindmap" | "practice",
  "pace": "slow_guided" | "overview_first",
  "interests": ["topic1", "topic2"]
}

Mapping rules:
- Watching someone explain → auditory_video; Reading about it → reading_writing; Drawing it out → visual; Talking it through → kinesthetic
- An example → kinesthetic; A diagram → visual; A story → auditory_video; Step-by-step instructions → reading_writing
- Flashcards/Summary notes → reading_writing; Mind maps → visual; Practice questions → kinesthetic
- Slowly with guidance → slow_guided; Overview first → overview_first
- For interests: split the answer by comma and take up to 5 topics.

Output only the JSON object.`;

const QUESTIONS = [
  "When you learn something new, do you prefer watching someone explain it, reading about it, drawing it out, or talking it through?",
  "When you get stuck, what helps most: an example, a diagram, a story, or step-by-step instructions?",
  "How do you like to review what you have learned: flashcards, summary notes, mind maps, or practice questions?",
  "Do you prefer working through things slowly with guidance or getting an overview first and filling in gaps later?",
  "What subjects or topics do you enjoy most outside of school? (used to personalise analogies)",
];

export async function GET() {
  return NextResponse.json({ questions: QUESTIONS });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    const body = await req.json();
    const { answers } = body as { answers: string[] };

    if (!answers || answers.length < 5) {
      return NextResponse.json(
        { error: "Provide 5 answers corresponding to the 5 questions" },
        { status: 400 }
      );
    }

    const prompt = QUESTIONS.map((q, i) => `Q: ${q}\nA: ${answers[i] ?? ""}`).join("\n\n");

    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_FAST_MODEL,
      messages: [
        { role: "system", content: STYLE_SYSTEM },
        { role: "user", content: prompt },
      ],
      max_tokens: 350,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: {
      mode?: string;
      preferredInput?: string;
      whenStuck?: string;
      reviewStyle?: string;
      pace?: string;
      interests?: string[];
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
            { error: "AI returned invalid JSON", raw: raw.slice(0, 200) },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "AI returned invalid JSON", raw: raw.slice(0, 200) },
          { status: 500 }
        );
      }
    }

    let interests: string[] = [];
    const interestsRaw = parsed.interests as string[] | string | undefined;
    if (Array.isArray(interestsRaw)) {
      interests = interestsRaw.filter((x) => typeof x === "string");
    } else if (typeof interestsRaw === "string") {
      interests = interestsRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    }

    const profile = {
      mode: parsed.mode ?? "reading_writing",
      preferredInput: parsed.preferredInput ?? "read",
      whenStuck: parsed.whenStuck ?? "steps",
      reviewStyle: parsed.reviewStyle ?? "notes",
      pace: parsed.pace ?? "slow_guided",
      interests,
    };

    if (userId) {
      const { supabase } = await import("@/lib/supabase");
      if (supabase) {
        await supabase.from("profiles").upsert(
        {
          user_id: userId,
          learning_style_profile: profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
        );
      }
    }

    return NextResponse.json({ profile, questions: QUESTIONS });
  } catch (e) {
    console.error("Learning style error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Learning style analysis failed" },
      { status: 500 }
    );
  }
}
