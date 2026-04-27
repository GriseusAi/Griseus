/**
 * FAZ 1 — End-to-end pipeline smoke test
 * Runs the simulation pipeline for GSS20P, asserts all 7 steps complete.
 */
import { runSimulationPipeline, getPipelineRun } from "../server/lib/simulation-pipeline";

(async () => {
  console.log("Running pipeline for GSS20P (simulation, 6 month horizon)...");
  const runId = await runSimulationPipeline({
    tenantId: "cukurova",
    sku: "GSS20P",
    horizonMonths: 6,
    mode: "simulation",
    triggeredBy: "smoke_test",
    growthFactor: 1.0,
  });
  const run = await getPipelineRun(runId);
  if (!run) { console.error("✗ Run not found"); process.exit(1); }
  console.log(`\n✓ Run #${runId} status=${run.status} duration=${run.durationMs}ms`);
  console.log("Steps:");
  for (const s of run.steps as any[]) {
    const tag = s.status === "ok" ? "✓" : s.status === "warning" ? "▲" : "✗";
    console.log(`  ${tag} ${s.step.padEnd(22)} ${String(s.durationMs).padStart(5)}ms ${s.notes.length > 0 ? "— " + s.notes.join("; ") : ""}`);
  }
  console.log("\nSummary:", JSON.stringify(run.summary, null, 2));
  process.exit(run.status === "success" ? 0 : 1);
})().catch(e => { console.error("✗", e.message); process.exit(1); });
