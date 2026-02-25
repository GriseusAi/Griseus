import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertWorkerSchema, insertWorkOrderSchema, insertJobApplicationSchema, insertChatMessageSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import passport from "passport";
import { hashPassword } from "./index";

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

  // AI Chat endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "messages array is required" });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.json({
          response: "Site AI is currently unavailable. Please configure the ANTHROPIC_API_KEY to enable AI features.",
        });
      }

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      const result = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "You are Griseus Site AI, a data center workforce assistant. Help workers with safety protocols, certification requirements, translation, job matching, and site-specific questions. Keep answers concise and practical. Respond in the same language the user writes in.",
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const textBlock = result.content.find((block: any) => block.type === "text");
      const responseText = textBlock ? textBlock.text : "I could not generate a response. Please try again.";

      return res.json({ response: responseText });
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error("AI Chat error:", errorMsg);

      if (errorMsg.includes("credit balance is too low")) {
        return res.json({
          response: "Site AI is temporarily unavailable — API credit balance needs to be topped up. Please contact your administrator.",
        });
      }
      if (errorMsg.includes("authentication") || errorMsg.includes("invalid x-api-key") || errorMsg.includes("Invalid API Key")) {
        return res.json({
          response: "Site AI is misconfigured — the API key is invalid. Please contact your administrator.",
        });
      }
      return res.json({
        response: "I'm having trouble connecting right now. Please try again in a moment.",
      });
    }
  });

  return httpServer;
}
