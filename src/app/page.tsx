import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BookOpen, Upload, Zap, Palette, MessageSquare } from "lucide-react";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-warm-sand/50 bg-cream/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-4xl items-center justify-between px-3 sm:px-6">
          <span className="text-xl font-bold text-deep-charcoal">aceL</span>
          <nav className="flex items-center gap-4">
            {session ? (
              <Link
                href="/dashboard"
                className="rounded-button bg-dusty-blue px-5 py-2.5 text-sm font-medium text-white hover:brightness-95 transition"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/signin" className="text-deep-charcoal/80 hover:text-deep-charcoal font-medium">
                  Sign in
                </Link>
                <Link
                  href="/auth/signin"
                  className="rounded-button bg-dusty-blue px-5 py-2.5 text-sm font-medium text-white hover:brightness-95 transition"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24 text-center">
        <p className="slogan-text text-deep-charcoal text-xl sm:text-2xl md:text-3xl max-w-3xl mx-auto leading-snug [word-spacing:0.14em] tracking-slogan">
          Stuck with study? Let aceL HELP YOU! Whatever level of SMART you are — this application GUARANTEES it.
        </p>
        <p className="mt-6 text-lg text-deep-charcoal/80 leading-body max-w-2xl mx-auto">
          Upload your notes, PDFs, or videos. Get a personalised checklist,
          quizzes, and a learning path that fits how you learn — and get help
          when you&apos;re stuck.
        </p>
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-4">
          <Link
            href={session ? "/dashboard" : "/auth/signin"}
            className="rounded-button bg-dusty-blue px-6 py-3 text-base font-medium text-white shadow-subtle hover:brightness-95 transition inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[48px]"
          >
            {session ? "Go to Dashboard" : "Start learning"}
            <BookOpen size={20} />
          </Link>
          <Link
            href={session ? "/dashboard/upload" : "/auth/signin?callbackUrl=%2Fdashboard%2Fupload"}
            className="rounded-button border-2 border-dusty-blue/30 bg-transparent px-6 py-3 text-base font-medium text-dusty-blue hover:bg-dusty-blue/10 transition inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[48px]"
          >
            Upload content
            <Upload size={20} />
          </Link>
          <Link
            href={session ? "/dashboard/community" : "/auth/signin?callbackUrl=%2Fdashboard%2Fcommunity"}
            className="rounded-button border-2 border-sage/30 bg-sage/5 px-6 py-3 text-base font-medium text-deep-charcoal hover:bg-sage/10 transition inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[48px]"
          >
            Community
            <MessageSquare size={20} />
          </Link>
        </div>

        <section className="mt-16 sm:mt-24 grid gap-4 sm:gap-6 sm:grid-cols-3 text-left">
          <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle hover-lift">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dusty-blue/10 text-dusty-blue mb-4">
              <Upload size={24} />
            </div>
            <h3 className="font-semibold text-deep-charcoal text-lg">Multimodal input</h3>
            <p className="mt-2 text-sm text-deep-charcoal/80 leading-body">
              Notes, PDFs, images of handwriting, and videos — one checklist from all your materials.
            </p>
          </div>
          <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle hover-lift">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage mb-4">
              <Palette size={24} />
            </div>
            <h3 className="font-semibold text-deep-charcoal text-lg">Adaptive style</h3>
            <p className="mt-2 text-sm text-deep-charcoal/80 leading-body">
              Visual, reading, auditory, or example-first — the app adapts to how you learn best.
            </p>
          </div>
          <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle hover-lift">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage mb-4">
              <Zap size={24} />
            </div>
            <h3 className="font-semibold text-deep-charcoal text-lg">When you&apos;re stuck</h3>
            <p className="mt-2 text-sm text-deep-charcoal/80 leading-body">
              At-risk detection and a patient AI tutor that scaffolds step by step.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
