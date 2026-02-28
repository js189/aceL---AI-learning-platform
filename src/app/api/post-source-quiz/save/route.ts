import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type QuestionResult = {
  id: string;
  question: string;
  expectedAnswer: string;
  studentAnswer: string;
  correct: boolean;
  score: number;
  feedback?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      topicId,
      score,
      questions,
      attemptedAt,
    } = body as {
      topicId: string;
      score: number;
      questions: QuestionResult[];
      attemptedAt?: string;
    };

    if (!topicId || typeof score !== "number") {
      return NextResponse.json(
        { error: "Missing topicId or score" },
        { status: 400 }
      );
    }

    let resolvedTopicId = topicId;
    if (!/^[0-9a-f-]{36}$/i.test(topicId)) {
      const { data: topics } = await supabase
        .from("topics")
        .select("id, title")
        .eq("user_id", userId);
      const match = (topics ?? []).find(
        (t) => encodeURIComponent((t as { title?: string }).title ?? "") === topicId
      );
      if (match) resolvedTopicId = (match as { id: string }).id;
    }

    const { error } = await supabase.from("assessments").insert({
      topic_id: resolvedTopicId,
      user_id: userId,
      type: "post_source_quiz",
      score,
      feedback: {
        questions: Array.isArray(questions) ? questions : [],
      },
      misconceptions: [],
      attempted_at: attemptedAt ?? new Date().toISOString(),
    });

    if (error) {
      console.error("Post-source quiz save error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Post-source quiz save error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
