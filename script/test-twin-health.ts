/**
 * FAZ 2 — End-to-end twin health smoke test
 * Compute today's variance (covers FAZ 0 seed run), then yesterday's,
 * then read dashboard.
 */
import { computeDailyVariance, getDashboard, getOpenAlerts } from "../server/lib/twin-health";

(async () => {
  // Compute for today (FAZ 0 seed run was today)
  console.log("Computing variance for today...");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const r1 = await computeDailyVariance({ day: today });
  console.log(`✓ Day=${r1.day} rows=${r1.rowsWritten} alerts=${r1.alertsRaised} byMetric=${JSON.stringify(r1.byMetric)}`);

  // Compute for yesterday (will be empty, but exercises the path)
  const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  console.log("\nComputing variance for yesterday...");
  const r2 = await computeDailyVariance({ day: yesterday });
  console.log(`✓ Day=${r2.day} rows=${r2.rowsWritten} alerts=${r2.alertsRaised}`);

  // Read dashboard
  console.log("\nDashboard summary (last 30 days):");
  const dash = await getDashboard({ days: 30 });
  console.log(`  Total: ${dash.summary.totalRows}, OK: ${dash.summary.okCount}, Warn: ${dash.summary.warningCount}, Crit: ${dash.summary.criticalCount}`);
  console.log("  Recent rows:");
  for (const r of dash.rows.slice(0, 10)) {
    console.log(`    ${r.entityType}:${r.entityId} ${r.metric.padEnd(12)} planned=${r.plannedValue} actual=${r.actualValue} variance=${r.variancePercent}% drift=${r.driftStatus}`);
  }

  const alerts = await getOpenAlerts();
  console.log(`\nOpen drift alerts: ${alerts.length}`);

  process.exit(0);
})().catch(e => { console.error("✗", e.message, e.stack); process.exit(1); });
