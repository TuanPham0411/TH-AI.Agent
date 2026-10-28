CREATE TABLE IF NOT EXISTS ai_drafts (
 id uuid PRIMARY KEY,
 title text NOT NULL,
 content jsonb NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_preferences(id boolean PRIMARY KEY CHECK(id),value jsonb NOT NULL);
INSERT INTO ai_schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
