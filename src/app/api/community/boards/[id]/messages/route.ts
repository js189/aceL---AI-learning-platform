import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const MAX_IMAGE_MB = 5;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

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

    let content = "";
    let parentId: string | undefined;
    let username = "";
    let milestoneLabel = "";
    let imageBase64: string | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      content = (formData.get("content") as string)?.trim() ?? "";
      parentId = (formData.get("parentId") as string) || undefined;
      username = (formData.get("username") as string)?.trim() ?? "";
      milestoneLabel = (formData.get("milestoneLabel") as string) ?? "";
      const file = formData.get("file") as File | null;
      if (file && file.size > 0) {
        if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
          return NextResponse.json({ error: "Only PNG and JPG images allowed." }, { status: 400 });
        }
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: `Image must be under ${MAX_IMAGE_MB}MB.` }, { status: 400 });
        }
        const buf = await file.arrayBuffer();
        const mime = file.type || "image/png";
        imageBase64 = `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
      }
    } else {
      const body = await req.json();
      content = (body.content as string)?.trim() ?? "";
      parentId = body.parentId;
      username = body.username?.trim() ?? "";
      milestoneLabel = body.milestoneLabel ?? "";
    }

    const displayName =
      username ||
      (session?.user as { name?: string })?.name ||
      (session?.user as { email?: string })?.email?.split("@")[0] ||
      "Student";

    if (!content?.trim() && !imageBase64) {
      return NextResponse.json({ error: "Content or image required" }, { status: 400 });
    }

    let finalContent = content.trim() || "(Image)";
    if (imageBase64) {
      finalContent += `\n\n[img:${imageBase64}]`;
    }

    const { data, error } = await supabase
      .from("discussion_messages")
      .insert({
        board_id: params.id,
        user_id: userId,
        username: displayName,
        milestone_label: milestoneLabel ?? "",
        content: finalContent,
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
