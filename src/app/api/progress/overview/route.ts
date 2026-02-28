import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({
        topics: [],
        totalInProgress: 0,
        totalMastered: 0,
        averageScore: 0,
        streak: 0,
        misconceptions: [],
      });
    }

    const { data: topics } = await supabase
      .from("topics")
      .select("id, title, subject, status, understanding_score, last_accessed_at, created_at")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("last_accessed_at", { ascending: false });

    const topicIds = (topics ?? []).map((t) => t.id);

    let progressList: { topic_id: string; checklist_completed: boolean; assessment_score?: number; attempt_count?: number; study_time_seconds?: number }[] = [];
    if (topicIds.length > 0) {
      const { data: prog } = await supabase
        .from("progress")
        .select("topic_id, checklist_completed, assessment_score, attempt_count, study_time_seconds")
        .eq("user_id", userId)
        .in("topic_id", topicIds);
      progressList = prog ?? [];
    }

    let assessmentScores: { topic_id: string; score: number; attempted_at: string }[] = [];
    if (topicIds.length > 0) {
      const { data: ass } = await supabase
        .from("assessments")
        .select("topic_id, score, attempted_at")
        .eq("user_id", userId)
        .in("topic_id", topicIds)
        .order("attempted_at", { ascending: true });
      assessmentScores = ass ?? [];
    }

    let misconceptions: { id: string; topic_id: string; concept_title?: string; misconception_text: string; is_resolved: boolean; created_at: string }[] = [];
    const { data: misc } = await supabase
      .from("misconceptions_log")
      .select("id, topic_id, concept_title, misconception_text, is_resolved, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    misconceptions = misc ?? [];

    const { data: profile } = await supabase
      .from("profiles")
      .select("streak, badges")
      .eq("user_id", userId)
      .single();

    const progressByTopic = Object.fromEntries(
      progressList.map((p) => [p.topic_id, p])
    );
    const scoresByTopic: Record<string, { score: number; attempted_at: string }[]> = {};
    for (const a of assessmentScores) {
      if (!scoresByTopic[a.topic_id]) scoresByTopic[a.topic_id] = [];
      scoresByTopic[a.topic_id].push({
        score: a.score,
        attempted_at: a.attempted_at,
      });
    }

    const conceptCounts: Record<string, { total: number; mastered: number }> = {};
    for (const tid of topicIds) {
      const { count: total } = await supabase
        .from("concepts")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", tid);
      const { count: mastered } = await supabase
        .from("concepts")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", tid)
        .eq("status", "mastered");
      conceptCounts[tid] = { total: total ?? 0, mastered: mastered ?? 0 };
    }

    const topicSummaries = (topics ?? []).map((t) => {
      const prog = progressByTopic[t.id];
      const scores = scoresByTopic[t.id] ?? [];
      const concepts = conceptCounts[t.id] ?? { total: 0, mastered: 0 };
      return {
        id: t.id,
        title: t.title,
        subject: t.subject,
        status: t.status ?? "in_progress",
        currentScore: t.understanding_score ?? prog?.assessment_score,
        attemptCount: prog?.attempt_count ?? scores.length,
        conceptsMastered: concepts.mastered,
        conceptsTotal: concepts.total,
        studyTimeSeconds: prog?.study_time_seconds ?? 0,
        lastAccessed: t.last_accessed_at,
        scoreHistory: scores,
      };
    });

    const totalInProgress = topicSummaries.filter((t) => t.status === "in_progress" || t.status === "at_risk").length;
    const totalMastered = topicSummaries.filter((t) => t.status === "mastered").length;
    const scoresWithValues = topicSummaries
      .filter((t) => t.currentScore != null)
      .map((t) => t.currentScore as number);
    const averageScore = scoresWithValues.length
      ? Math.round(
          scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length
        )
      : 0;

    return NextResponse.json({
      topics: topicSummaries,
      totalInProgress,
      totalMastered,
      averageScore,
      streak: profile?.streak ?? 0,
      badges: profile?.badges ?? [],
      misconceptions,
    });
  } catch (e) {
    console.error("Progress overview error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load progress" },
      { status: 500 }
    );
  }
}
