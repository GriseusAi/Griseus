// ═══════════════════════════════════════════════════════════
// DECISION LOOP — FAZ 3 (2026-04-27)
//
// Palantir Foundry decision capture: structured records with rationale,
// alternatives, predicted outcomes. Closed loop:
//   scenario → decision → opportunity → work_order → outcome verification.
//
// Mode: live (writes records, broadcasts WS, audit log).
// ═══════════════════════════════════════════════════════════

import { db } from "../db";
import { decisions, opportunities, workOrders } from "@shared/schema";
import { eq, and, lt, isNull, isNotNull, desc } from "drizzle-orm";
import { z } from "zod";

const Alternative = z.object({
  title: z.string(),
  predictedValue: z.number().optional(),
  predictedCost: z.number().optional(),
  reason_rejected: z.string().optional(),
});

export const CreateDecisionInput = z.object({
  tenantId: z.string().default("cukurova"),
  decisionType: z.enum(["purchase", "production_change", "maintenance", "scrap_reduction", "scenario_apply", "manual"]),
  title: z.string(),
  rationale: z.string(),
  alternativesConsidered: z.array(Alternative).default([]),
  predictedValue: z.number().optional(),
  predictedMetricImpact: z.record(z.number()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceScenarioId: z.number().optional(),
  sourcePipelineRunId: z.number().optional(),
  sourceEngine: z.string().optional(),
  proposedBy: z.string().default("agent"),
  deadline: z.string().optional(),  // ISO date
});
export type CreateDecisionInput = z.infer<typeof CreateDecisionInput>;

export async function createDecision(input: CreateDecisionInput): Promise<number> {
  const parsed = CreateDecisionInput.parse(input);
  const [row] = await db.insert(decisions).values({
    tenantId: parsed.tenantId,
    decisionType: parsed.decisionType,
    title: parsed.title,
    rationale: parsed.rationale,
    alternativesConsidered: parsed.alternativesConsidered,
    predictedValue: parsed.predictedValue?.toString(),
    predictedMetricImpact: parsed.predictedMetricImpact,
    confidence: parsed.confidence?.toString(),
    sourceScenarioId: parsed.sourceScenarioId,
    sourcePipelineRunId: parsed.sourcePipelineRunId,
    sourceEngine: parsed.sourceEngine,
    proposedBy: parsed.proposedBy,
    deadline: parsed.deadline ? new Date(parsed.deadline) : null,
  }).returning();
  return row!.id;
}

export async function approveDecision(decisionId: number, by: string): Promise<void> {
  await db.update(decisions).set({
    status: "approved", approvedBy: by, approvedAt: new Date(), updatedAt: new Date(),
  }).where(eq(decisions.id, decisionId));
}

export async function rejectDecision(decisionId: number, reason: string, by: string): Promise<void> {
  await db.update(decisions).set({
    status: "rejected", approvedBy: by, approvedAt: new Date(),
    outcomeNotes: reason, updatedAt: new Date(),
  }).where(eq(decisions.id, decisionId));
}

// ── Scenario → Opportunity ──

export const PromoteScenarioInput = z.object({
  scenarioId: z.number().optional(),
  pipelineRunId: z.number().optional(),
  decisionId: z.number().optional(),
  title: z.string(),
  description: z.string().optional(),
  category: z.enum(["throughput", "scrap_reduction", "energy", "inventory", "quality"]),
  projectedValue: z.number().optional(),
  projectedMetricImpact: z.record(z.number()).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  deadline: z.string().optional(),
});
export type PromoteScenarioInput = z.infer<typeof PromoteScenarioInput>;

export async function createOpportunityFromSource(input: PromoteScenarioInput): Promise<number> {
  const parsed = PromoteScenarioInput.parse(input);
  const [row] = await db.insert(opportunities).values({
    scenarioId: parsed.scenarioId,
    title: parsed.title,
    description: parsed.description,
    category: parsed.category,
    projectedValue: parsed.projectedValue?.toString(),
    projectedMetricImpact: parsed.projectedMetricImpact,
    priority: parsed.priority,
    status: "identified",
    deadline: parsed.deadline ? new Date(parsed.deadline) : null,
    linkedDecisionId: parsed.decisionId,
  }).returning();
  if (parsed.decisionId) {
    await db.update(decisions).set({
      linkedOpportunityId: row!.id, updatedAt: new Date(),
    }).where(eq(decisions.id, parsed.decisionId));
  }
  return row!.id;
}

// ── Opportunity → Work Order ──

export const PromoteOpportunityInput = z.object({
  opportunityId: z.number(),
  type: z.enum(["production", "maintenance", "purchase", "quality", "setup_change"]),
  code: z.string().optional(),  // auto-generated if missing
  description: z.string().optional(),
  assigneeId: z.number().optional(),
  targetMachineId: z.number().optional(),
  targetLineId: z.number().optional(),
  dueDate: z.string().optional(),
});
export type PromoteOpportunityInput = z.infer<typeof PromoteOpportunityInput>;

export async function createWorkOrderFromOpportunity(input: PromoteOpportunityInput): Promise<number> {
  const parsed = PromoteOpportunityInput.parse(input);
  const code = parsed.code ?? `WO-${Date.now()}`;
  const [row] = await db.insert(workOrders).values({
    opportunityId: parsed.opportunityId,
    code,
    type: parsed.type,
    description: parsed.description,
    assigneeId: parsed.assigneeId,
    targetMachineId: parsed.targetMachineId,
    targetLineId: parsed.targetLineId,
    dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
    status: "open",
  }).returning();
  // Update opportunity to in_progress
  await db.update(opportunities).set({ status: "in_progress" })
    .where(eq(opportunities.id, parsed.opportunityId));
  return row!.id;
}

// ── Work Order completion + outcome verification ──

export const CompleteWorkOrderInput = z.object({
  workOrderId: z.number(),
  actualValue: z.number().optional(),
  completionProof: z.string().optional(),
  notes: z.string().optional(),
});
export type CompleteWorkOrderInput = z.infer<typeof CompleteWorkOrderInput>;

export async function completeWorkOrder(input: CompleteWorkOrderInput): Promise<{ workOrderId: number; opportunityId: number | null; decisionId: number | null }> {
  const parsed = CompleteWorkOrderInput.parse(input);
  const [wo] = await db.update(workOrders).set({
    status: "completed",
    completedAt: new Date(),
    actualValue: parsed.actualValue?.toString(),
    completionProof: parsed.completionProof,
  }).where(eq(workOrders.id, parsed.workOrderId)).returning();

  let decisionId: number | null = null;
  if (wo?.opportunityId) {
    const [opp] = await db.update(opportunities).set({
      status: "completed",
    }).where(eq(opportunities.id, wo.opportunityId)).returning();
    decisionId = opp?.linkedDecisionId ?? null;

    // Verify outcome on linked decision
    if (decisionId && parsed.actualValue != null) {
      const [dec] = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
      if (dec) {
        const predicted = Number(dec.predictedValue ?? 0);
        const actual = parsed.actualValue;
        const diff = predicted === 0 ? Math.abs(actual) : Math.abs((actual - predicted) / predicted);
        const status = diff <= 0.10 ? "verified_correct"
                     : diff <= 0.30 ? "verified_partial"
                     : "verified_wrong";
        await db.update(decisions).set({
          actualValue: actual.toString(),
          outcomeStatus: status,
          outcomeVerifiedAt: new Date(),
          outcomeNotes: parsed.notes ?? `Predicted ${predicted}, actual ${actual}, diff ${(diff * 100).toFixed(1)}%`,
          updatedAt: new Date(),
        }).where(eq(decisions.id, decisionId));
      }
    }
  }

  return { workOrderId: parsed.workOrderId, opportunityId: wo?.opportunityId ?? null, decisionId };
}

// ── Auto-verify expired deadlines (nightly cron candidate) ──

export async function autoVerifyExpiredDeadlines(): Promise<{ checked: number; expired: number }> {
  const now = new Date();
  // Decisions with deadline passed and still proposed
  const expiredDecisions = await db.select().from(decisions)
    .where(and(
      eq(decisions.status, "proposed"),
      lt(decisions.deadline, now),
      isNotNull(decisions.deadline),
    ));
  for (const d of expiredDecisions) {
    await db.update(decisions).set({
      status: "expired",
      outcomeNotes: "Deadline geçti, decision execute edilmedi",
      updatedAt: new Date(),
    }).where(eq(decisions.id, d.id));
  }
  return { checked: expiredDecisions.length, expired: expiredDecisions.length };
}

// ── Loop report — kazanan/kaybeden öneriler ──

export interface LoopReport {
  totalDecisions: number;
  byStatus: Record<string, number>;
  byOutcome: Record<string, number>;
  totalPredictedValue: number;
  totalActualValue: number;
  realizationRate: number;  // actual / predicted
  recentVerified: Array<{
    id: number; title: string;
    predicted: number; actual: number; outcomeStatus: string; verifiedAt: Date | null;
  }>;
}

export async function getLoopReport(): Promise<LoopReport> {
  const allDecisions = await db.select().from(decisions);
  const byStatus: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  let totalPredicted = 0, totalActual = 0;
  for (const d of allDecisions) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    if (d.outcomeStatus) byOutcome[d.outcomeStatus] = (byOutcome[d.outcomeStatus] ?? 0) + 1;
    if (d.predictedValue) totalPredicted += Number(d.predictedValue);
    if (d.actualValue) totalActual += Number(d.actualValue);
  }
  const verified = await db.select().from(decisions)
    .where(isNotNull(decisions.outcomeVerifiedAt))
    .orderBy(desc(decisions.outcomeVerifiedAt))
    .limit(10);

  return {
    totalDecisions: allDecisions.length,
    byStatus,
    byOutcome,
    totalPredictedValue: totalPredicted,
    totalActualValue: totalActual,
    realizationRate: totalPredicted > 0 ? totalActual / totalPredicted : 0,
    recentVerified: verified.map(v => ({
      id: v.id, title: v.title,
      predicted: Number(v.predictedValue ?? 0),
      actual: Number(v.actualValue ?? 0),
      outcomeStatus: v.outcomeStatus ?? "pending",
      verifiedAt: v.outcomeVerifiedAt,
    })),
  };
}

// ── List helpers ──

export async function listDecisions(opts: { status?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = opts.status
    ? await db.select().from(decisions).where(eq(decisions.status, opts.status)).limit(limit)
    : await db.select().from(decisions).limit(limit);
  return rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function listOpportunities(opts: { status?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = opts.status
    ? await db.select().from(opportunities).where(eq(opportunities.status, opts.status)).limit(limit)
    : await db.select().from(opportunities).limit(limit);
  return rows;
}

export async function listWorkOrders(opts: { status?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = opts.status
    ? await db.select().from(workOrders).where(eq(workOrders.status, opts.status)).limit(limit)
    : await db.select().from(workOrders).limit(limit);
  return rows;
}
