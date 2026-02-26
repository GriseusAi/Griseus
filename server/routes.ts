import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertProjectSchema, insertWorkerSchema, insertWorkOrderSchema, insertJobApplicationSchema,
  insertChatMessageSchema, insertUserSchema, insertTradeSchema, insertSkillSchema,
  insertCertificationSchema, insertTradeCertificationSchema, insertProjectPhaseSchema,
  insertProjectPhaseTradeSchema, insertWorkerSkillSchema, insertWorkerCertificationSchema,
} from "@shared/schema";
import { z } from "zod";
import passport from "passport";
import { hashPassword } from "./index";
import { findWorkersForProject, findJobsForWorker } from "./matching";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth routes
  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password } = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const hashed = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashed });
      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      next(error);
    }
  });

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

  app.get("/api/projects", async (_req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  app.get("/api/workers", async (_req, res) => {
    const workers = await storage.getWorkers();
    res.json(workers);
  });

  app.get("/api/workers/:id", async (req, res) => {
    const worker = await storage.getWorker(req.params.id);
    if (!worker) return res.status(404).json({ message: "Worker not found" });
    res.json(worker);
  });

  app.post("/api/workers", async (req, res) => {
    try {
      const data = insertWorkerSchema.parse(req.body);
      const worker = await storage.createWorker(data);
      res.status(201).json(worker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  app.get("/api/work-orders", async (_req, res) => {
    const orders = await storage.getWorkOrders();
    res.json(orders);
  });

  app.get("/api/work-orders/:id", async (req, res) => {
    const order = await storage.getWorkOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Work order not found" });
    res.json(order);
  });

  app.post("/api/work-orders", async (req, res) => {
    try {
      const data = insertWorkOrderSchema.parse(req.body);
      const order = await storage.createWorkOrder(data);
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  app.patch("/api/work-orders/:id", async (req, res) => {
    const validStatuses = ["open", "in_progress", "completed", "cancelled"];
    const { status } = req.body;
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(", ")}` });
    }
    const updated = await storage.updateWorkOrderStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ message: "Work order not found" });
    res.json(updated);
  });

  app.get("/api/job-applications/:workerId", async (req, res) => {
    const applications = await storage.getJobApplicationsByWorker(req.params.workerId);
    res.json(applications);
  });

  app.post("/api/job-applications", async (req, res) => {
    try {
      const data = insertJobApplicationSchema.parse(req.body);
      const application = await storage.createJobApplication(data);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  app.get("/api/project-assignments/project/:projectId", async (req, res) => {
    const assignments = await storage.getProjectAssignmentsByProject(req.params.projectId);
    res.json(assignments);
  });

  app.get("/api/project-assignments/worker/:workerId", async (req, res) => {
    const assignments = await storage.getProjectAssignmentsByWorker(req.params.workerId);
    res.json(assignments);
  });

  app.get("/api/chat-messages/:projectId", async (req, res) => {
    const messages = await storage.getChatMessagesByProject(req.params.projectId);
    res.json(messages);
  });

  app.post("/api/chat-messages", async (req, res) => {
    try {
      const data = insertChatMessageSchema.parse(req.body);
      const message = await storage.createChatMessage(data);
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Trades ───────────────────────────────────────────────

  app.get("/api/trades", async (_req, res) => {
    const result = await storage.getTrades();
    res.json(result);
  });

  app.get("/api/trades/:id", async (req, res) => {
    const trade = await storage.getTrade(req.params.id);
    if (!trade) return res.status(404).json({ message: "Trade not found" });
    res.json(trade);
  });

  app.post("/api/trades", async (req, res) => {
    try {
      const data = insertTradeSchema.parse(req.body);
      const trade = await storage.createTrade(data);
      res.status(201).json(trade);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Skills ──────────────────────────────────────────────

  app.get("/api/skills", async (req, res) => {
    if (req.query.tradeId) {
      const result = await storage.getSkillsByTrade(req.query.tradeId as string);
      return res.json(result);
    }
    const result = await storage.getSkills();
    res.json(result);
  });

  app.get("/api/skills/:id", async (req, res) => {
    const skill = await storage.getSkill(req.params.id);
    if (!skill) return res.status(404).json({ message: "Skill not found" });
    res.json(skill);
  });

  app.post("/api/skills", async (req, res) => {
    try {
      const data = insertSkillSchema.parse(req.body);
      const skill = await storage.createSkill(data);
      res.status(201).json(skill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Certifications ──────────────────────────────────────

  app.get("/api/certifications", async (_req, res) => {
    const result = await storage.getCertifications();
    res.json(result);
  });

  app.get("/api/certifications/:id", async (req, res) => {
    const cert = await storage.getCertification(req.params.id);
    if (!cert) return res.status(404).json({ message: "Certification not found" });
    res.json(cert);
  });

  app.post("/api/certifications", async (req, res) => {
    try {
      const data = insertCertificationSchema.parse(req.body);
      const cert = await storage.createCertification(data);
      res.status(201).json(cert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Trades ↔ Certifications ─────────────────────────────

  app.get("/api/trades/:tradeId/certifications", async (req, res) => {
    const result = await storage.getCertificationsByTrade(req.params.tradeId);
    res.json(result);
  });

  app.get("/api/certifications/:certificationId/trades", async (req, res) => {
    const result = await storage.getTradesByCertification(req.params.certificationId);
    res.json(result);
  });

  app.post("/api/trades-certifications", async (req, res) => {
    try {
      const data = insertTradeCertificationSchema.parse(req.body);
      const link = await storage.createTradeCertification(data);
      res.status(201).json(link);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Project Phases ──────────────────────────────────────

  app.get("/api/project-phases", async (_req, res) => {
    const result = await storage.getProjectPhases();
    res.json(result);
  });

  app.get("/api/project-phases/:id", async (req, res) => {
    const phase = await storage.getProjectPhase(req.params.id);
    if (!phase) return res.status(404).json({ message: "Project phase not found" });
    res.json(phase);
  });

  app.post("/api/project-phases", async (req, res) => {
    try {
      const data = insertProjectPhaseSchema.parse(req.body);
      const phase = await storage.createProjectPhase(data);
      res.status(201).json(phase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Project Phases ↔ Trades ─────────────────────────────

  app.get("/api/project-phases/:phaseId/trades", async (req, res) => {
    const result = await storage.getTradesByPhase(req.params.phaseId);
    res.json(result);
  });

  app.post("/api/project-phases-trades", async (req, res) => {
    try {
      const data = insertProjectPhaseTradeSchema.parse(req.body);
      const link = await storage.createProjectPhaseTrade(data);
      res.status(201).json(link);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Ontology: Worker Skills ───────────────────────────────────────

  app.get("/api/workers/:workerId/skills", async (req, res) => {
    const result = await storage.getWorkerSkills(req.params.workerId);
    res.json(result);
  });

  app.post("/api/worker-skills", async (req, res) => {
    try {
      const data = insertWorkerSkillSchema.parse(req.body);
      const ws = await storage.createWorkerSkill(data);
      res.status(201).json(ws);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  app.patch("/api/worker-skills/:id", async (req, res) => {
    const { proficiencyLevel } = req.body;
    if (!proficiencyLevel || proficiencyLevel < 1 || proficiencyLevel > 5) {
      return res.status(400).json({ message: "proficiencyLevel must be between 1 and 5" });
    }
    const updated = await storage.updateWorkerSkillProficiency(req.params.id, proficiencyLevel);
    if (!updated) return res.status(404).json({ message: "Worker skill not found" });
    res.json(updated);
  });

  // ── Ontology: Worker Certifications ───────────────────────────────

  app.get("/api/workers/:workerId/certifications", async (req, res) => {
    const result = await storage.getWorkerCertifications(req.params.workerId);
    res.json(result);
  });

  app.post("/api/worker-certifications", async (req, res) => {
    try {
      const data = insertWorkerCertificationSchema.parse(req.body);
      const wc = await storage.createWorkerCertification(data);
      res.status(201).json(wc);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
  });

  // ── Matching Engine ──────────────────────────────────────────────────

  app.post("/api/matching/workers-for-project", async (req, res) => {
    try {
      const { projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      const results = await findWorkersForProject(projectId);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/matching/jobs-for-worker/:workerId", async (req, res) => {
    try {
      const results = await findJobsForWorker(req.params.workerId);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Temporary: one-shot ontology seed trigger
  app.get("/api/admin/seed-ontology", async (_req, res) => {
    try {
      const { seedOntology } = await import("./seed-ontology");
      await seedOntology();
      res.json({ message: "Ontology seed complete" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // AI Chat endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.json({ response: "Site AI is currently unavailable." });
      }
      const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: "You are Griseus Site AI, a data center workforce assistant. Keep answers concise. Use plain text only, no markdown. Use newlines to separate points. Respond in the same language the user writes in.",
          messages: messages.map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
        }),
      });
      const result = await apiResponse.json();
      const text = result.content?.[0]?.text || "I could not generate a response.";
      return res.json({ response: text });
    } catch (error) {
      return res.json({ response: "I'm having trouble connecting right now." });
    }
  });

  return httpServer;
}
