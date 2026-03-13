"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { getPostSourceQuiz, setPostSourceQuiz } from "@/lib/storage";
import { recordStudyActivity } from "@/lib/streak";
import { dispatchProgressUpdate } from "@/lib/progressEvents";
import type { Concept } from "@/types";

type Question = {
  id: string;
  type: "mcq" | "short";
  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation?: string;
};

type QuestionResult = {
  id: string;
  question: string;
  expectedAnswer: string;
  studentAnswer: string;
  correct: boolean;
  score: number;
  feedback?: string;
};

const PASS_THRESHOLD = 85;

export function PostSourceQuiz({
  topicId,
  concepts,
  misconceptions,
  onPassed,
  onShowRetry,
  passedPrimaryLabel = "Go to Main Assessment",
}: {
  topicId: string;
  concepts: Concept[];
  misconceptions?: string[];
  onPassed: () => void;
  onShowRetry: (missed: string[]) => void;
  /** Label for the primary button when passed (e.g. "Go to Active Recall") */
  passedPrimaryLabel?: string;
}) {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [assessing, setAssessing] = useState(false);
  const [quizScores, setQuizScores] = useState<number[]>([]);
  const questionResultsRef = useRef<QuestionResult[]>([]);
  const missedRef = useRef<string[]>([]);
  const [result, setResult] = useState<{
    score: number;
    reasoning?: string;
    correct?: string[];
    misconceptions?: string[];
    unfamiliar?: string[];
    questionResults?: QuestionResult[];
  } | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [apiError, setApiError] = useState("");
  const [isRetry, setIsRetry] = useState(false);

  function isCorrectMC(selected: string, expected: string): boolean {
    return String(selected).trim() === String(expected).trim();
  }

  async function loadQuiz(_freshQuestions = false) {
    setApiError("");
    setLoading(true);
    try {
      // Always send freshRecall: true so every post-source quiz attempt gets new questions
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepts: concepts.map((c) => ({ title: c.title, description: c.description })),
          sourceMaterial: true,
          freshRecall: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const qs = (data.postSourceQuiz ?? data.questions ?? []).slice(0, 5);
      setQuestions(qs);
      setCurrentQ(0);
      setAnswers({});
      setQuizStarted(false);
      setQuizScores([]);
      setAnswerRevealed(false);
      setResult(null);
      missedRef.current = [];
      questionResultsRef.current = [];
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to generate quiz");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveAttemptToSupabase(score: number, questionResults: QuestionResult[]) {
    if (!session?.user) return;
    try {
      await fetch("/api/post-source-quiz/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          score,
          questions: questionResults,
          attemptedAt: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.warn("Post-source quiz save failed:", e);
    }
  }

  async function checkAnswerAndReveal() {
    const q = questions[currentQ];
    const answer = answers[q?.id ?? ""];
    if (!q || answer === undefined || (q.type === "short" && !String(answer).trim())) return;
    setApiError("");

    if (q.type === "mcq") {
      const correct = isCorrectMC(answer, q.expectedAnswer);
      const score = correct ? 100 : 0;
      setLastCorrect(correct);
      setAnswerRevealed(true);
      setQuizScores((prev) => [...prev, score]);
      questionResultsRef.current = [
        ...questionResultsRef.current,
        { id: q.id, question: q.question, expectedAnswer: q.expectedAnswer, studentAnswer: answer, correct, score },
      ];
    } else {
      setAssessing(true);
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
        const score = data.score ?? 0;
        const correct = score >= 85;
        const missed = [...(data.misconceptions ?? []), ...(data.unfamiliar ?? [])].filter(Boolean);
        missedRef.current = Array.from(new Set([...missedRef.current, ...missed]));
        setLastCorrect(correct);
        setAnswerRevealed(true);
        setQuizScores((prev) => [...prev, score]);
        questionResultsRef.current = [
          ...questionResultsRef.current,
          {
            id: q.id,
            question: q.question,
            expectedAnswer: q.expectedAnswer,
            studentAnswer: answer,
            correct,
            score,
            feedback: data.reasoning,
          },
        ];
      } catch (e) {
        setApiError(e instanceof Error ? e.message : "Assessment failed");
      } finally {
        setAssessing(false);
      }
    }
  }

  function goToNextQuestion() {
    setAnswerRevealed(false);
    if (currentQ + 1 >= questions.length) {
      const newScores = quizScores;
      const avgScore = Math.round(newScores.reduce((a, b) => a + b, 0) / newScores.length);
      const passed = avgScore >= PASS_THRESHOLD;
      const uniqueMissed = missedRef.current;
      const qResults = [...questionResultsRef.current];

      setResult({
        score: avgScore,
        reasoning: "Assessment complete",
        correct: [],
        misconceptions: uniqueMissed.slice(0, 10),
        unfamiliar: [],
        questionResults: qResults,
      });

      if (passed) recordStudyActivity();

      const existing = getPostSourceQuiz(topicId);
      const attempts = (existing?.attempts ?? []).concat({
        score: avgScore,
        date: new Date().toISOString(),
      });
      setPostSourceQuiz(topicId, {
        score: avgScore,
        passed,
        attempts,
        lastAttempt: new Date().toISOString(),
        misconceptions: uniqueMissed,
        unfamiliar: [],
      });

      saveAttemptToSupabase(avgScore, qResults);
      dispatchProgressUpdate();

      if (passed) {
        onPassed();
      } else {
        onShowRetry(uniqueMissed);
      }
    } else {
      setCurrentQ((c) => c + 1);
    }
  }

  function handleRetry() {
    setResult(null);
    setIsRetry(true);
    loadQuiz(true);
  }

  if (result) {
    const passed = result.score >= PASS_THRESHOLD;
    const wrongQuestions = (result.questionResults ?? []).filter((r) => !r.correct);

    return (
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
        <h3 className="font-semibold text-deep-charcoal">Post-Source Quiz Result</h3>
        <div className="mt-4 flex items-center gap-6">
          <div
            className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 ${
              passed ? "border-sage bg-sage/10" : "border-terracotta/50 bg-terracotta/5"
            }`}
          >
            <span className={`text-xl font-bold ${passed ? "text-sage" : "text-terracotta"}`}>
              {result.score}
            </span>
            <span className="text-deep-charcoal/60">/100</span>
          </div>
          <p className={`flex-1 text-sm font-medium ${passed ? "text-sage" : "text-terracotta"}`}>
            {passed
              ? "Congratulations! You've demonstrated strong understanding of the source material."
              : "You need to score 85% or above to proceed. Review the feedback below and retry."}
          </p>
        </div>

        {passed ? (
          <div className="mt-6 space-y-4">
            <p className="text-deep-charcoal/80 text-sm">
              What would you like to do next?
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onPassed}
                className="rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95"
              >
                {passedPrimaryLabel}
              </button>
              <button
                onClick={handleRetry}
                className="rounded-button border-2 border-dusty-blue bg-transparent px-6 py-2.5 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10"
              >
                Retry Post-Source Quiz
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-4 border-t border-warm-sand/80 pt-6">
              <p className="font-medium text-terracotta">Questions to review:</p>
              {wrongQuestions.map((r, i) => (
                <div
                  key={i}
                  className="rounded-button border border-terracotta/30 bg-terracotta/5 p-4"
                >
                  <p className="font-medium text-deep-charcoal text-sm">{r.question}</p>
                  <p className="mt-1 text-xs text-deep-charcoal/70">
                    Your answer: {r.studentAnswer}
                  </p>
                  <p className="mt-1 text-xs text-sage">
                    Expected: {r.expectedAnswer}
                  </p>
                  {(r.feedback) && (
                    <p className="mt-2 text-sm text-deep-charcoal/80">{r.feedback}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6">
              <p className="text-sm text-deep-charcoal/70 mb-3">
                You must retry the post-source quiz and score 85% or above before proceeding.
              </p>
              <button
                onClick={handleRetry}
                className="rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95"
              >
                Retry Post-Source Quiz
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (questions.length > 0 && !quizStarted) {
    return (
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
        <h3 className="font-semibold text-deep-charcoal">Post-Source Quiz</h3>
        <p className="mt-2 text-sm text-deep-charcoal/80">
          Short quiz based strictly on the source material you just studied. {questions.length} questions.
        </p>
        <button
          onClick={() => setQuizStarted(true)}
          className="mt-4 rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95"
        >
          Start
        </button>
      </div>
    );
  }

  if (questions.length > 0) {
    const q = questions[currentQ];
    if (!q) return null;
    const userAnswer = answers[q.id];
    const showAnswerPanel = answerRevealed;

    return (
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
        {apiError && (
          <div className="mb-4 rounded-button border border-terracotta/20 bg-terracotta/10 p-3 text-sm text-terracotta">
            {apiError}
          </div>
        )}
        <p className="text-sm text-deep-charcoal/60">
          Question {currentQ + 1} of {questions.length}
        </p>
        <h3 className="mt-2 font-medium text-deep-charcoal">{q.question}</h3>
        {q.type === "mcq" && q.options?.length ? (
          <ul className="mt-4 space-y-2">
            {q.options.map((opt, i) => (
              <li key={i}>
                <label className={`flex items-center gap-3 py-3 sm:py-2 px-4 min-h-[52px] sm:min-h-0 rounded-input border-2 transition ${
                  showAnswerPanel
                    ? opt === q.expectedAnswer
                      ? "border-sage bg-sage/10 cursor-default"
                      : answers[q.id] === opt && !lastCorrect
                      ? "border-terracotta/50 bg-terracotta/5 cursor-default"
                      : "border-warm-sand/30 bg-warm-sand/5 cursor-default opacity-75"
                    : "border-warm-sand/50 cursor-pointer has-[:checked]:border-dusty-blue has-[:checked]:bg-dusty-blue/5"
                }`}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === opt}
                    onChange={() => !showAnswerPanel && setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    disabled={showAnswerPanel}
                    className="w-5 h-5 shrink-0"
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
            className="mt-4 w-full rounded-input border-2 border-warm-sand/80 px-4 py-3 text-deep-charcoal disabled:opacity-80"
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
              onClick={goToNextQuestion}
              disabled={assessing}
              className="rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
            >
              {currentQ + 1 >= questions.length ? "See results" : "Next question"}
            </button>
          </div>
        ) : (
          <button
            onClick={checkAnswerAndReveal}
            disabled={assessing || userAnswer === undefined || (q.type === "short" && !String(userAnswer ?? "").trim())}
            className="mt-6 rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
          >
            {assessing ? "Checking…" : "Check answer"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-card border border-dusty-blue/30 bg-dusty-blue/5 p-4 sm:p-6">
      <h3 className="font-semibold text-deep-charcoal">Post-Source Quiz</h3>
      <p className="mt-2 text-sm text-deep-charcoal/80">
        After studying the concepts above, take this short quiz to test your understanding of the source material. Score 85% or above to proceed.
      </p>
      {apiError && (
        <div className="mt-2 rounded-button border border-terracotta/30 bg-terracotta/10 p-3">
          <p className="text-sm text-terracotta">{apiError}</p>
          <p className="mt-1 text-xs text-deep-charcoal/70">The connection may have timed out. Try again — we use a faster model for shorter quizzes.</p>
        </div>
      )}
      <button
        onClick={() => loadQuiz(isRetry)}
        disabled={loading}
        className="mt-4 rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
      >
        {loading ? "Generating…" : apiError ? "Try again" : "Take Post-Source Quiz"}
      </button>
    </div>
  );
}
