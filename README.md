# aceL - AI Learning Platform

Full-stack adaptive learning web app using the **Groq API**. Students master any topic through personalised AI tutoring, adaptive learning paths, and collaborative learning.

## Features

- **Multimodal input**: Typed notes, PDF text, handwritten images (OCR), YouTube links. One unified checklist from all materials.
- **Learning style**: 5-question onboarding → Visual, Reading/Writing, Auditory/Video, or Kinesthetic mode. Content and quiz style adapt.
- **Core flow**: Upload → Checklist → Feynman/Quiz assessment → Case 1 (mastery) or Case 2 (learning path). Re-assessment until mastery.
- **At-risk support**: AI Personal Tutor chat (scaffolded, one question at a time), alternative methods, learning style switch.
- **Collaborative** (opt-in): Study groups, peer explanation review, community analogies (when implemented with Supabase).

## Tech stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS
- **AI**: Groq API (OpenAI-compatible) for chat and vision (OCR)
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

   Copy `.env.local.example` to `.env.local` and set:

   - `GROQ_API_KEY` — from [Groq](https://console.groq.com/keys)
   - `NEXTAUTH_URL` — e.g. `http://localhost:3000`
   - `NEXT_PUBLIC_BASE_URL` — e.g. `http://localhost:3000` in dev, `https://acel.app` in production
   - `NEXTAUTH_SECRET` — e.g. `openssl rand -base64 32`
   - Optional: Google OAuth `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - Optional: Supabase `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

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


