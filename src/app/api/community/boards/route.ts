import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    await getServerSession(authOptions);
    if (!supabase) {
      return NextResponse.json({ boards: [] });
    }

    const { data: boards, error } = await supabase
      .from("discussion_boards")
      .select("id, user_id, creator_username, title, subject, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Boards fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const boardIds = (boards ?? []).map((b: { id: string }) => b.id);
    const counts: Record<string, number> = {};
    const lastActivity: Record<string, string> = {};
    if (boardIds.length > 0) {
      const { data: msgData } = await supabase
        .from("discussion_messages")
        .select("board_id, created_at")
        .in("board_id", boardIds);
      for (const m of msgData ?? []) {
        const bid = (m as { board_id: string; created_at: string }).board_id;
        const at = (m as { board_id: string; created_at: string }).created_at;
        counts[bid] = (counts[bid] ?? 0) + 1;
        const prev = lastActivity[bid];
        if (!prev || at > prev) lastActivity[bid] = at;
      }
    }

    const enriched = (boards ?? []).map((b: { id: string; creator_username: string; created_at: string }) => ({
      id: b.id,
      title: b.title,
      subject: b.subject ?? "",
      creatorUsername: b.creator_username,
      createdAt: b.created_at,
      lastActivity: lastActivity[b.id] ?? b.created_at,
      messages: [],
      messageCount: counts[b.id] ?? 0,
    }));

    return NextResponse.json({ boards: enriched });
  } catch (e) {
    console.error("Boards error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, subject, username } = body as {
      title?: string;
      subject?: string;
      username?: string;
    };

    const displayName =
      username?.trim() ||
      (session?.user as { name?: string })?.name ||
      (session?.user as { email?: string })?.email?.split("@")[0] ||
      "Student";

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("discussion_boards")
      .insert({
        user_id: userId,
        creator_username: displayName,
        title: title.trim(),
        subject: (subject ?? "").trim(),
      })
      .select("id, title, subject, creator_username, created_at")
      .single();

    if (error) {
      console.error("Board create error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      title: data.title,
      subject: data.subject ?? "",
      creatorUsername: data.creator_username,
      createdAt: data.created_at,
      messages: [],
    });
  } catch (e) {
    console.error("Board create error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
