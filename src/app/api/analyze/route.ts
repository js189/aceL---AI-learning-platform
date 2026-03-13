import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llm, pickModelForLength } from "@/lib/llm";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

const EXTRACT_CONCEPTS_SYSTEM = `You must respond with ONLY a valid JSON object. No markdown code blocks, no explanation, no text before or after. Output raw JSON only.

Output this exact shape:
{
  "title": "Short topic title (e.g. 'Quadratic Equations')",
  "summary": "2-4 sentence overview of the topic",
  "concepts": [
    {
      "id": "unique-id-1",
      "title": "Concept name",
      "description": "One line description",
      "source": "notes" | "pdf" | "youtube" | "video" | "handwritten",
      "order": 1
    }
  ],
  "checklist": [
    {
      "id": "item-id-1",
      "conceptId": "matches concept id",
      "title": "What the student should learn",
      "source": "optional label like 'from your notes'"
    }
  ]
}

Rules:
- Extract 5-20 concepts depending on content length. Order by dependency/logical flow.
- Each checklist item should map to one concept. Use clear, actionable titles.
- If content is empty or too short, return: {"title":"Untitled Topic","summary":"","concepts":[{"id":"c1","title":"Review your content","source":"notes","order":1}],"checklist":[{"id":"cl1","conceptId":"c1","title":"Review your content","source":"notes"}]}
- source must be one of: notes, pdf, youtube, video, handwritten.`;

const TOKEN_CHUNK_THRESHOLD_CHARS = 120_000; // ~30k tokens
const CHUNK_SIZE_CHARS = 60_000;
const analyzeCache = new Map<string, {
  topicId: string | null;
  title: string;
  summary: string;
  concepts: Array<{ id: string; title: string; description?: string; source?: string; order: number }>;
  checklist: Array<{ id: string; conceptId: string | undefined; title: string; source?: string; completed: boolean }>;
  rawSources: string[];
  documentHash: string;
}>();

type ParsedAnalyze = {
  title?: string;
  summary?: string;
  concepts?: Array<{ id: string; title: string; description?: string; source?: string; order: number }>;
  checklist?: Array<{ id: string; conceptId: string; title: string; source?: string }>;
};

/** Robustly parse AI JSON that may have markdown wrappers, trailing commas, or extra text */
function parseAIJson(raw: string): ParsedAnalyze {
  const stripMarkdown = (s: string) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/g, "").trim();
  const fixTrailingComma = (s: string) => s.replace(/,(\s*[}\]])/g, "$1");
  const fixUnescapedNewlines = (s: string) =>
    s.replace(/"([^"\\]|\\.)*"/g, (m) => m.replace(/\n/g, "\\n").replace(/\r/g, "\\r"));
  const extractJson = (s: string) => {
    const m = s.match(/\{[\s\S]*\}/);
    return m ? m[0] : s;
  };
  const candidates: string[] = [
    extractJson(stripMarkdown(raw)),
    extractJson(raw),
  ];
  const transforms: ((s: string) => string)[] = [
    (x) => x,
    fixTrailingComma,
    fixUnescapedNewlines,
    (x) => fixTrailingComma(fixUnescapedNewlines(x)),
  ];
  for (const cand of candidates) {
    for (const t of transforms) {
      try {
        return JSON.parse(t(cand));
      } catch {}
    }
  }
  throw new Error("Invalid JSON");
}

function splitTextIntoChunks(text: string): string[] {
  if (text.length <= TOKEN_CHUNK_THRESHOLD_CHARS) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + CHUNK_SIZE_CHARS, text.length);
    const nextBreak = text.lastIndexOf("\n\n", end);
    if (nextBreak > cursor + CHUNK_SIZE_CHARS / 2) end = nextBreak;
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function analyzeChunk(text: string, sourceLabel: string, totalChunks: number, chunkIndex: number): Promise<ParsedAnalyze> {
  const model = pickModelForLength(text.length);
  const chunkTag = totalChunks > 1 ? `Chunk ${chunkIndex + 1}/${totalChunks}` : "Single chunk";
  const prompt = `Analyse the following learning content and extract concepts and checklist.\n\nContent source: ${sourceLabel}\n${chunkTag}\n\nContent:\n${text}`;
  const completion = await llm.chat.completions.create({
    model,
    messages: [
      { role: "system", content: EXTRACT_CONCEPTS_SYSTEM },
      { role: "user", content: prompt },
    ],
    max_tokens: 1800,
    temperature: 0.7,
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  return parseAIJson(raw);
}

function mergeChunkResults(parts: ParsedAnalyze[], sourceLabel: string) {
  const title = parts.find((p) => p.title?.trim())?.title?.trim() ?? "Untitled Topic";
  const summary = parts.map((p) => p.summary?.trim()).filter(Boolean).join("\n").slice(0, 2000);
  const conceptMap = new Map<string, { title: string; description?: string; source?: string; order: number }>();

  for (const part of parts) {
    for (const c of part.concepts ?? []) {
      const key = String(c.title ?? "").trim().toLowerCase();
      if (!key) continue;
      if (!conceptMap.has(key)) {
        conceptMap.set(key, {
          title: c.title.trim(),
          description: c.description?.trim(),
          source: c.source ?? sourceLabel,
          order: conceptMap.size + 1,
        });
      }
    }
  }

  const concepts = Array.from(conceptMap.values()).map((c, i) => ({
    id: uuidv4(),
    title: c.title,
    description: c.description,
    source: c.source ?? sourceLabel,
    order: i + 1,
  }));

  const checklistRaw = parts.flatMap((p) => p.checklist ?? []).filter((c) => c?.title?.trim());
  const checklist = (checklistRaw.length ? checklistRaw : concepts.map((c) => ({ id: uuidv4(), conceptId: c.id, title: c.title, source: c.source })))
    .slice(0, Math.max(5, concepts.length))
    .map((item, i) => ({
      id: uuidv4(),
      conceptId: concepts[i]?.id ?? concepts[0]?.id,
      title: item.title.trim(),
      source: item.source ?? sourceLabel,
    }));

  return { title, summary, concepts, checklist };
}

async function buildAnalyzeResult(
  userId: string,
  text: string,
  sourceLabel: string,
  onProgress?: (percent: number, stage: string) => void
) {
  const documentHash = hashText(text);
  const cached = analyzeCache.get(documentHash);
  if (cached) {
    onProgress?.(100, "Cache hit - returning previous analysis");
    return cached;
  }

  const chunks = splitTextIntoChunks(text);
  onProgress?.(8, chunks.length > 1 ? `Large document detected, split into ${chunks.length} chunks` : "Analyzing document");

  let completed = 0;
  const parts = await Promise.all(
    chunks.map(async (chunk, i) => {
      const parsed = await analyzeChunk(chunk, sourceLabel, chunks.length, i);
      completed += 1;
      const pct = Math.min(70, 12 + Math.floor((completed / chunks.length) * 58));
      onProgress?.(pct, `Processed chunk ${completed}/${chunks.length}`);
      return parsed;
    })
  );

  const merged = mergeChunkResults(parts, sourceLabel);
  onProgress?.(78, "Preparing structured learning path");

  const payload = {
    topicId: null as string | null,
    title: merged.title,
    summary: merged.summary,
    concepts: merged.concepts,
    checklist: merged.checklist.map((item) => ({ ...item, completed: false })),
    rawSources: [sourceLabel],
    documentHash,
  };

  if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    onProgress?.(85, "Saving topic");
    const { data: topic, error: topicErr } = await supabase
      .from("topics")
      .insert({
        user_id: userId,
        title: merged.title,
        summary: merged.summary,
        raw_sources: [sourceLabel],
      })
      .select("id")
      .single();

    if (!topicErr && topic?.id) {
      payload.topicId = topic.id;
      await Promise.all([
        ...merged.concepts.map((c) =>
          supabase.from("concepts").insert({
            topic_id: topic.id,
            id: c.id,
            title: c.title,
            description: c.description,
            source: c.source,
            order: c.order,
            status: "not_started",
          })
        ),
        ...merged.checklist.map((item) =>
          supabase.from("checklist_items").insert({
            topic_id: topic.id,
            concept_id: item.conceptId,
            title: item.title,
            source: item.source,
            completed: false,
          })
        ),
      ]);
      await supabase.from("progress").upsert({
        user_id: userId,
        topic_id: topic.id,
        checklist_completed: false,
        case: 2,
        at_risk_flags: 0,
        learning_path: [],
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,topic_id" });
    }
  }

  analyzeCache.set(documentHash, payload);
  onProgress?.(100, "Analysis complete");
  return payload;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.FEATHERLESS_API_KEY) {
      return NextResponse.json(
        { error: "AI API key not configured. Set FEATHERLESS_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? "anonymous";

    const body = await req.json();
    const { text, sourceLabel = "notes", streamProgress = false } = body as {
      text: string;
      sourceLabel?: string;
      streamProgress?: boolean;
    };

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' in body" },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();
    if (streamProgress) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };
          void (async () => {
            try {
              send("progress", { percent: 3, stage: "Queued analysis" });
              const result = await buildAnalyzeResult(userId, trimmedText, sourceLabel, (percent, stage) =>
                send("progress", { percent, stage })
              );
              send("done", result);
              controller.close();
            } catch (err) {
              send("error", { error: err instanceof Error ? err.message : "Analyze failed" });
              controller.close();
            }
          })();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await buildAnalyzeResult(userId, trimmedText, sourceLabel);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Analyze error:", e);
    const err = e as { message?: string; status?: number };
    let msg = err?.message || "Analyze failed";
    if (msg.includes("401") || msg.includes("Incorrect API key")) {
      msg = "Invalid API key. Check FEATHERLESS_API_KEY in .env.local";
    } else if (msg.includes("429")) {
      msg = "AI rate limit exceeded. Try again in a moment.";
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
