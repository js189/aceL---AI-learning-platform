import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

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

    const body = await req.json();
    const { emoji, username } = body as { emoji?: string; username?: string };

    const displayName =
      username?.trim() ||
      (session?.user as { name?: string })?.name ||
      (session?.user as { email?: string })?.email?.split("@")[0] ||
      "Anonymous";

    if (!emoji?.trim()) {
      return NextResponse.json({ error: "Emoji required" }, { status: 400 });
    }

    const { data: msg, error: fetchErr } = await supabase
      .from("discussion_messages")
      .select("id, reactions")
      .eq("id", params.id)
      .single();

    if (fetchErr || !msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const reactions = (msg.reactions as Record<string, string[]>) ?? {};
    const users = [...(reactions[emoji] ?? [])];
    const i = users.indexOf(displayName);
    if (i >= 0) users.splice(i, 1);
    else users.push(displayName);

    const updated: Record<string, string[]> = { ...reactions };
    if (users.length === 0) delete updated[emoji];
    else updated[emoji] = users;

    const { error: updateErr } = await supabase
      .from("discussion_messages")
      .update({ reactions: updated })
      .eq("id", params.id);

    if (updateErr) {
      console.error("Reaction update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ reactions: updated });
  } catch (e) {
    console.error("Reaction error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
