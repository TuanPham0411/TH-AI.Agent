CREATE TABLE IF NOT EXISTS ai_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO ai_schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;

