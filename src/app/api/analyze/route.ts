import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { featherless, FEATHERLESS_CHAT_MODEL } from "@/lib/featherless";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

const EXTRACT_CONCEPTS_SYSTEM = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no other text.

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
    const { text, sourceLabel = "notes" } = body as { text: string; sourceLabel?: string };

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' in body" },
        { status: 400 }
      );
    }

    const truncated = text.slice(0, 24000);
    const prompt = `Analyse the following learning content and extract concepts and checklist.\n\nContent source: ${sourceLabel}\n\nContent:\n${truncated}`;

    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_CHAT_MODEL,
      messages: [
        { role: "system", content: EXTRACT_CONCEPTS_SYSTEM },
        { role: "user", content: prompt },
      ],
      max_tokens: 1800,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: {
      title?: string;
      summary?: string;
      concepts?: Array<{ id: string; title: string; description?: string; source?: string; order: number }>;
      checklist?: Array<{ id: string; conceptId: string; title: string; source?: string }>;
    };
    try {
      let cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/g, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];
      parsed = JSON.parse(cleaned);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return NextResponse.json(
            { error: "AI returned invalid JSON. Please try again or use shorter content.", raw: raw.slice(0, 300) },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "AI returned invalid JSON. Please try again or use shorter content.", raw: raw.slice(0, 300) },
          { status: 500 }
        );
      }
    }

    const title = parsed.title ?? "Untitled Topic";
    const summary = parsed.summary ?? "";
    const concepts = (parsed.concepts ?? []).map((c, i) => ({
      id: uuidv4(),
      title: c.title || "Concept",
      description: c.description,
      source: c.source ?? sourceLabel,
      order: c.order ?? i + 1,
    }));
    const checklist = (parsed.checklist ?? []).map((c, i) => ({
      id: uuidv4(),
      conceptId: concepts[i]?.id ?? concepts[0]?.id,
      title: c.title,
      source: c.source ?? sourceLabel,
    }));

    if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const { data: topic, error: topicErr } = await supabase
        .from("topics")
        .insert({
          user_id: userId,
          title,
          summary,
          raw_sources: [sourceLabel],
        })
        .select("id")
        .single();

      if (!topicErr && topic?.id) {
        for (const c of concepts) {
          await supabase.from("concepts").insert({
            topic_id: topic.id,
            id: c.id,
            title: c.title,
            description: c.description,
            source: c.source,
            order: c.order,
            status: "not_started",
          });
        }
        for (const item of checklist) {
          await supabase.from("checklist_items").insert({
            topic_id: topic.id,
            concept_id: item.conceptId,
            title: item.title,
            source: item.source,
            completed: false,
          });
        }
        await supabase.from("progress").upsert({
          user_id: userId,
          topic_id: topic.id,
          checklist_completed: false,
          case: 2,
          at_risk_flags: 0,
          learning_path: [],
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,topic_id" });

        return NextResponse.json({
          topicId: topic.id,
          title,
          summary,
          concepts,
          checklist: checklist.map((item) => ({ ...item, completed: false })),
          rawSources: [sourceLabel],
        });
      }
    }

    return NextResponse.json({
      topicId: null,
      title,
      summary,
      concepts,
      checklist: checklist.map((item) => ({ ...item, completed: false })),
      rawSources: [sourceLabel],
    });
  } catch (e) {
    console.error("Analyze error:", e);
    const err = e as { message?: string; status?: number };
    let msg = err?.message || "Analyze failed";
    if (msg.includes("401") || msg.includes("Incorrect API key")) {
      msg = "Invalid Featherless API key. Check FEATHERLESS_API_KEY in .env.local";
    } else if (msg.includes("429")) {
      msg = "AI rate limit exceeded. Try again in a moment.";
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
