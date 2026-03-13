"use client";

import { useState, useRef } from "react";
import type { Concept, LearningStyleProfile } from "@/types";

function mergeDedup<T>(...arrs: (T[] | undefined)[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const arr of arrs) {
    if (!Array.isArray(arr)) continue;
    for (const x of arr) {
      const key = String(x).trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(x);
      }
    }
  }
  return out;
}

type Question = {
  id: string;
  type: "mcq" | "short";
  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation?: string;
};

function isCorrectMC(selected: string, expected: string): boolean {
  return String(selected).trim() === String(expected).trim();
}

export function QuizFlow({
  concepts,
  learningStyle,
  onComplete,
  topicSummary,
  fullscreen = true,
}: {
  concepts: Concept[];
  learningStyle: LearningStyleProfile | null;
  onComplete: (result: { score: number; unfamiliar?: string[]; reasoning?: string; correct?: string[]; misconceptions?: string[] }) => void;
  topicSummary?: string;
  fullscreen?: boolean;
}) {
  const [mode, setMode] = useState<"explanation" | "quiz">("quiz");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [explanation, setExplanation] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    reasoning: string;
    correct: string[];
    misconceptions: string[];
    unfamiliar: string[];
  } | null>(null);
  const [quizScores, setQuizScores] = useState<number[]>([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [apiError, setApiError] = useState("");
  const accumulatedCorrect = useRef<string[]>([]);
  const accumulatedMisconceptions = useRef<string[]>([]);
  const accumulatedUnfamiliar = useRef<string[]>([]);

  async function loadQuiz() {
    setApiError("");
    setLoadingQuiz(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepts: concepts.map((c) => ({ title: c.title, description: c.description })),
          style: learningStyle?.mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions ?? data.mainQuiz ?? []);
      setCurrentQ(0);
      setAnswers({});
      setQuizStarted(false);
      setQuizScores([]);
      setAnswerRevealed(false);
      setResult(null);
      accumulatedCorrect.current = [];
      accumulatedMisconceptions.current = [];
      accumulatedUnfamiliar.current = [];
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to generate quiz");
    } finally {
      setLoadingQuiz(false);
    }
  }

  async function assessExplanation() {
    if (!explanation.trim()) return;
    setAssessing(true);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptTitle: concepts[0]?.title ?? "Topic",
          conceptContext: concepts[0]?.description,
          studentResponse: explanation,
          mode: "explanation",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApiError("");
      setResult(data);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setAssessing(false);
    }
  }

  async function checkAnswerAndReveal() {
    const q = questions[currentQ];
    const answer = answers[q?.id ?? ""];
    if (!q || answer === undefined) return;
    if (q.type === "short" && !String(answer).trim()) return;

    if (q.type === "mcq") {
      const correct = isCorrectMC(answer, q.expectedAnswer);
      setLastCorrect(correct);
      setAnswerRevealed(true);
      setQuizScores((prev) => [...prev, correct ? 100 : 0]);
    } else {
      setAssessing(true);
      setApiError("");
      try {
        const res = await fetch("/api/assess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conceptTitle: q.question,
            studentResponse: answer,
            expectedAnswer: q.expectedAnswer,
            mode: "quiz",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (Array.isArray(data.correct)) accumulatedCorrect.current.push(...data.correct);
        if (Array.isArray(data.misconceptions)) accumulatedMisconceptions.current.push(...data.misconceptions);
        if (Array.isArray(data.unfamiliar)) accumulatedUnfamiliar.current.push(...data.unfamiliar);
        setLastCorrect((data.score ?? 0) >= 70);
        setAnswerRevealed(true);
        setQuizScores((prev) => [...prev, data.score ?? 0]);
      } catch (e) {
        setApiError(e instanceof Error ? e.message : "Assessment failed");
      } finally {
        setAssessing(false);
      }
      }
    }
    setApiError("");
  }

  function goToNextQuestion() {
    advanceToNext();
  }

  function advanceToNext() {
    setAnswerRevealed(false);
    if (currentQ + 1 >= questions.length) {
      const scores = quizScores;
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      setResult({
        score: avgScore,
        reasoning: "Assessment complete.",
        correct: mergeDedup<string>(accumulatedCorrect.current),
        misconceptions: mergeDedup<string>(accumulatedMisconceptions.current),
        unfamiliar: mergeDedup<string>(accumulatedUnfamiliar.current),
      });
    } else {
      setCurrentQ((c) => c + 1);
    }
  }

  function handleResultContinue() {
    if (result) {
      onComplete({
        score: result.score,
        unfamiliar: result.unfamiliar,
        reasoning: result.reasoning,
        correct: result.correct,
        misconceptions: result.misconceptions,
      });
    }
  }

  if (result) {
    const feedbackMessage =
      result.reasoning?.trim() ||
      "Use the learning path below to review and strengthen your understanding.";
    return (
      <div className="mx-auto max-w-xl mt-6 rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <h3 className="font-semibold text-deep-charcoal">Understanding score</h3>
        <div className="mt-4 flex items-center gap-6">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-warm-sand/80 bg-cream">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="rgba(240, 230, 217, 0.8)"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--sage)"
                strokeWidth="8"
                strokeDasharray={`${(result.score / 100) * 264} 264`}
                strokeLinecap="round"
                className="transition-all"
              />
            </svg>
            <span className="text-2xl font-bold text-deep-charcoal">{result.score}</span>
            <span className="text-deep-charcoal/60 text-base">/100</span>
          </div>
          <p className="text-deep-charcoal/80 leading-body flex-1 text-sm">{feedbackMessage}</p>
        </div>
        <div className="mt-6 space-y-4 border-t border-warm-sand/80 pt-6">
          {result.correct?.length > 0 && (
            <div>
              <p className="font-medium text-sage mb-2">✅ You understand:</p>
              <ul className="list-disc list-inside text-deep-charcoal space-y-1 ml-2">
                {result.correct.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {result.misconceptions?.length > 0 && (
            <div>
              <p className="font-medium text-terracotta mb-2">🔍 Misconceptions detected:</p>
              <ul className="list-disc list-inside text-deep-charcoal space-y-1 ml-2">
                {result.misconceptions.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {result.unfamiliar?.length > 0 && (
            <div>
              <p className="font-medium text-dusty-blue mb-2">📚 Unfamiliar:</p>
              <ul className="list-disc list-inside text-deep-charcoal space-y-1 ml-2">
                {result.unfamiliar.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          onClick={handleResultContinue}
          className="mt-6 rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 transition"
        >
          Continue
        </button>
      </div>
    );
  }

  if (mode === "explanation") {
    const topicName = concepts[0]?.title ?? "this topic";
    return (
      <div className="mx-auto max-w-xl mt-6">
        <div className="rounded-card rounded-b-none bg-warm-sand px-6 py-4">
          <h3 className="font-medium text-deep-charcoal text-lg">
            Explain {topicName} in your own words
          </h3>
        </div>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Write as if you're teaching a friend..."
          rows={8}
          className="w-full min-h-[200px] rounded-card rounded-t-none border-2 border-t-0 border-warm-sand/80 bg-cream px-6 py-4 text-deep-charcoal placeholder:text-deep-charcoal/40 focus:border-dusty-blue focus:outline-none leading-body"
        />
        <div className="mt-4 rounded-r-button border-l-4 border-sage bg-sage/5 p-4">
          <p className="text-deep-charcoal/80 text-sm">💡 Explain it like you&apos;re teaching a friend. What would you say first?</p>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={assessExplanation}
            disabled={assessing || !explanation.trim()}
            className="rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {assessing ? "Assessing…" : "Submit"}
          </button>
          <button
            onClick={() => setMode("quiz")}
            className="rounded-button border border-warm-sand px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/30 transition"
          >
            Take quiz instead
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mt-6 space-y-4">
        {apiError && (
          <div className="rounded-button border border-terracotta/20 bg-terracotta/10 p-3 text-sm text-terracotta">{apiError}</div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => loadQuiz()}
            disabled={loadingQuiz}
            className="rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 transition cursor-pointer"
          >
            {loadingQuiz ? "Generating quiz…" : "Take the quiz"}
          </button>
          <button
            type="button"
            onClick={() => setMode("explanation")}
            disabled={loadingQuiz}
            className="rounded-button border border-dusty-blue bg-transparent px-6 py-2.5 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10 transition cursor-pointer disabled:opacity-50"
          >
            Explain to AI
          </button>
        </div>
      </div>
    );
  }

  const inQuizFlow = questions.length > 0 && !result;
  const FullscreenWrap = fullscreen && inQuizFlow ? "div" : "div";
  const fullscreenClass = fullscreen && inQuizFlow ? "fixed inset-0 z-[9999] bg-cream overflow-auto flex flex-col items-center justify-center p-4 sm:p-6 pb-safe" : "";

  if (questions.length > 0 && !quizStarted) {
    return (
      <FullscreenWrap className={fullscreenClass}>
      <div className="mx-auto max-w-xl w-full rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
        <h3 className="font-semibold text-deep-charcoal">Ready to start?</h3>
        <p className="mt-2 text-deep-charcoal/80 text-sm">You have {questions.length} question{questions.length !== 1 ? "s" : ""}. Answer each one and we&apos;ll assess your understanding.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setQuizStarted(true)}
            className="rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 transition cursor-pointer"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => setMode("explanation")}
            className="rounded-button border border-dusty-blue bg-transparent px-6 py-2.5 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10 transition cursor-pointer"
          >
            Explain in my own words instead
          </button>
        </div>
      </div>
      </FullscreenWrap>
    );
  }

  const q = questions[currentQ];
  if (!q) return null;

  const userAnswer = answers[q.id];
  const showAnswerPanel = answerRevealed && (q.type === "mcq" || q.type === "short");

  return (
    <FullscreenWrap className={fullscreenClass}>
    <div className="mx-auto max-w-xl w-full">
      <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <p className="text-sm text-deep-charcoal/60">Question {currentQ + 1} of {questions.length}</p>
        <h3 className="mt-2 font-medium text-deep-charcoal text-lg">{q.question}</h3>
      {q.type === "mcq" && q.options?.length ? (
        <ul className="mt-4 space-y-2">
          {q.options.map((opt, i) => (
            <li key={i}>
              <label className={`flex items-center gap-3 py-3 sm:py-2 px-4 min-h-[52px] sm:min-h-0 rounded-input border-2 transition touch-manipulation ${
                showAnswerPanel
                  ? opt === q.expectedAnswer
                    ? "border-sage bg-sage/10 cursor-default"
                    : answers[q.id] === opt && !lastCorrect
                    ? "border-terracotta/50 bg-terracotta/5 cursor-default"
                    : "border-warm-sand/30 bg-warm-sand/5 cursor-default opacity-75"
                  : "border-warm-sand/50 hover:border-dusty-blue/50 cursor-pointer has-[:checked]:border-dusty-blue has-[:checked]:bg-dusty-blue/5"
              }`}>
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === opt}
                  onChange={() => !showAnswerPanel && setAnswers((a) => ({ ...a, [q.id]: opt }))}
                  disabled={showAnswerPanel}
                  className="border-dusty-blue text-dusty-blue focus:ring-dusty-blue w-5 h-5 shrink-0"
                />
                <span className="text-deep-charcoal flex-1 min-w-0">{opt}</span>
                {showAnswerPanel && opt === q.expectedAnswer && (
                  <span className="text-sage font-medium">✓ Correct</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <textarea
          value={answers[q.id] ?? ""}
          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          placeholder="Your answer..."
          rows={4}
          disabled={showAnswerPanel}
          className="mt-4 w-full rounded-input border-2 border-warm-sand/80 bg-cream px-4 py-3 text-deep-charcoal placeholder:text-deep-charcoal/40 focus:border-dusty-blue focus:outline-none disabled:opacity-80"
        />
      )}

      {showAnswerPanel ? (
        <div className="mt-6 space-y-4">
          <div className={`rounded-r-button border-l-4 p-4 ${
            lastCorrect ? "border-sage bg-sage/10" : "border-terracotta bg-terracotta/10"
          }`}>
            <p className="font-medium text-deep-charcoal">
              {lastCorrect ? "✓ Correct!" : "✗ Incorrect"}
            </p>
            {!lastCorrect && q.expectedAnswer && (
              <p className="mt-2 text-deep-charcoal/90 text-sm">
                <span className="font-medium">Correct answer:</span> {q.expectedAnswer}
              </p>
            )}
            {q.explanation && (
              <p className="mt-3 text-deep-charcoal/80 text-sm leading-relaxed border-t border-warm-sand/40 pt-3">
                {q.explanation}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={goToNextQuestion}
            disabled={assessing}
            className="w-full sm:w-auto rounded-button bg-dusty-blue px-8 py-3 sm:py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 transition cursor-pointer min-h-[48px]"
          >
            {assessing ? "Assessing…" : currentQ + 1 >= questions.length ? "See results" : "Next question"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={checkAnswerAndReveal}
          disabled={userAnswer === undefined || (q.type === "short" && !String(userAnswer ?? "").trim())}
          className="mt-6 w-full sm:w-auto rounded-button bg-dusty-blue px-8 py-3 sm:py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer min-h-[48px]"
        >
          Check answer
        </button>
      )}

      {apiError && (
        <p className="mt-3 text-sm text-terracotta">{apiError}</p>
      )}
      </div>
    </div>
    </FullscreenWrap>
  );
}
