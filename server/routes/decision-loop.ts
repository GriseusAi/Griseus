import { Router } from "express";
import {
  createDecision, approveDecision, rejectDecision,
  createOpportunityFromSource, createWorkOrderFromOpportunity, completeWorkOrder,
  autoVerifyExpiredDeadlines, getLoopReport,
  listDecisions, listOpportunities, listWorkOrders,
  CreateDecisionInput, PromoteScenarioInput, PromoteOpportunityInput, CompleteWorkOrderInput,
} from "../lib/decision-loop";

const router = Router();

// ── Decisions ──
router.post("/decisions", async (req, res) => {
  try {
    const input = CreateDecisionInput.parse(req.body);
    const id = await createDecision(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/decisions", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const rows = await listDecisions({ status, limit });
    res.json({ decisions: rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/decisions/:id/approve", async (req, res) => {
  try {
    const by = req.body?.actor ?? "user";
    await approveDecision(Number(req.params.id), by);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/decisions/:id/reject", async (req, res) => {
  try {
    const reason = req.body?.reason ?? "no reason";
    const by = req.body?.actor ?? "user";
    await rejectDecision(Number(req.params.id), reason, by);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Opportunities ──
router.post("/opportunities", async (req, res) => {
  try {
    const input = PromoteScenarioInput.parse(req.body);
    const id = await createOpportunityFromSource(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/opportunities", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await listOpportunities({ status });
    res.json({ opportunities: rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Work Orders ──
router.post("/work-orders", async (req, res) => {
  try {
    const input = PromoteOpportunityInput.parse(req.body);
    const id = await createWorkOrderFromOpportunity(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/work-orders", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await listWorkOrders({ status });
    res.json({ workOrders: rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/work-orders/:id/complete", async (req, res) => {
  try {
    const input = CompleteWorkOrderInput.parse({ ...req.body, workOrderId: Number(req.params.id) });
    const result = await completeWorkOrder(input);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Loop report ──
router.get("/report", async (_req, res) => {
  try {
    const report = await getLoopReport();
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/auto-verify-expired", async (_req, res) => {
  try {
    const result = await autoVerifyExpiredDeadlines();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
