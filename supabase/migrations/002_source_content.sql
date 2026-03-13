-- Store raw uploaded content for post-source quiz grounding
-- Run in Supabase SQL Editor
ALTER TABLE topics ADD COLUMN IF NOT EXISTS source_content TEXT DEFAULT '';
