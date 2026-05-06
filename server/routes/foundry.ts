/**
 * FOUNDRY LAYER — Palantir-inspired data infrastructure
 *
 * 4 sub-systems:
 *   1. Data Lineage    — full provenance chain ("where did this number come from?")
 *   2. Pipeline/Sched  — automated data pipelines with cron scheduling
 *   3. Data Versioning — snapshots before mutations, rollback support
 *   4. Scenario Branch — persistent what-if branches, compare & apply
 */

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import {
  dataLineage,
  pipelineDefinitions,
  pipelineRuns,
  dataSnapshots,
  scenarios,
  scenarioOverrides,
  componentStock,
  bomItems,
  stockLevels,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { simulateWhatIf, type WhatIfScenario } from "../lib/whatif-engine";
import { broadcastEntityChanged } from "../ws";

const router = Router();

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function routeInt(value: string | string[] | undefined): number {
  return parseInt(routeParam(value), 10);
}

// ══════════════════════════════════════════════════════════════════════
// 1. DATA LINEAGE — "Bu sayı nereden geldi?"
// ══════════════════════════════════════════════════════════════════════

/** Record a lineage entry (used by other modules) */
export async function recordLineage(entry: {
  entity: string;
  entityId: string;
  field?: string;
  previousValue?: string | null;
  newValue?: string | null;
  sourceType: string;
  sourceId?: string;
  sourceName?: string;
  parentLineageId?: number;
  actor?: string;
  metadata?: Record<string, any>;
}): Promise<number> {
  const [row] = await db.insert(dataLineage).values({
    entity: entry.entity,
    entityId: entry.entityId,
    field: entry.field || null,
    previousValue: entry.previousValue || null,
    newValue: entry.newValue || null,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId || null,
    sourceName: entry.sourceName || null,
    parentLineageId: entry.parentLineageId || null,
    actor: entry.actor || "system",
    metadata: entry.metadata || null,
  }).returning();
  return row.id;
}

/** Record a batch of lineage entries */
export async function recordLineageBatch(entries: Parameters<typeof recordLineage>[0][]): Promise<number[]> {
  if (entries.length === 0) return [];
  const rows = await db.insert(dataLineage).values(
    entries.map(e => ({
      entity: e.entity,
      entityId: e.entityId,
      field: e.field || null,
      previousValue: e.previousValue || null,
      newValue: e.newValue || null,
      sourceType: e.sourceType,
      sourceId: e.sourceId || null,
      sourceName: e.sourceName || null,
      parentLineageId: e.parentLineageId || null,
      actor: e.actor || "system",
      metadata: e.metadata || null,
    }))
  ).returning();
  return rows.map(r => r.id);
}

// GET /foundry/lineage/:entity/:entityId — trace full lineage for a data point
router.get("/lineage/:entity/:entityId", async (req: Request, res: Response) => {
  try {
    const entity = routeParam(req.params.entity);
    const entityId = routeParam(req.params.entityId);
    const entries = await db
      .select()
      .from(dataLineage)
      .where(and(eq(dataLineage.entity, entity), eq(dataLineage.entityId, entityId)))
      .orderBy(desc(dataLineage.createdAt))
      .limit(100);
    res.json({ entity, entityId, lineage: entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /foundry/lineage/chain/:id — walk upstream from a lineage entry
router.get("/lineage/chain/:id", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    // Walk up the parent chain (max 20 hops to prevent infinite loops)
    const chain: any[] = [];
    let currentId: number | null = id;
    let hops = 0;
    while (currentId && hops < 20) {
      const [entry] = await db.select().from(dataLineage).where(eq(dataLineage.id, currentId));
      if (!entry) break;
      chain.push(entry);
      currentId = entry.parentLineageId;
      hops++;
    }
    res.json({ chain });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// 2. PIPELINE SCHEDULING
// ══════════════════════════════════════════════════════════════════════

// GET /foundry/pipelines — list all pipelines
router.get("/pipelines", async (_req: Request, res: Response) => {
  try {
    const pipelines = await db.select().from(pipelineDefinitions).orderBy(desc(pipelineDefinitions.updatedAt));
    res.json(pipelines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/pipelines — create a pipeline
router.post("/pipelines", async (req: Request, res: Response) => {
  try {
    const { name, description, pipelineType, cronExpression, config } = req.body;
    const [pipeline] = await db.insert(pipelineDefinitions).values({
      name,
      description: description || null,
      pipelineType,
      cronExpression: cronExpression || null,
      config: config || null,
    }).returning();
    res.json(pipeline);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/pipelines/:id/run — manually trigger a pipeline
router.post("/pipelines/:id/run", async (req: Request, res: Response) => {
  try {
    const pipelineId = routeInt(req.params.id);
    const [pipeline] = await db.select().from(pipelineDefinitions).where(eq(pipelineDefinitions.id, pipelineId));
    if (!pipeline) return res.status(404).json({ error: "Pipeline bulunamadi" });

    // Create run record
    const [run] = await db.insert(pipelineRuns).values({
      pipelineId,
      status: "running",
    }).returning();

    // Execute pipeline based on type
    try {
      let recordsProcessed = 0;
      const lineageIds: number[] = [];

      if (pipeline.pipelineType === "health_check") {
        // Run data health checks
        const stockRows = await db.select().from(componentStock);
        const issues: string[] = [];
        for (const row of stockRows) {
          const stock = parseFloat(String(row.currentStock));
          if (!isNaN(stock) && stock < 0) {
            issues.push(`${row.componentCode}: negative stock (${row.currentStock})`);
          }
        }
        recordsProcessed = stockRows.length;
        await db.update(pipelineRuns).set({
          status: "success",
          completedAt: new Date(),
          recordsProcessed,
          metadata: { issues, issueCount: issues.length },
        }).where(eq(pipelineRuns.id, run.id));

      } else if (pipeline.pipelineType === "transform") {
        // Re-compute derived data (stock levels from component_stock)
        const stocks = await db.select().from(componentStock);
        recordsProcessed = stocks.length;

        // Record lineage for the transform
        const lid = await recordLineage({
          entity: "pipeline",
          entityId: String(pipelineId),
          sourceType: "pipeline",
          sourceId: String(run.id),
          sourceName: `Pipeline: ${pipeline.name}`,
          actor: "pipeline",
          metadata: { recordsProcessed },
        });
        lineageIds.push(lid);

        await db.update(pipelineRuns).set({
          status: "success",
          completedAt: new Date(),
          recordsProcessed,
          lineageIds,
        }).where(eq(pipelineRuns.id, run.id));

      } else {
        // Generic: mark as success
        await db.update(pipelineRuns).set({
          status: "success",
          completedAt: new Date(),
          recordsProcessed: 0,
        }).where(eq(pipelineRuns.id, run.id));
      }

      // Update pipeline last run info
      await db.update(pipelineDefinitions).set({
        lastRunAt: new Date(),
        lastStatus: "success",
        updatedAt: new Date(),
      }).where(eq(pipelineDefinitions.id, pipelineId));

      const [updatedRun] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, run.id));
      res.json(updatedRun);
    } catch (execErr: any) {
      await db.update(pipelineRuns).set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: execErr.message,
      }).where(eq(pipelineRuns.id, run.id));
      await db.update(pipelineDefinitions).set({
        lastRunAt: new Date(),
        lastStatus: "failed",
        updatedAt: new Date(),
      }).where(eq(pipelineDefinitions.id, pipelineId));
      res.status(500).json({ error: execErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /foundry/pipelines/:id/runs — list runs for a pipeline
router.get("/pipelines/:id/runs", async (req: Request, res: Response) => {
  try {
    const pipelineId = routeInt(req.params.id);
    const runs = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.pipelineId, pipelineId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(50);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /foundry/pipelines/:id — update pipeline (enable/disable, change schedule)
router.patch("/pipelines/:id", async (req: Request, res: Response) => {
  try {
    const pipelineId = routeInt(req.params.id);
    const { enabled, cronExpression, name, description, config } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (enabled !== undefined) updates.enabled = enabled;
    if (cronExpression !== undefined) updates.cronExpression = cronExpression;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (config !== undefined) updates.config = config;
    const [updated] = await db.update(pipelineDefinitions).set(updates).where(eq(pipelineDefinitions.id, pipelineId)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// 3. DATA VERSIONING — snapshots & rollback
// ══════════════════════════════════════════════════════════════════════

/** Create a snapshot of specified tables */
export async function createSnapshot(
  name: string,
  snapshotType: string,
  tableNames: string[],
  triggeredBy?: string,
): Promise<number> {
  const data: Record<string, any[]> = {};
  let totalRecords = 0;

  for (const table of tableNames) {
    let rows: any[] = [];
    if (table === "component_stock") {
      rows = await db.select().from(componentStock);
    } else if (table === "bom_items") {
      rows = await db.select().from(bomItems);
    } else if (table === "stock_levels") {
      rows = await db.select().from(stockLevels);
    }
    data[table] = rows;
    totalRecords += rows.length;
  }

  const jsonStr = JSON.stringify(data);
  const [snapshot] = await db.insert(dataSnapshots).values({
    name,
    snapshotType,
    tables: tableNames,
    data,
    triggeredBy: triggeredBy || null,
    totalRecords,
    sizeBytes: jsonStr.length,
  }).returning();

  return snapshot.id;
}

// GET /foundry/snapshots — list snapshots
router.get("/snapshots", async (_req: Request, res: Response) => {
  try {
    // Don't return the full data blob in the list — too heavy
    const snapshots = await db.execute(sql`
      SELECT id, name, snapshot_type, tables, triggered_by, created_at, total_records, size_bytes
      FROM data_snapshots ORDER BY created_at DESC LIMIT 50
    `);
    res.json(snapshots.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/snapshots — create a manual snapshot
router.post("/snapshots", async (req: Request, res: Response) => {
  try {
    const { name, tables } = req.body as { name?: string; tables?: string[] };
    const tableNames = tables || ["component_stock", "bom_items"];
    const snapshotId = await createSnapshot(
      name || `Manuel snapshot — ${new Date().toLocaleString("tr-TR")}`,
      "manual",
      tableNames,
      "user",
    );
    const [snapshot] = await db.select().from(dataSnapshots).where(eq(dataSnapshots.id, snapshotId));
    res.json({ id: snapshotId, totalRecords: snapshot.totalRecords, sizeBytes: snapshot.sizeBytes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /foundry/snapshots/:id — get full snapshot data
router.get("/snapshots/:id", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    const [snapshot] = await db.select().from(dataSnapshots).where(eq(dataSnapshots.id, id));
    if (!snapshot) return res.status(404).json({ error: "Snapshot bulunamadi" });
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/snapshots/:id/rollback — restore data from snapshot
router.post("/snapshots/:id/rollback", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    const [snapshot] = await db.select().from(dataSnapshots).where(eq(dataSnapshots.id, id));
    if (!snapshot) return res.status(404).json({ error: "Snapshot bulunamadi" });

    // First, take a snapshot of CURRENT state (safety net)
    const safetyId = await createSnapshot(
      `Rollback oncesi otomatik yedek (snapshot #${id} geri yukleniyor)`,
      "auto_pre_rollback",
      snapshot.tables as string[],
      `rollback_from_${id}`,
    );

    const restored: Record<string, number> = {};
    const snapshotData = snapshot.data as Record<string, any[]>;

    for (const [table, rows] of Object.entries(snapshotData)) {
      if (table === "component_stock" && rows.length > 0) {
        // Delete current, insert snapshot
        await db.delete(componentStock);
        for (const row of rows) {
          await db.insert(componentStock).values(row).onConflictDoNothing();
        }
        restored[table] = rows.length;
      } else if (table === "bom_items" && rows.length > 0) {
        await db.delete(bomItems);
        for (const row of rows) {
          await db.insert(bomItems).values(row).onConflictDoNothing();
        }
        restored[table] = rows.length;
      }
    }

    // Record lineage
    await recordLineage({
      entity: "snapshot",
      entityId: String(id),
      sourceType: "rollback",
      sourceId: String(id),
      sourceName: `Rollback to snapshot: ${snapshot.name}`,
      actor: "user",
      metadata: { restored, safetySnapshotId: safetyId },
    });

    res.json({ ok: true, restored, safetySnapshotId: safetyId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/snapshots/:id/diff — compare snapshot with current state
router.post("/snapshots/:id/diff", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    const [snapshot] = await db.select().from(dataSnapshots).where(eq(dataSnapshots.id, id));
    if (!snapshot) return res.status(404).json({ error: "Snapshot bulunamadi" });

    const diffs: Record<string, { added: number; removed: number; changed: number }> = {};
    const snapshotData = snapshot.data as Record<string, any[]>;

    for (const [table, snapshotRows] of Object.entries(snapshotData)) {
      let currentRows: any[] = [];
      let idField = "id";

      if (table === "component_stock") {
        currentRows = await db.select().from(componentStock);
        idField = "componentCode";
      } else if (table === "bom_items") {
        currentRows = await db.select().from(bomItems);
        idField = "id";
      }

      const snapshotMap = new Map(snapshotRows.map((r: any) => [String(r[idField]), r]));
      const currentMap = new Map(currentRows.map((r: any) => [String(r[idField]), r]));

      let added = 0, removed = 0, changed = 0;
      for (const [key] of currentMap) {
        if (!snapshotMap.has(key)) added++;
        else if (JSON.stringify(currentMap.get(key)) !== JSON.stringify(snapshotMap.get(key))) changed++;
      }
      for (const [key] of snapshotMap) {
        if (!currentMap.has(key)) removed++;
      }

      diffs[table] = { added, removed, changed };
    }

    res.json({ snapshotId: id, snapshotName: snapshot.name, snapshotDate: snapshot.createdAt, diffs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// 4. SCENARIO BRANCHING — persistent what-if branches
// ══════════════════════════════════════════════════════════════════════

// GET /foundry/scenarios — list all scenarios
router.get("/scenarios", async (_req: Request, res: Response) => {
  try {
    const all = await db.select().from(scenarios).orderBy(desc(scenarios.updatedAt));
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/scenarios — create a new scenario
router.post("/scenarios", async (req: Request, res: Response) => {
  try {
    const { name, description, parentScenarioId } = req.body;
    const [scenario] = await db.insert(scenarios).values({
      name,
      description: description || null,
      parentScenarioId: parentScenarioId || null,
    }).returning();
    res.json(scenario);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /foundry/scenarios/:id — get scenario with overrides
router.get("/scenarios/:id", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    if (!scenario) return res.status(404).json({ error: "Senaryo bulunamadi" });
    const overrides = await db.select().from(scenarioOverrides).where(eq(scenarioOverrides.scenarioId, id));
    res.json({ ...scenario, overrides });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/scenarios/:id/overrides — add overrides to a scenario
router.post("/scenarios/:id/overrides", async (req: Request, res: Response) => {
  try {
    const scenarioId = routeInt(req.params.id);
    const overrides = req.body.overrides as Array<{
      entity: string; entityId: string; field: string;
      originalValue?: string; overrideValue: string;
    }>;
    if (!overrides?.length) return res.status(400).json({ error: "overrides dizisi gerekli" });

    const rows = await db.insert(scenarioOverrides).values(
      overrides.map(o => ({
        scenarioId,
        entity: o.entity,
        entityId: o.entityId,
        field: o.field,
        originalValue: o.originalValue || null,
        overrideValue: o.overrideValue,
      }))
    ).returning();

    await db.update(scenarios).set({ updatedAt: new Date() }).where(eq(scenarios.id, scenarioId));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/scenarios/:id/simulate — run what-if with scenario overrides
router.post("/scenarios/:id/simulate", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    if (!scenario) return res.status(404).json({ error: "Senaryo bulunamadi" });

    const overrides = await db.select().from(scenarioOverrides).where(eq(scenarioOverrides.scenarioId, id));

    // Get the SKU from request or default
    const sku = (req.body.sku as string) || "ELT.7-11";
    const whatIfScenarios: WhatIfScenario[] = overrides
      .filter(o => o.field === "quantity")
      .map(o => ({
        type: "restock_component",
        componentCode: o.entityId,
        quantity: parseInt(o.overrideValue, 10) || 0,
      }));
    const result = await Promise.all(
      whatIfScenarios.map(scenario => simulateWhatIf(scenario, sku)),
    );

    // Cache result
    await db.update(scenarios).set({
      simulationResult: result as any,
      updatedAt: new Date(),
    }).where(eq(scenarios.id, id));

    res.json({ scenario: scenario.name, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/scenarios/:id/apply — apply scenario overrides to real data
router.post("/scenarios/:id/apply", async (req: Request, res: Response) => {
  try {
    const id = routeInt(req.params.id);
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    if (!scenario) return res.status(404).json({ error: "Senaryo bulunamadi" });

    // Safety: snapshot before applying
    const snapshotId = await createSnapshot(
      `Senaryo uygulama oncesi: ${scenario.name}`,
      "auto_pre_scenario",
      ["component_stock", "bom_items"],
      `scenario_${id}`,
    );

    const overrides = await db.select().from(scenarioOverrides).where(eq(scenarioOverrides.scenarioId, id));
    let applied = 0;

    for (const o of overrides) {
      if (o.entity === "component_stock" && (o.field === "quantity" || o.field === "currentStock")) {
        await db.update(componentStock)
          .set({ currentStock: String(parseFloat(o.overrideValue) || 0) })
          .where(eq(componentStock.componentCode, o.entityId));
        applied++;

        await recordLineage({
          entity: o.entity,
          entityId: o.entityId,
          field: o.field,
          previousValue: o.originalValue,
          newValue: o.overrideValue,
          sourceType: "scenario",
          sourceId: String(id),
          sourceName: `Senaryo uygulandı: ${scenario.name}`,
          actor: "user",
        });
      }
    }

    // Mark scenario as applied
    await db.update(scenarios).set({ status: "applied", updatedAt: new Date() }).where(eq(scenarios.id, id));

    // WS broadcast — tüm client'lar component_stock değişikliğini görsün,
    // orchestrator otomatik audit tetiklesin
    if (applied > 0) {
      broadcastEntityChanged({
        event: "entity_changed",
        entities: ["component_stock"],
        count: applied,
        source: `scenario_apply_${id}`,
      });
    }

    res.json({ ok: true, applied, snapshotId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /foundry/scenarios/compare — compare two scenarios
router.post("/scenarios/compare", async (req: Request, res: Response) => {
  try {
    const { scenarioIds } = req.body as { scenarioIds: number[] };
    if (!scenarioIds || scenarioIds.length < 2) {
      return res.status(400).json({ error: "En az 2 senaryo ID'si gerekli" });
    }

    const results = [];
    for (const id of scenarioIds) {
      const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
      const overrides = await db.select().from(scenarioOverrides).where(eq(scenarioOverrides.scenarioId, id));
      results.push({
        id,
        name: scenario?.name,
        status: scenario?.status,
        overrideCount: overrides.length,
        overrides,
        simulationResult: scenario?.simulationResult,
      });
    }

    res.json({ comparison: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// 6. LINEAGE GRAPH — Live pipeline stats for SDDI canvas
// ══════════════════════════════════════════════════════════════════════

router.get("/lineage/graph/stats", async (_req: Request, res: Response) => {
  try {
    // Table record counts + last update
    const tables = [
      "products", "bom_items", "component_stock", "sales_history",
      "stock_movements_v2", "seasonal_indices", "validation_alerts",
      "purchase_suggestions", "custom_rules", "audit_log",
      "outcome_tracking", "token_metrics", "agent_memory",
      "data_lineage", "pipeline_definitions", "pipeline_runs",
      "data_snapshots", "scenarios", "production_plans",
      "chat_sessions", "chat_messages", "tenant_profiles",
    ];

    const stats: Record<string, { count: number; lastUpdate: string | null }> = {};

    for (const table of tables) {
      try {
        const countResult = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM ${sql.identifier(table)}`);
        const lastResult = await db.execute(
          sql`SELECT MAX(COALESCE(updated_at, created_at, imported_at)) as last_ts FROM ${sql.identifier(table)}`
        ).catch(() => ({ rows: [{ last_ts: null }] }));
        stats[table] = {
          count: (countResult.rows[0] as any)?.cnt ?? 0,
          lastUpdate: (lastResult.rows[0] as any)?.last_ts ?? null,
        };
      } catch {
        stats[table] = { count: 0, lastUpdate: null };
      }
    }

    // Lineage flow stats: group by source_type
    const flowStats = await db.execute(sql`
      SELECT source_type, COUNT(*)::int as cnt, MAX(created_at) as last_ts
      FROM data_lineage
      GROUP BY source_type
      ORDER BY cnt DESC
    `);

    // Pipeline health
    const pipelineHealth = await db.execute(sql`
      SELECT pd.name, pd.pipeline_type, pd.enabled, pd.last_status,
             pd.last_run_at, pr.records_processed, pr.records_failed
      FROM pipeline_definitions pd
      LEFT JOIN pipeline_runs pr ON pr.pipeline_id = pd.id
        AND pr.id = (SELECT MAX(id) FROM pipeline_runs WHERE pipeline_id = pd.id)
      ORDER BY pd.id
    `);

    res.json({
      tables: stats,
      flows: flowStats.rows,
      pipelines: pipelineHealth.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
