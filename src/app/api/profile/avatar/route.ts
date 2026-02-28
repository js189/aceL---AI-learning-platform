import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const BUCKET = "avatars";
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max 2MB." },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}-${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      if (error.message?.includes("Bucket not found") || error.message?.includes("not found")) {
        const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
          public: true,
        });
        if (createErr) {
          console.error("Create bucket error:", createErr);
          return NextResponse.json(
            { error: "Storage not configured. Create an 'avatars' bucket in Supabase Storage." },
            { status: 500 }
          );
        }
        const { error: retryErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, buffer, { contentType: file.type, upsert: true });
        if (retryErr) {
          console.error("Upload retry error:", retryErr);
          return NextResponse.json({ error: retryErr.message }, { status: 500 });
        }
      } else {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    console.error("Avatar upload error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
