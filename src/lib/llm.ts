import OpenAI from "openai";

function cleanEnv(value: string | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

const baseURL = (cleanEnv(process.env.NEXT_PUBLIC_FEATHERLESS_BASE_URL) || "https://api.featherless.ai/v1").replace(/\/+$/, "");
const apiKey = cleanEnv(process.env.FEATHERLESS_API_KEY);

const LLM_TIMEOUT = 120_000;
const LLM_MAX_RETRIES = 3;
const RETRYABLE_PATTERNS = [
  "premature close",
  "econnreset",
  "etimedout",
  "socket hang up",
  "fetch failed",
  "failed to fetch",
  "network",
  "invalid response body",
  "aborted",
  "terminated",
  "connection",
];

function isRetryableError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);
    const mergedInit: RequestInit = {
      ...init,
      signal: controller.signal,
    };
    try {
      const res = await fetch(input, mergedInit);
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt < LLM_MAX_RETRIES && isRetryableError(err)) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export const llm = new OpenAI({
  apiKey,
  baseURL,
  fetch: fetchWithRetry as typeof fetch,
});

export const LLM_MAIN_MODEL = cleanEnv(process.env.FEATHERLESS_CHAT_MODEL) || "openai/gpt-oss-20b";
export const LLM_FAST_MODEL = cleanEnv(process.env.FEATHERLESS_FAST_MODEL) || "openai/gpt-oss-20b";
export const LLM_VISION_MODEL = cleanEnv(process.env.FEATHERLESS_VISION_MODEL) || "openai/gpt-oss-20b";

export function pickModelForLength(textLength: number): string {
  return textLength > 120_000 ? LLM_FAST_MODEL : LLM_MAIN_MODEL;
}
