import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import passport from "passport";
import { hashPassword } from "./index";
import { asyncHandler, AuthenticationError } from "./errors";
import { validate, loginSchema } from "./middleware/validate";
import { loginRateLimit } from "./middleware/rate-limit";
import { requireAuth } from "./middleware/auth";
import type { User } from "@shared/schema";
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
  app.post("/api/login", loginRateLimit, validate(loginSchema), (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: User | false, info: { message: string } | undefined) => {
      if (err) return next(err);
      if (!user) return next(new AuthenticationError(info?.message || "Geçersiz kimlik bilgileri"));
      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", requireAuth, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", asyncHandler(async (req, res) => {
    if (!req.isAuthenticated()) throw new AuthenticationError();
    const { password: _, ...safeUser } = req.user as User;
    res.json(safeUser);
  }));

  return httpServer;
}
