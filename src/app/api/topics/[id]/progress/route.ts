import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const topicId = params.id;
    const body = await req.json();

    const {
      checklistDone,
      checklistItems,
      assessmentScore,
      caseMode,
      unfamiliarConcepts,
      assessmentFeedback,
      lastSessionSummary,
      studyTimeSeconds,
      learningPathCompleted,
      assessmentType,
    } = body as {
      checklistDone?: boolean;
      checklistItems?: Array<{ id: string; completed: boolean }>;
      assessmentScore?: number;
      caseMode?: 1 | 2;
      unfamiliarConcepts?: string[];
      assessmentFeedback?: unknown;
      lastSessionSummary?: string;
      studyTimeSeconds?: number;
      learningPathCompleted?: string[];
      conceptStatusUpdates?: Array<{ conceptId: string; status: string }>;
      assessmentType?: "main" | "post_source" | "checkpoint" | "active_recall";
    };
    const conceptStatusUpdates = body.conceptStatusUpdates;

    // Resolve topic by id or title
    let resolvedTopicId = topicId;
    if (!/^[0-9a-f-]{36}$/i.test(topicId)) {
      const { data: topics } = await supabase
        .from("topics")
        .select("id, title")
        .eq("user_id", userId);
      const match = (topics ?? []).find(
        (t) => encodeURIComponent(t.title) === topicId
      );
      if (match) resolvedTopicId = match.id;
    }

    // Update checklist items if provided
    if (checklistItems?.length) {
      for (const item of checklistItems) {
        await supabase
          .from("checklist_items")
          .update({ completed: item.completed })
          .eq("topic_id", resolvedTopicId)
          .eq("id", item.id);
      }
    }

    // Upsert progress
    const progressUpdates: Record<string, unknown> = {
      user_id: userId,
      topic_id: resolvedTopicId,
      updated_at: new Date().toISOString(),
    };
    if (typeof checklistDone === "boolean")
      progressUpdates.checklist_completed = checklistDone;
    if (typeof assessmentScore === "number") {
      progressUpdates.assessment_score = assessmentScore;
      progressUpdates.last_assessment_at = new Date().toISOString();
      const { data: existing } = await supabase
        .from("progress")
        .select("attempt_count")
        .eq("user_id", userId)
        .eq("topic_id", resolvedTopicId)
        .single();
      progressUpdates.attempt_count = (existing?.attempt_count ?? 0) + 1;
    }
    if (caseMode === 1 || caseMode === 2) progressUpdates.case = caseMode;
    if (Array.isArray(unfamiliarConcepts))
      progressUpdates.unfamiliar_concepts = unfamiliarConcepts;
    if (assessmentFeedback != null)
      progressUpdates.assessment_feedback = assessmentFeedback;
    if (lastSessionSummary != null)
      progressUpdates.last_session_summary = lastSessionSummary;
    if (typeof studyTimeSeconds === "number" && studyTimeSeconds > 0) {
      const { data: existing } = await supabase
        .from("progress")
        .select("study_time_seconds")
        .eq("user_id", userId)
        .eq("topic_id", resolvedTopicId)
        .single();
      const prev = (existing as { study_time_seconds?: number })?.study_time_seconds ?? 0;
      progressUpdates.study_time_seconds = prev + studyTimeSeconds;
    }
    if (Array.isArray(learningPathCompleted) && learningPathCompleted.length > 0) {
      progressUpdates.learning_path = learningPathCompleted;
    }

    // Update concept statuses (knowledge map: grey -> amber -> green/red)
    if (Array.isArray(conceptStatusUpdates) && conceptStatusUpdates.length > 0) {
      const validStatuses = ["not_started", "shaky", "mastered", "misconception"];
      for (const { conceptId, status } of conceptStatusUpdates) {
        if (validStatuses.includes(status)) {
          await supabase
            .from("concepts")
            .update({ status })
            .eq("id", conceptId)
            .eq("topic_id", resolvedTopicId);
        }
      }
    }

    await supabase.from("progress").upsert(progressUpdates, {
      onConflict: "user_id,topic_id",
    });

    // Log assessment if score provided (assessments table)
    if (typeof assessmentScore === "number") {
      const typeMap = {
        main: "quiz",
        post_source: "post_source_quiz",
        checkpoint: "quiz",
        active_recall: "quiz",
      };
      const type = typeMap[assessmentType ?? "main"] ?? "quiz";
      const { error: assessErr } = await supabase.from("assessments").insert({
        topic_id: resolvedTopicId,
        user_id: userId,
        type,
        score: assessmentScore,
        feedback: assessmentFeedback ?? {},
        misconceptions: (assessmentFeedback as { misconceptions?: string[] })?.misconceptions ?? [],
      });
      if (assessErr) console.warn("Assessments insert skipped:", assessErr.message);
    }

    // Update topic current_step and understanding_score
    const topicUpdates: Record<string, unknown> = {};
    if (typeof assessmentScore === "number") {
      topicUpdates.understanding_score = assessmentScore;
      topicUpdates.current_step =
        caseMode === 1 ? "case1" : caseMode === 2 ? "learning_path" : "assessment";
      topicUpdates.status = assessmentScore >= 100 ? "mastered" : "in_progress";
    }
    if (checklistDone && assessmentScore == null) {
      topicUpdates.current_step = "assessment";
    }
    if (Object.keys(topicUpdates).length > 0) {
      await supabase
        .from("topics")
        .update(topicUpdates)
        .eq("id", resolvedTopicId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Progress update error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
