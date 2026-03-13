"use client";

import { useState } from "react";
import { getActiveRecall, setActiveRecall } from "@/lib/storage";
import { recordStudyActivity } from "@/lib/streak";
import { dispatchProgressUpdate } from "@/lib/progressEvents";
import { RECALL_INTERVALS, getNextDueDate, isDue, getIntervalLabel } from "@/lib/activeRecall";
import type { Concept } from "@/types";

type Question = {
  id: string;
  type: "mcq" | "short";
  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation?: string;
};

export function ActiveRecall({
  topicId,
  topicTitle,
  concepts,
  assessmentScore,
  onActivity,
}: {
  topicId: string;
  topicTitle: string;
  concepts: Concept[];
  assessmentScore: number;
  onActivity?: () => void;
}) {
  const [schedule, setSchedule] = useState(() => {
    const saved = getActiveRecall(topicId);
    if (saved) return saved;
    if (assessmentScore >= 90) {
      const newSchedule = {
        topicId,
        topicTitle,
        unlockedAt: new Date().toISOString(),
        currentInterval: 0,
        nextDueAt: getNextDueDate(new Date().toISOString(), 0),
        results: [] as { intervalDay: number; score: number; passed: boolean; date: string }[],
        lastResult: undefined as { score: number; passed: boolean } | undefined,
      };
      setActiveRecall(topicId, newSchedule);
      return newSchedule;
    }
    return null;
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [assessing, setAssessing] = useState(false);
  const [quizScores, setQuizScores] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number } | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);

  if (assessmentScore < 90 || assessmentScore > 100) return null;
  if (!schedule) return null;

  const due = isDue(schedule.nextDueAt);
  const intervalDay = RECALL_INTERVALS[schedule.currentInterval] ?? 1;


  async function loadQuiz() {
    setLoading(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepts: concepts.map((c) => ({ title: c.title, description: c.description })),
          sourceMaterial: false,
          freshRecall: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const qs = data.mainQuiz ?? data.questions ?? [];
      setQuestions(qs.slice(0, 5));
      setCurrentQ(0);
      setAnswers({});
      setQuizStarted(false);
      setQuizScores([]);
      setResult(null);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function assessQuiz() {
    const q = questions[currentQ];
    const answer = answers[q?.id ?? ""];
    if (!q || answer === undefined) return;
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
      if (!res.ok) throw new Error();
      const newScores = [...quizScores, data.score];
      setQuizScores(newScores);
      if (currentQ + 1 >= questions.length) {
        const avg = Math.round(newScores.reduce((a, b) => a + b, 0) / newScores.length);
        setResult({ score: avg });
        recordStudyActivity();
        onActivity?.();
        dispatchProgressUpdate();

        const passed = avg >= 70;
        if (!schedule) return;
        const newResults = [
          ...schedule.results,
          { intervalDay, score: avg, passed, date: new Date().toISOString() },
        ];
        if (passed) {
          const nextIndex = Math.min(
            schedule.currentInterval + 1,
            RECALL_INTERVALS.length - 1
          );
          const nextDue = getNextDueDate(new Date().toISOString(), nextIndex);
          const updated = {
            ...schedule,
            currentInterval: nextIndex,
            nextDueAt: nextDue,
            results: newResults,
            lastResult: { score: avg, passed: true },
          };
          setActiveRecall(topicId, updated);
          setSchedule(updated);
        } else {
          const updated = {
            ...schedule,
            currentInterval: 0,
            nextDueAt: getNextDueDate(new Date().toISOString(), 0),
            results: newResults,
            lastResult: { score: avg, passed: false },
          };
          setActiveRecall(topicId, updated);
          setSchedule(updated);
        }
      } else {
        setCurrentQ((c) => c + 1);
      }
    } finally {
      setAssessing(false);
    }
  }

  if (result) {
    const passed = schedule?.lastResult?.passed ?? result.score >= 70;
    return (
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <h3 className="font-semibold text-deep-charcoal">
          {getIntervalLabel(intervalDay)} Complete
        </h3>
        <p className="mt-2 text-deep-charcoal/80">
          Score: {result.score}% — {passed ? "Well done! Next review scheduled." : "Schedule reset. Review and try Day 1 again."}
        </p>
        <button
          onClick={() => {
            setResult(null);
            setQuestions([]);
          }}
          className="mt-4 rounded-button bg-dusty-blue px-6 py-2 text-sm text-white"
        >
          Done
        </button>
      </div>
    );
  }

  if (questions.length > 0 && !quizStarted) {
    return (
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <h3 className="font-semibold text-deep-charcoal">{getIntervalLabel(intervalDay)}</h3>
        <p className="mt-1 text-sm text-deep-charcoal/80">
          {questions.length} fresh questions from your source material.
        </p>
        <button
          onClick={() => setQuizStarted(true)}
          className="mt-4 rounded-button bg-dusty-blue px-6 py-2 text-sm text-white"
        >
          Start
        </button>
      </div>
    );
  }

  if (questions.length > 0) {
    const q = questions[currentQ];
    if (!q) return null;
    return (
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <p className="text-sm text-deep-charcoal/60">
          Question {currentQ + 1} of {questions.length}
        </p>
        <h3 className="mt-2 font-medium text-deep-charcoal">{q.question}</h3>
        {q.type === "mcq" && q.options?.length ? (
          <ul className="mt-4 space-y-2">
            {q.options.map((opt, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-3 py-2 px-4 rounded-input border-2 border-warm-sand/50 has-[:checked]:border-dusty-blue">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                  />
                  <span>{opt}</span>
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
            className="mt-4 w-full rounded-input border-2 border-warm-sand/80 px-4 py-3"
          />
        )}
        <button
          onClick={assessQuiz}
          disabled={assessing || answers[q.id] === undefined}
          className="mt-6 rounded-button bg-dusty-blue px-8 py-2 text-sm text-white disabled:opacity-50"
        >
          {assessing ? "Checking…" : "Next"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-card border border-sage/30 bg-sage/5 p-6">
      <h3 className="font-semibold text-deep-charcoal">Active Recall</h3>
      <p className="mt-2 text-sm text-deep-charcoal/80">
        {due
          ? `Your ${getIntervalLabel(intervalDay)} is due. Take a fresh quiz to reinforce your memory.`
          : `Next review (${getIntervalLabel(intervalDay)}) due ${new Date(schedule.nextDueAt).toLocaleDateString()}`}
      </p>
      {due && (
        <button
          onClick={loadQuiz}
          disabled={loading}
          className="mt-4 rounded-button bg-sage px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Generating…" : `Take ${getIntervalLabel(intervalDay)}`}
        </button>
      )}
    </div>
  );
}
