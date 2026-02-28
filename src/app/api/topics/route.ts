import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ topics: [] });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "all"; // all | in_progress | mastered | review_due | archived

    let query = supabase
      .from("topics")
      .select(`
        id,
        title,
        summary,
        subject,
        status,
        current_step,
        understanding_score,
        last_accessed_at,
        is_pinned,
        is_archived,
        created_at,
        raw_sources
      `)
      .eq("user_id", userId)
      .order("is_pinned", { ascending: false })
      .order("last_accessed_at", { ascending: false });

    if (filter !== "all") {
      if (filter === "archived") {
        query = query.eq("is_archived", true);
      } else {
        query = query.eq("is_archived", false).eq("status", filter);
      }
    } else {
      query = query.eq("is_archived", false);
    }

    const { data: topics, error } = await query;

    if (error) {
      console.error("Topics fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch progress for each topic (checklist completion, etc.)
    const topicIds = (topics ?? []).map((t) => t.id);
    let progressMap: Record<string, { checklistCompleted: boolean; assessmentScore?: number }> = {};
    if (topicIds.length > 0) {
      const { data: progressRows } = await supabase
        .from("progress")
        .select("topic_id, checklist_completed, assessment_score")
        .eq("user_id", userId)
        .in("topic_id", topicIds);
      for (const p of progressRows ?? []) {
        progressMap[p.topic_id] = {
          checklistCompleted: p.checklist_completed,
          assessmentScore: p.assessment_score,
        };
      }
    }

    // Fetch checklist counts
    const checklistCounts: Record<string, { done: number; total: number }> = {};
    for (const t of topics ?? []) {
      const { count: total } = await supabase
        .from("checklist_items")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", t.id);
      const { count: done } = await supabase
        .from("checklist_items")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", t.id)
        .eq("completed", true);
      checklistCounts[t.id] = { done: done ?? 0, total: total ?? 0 };
    }

    const enriched = (topics ?? []).map((t) => ({
      ...t,
      topicId: t.id,
      progress: progressMap[t.id],
      checklist: checklistCounts[t.id],
      concepts: [], // Minimal for cards
    }));

    return NextResponse.json({ topics: enriched });
  } catch (e) {
    console.error("Topics API error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch topics" },
      { status: 500 }
    );
  }
}
