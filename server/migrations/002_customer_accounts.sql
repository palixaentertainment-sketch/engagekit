-- EngageKit customer accounts and project ownership.
-- Run once in the Supabase SQL Editor after the original schema.sql.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS projects_owner_created_idx
  ON projects(owner_id, created_at DESC);

-- Existing founder-created projects intentionally remain unowned.
-- Assign any legacy project to an account explicitly before exposing it.
