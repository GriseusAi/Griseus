// ═══════════════════════════════════════════════════════════
// OPERATIONS MONITORING — FAZ 4 (2026-04-27)
//
// Vertex tier pattern: operator → supervisor → plant_manager.
// Auto-escalation rules:
//   operator → supervisor: 30 minutes unresolved
//   supervisor → plant_manager: 2 hours unresolved
//
// Aggregates from: twin_health drift_alerts, rules_engine, pipeline, manual sources.
// Process flow data: line → workCenters → machines → live status.
// ═══════════════════════════════════════════════════════════

import { db } from "../db";
import {
  opsAlerts, productionLines, workCenters, machines, operators,
  productionRuns, downtimeEpisodes, qualityEvents, driftAlerts,
} from "@shared/schema";
import { eq, and, lt, isNull, isNotNull, desc, gte, sql } from "drizzle-orm";
import { z } from "zod";

const SLA_OPERATOR_MINUTES = 30;
const SLA_SUPERVISOR_HOURS = 2;
const TIER_ORDER = ["operator", "supervisor", "plant_manager"] as const;
type Tier = typeof TIER_ORDER[number];

export const CreateOpsAlertInput = z.object({
  source: z.enum(["twin_health", "rules_engine", "pipeline", "impact", "manual"]),
  sourceAlertId: z.number().optional(),
  entityType: z.enum(["line", "machine", "product", "run", "shift"]).optional(),
  entityId: z.string().optional(),
  metric: z.string().optional(),
  tier: z.enum(["operator", "supervisor", "plant_manager"]).default("operator"),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  message: z.string().optional(),
  recommendedAction: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type CreateOpsAlertInput = z.infer<typeof CreateOpsAlertInput>;

export async function createOpsAlert(input: CreateOpsAlertInput): Promise<number> {
  const parsed = CreateOpsAlertInput.parse(input);
  const [row] = await db.insert(opsAlerts).values({
    source: parsed.source,
    sourceAlertId: parsed.sourceAlertId,
    entityType: parsed.entityType, entityId: parsed.entityId, metric: parsed.metric,
    tier: parsed.tier, severity: parsed.severity,
    title: parsed.title, message: parsed.message, recommendedAction: parsed.recommendedAction,
    tags: parsed.tags,
  }).returning();
  return row!.id;
}

export async function acknowledgeOpsAlert(id: number, by: string): Promise<void> {
  await db.update(opsAlerts).set({
    status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: by,
  }).where(eq(opsAlerts.id, id));
}

export async function resolveOpsAlert(id: number, by: string, notes?: string): Promise<void> {
  await db.update(opsAlerts).set({
    status: "resolved", resolvedAt: new Date(), resolvedBy: by, resolutionNotes: notes,
  }).where(eq(opsAlerts.id, id));
}

// ── Escalation: nightly cron / interval-driven ──

export async function autoEscalateOpenAlerts(): Promise<{ escalated: number; details: any[] }> {
  const now = new Date();
  const operatorCutoff = new Date(now.getTime() - SLA_OPERATOR_MINUTES * 60 * 1000);
  const supervisorCutoff = new Date(now.getTime() - SLA_SUPERVISOR_HOURS * 60 * 60 * 1000);

  const candidates = await db.select().from(opsAlerts).where(eq(opsAlerts.status, "open"));
  const details: any[] = [];

  for (const alert of candidates) {
    let nextTier: Tier | null = null;
    let cutoffMet = false;

    if (alert.tier === "operator" && alert.raisedAt < operatorCutoff) {
      nextTier = "supervisor"; cutoffMet = true;
    } else if (alert.tier === "supervisor" && (alert.lastEscalatedAt ?? alert.raisedAt) < supervisorCutoff) {
      nextTier = "plant_manager"; cutoffMet = true;
    }

    if (!nextTier || !cutoffMet) continue;

    const reason = nextTier === "supervisor"
      ? `Operator tier'da ${SLA_OPERATOR_MINUTES} dk içinde resolve edilmedi`
      : `Supervisor tier'da ${SLA_SUPERVISOR_HOURS} saat içinde resolve edilmedi`;

    const history = (alert.escalationHistory ?? []) as Array<any>;
    history.push({ fromTier: alert.tier, toTier: nextTier, at: now.toISOString(), reason });

    await db.update(opsAlerts).set({
      tier: nextTier,
      escalationCount: alert.escalationCount + 1,
      lastEscalatedAt: now,
      escalationHistory: history,
    }).where(eq(opsAlerts.id, alert.id));

    details.push({ id: alert.id, fromTier: alert.tier, toTier: nextTier, reason });
  }

  return { escalated: details.length, details };
}

// ── Sync drift_alerts → ops_alerts (one-way bridge) ──

export async function syncDriftAlertsToOps(): Promise<{ created: number }> {
  // Find drift alerts not yet mirrored
  const existing = await db.select({ sourceAlertId: opsAlerts.sourceAlertId })
    .from(opsAlerts).where(eq(opsAlerts.source, "twin_health"));
  const known = new Set(existing.map(e => e.sourceAlertId).filter(Boolean));

  const drifts = await db.select().from(driftAlerts).where(eq(driftAlerts.status, "open"));
  let created = 0;

  for (const d of drifts) {
    if (known.has(d.id)) continue;
    await createOpsAlert({
      source: "twin_health",
      sourceAlertId: d.id,
      entityType: d.entityType as any,
      entityId: d.entityId,
      metric: d.metric,
      tier: "operator",  // start at operator tier
      severity: d.severity as any,
      title: `Twin drift: ${d.metric} ${d.entityType}:${d.entityId}`,
      message: d.message ?? undefined,
      recommendedAction: d.recommendedAction ?? undefined,
      tags: ["twin_health", "drift"],
    });
    created++;
  }
  return { created };
}

// ── Tier dashboards ──

export interface TierDashboard {
  tier: Tier;
  openCount: number;
  acknowledgedCount: number;
  resolvedToday: number;
  byEntity: Array<{ entity: string; count: number }>;
  bySeverity: Record<string, number>;
  recentAlerts: any[];
}

export async function getTierDashboard(tier: Tier): Promise<TierDashboard> {
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);

  const open = await db.select().from(opsAlerts).where(and(eq(opsAlerts.tier, tier), eq(opsAlerts.status, "open")));
  const acknowledged = await db.select().from(opsAlerts).where(and(eq(opsAlerts.tier, tier), eq(opsAlerts.status, "acknowledged")));
  const resolvedToday = await db.select().from(opsAlerts).where(and(
    eq(opsAlerts.tier, tier), eq(opsAlerts.status, "resolved"), gte(opsAlerts.resolvedAt, todayStart),
  ));

  const byEntityMap = new Map<string, number>();
  const bySeverity: Record<string, number> = { info: 0, warning: 0, critical: 0 };
  for (const a of [...open, ...acknowledged]) {
    const eKey = a.entityType && a.entityId ? `${a.entityType}:${a.entityId}` : "unassigned";
    byEntityMap.set(eKey, (byEntityMap.get(eKey) ?? 0) + 1);
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
  }

  const recent = await db.select().from(opsAlerts)
    .where(eq(opsAlerts.tier, tier))
    .orderBy(desc(opsAlerts.raisedAt))
    .limit(20);

  return {
    tier,
    openCount: open.length,
    acknowledgedCount: acknowledged.length,
    resolvedToday: resolvedToday.length,
    byEntity: Array.from(byEntityMap.entries()).sort((a, b) => b[1] - a[1]).map(([entity, count]) => ({ entity, count })),
    bySeverity,
    recentAlerts: recent,
  };
}

// ── Process flow (P&ID-equivalent) data shaper ──

export interface ProcessFlowNode {
  id: string;  // line:1, wc:1, machine:1
  type: "line" | "work_center" | "machine";
  label: string;
  status: "active" | "running" | "down" | "idle" | "maintenance";
  metrics?: Record<string, number | string>;
  children?: ProcessFlowNode[];
  alertCount?: number;
}

export async function getProcessFlow(lineId: number): Promise<{ line: ProcessFlowNode | null }> {
  const [line] = await db.select().from(productionLines).where(eq(productionLines.id, lineId)).limit(1);
  if (!line) return { line: null };

  const wcs = await db.select().from(workCenters).where(eq(workCenters.lineId, lineId));
  const allMachines = wcs.length > 0
    ? await db.select().from(machines)  // filter in memory below
    : [];

  // Active alerts per entity
  const lineAlerts = await db.select().from(opsAlerts).where(and(
    eq(opsAlerts.entityType, "line"), eq(opsAlerts.entityId, String(lineId)), eq(opsAlerts.status, "open"),
  ));

  const nodes: ProcessFlowNode[] = wcs
    .sort((a, b) => (a.stationOrder ?? 0) - (b.stationOrder ?? 0))
    .map(wc => {
      const wcMachines = allMachines.filter(m => m.workCenterId === wc.id);
      return {
        id: `wc:${wc.id}`,
        type: "work_center",
        label: wc.name,
        status: wc.status as any ?? "active",
        metrics: { capacityPerHour: Number(wc.capacityPerHour ?? 0), stationOrder: wc.stationOrder ?? 0 },
        children: wcMachines.map(m => ({
          id: `machine:${m.id}`,
          type: "machine" as const,
          label: m.name,
          status: m.status as any ?? "active",
          metrics: { cycleTimeSec: Number(m.expectedCycleTimeSec ?? 0) },
        })),
      };
    });

  return {
    line: {
      id: `line:${line.id}`,
      type: "line",
      label: line.name,
      status: line.status as any ?? "active",
      metrics: {
        currentCycleMin: Number(line.currentUnitTimeMin ?? 0),
        workerCount: line.workerCount ?? 0,
      },
      children: nodes,
      alertCount: lineAlerts.length,
    },
  };
}

// ── List helpers ──

export async function listOpsAlerts(opts: { tier?: Tier; status?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions: any[] = [];
  if (opts.tier) conditions.push(eq(opsAlerts.tier, opts.tier));
  if (opts.status) conditions.push(eq(opsAlerts.status, opts.status));
  const rows = conditions.length > 0
    ? await db.select().from(opsAlerts).where(and(...conditions)).orderBy(desc(opsAlerts.raisedAt)).limit(limit)
    : await db.select().from(opsAlerts).orderBy(desc(opsAlerts.raisedAt)).limit(limit);
  return rows;
}

// ── Cross-tier rollup for plant manager ──

export async function getPlantManagerSummary(): Promise<{
  byTier: Record<Tier, { open: number; acknowledged: number }>;
  totalOpen: number;
  byMetric: Record<string, number>;
  criticalAlerts: any[];
}> {
  const all = await db.select().from(opsAlerts).where(
    sql`${opsAlerts.status} IN ('open', 'acknowledged')`
  );
  const byTier: any = { operator: { open: 0, acknowledged: 0 }, supervisor: { open: 0, acknowledged: 0 }, plant_manager: { open: 0, acknowledged: 0 } };
  const byMetric: Record<string, number> = {};
  for (const a of all) {
    if (a.tier in byTier) {
      byTier[a.tier][a.status === "open" ? "open" : "acknowledged"]++;
    }
    if (a.metric) byMetric[a.metric] = (byMetric[a.metric] ?? 0) + 1;
  }
  const criticalAlerts = all.filter(a => a.severity === "critical").slice(0, 10);
  return { byTier, totalOpen: all.length, byMetric, criticalAlerts };
}
