"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BookOpen, Upload, TrendingUp, LogOut, ShoppingBag, Flame, MessageSquare, User } from "lucide-react";
import { getStreak, getStreakMilestoneLabel } from "@/lib/storage";
import { useStreakRefresh } from "@/hooks/useProgressRefresh";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [streakCount] = useStreakRefresh();

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

  return (
    <div className="min-h-screen bg-cream">
      <header
        className="fixed top-0 left-0 right-0 z-50 border-b border-warm-sand/50 bg-cream/80 backdrop-blur-md"
        style={{ boxShadow: "0 1px 0 rgba(240, 230, 217, 0.5)" }}
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-3 sm:px-6 md:px-8 pt-safe">
          <Link
            href="/dashboard"
            className="font-semibold text-deep-charcoal text-sm sm:text-base truncate max-w-[140px] sm:max-w-none"
          >
            Adaptive Learning
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <NavLink href="/dashboard" active={pathname === "/dashboard"} icon={<BookOpen size={18} />}>
              Dashboard
            </NavLink>
            <NavLink href="/dashboard/upload" active={pathname === "/dashboard/upload"} icon={<Upload size={18} />}>
              Upload
            </NavLink>
            <NavLink href="/dashboard/progress" active={pathname === "/dashboard/progress"} icon={<TrendingUp size={18} />}>
              Progress
            </NavLink>
            <NavLink href="/dashboard/community" active={pathname?.startsWith("/dashboard/community")} icon={<MessageSquare size={18} />}>
              Community
            </NavLink>
            <NavLink href="/dashboard/profile" active={pathname === "/dashboard/profile"} icon={<User size={18} />}>
              Profile
            </NavLink>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-full bg-terracotta/10 px-2.5 sm:px-3 py-2 sm:py-1.5 text-sm font-medium text-terracotta min-h-[44px] sm:min-h-0 items-center justify-center"
              title={`${streakCount} day streak`}
            >
              <Flame size={16} />
              {streakCount}
            </Link>
            <Link
              href="/dashboard/profile"
              className="hidden sm:flex items-center gap-2 text-sm text-deep-charcoal/80 hover:text-deep-charcoal truncate max-w-[140px]"
              title="Profile"
            >
              {(session.user as { image?: string })?.image ? (
                <img
                  src={(session.user as { image?: string }).image}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover border border-warm-sand/50"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-dusty-blue/20 flex items-center justify-center">
                  <User size={14} className="text-dusty-blue" />
                </div>
              )}
              <span className="truncate">
                {(session.user as { name?: string })?.name ?? (session.user as { email?: string })?.email?.split("@")[0] ?? "Student"}
                {getStreakMilestoneLabel(streakCount) && (
                  <span className="ml-1 text-terracotta">{getStreakMilestoneLabel(streakCount)}</span>
                )}
              </span>
            </Link>
            <Link
              href="/dashboard/shop"
              className="rounded-full p-2 text-deep-charcoal/60 hover:bg-warm-sand/30 hover:text-deep-charcoal transition"
              title="Shop"
            >
              <ShoppingBag size={18} />
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-full p-2 text-deep-charcoal/60 hover:bg-warm-sand/30 hover:text-deep-charcoal transition"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 sm:hidden border-t border-warm-sand/80 bg-cream/95 backdrop-blur-md flex justify-around py-2 px-2 pb-safe">
          <MobileNavLink href="/dashboard" active={pathname === "/dashboard"} icon={<BookOpen size={20} />}>
            Dashboard
          </MobileNavLink>
          <MobileNavLink href="/dashboard/upload" active={pathname === "/dashboard/upload"} icon={<Upload size={20} />}>
            Upload
          </MobileNavLink>
          <MobileNavLink href="/dashboard/progress" active={pathname === "/dashboard/progress"} icon={<TrendingUp size={20} />}>
            Progress
          </MobileNavLink>
          <MobileNavLink href="/dashboard/shop" active={pathname === "/dashboard/shop"} icon={<ShoppingBag size={20} />}>
            Shop
          </MobileNavLink>
          <MobileNavLink href="/dashboard/community" active={pathname?.startsWith("/dashboard/community")} icon={<MessageSquare size={20} />}>
            Community
          </MobileNavLink>
          <MobileNavLink href="/dashboard/profile" active={pathname === "/dashboard/profile"} icon={<User size={20} />}>
            Profile
          </MobileNavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl w-full px-3 sm:px-6 md:px-8 pt-14 pb-28 sm:pb-8">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2 rounded-button font-medium transition ${
        active
          ? "text-deep-charcoal border-b-2 border-dusty-blue"
          : "text-deep-charcoal/80 hover:bg-warm-sand/30 hover:text-deep-charcoal"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] min-w-[56px] py-2 px-2 rounded-button text-xs font-medium transition ${
        active ? "text-dusty-blue" : "text-deep-charcoal/60"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
