import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertProjectSchema, insertWorkerSchema, insertWorkOrderSchema, insertJobApplicationSchema,
  insertChatMessageSchema, registerSchema, insertTradeSchema, insertSkillSchema,
  insertCertificationSchema, insertTradeCertificationSchema, insertProjectPhaseSchema,
  insertProjectPhaseTradeSchema, insertWorkerSkillSchema, insertWorkerCertificationSchema,
} from "@shared/schema";
import { z } from "zod";
import passport from "passport";
import { hashPassword } from "./index";
import { findWorkersForProject, findJobsForWorker, type WorkerMatchResult, type ProjectMatchResult } from "./matching";
import type { Worker, Project, Trade, Skill, Certification, TradeAdjacency, CertificationRequirement, WageData, PhaseTradeRequirement, User } from "@shared/schema";

// ── AI Chat Helpers ──────────────────────────────────────────────────

interface PlatformContext {
  projects: Project[];
  workers: Worker[];
  trades: Trade[];
  skills: Skill[];
  certifications: Certification[];
  activeProjects: Project[];
  tradeAdjacencies: TradeAdjacency[];
  certificationRequirements: CertificationRequirement[];
  wageData: WageData[];
  phaseTradeRequirements: PhaseTradeRequirement[];
}

async function gatherPlatformContext(): Promise<PlatformContext> {
  const [projects, workers, trades, skills, certifications, activeProjects, tradeAdjacencies, certificationRequirements, wageData, phaseTradeRequirements] = await Promise.all([
    storage.getProjects(),
    storage.getWorkers(),
    storage.getTrades(),
    storage.getSkills(),
    storage.getCertifications(),
    storage.getActiveProjects(),
    storage.getAllTradeAdjacencies(),
    storage.getAllCertificationRequirements(),
    storage.getAllWageData(),
    storage.getAllPhaseTradeRequirements(),
  ]);
  return { projects, workers, trades, skills, certifications, activeProjects, tradeAdjacencies, certificationRequirements, wageData, phaseTradeRequirements };
}

interface MatchingIntent {
  type: "workers-for-project" | "jobs-for-worker";
  projectId?: string;
  workerId?: string;
}

function detectMatchingIntent(
  message: string,
  projects: Project[],
  linkedWorkerId: string | null,
): MatchingIntent | null {
  const workersForProjectPatterns = [
    /who(?:'s| is| are)?\s+(?:best|available|qualified|ready)\s+(?:for|to work on)\s+(.+?)(?:\?|$)/i,
    /find\s+workers?\s+for\s+(.+?)(?:\?|$)/i,
    /match\s+workers?\s+(?:for|to)\s+(.+?)(?:\?|$)/i,
    /staff\s+(?:the\s+)?(.+?)(?:\s+project)?(?:\?|$)/i,
    /who\s+(?:can|should)\s+(?:work on|be assigned to)\s+(.+?)(?:\?|$)/i,
    /best\s+workers?\s+for\s+(?:the\s+)?(.+?)(?:\s+project)?(?:\?|$)/i,
  ];

  for (const pattern of workersForProjectPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1].trim().toLowerCase().replace(/\s+project$/, "");
      const project = projects.find(p =>
        p.name.toLowerCase().includes(query) ||
        query.includes(p.name.toLowerCase()) ||
        p.location?.toLowerCase().includes(query)
      );
      if (project) {
        return { type: "workers-for-project", projectId: project.id };
      }
    }
  }

  const jobsForWorkerPatterns = [
    /what\s+jobs?\s+(?:match|fit|suit)\s+me/i,
    /find\s+(?:jobs?|projects?|work)\s+for\s+me/i,
    /what(?:'s| is)\s+available\s+for\s+me/i,
    /which\s+projects?\s+(?:can i|should i|do i)\s+(?:work on|apply)/i,
    /(?:my|any)\s+(?:job|project)\s+(?:matches|recommendations|opportunities)/i,
    /jobs?\s+for\s+me/i,
    /projects?\s+for\s+me/i,
  ];

  for (const pattern of jobsForWorkerPatterns) {
    if (pattern.test(message)) {
      if (linkedWorkerId) {
        return { type: "jobs-for-worker", workerId: linkedWorkerId };
      }
    }
  }

  return null;
}

function buildSystemPrompt(
  user: User | null,
  ctx: PlatformContext,
  matchingResults?: { workers?: WorkerMatchResult[]; jobs?: ProjectMatchResult[] },
): string {
  const sections: string[] = [];

  // 1. Identity & behavior
  sections.push(
    `You are Griseus Site AI, the intelligent assistant for a data center workforce management platform.
Base ALL your answers on the REAL platform data provided below. Never invent workers, projects, or data that is not listed.
Use plain text only, no markdown formatting. Use newlines to separate points.
Keep answers concise and actionable. Respond in the same language the user writes in.
When a worker asks for job matches, also recommend adjacent-trade jobs they may qualify for based on their certifications and cross-trade adjacencies. Format cross-trade suggestions like: "Based on your [Trade] certifications, you also qualify for these [Adjacent Trade] roles..."
When asked about certification expiry, warn about upcoming expirations and suggest renewal steps with costs.
When asked about wages or salary, provide data by trade, region, and experience level from the wage intelligence data.
When asked about workforce planning or phase staffing, reference the phase-trade requirements matrix to answer questions like "how many electricians for MEP rough-in?".`
  );

  // 2. User personalization
  if (user) {
    sections.push(`\n--- CURRENT USER ---
Name: ${user.name || "Unknown"}
Role: ${user.role}
Email: ${user.email}${user.trade ? `\nTrade: ${user.trade}` : ""}${user.yearsExperience ? `\nExperience: ${user.yearsExperience} years` : ""}${user.location ? `\nLocation: ${user.location}` : ""}${user.companyName ? `\nCompany: ${user.companyName}` : ""}`);

    if (user.role === "company") {
      sections.push("This is a company/management user. Provide management-level insights about workforce, staffing, and project analytics.");
    } else if (user.role === "worker") {
      sections.push("This is a worker user. Provide career-relevant information about job matches, certifications, and skill development.");
    }
  }

  // 3. Active projects
  if (ctx.activeProjects.length > 0) {
    const projectLines = ctx.activeProjects.map(p => {
      const parts = [`  - ${p.name} (${p.location})`];
      parts.push(`    Status: ${p.status}, Progress: ${p.progress}%`);
      if (p.tradesNeeded && p.tradesNeeded.length > 0) parts.push(`    Trades needed: ${p.tradesNeeded.join(", ")}`);
      if (p.hourlyRate) parts.push(`    Hourly rate: ${p.hourlyRate}`);
      if (p.client) parts.push(`    Client: ${p.client}`);
      if (p.tier) parts.push(`    Tier: ${p.tier}`);
      if (p.powerCapacity) parts.push(`    Power capacity: ${p.powerCapacity}`);
      return parts.join("\n");
    });
    sections.push(`\n--- ACTIVE PROJECTS (${ctx.activeProjects.length}) ---\n${projectLines.join("\n")}`);
  }

  // 4. Workforce summary
  if (ctx.workers.length > 0) {
    const tradeCounts = new Map<string, { total: number; available: number }>();
    for (const w of ctx.workers) {
      const entry = tradeCounts.get(w.trade) || { total: 0, available: 0 };
      entry.total++;
      if (w.available) entry.available++;
      tradeCounts.set(w.trade, entry);
    }
    const summaryLines = Array.from(tradeCounts.entries()).map(
      ([trade, c]) => `  - ${trade}: ${c.total} total, ${c.available} available`
    );
    sections.push(`\n--- WORKFORCE SUMMARY (${ctx.workers.length} workers) ---\n${summaryLines.join("\n")}`);
  }

  // 5. Worker details (role-dependent)
  if (user?.role === "company" && ctx.workers.length > 0) {
    const workerLines = ctx.workers.map(w => {
      const parts = [`  - ${w.name} | ${w.trade} | ${w.experience}yr exp | ${w.location}`];
      parts.push(`    Available: ${w.available ? "Yes" : "No"}`);
      if (w.certifications && w.certifications.length > 0) parts.push(`    Certs: ${w.certifications.join(", ")}`);
      if (w.title) parts.push(`    Title: ${w.title}`);
      return parts.join("\n");
    });
    sections.push(`\n--- WORKER ROSTER ---\n${workerLines.join("\n")}`);
  } else if (user?.role === "worker") {
    const myWorker = ctx.workers.find(w => w.email === user.email);
    if (myWorker) {
      sections.push(`\n--- YOUR WORKER PROFILE ---
  Name: ${myWorker.name}
  Trade: ${myWorker.trade}
  Title: ${myWorker.title}
  Experience: ${myWorker.experience} years
  Location: ${myWorker.location}
  Available: ${myWorker.available ? "Yes" : "No"}
  Certifications: ${myWorker.certifications?.join(", ") || "None listed"}
  Bio: ${myWorker.bio || "Not set"}
  Total hours worked: ${myWorker.totalHoursWorked}
  Wallet balance: $${(myWorker.walletBalance / 100).toFixed(2)}`);
    }
  }

  // 6. Trade ontology
  if (ctx.trades.length > 0) {
    const tradeLines = ctx.trades.map(t => {
      const tradeSkills = ctx.skills.filter(s => s.tradeId === t.id);
      const skillStr = tradeSkills.length > 0
        ? tradeSkills.map(s => `${s.name} (difficulty: ${s.difficultyLevel})`).join(", ")
        : "No skills defined";
      return `  - ${t.name} [${t.category}]: ${skillStr}`;
    });
    sections.push(`\n--- TRADE ONTOLOGY ---\n${tradeLines.join("\n")}`);
  }

  // 7. Certifications
  if (ctx.certifications.length > 0) {
    const certLines = ctx.certifications.map(c =>
      `  - ${c.name} (issued by: ${c.issuingBody}${c.website ? `, website: ${c.website}` : ""}${c.validityYears ? `, valid ${c.validityYears}yr` : ""})`
    );
    sections.push(`\n--- CERTIFICATIONS ---\nWhen users ask where to get or renew a certification, provide the official website URL listed below.\n${certLines.join("\n")}`);
  }

  // 8.5 Cross-trade adjacencies
  if (ctx.tradeAdjacencies.length > 0) {
    const tradeIdToName = new Map(ctx.trades.map(t => [t.id, t.name]));
    const certIdToName = new Map(ctx.certifications.map(c => [c.id, c.name]));
    const adjLines = ctx.tradeAdjacencies.map(a => {
      const src = tradeIdToName.get(a.sourceTradeId) || "Unknown";
      const tgt = tradeIdToName.get(a.targetTradeId) || "Unknown";
      const cert = a.requiredCertificationId ? certIdToName.get(a.requiredCertificationId) || "Unknown" : "none";
      return `  - ${src} -> ${tgt} (difficulty: ${a.transitionDifficulty}, required cert: ${cert})${a.description ? ` — ${a.description}` : ""}`;
    });
    sections.push(`\n--- CROSS-TRADE ADJACENCIES ---\n${adjLines.join("\n")}`);
  }

  // 8.6 Certification expiry/renewal data
  if (ctx.certificationRequirements.length > 0) {
    const certById = new Map(ctx.certifications.map(c => [c.id, c]));
    const reqLines = ctx.certificationRequirements.map(r => {
      const cert = certById.get(r.certificationId);
      const name = cert?.name || "Unknown";
      const website = cert?.website || "N/A";
      const validity = r.validityPeriod ? `${r.validityPeriod} months` : "never expires";
      const cost = r.renewalCost != null ? `$${r.renewalCost}` : "N/A";
      const ce = r.continuingEducationHours ? `${r.continuingEducationHours} CE hours` : "none";
      return `  - ${name}: validity=${validity}, renewal cost=${cost}, CE hours=${ce}, renewal site=${website}${r.renewalProcess ? ` — ${r.renewalProcess}` : ""}`;
    });
    sections.push(`\n--- CERTIFICATION EXPIRY & RENEWAL ---\n${reqLines.join("\n")}`);
  }

  // 8.7 Wage intelligence
  if (ctx.wageData.length > 0) {
    const tradeIdToName2 = new Map(ctx.trades.map(t => [t.id, t.name]));
    const byTrade = new Map<string, WageData[]>();
    for (const w of ctx.wageData) {
      const key = tradeIdToName2.get(w.tradeId) || "Unknown";
      if (!byTrade.has(key)) byTrade.set(key, []);
      byTrade.get(key)!.push(w);
    }
    const wageLines: string[] = [];
    Array.from(byTrade.entries()).forEach(([trade, data]) => {
      const regionLines = data.map(w =>
        `    ${w.region} | ${w.experienceLevel}: $${w.hourlyRateMin}-${w.hourlyRateMax}/hr (OT x${w.overtimeMultiplier}${w.perDiemDaily ? `, per diem $${w.perDiemDaily}/day` : ""})`
      );
      wageLines.push(`  ${trade}:\n${regionLines.join("\n")}`);
    });
    sections.push(`\n--- WAGE INTELLIGENCE (Data Center Construction) ---\n${wageLines.join("\n")}`);
  }

  // 8.8 Phase-trade requirements matrix
  if (ctx.phaseTradeRequirements.length > 0) {
    const tradeIdToName3 = new Map(ctx.trades.map(t => [t.id, t.name]));
    const byPhase = new Map<string, PhaseTradeRequirement[]>();
    for (const r of ctx.phaseTradeRequirements) {
      if (!byPhase.has(r.projectPhaseId)) byPhase.set(r.projectPhaseId, []);
      byPhase.get(r.projectPhaseId)!.push(r);
    }
    const phaseLines: string[] = [];
    Array.from(byPhase.entries()).forEach(([phaseId, reqs]) => {
      const tradeLines = reqs.map(r => {
        const trade = tradeIdToName3.get(r.tradeId) || "Unknown";
        return `    ${trade}: ${r.workersNeeded} workers, ${r.durationWeeks} weeks, priority=${r.priority}${r.notes ? ` — ${r.notes}` : ""}`;
      });
      phaseLines.push(`  Phase ${phaseId}:\n${tradeLines.join("\n")}`);
    });
    sections.push(`\n--- PHASE-TRADE REQUIREMENTS (60MW Data Center Build) ---\n${phaseLines.join("\n")}`);
  }

  // 8. Matching results (conditional)
  if (matchingResults?.workers && matchingResults.workers.length > 0) {
    const lines = matchingResults.workers.map((r, i) =>
      `  ${i + 1}. ${r.worker.name} — Score: ${r.score.total}/100 (trade: ${r.score.tradeMatch}, skills: ${r.score.skillProficiency}, certs: ${r.score.certCompleteness}, avail: ${r.score.availability}, exp: ${r.score.experience}${r.alreadyAssigned ? ", ALREADY ASSIGNED" : ""})`
    );
    sections.push(`\n--- MATCHING RESULTS: Best Workers ---\n${lines.join("\n")}`);
  }

  if (matchingResults?.jobs && matchingResults.jobs.length > 0) {
    const directJobs = matchingResults.jobs.filter(r => !r.crossTrade);
    const crossTradeJobs = matchingResults.jobs.filter(r => r.crossTrade);

    if (directJobs.length > 0) {
      const lines = directJobs.map((r, i) =>
        `  ${i + 1}. ${r.project.name} (${r.project.location}) — Score: ${r.score.total}/100 (trade: ${r.score.tradeMatch}, skills: ${r.score.skillProficiency}, certs: ${r.score.certCompleteness}, avail: ${r.score.availability}, exp: ${r.score.experience}${r.alreadyAssigned ? ", ALREADY ASSIGNED" : ""})`
      );
      sections.push(`\n--- MATCHING RESULTS: Best Job Matches ---\n${lines.join("\n")}`);
    }

    if (crossTradeJobs.length > 0) {
      const lines = crossTradeJobs.map((r, i) =>
        `  ${i + 1}. ${r.project.name} (${r.project.location}) — Score: ${r.score.total}/100 [CROSS-TRADE: ${r.matchedTrade}] ${r.adjacencyDescription || ""}${r.alreadyAssigned ? " (ALREADY ASSIGNED)" : ""}`
      );
      sections.push(`\n--- CROSS-TRADE JOB MATCHES ---\n${lines.join("\n")}`);
    }
  }

  return sections.join("\n");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth routes
  app.post("/api/register", async (req, res, next) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already exists" });
      }
      const hashed = await hashPassword(data.password);
      const user = await storage.createUser({ ...data, password: hashed });
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

  // ── Password Reset ────────────────────────────────────────────────

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email);
      // Always return 200 to prevent email enumeration
      if (!user) return res.json({ message: "If that email exists, a reset code has been sent." });

      // Generate 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Clean up old codes, then insert new one
      await storage.deleteExpiredResetCodes(user.id);
      await storage.createPasswordResetCode(user.id, code, expiresAt);

      // Send email via Resend if API key is set, otherwise log to console
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        try {
          const emailResponse = await resend.emails.send({
            from: "noreply@griseus.io",
            to: email,
            subject: "Your Griseus Password Reset Code",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #2D2D2D; margin-bottom: 8px;">Password Reset</h2>
                <p style="color: #5A5A5A; margin-bottom: 24px;">Use the code below to reset your Griseus password. It expires in 15 minutes.</p>
                <div style="background: #EEE7DD; border: 1px solid #CEB298; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2D2D2D;">${code}</span>
                </div>
                <p style="color: #92ABBB; font-size: 13px;">If you did not request this, you can safely ignore this email.</p>
              </div>
            `,
          });
          console.log(`[Password Reset] Resend response for ${email}:`, JSON.stringify(emailResponse));
        } catch (emailError) {
          console.error(`[Password Reset] Resend error for ${email}:`, emailError);
        }
      } else {
        console.log(`[Password Reset] Code for ${email}: ${code}`);
      }

      res.json({ message: "If that email exists, a reset code has been sent." });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Email, code, and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(400).json({ message: "Invalid code or email" });

      const validCode = await storage.getValidResetCode(user.id, code);
      if (!validCode) return res.status(400).json({ message: "Invalid or expired reset code" });

      const hashed = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashed);
      await storage.markResetCodeUsed(validCode.id);

      res.json({ message: "Password has been reset successfully" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Something went wrong" });
    }
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

  // ── Ontology: Trade Adjacencies ─────────────────────────────────────

  app.get("/api/trade-adjacencies/:tradeId", async (req, res) => {
    try {
      const adjacencies = await storage.getTradeAdjacencies(req.params.tradeId);
      const allTrades = await storage.getTrades();
      const allCerts = await storage.getCertifications();

      const tradeIdToObj = new Map(allTrades.map(t => [t.id, { id: t.id, name: t.name }]));
      const certIdToObj = new Map(allCerts.map(c => [c.id, { id: c.id, name: c.name }]));

      const enriched = adjacencies.map(a => ({
        id: a.id,
        sourceTrade: tradeIdToObj.get(a.sourceTradeId) || { id: a.sourceTradeId, name: "Unknown" },
        targetTrade: tradeIdToObj.get(a.targetTradeId) || { id: a.targetTradeId, name: "Unknown" },
        requiredCertification: a.requiredCertificationId
          ? certIdToObj.get(a.requiredCertificationId) || { id: a.requiredCertificationId, name: "Unknown" }
          : null,
        transitionDifficulty: a.transitionDifficulty,
        description: a.description,
      }));

      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Certification Requirements ──────────────────────────────────────

  app.get("/api/certifications/:id/requirements", async (req, res) => {
    try {
      const cert = await storage.getCertification(req.params.id);
      if (!cert) return res.status(404).json({ message: "Certification not found" });

      const requirement = await storage.getCertificationRequirement(req.params.id);
      res.json({
        certification: cert,
        requirements: requirement || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Wage Intelligence ─────────────────────────────────────────────

  app.get("/api/wages", async (req, res) => {
    try {
      const { tradeId, region } = req.query;
      if (tradeId) {
        const data = await storage.getWageData(tradeId as string, region as string | undefined);
        // Enrich with trade name
        const trade = await storage.getTrade(tradeId as string);
        return res.json(data.map(w => ({
          ...w,
          tradeName: trade?.name || "Unknown",
        })));
      }
      // Return all wage data grouped by trade
      const allData = await storage.getAllWageData();
      const allTrades = await storage.getTrades();
      const tradeIdToName = new Map(allTrades.map(t => [t.id, t.name]));
      res.json(allData.map(w => ({
        ...w,
        tradeName: tradeIdToName.get(w.tradeId) || "Unknown",
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Phase-Trade Requirements ──────────────────────────────────────

  app.get("/api/phase-requirements", async (req, res) => {
    try {
      const { phaseId } = req.query;
      if (!phaseId) return res.status(400).json({ message: "phaseId query parameter is required" });

      const phase = await storage.getProjectPhase(phaseId as string);
      if (!phase) return res.status(404).json({ message: "Phase not found" });

      const requirements = await storage.getPhaseTradeRequirements(phaseId as string);
      const allTrades = await storage.getTrades();
      const tradeIdToName = new Map(allTrades.map(t => [t.id, t.name]));

      res.json({
        phase,
        requirements: requirements.map(r => ({
          ...r,
          tradeName: tradeIdToName.get(r.tradeId) || "Unknown",
        })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/phase-requirements/summary", async (_req, res) => {
    try {
      const [allPhases, allRequirements, allTrades] = await Promise.all([
        storage.getProjectPhases(),
        storage.getAllPhaseTradeRequirements(),
        storage.getTrades(),
      ]);

      const tradeIdToName = new Map(allTrades.map(t => [t.id, t.name]));

      const summary = allPhases.map(phase => {
        const phaseReqs = allRequirements.filter(r => r.projectPhaseId === phase.id);
        const totalWorkers = phaseReqs.reduce((sum, r) => sum + r.workersNeeded, 0);
        return {
          phase: { id: phase.id, name: phase.name, orderIndex: phase.orderIndex },
          totalWorkers,
          trades: phaseReqs.map(r => ({
            tradeName: tradeIdToName.get(r.tradeId) || "Unknown",
            tradeId: r.tradeId,
            workersNeeded: r.workersNeeded,
            priority: r.priority,
            durationWeeks: r.durationWeeks,
            notes: r.notes,
          })),
        };
      });

      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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

  // ── Admin Endpoints ────────────────────────────────────────────────

  const ADMIN_EMAIL = "gurkanduruak@gmail.com";

  app.get("/api/admin/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

    const allUsers = await storage.getAllUsers();
    // Strip passwords
    const safeUsers = allUsers.map(({ password: _, ...u }) => u);
    res.json(safeUsers);
  });

  app.post("/api/admin/setup", async (req, res) => {
    try {
      const user = await storage.getUserByEmail(ADMIN_EMAIL);
      if (!user) {
        // Create admin user
        const hashed = await hashPassword("admin123");
        const newUser = await storage.createUser({
          email: ADMIN_EMAIL,
          password: hashed,
          role: "admin",
          name: "Gurkan Duruak",
        });
        const { password: _, ...safeUser } = newUser;
        return res.status(201).json({ message: "Admin user created", user: safeUser });
      }

      // User exists, update role to admin
      if (user.role !== "admin") {
        await storage.updateUserRole(user.id, "admin");
        return res.json({ message: "User role updated to admin" });
      }

      res.json({ message: "Admin user already exists" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Analytics Endpoints ────────────────────────────────────────────

  app.get("/api/analytics/workforce-summary", async (_req, res) => {
    try {
      const [allWorkers, allProjects] = await Promise.all([
        storage.getWorkers(),
        storage.getProjects(),
      ]);

      const totalWorkers = allWorkers.length;
      const availableWorkers = allWorkers.filter(w => w.available).length;
      const activeProjects = allProjects.filter(p => p.status === "active");
      const activeProjectCount = activeProjects.length;

      // Compute average match score across all active projects
      let totalScore = 0;
      let matchCount = 0;

      for (const project of activeProjects) {
        try {
          const results = await findWorkersForProject(project.id);
          for (const r of results) {
            totalScore += r.score.total;
            matchCount++;
          }
        } catch {
          // Skip projects that fail matching
        }
      }

      const avgMatchScore = matchCount > 0 ? Math.round((totalScore / matchCount) * 10) / 10 : 0;

      res.json({ totalWorkers, availableWorkers, activeProjects: activeProjectCount, avgMatchScore });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/supply-demand", async (_req, res) => {
    try {
      const [allWorkers, allProjects, officialTrades] = await Promise.all([
        storage.getWorkers(),
        storage.getProjects(),
        storage.getTrades(),
      ]);

      const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "planning");

      // ONLY include the official trades from the trades table (exactly 12)
      const officialTradeNames = new Set(officialTrades.map(t => t.name));
      const tradeDataMap = new Map<string, { supply: number; demand: number }>();
      for (const t of officialTrades) {
        tradeDataMap.set(t.name, { supply: 0, demand: 0 });
      }

      // Map legacy worker trade names to canonical ontology names
      const tradeAliases: Record<string, string> = {
        "Pipefitter": "Plumber/Pipefitter",
        "Plumber": "Plumber/Pipefitter",
        "Fire Protection": "Fire Protection Specialist",
        "Network Technician": "Low Voltage Technician",
        "Controls Technician": "Controls/BMS Technician",
        "Concrete Worker": "Concrete Specialist",
        "Security Systems": "Low Voltage Technician",
        "Rigger": "General Labor",
      };

      // Count supply: available workers mapped to official trades only
      for (const w of allWorkers) {
        if (w.available) {
          const canonical = tradeAliases[w.trade] || w.trade;
          const entry = tradeDataMap.get(canonical);
          if (entry) entry.supply++;
        }
      }

      // Count demand: projects requesting official trades only
      for (const p of activeProjects) {
        for (const t of (p.tradesNeeded ?? [])) {
          const canonical = tradeAliases[t] || t;
          const entry = tradeDataMap.get(canonical);
          if (entry) entry.demand++;
        }
      }

      const data = Array.from(tradeDataMap.entries())
        .map(([trade, { supply, demand }]) => ({ trade, supply, demand }))
        .sort((a, b) => (b.demand + b.supply) - (a.demand + a.supply));

      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/regional", async (_req, res) => {
    try {
      const allWorkers = await storage.getWorkers();

      const locationMap = new Map<string, typeof allWorkers>();
      for (const w of allWorkers) {
        const loc = w.location || "Unknown";
        if (!locationMap.has(loc)) locationMap.set(loc, []);
        locationMap.get(loc)!.push(w);
      }

      const data = Array.from(locationMap.entries()).map(([location, workers]) => {
        const totalWorkers = workers.length;
        const availableWorkers = workers.filter(w => w.available).length;
        const avgExperience = Math.round(workers.reduce((s, w) => s + w.experience, 0) / totalWorkers * 10) / 10;

        // Top trades by count
        const tradeCounts = new Map<string, number>();
        for (const w of workers) {
          tradeCounts.set(w.trade, (tradeCounts.get(w.trade) || 0) + 1);
        }
        const topTrades = Array.from(tradeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([trade]) => trade);

        return { location, totalWorkers, availableWorkers, topTrades, avgExperience };
      }).sort((a, b) => b.totalWorkers - a.totalWorkers);

      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/skill-gaps", async (_req, res) => {
    try {
      const [allWorkers, allTrades, allCerts, allTradeCerts] = await Promise.all([
        storage.getWorkers(),
        storage.getTrades(),
        storage.getCertifications(),
        // Fetch all trade-cert links
        Promise.resolve().then(async () => {
          const trades = await storage.getTrades();
          const links: Array<{ tradeId: string; certificationId: string }> = [];
          for (const t of trades) {
            const tl = await storage.getCertificationsByTrade(t.id);
            links.push(...tl);
          }
          return links;
        }),
      ]);

      // Build cert id → name map
      const certNameMap = new Map<string, string>();
      for (const c of allCerts) certNameMap.set(c.id, c.name);

      // Build trade id → name map
      const tradeIdToName = new Map<string, string>();
      for (const t of allTrades) tradeIdToName.set(t.id, t.name);

      // For each trade, get required certs and worker coverage
      const result: Array<{
        trade: string;
        totalWorkers: number;
        certifications: Array<{ name: string; holdersCount: number; totalWorkers: number; percentage: number }>;
      }> = [];

      for (const trade of allTrades) {
        // Find workers in this trade (match by trade name)
        const tradeWorkers = allWorkers.filter(w => w.trade === trade.name);
        if (tradeWorkers.length === 0) continue;

        // Get required certs for this trade
        const requiredCertLinks = allTradeCerts.filter(tc => tc.tradeId === trade.id);
        if (requiredCertLinks.length === 0) continue;

        // Fetch worker certifications for all workers in this trade
        const workerCertsMap = new Map<string, Set<string>>();
        for (const w of tradeWorkers) {
          const wCerts = await storage.getWorkerCertifications(w.id);
          workerCertsMap.set(w.id, new Set(wCerts.map(wc => wc.certificationId)));
        }

        const certData = requiredCertLinks.map(link => {
          const certName = certNameMap.get(link.certificationId) || "Unknown";
          const holdersCount = tradeWorkers.filter(w =>
            workerCertsMap.get(w.id)?.has(link.certificationId)
          ).length;
          const percentage = Math.round((holdersCount / tradeWorkers.length) * 100);
          return { name: certName, holdersCount, totalWorkers: tradeWorkers.length, percentage };
        });

        result.push({
          trade: trade.name,
          totalWorkers: tradeWorkers.length,
          certifications: certData,
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // AI Chat endpoint — context-aware with real platform data
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.json({ response: "Site AI is currently unavailable." });
      }

      // Get authenticated user (optional — degrades gracefully)
      const user: User | null = req.isAuthenticated() ? (req.user as User) : null;

      // Gather all platform data in parallel
      const ctx = await gatherPlatformContext();

      // Resolve linked worker ID for worker-role users
      let linkedWorkerId: string | null = null;
      if (user?.role === "worker" && user.email) {
        const linkedWorker = ctx.workers.find(w => w.email === user.email);
        if (linkedWorker) linkedWorkerId = linkedWorker.id;
      }

      // Extract last user message for intent detection
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

      // Detect matching intent
      const intent = detectMatchingIntent(lastUserMessage, ctx.projects, linkedWorkerId);

      // Run matching engine if intent detected
      let matchingResults: { workers?: WorkerMatchResult[]; jobs?: ProjectMatchResult[] } | undefined;
      if (intent) {
        try {
          if (intent.type === "workers-for-project" && intent.projectId) {
            const workers = await findWorkersForProject(intent.projectId);
            matchingResults = { workers };
          } else if (intent.type === "jobs-for-worker" && intent.workerId) {
            const jobs = await findJobsForWorker(intent.workerId);
            matchingResults = { jobs };
          }
        } catch {
          // Matching engine errors are non-fatal — AI still has full context
        }
      }

      // Build enriched system prompt
      const systemPrompt = buildSystemPrompt(user, ctx, matchingResults);

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
          system: systemPrompt,
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
