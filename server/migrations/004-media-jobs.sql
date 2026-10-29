CREATE TABLE IF NOT EXISTS ai_media_jobs(id uuid PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS files(id uuid PRIMARY KEY,path text UNIQUE NOT NULL,size bigint NOT NULL CHECK(size>=0),type text NOT NULL,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO ai_schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
