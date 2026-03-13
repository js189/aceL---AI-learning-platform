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

DIFFICULTY (CRITICAL) — HARDER THAN MAIN QUIZ:
- Post-source is SIGNIFICANTLY MORE DIFFICULT than the main quiz. Main quiz = medium, tests basic understanding. Post-source = HARD.
- Every question must require: application, synthesis, critical thinking, or analysis — not recall or definition.
- Ask about edge cases, trade-offs, "what if" scenarios, prioritization, or comparison. No simple "what is X" questions.
- Distractors must be subtle and plausible; the correct answer requires nuanced reasoning to identify.

EACH QUESTION COMPLETELY DIFFERENT:
- The 5 questions in this quiz must be COMPLETELY DIFFERENT from each other: different concepts, different scenarios, different question types.
- No two questions should test the same concept in a similar way. No repeated phrasing or parallel structures.
- Cover different angles: e.g. one on trade-offs, one on edge cases, one on application, one on limitations, one on comparison.
- Each question and its choices must feel like a distinct, fresh challenge — never similar to another in the same quiz.

MANDATORY STRUCTURE:
- Exactly 5 multiple-choice questions. No more, no less.
- Each question: {"question":"...?","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"X","explanation":"max 20 words"}
- "correct" is exactly one uppercase letter: A, B, C, or D.
- Randomize the correct answer position independently for each question.

QUESTION QUALITY:
- Each question ≤ 24 words. Each option ≤ 15 words.
- Distractors plausible but clearly distinct. Never two options with similar meaning.
- All 4 options must be conceptually different.

OUTPUT FORMAT:
{"quiz_type":"post-source","title":"Post-Source Challenge Quiz","questions":[{"question":"...?","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"X","explanation":"..."}]}

Use ONLY the provided source content. Each of the 5 questions must be completely different and harder than a main quiz.`;

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

// 5 distinct fallback questions — each different, harder than main quiz. Used only when LLM fails.
const FALLBACK_POST_QUESTIONS: Array<{ q: string; opts: string[]; correct: number; exp: string }> = [
  { q: "When would you prioritize robustness over simplicity in this context?", opts: ["A. When assumptions are likely violated", "B. When sample size is small", "C. When results look perfect", "D. When time is limited"], correct: 0, exp: "Violated assumptions justify robust methods." },
  { q: "What trade-off matters most when choosing an approach here?", opts: ["A. Power vs. validity under violations", "B. Speed vs. interpretability", "C. Cost vs. convenience", "D. Tradition vs. innovation"], correct: 0, exp: "Validity under violations is critical." },
  { q: "Under what conditions would the standard approach fail?", opts: ["A. When key assumptions are violated", "B. When sample size is large", "C. When data is normally distributed", "D. When no outliers exist"], correct: 0, exp: "Violations undermine standard methods." },
  { q: "Which is the best next step when assumptions are questionable?", opts: ["A. Use a robust or nonparametric alternative", "B. Proceed with the standard method", "C. Remove problematic data only", "D. Report without uncertainty"], correct: 0, exp: "Robust alternatives handle violations." },
  { q: "What would a careful practitioner do when faced with uncertain assumptions?", opts: ["A. Check sensitivity and consider robust methods", "B. Assume assumptions hold", "C. Simplify the analysis", "D. Ignore violations"], correct: 0, exp: "Sensitivity checks inform decisions." },
];

function makeFallbackPost(concepts: Array<{ title: string }>): Q[] {
  const topic = concepts[0]?.title ?? "this topic";
  return FALLBACK_POST_QUESTIONS.slice(0, 5).map((f, i) => ({
    id: `post-fallback-${i + 1}`,
    type: "mcq" as const,
    question: `${topic} — ${f.q}`,
    options: f.opts,
    expectedAnswer: f.opts[f.correct],
    explanation: f.exp,
  }));
}

const POST_SOURCE_FOCUS_ANGLES = [
  "Focus on trade-offs, prioritization, and when to choose one approach over another. Harder than basic recall.",
  "Focus on edge cases, failure modes, and when assumptions break down. Require reasoning.",
  "Focus on what-if scenarios and how changing assumptions affects outcomes. Application-level.",
  "Focus on application in different contexts and real-world use cases. No simple definitions.",
  "Focus on limitations, when NOT to use a technique, and common pitfalls. Critical thinking.",
  "Focus on deeper analysis, implications, and second-order effects. Synthesis required.",
  "Focus on comparison, contrast, and relative strengths of different approaches. Nuanced judgment.",
  "Focus on practical decision-making under constraints. Prioritization and trade-offs.",
];

// Force different question stems/framing each time — breaks similarity
const QUESTION_STEM_STYLES = [
  "Use question stems like: 'What would happen if...' 'Under what conditions...' 'Which is the best approach when...' 'A practitioner would...'",
  "Use question stems like: 'Why might X fail when...' 'How would you prioritize...' 'What trade-off exists between...' 'In practice, when would...'",
  "Use question stems like: 'Which assumption is most critical when...' 'What limitation applies to...' 'Compared to Y, X is better when...' 'Given constraints A and B...'",
  "Use question stems like: 'What second-order effect would...' 'When would you avoid using...' 'How does context X change...' 'What would a critic say about...'",
];

// Anti-pattern: force model to avoid certain styles this round
const ANTI_PATTERNS = [
  "Do NOT use definition-style questions ('What is X?', 'Define Y') in this generation.",
  "Do NOT repeat similar wording across questions. Each question must feel like a different scenario.",
  "Do NOT put the correct answer in the same position (e.g. all B) — spread A/B/C/D randomly.",
  "Do NOT use generic distractors. Each wrong answer must be plausible but uniquely wrong for a specific reason.",
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
  const stemStyle = options?.forceVariation && QUESTION_STEM_STYLES
    ? QUESTION_STEM_STYLES[Math.floor(Math.random() * QUESTION_STEM_STYLES.length)]
    : "";
  const antiPattern = options?.forceVariation && ANTI_PATTERNS
    ? ANTI_PATTERNS[Math.floor(Math.random() * ANTI_PATTERNS.length)]
    : "";
  const focusLine = focusAngle ? `\n${focusAngle}\n` : "";
  const stemLine = stemStyle ? `\n${stemStyle}\n` : "";
  const antiLine = antiPattern ? `\n${antiPattern}\n` : "";
  // Unique seed + nonce + timestamp per request to break provider caching and force different outputs
  const nonce = Math.random().toString(36).slice(2, 10);
  const seedInt = Math.floor(Math.random() * 2147483647);
  const ts = Date.now();
  const userPrompt = `[req:${nonce}|ts:${ts}] Input material:
"""
${conceptsText}
"""${focusLine}${stemLine}${antiLine}
Generate now. Be extremely concise and fast.${retryHint}`;

  const llmParams: Parameters<typeof llm.chat.completions.create>[0] = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1400,
    temperature: options?.forceVariation ? 1.15 : 0.8,
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

    // Build text for main quiz (stable order)
    const text = concepts
      .map((c) => `${c.title}${c.description ? `: ${c.description}` : ""}`)
      .join("\n");

    // For post-source: shuffle concept order so each request has different input (breaks caching/similarity)
    const shuffledConcepts = [...concepts].sort(() => Math.random() - 0.5);
    const postSourceText = shuffledConcepts
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
      // forceVariation: shuffled concepts + random focus + stem style + unique seed = different questions every time
      const postRaw = await generateQuiz(POST_QUIZ_PROMPT, postSourceText, model, learnStyle, isRetry, { forceVariation: true });
      postSourceQuiz = sanitizeQuestions(postRaw, "pq");
      if (!postSourceQuiz.length) {
        console.warn("[quiz] Post-source LLM returned no valid questions, using fallback");
        postSourceQuiz = makeFallbackPost(concepts);
      }
      // Reuse cached main quiz if it exists, otherwise leave empty (frontend doesn't need it)
      mainQuiz = quizCache.get(stableHash)?.mainQuiz ?? [];
    } else {
      // Normal first load: generate main then post sequentially
      const mainRaw = await generateQuiz(MAIN_QUIZ_PROMPT, text, model, learnStyle, isRetry);
      mainQuiz = sanitizeQuestions(mainRaw, "mq");
      if (!mainQuiz.length) mainQuiz = makeFallbackMain(concepts);

      const postRaw = await generateQuiz(POST_QUIZ_PROMPT, postSourceText, model, learnStyle, isRetry, { forceVariation: true });
      postSourceQuiz = sanitizeQuestions(postRaw, "pq");
      if (!postSourceQuiz.length) {
        console.warn("[quiz] Post-source LLM returned no valid questions, using fallback");
        postSourceQuiz = makeFallbackPost(concepts);
      }
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
