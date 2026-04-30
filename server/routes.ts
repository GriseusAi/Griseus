import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import passport from "passport";
import { hashPassword } from "./index";
import agentRouter from "./routes/agent";
import agentMultiRouter from "./routes/agent-multi";
import agentMultiV2Router from "./routes/agent-multi-v2";
import stockPocRouter from "./routes/stock-poc";
import bomRouter from "./routes/bom";
import intelligenceRouter from "./routes/intelligence";
import planningRouter from "./routes/planning";
import palantirRouter from "./routes/palantir";
import palantirDemoRouter from "./routes/palantir-demo";
import { getRecentImpacts } from "./lib/impact-engine";
import { simulateWhatIf, type WhatIfScenario } from "./lib/whatif-engine";
import validationRouter from "./routes/validation";
import importRouter from "./routes/import";
import outcomeRouter from "./routes/outcome";
import chatHistoryRouter from "./routes/chat-history";
import foundryRouter from "./routes/foundry";
import ontologyRouter from "./routes/ontology";
import ontologyNarrativeRouter from "./routes/ontology-narrative";
import ontologyActionsRouter from "./routes/ontology-actions";
import ontologyTimeseriesRouter from "./routes/ontology-timeseries";
import orchestratorRouter from "./routes/orchestrator";
import simulationPipelineRouter from "./routes/simulation-pipeline";
import twinHealthRouter from "./routes/twin-health";
import decisionLoopRouter from "./routes/decision-loop";
import opsMonitoringRouter from "./routes/ops-monitoring";
import sddiRouter from "./routes/sddi";
import workshopRouter from "./routes/workshop";
import chartRouter from "./routes/chart";
import { seedOntology } from "./routes/ontology";
import { db } from "./db";
import { products, bomItems } from "@shared/schema";
import { sql } from "drizzle-orm";
import { runCrossProductAnalysis } from "./lib/cross-product-engine";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Routers ──
  app.use("/api/v1", agentRouter);
  app.use("/api/v1", agentMultiRouter);
  app.use("/api/v1", agentMultiV2Router);
  app.use("/api/bom", bomRouter);
  app.use("/api/bom", intelligenceRouter);
  app.use("/api/stock", stockPocRouter);
  app.use("/api/planning", planningRouter);
  app.use("/api/palantir", palantirRouter);
  app.use("/api/palantir/demo", palantirDemoRouter);
  app.use("/api/validation", validationRouter);
  app.use("/api/import", importRouter);
  app.use("/api/outcomes", outcomeRouter);
  app.use("/api/v1", chatHistoryRouter);
  app.use("/api/foundry", foundryRouter);
  app.use("/api/ontology", ontologyRouter);
  app.use("/api/ontology", ontologyNarrativeRouter);
  app.use("/api/ontology", ontologyActionsRouter);
  app.use("/api/ontology", ontologyTimeseriesRouter);
  app.use("/api/orchestrator", orchestratorRouter);
  app.use("/api/pipeline", simulationPipelineRouter);
  app.use("/api/twin-health", twinHealthRouter);
  app.use("/api/loop", decisionLoopRouter);
  app.use("/api/ops", opsMonitoringRouter);
  app.use("/api/sddi", sddiRouter);
  app.use("/api/workshop", workshopRouter);
  app.use("/api/chart", chartRouter);

  // Auto-seed ontology on first boot (idempotent)
  seedOntology().catch(err => console.error("[ontology] Seed error:", err.message));

  // ── Products API — hangi urunler mevcut ──
  app.get("/api/products", async (_req, res) => {
    try {
      // BOM'u olan urunleri getir (aktif urunler)
      const result = await db.execute(sql`
        SELECT DISTINCT p.id, p.sku, p.name, p.category,
          (SELECT COUNT(*) FROM bom_items WHERE parent_product_sku = p.sku) as component_count
        FROM products p
        WHERE p.sku IN (SELECT DISTINCT parent_product_sku FROM bom_items)
        ORDER BY p.name
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Impact Propagation API ──
  app.get("/api/impact/latest", (_req, res) => {
    const limit = Number(_req.query.limit) || 10;
    res.json({ impacts: getRecentImpacts(limit) });
  });

  // ── What-If Simulation API ──
  app.get("/api/whatif/simulate", async (req, res) => {
    try {
      const type = req.query.type as string;
      const quantity = Number(req.query.quantity) || 100;
      const componentCode = req.query.component as string | undefined;

      let scenario: WhatIfScenario;
      switch (type) {
        case "produce": scenario = { type: "produce", quantity }; break;
        case "order": scenario = { type: "order_received", quantity }; break;
        case "restock": {
          if (!componentCode) return res.status(400).json({ error: "component parametresi gerekli" });
          scenario = { type: "restock_component", componentCode, quantity };
          break;
        }
        case "forward": scenario = { type: "months_forward", months: quantity }; break;
        default: return res.status(400).json({ error: "type: produce|order|restock|forward" });
      }

      const sku = (req.query.sku as string) || "ELT.7-11";
      const result = await simulateWhatIf(scenario, sku);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cross-Product Optimization API ──
  app.get("/api/v1/cross-product/analysis", async (req, res) => {
    try {
      const months = Number(req.query.months) || 3;
      const analysis = await runCrossProductAnalysis(months);
      res.json(analysis);
    } catch (err: any) {
      console.error("[CrossProduct] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Auth ──
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { password: _, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  return httpServer;
}
