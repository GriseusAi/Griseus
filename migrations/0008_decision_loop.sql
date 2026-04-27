-- FAZ 3: Decision + Opportunity + Work Order closed loop
-- Palantir Foundry decision capture pattern.

CREATE TABLE IF NOT EXISTS decisions (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  decision_type text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  alternatives_considered jsonb DEFAULT '[]'::jsonb,
  predicted_value numeric,
  predicted_metric_impact jsonb,
  confidence numeric,
  source_scenario_id integer,
  source_pipeline_run_id integer,
  source_engine text,
  linked_opportunity_id integer,
  status text NOT NULL DEFAULT 'proposed',
  deadline timestamp,
  proposed_by text DEFAULT 'agent',
  approved_by text,
  approved_at timestamp,
  actual_value numeric,
  outcome_status text,
  outcome_verified_at timestamp,
  outcome_notes text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_scenario ON decisions(source_scenario_id);
CREATE INDEX IF NOT EXISTS idx_decisions_deadline ON decisions(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decisions(outcome_status) WHERE outcome_status IS NOT NULL;

-- Add decision linkage to existing opportunities table (idempotent)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS linked_decision_id integer;
CREATE INDEX IF NOT EXISTS idx_opportunities_decision ON opportunities(linked_decision_id);
