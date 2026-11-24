-- Upgrade the original single-project prototype without discarding existing data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default key',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_project_idx ON api_keys(project_id);

INSERT INTO projects(name, slug)
VALUES ('Legacy EngageKit project', 'legacy')
ON CONFLICT (slug) DO NOTHING;
ALTER TABLE push_subscribers ADD COLUMN IF NOT EXISTS project_id UUID;
UPDATE push_subscribers SET project_id=(SELECT id FROM projects WHERE slug='legacy')
WHERE project_id IS NULL;
ALTER TABLE push_subscribers ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE push_subscribers DROP CONSTRAINT IF EXISTS push_subscribers_endpoint_key;
ALTER TABLE push_subscribers
  ADD CONSTRAINT push_subscribers_project_fk
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE;
DO $$ BEGIN
  ALTER TABLE push_subscribers ADD CONSTRAINT push_subscribers_project_endpoint_key
    UNIQUE(project_id, endpoint);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS push_subscribers_project_created_idx
  ON push_subscribers(project_id, created_at DESC);

ALTER TABLE events ADD COLUMN IF NOT EXISTS project_id UUID;
UPDATE events SET project_id=(SELECT id FROM projects WHERE slug='legacy')
WHERE project_id IS NULL;
ALTER TABLE events ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_pkey;
ALTER TABLE events ADD CONSTRAINT events_pkey PRIMARY KEY(project_id, id);
ALTER TABLE events ADD CONSTRAINT events_project_fk
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS events_project_time_idx ON events(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS events_project_name_idx ON events(project_id, name);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  destination_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS campaigns_project_created_idx ON campaigns(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS campaign_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subscriber_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired')),
  response_code INTEGER,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS campaign_results_campaign_idx ON campaign_results(campaign_id, attempted_at DESC);
