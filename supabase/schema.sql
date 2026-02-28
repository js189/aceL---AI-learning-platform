-- Adaptive Learning App — Supabase schema
-- Run this in Supabase SQL Editor to create tables.

-- Users (synced from NextAuth; optional if using Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  learning_style_profile JSONB DEFAULT '{}',
  streak INT DEFAULT 0,
  badges TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Topics (per user)
CREATE TABLE IF NOT EXISTS topic
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  subject TEXT,
  raw_sources TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'mastered', 'at_risk', 'review_due', 'archived')),
  current_step TEXT,
  understanding_score INT,
  last_accessed_at TIMESTAMPTZ,
  is_pinned BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Concepts (extracted from content, per topic)
CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started','shaky','mastered','misconception')),
  "order" INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Checklist items (per topic)
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Progress (assessment & case)
CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  checklist_completed BOOLEAN DEFAULT false,
  assessment_score INT,
  "case" INT CHECK ("case" IN (1, 2)),
  at_risk_flags INT DEFAULT 0,
  learning_path JSONB DEFAULT '[]',
  last_assessment_at TIMESTAMPTZ,
  attempt_count INT DEFAULT 0,
  study_time_seconds INT DEFAULT 0,
  unfamiliar_concepts TEXT[] DEFAULT '{}',
  assessment_feedback JSONB,
  last_session_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, topic_id)
);

-- Assessments (quiz/explanation scores per topic)
-- type: 'quiz' | 'post_source_quiz' | 'main_assessment' | 'checkpoint' | 'active_recall'
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'quiz',
  score INT NOT NULL,
  feedback JSONB,
  misconceptions TEXT[] DEFAULT '{}',
  attempted_at TIMESTAMPTZ DEFAULT now()
);

-- Misconceptions log (from assessment feedback)
CREATE TABLE IF NOT EXISTS misconceptions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  concept_title TEXT,
  misconception_text TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Confidence check-ins
CREATE TABLE IF NOT EXISTS confidence_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  score INT NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tutor chat messages (for at-risk / personal tutor)
CREATE TABLE IF NOT EXISTS tutor_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Study groups (anonymous)
CREATE TABLE IF NOT EXISTS study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  upvotes INT DEFAULT 0,
  moderated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Discussion boards (community, shared across users)
CREATE TABLE IF NOT EXISTS discussion_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  creator_username TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Discussion messages (posts/replies on boards)
CREATE TABLE IF NOT EXISTS discussion_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES discussion_boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  milestone_label TEXT DEFAULT '',
  content TEXT NOT NULL,
  parent_id UUID REFERENCES discussion_messages(id) ON DELETE CASCADE,
  reactions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussion_messages_board ON discussion_messages(board_id);
CREATE INDEX IF NOT EXISTS idx_discussion_messages_parent ON discussion_messages(parent_id);

-- Spaced repetition schedule
CREATE TABLE IF NOT EXISTS spaced_repetition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  next_review_at TIMESTAMPTZ NOT NULL,
  interval_days INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migrations: add columns if tables already exist from prior schema
ALTER TABLE topics ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS current_step TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS understanding_score INT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

ALTER TABLE progress ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS study_time_seconds INT DEFAULT 0;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS unfamiliar_concepts TEXT[] DEFAULT '{}';
ALTER TABLE progress ADD COLUMN IF NOT EXISTS assessment_feedback JSONB;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS last_session_summary TEXT;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage: create 'avatars' bucket in Supabase Dashboard (Storage > New bucket)
-- Set to Public, MIME types: image/jpeg, image/png, image/webp, image/gif, Max size: 2MB

-- RLS (optional; enable if using Supabase Auth)
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
-- etc.
