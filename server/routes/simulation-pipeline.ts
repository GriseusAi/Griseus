import { Router } from "express";
import { runSimulationPipeline, getPipelineRun, listPipelineRuns, PipelineRequest } from "../lib/simulation-pipeline";

const router = Router();

// POST /api/pipeline/run — trigger a new pipeline run
router.post("/run", async (req, res) => {
  try {
    const parsed = PipelineRequest.parse(req.body ?? {});
    const runId = await runSimulationPipeline(parsed);
    const run = await getPipelineRun(runId);
    res.json({ runId, run });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
});

// GET /api/pipeline/runs — list recent runs (optional ?sku=)
router.get("/runs", async (req, res) => {
  try {
    const sku = typeof req.query.sku === "string" ? req.query.sku : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const runs = await listPipelineRuns({ sku, limit });
    res.json({ runs, count: runs.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/runs/:id — single run with full step trace
router.get("/runs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const run = await getPipelineRun(id);
    if (!run) return res.status(404).json({ error: "not found" });
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
