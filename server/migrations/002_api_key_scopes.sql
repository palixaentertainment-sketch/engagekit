-- Add explicit key scopes. Existing keys remain secret by default.
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_type TEXT NOT NULL DEFAULT 'secret';
DO $$ BEGIN
  ALTER TABLE api_keys ADD CONSTRAINT api_keys_key_type_check
    CHECK (key_type IN ('public','secret'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
