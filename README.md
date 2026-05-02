# aceL - AI Learning Platform

Full-stack adaptive learning web app powered by **Featherless AI**. Students master any topic through personalised AI tutoring, adaptive learning paths, and collaborative learning.

## Features

- **Multimodal input**: Typed notes, PDF text, handwritten images (OCR), YouTube links. One unified checklist from all materials.
- **Learning style**: 5-question onboarding → Visual, Reading/Writing, Auditory/Video, or Kinesthetic mode. Content and quiz style adapt.
- **Core flow**: Upload → Checklist → Feynman/Quiz assessment → Case 1 (mastery) or Case 2 (learning path). Re-assessment until mastery.
- **At-risk support**: AI Personal Tutor chat (scaffolded, one question at a time), alternative methods, learning style switch.
- **Collaborative** (opt-in): Study groups, peer explanation review, community analogies (when implemented with Supabase).

## Tech stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS
- **AI**: [Featherless AI](https://featherless.ai) for chat and vision (OCR), using the OpenAI SDK against a configurable base URL
- **Auth**: NextAuth (email + Google)
- **Storage**: Supabase (optional; app works with localStorage for demo)
- **YouTube**: `youtube-transcript` for captions
- **Charts**: Recharts (ready for confidence/progress charts)

## Setup

1. **Clone and install**

   ```bash
   cd HackTheEast
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set the variables there (overview below):

   **Featherless AI**

   - `FEATHERLESS_API_KEY`
   - `NEXT_PUBLIC_FEATHERLESS_BASE_URL` — same purpose as in `.env.example`; if omitted, the app falls back to `https://api.featherless.ai/v1` (see `src/lib/llm.ts`)

   **NextAuth**

   - `NEXTAUTH_URL` — e.g. `http://localhost:3000` in development
   - `NEXTAUTH_SECRET` — e.g. `openssl rand -base64 32`
   - `NEXT_PUBLIC_BASE_URL` — origin where the site is served (dev: `http://localhost:3000`; production: your HTTPS URL)

   **Google sign-in**

   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — required for **Continue with Google** (see commented steps and redirect URI `${NEXT_PUBLIC_BASE_URL}/api/auth/callback/google` in `.env.example`)

   **Supabase** (optional; persistence vs `localStorage`)

   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

3. **Supabase** (optional)

   Run `supabase/schema.sql` in the Supabase SQL Editor to create base tables. Then run `supabase/migrations/001_extended_schema.sql` for full persistence (topics, assessments, progress, misconceptions, etc.). If you skip this, the app stores topics and progress in `localStorage`.

4. **Run**

   ```bash
   npm run dev
   ```

   Open your configured base URL (for local dev, [http://localhost:3000](http://localhost:3000)). Sign in with “Continue with demo” or Google, then go to **Upload** to add content.

## MVP build order (implemented)

1. Upload (PDF + text) → AI checklist and summary  
2. Quiz and explanation mode → score and feedback  
3. Case 1 vs Case 2 branching and learning path  
4. Learning style profile and adaptive content delivery  
5. At-risk detection and alternative method suggestions (logic + tutor)  
6. AI Personal Tutor chat with scaffolded conversation  
7. Handwritten note OCR and YouTube video summarisation  
8. Knowledge map (data ready; full viz can be added)  
9. Confidence check-in and gamification (schema/APIs ready)  
10. Collaborative features (schema ready; Study Groups, Peer Review, Analogies)  
11. Spaced repetition (schema ready; notifications)

## Design

- Calm, minimal UI; mobile-friendly.
- Encouraging, non-judgmental AI tone.
- At-risk: “This concept is being a bit stubborn — let’s try a different approach.”


