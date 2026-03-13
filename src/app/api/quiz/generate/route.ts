import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llm, LLM_FAST_MODEL } from "@/lib/llm";
import { createHash } from "crypto";

export const maxDuration = 120;

const MAIN_QUIZ_PROMPT = `You are a very fast, strict JSON quiz generator.
Output ONLY valid JSON — nothing else ever. No markdown, no \`\`\`, no text outside JSON.

Rules:
- Exactly 5 questions. Each question ≤ 22 words. Each option ≤ 14 words.
- Difficulty: medium to medium-hard. Test understanding + pitfalls + details.
- 4 options as object: "options":{"A":"...","B":"...","C":"...","D":"..."}
- "correct": one uppercase letter. Randomize position per question.
- All 4 options plausible but conceptually different. No near-duplicate distractors.
- Every generation must produce different questions.

Output:
{"quiz_type":"main","title":"Main Quiz","questions":[{"question":"?","options":{"A":"","B":"","C":"","D":""},"correct":"C","explanation":"max 16 words"}]}

Use ONLY the provided source content. Be fast.`;

const POST_QUIZ_PROMPT = `You are a strict JSON-only quiz generator for a post-source challenge quiz.
Output ONLY a single valid JSON object — absolutely zero text outside the JSON. No markdown, no \`\`\`json, no comments, no introductions, no apologies — nothing except the raw JSON object.

CRITICAL VARIATION RULES:
- Every generation and every retry MUST produce completely fresh content.
- Create entirely new questions — never reuse or slightly modify any previous question text, scenario, or answer choice from earlier generations.
- This is a new attempt. Ignore everything you have generated before for this quiz.
- You MUST vary: question phrasing, concepts emphasized, angles and scenarios, correct answers, and distractors. Zero overlap with prior versions.

MANDATORY STRUCTURE:
- Exactly 5 multiple-choice questions. No more, no less.
- Each question: {"question":"...?","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"X","explanation":"max 20 words"}
- "correct" is exactly one uppercase letter: A, B, C, or D.
- Randomize the correct answer position independently for each question. A/B/C/D should be roughly equally likely across the 5 questions.

QUESTION QUALITY:
- Application, analysis, evaluation — harder than basic recall.
- Each question ≤ 24 words. Each option ≤ 15 words.
- Distractors plausible but clearly distinct from each other and from the correct answer. Never two options with similar meaning.
- All 4 options must be conceptually different.

OUTPUT FORMAT:
{"quiz_type":"post-source","title":"Post-Source Challenge Quiz","questions":[{"question":"...?","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"X","explanation":"..."}]}

Use ONLY the provided source content. This generation must be noticeably different from any prior version in questions, scenarios, wording, and answer choices.`;

type Q = { id: string; type: "mcq"; question: string; options: string[]; expectedAnswer: string; explanation?: string };

const quizCache = new Map<string, { mainQuiz: Q[]; postSourceQuiz: Q[] }>();

function hashQuizInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// Options stay in A/B/C/D order as returned by the model — no server-side shuffling

function extractJsonArray(raw: string): string | null {
  const start = raw.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let strChar = "";
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (c === "\\" && i + 1 < raw.length) { i++; continue; }
      if (c === strChar) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return null;
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let strChar = "";
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (c === "\\" && i + 1 < raw.length) { i++; continue; }
      if (c === strChar) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return null;
}

function stripLetterPrefix(opt: string): string {
  return opt.replace(/^[A-D]\.\s*/, "").trim();
}

function parseQuizResponse(raw: string): unknown[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/g, "").trim();

  // Try as array first (new format)
  const arrStr = extractJsonArray(cleaned);
  if (arrStr) {
    try { const arr = JSON.parse(arrStr); if (Array.isArray(arr)) return arr; } catch { /* fall through */ }
  }

  // Try as object with mainQuiz/postSourceQuiz (legacy combined format)
  const objStr = extractJsonObject(cleaned);
  if (objStr) {
    try {
      const obj = JSON.parse(objStr);
      if (Array.isArray(obj.questions)) return obj.questions;
      if (Array.isArray(obj.mainQuiz)) return obj.mainQuiz;
      if (Array.isArray(obj.postSourceQuiz)) return obj.postSourceQuiz;
      if (Array.isArray(obj.questions)) return obj.questions;
    } catch { /* fall through */ }
  }

  // Brute-force regex
  const fallbackArr = cleaned.match(/\[[\s\S]*\]/)?.[0];
  if (fallbackArr) {
    try { const arr = JSON.parse(fallbackArr); if (Array.isArray(arr)) return arr; } catch { /* ignore */ }
  }
  const fallbackObj = cleaned.match(/\{[\s\S]*\}/)?.[0];
  if (fallbackObj) {
    try {
      const obj = JSON.parse(fallbackObj);
      if (Array.isArray(obj)) return obj;
      for (const v of Object.values(obj)) { if (Array.isArray(v)) return v as unknown[]; }
    } catch { /* ignore */ }
  }

  return [];
}

function normaliseOptions(entry: {
  options?: unknown;
  a?: string[];
}): string[] {
  const raw = entry.options;

  // New format: options is an object {"A": "text", "B": "text", ...}
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return ["A", "B", "C", "D"]
      .map((letter) => {
        const val = obj[letter];
        if (typeof val !== "string" || !val.trim()) return null;
        // prefix with "A. text" so the rest of the pipeline stays unchanged
        return `${letter}. ${String(val).trim()}`;
      })
      .filter((o): o is string => o !== null);
  }

  // Legacy array format: ["A. text", "B. text", ...]
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter((o) => typeof o === "string").map((o) => String(o).trim());
  }

  // Compact array fallback: entry.a
  if (Array.isArray(entry.a)) {
    return entry.a.filter((o) => typeof o === "string").map((o) => String(o).trim());
  }

  return [];
}

function sanitizeQuestions(input: unknown[], prefix: string): Q[] {
  const BANNED_OPTIONS = /^(none of the above|all of the above|see learning materials|i don't know)$/i;
  const isBanned = (s: string) => BANNED_OPTIONS.test(stripLetterPrefix(s));
  const LETTER_MAP: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

  const questions = input
    .filter((q) => {
      const entry = q as { question?: string; q?: string; options?: unknown; a?: unknown[] };
      const question = entry.question ?? entry.q;
      const opts = entry.options;
      const hasOpts = Array.isArray(opts) || (opts && typeof opts === "object") || Array.isArray(entry.a);
      return typeof question === "string" && hasOpts;
    })
    .map((q, i) => {
      const entry = q as {
        id?: string;
        question?: string;
        q?: string;
        options?: unknown;
        a?: string[];
        correct?: string;
        expectedAnswer?: string;
        explanation?: string;
        exp?: string;
      };

      const rawOpts = normaliseOptions(entry).filter((o) => o && !isBanned(o));
      if (rawOpts.length < 4) return null;
      const options = rawOpts.slice(0, 4);

      let expectedAnswer = "";
      if (entry.correct && LETTER_MAP[entry.correct.trim().toUpperCase()] !== undefined) {
        const idx = LETTER_MAP[entry.correct.trim().toUpperCase()];
        if (idx < options.length) expectedAnswer = options[idx];
      } else if (entry.expectedAnswer) {
        const match = options.find((o) => stripLetterPrefix(o) === stripLetterPrefix(entry.expectedAnswer!));
        expectedAnswer = match ?? entry.expectedAnswer;
      }

      if (!expectedAnswer || !options.includes(expectedAnswer) || isBanned(expectedAnswer)) return null;

      return {
        id: entry.id ? String(entry.id) : `${prefix}${i + 1}`,
        type: "mcq" as const,
        question: String(entry.question ?? entry.q ?? "").trim(),
        options,
        expectedAnswer,
        explanation: entry.explanation?.trim() || entry.exp?.trim() || undefined,
      };
    })
    .filter((q): q is Q => !!q && !!q.question);

  return questions;
}

function makeFallbackMain(concepts: Array<{ title: string }>): Q[] {
  return (
    concepts.slice(0, 5).map((c, i) => ({
      id: `main-fallback-${i + 1}`,
      type: "mcq" as const,
      question: `${c.title}: likely result of a broken assumption?`,
      expectedAnswer: `A. Standard errors become unreliable`,
      options: [
        `A. Standard errors become unreliable`,
        `B. Sample size automatically doubles`,
        `C. Software fixes the violation`,
        `D. Effect direction must reverse`,
      ],
      explanation: `Assumption failure usually distorts uncertainty, not data generation itself.`,
    }))
  );
}

function makeFallbackPost(concepts: Array<{ title: string }>): Q[] {
  return (
    concepts.slice(0, 5).map((c, i) => ({
      id: `post-fallback-${i + 1}`,
      type: "mcq" as const,
      question: `${c.title}: best robust redesign under realistic violation?`,
      expectedAnswer: `A. Use bootstrap resampling`,
      options: [
        `A. Use bootstrap resampling`,
        `B. Inflate sample size only`,
        `C. Change to Bayesian automatically`,
        `D. Add Bonferroni correction`,
      ],
      explanation: `Bootstrap often improves robustness without changing the target question.`,
    }))
  );
}

const POST_SOURCE_FOCUS_ANGLES = [
  "Focus this quiz on trade-offs, prioritization, and when to choose one approach over another.",
  "Focus this quiz on edge cases, failure modes, and when assumptions break down.",
  "Focus this quiz on what-if scenarios and how changing assumptions affects outcomes.",
  "Focus this quiz on application in different contexts and real-world use cases.",
  "Focus this quiz on limitations, when NOT to use a technique, and common pitfalls.",
  "Focus this quiz on deeper analysis, implications, and second-order effects.",
  "Focus this quiz on comparison, contrast, and relative strengths of different approaches.",
  "Focus this quiz on practical decision-making under constraints.",
];

async function generateQuiz(
  systemPrompt: string,
  conceptsText: string,
  model: string,
  style: string,
  isRetry: boolean,
  options?: { forceVariation?: boolean },
): Promise<unknown[]> {
  const retryHint = isRetry ? "\nRETRY — you MUST generate completely different questions. Different scenarios, different wording, different distractors, different correct-answer positions. Zero overlap with any prior attempt." : "";
  const focusAngle = options?.forceVariation
    ? POST_SOURCE_FOCUS_ANGLES[Math.floor(Math.random() * POST_SOURCE_FOCUS_ANGLES.length)]
    : "";
  const focusLine = focusAngle ? `\n${focusAngle}\n` : "";
  // Unique seed + nonce + timestamp per request to break provider caching and force different outputs
  const nonce = Math.random().toString(36).slice(2, 10);
  const seedInt = Math.floor(Math.random() * 2147483647);
  const ts = Date.now();
  const userPrompt = `[req:${nonce}|ts:${ts}] Input material:
"""
${conceptsText}
"""${focusLine}
Generate now. Be extremely concise and fast.${retryHint}`;

  const llmParams: Parameters<typeof llm.chat.completions.create>[0] = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1400,
    temperature: options?.forceVariation ? 1.0 : 0.8,
  };
  // Vary sampling seed per request so same input produces different outputs (breaks determinism/caching)
  if (options?.forceVariation) {
    (llmParams as Record<string, unknown>).seed = seedInt;
  }

  // Retry up to 3 times on concurrency (429) errors with backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await llm.chat.completions.create(llmParams);
      const raw = completion.choices[0]?.message?.content?.trim() ?? '{"title":"Quiz","questions":[]}';
      return parseQuizResponse(raw);
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err).toLowerCase();
      if (msg.includes("concurrency") || msg.includes("429") || msg.includes("rate")) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    await getServerSession(authOptions);

    const body = await req.json();
    const { concepts, style, sourceMaterial, freshRecall, documentHash } = body as {
      concepts: Array<{ title: string; description?: string }>;
      style?: string;
      sourceMaterial?: boolean;
      freshRecall?: boolean;
      documentHash?: string;
    };

    if (!concepts?.length) {
      return NextResponse.json({ error: "Missing or empty concepts" }, { status: 400 });
    }

    const text = concepts
      .map((c) => `${c.title}${c.description ? `: ${c.description}` : ""}`)
      .join("\n");

    const stableHash = documentHash || hashQuizInput({ concepts, style });
    // Post-source quiz is NEVER cached — must always be fresh to prevent memorization.
    // Main quiz can be cached since it only runs once per topic.
    if (!sourceMaterial && !freshRecall) {
      const cached = quizCache.get(stableHash);
      if (cached) {
        return NextResponse.json({
          questions: cached.mainQuiz,
          mainQuiz: cached.mainQuiz,
          postSourceQuiz: cached.postSourceQuiz,
          cacheHit: true,
          documentHash: stableHash,
        });
      }
    }

    const model = LLM_FAST_MODEL;
    const isRetry = !!freshRecall;
    const learnStyle = style ?? "mixed";

    // Run sequentially — each request costs 2 concurrency units; never exceed plan limit.
    // Only generate the quiz type needed on this request.
    let mainQuiz: Q[] = [];
    let postSourceQuiz: Q[] = [];

    if (sourceMaterial) {
      // Post-source request: only ONE LLM call — never generate main quiz here
      // forceVariation: higher temp + unique seed so each call produces different questions
      const postRaw = await generateQuiz(POST_QUIZ_PROMPT, text, model, learnStyle, isRetry, { forceVariation: true });
      postSourceQuiz = sanitizeQuestions(postRaw, "pq");
      if (!postSourceQuiz.length) postSourceQuiz = makeFallbackPost(concepts);
      // Reuse cached main quiz if it exists, otherwise leave empty (frontend doesn't need it)
      mainQuiz = quizCache.get(stableHash)?.mainQuiz ?? [];
    } else {
      // Normal first load: generate main then post sequentially
      const mainRaw = await generateQuiz(MAIN_QUIZ_PROMPT, text, model, learnStyle, isRetry);
      mainQuiz = sanitizeQuestions(mainRaw, "mq");
      if (!mainQuiz.length) mainQuiz = makeFallbackMain(concepts);

      const postRaw = await generateQuiz(POST_QUIZ_PROMPT, text, model, learnStyle, isRetry);
      postSourceQuiz = sanitizeQuestions(postRaw, "pq");
      if (!postSourceQuiz.length) postSourceQuiz = makeFallbackPost(concepts);
    }

    mainQuiz = mainQuiz.slice(0, 5);
    postSourceQuiz = postSourceQuiz.slice(0, 5);
    // Cache main quiz only (post-source must always be fresh)
    if (mainQuiz.length && !sourceMaterial) {
      quizCache.set(stableHash, { mainQuiz, postSourceQuiz: [] });
    }

    return NextResponse.json({
      questions: sourceMaterial ? postSourceQuiz : mainQuiz,
      mainQuiz,
      postSourceQuiz,
      documentHash: stableHash,
      cacheHit: false,
    });
  } catch (e) {
    console.error("Quiz generation error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quiz generation failed" },
      { status: 500 }
    );
  }
}
