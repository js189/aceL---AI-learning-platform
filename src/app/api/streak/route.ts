import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getBadgesForStreak } from "@/lib/badges";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { streak, badges } = body as { streak?: number; badges?: string[] };

    if (typeof streak !== "number" || streak < 0) {
      return NextResponse.json({ error: "Invalid streak" }, { status: 400 });
    }

    const badgeIds = Array.isArray(badges) && badges.length > 0
      ? badges
      : getBadgesForStreak(streak);

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          streak,
          badges: badgeIds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Streak sync error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Streak sync error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
