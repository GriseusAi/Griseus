-- FAZ 2: Digital Twin Health — planned vs actual divergence (Vertex pattern)

CREATE TABLE IF NOT EXISTS digital_twin_divergence (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metric text NOT NULL,
  bucket_date timestamp NOT NULL,
  planned_value numeric,
  actual_value numeric,
  unit text,
  variance_percent numeric,
  trend_7d numeric,
  trend_30d numeric,
  drift_status text DEFAULT 'ok',
  consecutive_drift_days integer DEFAULT 0,
  computed_at timestamp DEFAULT now(),
  source_run_ids jsonb DEFAULT '[]'::jsonb,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_dtd_entity ON digital_twin_divergence(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dtd_metric_date ON digital_twin_divergence(metric, bucket_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dtd_entity_metric_day ON digital_twin_divergence(entity_type, entity_id, metric, bucket_date);

CREATE TABLE IF NOT EXISTS drift_alerts (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metric text NOT NULL,
  severity text NOT NULL,
  variance_percent numeric NOT NULL,
  consecutive_drift_days integer NOT NULL,
  message text,
  recommended_action text,
  status text DEFAULT 'open',
  raised_at timestamp DEFAULT now() NOT NULL,
  resolved_at timestamp,
  acknowledged_by text
);

CREATE INDEX IF NOT EXISTS idx_drift_alerts_status ON drift_alerts(status, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_alerts_entity ON drift_alerts(entity_type, entity_id);
