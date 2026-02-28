import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { YoutubeTranscript } from "youtube-transcript-plus";
import { featherless, FEATHERLESS_CHAT_MODEL } from "@/lib/featherless";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function extractJson(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let strChar = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\" && i + 1 < s.length) {
        i++;
        continue;
      }
      if (c === strChar) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strChar = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

async function fetchVideoFallback(
  videoId: string,
  url: string
): Promise<NextResponse | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
    };
    const title = data.title ?? "YouTube video";
    const author = data.author_name ?? "";
    const minimal =
      author ? `Video: "${title}" by ${author}` : `Video: "${title}"`;

    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_CHAT_MODEL,
      messages: [
        { role: "system", content: SUMMARISE_SYSTEM },
        {
          role: "user",
          content: `No transcript available. Use only this metadata:\n${minimal}\n\nGenerate a brief summary based on the title. For keyConcepts, infer likely topics from the title. For timestamps, return an empty array.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: {
      title?: string;
      summary?: string;
      keyConcepts?: string[];
      timestamps?: Array<{ time: string; seconds: number; label: string }>;
      needsFurtherReading?: string[];
    };

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
      const extracted = extractJson(cleaned) ?? cleaned.match(/\{[\s\S]*\}/)?.[0];
      parsed = JSON.parse(extracted ?? cleaned);
    } catch {
      const extracted = extractJson(raw) ?? raw.match(/\{[\s\S]*\}/)?.[0];
      try {
        parsed = extracted ? JSON.parse(extracted) : { title, summary: minimal, keyConcepts: [], timestamps: [], needsFurtherReading: [] };
      } catch {
        parsed = { title, summary: minimal, keyConcepts: [], timestamps: [], needsFurtherReading: [] };
      }
    }

    const concepts = (parsed.keyConcepts ?? []).map((title, i) => ({
      id: `yt-${videoId}-${i}`,
      title,
      description: undefined,
      source: "youtube" as const,
      order: i + 1,
    }));

    return NextResponse.json({
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      title: parsed.title ?? title,
      summary: parsed.summary ?? "",
      keyConcepts: parsed.keyConcepts ?? [],
      timestamps: parsed.timestamps ?? [],
      needsFurtherReading: parsed.needsFurtherReading ?? [],
      concepts,
      transcriptSnippet: minimal,
      sourceLabel: "youtube",
    });
  } catch {
    return null;
  }
}

const SUMMARISE_SYSTEM = `You are an expert at summarising educational video transcripts. Return a single JSON object (no markdown, no other text):

{
  "title": "Short video title",
  "summary": "Structured 2-4 sentence summary of the video content",
  "keyConcepts": ["concept1", "concept2", ...],
  "timestamps": [
    { "time": "0:00", "seconds": 0, "label": "Introduction to X" },
    { "time": "2:30", "seconds": 150, "label": "Explanation of Y" }
  ],
  "needsFurtherReading": ["concept mentioned but not explained in depth"]
}

Extract 3-8 key concepts and 3-10 important timestamps. Be concise.`;

export async function POST(req: NextRequest) {
  try {
    await getServerSession(authOptions);

    const body = await req.json();
    const { url } = body as { url: string };

    if (!url) {
      return NextResponse.json(
        { error: "Missing YouTube url" },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    let fullText: string;
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
        userAgent: USER_AGENT,
      });
      fullText = transcript
        .map((t) => `[${Math.floor(t.offset)}s] ${t.text}`)
        .join("\n");
    } catch (transcriptError) {
      const fallback = await fetchVideoFallback(videoId, url);
      if (fallback) return fallback;
      throw transcriptError;
    }

    const truncated = fullText.slice(0, 14000);

    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_CHAT_MODEL,
      messages: [
        { role: "system", content: SUMMARISE_SYSTEM },
        { role: "user", content: `Transcript:\n${truncated}` },
      ],
      max_tokens: 1200,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: {
      title?: string;
      summary?: string;
      keyConcepts?: string[];
      timestamps?: Array<{ time: string; seconds: number; label: string }>;
      needsFurtherReading?: string[];
    };

    try {
      let cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
      const extracted = extractJson(cleaned) ?? cleaned.match(/\{[\s\S]*\}/)?.[0];
      parsed = JSON.parse(extracted ?? cleaned);
    } catch {
      const extracted = extractJson(raw) ?? raw.match(/\{[\s\S]*\}/)?.[0];
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch {
          parsed = {
            title: "YouTube video",
            summary: fullText.slice(0, 500).replace(/\n/g, " "),
            keyConcepts: [],
            timestamps: [],
            needsFurtherReading: [],
          };
        }
      } else {
        parsed = {
          title: "YouTube video",
          summary: fullText.slice(0, 500).replace(/\n/g, " "),
          keyConcepts: [],
          timestamps: [],
          needsFurtherReading: [],
        };
      }
    }

    const concepts = (parsed.keyConcepts ?? []).map((title, i) => ({
      id: `yt-${videoId}-${i}`,
      title,
      description: undefined,
      source: "youtube" as const,
      order: i + 1,
    }));

    return NextResponse.json({
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      title: parsed.title ?? "YouTube video",
      summary: parsed.summary ?? "",
      keyConcepts: parsed.keyConcepts ?? [],
      timestamps: parsed.timestamps ?? [],
      needsFurtherReading: parsed.needsFurtherReading ?? [],
      concepts,
      transcriptSnippet: fullText.slice(0, 500),
      sourceLabel: "youtube",
    });
  } catch (e) {
    console.error("YouTube summarise error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "YouTube summarisation failed" },
      { status: 500 }
    );
  }
}
