/**
 * Pipeline Scheduler — lightweight cron-based pipeline executor
 * Checks every 60 seconds for pipelines that need to run.
 * Uses simple cron matching (minute, hour, day-of-month, month, day-of-week).
 */

import { db } from "../db";
import { pipelineDefinitions, pipelineRuns } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { recordLineage } from "../routes/foundry";

/** Parse a cron expression and check if it matches current time */
function cronMatches(expression: string, now: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const checks = [
    { field: now.getMinutes(), pattern: minute },
    { field: now.getHours(), pattern: hour },
    { field: now.getDate(), pattern: dayOfMonth },
    { field: now.getMonth() + 1, pattern: month },
    { field: now.getDay(), pattern: dayOfWeek },
  ];

  return checks.every(({ field, pattern }) => {
    if (pattern === "*") return true;
    // Handle */N (every N)
    if (pattern.startsWith("*/")) {
      const n = parseInt(pattern.slice(2));
      return n > 0 && field % n === 0;
    }
    // Handle comma-separated values
    const values = pattern.split(",").map(Number);
    return values.includes(field);
  });
}

/** Run scheduled pipelines (called every 60 seconds) */
async function tick(): Promise<void> {
  try {
    const now = new Date();
    const pipelines = await db
      .select()
      .from(pipelineDefinitions)
      .where(and(eq(pipelineDefinitions.enabled, true), isNotNull(pipelineDefinitions.cronExpression)));

    for (const pipeline of pipelines) {
      if (!pipeline.cronExpression) continue;
      if (!cronMatches(pipeline.cronExpression, now)) continue;

      // Check if already ran this minute (prevent double-runs)
      if (pipeline.lastRunAt) {
        const lastRun = new Date(pipeline.lastRunAt);
        const diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 55_000) continue; // ran less than 55 seconds ago
      }

      console.log(`[pipeline-scheduler] Running pipeline: ${pipeline.name} (id=${pipeline.id})`);

      // Create run record
      const [run] = await db.insert(pipelineRuns).values({
        pipelineId: pipeline.id,
        status: "running",
      }).returning();

      try {
        // Execute based on type
        let recordsProcessed = 0;

        if (pipeline.pipelineType === "health_check") {
          // Import health check module dynamically to avoid circular deps
          const { componentStock } = await import("@shared/schema");
          const stocks = await db.select().from(componentStock);
          const issues = stocks.filter(s => Number(s.currentStock) < 0);
          recordsProcessed = stocks.length;

          await recordLineage({
            entity: "health_check",
            entityId: String(pipeline.id),
            sourceType: "pipeline",
            sourceId: String(run.id),
            sourceName: `Scheduled: ${pipeline.name}`,
            actor: "pipeline",
            metadata: { issueCount: issues.length, recordsChecked: recordsProcessed },
          });
        }

        await db.update(pipelineRuns).set({
          status: "success",
          completedAt: new Date(),
          recordsProcessed,
        }).where(eq(pipelineRuns.id, run.id));

        await db.update(pipelineDefinitions).set({
          lastRunAt: new Date(),
          lastStatus: "success",
          updatedAt: new Date(),
        }).where(eq(pipelineDefinitions.id, pipeline.id));

      } catch (execErr: any) {
        console.error(`[pipeline-scheduler] Pipeline ${pipeline.name} failed:`, execErr.message);
        await db.update(pipelineRuns).set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: execErr.message,
        }).where(eq(pipelineRuns.id, run.id));
        await db.update(pipelineDefinitions).set({
          lastRunAt: new Date(),
          lastStatus: "failed",
          updatedAt: new Date(),
        }).where(eq(pipelineDefinitions.id, pipeline.id));
      }
    }
  } catch (err: any) {
    console.error("[pipeline-scheduler] Tick error:", err.message);
  }
}

let intervalId: NodeJS.Timeout | null = null;

/** Start the pipeline scheduler (runs every 60 seconds) */
export function startPipelineScheduler(): void {
  if (intervalId) return; // already running
  console.log("[pipeline-scheduler] Started — checking every 60s");
  intervalId = setInterval(tick, 60_000);
  // Run once immediately to catch anything pending
  tick();
}

/** Stop the pipeline scheduler */
export function stopPipelineScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[pipeline-scheduler] Stopped");
  }
}
