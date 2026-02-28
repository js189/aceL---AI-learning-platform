import OpenAI from "openai";

/** Strip surrounding quotes and whitespace from env values. */
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

export const featherless = new OpenAI({
  apiKey,
  baseURL,
});

/** Main model for complex tasks (quiz, analyze). Override with FEATHERLESS_CHAT_MODEL in .env.local */
export const FEATHERLESS_CHAT_MODEL = cleanEnv(process.env.FEATHERLESS_CHAT_MODEL) || "openai/gpt-oss-120b";
/** Faster, smaller model for lightweight tasks (assess, learning-style, tutor). Override with FEATHERLESS_FAST_MODEL */
export const FEATHERLESS_FAST_MODEL = cleanEnv(process.env.FEATHERLESS_FAST_MODEL) || "openai/gpt-oss-20b";
export const FEATHERLESS_VISION_MODEL = "google/gemma-3-27b-it";
