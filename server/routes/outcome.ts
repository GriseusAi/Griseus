/**
 * Outcome & Token Value API
 * OLE dashboard, outcome doğrulama, TVT metrikleri.
 */
import { Router, type Request, type Response } from "express";
import {
  getOutcomeDashboard,
  verifyOutcome,
  autoVerifyOutcomes,
  getConfidence,
} from "../lib/outcome-engine";
import { getTVTDashboard, linkOutcomeToTokens } from "../lib/token-value-tracker";

const router = Router();

// ══════════════════════════════════════════════════════════
// OLE — Outcome Learning Engine
// ══════════════════════════════════════════════════════════

// GET /api/outcomes/dashboard — Ana outcome dashboard
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await getOutcomeDashboard();
    res.json(dashboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/outcomes/:predictionId — Manuel outcome doğrulama
router.patch("/:predictionId", async (req: Request, res: Response) => {
  try {
    const predictionId = req.params.predictionId;
    const { actualOutcome, outcomeStatus, valueGenerated, actualValue } = req.body;

    if (!actualOutcome || !outcomeStatus) {
      return res.status(400).json({ error: "actualOutcome ve outcomeStatus gerekli" });
    }

    const validStatuses = ["verified_correct", "verified_incorrect", "partially_correct"];
    if (!validStatuses.includes(outcomeStatus)) {
      return res.status(400).json({ error: `outcomeStatus: ${validStatuses.join(" | ")}` });
    }

    await verifyOutcome({
      predictionId: String(predictionId),
      actualOutcome,
      actualValue: actualValue ?? undefined,
      outcomeStatus,
      valueGenerated: valueGenerated ?? undefined,
      verifiedBy: "user",
    });

    // Bağlı token metriğini güncelle
    if (valueGenerated != null) {
      linkOutcomeToTokens(String(predictionId), valueGenerated).catch(err =>
        console.error("[outcome] Token link error:", err));
    }

    res.json({ success: true, predictionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outcomes/auto-verify — Otomatik doğrulama çalıştır
router.post("/auto-verify", async (_req: Request, res: Response) => {
  try {
    const count = await autoVerifyOutcomes();
    res.json({ verified: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/outcomes/confidence/:ruleType — Kural güven skoru
router.get("/confidence/:ruleType", async (req: Request, res: Response) => {
  try {
    const ruleType = String(req.params.ruleType);
    const componentCode = req.query.componentCode ? String(req.query.componentCode) : undefined;
    const confidence = getConfidence(ruleType, componentCode);
    res.json({ ruleType, componentCode: componentCode ?? null, confidence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// TVT — Token Value Tracker
// ══════════════════════════════════════════════════════════

// GET /api/outcomes/token-metrics — TVT dashboard
router.get("/token-metrics", async (_req: Request, res: Response) => {
  try {
    const dashboard = await getTVTDashboard();
    res.json(dashboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
