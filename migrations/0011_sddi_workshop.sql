-- FAZ 5: SDDI connectors + Workshop builder

CREATE TABLE IF NOT EXISTS connectors (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  name text NOT NULL,
  kind text NOT NULL,
  direction text NOT NULL DEFAULT 'read_only',
  config jsonb DEFAULT '{}'::jsonb,
  target_table text,
  schedule text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connector_runs (
  id serial PRIMARY KEY,
  connector_id integer NOT NULL REFERENCES connectors(id),
  trigger text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamp DEFAULT now() NOT NULL,
  completed_at timestamp,
  duration_ms integer,
  rows_read integer DEFAULT 0,
  rows_written integer DEFAULT 0,
  rows_rejected integer DEFAULT 0,
  error_message text,
  summary jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS field_mappings (
  id serial PRIMARY KEY,
  connector_id integer NOT NULL REFERENCES connectors(id),
  source_field text NOT NULL,
  target_field text NOT NULL,
  confidence numeric,
  approved_by text,
  approved_at timestamp,
  transform text
);

CREATE TABLE IF NOT EXISTS workspaces (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  name text NOT NULL,
  description text,
  layout jsonb DEFAULT '[]'::jsonb,
  owner_id text,
  visibility text DEFAULT 'private',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_widgets (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id),
  type text NOT NULL,
  title text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  data_source jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connector_runs_connector ON connector_runs(connector_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_mappings_connector ON field_mappings(connector_id);
CREATE INDEX IF NOT EXISTS idx_workspace_widgets_ws ON workspace_widgets(workspace_id);
