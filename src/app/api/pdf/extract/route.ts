import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No PDF file provided" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "PDF must be under 10 MB" },
        { status: 400 }
      );
    }

    let pdfParse: (buffer: Buffer) => Promise<{ text?: string; numpages?: number }>;
    try {
      const mod = await import("pdf-parse");
      pdfParse = mod.default ?? mod;
    } catch (importErr) {
      console.error("pdf-parse import error:", importErr);
      return NextResponse.json(
        { error: "PDF library failed to load" },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);

    const text = typeof data?.text === "string" ? data.text : "";
    const numPages = typeof data?.numpages === "number" ? data.numpages : 0;

    return NextResponse.json({
      text,
      numPages,
    });
  } catch (e) {
    console.error("PDF extract error:", e);
    let message = e instanceof Error ? e.message : "PDF extraction failed";
    if (message.includes("Invalid") || message.includes("corrupt") || message.includes("buffer")) {
      message = "Could not read this PDF. It may be corrupted or in an unsupported format. Try a different file.";
    }
    if (message.includes("password") || message.includes("encrypt")) {
      message = "This PDF appears to be password-protected. Please use an unencrypted copy.";
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
