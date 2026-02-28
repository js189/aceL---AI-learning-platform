import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    const id = params.id;

    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Resolve id: could be UUID or encoded title (legacy)
    let topicId = id;
    let topic = null;

    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId ?? "")
        .single();
      if (!error) topic = data;
    }

    if (!topic && userId) {
      const { data: topics } = await supabase
        .from("topics")
        .select("*")
        .eq("user_id", userId);
      const byTitle = (topics ?? []).find(
        (t) => encodeURIComponent(t.title) === id
      );
      if (byTitle) {
        topic = byTitle;
        topicId = topic.id;
      }
    }

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Update last_accessed_at
    await supabase
      .from("topics")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", topic.id);

    const [conceptsRes, checklistRes, progressRes] = await Promise.all([
      supabase
        .from("concepts")
        .select("id, title, description, source, status, order")
        .eq("topic_id", topic.id)
        .order("order"),
      supabase
        .from("checklist_items")
        .select("id, concept_id, title, completed, source")
        .eq("topic_id", topic.id),
      supabase
        .from("progress")
        .select("*")
        .eq("user_id", userId)
        .eq("topic_id", topic.id)
        .single(),
    ]);

    const concepts = (conceptsRes.data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      source: c.source,
      status: c.status ?? "not_started",
      order: c.order ?? 0,
    }));

    const checklist = (checklistRes.data ?? []).map((c) => ({
      id: c.id,
      conceptId: c.concept_id,
      title: c.title,
      completed: c.completed ?? false,
      source: c.source,
    }));

    const progress = progressRes.data;
    const lastSessionSummary = progress?.last_session_summary;

    return NextResponse.json({
      topicId: topic.id,
      title: topic.title,
      summary: topic.summary ?? "",
      subject: topic.subject ?? "",
      concepts,
      checklist,
      rawSources: topic.raw_sources ?? [],
      currentStep: topic.current_step ?? "upload",
      understandingScore: topic.understanding_score ?? progress?.assessment_score,
      lastSessionSummary,
      progress: progress
        ? {
            checklistDone: progress.checklist_completed,
            assessmentScore: progress.assessment_score,
            caseMode: progress.case ?? 2,
            unfamiliarConcepts: progress.unfamiliar_concepts ?? [],
            assessmentFeedback: progress.assessment_feedback,
            learningPathCompleted: Array.isArray(progress.learning_path)
              ? (progress.learning_path as string[])
              : [],
          }
        : null,
    });
  } catch (e) {
    console.error("Topic fetch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch topic" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = params.id;
    const body = await req.json();

    const { is_pinned, is_archived, current_step, status, understanding_score } =
      body as {
        is_pinned?: boolean;
        is_archived?: boolean;
        current_step?: string;
        status?: string;
        understanding_score?: number;
      };

    const updates: Record<string, unknown> = {};
    if (typeof is_pinned === "boolean") updates.is_pinned = is_pinned;
    if (typeof is_archived === "boolean") updates.is_archived = is_archived;
    if (current_step) updates.current_step = current_step;
    if (status) updates.status = status;
    if (typeof understanding_score === "number")
      updates.understanding_score = understanding_score;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!topic) {
      const { data: byTitle } = await supabase
        .from("topics")
        .select("id, title")
        .eq("user_id", userId);
      const match = (byTitle ?? []).find(
        (t) => encodeURIComponent(t.title) === id
      );
      if (!match) {
        return NextResponse.json({ error: "Topic not found" }, { status: 404 });
      }
      const { error } = await supabase
        .from("topics")
        .update(updates)
        .eq("id", match.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("topics")
        .update(updates)
        .eq("id", topic.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Topic patch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = params.id;

    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    let targetId = topic?.id;
    if (!targetId) {
      const { data: topics } = await supabase
        .from("topics")
        .select("id, title")
        .eq("user_id", userId);
      const match = (topics ?? []).find(
        (t) => encodeURIComponent(t.title) === id
      );
      targetId = match?.id;
    }

    if (!targetId) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("topics")
      .delete()
      .eq("id", targetId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Topic delete error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
