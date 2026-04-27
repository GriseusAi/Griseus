import { Router } from "express";
import {
  createOpsAlert, acknowledgeOpsAlert, resolveOpsAlert,
  autoEscalateOpenAlerts, syncDriftAlertsToOps,
  getTierDashboard, getProcessFlow, listOpsAlerts, getPlantManagerSummary,
  CreateOpsAlertInput,
} from "../lib/ops-monitoring";

const router = Router();

router.post("/alerts", async (req, res) => {
  try {
    const input = CreateOpsAlertInput.parse(req.body);
    const id = await createOpsAlert(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/alerts", async (req, res) => {
  try {
    const tier = typeof req.query.tier === "string" ? req.query.tier as any : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const rows = await listOpsAlerts({ tier, status, limit });
    res.json({ alerts: rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/alerts/:id/acknowledge", async (req, res) => {
  try {
    await acknowledgeOpsAlert(Number(req.params.id), req.body?.actor ?? "user");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/alerts/:id/resolve", async (req, res) => {
  try {
    await resolveOpsAlert(Number(req.params.id), req.body?.actor ?? "user", req.body?.notes);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tier = (typeof req.query.tier === "string" ? req.query.tier : "operator") as any;
    const data = await getTierDashboard(tier);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/plant-summary", async (_req, res) => {
  try {
    const data = await getPlantManagerSummary();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/process-flow", async (req, res) => {
  try {
    const lineId = req.query.lineId ? Number(req.query.lineId) : 1;
    const data = await getProcessFlow(lineId);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/auto-escalate", async (_req, res) => {
  try {
    const result = await autoEscalateOpenAlerts();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/sync-drift-alerts", async (_req, res) => {
  try {
    const result = await syncDriftAlertsToOps();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
