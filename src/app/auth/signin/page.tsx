"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Server configuration error. Check NEXTAUTH_SECRET and environment variables.",
  AccessDenied: "Access denied. If using Google, add your email as a test user in Google Cloud Console.",
  Verification: "Verification failed. The sign-in link may have expired.",
  OAuthAccountNotLinked: "This email is already linked to another sign-in method.",
  Default: "Sign-in failed. Please try again.",
};

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl") || "/dashboard";
  const wantsCommunity = rawCallback.includes("/dashboard/community");
  const callbackUrl = rawCallback.includes("learning-style")
    ? rawCallback
    : wantsCommunity
      ? `/auth/learning-style?callbackUrl=${encodeURIComponent("/dashboard/community")}`
      : `/auth/learning-style?callbackUrl=${encodeURIComponent(rawCallback)}`;
  const errorParam = searchParams.get("error") || "";
  const [error, setError] = useState(ERROR_MESSAGES[errorParam] || errorParam);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] || errorParam);
      setLoading(false);
    }
  }, [errorParam]);

  function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    signIn("google", { callbackUrl });
  }

  async function handleDemoSignIn() {
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        callbackUrl,
        redirect: false,
        email: "demo@example.com",
        password: "demo",
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-cream px-4 py-8">
      <div className="w-full max-w-sm rounded-card border border-warm-sand/80 bg-cream p-6 sm:p-8 shadow-subtle">
        <h1 className="text-xl font-semibold text-deep-charcoal">Sign in</h1>
        <p className="mt-2 text-sm text-deep-charcoal/80">
          Sign up or sign in with your Google account.
        </p>
        {error && (
          <div className="mt-4 rounded-button bg-terracotta/10 border border-terracotta/20 p-3 text-sm text-terracotta">
            {error}
          </div>
        )}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-button border border-warm-sand bg-cream py-2.5 text-sm font-medium text-deep-charcoal shadow-subtle hover:bg-warm-sand/30 disabled:opacity-50 transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? "Signing in…" : "Continue with Google"}
          </button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-warm-sand/80" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-cream px-2 text-xs text-deep-charcoal/60">or</span>
            </div>
          </div>
          <button
            onClick={handleDemoSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center rounded-button border border-warm-sand bg-cream py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/30 disabled:opacity-50 transition"
          >
            Continue with demo account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-cream">Loading...</div>}>
      <SignInForm />
    </Suspense>
  );
}
