"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Checklist } from "@/components/Checklist";
import { QuizFlow } from "@/components/QuizFlow";
import { LearningPath } from "@/components/LearningPath";
import { ActiveRecall } from "@/components/ActiveRecall";
import { TutorChat } from "@/components/TutorChat";
import { recordStudyActivity } from "@/lib/streak";
import { dispatchProgressUpdate } from "@/lib/progressEvents";
import type { Concept, ChecklistItem, LearningStyleProfile } from "@/types";

type TopicData = {
  topicId: string | null;
  title: string;
  summary: string;
  concepts: Concept[];
  checklist: ChecklistItem[];
  rawSources?: string[];
  lastSessionSummary?: string;
};

export default function TopicPage({
  params,
}: {
  params: { id: string };
}) {
  const { data: session } = useSession();
  const { id } = params;
  const [data, setData] = useState<TopicData | null>(null);
  const [checklistDone, setChecklistDone] = useState(false);
  const [assessmentScore, setAssessmentScore] = useState<number | null>(null);
  const [caseMode, setCaseMode] = useState<1 | 2>(2);
  const [showTutor, setShowTutor] = useState(false);
  const [learningStyle, setLearningStyle] = useState<LearningStyleProfile | null>(null);
  const [unfamiliarConcepts, setUnfamiliarConcepts] = useState<string[]>([]);
  const [assessmentFeedback, setAssessmentFeedback] = useState<{
    reasoning?: string;
    correct?: string[];
    misconceptions?: string[];
  } | null>(null);
  const [learningPathCompleted, setLearningPathCompleted] = useState<string[]>([]);
  const [retakeMainAssessment, setRetakeMainAssessment] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (session?.user) {
        try {
          const res = await fetch(`/api/topics/${encodeURIComponent(id)}`);
          if (res.ok) {
            const json = await res.json();
            setData({
              topicId: json.topicId,
              title: json.title,
              summary: json.summary ?? "",
              concepts: json.concepts ?? [],
              checklist: json.checklist ?? [],
              rawSources: json.rawSources ?? [],
              lastSessionSummary: json.lastSessionSummary,
            });
            if (json.progress) {
              setChecklistDone(json.progress.checklistDone ?? false);
              setAssessmentScore(json.progress.assessmentScore ?? null);
              setCaseMode(json.progress.caseMode ?? 2);
              setUnfamiliarConcepts(json.progress.unfamiliarConcepts ?? []);
              setAssessmentFeedback(json.progress.assessmentFeedback ?? null);
              setLearningPathCompleted(json.progress.learningPathCompleted ?? []);
            }
            setLoading(false);
            return;
          }
        } catch {}
      }
      const raw = localStorage.getItem("adaptive-learning-topics");
      if (!raw) {
        setLoading(false);
        return;
      }
      const topics: TopicData[] = JSON.parse(raw);
      const topic = topics.find(
        (t) => t.topicId === id || encodeURIComponent(t.title) === id
      );
      if (topic) setData(topic);
      const progressRaw = localStorage.getItem(`progress-${id}`);
      if (progressRaw) {
        try {
          const progress = JSON.parse(progressRaw);
          setChecklistDone(progress.checklistDone ?? false);
          setAssessmentScore(progress.assessmentScore ?? null);
          setCaseMode(progress.caseMode ?? 2);
          setUnfamiliarConcepts(Array.isArray(progress.unfamiliarConcepts) ? progress.unfamiliarConcepts : []);
          setAssessmentFeedback(progress.assessmentFeedback ?? null);
          setLearningPathCompleted(Array.isArray(progress.learningPathCompleted) ? progress.learningPathCompleted : []);
        } catch {}
      }
      const styleRaw = localStorage.getItem("adaptive-learning-style");
      if (styleRaw) {
        try {
          setLearningStyle(JSON.parse(styleRaw));
        } catch {}
      }
      setLoading(false);
    }
    load();
  }, [id, session]);

  async function persistProgress(updates: {
    checklistDone?: boolean;
    checklistItems?: ChecklistItem[];
    assessmentScore?: number;
    caseMode?: 1 | 2;
    unfamiliarConcepts?: string[];
    assessmentFeedback?: unknown;
    lastSessionSummary?: string;
    assessmentType?: "main" | "post_source" | "checkpoint" | "active_recall";
    conceptStatusUpdates?: Array<{ conceptId: string; status: string }>;
    learningPathCompleted?: string[];
  }) {
    if (session?.user) {
      try {
        await fetch(`/api/topics/${encodeURIComponent(id)}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklistDone: updates.checklistDone,
            checklistItems: updates.checklistItems?.map((i) => ({
              id: i.id,
              completed: i.completed,
            })),
            assessmentScore: updates.assessmentScore,
            caseMode: updates.caseMode,
            unfamiliarConcepts: updates.unfamiliarConcepts,
            assessmentFeedback: updates.assessmentFeedback,
            lastSessionSummary: updates.lastSessionSummary,
            assessmentType: updates.assessmentType,
            conceptStatusUpdates: updates.conceptStatusUpdates,
            learningPathCompleted: updates.learningPathCompleted,
          }),
        });
      } catch {}
    } else {
      const progress = JSON.parse(localStorage.getItem(`progress-${id}`) ?? "{}");
      if (updates.checklistDone != null) progress.checklistDone = updates.checklistDone;
      if (updates.assessmentScore != null) progress.assessmentScore = updates.assessmentScore;
      if (updates.caseMode != null) progress.caseMode = updates.caseMode;
      if (updates.unfamiliarConcepts != null) progress.unfamiliarConcepts = updates.unfamiliarConcepts;
      if (updates.assessmentFeedback != null) progress.assessmentFeedback = updates.assessmentFeedback;
      if (updates.learningPathCompleted != null) progress.learningPathCompleted = updates.learningPathCompleted;
      localStorage.setItem(`progress-${id}`, JSON.stringify(progress));

      if (updates.checklistItems && data) {
        const topics: TopicData[] = JSON.parse(localStorage.getItem("adaptive-learning-topics") ?? "[]");
        const idx = topics.findIndex((t) => t.topicId === id || encodeURIComponent(t.title) === id);
        if (idx >= 0) {
          topics[idx].checklist = updates.checklistItems;
          localStorage.setItem("adaptive-learning-topics", JSON.stringify(topics));
        }
      }
    }
  }

  const handleChecklistUpdate = async (items: ChecklistItem[]) => {
    if (!data) return;
    const allDone = items.every((i) => i.completed);
    setChecklistDone(allDone);
    await persistProgress({ checklistDone: allDone, checklistItems: items });
    dispatchProgressUpdate();
  };

  const handleAssessmentComplete = async (r: {
    score: number;
    unfamiliar?: string[];
    reasoning?: string;
    correct?: string[];
    misconceptions?: string[];
  }) => {
    recordStudyActivity();
    setAssessmentScore(r.score);
    setCaseMode(r.score >= 100 ? 1 : 2);
    setUnfamiliarConcepts(r.unfamiliar ?? []);
    setAssessmentFeedback(
      r.reasoning || r.correct?.length || r.misconceptions?.length
        ? { reasoning: r.reasoning, correct: r.correct, misconceptions: r.misconceptions }
        : null
    );
    const lastSessionSummary = `Last time you scored ${r.score}% on ${data?.title ?? "this topic"}.`;
    await persistProgress({
      checklistDone: true,
      assessmentScore: r.score,
      caseMode: r.score >= 100 ? 1 : 2,
      unfamiliarConcepts: r.unfamiliar ?? [],
      assessmentFeedback: { reasoning: r.reasoning, correct: r.correct, misconceptions: r.misconceptions },
      lastSessionSummary,
      assessmentType: "main",
    });
    dispatchProgressUpdate();
  };

  if (loading) {
    return (
      <div className="py-12">
        <p className="text-deep-charcoal/60">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Back to dashboard
        </Link>
        <p className="mt-8 text-deep-charcoal/60">Topic not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {data.lastSessionSummary && (
        <div className="mb-6 rounded-card border border-dusty-blue/20 bg-dusty-blue/5 p-4">
          <p className="text-sm text-deep-charcoal/90">{data.lastSessionSummary}</p>
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Dashboard
        </Link>
        {caseMode === 2 && (
          <button
            onClick={() => setShowTutor((s) => !s)}
            className="rounded-button border border-dusty-blue/50 bg-dusty-blue/5 px-4 py-2 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10 transition"
          >
            {showTutor ? "Hide tutor" : "AI tutor"}
          </button>
        )}
      </div>

      <h1 className="text-xl sm:text-2xl font-bold text-deep-charcoal break-words">{data.title}</h1>
      {data.summary && (
        <p className="mt-2 text-deep-charcoal/80 leading-body">{data.summary}</p>
      )}

      {!checklistDone && (
        <section className="mt-8">
          <p className="mb-4 text-sm text-deep-charcoal/70">
            Tick off each item as you study. When all are done, take a quiz or explain the concept to the AI.
          </p>
          <Checklist items={data.checklist} onUpdate={handleChecklistUpdate} />
        </section>
      )}

      {checklistDone && assessmentScore === null && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-deep-charcoal mb-2">Check your understanding</h2>
          <p className="mb-4 text-sm text-deep-charcoal/70">
            Take a quiz or explain the concept in your own words to the AI.
          </p>
          <QuizFlow
            concepts={data.concepts}
            learningStyle={learningStyle}
            onComplete={handleAssessmentComplete}
            topicSummary={data.summary}
          />
        </section>
      )}

      {checklistDone && assessmentScore !== null && (
        <>
          {retakeMainAssessment ? (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-deep-charcoal mb-2">Retake main assessment</h2>
              <p className="mb-4 text-sm text-deep-charcoal/70">
                Take the quiz or explain the concept again to re-check your understanding.
              </p>
              <QuizFlow
                concepts={data.concepts}
                learningStyle={learningStyle}
                onComplete={(r) => {
                  handleAssessmentComplete(r);
                  setRetakeMainAssessment(false);
                }}
                topicSummary={data.summary}
              />
            </section>
          ) : caseMode === 1 ? (
            <>
              <section className="mt-8 rounded-card border border-sage/20 bg-sage/5 p-8 text-center animate-celebration">
                <span className="text-5xl">🎉</span>
                <h2 className="mt-4 text-xl font-semibold text-deep-charcoal">
                  Beautiful work! You&apos;ve mastered this!
                </h2>
                <p className="mt-2 text-deep-charcoal/80">
                  Ready to go deeper? Active recall will help you retain this long-term.
                </p>
                <div className="mt-6 rounded-card border border-sage/20 bg-sage/5 p-4 text-left">
                  <p className="text-sm text-deep-charcoal/80">Next review: in 1 day 🔔</p>
                </div>
              </section>
              <LearningPath
                concepts={data.concepts}
                weakConcepts={[]}
                topicTitle={data.title}
                topicSummary={data.summary}
                topicId={id}
                assessmentScore={assessmentScore}
                assessmentFeedback={assessmentFeedback}
                learningStyle={learningStyle}
                onComplete={() => {}}
                completedConceptIds={learningPathCompleted}
                onConceptComplete={async (conceptId) => {
                  const next = [...learningPathCompleted, conceptId];
                  setLearningPathCompleted(next);
                  await persistProgress({
                    conceptStatusUpdates: [{ conceptId, status: "mastered" }],
                    learningPathCompleted: next,
                  });
                  dispatchProgressUpdate();
                }}
              />
              {assessmentScore != null && assessmentScore >= 90 && (
                <ActiveRecall
                  topicId={id}
                  topicTitle={data.title}
                  concepts={data.concepts}
                  assessmentScore={assessmentScore}
                />
              )}
            </>
          ) : assessmentScore != null && assessmentScore >= 90 ? (
            <>
              <LearningPath
                    concepts={data.concepts}
                    weakConcepts={data.concepts
                      .filter((c) =>
                        unfamiliarConcepts.some(
                          (u) =>
                            u.toLowerCase().includes(c.title.toLowerCase()) ||
                            c.title.toLowerCase().includes(u.toLowerCase())
                        )
                      )
                      .map((c) => c.id)}
                    topicTitle={data.title}
                    topicSummary={data.summary}
                    topicId={id}
                    assessmentScore={assessmentScore}
                    assessmentFeedback={assessmentFeedback}
                    learningStyle={learningStyle}
                    onComplete={() => {}}
                    onPostSourcePassed={() => {}}
                    onReturnToMainAssessment={() => setRetakeMainAssessment(true)}
                    completedConceptIds={learningPathCompleted}
                    onConceptComplete={async (conceptId) => {
                      const next = [...learningPathCompleted, conceptId];
                      setLearningPathCompleted(next);
                      await persistProgress({
                        conceptStatusUpdates: [{ conceptId, status: "mastered" }],
                        learningPathCompleted: next,
                      });
                      dispatchProgressUpdate();
                    }}
                  />
              <ActiveRecall
                topicId={id}
                topicTitle={data.title}
                concepts={data.concepts}
                assessmentScore={assessmentScore}
              />
            </>
          ) : (
            <LearningPath
              concepts={data.concepts}
              weakConcepts={data.concepts
                .filter((c) =>
                  unfamiliarConcepts.some(
                    (u) =>
                      u.toLowerCase().includes(c.title.toLowerCase()) ||
                      c.title.toLowerCase().includes(u.toLowerCase())
                  )
                )
                .map((c) => c.id)}
              topicTitle={data.title}
              topicSummary={data.summary}
              topicId={id}
              assessmentScore={assessmentScore}
              assessmentFeedback={assessmentFeedback}
              learningStyle={learningStyle}
              onComplete={() => {}}
              onReturnToMainAssessment={() => setRetakeMainAssessment(true)}
              completedConceptIds={learningPathCompleted}
              onConceptComplete={async (conceptId) => {
                const next = [...learningPathCompleted, conceptId];
                setLearningPathCompleted(next);
                await persistProgress({
                  conceptStatusUpdates: [{ conceptId, status: "mastered" }],
                  learningPathCompleted: next,
                });
                dispatchProgressUpdate();
              }}
            />
          )}
        </>
      )}

      {showTutor && (
        <TutorChat
          conceptTitle={data.concepts[0]?.title ?? data.title}
          conceptContext={data.summary}
          onClose={() => setShowTutor(false)}
        />
      )}
    </div>
  );
}
