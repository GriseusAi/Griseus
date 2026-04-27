import { Router } from "express";
import { computeDailyVariance, getDashboard, getOpenAlerts, acknowledgeAlert, type Metric, type EntityType } from "../lib/twin-health";

const router = Router();

// POST /api/twin-health/compute — trigger variance compute for a day (default: yesterday)
router.post("/compute", async (req, res) => {
  try {
    const day = req.body?.day ? new Date(req.body.day) : undefined;
    const result = await computeDailyVariance({ day });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/twin-health/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const metric = typeof req.query.metric === "string" ? req.query.metric as Metric : undefined;
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType as EntityType : undefined;
    const days = req.query.days ? Number(req.query.days) : 30;
    const data = await getDashboard({ metric, entityType, days });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/twin-health/heatmap — pivot of variance% by entity × date
router.get("/heatmap", async (req, res) => {
  try {
    const metric = typeof req.query.metric === "string" ? req.query.metric as Metric : "throughput";
    const days = req.query.days ? Number(req.query.days) : 14;
    const { rows } = await getDashboard({ metric, days });
    // Build entity × day matrix
    const entitySet = new Set<string>();
    const daySet = new Set<string>();
    const map = new Map<string, Map<string, { variance: number; status: string }>>();
    for (const r of rows) {
      const eid = `${r.entityType}:${r.entityId}`;
      const day = r.bucketDate.toISOString().slice(0, 10);
      entitySet.add(eid); daySet.add(day);
      if (!map.has(eid)) map.set(eid, new Map());
      map.get(eid)!.set(day, {
        variance: Number(r.variancePercent ?? 0),
        status: r.driftStatus ?? "ok",
      });
    }
    const entities = Array.from(entitySet).sort();
    const days_ = Array.from(daySet).sort();
    const matrix = entities.map(e => ({
      entity: e,
      cells: days_.map(d => map.get(e)?.get(d) ?? null),
    }));
    res.json({ metric, days: days_, entities, matrix });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/twin-health/drift-alerts
router.get("/drift-alerts", async (_req, res) => {
  try {
    const alerts = await getOpenAlerts();
    res.json({ alerts, count: alerts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/twin-health/drift-alerts/:id/acknowledge
router.post("/drift-alerts/:id/acknowledge", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const by = req.body?.actor ?? "user";
    await acknowledgeAlert(id, by);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
