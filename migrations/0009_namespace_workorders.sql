-- FAZ 3 fix: Palantir-style namespacing for work_orders
-- Legacy work_orders table (different schema, project_id/trade columns) belongs to a
-- prior project domain. We coexist by creating griseus_work_orders for the new ontology.

CREATE TABLE IF NOT EXISTS griseus_work_orders (
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

CREATE INDEX IF NOT EXISTS idx_griseus_wo_status ON griseus_work_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_griseus_wo_opportunity ON griseus_work_orders(opportunity_id);

-- Update ontology registry: WorkOrder backing_table now points to griseus_work_orders
UPDATE ontology_object_types
SET backing_table = 'griseus_work_orders'
WHERE id = 'work_order';
