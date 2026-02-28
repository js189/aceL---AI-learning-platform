import { NextResponse } from "next/server";
import { featherless, FEATHERLESS_CHAT_MODEL } from "@/lib/featherless";

export const dynamic = "force-dynamic";

function cleanEnv(value: string | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function extractApiError(e: unknown): { message: string; status?: number; code?: string } {
  const err = e as { message?: string; status?: number; code?: string; error?: { message?: string; code?: string } };
  const message = err?.error?.message ?? err?.message ?? "Unknown error";
  const status = err?.status ?? (err as { statusCode?: number })?.statusCode;
  const code = err?.code ?? err?.error?.code;
  return { message, status, code };
}

/**
 * GET /api/ai-test
 * Tests if the Featherless API key works. Returns connection status.
 * Uses models.list() first (no credits) then optional chat test.
 */
export async function GET() {
  const apiKey = cleanEnv(process.env.FEATHERLESS_API_KEY);
  const baseURL = cleanEnv(process.env.NEXT_PUBLIC_FEATHERLESS_BASE_URL) || "https://api.featherless.ai/v1";

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "FEATHERLESS_API_KEY is not set in .env.local",
      hint: "Add FEATHERLESS_API_KEY=your_key to .env.local (no quotes needed) and restart the server",
    }, { status: 500 });
  }

  const keyPrefix = apiKey.length >= 10 ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : "***";

  try {
    // Optional: verify auth with models list (no credits)
    let modelIds: string[] = [];
    try {
      const { data: models } = await featherless.models.list();
      modelIds = (models ?? []).slice(0, 5).map((m) => m.id);
    } catch {
      // models.list may not be supported; continue with chat test
    }

    // Quick chat test
    const completion = await featherless.chat.completions.create({
      model: FEATHERLESS_CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 10,
      temperature: 0,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      ok: true,
      message: "API key is working",
      model: FEATHERLESS_CHAT_MODEL,
      baseURL,
      keyPrefix,
      modelsListed: modelIds.length,
      sampleModels: modelIds,
    });
  } catch (e: unknown) {
    const { message, status } = extractApiError(e);
    let hint = "";

    if (status === 401 || message.includes("401") || /incorrect|invalid.*key|unauthorized/i.test(message)) {
      hint = "Your API key may be invalid or expired. Get a new key from https://featherless.ai/account/api-keys";
    } else if (status === 404 || message.includes("404") || /model.*not.*found/i.test(message)) {
      hint = `Model "${FEATHERLESS_CHAT_MODEL}" may not be available. Check https://featherless.ai/models for valid model IDs.`;
    } else if (status === 429 || message.includes("429")) {
      hint = "Rate limit exceeded. Wait a moment and try again.";
    } else if (message.includes("ENOTFOUND") || message.includes("fetch")) {
      hint = "Network error. Check if you can reach https://api.featherless.ai";
    }

    return NextResponse.json({
      ok: false,
      error: message,
      status,
      hint,
      model: FEATHERLESS_CHAT_MODEL,
      baseURL,
      keyPrefix,
    }, { status: 500 });
  }
}
