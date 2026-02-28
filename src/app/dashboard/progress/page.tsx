"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type TopicSummary = {
  id: string;
  title: string;
  subject: string;
  status: string;
  currentScore?: number;
  attemptCount: number;
  conceptsMastered: number;
  conceptsTotal: number;
  studyTimeSeconds: number;
  lastAccessed?: string;
  scoreHistory: { score: number; attempted_at: string }[];
};

type Misconception = {
  id: string;
  topic_id: string;
  concept_title?: string;
  misconception_text: string;
  is_resolved: boolean;
  created_at: string;
};

export default function ProgressOverviewPage() {
  const { data: session, status } = useSession();
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [totalInProgress, setTotalInProgress] = useState(0);
  const [totalMastered, setTotalMastered] = useState(0);
  const [averageScore, setAverageScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<string[]>([]);
  const [misconceptions, setMisconceptions] = useState<Misconception[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartTopicFilter, setChartTopicFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"7" | "30" | "90">("30");

  const loadProgress = useCallback(() => {
    if (status !== "authenticated" || !session?.user) {
      setLoading(false);
      return;
    }
    fetch("/api/progress/overview")
      .then((res) => res.json())
      .then((data) => {
        setTopics(data.topics ?? []);
        setTotalInProgress(data.totalInProgress ?? 0);
        setTotalMastered(data.totalMastered ?? 0);
        setAverageScore(data.averageScore ?? 0);
        setStreak(data.streak ?? 0);
        setBadges(data.badges ?? []);
        setMisconceptions(data.misconceptions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session, status]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    const handler = () => loadProgress();
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, [loadProgress]);

  const formatTime = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  };

  const chartData: { attempt: string; [key: string]: string | number }[] = [];
  const filteredTopics =
    chartTopicFilter === "all"
      ? topics
      : topics.filter((t) => t.id === chartTopicFilter);
  filteredTopics.forEach((t) => {
    t.scoreHistory.forEach((h, i) => {
      const label = new Date(h.attempted_at).toLocaleDateString();
      const existing = chartData.find((d) => d.attempt === label);
      if (existing) {
        existing[t.title] = h.score;
      } else {
        const entry: { attempt: string; [key: string]: string | number } = { attempt: label };
        entry[t.title] = h.score;
        chartData.push(entry);
      }
    });
  });
  chartData.sort(
    (a, b) =>
      new Date(a.attempt).getTime() - new Date(b.attempt).getTime()
  );

  const lines = filteredTopics
    .filter((t) => t.scoreHistory.length > 0)
    .map((t) => ({ dataKey: t.title, color: "#5B7C99" }));

  if (!session?.user) {
    return (
      <div className="animate-fade-in">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Dashboard
        </Link>
        <p className="mt-8 text-deep-charcoal/60">
          Sign in to view your progress overview.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-deep-charcoal">Progress Overview</h1>
      </div>

      {loading ? (
        <p className="text-deep-charcoal/60">Loading...</p>
      ) : (
        <div className="space-y-8">
          {/* Summary cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-card border border-warm-sand/80 bg-cream p-3 sm:p-4 shadow-subtle">
              <p className="text-sm text-deep-charcoal/60">In Progress</p>
              <p className="text-xl sm:text-2xl font-bold text-deep-charcoal">{totalInProgress}</p>
            </div>
            <div className="rounded-card border border-warm-sand/80 bg-cream p-3 sm:p-4 shadow-subtle">
              <p className="text-sm text-deep-charcoal/60">Mastered</p>
              <p className="text-xl sm:text-2xl font-bold text-sage">{totalMastered}</p>
            </div>
            <div className="rounded-card border border-warm-sand/80 bg-cream p-3 sm:p-4 shadow-subtle">
              <p className="text-sm text-deep-charcoal/60">Average Score</p>
              <p className="text-xl sm:text-2xl font-bold text-dusty-blue">{averageScore}%</p>
            </div>
            <div className="rounded-card border border-warm-sand/80 bg-cream p-3 sm:p-4 shadow-subtle">
              <p className="text-sm text-deep-charcoal/60">Study Streak</p>
              <p className="text-xl sm:text-2xl font-bold text-terracotta">{streak} days</p>
            </div>
            <div className="rounded-card border border-warm-sand/80 bg-cream p-3 sm:p-4 shadow-subtle">
              <p className="text-sm text-deep-charcoal/60">Concepts Mastered</p>
              <p className="text-xl sm:text-2xl font-bold text-deep-charcoal">
                {topics.reduce((a, t) => a + t.conceptsMastered, 0)}
              </p>
            </div>
          </div>

          {/* Score history chart */}
          {topics.some((t) => t.scoreHistory.length > 0) && (
            <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
              <h2 className="font-semibold text-deep-charcoal mb-4">Score History</h2>
              <div className="mb-4 flex gap-2">
                <select
                  value={chartTopicFilter}
                  onChange={(e) => setChartTopicFilter(e.target.value)}
                  className="rounded-input border border-warm-sand/80 px-3 py-2 text-sm"
                >
                  <option value="all">All topics</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                    <XAxis dataKey="attempt" stroke="#5a564d" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="#5a564d" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    {lines.map((l) => (
                      <Line
                        key={l.dataKey}
                        type="monotone"
                        dataKey={l.dataKey}
                        stroke={l.color}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-topic table */}
          <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle overflow-x-auto">
            <h2 className="font-semibold text-deep-charcoal mb-4">Per Topic Summary</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-sand/80">
                  <th className="text-left py-2 text-deep-charcoal/80">Topic</th>
                  <th className="text-left py-2 text-deep-charcoal/80">Score</th>
                  <th className="text-left py-2 text-deep-charcoal/80">Attempts</th>
                  <th className="text-left py-2 text-deep-charcoal/80">Concepts</th>
                  <th className="text-left py-2 text-deep-charcoal/80">Time</th>
                  <th className="text-left py-2 text-deep-charcoal/80">Status</th>
                  <th className="text-left py-2 text-deep-charcoal/80"></th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.id} className="border-b border-warm-sand/50">
                    <td className="py-3 font-medium text-deep-charcoal">{t.title}</td>
                    <td className="py-3">
                      {t.currentScore != null ? `${t.currentScore}%` : "—"}
                    </td>
                    <td className="py-3">{t.attemptCount}</td>
                    <td className="py-3">
                      {t.conceptsMastered}/{t.conceptsTotal}
                    </td>
                    <td className="py-3">{formatTime(t.studyTimeSeconds)}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === "mastered"
                            ? "bg-sage/20 text-sage"
                            : t.status === "review_due"
                            ? "bg-dusty-blue/20 text-dusty-blue"
                            : t.status === "at_risk"
                            ? "bg-terracotta/20 text-terracotta"
                            : "bg-warm-sand/50 text-deep-charcoal/80"
                        }`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/dashboard/topic/${t.id}`}
                        className="text-dusty-blue hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Misconceptions log */}
          {misconceptions.length > 0 && (
            <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
              <h2 className="font-semibold text-deep-charcoal mb-4">Misconceptions Log</h2>
              <ul className="space-y-3">
                {misconceptions.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-button border p-4 ${
                      m.is_resolved
                        ? "border-sage/30 bg-sage/5"
                        : "border-terracotta/20 bg-terracotta/5"
                    }`}
                  >
                    <p className="text-sm text-deep-charcoal">{m.misconception_text}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-deep-charcoal/60">
                      {m.concept_title && (
                        <span>Concept: {m.concept_title}</span>
                      )}
                      <span>{new Date(m.created_at).toLocaleDateString()}</span>
                      <span
                        className={
                          m.is_resolved ? "text-sage font-medium" : "text-terracotta"
                        }
                      >
                        {m.is_resolved ? "Resolved" : "Still shaky"}
                      </span>
                      <Link
                        href={`/dashboard/topic/${m.topic_id}`}
                        className="text-dusty-blue hover:underline"
                      >
                        Go to topic →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
