import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabase) {
      return NextResponse.json({ ok: true, synced: false });
    }

    const user = session.user as { name?: string; email?: string; image?: string };
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        email: user.email ?? undefined,
        display_name: user.name ?? user.email?.split("@")[0] ?? "Student",
        avatar_url: user.image ?? undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Ensure profile error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = await supabase
      .from("profiles")
      .select("streak, badges")
      .eq("user_id", userId)
      .single();

    return NextResponse.json({
      ok: true,
      synced: true,
      streak: data?.streak ?? 0,
      badges: data?.badges ?? [],
    });
  } catch (e) {
    console.error("Ensure profile error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
