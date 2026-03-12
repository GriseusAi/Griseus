import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertProjectSchema, insertWorkerSchema, insertWorkOrderSchema, insertJobApplicationSchema,
  insertChatMessageSchema, registerSchema, insertTradeSchema, insertSkillSchema,
  insertCertificationSchema, insertTradeCertificationSchema, insertProjectPhaseSchema,
  insertProjectPhaseTradeSchema, insertWorkerSkillSchema, insertWorkerCertificationSchema,
  insertProjectScheduleSchema, insertProjectAssignmentSchema, insertServiceAppointmentSchema,
  insertOntologyObjectSchema, insertOntologyLinkSchema, insertOntologyActionSchema,
  ontologyObjects, ontologyLinks, weeklyPlans,
  facilities, productionLines, products, operations, schedules, capacityMetrics, geWorkers, workerCapabilities,
} from "@shared/schema";
import { z } from "zod";
import passport from "passport";
import { hashPassword } from "./index";
import { findWorkersForProject, findJobsForWorker, type WorkerMatchResult, type ProjectMatchResult } from "./matching";
import type { Worker, Project, Trade, Skill, Certification, TradeAdjacency, CertificationRequirement, WageData, PhaseTradeRequirement, ProjectPhase, User, ProjectSchedule, ServiceAppointment, OntologyObject, OntologyLink } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, sum } from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";
import { detectParser, getIngestError, resetToSeed } from "./routes/ingest";
import agentRouter from "./routes/agent";

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
  projectPhases: ProjectPhase[];
}

async function gatherPlatformContext(): Promise<PlatformContext> {
  const [projects, workers, trades, skills, certifications, activeProjects, tradeAdjacencies, certificationRequirements, wageData, phaseTradeRequirements, projectPhases] = await Promise.all([
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
    storage.getProjectPhases(),
  ]);
  return { projects, workers, trades, skills, certifications, activeProjects, tradeAdjacencies, certificationRequirements, wageData, phaseTradeRequirements, projectPhases };
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
    `You are Griseus Site AI, the intelligent assistant for a phase-based data center workforce planning platform.
Griseus specializes in mapping data center project phases to the exact trades and certifications needed.
Base ALL your answers on the REAL platform data provided below. Never invent workers, projects, or data that is not listed.
Use plain text only, no markdown formatting. Use newlines to separate points.
Keep answers concise and actionable. Respond in the same language the user writes in.

PHASE-BASED WORKFORCE PLANNING (your core capability):
When a company selects or asks about a project phase, provide specific guidance on:
1. Which trades are required for that phase
2. Which certifications each trade needs for that specific phase
3. How many workers are typically needed
4. Sourcing timeline: recommend companies begin sourcing workers 6-8 weeks before a phase starts
For example, if asked about MEP Rough-In phase, respond like: "For MEP Rough-In phase, you'll need Electricians with NFPA 70E and OSHA 30, HVAC Technicians with EPA 608 and NATE, and Plumbers/Pipefitters with OSHA 10. Based on typical data center timelines, you should be sourcing 6-8 weeks before this phase starts."

When a worker asks for job matches, also recommend adjacent-trade jobs they may qualify for based on their certifications and cross-trade adjacencies. Format cross-trade suggestions like: "Based on your [Trade] certifications, you also qualify for these [Adjacent Trade] roles..."
When asked about certification expiry, warn about upcoming expirations and suggest renewal steps with costs.
When asked about wages or salary, provide data by trade, region, and experience level from the wage intelligence data.
When asked about workforce planning or phase staffing, reference the phase-trade requirements matrix including required certifications per phase-trade combination.`
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

  // 8.8 Phase-trade requirements matrix (with required certifications per phase-trade)
  if (ctx.phaseTradeRequirements.length > 0) {
    const tradeIdToName3 = new Map(ctx.trades.map(t => [t.id, t.name]));
    const phaseIdToName = new Map(ctx.projectPhases?.map(p => [p.id, p.name]) || []);
    const byPhase = new Map<string, PhaseTradeRequirement[]>();
    for (const r of ctx.phaseTradeRequirements) {
      if (!byPhase.has(r.projectPhaseId)) byPhase.set(r.projectPhaseId, []);
      byPhase.get(r.projectPhaseId)!.push(r);
    }
    const phaseLines: string[] = [];
    Array.from(byPhase.entries()).forEach(([phaseId, reqs]) => {
      const phaseName = phaseIdToName.get(phaseId) || phaseId;
      const tradeLines = reqs.map(r => {
        const trade = tradeIdToName3.get(r.tradeId) || "Unknown";
        const certs = r.requiredCertifications ? ` | Required certs: ${r.requiredCertifications}` : "";
        return `    ${trade}: ${r.workersNeeded} workers, ${r.durationWeeks} weeks, priority=${r.priority}${certs}${r.notes ? ` — ${r.notes}` : ""}`;
      });
      phaseLines.push(`  ${phaseName}:\n${tradeLines.join("\n")}`);
    });
    sections.push(`\n--- PHASE-TRADE-CERTIFICATION REQUIREMENTS (60MW Data Center Build) ---\nFor each phase, the required trades and their certifications are listed. Recommend sourcing workers 6-8 weeks before a phase starts.\n${phaseLines.join("\n")}`);
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
  // AI Agent router
  app.use("/api/v1", agentRouter);

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

  app.get("/api/workers/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as User;
    const worker = await storage.getWorkerByEmail(user.email);
    if (!worker) return res.status(404).json({ message: "No worker profile found for this account" });
    res.json(worker);
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

  app.post("/api/project-assignments", async (req, res) => {
    try {
      const data = insertProjectAssignmentSchema.parse(req.body);
      const assignment = await storage.createProjectAssignment(data);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
      }
      throw error;
    }
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

  // ── Project Schedules ────────────────────────────────────────────────

  app.get("/api/project-schedules", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const schedules = await storage.getProjectSchedules((req.user as User).id);
      res.json(schedules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/project-schedules", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const data = insertProjectScheduleSchema.parse({
        ...req.body,
        companyId: (req.user as User).id,
      });
      const schedule = await storage.createProjectSchedule(data);
      res.status(201).json(schedule);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ── Scheduling Intelligence ──────────────────────────────────────────

  app.get("/api/scheduling/intelligence", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const companyId = (req.user as User).id;
      const appointments = await storage.getServiceAppointments(companyId);
      const allWorkers = await storage.getWorkers();

      // Build assignee set from appointments
      const assigneeIds = new Set(appointments.map(a => a.assigneeId).filter(Boolean) as string[]);
      const technicians = allWorkers.filter(w => assigneeIds.has(w.id));

      const WORK_HOURS_PER_DAY = 8 * 60; // 480 minutes

      // ── Technician utilization & jobs/day ───────────────────────────
      const techStats = technicians.map(tech => {
        const techAppts = appointments.filter(a => a.assigneeId === tech.id);
        const completed = techAppts.filter(a => a.status === "completed");
        const scheduled = techAppts.filter(a => a.status === "scheduled" || a.status === "in_progress");

        // Group by date for jobs/day
        const byDate = new Map<string, typeof techAppts>();
        for (const a of techAppts) {
          const existing = byDate.get(a.scheduledDate) || [];
          existing.push(a);
          byDate.set(a.scheduledDate, existing);
        }

        // Utilization = total scheduled minutes / available minutes across active days
        const activeDays = byDate.size || 1;
        const totalMinutes = techAppts
          .filter(a => a.status !== "cancelled")
          .reduce((sum, a) => sum + a.estimatedDuration, 0);
        const availableMinutes = activeDays * WORK_HOURS_PER_DAY;
        const utilization = availableMinutes > 0 ? Math.round((totalMinutes / availableMinutes) * 100) : 0;

        const jobsPerDay = activeDays > 0 ? +(techAppts.filter(a => a.status !== "cancelled").length / activeDays).toFixed(1) : 0;

        // Completion rate
        const nonCancelled = techAppts.filter(a => a.status !== "cancelled");
        const completionRate = nonCancelled.length > 0
          ? Math.round((completed.length / nonCancelled.length) * 100)
          : 0;

        // Avg job duration
        const avgDuration = nonCancelled.length > 0
          ? Math.round(nonCancelled.reduce((s, a) => s + a.estimatedDuration, 0) / nonCancelled.length)
          : 0;

        // Performance score: weighted composite (0-100)
        // 40% utilization (capped at 100%), 30% completion rate, 20% jobs/day (normalize to 5/day target), 10% consistency
        const utilizationScore = Math.min(utilization, 100);
        const jobsDayScore = Math.min((jobsPerDay / 5) * 100, 100);
        const dailyCounts = Array.from(byDate.values()).map(arr => arr.filter(a => a.status !== "cancelled").length);
        const meanDaily = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;
        const variance = dailyCounts.length > 1
          ? dailyCounts.reduce((sum, c) => sum + Math.pow(c - meanDaily, 2), 0) / dailyCounts.length
          : 0;
        const consistencyScore = meanDaily > 0 ? Math.max(0, 100 - (Math.sqrt(variance) / meanDaily) * 100) : 0;

        const performanceScore = Math.round(
          utilizationScore * 0.4 + completionRate * 0.3 + jobsDayScore * 0.2 + consistencyScore * 0.1
        );

        return {
          technicianId: tech.id,
          name: tech.name,
          trade: tech.trade,
          location: tech.location,
          totalJobs: techAppts.length,
          completedJobs: completed.length,
          scheduledJobs: scheduled.length,
          cancelledJobs: techAppts.filter(a => a.status === "cancelled").length,
          utilization,
          jobsPerDay,
          completionRate,
          avgDuration,
          performanceScore,
          activeDays,
          dailyBreakdown: Array.from(byDate.entries()).map(([date, appts]) => ({
            date,
            jobs: appts.filter(a => a.status !== "cancelled").length,
            minutes: appts.filter(a => a.status !== "cancelled").reduce((s, a) => s + a.estimatedDuration, 0),
          })).sort((a, b) => a.date.localeCompare(b.date)),
        };
      });

      // ── Route optimization analysis ─────────────────────────────────
      // Group appointments by technician+date, compute travel distances
      const routeAnalysis: Array<{
        technicianId: string;
        technicianName: string;
        date: string;
        stops: Array<{ title: string; lat: number | null; lng: number | null; time: string; address: string }>;
        totalDistanceKm: number;
        optimizedDistanceKm: number;
        savingsPercent: number;
        optimizedOrder: number[];
      }> = [];

      // Haversine distance helper
      const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a2 = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
      };

      for (const tech of technicians) {
        const techAppts = appointments.filter(a => a.assigneeId === tech.id && a.status !== "cancelled");
        const byDate = new Map<string, typeof techAppts>();
        for (const a of techAppts) {
          const existing = byDate.get(a.scheduledDate) || [];
          existing.push(a);
          byDate.set(a.scheduledDate, existing);
        }

        const dateEntries = Array.from(byDate.entries());
        for (const [date, dayAppts] of dateEntries) {
          if (dayAppts.length < 2) continue;
          const sorted = [...dayAppts].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
          const geoAppts = sorted.filter(a => a.latitude != null && a.longitude != null);
          if (geoAppts.length < 2) continue;

          // Current order distance
          let currentDist = 0;
          for (let i = 1; i < geoAppts.length; i++) {
            currentDist += haversine(geoAppts[i - 1].latitude!, geoAppts[i - 1].longitude!, geoAppts[i].latitude!, geoAppts[i].longitude!);
          }

          // Nearest-neighbor greedy optimization
          const remaining = geoAppts.map((_, i) => i);
          const optimized: number[] = [remaining.shift()!];
          while (remaining.length > 0) {
            const last = geoAppts[optimized[optimized.length - 1]];
            let bestIdx = 0, bestDist = Infinity;
            for (let i = 0; i < remaining.length; i++) {
              const d = haversine(last.latitude!, last.longitude!, geoAppts[remaining[i]].latitude!, geoAppts[remaining[i]].longitude!);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            optimized.push(remaining.splice(bestIdx, 1)[0]);
          }

          let optimizedDist = 0;
          for (let i = 1; i < optimized.length; i++) {
            optimizedDist += haversine(geoAppts[optimized[i - 1]].latitude!, geoAppts[optimized[i - 1]].longitude!, geoAppts[optimized[i]].latitude!, geoAppts[optimized[i]].longitude!);
          }

          const savings = currentDist > 0 ? Math.round(((currentDist - optimizedDist) / currentDist) * 100) : 0;

          routeAnalysis.push({
            technicianId: tech.id,
            technicianName: tech.name,
            date,
            stops: sorted.map(a => ({ title: a.title, lat: a.latitude, lng: a.longitude, time: a.scheduledTime, address: a.customerAddress })),
            totalDistanceKm: +currentDist.toFixed(1),
            optimizedDistanceKm: +optimizedDist.toFixed(1),
            savingsPercent: savings,
            optimizedOrder: optimized,
          });
        }
      }

      // ── Aggregate metrics ───────────────────────────────────────────
      const totalAppointments = appointments.length;
      const completedCount = appointments.filter(a => a.status === "completed").length;
      const cancelledCount = appointments.filter(a => a.status === "cancelled").length;
      const avgUtilization = techStats.length > 0 ? Math.round(techStats.reduce((s, t) => s + t.utilization, 0) / techStats.length) : 0;
      const avgPerformance = techStats.length > 0 ? Math.round(techStats.reduce((s, t) => s + t.performanceScore, 0) / techStats.length) : 0;
      const avgJobsPerDay = techStats.length > 0 ? +(techStats.reduce((s, t) => s + t.jobsPerDay, 0) / techStats.length).toFixed(1) : 0;
      const totalSavingsKm = routeAnalysis.reduce((s, r) => s + (r.totalDistanceKm - r.optimizedDistanceKm), 0);

      // Type breakdown
      const typeBreakdown = ["installation", "maintenance", "repair", "inspection"].map(type => ({
        type,
        count: appointments.filter(a => a.appointmentType === type).length,
        completed: appointments.filter(a => a.appointmentType === type && a.status === "completed").length,
        avgDuration: (() => {
          const typed = appointments.filter(a => a.appointmentType === type);
          return typed.length > 0 ? Math.round(typed.reduce((s, a) => s + a.estimatedDuration, 0) / typed.length) : 0;
        })(),
      }));

      res.json({
        summary: {
          totalAppointments,
          completedCount,
          cancelledCount,
          activeTechnicians: technicians.length,
          avgUtilization,
          avgPerformance,
          avgJobsPerDay,
          totalSavingsKm: +totalSavingsKm.toFixed(1),
        },
        technicians: techStats,
        routeAnalysis,
        typeBreakdown,
        seasonalForecast: (() => {
          // HVAC seasonal demand model: maintenance surges Sep-Oct (pre-winter) and Apr-May (pre-summer)
          // Based on appointment volume patterns + HVAC industry knowledge
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          // Base seasonal multipliers for HVAC service demand (Turkey climate)
          const seasonalMultipliers = [0.6, 0.5, 0.7, 1.1, 1.2, 0.8, 0.7, 0.9, 1.5, 1.6, 1.0, 0.7];

          // Calculate actual monthly volumes from data
          const monthlyActual = new Array(12).fill(0);
          for (const a of appointments) {
            if (a.status === "cancelled") continue;
            const month = parseInt(a.scheduledDate.split("-")[1], 10) - 1;
            if (month >= 0 && month < 12) monthlyActual[month]++;
          }

          // Average monthly baseline from actual data
          const totalNonCancelled = appointments.filter(a => a.status !== "cancelled").length;
          const monthsWithData = monthlyActual.filter(v => v > 0).length || 1;
          const avgMonthly = totalNonCancelled / Math.max(monthsWithData, 1);

          return months.map((name, i) => ({
            month: name,
            actual: monthlyActual[i],
            predicted: Math.round(Math.max(avgMonthly, 1) * seasonalMultipliers[i]),
            multiplier: seasonalMultipliers[i],
            isSurge: seasonalMultipliers[i] >= 1.3,
          }));
        })(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Service Appointments (Scheduling Module) ─────────────────────────

  app.get("/api/service-appointments", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const appointments = await storage.getServiceAppointments((req.user as User).id);
      res.json(appointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/service-appointments/:id", async (req, res) => {
    try {
      const appointment = await storage.getServiceAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/service-appointments", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const data = insertServiceAppointmentSchema.parse({
        ...req.body,
        companyId: (req.user as User).id,
      });
      const appointment = await storage.createServiceAppointment(data);
      res.status(201).json(appointment);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/service-appointments/:id/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { status } = req.body;
      if (!["scheduled", "in_progress", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.updateServiceAppointmentStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ message: "Appointment not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Workers by Phase (trade matching) ────────────────────────────────

  app.get("/api/phase-workers", async (req, res) => {
    try {
      const { trades: tradeNames } = req.query;
      if (!tradeNames) return res.status(400).json({ message: "trades query parameter is required (comma-separated)" });

      const tradeList = (tradeNames as string).split(",").map(t => t.trim());
      const allWorkers = await storage.getWorkers();

      const matched = allWorkers.filter(w => {
        const workerTrade = w.trade.toLowerCase();
        return tradeList.some(t => workerTrade.includes(t.toLowerCase()) || t.toLowerCase().includes(workerTrade));
      });

      res.json(matched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── ONTOLOGY ENGINE ─────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  // Seed ontology on first request if empty
  async function seedOntologyIfEmpty() {
    const existing = await storage.getAllOntologyObjects();
    if (existing.length > 0) return;

    // Factory
    const [factory] = await db.insert(ontologyObjects).values({
      objectType: "factory",
      objectId: "cukurova-isi",
      name: "Çukurova Isı Sistemleri",
      properties: { city: "Adana", sector: "HVAC Manufacturing", founded: 1985, employees: 120 },
    }).returning();

    // 2 Locations
    const [locKasa] = await db.insert(ontologyObjects).values({
      objectType: "location",
      objectId: "loc-kasa",
      name: "Kasa Üretim",
      properties: { type: "production", area_m2: 2400, description: "Yeni bina — kasa, sac kesim, büküm" },
    }).returning();

    const [locAna] = await db.insert(ontologyObjects).values({
      objectType: "location",
      objectId: "loc-ana",
      name: "Ana Fabrika & Montaj",
      properties: { type: "production", area_m2: 5600, description: "Ana üretim — montaj, test, paketleme" },
    }).returning();

    // 4 Production Lines (2 per location)
    const lineData = [
      { objectId: "line-1", name: "Hat 1 — Kombi Montaj", locationId: locKasa.id, properties: { product: "Wall-hung Boilers", capacity: 120, status: "running", shift_count: 2 } },
      { objectId: "line-2", name: "Hat 2 — Isı Eşanjör", locationId: locKasa.id, properties: { product: "Plate Heat Exchangers", capacity: 80, status: "running", shift_count: 2 } },
      { objectId: "line-3", name: "Hat 3 — Panel Radyatör", locationId: locAna.id, properties: { product: "Steel Panel Radiators", capacity: 200, status: "maintenance", shift_count: 2 } },
      { objectId: "line-4", name: "Hat 4 — Genleşme Tankı", locationId: locAna.id, properties: { product: "Expansion Vessels", capacity: 300, status: "running", shift_count: 2 } },
    ];

    const lines: OntologyObject[] = [];
    for (const ld of lineData) {
      const [line] = await db.insert(ontologyObjects).values({
        objectType: "production_line",
        objectId: ld.objectId,
        name: ld.name,
        properties: ld.properties,
      }).returning();
      lines.push(line);

      // Link line → LOCATED_IN → location
      await db.insert(ontologyLinks).values({
        fromType: "production_line", fromId: line.id,
        linkType: "LOCATED_IN",
        toType: "location", toId: ld.locationId,
      });
    }

    // Location → BELONGS_TO → Factory
    for (const loc of [locKasa, locAna]) {
      await db.insert(ontologyLinks).values({
        fromType: "location", fromId: loc.id,
        linkType: "BELONGS_TO",
        toType: "factory", toId: factory.id,
      });
    }

    // 3 Shifts
    const shiftData = [
      { objectId: "shift-morning", name: "Sabah Vardiyası", properties: { time: "06:00–14:00", code: "morning" } },
      { objectId: "shift-afternoon", name: "Öğleden Sonra Vardiyası", properties: { time: "14:00–22:00", code: "afternoon" } },
      { objectId: "shift-night", name: "Gece Vardiyası", properties: { time: "22:00–06:00", code: "night" } },
    ];

    const shifts: OntologyObject[] = [];
    for (const sd of shiftData) {
      const [shift] = await db.insert(ontologyObjects).values({
        objectType: "shift",
        objectId: sd.objectId,
        name: sd.name,
        properties: sd.properties,
      }).returning();
      shifts.push(shift);
    }

    // 10 Operators
    const operatorData = [
      { objectId: "op-1", name: "Ahmet Yıldız", lineIdx: 0, shiftIdx: 0, properties: { skills: ["welding", "assembly", "testing"], utilization: 92 } },
      { objectId: "op-2", name: "Fatma Demir", lineIdx: 0, shiftIdx: 0, properties: { skills: ["assembly", "quality"], utilization: 88 } },
      { objectId: "op-3", name: "Mehmet Kaya", lineIdx: 1, shiftIdx: 0, properties: { skills: ["welding", "brazing", "testing"], utilization: 95 } },
      { objectId: "op-4", name: "Ayşe Çelik", lineIdx: 1, shiftIdx: 1, properties: { skills: ["assembly", "packaging"], utilization: 78 } },
      { objectId: "op-5", name: "Hasan Arslan", lineIdx: 2, shiftIdx: 0, properties: { skills: ["press-op", "welding", "painting"], utilization: 45 } },
      { objectId: "op-6", name: "Elif Şahin", lineIdx: 2, shiftIdx: 0, properties: { skills: ["quality", "testing", "painting"], utilization: 40 } },
      { objectId: "op-7", name: "Ali Öztürk", lineIdx: 3, shiftIdx: 0, properties: { skills: ["welding", "assembly"], utilization: 85 } },
      { objectId: "op-8", name: "Zeynep Koç", lineIdx: 3, shiftIdx: 1, properties: { skills: ["assembly", "testing", "packaging"], utilization: 91 } },
      { objectId: "op-9", name: "Emre Aydın", lineIdx: 0, shiftIdx: 1, properties: { skills: ["welding", "testing"], utilization: 82 } },
      { objectId: "op-10", name: "Deniz Yılmaz", lineIdx: 3, shiftIdx: 0, properties: { skills: ["press-op", "welding", "assembly"], utilization: 87 } },
    ];

    for (const od of operatorData) {
      const [op] = await db.insert(ontologyObjects).values({
        objectType: "operator",
        objectId: od.objectId,
        name: od.name,
        properties: od.properties,
      }).returning();

      // operator → ASSIGNED_TO → production_line
      await db.insert(ontologyLinks).values({
        fromType: "operator", fromId: op.id,
        linkType: "ASSIGNED_TO",
        toType: "production_line", toId: lines[od.lineIdx].id,
      });

      // operator → WORKS_ON → shift
      await db.insert(ontologyLinks).values({
        fromType: "operator", fromId: op.id,
        linkType: "WORKS_ON",
        toType: "shift", toId: shifts[od.shiftIdx].id,
      });
    }

    // Flow link: Kasa Üretim → FEEDS_INTO → Ana Fabrika
    await db.insert(ontologyLinks).values({
      fromType: "location", fromId: locKasa.id,
      linkType: "FEEDS_INTO",
      toType: "location", toId: locAna.id,
    });

    console.log("[ontology] Seeded Çukurova ontology: 1 factory, 2 locations, 4 lines, 3 shifts, 10 operators");
  }

  // Seed on startup
  seedOntologyIfEmpty().catch(err => console.error("[ontology] Seed error:", err));

  // ── GET /api/ontology/objects/:type ─────────────────────────────────
  app.get("/api/ontology/objects/:type", async (req, res) => {
    try {
      const objects = await storage.getOntologyObjectsByType(req.params.type);
      res.json(objects);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── GET /api/ontology/graph/:type/:id ───────────────────────────────
  // Returns object + all outgoing and incoming links with resolved objects
  app.get("/api/ontology/graph/:type/:id", async (req, res) => {
    try {
      const obj = await storage.getOntologyObject(req.params.id);
      if (!obj) return res.status(404).json({ message: "Object not found" });

      const [outgoing, incoming] = await Promise.all([
        storage.getOntologyLinksFrom(obj.id),
        storage.getOntologyLinksTo(obj.id),
      ]);

      // Resolve linked object details
      const linkedIds = new Set<string>();
      outgoing.forEach(l => linkedIds.add(l.toId));
      incoming.forEach(l => linkedIds.add(l.fromId));

      const allObjects = await storage.getAllOntologyObjects();
      const objectMap = new Map(allObjects.map(o => [o.id, o]));

      const resolvedOutgoing = outgoing.map(l => ({
        ...l,
        target: objectMap.get(l.toId) || null,
      }));

      const resolvedIncoming = incoming.map(l => ({
        ...l,
        source: objectMap.get(l.fromId) || null,
      }));

      res.json({
        object: obj,
        outgoing: resolvedOutgoing,
        incoming: resolvedIncoming,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── POST /api/ontology/actions ──────────────────────────────────────
  app.post("/api/ontology/actions", async (req, res) => {
    try {
      const data = insertOntologyActionSchema.parse(req.body);
      const action = await storage.createOntologyAction(data);
      res.status(201).json(action);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors.map((e: any) => e.message).join(", ") });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ── GET /api/ontology/intelligence/factory/:id ──────────────────────
  // Computes live intelligence from the ontology graph
  app.get("/api/ontology/intelligence/factory/:id", async (req, res) => {
    try {
      const allObjects = await storage.getAllOntologyObjects();
      const allLinks = await storage.getAllOntologyLinks();

      const factory = allObjects.find(o => o.id === req.params.id && o.objectType === "factory");
      if (!factory) return res.status(404).json({ message: "Factory not found" });

      // Build graph index
      const objectMap = new Map(allObjects.map(o => [o.id, o]));
      const linksByFrom = new Map<string, OntologyLink[]>();
      const linksByTo = new Map<string, OntologyLink[]>();
      for (const l of allLinks) {
        if (!linksByFrom.has(l.fromId)) linksByFrom.set(l.fromId, []);
        linksByFrom.get(l.fromId)!.push(l);
        if (!linksByTo.has(l.toId)) linksByTo.set(l.toId, []);
        linksByTo.get(l.toId)!.push(l);
      }

      // Find locations belonging to factory
      const locations = allObjects.filter(o =>
        o.objectType === "location" &&
        (linksByFrom.get(o.id) || []).some(l => l.linkType === "BELONGS_TO" && l.toId === factory.id)
      );

      // Find lines per location
      const productionLines = allObjects.filter(o =>
        o.objectType === "production_line" &&
        (linksByFrom.get(o.id) || []).some(l =>
          l.linkType === "LOCATED_IN" && locations.some(loc => loc.id === l.toId)
        )
      );

      // Find operators per line
      const operators = allObjects.filter(o => o.objectType === "operator");

      // Compute per-line utilization
      const lineUtilization = productionLines.map(line => {
        const lineOperators = operators.filter(op =>
          (linksByFrom.get(op.id) || []).some(l => l.linkType === "ASSIGNED_TO" && l.toId === line.id)
        );

        const props = line.properties as any;
        const capacity = props?.capacity || 100;
        const status = props?.status || "unknown";

        const avgUtil = lineOperators.length > 0
          ? Math.round(lineOperators.reduce((sum, op) => sum + ((op.properties as any)?.utilization || 0), 0) / lineOperators.length)
          : 0;

        return {
          lineId: line.id,
          lineName: line.name,
          status,
          capacity,
          operatorCount: lineOperators.length,
          avgUtilization: avgUtil,
          operators: lineOperators.map(op => ({
            id: op.id,
            name: op.name,
            utilization: (op.properties as any)?.utilization || 0,
            skills: (op.properties as any)?.skills || [],
          })),
        };
      });

      // Detect underperforming operators (< 60% utilization)
      const underperforming = operators
        .filter(op => {
          const util = (op.properties as any)?.utilization || 0;
          return util > 0 && util < 60;
        })
        .map(op => ({
          id: op.id,
          name: op.name,
          utilization: (op.properties as any)?.utilization || 0,
          assignedLine: (() => {
            const link = (linksByFrom.get(op.id) || []).find(l => l.linkType === "ASSIGNED_TO");
            return link ? objectMap.get(link.toId)?.name || "Unknown" : "Unassigned";
          })(),
        }));

      // Bottleneck detection: lines with < 75% avg utilization or in maintenance
      const bottlenecks = lineUtilization
        .filter(l => l.status === "maintenance" || l.avgUtilization < 75)
        .map(l => ({
          lineId: l.lineId,
          lineName: l.lineName,
          reason: l.status === "maintenance" ? "maintenance" : "low_utilization",
          avgUtilization: l.avgUtilization,
          status: l.status,
        }));

      // Shift coverage gaps: lines with only 1 shift covered
      const shifts = allObjects.filter(o => o.objectType === "shift");
      const shiftCoverage = productionLines.map(line => {
        const lineOps = operators.filter(op =>
          (linksByFrom.get(op.id) || []).some(l => l.linkType === "ASSIGNED_TO" && l.toId === line.id)
        );
        const coveredShiftIds = new Set<string>();
        lineOps.forEach(op => {
          (linksByFrom.get(op.id) || []).forEach(l => {
            if (l.linkType === "WORKS_ON") coveredShiftIds.add(l.toId);
          });
        });
        return {
          lineId: line.id,
          lineName: line.name,
          totalShifts: shifts.length,
          coveredShifts: coveredShiftIds.size,
          gap: shifts.length - coveredShiftIds.size,
        };
      }).filter(s => s.gap > 0);

      // Generate intelligence feed items
      const insights: Array<{ type: "warning" | "success" | "info"; message: string; severity: number }> = [];

      // Bottleneck alerts
      for (const b of bottlenecks) {
        if (b.reason === "maintenance") {
          insights.push({
            type: "warning",
            message: `${b.lineName} bakımda — üretim durdu`,
            severity: 3,
          });
        } else {
          insights.push({
            type: "warning",
            message: `${b.lineName} bu hafta %${b.avgUtilization} kapasitede — darboğaz tespit edildi`,
            severity: 2,
          });
        }
      }

      // Underperformance alerts
      for (const u of underperforming) {
        insights.push({
          type: "warning",
          message: `${u.name} (%${u.utilization} verimlilik) — ${u.assignedLine} hattında düşük performans`,
          severity: 1,
        });
      }

      // Shift coverage
      const fullyCovered = productionLines.length - shiftCoverage.length;
      if (fullyCovered > 0) {
        insights.push({
          type: "success",
          message: `Vardiya örtüşmesi optimal — ${fullyCovered} hat tam kadro`,
          severity: 0,
        });
      }
      for (const sc of shiftCoverage) {
        insights.push({
          type: "warning",
          message: `${sc.lineName} — ${sc.gap} vardiya boşluğu tespit edildi`,
          severity: 2,
        });
      }

      // Seasonal forecast (hardcoded peak: September, ~26 weeks from March)
      const now = new Date();
      const peakMonth = 8; // September (0-indexed)
      const peakDate = new Date(now.getFullYear(), peakMonth, 1);
      if (peakDate < now) peakDate.setFullYear(peakDate.getFullYear() + 1);
      const weeksUntilPeak = Math.round((peakDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));

      const activeLineCount = lineUtilization.filter(l => l.status === "running").length;
      const totalCapacity = lineUtilization.filter(l => l.status === "running").reduce((s, l) => s + l.capacity, 0);
      const peakDemandMultiplier = 1.3;
      const projectedCapacityNeeded = Math.round(totalCapacity * peakDemandMultiplier);

      insights.push({
        type: "info",
        message: `Eylül surge'üne ${weeksUntilPeak} hafta kaldı — mevcut kadroyla %${Math.round(peakDemandMultiplier * 100)} kapasiteye ulaşılır`,
        severity: 0,
      });

      // Overall factory health
      const overallUtilization = lineUtilization.length > 0
        ? Math.round(lineUtilization.reduce((s, l) => s + l.avgUtilization, 0) / lineUtilization.length)
        : 0;

      res.json({
        factory: { id: factory.id, name: factory.name, properties: factory.properties },
        locations: locations.map(l => ({ id: l.id, name: l.name, properties: l.properties })),
        lineUtilization,
        underperforming,
        bottlenecks,
        shiftCoverage,
        insights: insights.sort((a, b) => b.severity - a.severity),
        summary: {
          totalLines: productionLines.length,
          activeLines: activeLineCount,
          totalOperators: operators.length,
          overallUtilization,
          totalCapacity,
          peakCapacityNeeded: projectedCapacityNeeded,
          weeksUntilPeak,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // Griseus Engine API v1
  // ══════════════════════════════════════════════════════════════════════

  app.get("/api/v1/facilities", async (_req, res) => {
    try {
      const rows = await db.select().from(facilities);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/v1/facilities/:id/lines", async (req, res) => {
    try {
      const rows = await db.select().from(productionLines).where(eq(productionLines.facilityId, Number(req.params.id)));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/v1/lines/:id/capacity", async (req, res) => {
    try {
      const rows = await db.select().from(capacityMetrics).where(eq(capacityMetrics.lineId, Number(req.params.id)));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/v1/lines/:id/operations", async (req, res) => {
    try {
      const rows = await db.select().from(operations).where(eq(operations.lineId, Number(req.params.id)));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/v1/schedules", async (req, res) => {
    try {
      const lineId = req.query.line_id ? Number(req.query.line_id) : null;
      const rows = lineId
        ? await db.select().from(schedules).where(eq(schedules.lineId, lineId))
        : await db.select().from(schedules);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/v1/workers", async (req, res) => {
    try {
      const workerRows = await db.select().from(geWorkers);
      const capRows = await db.select().from(workerCapabilities);
      const capMap = new Map<number, typeof capRows>();
      for (const c of capRows) {
        if (!capMap.has(c.workerId!)) capMap.set(c.workerId!, []);
        capMap.get(c.workerId!)!.push(c);
      }
      const result = workerRows.map((w) => ({
        ...w,
        capabilities: capMap.get(w.id) || [],
      }));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/v1/dashboard/summary", async (_req, res) => {
    try {
      // Lines with capacity
      const lines = await db.select().from(productionLines);
      const caps = await db.select().from(capacityMetrics);
      const ops = await db.select().from(operations);
      const scheds = await db.select().from(schedules);

      // Build line summaries
      const lineSummaries = lines.map((line) => {
        const lineOps = ops.filter((o) => o.lineId === line.id);
        const totalOutput = lineOps.reduce((s, o) => s + (o.actualQty || 0), 0);
        const cap = caps.find((c) => c.lineId === line.id);
        return {
          id: line.id,
          name: line.name,
          type: line.type,
          workerCount: line.workerCount,
          capacityUnitTimeMin: line.capacityUnitTimeMin,
          currentUnitTimeMin: line.currentUnitTimeMin,
          totalOutput,
          theoreticalMax: cap?.theoreticalMax || 0,
          utilizationPct: cap?.utilizationPct ? Number(cap.utilizationPct) : 0,
        };
      });

      const totalProduction = lineSummaries.reduce((s, l) => s + l.totalOutput, 0);

      // Monthly data grouped by month
      const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
      const monthlyMap = new Map<number, { e: number; g: number }>();
      for (let i = 1; i <= 12; i++) monthlyMap.set(i, { e: 0, g: 0 });

      for (const op of ops) {
        if (!op.plannedDate) continue;
        const month = new Date(op.plannedDate).getMonth() + 1;
        const entry = monthlyMap.get(month)!;
        const line = lines.find((l) => l.id === op.lineId);
        if (line?.type === "elektrikli") entry.e += op.actualQty || 0;
        else if (line?.type === "gazli") entry.g += op.actualQty || 0;
      }

      const monthlyData = Array.from(monthlyMap.entries())
        .filter(([_, v]) => v.e > 0 || v.g > 0)
        .map(([m, v]) => ({ ay: monthNames[m - 1], e: v.e, g: v.g }));

      // Weekly schedules grouped by line type
      const weeklySchedules = {
        elektrikli: scheds
          .filter((s) => {
            const line = lines.find((l) => l.id === s.lineId);
            return line?.type === "elektrikli";
          })
          .map((s) => ({ h: s.periodValue, plan: s.plannedQty || 0, gercek: s.actualQty || 0 })),
        gazli: scheds
          .filter((s) => {
            const line = lines.find((l) => l.id === s.lineId);
            return line?.type === "gazli";
          })
          .map((s) => ({ h: s.periodValue, plan: s.plannedQty || 0, gercek: s.actualQty || 0 })),
      };

      // Peak month
      let peakMonth = { ay: "", total: 0 };
      for (const md of monthlyData) {
        const total = md.e + md.g;
        if (total > peakMonth.total) peakMonth = { ay: md.ay, total };
      }

      res.json({
        totalProduction,
        lines: lineSummaries,
        monthlyData,
        weeklySchedules,
        capacityMetrics: caps,
        peakMonth,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // Griseus Intelligence Engine
  // ══════════════════════════════════════════════════════════════════════

  // POST /api/v1/simulate/capacity — What-if kapasite simülasyonu
  app.post("/api/v1/simulate/capacity", async (req, res) => {
    try {
      const { line_id, worker_count, unit_time_min, daily_hours, monthly_days, production_months } = req.body;
      if (!line_id) return res.status(400).json({ message: "line_id is required" });

      const [line] = await db.select().from(productionLines).where(eq(productionLines.id, line_id));
      if (!line) return res.status(404).json({ message: "Line not found" });

      const caps = await db.select().from(capacityMetrics).where(eq(capacityMetrics.lineId, line_id));
      const currentActualOutput = caps.reduce((s, c) => s + (c.actualOutput || 0), 0);

      const baseWorkers = line.workerCount || 1;
      const baseUnitTime = Number(line.currentUnitTimeMin) || 1;
      const baseDailyHours = Number(line.dailyHours) || 9;
      const baseMonthlyDays = line.monthlyDays || 22;
      const baseProductionMonths = line.productionMonths || 10;
      const theoreticalUnitTime = Number(line.capacityUnitTimeMin) || baseUnitTime;

      const simWorkers = worker_count ?? baseWorkers;
      const simUnitTime = unit_time_min ?? baseUnitTime;
      const simDailyHours = daily_hours ?? baseDailyHours;
      const simMonthlyDays = monthly_days ?? baseMonthlyDays;
      const simProductionMonths = production_months ?? baseProductionMonths;

      const calcCap = (unitTime: number, dh: number, md: number, pm: number) => {
        const daily = (dh * 60) / unitTime;
        const monthly = daily * md;
        const yearly = monthly * pm;
        return { daily_capacity: Math.round(daily), monthly_capacity: Math.round(monthly), yearly_capacity: Math.round(yearly) };
      };

      const baseline = calcCap(baseUnitTime, baseDailyHours, baseMonthlyDays, baseProductionMonths);
      const simulated = calcCap(simUnitTime, simDailyHours, simMonthlyDays, simProductionMonths);

      const baseUtilization = baseline.yearly_capacity > 0 ? Math.round((currentActualOutput / baseline.yearly_capacity) * 100) : 0;
      const simUtilization = simulated.yearly_capacity > 0 ? Math.round((currentActualOutput / simulated.yearly_capacity) * 100) : 0;

      const deltaUnits = simulated.yearly_capacity - baseline.yearly_capacity;
      const deltaPct = baseline.yearly_capacity > 0 ? Math.round((deltaUnits / baseline.yearly_capacity) * 100) : 0;

      const simInsights: string[] = [];
      if (simUtilization > 90) simInsights.push("Hat kapasitesine yaklaşıyor, darboğaz riski mevcut.");
      if (simWorkers > baseWorkers * 1.3) simInsights.push(`Personel sayısı %${Math.round(((simWorkers - baseWorkers) / baseWorkers) * 100)} artıyor — yeni personel eğitim süresi hesaba katılmalı.`);
      if (simUnitTime < theoreticalUnitTime) simInsights.push(`Birim süre (${simUnitTime}dk) teorik kapasitenin (${theoreticalUnitTime}dk) altında — gerçekçi olmayabilir.`);
      if (deltaUnits > 0) simInsights.push(`Bu senaryo yıllık +${deltaUnits.toLocaleString("tr-TR")} birim ek üretim sağlar.`);
      if (deltaUnits < 0) simInsights.push(`Bu senaryo yıllık ${Math.abs(deltaUnits).toLocaleString("tr-TR")} birim üretim kaybına yol açar.`);

      res.json({
        baseline: { ...baseline, utilization_pct: baseUtilization },
        simulated: { ...simulated, utilization_pct: simUtilization },
        delta: { units: deltaUnits, percent: deltaPct },
        parameters_used: { worker_count: simWorkers, unit_time_min: simUnitTime, daily_hours: simDailyHours, monthly_days: simMonthlyDays, production_months: simProductionMonths },
        insights: simInsights,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/v1/analyze/bottleneck/:line_id — Darboğaz tespiti
  app.get("/api/v1/analyze/bottleneck/:line_id", async (req, res) => {
    try {
      const lineId = Number(req.params.line_id);
      const [line] = await db.select().from(productionLines).where(eq(productionLines.id, lineId));
      if (!line) return res.status(404).json({ message: "Line not found" });

      const scheds = await db.select().from(schedules).where(eq(schedules.lineId, lineId));
      if (scheds.length === 0) return res.json({ line_id: lineId, line_name: line.name, total_weeks: 0, insights: ["Bu hat için schedule verisi bulunamadı."] });

      const weeks = scheds.map((s) => {
        const planned = s.plannedQty || 0;
        const actual = s.actualQty || 0;
        const deviation_pct = planned > 0 ? Math.round(((actual - planned) / planned) * 100) : 0;
        return { period_value: s.periodValue, planned, actual, deviation_pct };
      });

      const deviations = weeks.map((w) => w.deviation_pct);
      const avgDeviation = Math.round(deviations.reduce((s, d) => s + d, 0) / deviations.length);
      const onTrackWeeks = weeks.filter((w) => w.deviation_pct > -10).length;
      const criticalWeeks = weeks.filter((w) => w.deviation_pct < -30).length;
      const worstWeek = weeks.reduce((worst, w) => w.deviation_pct < worst.deviation_pct ? w : worst, weeks[0]);
      const bestWeek = weeks.reduce((best, w) => w.deviation_pct > best.deviation_pct ? w : best, weeks[0]);

      const last4 = weeks.slice(-4);
      let trend: "improving" | "declining" | "stable" = "stable";
      if (last4.length >= 2) {
        const firstHalf = last4.slice(0, 2).reduce((s, w) => s + w.deviation_pct, 0) / 2;
        const secondHalf = last4.slice(2).reduce((s, w) => s + w.deviation_pct, 0) / Math.max(last4.slice(2).length, 1);
        if (secondHalf - firstHalf > 5) trend = "improving";
        else if (firstHalf - secondHalf > 5) trend = "declining";
      }

      let bottleneck_severity: "low" | "medium" | "high" | "critical" = "low";
      if (avgDeviation < -30) bottleneck_severity = "critical";
      else if (avgDeviation < -20) bottleneck_severity = "high";
      else if (avgDeviation < -10) bottleneck_severity = "medium";

      const bnInsights: string[] = [];
      const criticalStretch: string[] = [];
      for (const w of weeks) {
        if (w.deviation_pct < -30) criticalStretch.push(w.period_value || "");
        else if (criticalStretch.length >= 2) break;
      }
      if (criticalStretch.length >= 2) {
        const stretchAvg = weeks.filter((w) => criticalStretch.includes(w.period_value || "")).reduce((s, w) => s + w.deviation_pct, 0) / criticalStretch.length;
        bnInsights.push(`${criticalStretch[0]}–${criticalStretch[criticalStretch.length - 1]} arası kritik düşüş: ortalama sapma %${Math.round(stretchAvg)}.`);
      }
      const trendLabel = trend === "improving" ? "iyileşiyor" : trend === "declining" ? "kötüleşiyor" : "stabil";
      bnInsights.push(`Son 4 haftada trend ${trendLabel}.`);
      bnInsights.push(`En kötü hafta ${worstWeek.period_value}: %${worstWeek.deviation_pct} sapma.`);
      if (criticalWeeks > weeks.length * 0.3) bnInsights.push(`Haftaların %${Math.round((criticalWeeks / weeks.length) * 100)}'i kritik seviyede — yapısal bir sorun olabilir.`);

      res.json({
        line_id: lineId, line_name: line.name, total_weeks: weeks.length,
        on_track_weeks: onTrackWeeks, critical_weeks: criticalWeeks,
        average_deviation_pct: avgDeviation, worst_week: worstWeek, best_week: bestWeek,
        trend, bottleneck_severity, insights: bnInsights,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/v1/analyze/workforce-risk/:facility_id — Personel bağımlılık riski
  app.get("/api/v1/analyze/workforce-risk/:facility_id", async (req, res) => {
    try {
      const facilityId = Number(req.params.facility_id);
      const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
      if (!facility) return res.status(404).json({ message: "Facility not found" });

      const wkrs = await db.select().from(geWorkers).where(eq(geWorkers.tenantId, facility.tenantId || "cukurova"));
      const wkrIds = wkrs.map((w) => w.id);
      const allCaps = await db.select().from(workerCapabilities);
      const wkrCaps = allCaps.filter((c) => wkrIds.includes(c.workerId!));

      const capWorkerMap = new Map<string, number[]>();
      for (const c of wkrCaps) {
        const name = c.capabilityName;
        if (!capWorkerMap.has(name)) capWorkerMap.set(name, []);
        capWorkerMap.get(name)!.push(c.workerId!);
      }

      const uniqueCapabilities = capWorkerMap.size;
      const singlePointFailures: { capability_name: string; sole_worker_name: string }[] = [];
      for (const [capName, wIds] of capWorkerMap) {
        if (wIds.length === 1) {
          const worker = wkrs.find((w) => w.id === wIds[0]);
          singlePointFailures.push({ capability_name: capName, sole_worker_name: worker?.name || "Unknown" });
        }
      }

      const workerUniqueMap = new Map<number, string[]>();
      for (const [capName, wIds] of capWorkerMap) {
        if (wIds.length === 1) {
          const wId = wIds[0];
          if (!workerUniqueMap.has(wId)) workerUniqueMap.set(wId, []);
          workerUniqueMap.get(wId)!.push(capName);
        }
      }

      const criticalWorkers = wkrs
        .map((w) => ({
          name: w.name, department: w.department,
          capability_count: wkrCaps.filter((c) => c.workerId === w.id).length,
          unique_capabilities: workerUniqueMap.get(w.id) || [],
        }))
        .filter((w) => w.unique_capabilities.length > 0)
        .sort((a, b) => b.unique_capabilities.length - a.unique_capabilities.length);

      const riskScore = uniqueCapabilities > 0 ? Math.round((singlePointFailures.length / uniqueCapabilities) * 100) : 0;
      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (riskScore > 40) riskLevel = "critical";
      else if (riskScore > 25) riskLevel = "high";
      else if (riskScore > 10) riskLevel = "medium";

      const wfInsights: string[] = [];
      if (singlePointFailures.length > 0) wfInsights.push(`${singlePointFailures.length} yetki sadece tek kişiye bağlı — bu kişiler ayrılırsa operasyon durur.`);
      if (criticalWorkers.length > 0) wfInsights.push(`En kritik çalışan: ${criticalWorkers[0].name} — ${criticalWorkers[0].unique_capabilities.length} benzersiz yetkiye sahip.`);

      const deptCapCount = new Map<string, number>();
      for (const w of criticalWorkers) {
        const dept = w.department || "Bilinmiyor";
        deptCapCount.set(dept, (deptCapCount.get(dept) || 0) + w.unique_capabilities.length);
      }
      let fragilesDept = "", fragilesCount = 0;
      for (const [dept, count] of deptCapCount) {
        if (count > fragilesCount) { fragilesDept = dept; fragilesCount = count; }
      }
      if (fragilesDept) wfInsights.push(`Departman bazlı en kırılgan: ${fragilesDept} (${fragilesCount} benzersiz yetki riski).`);

      res.json({
        facility_id: facilityId, total_workers: wkrs.length, total_capabilities: wkrCaps.length,
        unique_capabilities: uniqueCapabilities, single_point_failures: singlePointFailures,
        critical_workers: criticalWorkers, risk_score: riskScore, risk_level: riskLevel, insights: wfInsights,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/v1/score/trust/:worker_id — Trust Score hesaplama (v0.1)
  app.get("/api/v1/score/trust/:worker_id", async (req, res) => {
    try {
      const workerId = Number(req.params.worker_id);
      const [worker] = await db.select().from(geWorkers).where(eq(geWorkers.id, workerId));
      if (!worker) return res.status(404).json({ message: "Worker not found" });

      const allWkrs = await db.select().from(geWorkers);
      const allCaps = await db.select().from(workerCapabilities);

      const wCapCounts = new Map<number, number>();
      const wCapTypes = new Map<number, Set<string>>();
      for (const c of allCaps) {
        const wId = c.workerId!;
        wCapCounts.set(wId, (wCapCounts.get(wId) || 0) + 1);
        if (!wCapTypes.has(wId)) wCapTypes.set(wId, new Set());
        wCapTypes.get(wId)!.add(c.capabilityType || "authorization");
      }

      const maxCapCount = Math.max(...Array.from(wCapCounts.values()), 1);
      const thisCapCount = wCapCounts.get(workerId) || 0;
      const thisCapTypes = wCapTypes.get(workerId) || new Set();

      const capabilityScore = Math.round((thisCapCount / maxCapCount) * 40);
      const diversityScore = Math.round((thisCapTypes.size / 3) * 30);
      const experienceScore = 30;
      const trustScore = Math.min(capabilityScore + diversityScore + experienceScore, 100);

      const scores = allWkrs.map((w) => {
        const cc = wCapCounts.get(w.id) || 0;
        const ct = wCapTypes.get(w.id) || new Set();
        return { id: w.id, score: Math.min(Math.round((cc / maxCapCount) * 40) + Math.round((ct.size / 3) * 30) + 30, 100) };
      }).sort((a, b) => b.score - a.score);

      const rank = scores.findIndex((s) => s.id === workerId) + 1;
      const percentile = Math.round(((allWkrs.length - rank) / allWkrs.length) * 100);

      const tsInsights: string[] = [];
      if (trustScore >= 80) tsInsights.push("Yüksek güvenilirlik skoru — kritik görevler için uygun.");
      else if (trustScore >= 60) tsInsights.push("Orta düzey güvenilirlik — yetki genişletme potansiyeli var.");
      else tsInsights.push("Düşük skor — ek eğitim ve yetki kazanımı önerilir.");
      if (thisCapCount >= maxCapCount * 0.8) tsInsights.push(`En çok yetkiye sahip çalışanlardan biri (${thisCapCount} yetki).`);
      if (rank <= 3) tsInsights.push(`Tüm çalışanlar arasında ${rank}. sırada.`);

      res.json({
        worker_id: workerId, worker_name: worker.name, trust_score: trustScore,
        breakdown: { capability_score: capabilityScore, diversity_score: diversityScore, experience_score: experienceScore },
        rank, percentile, total_workers: allWkrs.length, insights: tsInsights,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/v1/forecast/weekly — Haftalık üretim tahmini
  app.post("/api/v1/forecast/weekly", async (req, res) => {
    try {
      const { line_id, planned_qty } = req.body;
      if (!line_id || !planned_qty) return res.status(400).json({ message: "line_id and planned_qty are required" });

      const lineId = Number(line_id);
      const planQty = Number(planned_qty);

      const [line] = await db.select().from(productionLines).where(eq(productionLines.id, lineId));
      if (!line) return res.status(404).json({ message: "Line not found" });

      const scheds = await db.select().from(schedules).where(eq(schedules.lineId, lineId));
      if (scheds.length === 0) return res.json({ line_id: lineId, line_name: line.name, message: "No schedule data" });

      // Gerçekleşme oranları
      const realizationRates = scheds
        .filter((s) => (s.plannedQty || 0) > 0)
        .map((s) => (s.actualQty || 0) / (s.plannedQty || 1));
      const avgRealizationRate = realizationRates.reduce((a, b) => a + b, 0) / realizationRates.length;
      const minRate = Math.min(...realizationRates);
      const maxRate = Math.max(...realizationRates);

      // Tahmin
      const predictedOutput = Math.round(planQty * avgRealizationRate);
      const gap = predictedOutput - planQty;
      const isRealistic = avgRealizationRate >= 0.85;
      const confidence = Math.round(avgRealizationRate * 100);

      // Senaryolar
      const baseUnitTime = Number(line.currentUnitTimeMin) || 1;
      const theoreticalUnitTime = Number(line.capacityUnitTimeMin) || baseUnitTime;
      const unitTimeImprovedRate = avgRealizationRate * (baseUnitTime / theoreticalUnitTime);
      const crewBoostRate = Math.min(avgRealizationRate * 1.15, 1.0);

      const scenarios = [
        {
          name: "Mevcut Durum",
          description: "Mevcut performans ile devam",
          predicted_output: predictedOutput,
          realization_rate: Math.round(avgRealizationRate * 100),
        },
        {
          name: "Birim Süre İyileştirme",
          description: `Birim süre ${baseUnitTime}dk → ${theoreticalUnitTime}dk`,
          predicted_output: Math.round(planQty * Math.min(unitTimeImprovedRate, 1.0)),
          realization_rate: Math.round(Math.min(unitTimeImprovedRate, 1.0) * 100),
        },
        {
          name: "+2 Kadro",
          description: "Ek 2 personel ile verimlilik artışı",
          predicted_output: Math.round(planQty * crewBoostRate),
          realization_rate: Math.round(crewBoostRate * 100),
        },
      ];

      // Öneri
      let recommendation = "";
      if (avgRealizationRate >= 0.95) {
        recommendation = "Mevcut performans hedeflere çok yakın. Planlanan miktar gerçekçi.";
      } else if (avgRealizationRate >= 0.85) {
        recommendation = `Ortalama gerçekleşme %${confidence}. Plan miktarını %${Math.round((1 / avgRealizationRate - 1) * 100)} artırarak hedefi tutturabilirsiniz.`;
      } else {
        recommendation = `Gerçekleşme oranı düşük (%${confidence}). Birim süre iyileştirmesi veya kadro takviyesi önerilir.`;
      }

      // Haftalık tarihçe (son 8 hafta)
      const weeklyHistory = scheds.slice(-8).map((s) => ({
        period: s.periodValue,
        planned: s.plannedQty || 0,
        actual: s.actualQty || 0,
        realization_pct: (s.plannedQty || 0) > 0 ? Math.round(((s.actualQty || 0) / (s.plannedQty || 1)) * 100) : 0,
      }));

      res.json({
        line_id: lineId,
        line_name: line.name,
        planned_qty: planQty,
        avg_realization_rate: Math.round(avgRealizationRate * 100),
        predicted_output: predictedOutput,
        gap,
        is_realistic: isRealistic,
        confidence,
        scenarios,
        recommendation,
        weekly_history: weeklyHistory,
        stats: { min_rate: Math.round(minRate * 100), max_rate: Math.round(maxRate * 100), total_weeks: scheds.length },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // Griseus Ingest — Excel/CSV Upload
  // ══════════════════════════════════════════════════════════════════════

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  app.post("/api/v1/ingest/upload", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: "Dosya yüklenmedi" });

      // Fix multer latin1 encoding for Turkish characters
      const rawName = req.file.originalname;
      const fileName = Buffer.from(rawName, 'latin1').toString('utf8');
      const buffer = req.file.buffer;

      console.log("[Ingest] Raw filename:", rawName);
      console.log("[Ingest] Decoded filename:", fileName);

      // Check file extension
      const ext = fileName.toLowerCase().split('.').pop();
      if (!ext || !['xls', 'xlsx', 'csv'].includes(ext)) {
        return res.status(400).json({ success: false, error: `Desteklenmeyen dosya formatı: .${ext}. Desteklenen: .xls, .xlsx, .csv` });
      }

      // Detect parser from filename
      const parser = detectParser(fileName);
      if (!parser) return res.status(400).json(getIngestError(fileName));

      console.log("[Ingest] Matched parser:", parser.name);

      // Parse the file — use "binary" type for .xls compatibility
      const wb = XLSX.read(buffer, { type: "buffer" });
      const result = await parser.fn(wb, fileName);

      res.json(result);
    } catch (error: any) {
      console.error("[Ingest] Parse error:", error);
      res.status(500).json({ success: false, error: error.message || "Bilinmeyen hata" });
    }
  });

  // ── POST /api/v1/ingest/dedup — one-time duplicate cleanup ──────────
  app.post("/api/v1/ingest/dedup", async (_req, res) => {
    try {
      let deletedOps = 0, deletedSch = 0;

      // Clean operations: keep lowest id per (line_id, planned_date)
      const allOps = await db.select().from(operations);
      const opsMap = new Map<string, number[]>();
      for (const op of allOps) {
        const key = `${op.lineId}_${op.plannedDate}`;
        if (!opsMap.has(key)) opsMap.set(key, []);
        opsMap.get(key)!.push(op.id);
      }
      for (const [, ids] of opsMap) {
        if (ids.length <= 1) continue;
        ids.sort((a, b) => a - b);
        for (let i = 1; i < ids.length; i++) {
          await db.delete(operations).where(eq(operations.id, ids[i]));
          deletedOps++;
        }
      }

      // Clean schedules: keep lowest id per (line_id, period_value)
      const allSch = await db.select().from(schedules);
      const schMap = new Map<string, number[]>();
      for (const s of allSch) {
        const key = `${s.lineId}_${s.periodValue}`;
        if (!schMap.has(key)) schMap.set(key, []);
        schMap.get(key)!.push(s.id);
      }
      for (const [, ids] of schMap) {
        if (ids.length <= 1) continue;
        ids.sort((a, b) => a - b);
        for (let i = 1; i < ids.length; i++) {
          await db.delete(schedules).where(eq(schedules.id, ids[i]));
          deletedSch++;
        }
      }

      res.json({
        success: true,
        deleted_operations: deletedOps,
        deleted_schedules: deletedSch,
        message: `${deletedOps} duplicate operations + ${deletedSch} duplicate schedules silindi`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/v1/ingest/reset — reset to seed data ─────────────────
  app.post("/api/v1/ingest/reset", async (_req, res) => {
    try {
      const result = await resetToSeed();
      res.json({ success: true, message: "Veriler sıfırlandı", operations: result.operations, schedules: result.schedules });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/v1/plans/create ───────────────────────────────────────
  app.post("/api/v1/plans/create", async (req, res) => {
    try {
      const { line_id, week_label, planned_qty, predicted_qty } = req.body;
      if (!week_label || !planned_qty) {
        return res.status(400).json({ message: "week_label and planned_qty are required" });
      }
      const [plan] = await db.insert(weeklyPlans).values({
        lineId: line_id ?? null,
        weekLabel: week_label,
        plannedQty: planned_qty,
        predictedQty: predicted_qty ?? null,
        status: "planned",
      }).returning();
      res.status(201).json({ success: true, plan_id: plan.id, message: "Plan kaydedildi" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── PUT /api/v1/plans/:id/complete ────────────────────────────────────
  app.put("/api/v1/plans/:id/complete", async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const { actual_qty } = req.body;
      if (actual_qty == null) {
        return res.status(400).json({ message: "actual_qty is required" });
      }

      const existing = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ message: "Plan not found" });
      }
      const plan = existing[0];

      const realizationRate = plan.plannedQty > 0
        ? (actual_qty / plan.plannedQty).toFixed(4)
        : "0";
      const predictionAccuracy = plan.predictedQty && plan.predictedQty > 0
        ? (1 - Math.abs(actual_qty - plan.predictedQty) / plan.predictedQty).toFixed(4)
        : null;

      await db.update(weeklyPlans)
        .set({
          actualQty: actual_qty,
          realizationRate: realizationRate,
          predictionAccuracy: predictionAccuracy,
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(weeklyPlans.id, planId));

      res.json({
        success: true,
        realization_rate: parseFloat(realizationRate),
        prediction_accuracy: predictionAccuracy ? parseFloat(predictionAccuracy) : null,
        message: "Plan tamamlandı",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── GET /api/v1/plans ─────────────────────────────────────────────────
  app.get("/api/v1/plans", async (req, res) => {
    try {
      const lineId = req.query.line_id ? parseInt(req.query.line_id as string) : null;
      let plans;
      if (lineId) {
        plans = await db.select().from(weeklyPlans)
          .where(eq(weeklyPlans.lineId, lineId))
          .orderBy(desc(weeklyPlans.createdAt));
      } else {
        plans = await db.select().from(weeklyPlans)
          .orderBy(desc(weeklyPlans.createdAt));
      }
      res.json(plans);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── GET /api/v1/plans/accuracy ────────────────────────────────────────
  app.get("/api/v1/plans/accuracy", async (req, res) => {
    try {
      const allPlans = await db.select().from(weeklyPlans);
      const completed = allPlans.filter(p => p.status === "completed");

      const avgRealizationRate = completed.length > 0
        ? completed.reduce((s, p) => s + parseFloat(p.realizationRate || "0"), 0) / completed.length
        : 0;
      const completedWithAccuracy = completed.filter(p => p.predictionAccuracy != null);
      const avgPredictionAccuracy = completedWithAccuracy.length > 0
        ? completedWithAccuracy.reduce((s, p) => s + parseFloat(p.predictionAccuracy || "0"), 0) / completedWithAccuracy.length
        : 0;

      // Trend: compare last 3 vs previous 3
      let trend = "neutral";
      if (completedWithAccuracy.length >= 6) {
        const recent3 = completedWithAccuracy.slice(0, 3);
        const prev3 = completedWithAccuracy.slice(3, 6);
        const recentAvg = recent3.reduce((s, p) => s + parseFloat(p.predictionAccuracy || "0"), 0) / 3;
        const prevAvg = prev3.reduce((s, p) => s + parseFloat(p.predictionAccuracy || "0"), 0) / 3;
        trend = recentAvg > prevAvg ? "improving" : recentAvg < prevAvg ? "declining" : "stable";
      }

      res.json({
        total_plans: allPlans.length,
        completed_plans: completed.length,
        avg_realization_rate: parseFloat(avgRealizationRate.toFixed(4)),
        avg_prediction_accuracy: parseFloat(avgPredictionAccuracy.toFixed(4)),
        trend,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
