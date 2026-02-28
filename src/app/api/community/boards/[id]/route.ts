import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getServerSession(authOptions);
    if (!supabase) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const { data: board, error: boardErr } = await supabase
      .from("discussion_boards")
      .select("id, title, subject, creator_username, created_at")
      .eq("id", params.id)
      .single();

    if (boardErr || !board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const { data: messages, error: msgErr } = await supabase
      .from("discussion_messages")
      .select("id, user_id, username, milestone_label, content, parent_id, reactions, created_at")
      .eq("board_id", params.id)
      .order("created_at", { ascending: true });

    if (msgErr) {
      console.error("Messages fetch error:", msgErr);
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    const msgs = (messages ?? []).map((m: { id?: string; user_id?: string; username?: string; milestone_label?: string; content?: string; parent_id?: string; reactions?: unknown; created_at?: string }) => ({
      id: m.id,
      userId: m.user_id,
      username: m.username,
      milestoneLabel: m.milestone_label ?? "",
      content: m.content,
      parentId: m.parent_id ?? undefined,
      reactions: m.reactions ?? {},
      timestamp: m.created_at,
    }));

    return NextResponse.json({
      id: board.id,
      title: board.title,
      subject: board.subject ?? "",
      creatorUsername: board.creator_username,
      creatorUserId: (board as { user_id?: string }).user_id ?? null,
      createdAt: board.created_at,
      messages: msgs,
    });
  } catch (e) {
    console.error("Board fetch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
