-- Extended schema for user data persistence & multi-topic studying
-- Run in Supabase SQL Editor after base schema.sql

-- Extend topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT '';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress' 
  CHECK (status IN ('in_progress','mastered','review_due','at_risk','archived'));
ALTER TABLE topics ADD COLUMN IF NOT EXISTS current_step TEXT DEFAULT 'upload' 
  CHECK (current_step IN ('upload','checklist','assessment','case1','case2','learning_path','re_assessment','mastered'));
ALTER TABLE topics ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS understanding_score INT;

-- Source materials (files, YouTube, notes) per topic
CREATE TABLE IF NOT EXISTS source_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pdf','image','youtube','text','handwritten')),
  file_url TEXT,
  external_url TEXT,
  content_preview TEXT,
  transcript TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Concept knowledge map status (green, amber, grey, red)
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS knowledge_map_status TEXT DEFAULT 'grey' 
  CHECK (knowledge_map_status IN ('green','amber','grey','red'));
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS mastery_status TEXT DEFAULT 'not_started' 
  CHECK (mastery_status IN ('not_started','shaky','mastered'));
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS mastery_status TEXT DEFAULT 'not_started';

-- Assessments (quiz + feynman attempts)
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('quiz','feynman')),
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  questions JSONB DEFAULT '[]',
  answers JSONB DEFAULT '[]',
  misconceptions JSONB DEFAULT '[]',
  feedback JSONB DEFAULT '{}',
  attempted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessments_topic ON assessments(topic_id);
CREATE INDEX IF NOT EXISTS idx_assessments_attempted ON assessments(attempted_at);

-- AI feedback per concept (stored for review)
CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  feedback_type TEXT CHECK (feedback_type IN ('assessment','tutor','quiz','learning_path')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_topic_concept ON ai_feedback(topic_id, concept_id);

-- Learning path items (extended)
CREATE TABLE IF NOT EXISTS learning_path_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','complete')),
  alternative_methods_tried JSONB DEFAULT '[]',
  at_risk_flag BOOLEAN DEFAULT false,
  interventions_triggered JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_path_topic ON learning_path_items(topic_id);

-- Extend progress table
ALTER TABLE progress ADD COLUMN IF NOT EXISTS unfamiliar_concepts TEXT[] DEFAULT '{}';
ALTER TABLE progress ADD COLUMN IF NOT EXISTS assessment_feedback JSONB;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS last_session_summary TEXT;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS study_time_seconds INT DEFAULT 0;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;

-- Spaced repetition (extend existing)
ALTER TABLE spaced_repetition ADD COLUMN IF NOT EXISTS mastery_date TIMESTAMPTZ;
ALTER TABLE spaced_repetition ADD COLUMN IF NOT EXISTS schedule_restarted BOOLEAN DEFAULT false;
ALTER TABLE spaced_repetition ADD COLUMN IF NOT EXISTS recall_quiz_results JSONB;

-- Misconceptions log (for Progress Overview)
CREATE TABLE IF NOT EXISTS misconceptions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  concept_title TEXT,
  misconception_text TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_misconceptions_user ON misconceptions_log(user_id);

-- Study session tracking
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_topic ON study_sessions(user_id, topic_id);

-- Quiz draft answers (for mid-quiz state restoration)
CREATE TABLE IF NOT EXISTS quiz_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  questions JSONB DEFAULT '[]',
  answers JSONB DEFAULT '{}',
  current_question_index INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, topic_id)
);
