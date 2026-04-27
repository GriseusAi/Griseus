-- FAZ 4: Tiered Operations Monitoring with escalation
-- 3-tier: operator (30 min SLA) → supervisor (2 hours) → plant_manager

CREATE TABLE IF NOT EXISTS ops_alerts (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  source text NOT NULL,
  source_alert_id integer,
  entity_type text,
  entity_id text,
  metric text,
  tier text NOT NULL DEFAULT 'operator',
  severity text NOT NULL,
  title text NOT NULL,
  message text,
  recommended_action text,
  status text NOT NULL DEFAULT 'open',
  raised_at timestamp DEFAULT now() NOT NULL,
  acknowledged_at timestamp,
  acknowledged_by text,
  resolved_at timestamp,
  resolved_by text,
  resolution_notes text,
  escalation_count integer NOT NULL DEFAULT 0,
  last_escalated_at timestamp,
  escalation_history jsonb DEFAULT '[]'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_tier_status ON ops_alerts(tier, status, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_status_raised ON ops_alerts(status, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_entity ON ops_alerts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_source ON ops_alerts(source, source_alert_id);
