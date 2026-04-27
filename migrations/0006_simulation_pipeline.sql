-- FAZ 1: Simulation Model Mesh — single transactional pipeline run
-- Vertex chained-models pattern: DSE → Forecast → Plan → BOM → Purchase → Impact → Outcome

CREATE TABLE IF NOT EXISTS simulation_pipeline_runs (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  sku text NOT NULL,
  scenario_id integer,
  horizon_months integer NOT NULL DEFAULT 6,
  mode text NOT NULL DEFAULT 'simulation',
  triggered_by text DEFAULT 'ui',
  status text NOT NULL DEFAULT 'running',
  started_at timestamp DEFAULT now() NOT NULL,
  completed_at timestamp,
  duration_ms integer,
  steps jsonb DEFAULT '[]'::jsonb,
  summary jsonb,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_sku ON simulation_pipeline_runs(sku);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON simulation_pipeline_runs(started_at DESC);
