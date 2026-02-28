import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({
        displayName: session?.user?.name ?? (session?.user as { email?: string })?.email?.split("@")[0] ?? "Student",
        bio: "",
        avatarUrl: (session?.user as { image?: string })?.image ?? null,
        streak: 0,
        badges: [],
      });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, bio, avatar_url, streak, badges")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Profile fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      displayName: data?.display_name ?? (session?.user?.name ?? (session?.user as { email?: string })?.email?.split("@")[0] ?? "Student"),
      bio: data?.bio ?? "",
      avatarUrl: data?.avatar_url ?? (session?.user as { image?: string })?.image ?? null,
      streak: data?.streak ?? 0,
      badges: data?.badges ?? [],
    });
  } catch (e) {
    console.error("Profile error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabase) {
      return NextResponse.json({ ok: true });
    }

    const body = await req.json();
    const { displayName, bio, avatarUrl } = body as {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    };

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof displayName === "string") updates.display_name = displayName;
    if (typeof bio === "string") updates.bio = bio;
    if (typeof avatarUrl === "string") updates.avatar_url = avatarUrl;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          email: (session?.user as { email?: string })?.email,
          ...updates,
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Profile update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Profile update error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
