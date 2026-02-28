"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getStreak, getStreakMilestoneLabel } from "@/lib/storage";
import { getBadgeLabel } from "@/lib/badges";
import Image from "next/image";

export default function ProfilePage() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      if (!session?.user) return;
      try {
        await fetch("/api/user/ensure-profile");
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          setDisplayName(data.displayName ?? (session?.user?.name ?? "Student"));
          setBio(data.bio ?? "");
          setAvatarUrl(data.avatarUrl ?? (session?.user as { image?: string })?.image ?? null);
          setStreak(data.streak ?? 0);
          setBadges(data.badges ?? []);
        } else {
          const fallback = (session?.user as { email?: string })?.email?.split("@")[0] ?? "Student";
          setDisplayName(session?.user?.name ?? fallback);
          setAvatarUrl((session?.user as { image?: string })?.image ?? null);
          setStreak(getStreak().streak);
          setBadges([]);
        }
      } catch {
        setDisplayName((session?.user as { email?: string })?.email?.split("@")[0] ?? "Student");
        setAvatarUrl((session?.user as { image?: string })?.image ?? null);
        setStreak(getStreak().streak);
        setBadges([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, bio, avatarUrl }),
      });
      if (res.ok) setSaved(true);
    } catch {}
    setSaving(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
      return;
    }
    const valid = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!valid.includes(file.type)) {
      alert("Use JPEG, PNG, WebP, or GIF");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setAvatarUrl(data.url);
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarUrl: data.url }),
        });
      } else {
        alert(data.error ?? "Upload failed");
      }
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const label = getStreakMilestoneLabel(streak);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
        <p className="mt-8 text-deep-charcoal/60">Loading...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-dusty-blue hover:underline">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-bold text-deep-charcoal">Profile</h1>

      <div className="mt-8 rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0 group">
              <label className="block cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                  className="hidden"
                />
                {avatarUrl ? (
                  <div className="relative">
                    <Image
                      src={avatarUrl}
                      alt="Profile"
                      width={96}
                      height={96}
                      className="rounded-full object-cover border-2 border-warm-sand/80 group-hover:opacity-90 transition"
                    />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-deep-charcoal/40 opacity-0 group-hover:opacity-100 transition text-white text-xs font-medium">
                      {uploading ? "Uploading…" : "Change"}
                    </span>
                  </div>
                ) : (
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-dusty-blue/20 text-dusty-blue group-hover:bg-dusty-blue/30 transition cursor-pointer">
                    <span className="text-2xl font-bold">{displayName ? displayName.charAt(0).toUpperCase() : "?"}</span>
                    <span className="text-[10px] mt-0.5">{uploading ? "…" : "Upload"}</span>
                  </div>
                )}
              </label>
              {label && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-terracotta/90 px-2 py-0.5 text-xs font-medium text-white">
                  {label}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal/80 mb-1">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-input border border-warm-sand/80 px-4 py-2 text-deep-charcoal"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-charcoal/80 mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full rounded-input border border-warm-sand/80 px-4 py-3 text-deep-charcoal"
                placeholder="Tell others a bit about yourself..."
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {saved && (
                <span className="text-sm text-sage font-medium">Saved</span>
              )}
            </div>
            {badges.length > 0 && (
              <div className="mt-6 pt-6 border-t border-warm-sand/80">
                <p className="text-sm font-medium text-deep-charcoal/80 mb-2">Badges</p>
                <div className="flex flex-wrap gap-2">
                  {badges.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center rounded-full bg-sage/20 text-sage px-3 py-1 text-xs font-medium"
                    >
                      {getBadgeLabel(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
