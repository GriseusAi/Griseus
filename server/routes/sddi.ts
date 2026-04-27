import { Router } from "express";
import {
  createConnector, listConnectors, listConnectorRuns,
  runConnector, suggestFieldMappings, approveFieldMapping, listFieldMappings,
  CreateConnectorInput,
} from "../lib/sddi-connector";

const router = Router();

router.get("/connectors", async (_req, res) => {
  try { res.json({ connectors: await listConnectors() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/connectors", async (req, res) => {
  try {
    const input = CreateConnectorInput.parse(req.body);
    const id = await createConnector(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post("/connectors/:id/run", async (req, res) => {
  try {
    const trigger = (req.body?.trigger ?? "manual") as any;
    const runId = await runConnector(Number(req.params.id), trigger);
    res.json({ runId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/connectors/:id/runs", async (req, res) => {
  try { res.json({ runs: await listConnectorRuns(Number(req.params.id)) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/connectors/:id/suggest-mappings", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const sourceFields = req.body?.sourceFields ?? [];
    const targetTable = req.body?.targetTable ?? "products";
    const mappings = await suggestFieldMappings(id, sourceFields, targetTable);
    res.json({ mappings });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/connectors/:id/approve-mapping", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { sourceField, targetField, confidence, actor } = req.body ?? {};
    const mid = await approveFieldMapping(id, sourceField, targetField, confidence ?? 1, actor ?? "user");
    res.json({ mappingId: mid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/connectors/:id/mappings", async (req, res) => {
  try { res.json({ mappings: await listFieldMappings(Number(req.params.id)) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
