-- New company domain. Credentials remain in the existing encrypted vault.
CREATE TABLE IF NOT EXISTS company_settings(id boolean PRIMARY KEY CHECK(id), revision integer NOT NULL DEFAULT 1, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS company_connections(id text PRIMARY KEY, revision integer NOT NULL DEFAULT 1, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS company_recipes(id uuid PRIMARY KEY, revision integer NOT NULL DEFAULT 1, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS company_jobs(id uuid PRIMARY KEY, revision integer NOT NULL DEFAULT 1, state text NOT NULL CHECK(state IN ('queued','running','waiting_input','waiting_approval','completed','blocked','uncertain','cancelled')), value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS company_jobs_queue ON company_jobs(state,updated_at);
CREATE TABLE IF NOT EXISTS company_messages(id uuid PRIMARY KEY, request_id uuid UNIQUE, job_id uuid REFERENCES company_jobs(id), role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO ai_schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
