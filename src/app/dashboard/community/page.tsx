"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { markCommunityVisited } from "@/lib/storage";
import { MessageSquare, Plus, Search } from "lucide-react";

const USERNAME_KEY = "adaptive-learning-community-username";

type Board = {
  id: string;
  title: string;
  subject: string;
  creatorUsername: string;
  creatorUserId?: string | null;
  createdAt: string;
  lastActivity?: string;
  messageCount: number;
  messages?: unknown[];
};

function getLastActivity(b: Board): string {
  return b.lastActivity ?? b.createdAt;
}

function getMyTopicTitles(): string[] {
  try {
    const raw = localStorage.getItem("adaptive-learning-topics");
    if (!raw) return [];
    const topics = JSON.parse(raw);
    return (topics ?? []).map((t: { title?: string }) => (t.title ?? "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

function boardMatchesTopics(b: Board, topicTitles: string[]): boolean {
  const title = (b.title + " " + (b.subject ?? "")).toLowerCase();
  return topicTitles.some((t) => t && title.includes(t));
}

export default function CommunityPage() {
  const { data: session } = useSession();
  const [boards, setBoards] = useState<Board[]>([]);
  const defaultName = (session?.user as { name?: string })?.name ?? (session?.user as { email?: string })?.email?.split("@")[0] ?? "";
  const [username, setUsername] = useState("");
  const [showSetUsername, setShowSetUsername] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "popular" | "matching">("recent");

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/community/boards");
      const data = await res.json();
      if (res.ok && data.boards) {
        setBoards(data.boards);
      }
    } catch {
      setBoards([]);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
    const u = localStorage.getItem(USERNAME_KEY);
    if (u) {
      setUsername(u);
    } else if (defaultName) {
      setUsername(defaultName);
      localStorage.setItem(USERNAME_KEY, defaultName);
    } else {
      setShowSetUsername(true);
    }
  }, [defaultName, fetchBoards]);

  function saveUsername() {
    if (!username.trim()) return;
    localStorage.setItem(USERNAME_KEY, username.trim());
    setShowSetUsername(false);
  }

  async function createBoard() {
    if (!session) {
      setShowSetUsername(true);
      return;
    }
    const u = localStorage.getItem(USERNAME_KEY) ?? (session.user as { name?: string })?.name ?? (session.user as { email?: string })?.email?.split("@")[0] ?? "Student";
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/community/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), subject: newSubject.trim(), username: u }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const board: Board = {
        id: data.id,
        title: data.title,
        subject: data.subject ?? "",
        creatorUsername: data.creatorUsername,
        createdAt: data.createdAt,
        messageCount: 0,
      };
      setBoards((prev) => [board, ...prev]);
      setCreating(false);
      setNewTitle("");
      setNewSubject("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  const myTopics = useMemo(() => getMyTopicTitles(), [boards]);

  const filteredAndSorted = useMemo(() => {
    let list = boards;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.subject ?? "").toLowerCase().includes(q) ||
          b.creatorUsername.toLowerCase().includes(q)
      );
    }
    if (sortBy === "recent") {
      list = [...list].sort(
        (a, b) => new Date(getLastActivity(b)).getTime() - new Date(getLastActivity(a)).getTime()
      );
    } else if (sortBy === "popular") {
      list = [...list].sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0));
    } else {
      list = [...list].sort((a, b) => {
        const aMatch = boardMatchesTopics(a, myTopics);
        const bMatch = boardMatchesTopics(b, myTopics);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return new Date(getLastActivity(b)).getTime() - new Date(getLastActivity(a)).getTime();
      });
    }
    return list;
  }, [boards, search, sortBy, myTopics]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-bold text-deep-charcoal">Community</h1>

      {showSetUsername && (
        <div className="mt-6 rounded-card border border-dusty-blue/30 bg-dusty-blue/5 p-6">
          {session ? (
            <>
              <h2 className="font-semibold text-deep-charcoal">Choose a username</h2>
              <p className="mt-1 text-sm text-deep-charcoal/80">Shown on your messages. No real name or email.</p>
              <div className="mt-4 flex gap-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="rounded-input border border-warm-sand/80 px-4 py-2 flex-1"
                />
                <button onClick={saveUsername} className="rounded-button bg-dusty-blue px-4 py-2 text-white">
                  Save
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-deep-charcoal">Sign in to create a board</h2>
              <p className="mt-1 text-sm text-deep-charcoal/80">You need to sign in to start a new discussion board.</p>
              <Link href="/api/auth/signin" className="mt-4 inline-block rounded-button bg-dusty-blue px-4 py-2 text-white">
                Sign in
              </Link>
            </>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-button bg-dusty-blue px-5 py-2.5 text-white font-medium hover:brightness-95 transition"
        >
          <Plus size={18} />
          Start New Discussion Board
        </button>
        {creating && (
          <div className="rounded-card border border-warm-sand/80 bg-cream p-6 w-full max-w-md">
            <h3 className="font-semibold text-deep-charcoal">New discussion board</h3>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Board title"
              className="mt-2 w-full rounded-input border border-warm-sand/80 px-4 py-2 text-deep-charcoal"
            />
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Description"
              className="mt-2 w-full rounded-input border border-warm-sand/80 px-4 py-2 text-deep-charcoal"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={createBoard}
                disabled={submitting}
                className="rounded-button bg-dusty-blue px-4 py-2 text-white disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create"}
              </button>
              <button onClick={() => setCreating(false)} className="rounded-button border border-warm-sand px-4 py-2 text-deep-charcoal">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-deep-charcoal/40" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search boards by topic, subject, or creator..."
            className="w-full rounded-input border border-warm-sand/80 pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "recent" | "popular" | "matching")}
          className="rounded-input border border-warm-sand/80 px-4 py-2 text-sm shrink-0"
        >
          <option value="recent">Most Recent Activity</option>
          <option value="popular">Most Popular</option>
          <option value="matching">Matching Your Topics</option>
        </select>
      </div>

      <div className="mt-6 space-y-4">
        {filteredAndSorted.length === 0 ? (
          <p className="text-deep-charcoal/60">
            {search ? "No boards match your search." : "No discussion boards yet."}
          </p>
        ) : (
          filteredAndSorted.map((b) => {
            const matchesTopics = boardMatchesTopics(b, myTopics);
            return (
              <Link
                key={b.id}
                href={`/dashboard/community/${b.id}`}
                onClick={() => markCommunityVisited(b.id)}
                className={`block rounded-card border p-6 shadow-subtle transition ${
                  matchesTopics
                    ? "border-dusty-blue/50 bg-dusty-blue/5 hover:border-dusty-blue"
                    : "border-warm-sand/80 bg-cream hover:border-dusty-blue/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-deep-charcoal">{b.title}</h3>
                  {matchesTopics && (
                    <span className="shrink-0 rounded-full bg-dusty-blue/20 px-2 py-0.5 text-xs font-medium text-dusty-blue">
                      Matches your topics
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm text-deep-charcoal/70">
                  <span>{b.subject || "General"}</span>
                  <span>
                    by{" "}
                    {b.creatorUserId ? (
                      <Link href={`/dashboard/profile/${b.creatorUserId}`} className="text-dusty-blue hover:underline">
                        {b.creatorUsername}
                      </Link>
                    ) : (
                      b.creatorUsername
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={14} />
                    {b.messageCount ?? 0}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
