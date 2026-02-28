"use client";

import { useEffect, useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BookOpen, Upload, TrendingUp, LogOut, Flame, MessageSquare, User, X, Snowflake } from "lucide-react";
import { getStreakMilestoneLabel, getStreak, getFreezeCost } from "@/lib/storage";
import { useStreakRefresh } from "@/hooks/useProgressRefresh";
import { getBadgesForStreak, STREAK_BADGES, getBadgeLabel } from "@/lib/badges";

const SIDEBAR_WIDTH = 72;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [streakCount] = useStreakRefresh();
  const [streakPopoverOpen, setStreakPopoverOpen] = useState(false);
  const streakPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      fetch("/api/user/ensure-profile").catch(() => {});
    }
  }, [status, session]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-deep-charcoal/60">Loading...</p>
      </div>
    );
  }

  if (!session) {
    const callbackUrl = encodeURIComponent(pathname || "/dashboard");
    router.replace(`/auth/signin?callbackUrl=${callbackUrl}`);
    return null;
  }

  const navItems = [
    { href: "/dashboard", icon: BookOpen, label: "Dashboard" },
    { href: "/dashboard/upload", icon: Upload, label: "Upload" },
    { href: "/dashboard/progress", icon: TrendingUp, label: "Progress" },
    { href: "/dashboard/community", icon: MessageSquare, label: "Community" },
  ];

  return (
    <div className="min-h-screen flex bg-cream">
      {/* Left sidebar – desktop only (Be.run style) */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-50 hidden md:flex w-[72px] flex-col items-center border-r border-warm-sand/60 bg-cream shadow-sm"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="flex flex-col items-center flex-1 w-full pt-5 pb-3">
          <Link
            href="/dashboard"
            className="font-bold text-deep-charcoal text-sm mb-6 px-2 py-2 rounded-lg hover:bg-warm-sand/30 transition"
          >
            aceL
          </Link>
          <nav className="flex flex-col gap-1 w-full px-2">
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={`flex items-center justify-center w-12 h-12 rounded-full transition mx-auto ${
                    active
                      ? "bg-dusty-blue/20 text-dusty-blue ring-2 ring-dusty-blue/40"
                      : "text-deep-charcoal/60 hover:bg-warm-sand/50 hover:text-deep-charcoal"
                  }`}
                >
                  <Icon size={22} />
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setStreakPopoverOpen((v) => !v)}
              title={`${streakCount} day streak – tap to see details`}
              className="flex items-center justify-center w-12 h-12 rounded-full text-terracotta hover:bg-terracotta/10 transition mx-auto mt-1"
            >
              <Flame size={22} />
            </button>
          </nav>
        </div>
        <div className="flex flex-col items-center gap-2 w-full px-2 pb-4 pt-3 border-t border-warm-sand/50">
          <Link
            href="/dashboard/profile"
            className="flex items-center justify-center w-10 h-10 rounded-full overflow-hidden border-2 border-warm-sand/60 hover:border-dusty-blue/50 transition"
            title="Profile"
          >
            {(session.user as { image?: string })?.image ? (
              <img src={(session.user as { image?: string }).image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-warm-sand/50 flex items-center justify-center">
                <User size={18} className="text-deep-charcoal/70" />
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            title="Sign out"
            className="flex items-center justify-center w-10 h-10 rounded-full text-deep-charcoal/60 hover:bg-warm-sand/50 hover:text-deep-charcoal transition"
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {/* Main: header + content */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-[72px] pb-20 md:pb-0">
        {/* Top header – greeting + subtext (Be.run style) */}
        <header className="sticky top-0 z-40 shrink-0 border-b border-warm-sand/50 bg-cream/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-6 py-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-deep-charcoal">
                Hi, {(session.user as { name?: string })?.name ?? (session.user as { email?: string })?.email?.split("@")[0] ?? "there"}!
              </h1>
              <p className="text-sm text-deep-charcoal/70 mt-1">
                Let&apos;s take a look at your learning today.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-deep-charcoal/50">
                {getStreakMilestoneLabel(streakCount) && getStreakMilestoneLabel(streakCount)}
              </span>
            </div>
          </div>
        </header>

        {/* Main content – card-friendly area with ample spacing */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-warm-sand/60 bg-cream/95 backdrop-blur-sm py-2 safe-area-pb">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition ${pathname === "/dashboard" ? "text-dusty-blue" : "text-deep-charcoal/60"}`}
        >
          <BookOpen size={22} />
          <span className="text-xs">Dashboard</span>
        </Link>
        <Link
          href="/dashboard/upload"
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition ${pathname?.startsWith("/dashboard/upload") ? "text-dusty-blue" : "text-deep-charcoal/60"}`}
        >
          <Upload size={22} />
          <span className="text-xs">Upload</span>
        </Link>
        <button
          type="button"
          onClick={() => setStreakPopoverOpen((v) => !v)}
          className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-terracotta"
        >
          <Flame size={22} />
          <span className="text-xs">Streak</span>
        </button>
        <Link
          href="/dashboard/progress"
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition ${pathname?.startsWith("/dashboard/progress") ? "text-dusty-blue" : "text-deep-charcoal/60"}`}
        >
          <TrendingUp size={22} />
          <span className="text-xs">Progress</span>
        </Link>
        <Link
          href="/dashboard/community"
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition ${pathname?.startsWith("/dashboard/community") ? "text-dusty-blue" : "text-deep-charcoal/60"}`}
        >
          <MessageSquare size={22} />
          <span className="text-xs">Community</span>
        </Link>
      </nav>

      {/* Streak popover – centered, content fits */}
      {streakPopoverOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-deep-charcoal/20"
            aria-hidden
            onClick={() => setStreakPopoverOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div
              ref={streakPopoverRef}
              className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-warm-sand/60 bg-cream p-6 pb-6 shadow-lg pointer-events-auto"
            >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-deep-charcoal">Your streak</h3>
              <button
                type="button"
                onClick={() => setStreakPopoverOpen(false)}
                className="rounded-full p-1.5 text-deep-charcoal/60 hover:bg-warm-sand/50 hover:text-deep-charcoal transition"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            {(() => {
              const data = getStreak();
              const badges = getBadgesForStreak(data.streak);
              const milestoneLabel = getStreakMilestoneLabel(data.streak);
              const freezeCost = getFreezeCost();
              const canBuy = (data.points ?? 0) >= freezeCost && data.freezes < data.maxFreezes;
              return (
                <>
                  <p className="text-3xl font-bold text-terracotta">{data.streak} days</p>
                  {milestoneLabel && (
                    <p className="text-sm text-deep-charcoal/80 mt-1">{milestoneLabel}</p>
                  )}
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-deep-charcoal mb-2">Badges earned</p>
                    {badges.length === 0 ? (
                      <p className="text-sm text-deep-charcoal/60">No badges yet — keep your streak going to earn some!</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {STREAK_BADGES.filter((b) => data.streak >= b.days).map((b) => (
                          <li key={b.id} className="flex items-center gap-2 text-sm text-deep-charcoal">
                            <span className="text-sage">✓</span>
                            {getBadgeLabel(b.id)} <span className="text-terracotta/80">({b.days}d)</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-5 pt-4 border-t border-warm-sand/60">
                    <p className="text-sm text-deep-charcoal/80">
                      <Snowflake size={14} className="inline mr-1 text-dusty-blue" />
                      Streak freezes: {data.freezes} / {data.maxFreezes}
                    </p>
                    <p className="text-xs text-deep-charcoal/60 mt-1">Points: {data.points ?? 0} (freeze = {freezeCost})</p>
                    <Link
                      href="/dashboard/shop"
                      onClick={() => setStreakPopoverOpen(false)}
                      className={`mt-4 inline-block rounded-button px-4 py-2.5 text-sm font-medium transition ${canBuy ? "bg-dusty-blue text-white hover:brightness-95" : "bg-warm-sand/60 text-deep-charcoal/70"}`}
                    >
                      {canBuy ? "Purchase Streak Freeze" : "View shop"}
                    </Link>
                  </div>
                </>
              );
            })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
