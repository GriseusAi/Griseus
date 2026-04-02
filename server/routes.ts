import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import passport from "passport";
import { hashPassword } from "./index";
import agentRouter from "./routes/agent";
import stockPocRouter from "./routes/stock-poc";
import bomRouter from "./routes/bom";
import intelligenceRouter from "./routes/intelligence";
import planningRouter from "./routes/planning";
import palantirRouter from "./routes/palantir";
import palantirDemoRouter from "./routes/palantir-demo";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Routers ──
  app.use("/api/v1", agentRouter);
  app.use("/api/bom", bomRouter);
  app.use("/api/bom", intelligenceRouter);
  app.use("/api/stock", stockPocRouter);
  app.use("/api/planning", planningRouter);
  app.use("/api/palantir", palantirRouter);
  app.use("/api/palantir/demo", palantirDemoRouter);

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
