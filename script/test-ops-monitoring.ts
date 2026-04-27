/**
 * FAZ 4 — End-to-end smoke test:
 * 1. Create alert at operator tier with backdated raised_at (35 min ago)
 * 2. Run auto-escalate → should bump to supervisor
 * 3. Backdate again (3 hours total) → should bump to plant_manager
 * 4. Get tier dashboards
 * 5. Get process flow for line 1
 */
import { Pool } from "pg";
import {
  createOpsAlert, autoEscalateOpenAlerts,
  getTierDashboard, getProcessFlow, listOpsAlerts, getPlantManagerSummary,
  resolveOpsAlert, syncDriftAlertsToOps,
} from "../server/lib/ops-monitoring";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function backdateAlert(id: number, minutesAgo: number) {
  await pool.query(`UPDATE ops_alerts SET raised_at = NOW() - INTERVAL '${minutesAgo} minutes' WHERE id = $1`, [id]);
}

(async () => {
  console.log("[1] create_alert (operator tier) ...");
  const alertId = await createOpsAlert({
    source: "manual", entityType: "machine", entityId: "1", metric: "throughput",
    tier: "operator", severity: "warning",
    title: "Pres 100T throughput düşük",
    message: "Vardiya sonu hedefe ulaşamadı, %15 sapma var",
    recommendedAction: "Operatör cycle time kontrolü yapsın, gerekirse setup yenile",
  });
  console.log(`    alertId=${alertId}`);

  console.log("[2] backdate raised_at to 35 min ago + auto-escalate ...");
  await backdateAlert(alertId, 35);
  let r = await autoEscalateOpenAlerts();
  console.log(`    escalated=${r.escalated} details=${JSON.stringify(r.details)}`);

  console.log("[3] backdate to 3 hours ago + auto-escalate again ...");
  await backdateAlert(alertId, 180);
  await pool.query(`UPDATE ops_alerts SET last_escalated_at = NOW() - INTERVAL '150 minutes' WHERE id = $1`, [alertId]);
  r = await autoEscalateOpenAlerts();
  console.log(`    escalated=${r.escalated} details=${JSON.stringify(r.details)}`);

  console.log("\n[4] tier dashboards:");
  for (const tier of ["operator", "supervisor", "plant_manager"] as const) {
    const d = await getTierDashboard(tier);
    console.log(`  ${tier.padEnd(15)} open=${d.openCount} ack=${d.acknowledgedCount} resolvedToday=${d.resolvedToday}`);
  }

  console.log("\n[5] plant_manager summary:");
  const ps = await getPlantManagerSummary();
  console.log(`  totalOpen=${ps.totalOpen}`);
  console.log(`  byTier=${JSON.stringify(ps.byTier)}`);

  console.log("\n[6] process flow line 1:");
  const flow = await getProcessFlow(1);
  if (flow.line) {
    console.log(`  ${flow.line.label} (${flow.line.status}) — ${flow.line.children?.length ?? 0} workCenter`);
    for (const wc of flow.line.children ?? []) {
      console.log(`    └ ${wc.label} (${wc.status}) — ${wc.children?.length ?? 0} machine`);
      for (const m of wc.children ?? []) {
        console.log(`        └ ${m.label} (${m.status}) cycle=${m.metrics?.cycleTimeSec}sn`);
      }
    }
  }

  console.log("\n[7] sync drift alerts to ops:");
  const sync = await syncDriftAlertsToOps();
  console.log(`  created=${sync.created}`);

  console.log("\n[8] resolve test alert ...");
  await resolveOpsAlert(alertId, "test", "Smoke test temizliği");
  console.log("  ✓ resolved");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("✗", e.message, e.stack); pool.end(); process.exit(1); });
