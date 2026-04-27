/**
 * Read-only audit: find which FAZ 0/3 tables silently collided with pre-existing legacy tables.
 * For each name, compare actual columns vs expected.
 */
import { Pool } from "pg";

const FAZ_TABLES: Record<string, string[]> = {
  // name → expected columns (subset that proves it's MY table, not legacy)
  plants: ["code", "name", "city"],
  work_centers: ["line_id", "code", "station_order", "capacity_per_hour"],
  machines: ["work_center_id", "code", "manufacturer", "expected_cycle_time_sec"],
  operators: ["employee_code", "primary_line_id", "skill", "certifications"],
  shifts: ["line_id", "shift_code", "start_at", "supervisor_id"],
  batches: ["product_id", "batch_code", "planned_quantity", "scheduled_start"],
  production_runs: ["batch_id", "machine_id", "operator_id", "shift_id", "planned_output", "actual_output"],
  downtime_episodes: ["machine_id", "production_run_id", "duration_min", "category"],
  scrap_reasons: ["code", "name", "category"],
  quality_events: ["batch_id", "production_run_id", "scrap_reason_id", "event_type"],
  suppliers: ["code", "name", "average_lead_time_days", "quality_grade"],
  supplier_lots: ["supplier_id", "component_code", "lot_number", "quantity_check_result" /* typo intentional skip */],
  opportunities: ["scenario_id", "title", "category", "projected_value", "priority", "linked_decision_id"],
  work_orders: ["opportunity_id", "code", "type", "target_machine_id", "target_line_id", "actual_value"],
  energy_meters: ["machine_id", "line_id", "meter_type", "unit", "last_reading"],
  energy_readings: ["meter_id", "production_run_id", "reading", "delta"],
  decisions: ["decision_type", "rationale", "alternatives_considered", "predicted_value", "source_engine", "outcome_status"],
};

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log("\n═══ TABLE CONFLICT AUDIT ═══\n");
    let cleanCount = 0, conflictCount = 0;
    const conflicts: string[] = [];

    for (const [tname, expectedCols] of Object.entries(FAZ_TABLES)) {
      const r = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
      `, [tname]);
      const actual = new Set(r.rows.map((row: any) => row.column_name));
      const missing = expectedCols.filter(c => !actual.has(c));

      if (r.rows.length === 0) {
        console.log(`✗ ${tname}: TABLE MISSING`);
        conflictCount++;
        conflicts.push(tname);
      } else if (missing.length > 0) {
        console.log(`⚠ ${tname}: CONFLICT — missing my cols: ${missing.join(", ")}`);
        console.log(`    actual cols: ${Array.from(actual).join(", ")}`);
        conflictCount++;
        conflicts.push(tname);
      } else {
        console.log(`✓ ${tname}: OK (${r.rows.length} cols)`);
        cleanCount++;
      }
    }

    console.log(`\nSummary: ${cleanCount} clean, ${conflictCount} conflicts`);
    if (conflicts.length > 0) console.log(`Conflicts: ${conflicts.join(", ")}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
