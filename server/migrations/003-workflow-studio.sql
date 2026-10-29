CREATE TABLE IF NOT EXISTS ai_workflows (
 id uuid PRIMARY KEY, title text NOT NULL, graph jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), active boolean NOT NULL DEFAULT false,
 next_run_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_runs (
 id uuid PRIMARY KEY, workflow_id uuid NOT NULL REFERENCES ai_workflows(id),
 session_id text NOT NULL, status text NOT NULL, input jsonb NOT NULL,
 graph jsonb NOT NULL, output jsonb, trace jsonb NOT NULL DEFAULT '[]',
 error text, started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_runs_history ON ai_runs(workflow_id,session_id,started_at DESC);
CREATE TABLE IF NOT EXISTS ai_credentials(id text PRIMARY KEY, secret jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_oauth_states(id uuid PRIMARY KEY, secret jsonb NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS ai_addins(id text PRIMARY KEY, manifest jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO ai_schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
