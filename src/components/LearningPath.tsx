"use client";

import { useState } from "react";
import { ExternalLink, Video, BookOpen, Search, Check } from "lucide-react";
import { PostSourceQuiz } from "@/components/PostSourceQuiz";
import { getPostSourceQuiz } from "@/lib/storage";
import type { Concept, LearningStyleProfile } from "@/types";

function getResourceLinks(conceptTitle: string) {
  const q = encodeURIComponent(conceptTitle);
  return [
    { label: "YouTube", href: `https://www.youtube.com/results?search_query=${q}+tutorial`, icon: Video },
    { label: "Khan Academy", href: `https://www.khanacademy.org/search?page_search_query=${q}`, icon: BookOpen },
    { label: "Search", href: `https://www.google.com/search?q=${q}+explained`, icon: Search },
  ];
}

type Feedback = {
  reasoning?: string;
  correct?: string[];
  misconceptions?: string[];
};

export function LearningPath({
  concepts,
  weakConcepts,
  topicTitle,
  topicSummary,
  topicId,
  assessmentScore,
  assessmentFeedback,
  learningStyle,
  onComplete,
  onPostSourcePassed,
  onReturnToMainAssessment,
  completedConceptIds = [],
  onConceptComplete,
}: {
  concepts: Concept[];
  weakConcepts: string[];
  topicTitle?: string;
  topicSummary?: string;
  topicId?: string;
  assessmentScore?: number | null;
  assessmentFeedback?: Feedback | null;
  learningStyle: LearningStyleProfile | null;
  onComplete: () => void;
  onPostSourcePassed?: () => void;
  onReturnToMainAssessment?: () => void;
  completedConceptIds?: string[];
  onConceptComplete?: (conceptId: string) => void;
}) {
  const items = weakConcepts.length
    ? concepts.filter((c) => weakConcepts.includes(c.id))
    : [];
  const [activeBasics, setActiveBasics] = useState<string | null>(null);
  const postSourcePassed = topicId ? getPostSourceQuiz(topicId)?.passed : false;

  if (items.length === 0 && !assessmentFeedback && assessmentScore == null) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Understanding score and feedback - always shown when we have a score (e.g. 95) */}
      {(assessmentScore != null || assessmentFeedback) && (
        <div className="rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
          <h3 className="font-semibold text-deep-charcoal">Understanding score</h3>
          {assessmentScore != null && (
            <div className="mt-4 flex items-center gap-6">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-warm-sand/80 bg-cream">
                <span className="text-xl font-bold text-deep-charcoal">{assessmentScore}</span>
                <span className="text-deep-charcoal/60">/100</span>
              </div>
              <p className="text-deep-charcoal/80 text-sm flex-1">
                {assessmentFeedback?.reasoning?.trim() ||
                  "Use the learning path below to review and strengthen your understanding."}
              </p>
            </div>
          )}
          <div className="mt-4 space-y-3 border-t border-warm-sand/80 pt-4">
            {assessmentFeedback?.correct && assessmentFeedback.correct.length > 0 && (
              <div>
                <p className="font-medium text-sage text-sm">✅ You understand:</p>
                <ul className="list-disc list-inside text-deep-charcoal/90 text-sm ml-2 mt-1">
                  {assessmentFeedback.correct.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {assessmentFeedback?.misconceptions && assessmentFeedback.misconceptions.length > 0 && (
              <div>
                <p className="font-medium text-terracotta text-sm">🔍 Misconceptions:</p>
                <ul className="list-disc list-inside text-deep-charcoal/90 text-sm ml-2 mt-1">
                  {assessmentFeedback.misconceptions.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Learning path - or "No weak spots" when score is high (e.g. 95) */}
      <div className="rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
        {items.length === 0 ? (
          <div className="py-4 text-center">
            <span className="text-4xl">🎉</span>
            <h2 className="mt-4 text-lg font-semibold text-deep-charcoal">
              No weak spots — you&apos;ve got this!
            </h2>
            <p className="mt-2 text-sm text-deep-charcoal/80">
              Keep practicing to reinforce your understanding.
            </p>
          </div>
        ) : (
          <>
        <h2 className="font-medium text-deep-charcoal">Focus on these concepts:</h2>
        <p className="mt-1 text-sm text-deep-charcoal/60">
          {items.length} concept{items.length !== 1 ? "s" : ""} to review
        </p>
        <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-deep-charcoal/70 mb-2">
              <span>Progress</span>
              <span>{completedConceptIds.filter((id) => items.some((c) => c.id === id)).length}/{items.length} complete</span>
            </div>
            <div className="h-2 rounded-full bg-warm-sand/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-sage transition-all duration-300"
                style={{
                  width: `${items.length ? (completedConceptIds.filter((id) => items.some((c) => c.id === id)).length / items.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        <ul className="mt-6 divide-y divide-warm-sand/50">
          {items.map((c, i) => {
            const isComplete = completedConceptIds.includes(c.id);
            return (
            <li key={c.id} className={`py-4 first:pt-0 ${isComplete ? "opacity-80" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    isComplete ? "bg-sage text-white" : "bg-warm-sand/50 text-deep-charcoal/60"
                  }`}>
                    {isComplete ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-deep-charcoal">{c.title}</p>
                    {c.description && (
                      <p className="mt-1 text-sm text-deep-charcoal/60 line-clamp-2">{c.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getResourceLinks(c.title).map((r) => (
                        <a
                          key={r.label}
                          href={r.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-button border border-dusty-blue/30 bg-dusty-blue/5 px-2 py-1.5 text-xs font-medium text-dusty-blue hover:bg-dusty-blue/10 transition min-h-[36px]"
                        >
                          <r.icon size={12} />
                          {r.label}
                          <ExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 self-start sm:self-auto">
                  {onConceptComplete && (
                    <button
                      type="button"
                      onClick={() => onConceptComplete(c.id)}
                      disabled={isComplete}
                      className={`rounded-button px-4 py-2.5 text-sm font-medium transition min-h-[44px] ${
                        isComplete
                          ? "bg-sage/20 text-sage cursor-default"
                          : "bg-sage px-4 py-2.5 text-white hover:brightness-95"
                      }`}
                    >
                      {isComplete ? "Complete" : "Mark complete"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveBasics(activeBasics === c.id ? null : c.id)}
                    className="rounded-button border border-dusty-blue bg-transparent px-4 py-2.5 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10 transition min-h-[44px]"
                  >
                    Start with Basics
                  </button>
                </div>
              </div>
              {activeBasics === c.id && (
                <div className="mt-4 ml-11 rounded-card border border-dusty-blue/20 bg-dusty-blue/5 p-4">
                  <p className="text-sm text-deep-charcoal/90">{c.description || `${c.title} — review your notes for this concept. Use the resources above or the AI Tutor for help.`}</p>
                </div>
              )}
            </li>
          );
          })}
        </ul>

        {/* Post-Source Quiz - after studying unfamiliar concepts */}
        {topicId && items.length > 0 && (
          <>
            <PostSourceQuiz
              topicId={topicId}
              concepts={items}
              misconceptions={assessmentFeedback?.misconceptions}
              onPassed={() => onPostSourcePassed?.()}
              onShowRetry={() => {}}
            />
            {postSourcePassed && onReturnToMainAssessment && (
              <div className="mt-6 rounded-card border border-sage/30 bg-sage/5 p-6">
                <p className="font-medium text-deep-charcoal">Full marks on post-source quiz! Ready for the full assessment?</p>
                <button
                  onClick={onReturnToMainAssessment}
                  className="mt-4 rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95"
                >
                  Return to main assessment
                </button>
              </div>
            )}
          </>
        )}
          </>
        )}
      </div>
    </div>
  );
}
