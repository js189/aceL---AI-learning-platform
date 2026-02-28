"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const QUESTIONS = [
  "When you learn something new, do you prefer watching someone explain it, reading about it, drawing it out, or talking it through?",
  "When you get stuck, what helps most: an example, a diagram, a story, or step-by-step instructions?",
  "How do you like to review what you have learned: flashcards, summary notes, mind maps, or practice questions?",
  "Do you prefer working through things slowly with guidance or getting an overview first and filling in gaps later?",
  "What subjects or topics do you enjoy most outside of school? (used to personalise analogies)",
];

export default function LearningStylePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentQ = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  function handleNext(value: string) {
    const next = [...answers];
    next[step] = value;
    setAnswers(next);
    if (isLast) {
      submit(next);
    } else {
      setStep((s) => s + 1);
    }
  }

  async function submit(finalAnswers: string[]) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/learning-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      localStorage.setItem("adaptive-learning-style", JSON.stringify(data.profile));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Dashboard
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-deep-charcoal">Learning style</h1>
      <p className="mt-2 text-deep-charcoal/80">
        Answer 5 quick questions so we can adapt content to how you learn best.
      </p>

      <div className="mt-8 max-w-xl">
        <p className="text-sm text-deep-charcoal/60">Question {step + 1} of {QUESTIONS.length}</p>
        <h2 className="mt-2 font-medium text-deep-charcoal">{currentQ}</h2>

        {step === 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {["Watching someone explain", "Reading about it", "Drawing it out", "Talking it through"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleNext(opt)}
                className="rounded-button border border-warm-sand bg-cream px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/50 transition"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {["An example", "A diagram", "A story", "Step-by-step instructions"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleNext(opt)}
                className="rounded-button border border-warm-sand bg-cream px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/50 transition"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {["Flashcards", "Summary notes", "Mind maps", "Practice questions"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleNext(opt)}
                className="rounded-button border border-warm-sand bg-cream px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/50 transition"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {["Slowly with guidance", "Overview first, then fill in gaps"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleNext(opt)}
                className="rounded-button border border-warm-sand bg-cream px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/50 transition"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {step === 4 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem("interests") as HTMLInputElement).value;
              handleNext(input || "General");
            }}
            className="mt-6"
          >
            <input
              name="interests"
              type="text"
              placeholder="e.g. music, sports, games..."
              className="w-full rounded-input border-2 border-warm-sand/80 bg-cream px-4 py-3 text-deep-charcoal placeholder:text-deep-charcoal/40 focus:border-dusty-blue focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-button bg-dusty-blue py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 transition"
            >
              {loading ? "Saving…" : "Finish"}
            </button>
          </form>
        )}

        {!isLast && step < 4 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="mt-6 text-sm text-deep-charcoal/60 hover:text-deep-charcoal"
          >
            Back
          </button>
        )}

        {error && (
          <div className="mt-4 rounded-button border border-terracotta/20 bg-terracotta/10 p-3 text-sm text-terracotta">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
