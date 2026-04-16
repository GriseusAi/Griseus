/**
 * Orchestrator API — manual trigger, run history, latest status
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { orchestratorRuns } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { runOctopusChainAudit } from "../lib/orchestrator";

const router = Router();

/** POST /api/orchestrator/run-audit — manuel tetik */
router.post("/run-audit", async (req: Request, res: Response) => {
  try {
    const detail = (req.body?.detail as string) ?? "manual";
    const result = await runOctopusChainAudit("manual", detail);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/orchestrator/runs?limit=20 — son N audit */
router.get("/runs", async (req: Request, res: Response) => {
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "20", 10));
  const runs = await db.select().from(orchestratorRuns)
    .orderBy(desc(orchestratorRuns.timestamp)).limit(limit);
  res.json(runs);
});

/** GET /api/orchestrator/latest — en son audit */
router.get("/latest", async (req: Request, res: Response) => {
  const [latest] = await db.select().from(orchestratorRuns)
    .orderBy(desc(orchestratorRuns.timestamp)).limit(1);
  if (!latest) return res.status(404).json({ error: "Henüz hiç audit çalışmadı" });
  res.json(latest);
});

/** GET /api/orchestrator/runs/:id — tek run detayı */
router.get("/runs/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const [run] = await db.select().from(orchestratorRuns).where(eq(orchestratorRuns.id, id));
  if (!run) return res.status(404).json({ error: "Run bulunamadı" });
  res.json(run);
});

export default router;
