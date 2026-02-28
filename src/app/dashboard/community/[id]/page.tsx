"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { getStreak, getStreakMilestoneLabel, getCommunityDrafts, setCommunityDraft, blockUser, getBlockedUsers } from "@/lib/storage";
import { ImagePlus, X } from "lucide-react";

const USERNAME_KEY = "adaptive-learning-community-username";

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "📚", "💡", "🔥"];

function MessageContent({ content, className = "" }: { content: string; className?: string }) {
  const imgStart = content.indexOf("[img:");
  if (imgStart !== -1) {
    const srcStart = imgStart + 5;
    const srcEnd = content.indexOf("]", srcStart);
    if (srcEnd !== -1) {
      const imgSrc = content.slice(srcStart, srcEnd);
      const text = (content.slice(0, imgStart) + content.slice(srcEnd + 1)).trim();
      if (imgSrc.startsWith("data:image/")) {
        return (
          <div className={className}>
            {text ? <p className="text-deep-charcoal whitespace-pre-wrap">{text}</p> : null}
            <img src={imgSrc} alt="Uploaded" className="mt-2 max-w-full rounded-button max-h-64 object-contain" />
          </div>
        );
      }
    }
  }
  return <p className={`text-deep-charcoal whitespace-pre-wrap ${className}`}>{content}</p>;
}

type Message = {
  id: string;
  userId?: string;
  username: string;
  milestoneLabel: string;
  content: string;
  timestamp: string;
  parentId?: string;
  reactions?: Record<string, string[]>; // emoji -> usernames
};

type Board = {
  id: string;
  title: string;
  subject: string;
  creatorUsername: string;
  createdAt: string;
  messages: Message[];
};

const MAX_COMMUNITY_IMAGE_MB = 5;
const MAX_COMMUNITY_IMAGE_BYTES = MAX_COMMUNITY_IMAGE_MB * 1024 * 1024;

export default function BoardPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const [board, setBoard] = useState<Board | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [attachImage, setAttachImage] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const boardId = typeof params.id === "string" ? params.id : (params as { id: string }).id;
  const draftKey = `board-${boardId}`;
  const savedDraft = getCommunityDrafts()[draftKey] ?? "";
  const userImage = (session?.user as { image?: string })?.image ?? null;
  const userLabel = getStreakMilestoneLabel(getStreak().streak);
  const currentUserId = (session?.user as { id?: string })?.id;
  const displayName = typeof window !== "undefined"
    ? (localStorage.getItem(USERNAME_KEY) ?? (session?.user as { name?: string })?.name ?? (session?.user as { email?: string })?.email?.split("@")[0] ?? "Anonymous")
    : "Anonymous";

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/boards/${boardId}`);
      if (res.ok) {
        const data = await res.json();
        setBoard(data);
      } else {
        setBoard(null);
      }
    } catch {
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    fetchBoard();
  }, [fetchBoard]);

  // Load draft only once per board (never overwrite while user is typing)
  const loadedDraftFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadedDraftFor.current !== boardId) {
      loadedDraftFor.current = boardId;
      const draft = getCommunityDrafts()[`board-${boardId}`] ?? "";
      setNewMessage(draft);
    }
  }, [boardId]);

  // Save draft when message changes (for recovery)
  useEffect(() => {
    if (newMessage && boardId) setCommunityDraft(draftKey, newMessage);
    else if (!newMessage && boardId) setCommunityDraft(draftKey, "");
  }, [newMessage, boardId, draftKey]);

  async function sendMessage() {
    if (!board || !session) return;
    const text = newMessage.trim();
    if (!text && !attachImage) return;
    const streak = getStreak();
    const label = getStreakMilestoneLabel(streak.streak);
    setSending(true);
    try {
      let res: Response;
      if (attachImage) {
        const formData = new FormData();
        formData.append("content", text || "(Image)");
        formData.append("username", displayName);
        formData.append("milestoneLabel", label);
        if (replyTo) formData.append("parentId", replyTo);
        formData.append("file", attachImage);
        res = await fetch(`/api/community/boards/${boardId}/messages`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`/api/community/boards/${boardId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            parentId: replyTo ?? undefined,
            username: displayName,
            milestoneLabel: label,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const msg: Message = {
        id: data.id,
        userId: currentUserId,
        username: data.username,
        milestoneLabel: data.milestoneLabel ?? "",
        content: data.content,
        timestamp: data.timestamp,
        parentId: data.parentId,
        reactions: data.reactions ?? {},
      };
      setBoard((prev) => prev ? { ...prev, messages: [...(prev.messages ?? []), msg] } : null);
      setNewMessage("");
      setAttachImage(null);
      setReplyTo(null);
      setCommunityDraft(draftKey, "");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      alert("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_COMMUNITY_IMAGE_BYTES) {
      alert(`Image must be under ${MAX_COMMUNITY_IMAGE_MB}MB.`);
      return;
    }
    setAttachImage(file);
  }

  async function addReaction(msgId: string, emoji: string) {
    if (!board || !session) return;
    try {
      const res = await fetch(`/api/community/messages/${msgId}/reaction`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji, username: displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setBoard((prev) => {
        if (!prev) return prev;
        const msgs = (prev.messages ?? []).map((m) =>
          m.id === msgId ? { ...m, reactions: data.reactions ?? m.reactions } : m
        );
        return { ...prev, messages: msgs };
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteMessage(msgId: string) {
    if (!board) return;
    try {
      const res = await fetch(`/api/community/messages/${msgId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      const msg = (board.messages ?? []).find((m) => m.id === msgId);
      const idsToRemove = msg ? [msgId, ...(board.messages ?? []).filter((m) => m.parentId === msgId).map((m) => m.id)] : [msgId];
      setBoard((prev) => {
        if (!prev) return prev;
        const msgs = (prev.messages ?? []).filter((m) => !idsToRemove.includes(m.id));
        return { ...prev, messages: msgs };
      });
    } catch (err) {
      console.error(err);
    }
  }

  function handleBlockUser(username: string) {
    blockUser(username);
  }

  const blocked = getBlockedUsers();
  const rootMessages = (board?.messages ?? []).filter((m) => !m.parentId && !blocked.has(m.username));
  const getReplies = (id: string) =>
    (board?.messages ?? []).filter((m) => m.parentId === id && !blocked.has(m.username));

  if (loading) return <p className="text-deep-charcoal/60">Loading...</p>;
  if (!board) {
    return (
      <div>
        <Link href="/dashboard/community" className="text-dusty-blue hover:underline">← Community</Link>
        <p className="mt-8 text-deep-charcoal/60">Board not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link href="/dashboard/community" className="text-dusty-blue hover:underline">← Community</Link>
      <h1 className="mt-6 text-2xl font-bold text-deep-charcoal">{board.title}</h1>
      <p className="mt-1 text-sm text-deep-charcoal/70">
        {board.subject || "General"} · by {board.creatorUsername}
      </p>

      <div className="mt-8 space-y-4">
        {rootMessages.length === 0 ? (
          <p className="text-deep-charcoal/60">No messages yet. Be the first to reply!</p>
        ) : (
          rootMessages.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              replies={getReplies(m.id)}
              currentUsername={displayName}
              currentUserId={currentUserId}
              currentUserImage={userImage}
              onReply={() => setReplyTo(m.id)}
              onReaction={(emoji) => addReaction(m.id, emoji)}
              onDelete={() => deleteMessage(m.id)}
              onBlock={() => handleBlockUser(m.username)}
            />
          ))
        )}
      </div>

      <div className="mt-8 rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <div className="flex items-center gap-3 mb-4">
          {userImage ? (
            <Image
              src={userImage}
              alt=""
              width={40}
              height={40}
              className="rounded-full object-cover border border-warm-sand/50"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-dusty-blue/20 flex items-center justify-center text-dusty-blue font-semibold">
              {(displayName !== "Anonymous" ? displayName : "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <span className="font-medium text-deep-charcoal">{displayName}</span>
            {userLabel && (
              <span className="ml-2 text-xs font-medium text-terracotta">{userLabel}</span>
            )}
          </div>
        </div>
        <h3 className="font-semibold text-deep-charcoal">
          {replyTo ? "Reply to message" : "Reply"}
        </h3>
        {replyTo && (
          <button
            onClick={() => setReplyTo(null)}
            className="mt-1 text-sm text-dusty-blue hover:underline"
          >
            Cancel reply
          </button>
        )}
        <textarea
          id="community-message-input"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={session ? "Write your message here — full sentences and paragraphs supported. You can also attach PNG/JPG images." : "Sign in to reply"}
          rows={6}
          disabled={!session}
          maxLength={15000}
          className="mt-2 w-full rounded-input border border-warm-sand/80 px-4 py-3 min-h-[120px] disabled:opacity-60 resize-y text-base"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!session}
            className="flex items-center gap-2 rounded-button border border-warm-sand/80 px-4 py-2 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/30 disabled:opacity-50 transition"
          >
            <ImagePlus size={18} />
            Attach image (PNG/JPG, max 5MB)
          </button>
          {attachImage && (
            <span className="flex items-center gap-2 text-sm text-deep-charcoal/80">
              {attachImage.name}
              <button
                type="button"
                onClick={() => setAttachImage(null)}
                className="rounded p-1 hover:bg-warm-sand/50 text-terracotta"
                aria-label="Remove"
              >
                <X size={14} />
              </button>
            </span>
          )}
          <button
            onClick={sendMessage}
            disabled={(!newMessage.trim() && !attachImage) || !session || sending}
            className="ml-auto rounded-button bg-dusty-blue px-6 py-2 text-white disabled:opacity-50 hover:brightness-95 transition"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageCard({
  message,
  replies,
  currentUsername,
  currentUserId,
  currentUserImage,
  onReply,
  onReaction,
  onDelete,
  onBlock,
}: {
  message: Message;
  replies: Message[];
  currentUsername: string;
  currentUserId?: string;
  currentUserImage?: string | null;
  onReply: () => void;
  onReaction: (emoji: string) => void;
  onDelete: () => void;
  onBlock: () => void;
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isOwn = currentUserId ? message.userId === currentUserId : message.username === currentUsername;
  const avatarImg = isOwn && currentUserImage ? currentUserImage : null;

  return (
    <div className="rounded-card border border-warm-sand/80 bg-cream p-4 shadow-subtle">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-deep-charcoal/80 flex-wrap">
          {avatarImg ? (
            <Image
              src={avatarImg}
              alt=""
              width={28}
              height={28}
              className="rounded-full object-cover border border-warm-sand/50"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-dusty-blue/20 flex items-center justify-center text-dusty-blue text-xs font-semibold shrink-0">
              {(message.username || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-deep-charcoal">{message.username}</span>
          {message.milestoneLabel && (
            <span className="text-terracotta text-xs font-medium">{message.milestoneLabel}</span>
          )}
          <span>{new Date(message.timestamp).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          {!isOwn && (
            <button
              onClick={onBlock}
              className="text-xs text-deep-charcoal/50 hover:text-terracotta"
            >
              Block
            </button>
          )}
          {isOwn && (
            <button
              onClick={onDelete}
              className="text-xs text-terracotta hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <MessageContent content={message.content} />

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {Object.entries(message.reactions ?? {}).map(([emoji, users]) =>
          users.length > 0 ? (
            <button
              key={emoji}
              onClick={() => onReaction(emoji)}
              className="inline-flex items-center gap-1 rounded-full border border-warm-sand/80 px-2 py-0.5 text-sm hover:bg-warm-sand/30"
            >
              {emoji} {users.length}
            </button>
          ) : null
        )}
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-sm text-deep-charcoal/60 hover:text-deep-charcoal"
          >
            Add reaction
          </button>
          {showEmojiPicker && (
            <div className="absolute left-0 top-full mt-1 flex gap-1 rounded-button border border-warm-sand/80 bg-cream p-2 shadow-subtle z-10">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReaction(e);
                    setShowEmojiPicker(false);
                  }}
                  className="text-lg hover:scale-125 transition"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onReply}
          className="text-sm text-dusty-blue hover:underline"
        >
          Reply
        </button>
      </div>

      {replies.length > 0 && (
        <div className="mt-4 ml-4 pl-4 border-l-2 border-warm-sand/50 space-y-3">
          {replies.map((r) => (
            <div key={r.id} className="rounded-button border border-warm-sand/50 bg-warm-sand/10 p-3">
              <div className="flex items-center gap-2 text-sm text-deep-charcoal/80">
                <div className="h-6 w-6 rounded-full bg-dusty-blue/20 flex items-center justify-center text-dusty-blue text-xs font-semibold shrink-0">
                  {(r.username || "?").charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-deep-charcoal">{r.username}</span>
                {r.milestoneLabel && <span className="text-terracotta text-xs">{r.milestoneLabel}</span>}
                <span>{new Date(r.timestamp).toLocaleString()}</span>
              </div>
              <MessageContent content={r.content} className="mt-1 text-sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
