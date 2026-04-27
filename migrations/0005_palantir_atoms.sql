-- FAZ 0: Palantir-Level Operational Atoms (2026-04-27)
-- Vertex pattern adapted to Çukurova HVAC manufacturing
-- Reference: ~/Desktop/GRISEUS_PALANTIR_PLAYBOOK.md

-- Asset hierarchy
CREATE TABLE IF NOT EXISTS plants (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  code text NOT NULL,
  name text NOT NULL,
  city text,
  address text,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_centers (
  id serial PRIMARY KEY,
  line_id integer REFERENCES production_lines(id),
  code text NOT NULL,
  name text NOT NULL,
  station_order integer,
  capacity_per_hour numeric,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS machines (
  id serial PRIMARY KEY,
  work_center_id integer REFERENCES work_centers(id),
  code text NOT NULL,
  name text NOT NULL,
  type text,
  manufacturer text,
  installed_at timestamp,
  expected_cycle_time_sec numeric,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS operators (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  employee_code text NOT NULL,
  name text NOT NULL,
  primary_line_id integer REFERENCES production_lines(id),
  skill text,
  certifications jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'active'
);

-- Time atoms
CREATE TABLE IF NOT EXISTS shifts (
  id serial PRIMARY KEY,
  line_id integer NOT NULL REFERENCES production_lines(id),
  shift_code text NOT NULL,
  start_at timestamp NOT NULL,
  end_at timestamp,
  supervisor_id integer REFERENCES operators(id),
  notes text
);

CREATE TABLE IF NOT EXISTS batches (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id),
  batch_code text NOT NULL,
  planned_quantity integer NOT NULL,
  status text DEFAULT 'planned',
  scheduled_start timestamp,
  scheduled_end timestamp,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_runs (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES batches(id),
  machine_id integer REFERENCES machines(id),
  operator_id integer REFERENCES operators(id),
  shift_id integer REFERENCES shifts(id),
  start_at timestamp NOT NULL,
  end_at timestamp,
  planned_output integer,
  actual_output integer,
  scrap_count integer DEFAULT 0,
  setup_time_sec integer,
  cycle_time_avg_sec numeric,
  status text DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS downtime_episodes (
  id serial PRIMARY KEY,
  machine_id integer REFERENCES machines(id),
  production_run_id integer REFERENCES production_runs(id),
  start_at timestamp NOT NULL,
  end_at timestamp,
  duration_min numeric,
  category text,
  reason text,
  resolved_by integer REFERENCES operators(id)
);

-- Quality
CREATE TABLE IF NOT EXISTS scrap_reasons (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  description text
);

CREATE TABLE IF NOT EXISTS quality_events (
  id serial PRIMARY KEY,
  batch_id integer REFERENCES batches(id),
  production_run_id integer REFERENCES production_runs(id),
  scrap_reason_id integer REFERENCES scrap_reasons(id),
  event_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  detected_at timestamp DEFAULT now(),
  detected_by integer REFERENCES operators(id),
  notes text
);

-- Supplier graph
CREATE TABLE IF NOT EXISTS suppliers (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  code text NOT NULL,
  name text NOT NULL,
  country text,
  average_lead_time_days integer,
  quality_grade text,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS supplier_lots (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL REFERENCES suppliers(id),
  component_code text NOT NULL,
  lot_number text NOT NULL,
  quantity integer NOT NULL,
  received_at timestamp,
  quality_check_result text,
  unit_cost numeric
);

-- Decision/execution chain
CREATE TABLE IF NOT EXISTS opportunities (
  id serial PRIMARY KEY,
  tenant_id text DEFAULT 'cukurova',
  scenario_id integer,
  title text NOT NULL,
  description text,
  category text,
  projected_value numeric,
  projected_metric_impact jsonb,
  priority text DEFAULT 'medium',
  status text DEFAULT 'identified',
  identified_at timestamp DEFAULT now(),
  deadline timestamp
);

CREATE TABLE IF NOT EXISTS work_orders (
  id serial PRIMARY KEY,
  opportunity_id integer REFERENCES opportunities(id),
  code text NOT NULL,
  type text NOT NULL,
  assignee_id integer REFERENCES operators(id),
  target_machine_id integer REFERENCES machines(id),
  target_line_id integer REFERENCES production_lines(id),
  description text,
  due_date timestamp,
  started_at timestamp,
  completed_at timestamp,
  status text DEFAULT 'open',
  actual_value numeric,
  completion_proof text,
  created_at timestamp DEFAULT now()
);

-- Energy/cost
CREATE TABLE IF NOT EXISTS energy_meters (
  id serial PRIMARY KEY,
  machine_id integer REFERENCES machines(id),
  line_id integer REFERENCES production_lines(id),
  meter_type text NOT NULL,
  unit text NOT NULL,
  installed_at timestamp,
  last_reading numeric,
  last_reading_at timestamp
);

CREATE TABLE IF NOT EXISTS energy_readings (
  id serial PRIMARY KEY,
  meter_id integer NOT NULL REFERENCES energy_meters(id),
  production_run_id integer REFERENCES production_runs(id),
  reading numeric NOT NULL,
  delta numeric,
  recorded_at timestamp DEFAULT now()
);
