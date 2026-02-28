"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FileText,
  Pin,
  Archive,
  Trash2,
  ChevronRight,
  BookOpen,
  Calendar,
} from "lucide-react";
import { isInRepairWindow, getRepairWindowDaysLeft } from "@/lib/streak";
import { getActiveRecall, getRecallNotificationsSent, markRecallNotificationSent } from "@/lib/storage";
import { isDue, RECALL_INTERVALS } from "@/lib/activeRecall";

type TopicCard = {
  topicId: string;
  title: string;
  summary?: string;
  subject?: string;
  status?: string;
  current_step?: string;
  understanding_score?: number;
  last_accessed_at?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  progress?: { checklistCompleted?: boolean; assessmentScore?: number };
  checklist?: { done: number; total: number };
};

const STEP_LABELS: Record<string, string> = {
  upload: "Upload",
  checklist: "Checklist",
  assessment: "Assessment",
  case1: "Mastered",
  case2: "Learning Path",
  learning_path: "Learning Path",
  re_assessment: "Re-assessment",
  mastered: "Mastered",
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [topics, setTopics] = useState<TopicCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "in_progress" | "mastered" | "review_due" | "archived"
  >("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pinLimit, setPinLimit] = useState(0);

  useEffect(() => {
    async function checkRecallNotifications() {
      const sent = getRecallNotificationsSent();
      const raw = localStorage.getItem("adaptive-learning-topics");
      if (!raw) return;
      const topicList = JSON.parse(raw);
      for (const t of topicList) {
        const topicId = t.topicId ?? encodeURIComponent(t.title);
        const recall = getActiveRecall(topicId);
        if (!recall || !isDue(recall.nextDueAt)) continue;
        const intervalDay = RECALL_INTERVALS[recall.currentInterval] ?? 1;
        const key = `${topicId}-${intervalDay}`;
        if (sent[key]) continue;
        try {
          const res = await fetch("/api/recall-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topicTitle: recall.topicTitle,
              intervalDay,
              topicId,
            }),
          });
          const data = await res.json();
          if (data.sent) markRecallNotificationSent(topicId, intervalDay);
        } catch {}
      }
    }
    checkRecallNotifications();
  }, []);

  const loadTopics = useCallback(async () => {
    if (status === "loading") return;
      if (session?.user && status === "authenticated") {
        try {
          const res = await fetch(`/api/topics?filter=${filter}`);
          const data = await res.json();
          if (res.ok && Array.isArray(data.topics)) {
            setTopics(data.topics);
            const pinned = data.topics.filter((t: TopicCard) => t.is_pinned);
            setPinLimit(pinned.length);
          }
        } catch {
          // Fallback to localStorage
          const raw = localStorage.getItem("adaptive-learning-topics");
          if (raw) {
            const parsed = JSON.parse(raw);
            setTopics(
              parsed.map((t: { topicId?: string; title: string; summary?: string; checklist?: { completed?: boolean }[] }) => ({
                topicId: t.topicId ?? t.title,
                title: t.title,
                summary: t.summary,
                progress: null,
                checklist: t.checklist
                  ? {
                      done: t.checklist.filter((c: { completed?: boolean }) => c.completed).length,
                      total: t.checklist.length,
                    }
                  : undefined,
              }))
            );
          }
        }
      } else {
        const raw = localStorage.getItem("adaptive-learning-topics");
        const d = localStorage.getItem("adaptive-learning-dismissed");
        const dismissed = d ? new Set(JSON.parse(d)) : new Set<string>();
        if (raw) {
          const parsed = JSON.parse(raw);
          setTopics(
            parsed
              .filter(
                (t: { topicId?: string; title: string }) =>
                  !dismissed.has(t.topicId ?? encodeURIComponent(t.title))
              )
              .map((t: { topicId?: string; title: string; summary?: string; checklist?: { completed?: boolean }[] }) => ({
                topicId: t.topicId ?? encodeURIComponent(t.title),
                title: t.title,
                summary: t.summary,
                checklist: t.checklist
                  ? {
                      done: t.checklist.filter((c: { completed?: boolean }) => c.completed).length,
                      total: t.checklist.length,
                    }
                  : undefined,
              }))
          );
        }
      }
    setLoading(false);
  }, [session, status, filter]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    const handler = () => loadTopics();
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, [loadTopics]);

  async function togglePin(t: TopicCard) {
    if (!session?.user) return;
    const pinnedCount = topics.filter((x) => x.is_pinned).length;
    if (!t.is_pinned && pinnedCount >= 3) return;
    try {
      await fetch(`/api/topics/${t.topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: !t.is_pinned }),
      });
      setTopics((prev) =>
        prev.map((x) =>
          x.topicId === t.topicId ? { ...x, is_pinned: !x.is_pinned } : x
        )
      );
    } catch {}
  }

  async function toggleArchive(t: TopicCard) {
    if (!session?.user) return;
    try {
      await fetch(`/api/topics/${t.topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: !t.is_archived }),
      });
      setTopics((prev) => prev.filter((x) => x.topicId !== t.topicId));
    } catch {}
  }

  async function deleteTopic(t: TopicCard) {
    if (!confirm(`Delete "${t.title}" and all its data permanently?`)) return;
    setDeleting(t.topicId);
    try {
      const res = await fetch(`/api/topics/${t.topicId}`, { method: "DELETE" });
      if (res.ok) {
        setTopics((prev) => prev.filter((x) => x.topicId !== t.topicId));
      }
    } finally {
      setDeleting(null);
    }
  }

  function daysSince(d: string | undefined): string {
    if (!d) return "—";
    const diff = Math.floor(
      (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === 0) return "Today";
    if (diff === 1) return "1 day ago";
    return `${diff} days ago`;
  }

  const filters: { value: typeof filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "In Progress" },
    { value: "review_due", label: "Review Due" },
    { value: "archived", label: "Archived" },
  ];

  const inRepairWindow = isInRepairWindow();
  const repairDaysLeft = getRepairWindowDaysLeft();

  return (
    <div className="animate-fade-in">
      {inRepairWindow && repairDaysLeft > 0 && (
        <div className="mb-6 rounded-card border-2 border-terracotta/40 bg-terracotta/10 p-6">
          <h3 className="font-semibold text-terracotta">Streak Repair Available</h3>
          <p className="mt-2 text-sm text-deep-charcoal/90">
            You have <strong>{repairDaysLeft} day{repairDaysLeft !== 1 ? "s" : ""}</strong> left to restore your streak!
            Pass a comprehensive quiz across all your topics to get it back.
          </p>
          <p className="mt-2 text-sm font-medium text-terracotta">
            ⏱ Countdown: {repairDaysLeft === 1 ? "Last day!" : `${repairDaysLeft} days remaining`}
          </p>
          <Link
            href="/dashboard/streak-repair"
            className="mt-4 inline-block rounded-button bg-terracotta px-6 py-2.5 text-sm font-medium text-white hover:brightness-95"
          >
            Take Streak Repair Quiz
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <h1 className="text-2xl font-bold text-deep-charcoal">Topic Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/upload"
            className="rounded-button bg-dusty-blue px-5 py-2.5 text-sm font-medium text-white hover:brightness-95 transition"
          >
            + New topic
          </Link>
          <Link
            href="/dashboard/progress"
            className="rounded-button border border-warm-sand px-5 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/30 transition"
          >
            Progress Overview
          </Link>
        </div>
      </div>

      {session?.user && (
        <div className="mb-6 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filter === f.value
                  ? "bg-dusty-blue text-white"
                  : "bg-warm-sand/50 text-deep-charcoal/80 hover:bg-warm-sand"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-deep-charcoal/60">Loading...</p>
      ) : topics.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-dusty-blue/30 bg-cream p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dusty-blue/10">
            <FileText size={32} className="text-dusty-blue/30" />
          </div>
          <h2 className="text-xl font-medium text-deep-charcoal">No topics yet</h2>
          <p className="mt-2 text-deep-charcoal/60">
            Upload your first materials to get started
          </p>
          <Link
            href="/dashboard/upload"
            className="mt-6 inline-block rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 transition"
          >
            Upload content
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <div
              key={t.topicId}
              className="relative rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle hover-lift transition"
            >
              <div className="absolute top-4 right-4 flex gap-1">
                {session?.user && (
                  <>
                    <button
                      type="button"
                      onClick={() => togglePin(t)}
                      className={`rounded p-1.5 transition ${
                        t.is_pinned
                          ? "text-dusty-blue"
                          : "text-deep-charcoal/40 hover:text-deep-charcoal"
                      } ${!t.is_pinned && pinLimit >= 3 ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={t.is_pinned ? "Unpin" : "Pin (max 3)"}
                    >
                      <Pin size={16} fill={t.is_pinned ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleArchive(t)}
                      className="rounded p-1.5 text-deep-charcoal/40 hover:text-deep-charcoal transition"
                      title={t.is_archived ? "Unarchive" : "Archive"}
                    >
                      <Archive size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTopic(t)}
                      disabled={deleting === t.topicId}
                      className="rounded p-1.5 text-terracotta/70 hover:text-terracotta transition disabled:opacity-50"
                      title="Delete permanently"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
              <Link
                href={`/dashboard/topic/${encodeURIComponent(t.topicId)}`}
                className="block pr-20 sm:pr-24"
              >
                <h2 className="font-semibold text-deep-charcoal pr-2">{t.title}</h2>
                {t.summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-deep-charcoal/80 leading-body">
                    {t.summary}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-deep-charcoal/60">
                  {t.checklist && (
                    <span className="flex items-center gap-1">
                      <BookOpen size={14} />
                      {t.checklist.done}/{t.checklist.total} checklist
                    </span>
                  )}
                  {t.understanding_score != null && (
                    <span className="font-medium text-sage">
                      Score: {t.understanding_score}%
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {daysSince(t.last_accessed_at)}
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium text-dusty-blue">
                  {STEP_LABELS[t.current_step ?? "upload"] ?? t.current_step}
                </p>
              </Link>
              <Link
                href={`/dashboard/topic/${encodeURIComponent(t.topicId)}`}
                className="mt-4 inline-flex items-center gap-1 rounded-button bg-dusty-blue px-4 py-2 text-sm font-medium text-white hover:brightness-95 transition"
              >
                {t.status === "review_due" ? "Review Due" : "Continue"}
                <ChevronRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
