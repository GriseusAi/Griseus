import { Router } from "express";
import {
  createWorkspace, listWorkspaces, getWorkspace, deleteWorkspace,
  createWidget, deleteWidget, updateLayout, resolveWidgetData,
  WIDGET_CATALOG,
  CreateWorkspaceInput, CreateWidgetInput,
} from "../lib/workshop";

const router = Router();

router.get("/catalog", (_req, res) => res.json({ widgetTypes: WIDGET_CATALOG }));

router.get("/workspaces", async (_req, res) => {
  try { res.json({ workspaces: await listWorkspaces() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/workspaces", async (req, res) => {
  try {
    const input = CreateWorkspaceInput.parse(req.body);
    const id = await createWorkspace(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/workspaces/:id", async (req, res) => {
  try {
    const w = await getWorkspace(Number(req.params.id));
    if (!w) return res.status(404).json({ error: "not found" });
    res.json(w);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/workspaces/:id", async (req, res) => {
  try { await deleteWorkspace(Number(req.params.id)); res.json({ ok: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/workspaces/:id/layout", async (req, res) => {
  try {
    await updateLayout(Number(req.params.id), req.body?.layout ?? []);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/widgets", async (req, res) => {
  try {
    const input = CreateWidgetInput.parse(req.body);
    const id = await createWidget(input);
    res.json({ id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/widgets/:id", async (req, res) => {
  try { await deleteWidget(Number(req.params.id)); res.json({ ok: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/widgets/:id/data", async (req, res) => {
  try { res.json(await resolveWidgetData(Number(req.params.id))); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
