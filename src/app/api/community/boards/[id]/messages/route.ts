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

    const body = await req.json();
    const { content, parentId, username, milestoneLabel } = body as {
      content?: string;
      parentId?: string;
      username?: string;
      milestoneLabel?: string;
    };

    const displayName =
      username?.trim() ||
      (session?.user as { name?: string })?.name ||
      (session?.user as { email?: string })?.email?.split("@")[0] ||
      "Student";

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("discussion_messages")
      .insert({
        board_id: params.id,
        user_id: userId,
        username: displayName,
        milestone_label: milestoneLabel ?? "",
        content: content.trim(),
        parent_id: parentId || null,
        reactions: {},
      })
      .select("id, username, milestone_label, content, parent_id, reactions, created_at")
      .single();

    if (error) {
      console.error("Message create error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      username: data.username,
      milestoneLabel: data.milestone_label ?? "",
      content: data.content,
      parentId: data.parent_id ?? undefined,
      reactions: data.reactions ?? {},
      timestamp: data.created_at,
    });
  } catch (e) {
    console.error("Message create error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
