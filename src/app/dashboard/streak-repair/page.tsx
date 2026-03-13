"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStreak, setStreak } from "@/lib/storage";
import { isInRepairWindow, getRepairWindowDaysLeft } from "@/lib/streak";

type Question = {
  id: string;
  type: "mcq" | "short";
  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation?: string;
};

type TopicConcept = { title: string; description?: string };

export default function StreakRepairPage() {
  const [concepts, setConcepts] = useState<TopicConcept[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [assessing, setAssessing] = useState(false);
  const [quizScores, setQuizScores] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("adaptive-learning-topics");
    if (!raw) {
      setLoading(false);
      return;
    }
    const topics = JSON.parse(raw);
    const allConcepts: TopicConcept[] = [];
    for (const t of topics) {
      if (t.concepts?.length) {
        for (const c of t.concepts) {
          allConcepts.push({ title: c.title, description: c.description });
        }
      }
    }
    setConcepts(allConcepts);
    setLoading(false);
  }, []);

  async function loadQuiz() {
    if (concepts.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepts: concepts.slice(0, 15),
          sourceMaterial: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const qs = (data.mainQuiz ?? data.questions ?? []).slice(0, 8);
      setQuestions(qs);
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
        const passed = avg >= 70;
        setResult({ score: avg, passed });

        if (passed) {
          const streakData = getStreak();
          const prev = streakData.repairWindow?.previousStreak ?? 0;
          setStreak({
            ...streakData,
            streak: prev,
            repairWindow: undefined,
            lastActiveDate: new Date().toISOString().slice(0, 10),
          });
        }
      } else {
        setCurrentQ((c) => c + 1);
      }
    } finally {
      setAssessing(false);
    }
  }

  const inWindow = isInRepairWindow();
  const daysLeft = getRepairWindowDaysLeft();

  if (!inWindow || daysLeft <= 0) {
    return (
      <div className="animate-fade-in py-12">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
        <p className="mt-8 text-deep-charcoal/60">Streak repair window has expired.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="animate-fade-in">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
        <div className="mt-8 rounded-card border border-warm-sand/80 bg-cream p-8 text-center">
          <h2 className="text-xl font-semibold text-deep-charcoal">
            {result.passed ? "Streak Restored! 🎉" : "Not quite this time"}
          </h2>
          <p className="mt-2 text-deep-charcoal/80">Score: {result.score}%</p>
          {result.passed ? (
            <p className="mt-4 text-sage">Your streak has been restored!</p>
          ) : (
            <p className="mt-4 text-terracotta">You have {daysLeft - 1} more day(s) to try again.</p>
          )}
          <Link href="/dashboard" className="mt-6 inline-block rounded-button bg-dusty-blue px-6 py-2 text-white">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading && questions.length === 0) {
    return (
      <div className="py-12">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
        <p className="mt-8 text-deep-charcoal/60">Loading...</p>
      </div>
    );
  }

  if (concepts.length === 0) {
    return (
      <div className="py-12">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
        <p className="mt-8 text-deep-charcoal/60">No topics to quiz from. Add some topics first.</p>
      </div>
    );
  }

  if (questions.length === 0 && !quizStarted) {
    return (
      <div className="animate-fade-in">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
        <h1 className="mt-6 text-2xl font-bold text-deep-charcoal">Streak Repair Quiz</h1>
        <p className="mt-2 text-deep-charcoal/80">
          Pass this comprehensive quiz (70%+) to restore your streak. {daysLeft} day(s) left.
        </p>
        <button
          onClick={loadQuiz}
          disabled={loading}
          className="mt-6 rounded-button bg-terracotta px-8 py-2.5 text-white disabled:opacity-50"
        >
          {loading ? "Generating…" : "Start Quiz"}
        </button>
      </div>
    );
  }

  const q = questions[currentQ];
  if (!q) return null;

  return (
    <div className="animate-fade-in">
      <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
      <div className="mt-6 rounded-card border border-warm-sand/80 bg-cream p-6">
        <p className="text-sm text-deep-charcoal/60">
          Question {currentQ + 1} of {questions.length} · {daysLeft} day(s) left
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
          className="mt-6 rounded-button bg-terracotta px-8 py-2 text-white disabled:opacity-50"
        >
          {assessing ? "Checking…" : "Next"}
        </button>
      </div>
    </div>
  );
}
