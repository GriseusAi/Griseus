import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  title: text("title").notNull(),
  trade: text("trade").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  location: text("location").notNull(),
  avatarUrl: text("avatar_url"),
  experience: integer("experience").notNull().default(0),
  certifications: text("certifications").array().default(sql`'{}'::text[]`),
  available: boolean("available").notNull().default(true),
  bio: text("bio"),
  walletBalance: integer("wallet_balance").notNull().default(0),
  pendingPayout: integer("pending_payout").notNull().default(0),
  totalHoursWorked: integer("total_hours_worked").notNull().default(0),
});

export const insertWorkerSchema = createInsertSchema(workers).omit({ id: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workers.$inferSelect;

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  client: text("client").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("planning"),
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  progress: integer("progress").notNull().default(0),
  powerCapacity: text("power_capacity"),
  tier: text("tier"),
  imageUrl: text("image_url"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  tradesNeeded: text("trades_needed").array().default(sql`'{}'::text[]`),
  hourlyRate: text("hourly_rate"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const workOrders = pgTable("work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  projectId: varchar("project_id").notNull(),
  assigneeId: varchar("assignee_id"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  trade: text("trade").notNull(),
  dueDate: text("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true, createdAt: true });
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;

export const jobApplications = pgTable("job_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  projectId: varchar("project_id").notNull(),
  status: text("status").notNull().default("pending"),
  appliedAt: timestamp("applied_at").defaultNow(),
});

export const insertJobApplicationSchema = createInsertSchema(jobApplications).omit({ id: true, appliedAt: true });
export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplications.$inferSelect;

export const projectAssignments = pgTable("project_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  projectId: varchar("project_id").notNull(),
  role: text("role").notNull().default("crew"),
});

export const insertProjectAssignmentSchema = createInsertSchema(projectAssignments).omit({ id: true });
export type InsertProjectAssignment = z.infer<typeof insertProjectAssignmentSchema>;
export type ProjectAssignment = typeof projectAssignments.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// --- Data Center Workforce Ontology ---

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
});

export const insertTradeSchema = createInsertSchema(trades).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export const skills = pgTable("skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tradeId: varchar("trade_id").notNull(),
  description: text("description"),
  difficultyLevel: integer("difficulty_level").notNull().default(1),
});

export const insertSkillSchema = createInsertSchema(skills).omit({ id: true });
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type Skill = typeof skills.$inferSelect;

export const certifications = pgTable("certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  issuingBody: text("issuing_body").notNull(),
  validityYears: integer("validity_years"),
  description: text("description"),
});

export const insertCertificationSchema = createInsertSchema(certifications).omit({ id: true });
export type InsertCertification = z.infer<typeof insertCertificationSchema>;
export type Certification = typeof certifications.$inferSelect;

export const tradesCertifications = pgTable("trades_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull(),
  certificationId: varchar("certification_id").notNull(),
});

export const insertTradeCertificationSchema = createInsertSchema(tradesCertifications).omit({ id: true });
export type InsertTradeCertification = z.infer<typeof insertTradeCertificationSchema>;
export type TradeCertification = typeof tradesCertifications.$inferSelect;

export const projectPhases = pgTable("project_phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const insertProjectPhaseSchema = createInsertSchema(projectPhases).omit({ id: true });
export type InsertProjectPhase = z.infer<typeof insertProjectPhaseSchema>;
export type ProjectPhase = typeof projectPhases.$inferSelect;

export const projectPhasesTrades = pgTable("project_phases_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectPhaseId: varchar("project_phase_id").notNull(),
  tradeId: varchar("trade_id").notNull(),
  requiredWorkerCount: integer("required_worker_count").notNull().default(1),
});

export const insertProjectPhaseTradeSchema = createInsertSchema(projectPhasesTrades).omit({ id: true });
export type InsertProjectPhaseTrade = z.infer<typeof insertProjectPhaseTradeSchema>;
export type ProjectPhaseTrade = typeof projectPhasesTrades.$inferSelect;

export const workerSkills = pgTable("worker_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  skillId: varchar("skill_id").notNull(),
  proficiencyLevel: integer("proficiency_level").notNull().default(1),
});

export const insertWorkerSkillSchema = createInsertSchema(workerSkills).omit({ id: true });
export type InsertWorkerSkill = z.infer<typeof insertWorkerSkillSchema>;
export type WorkerSkill = typeof workerSkills.$inferSelect;

export const workerCertifications = pgTable("worker_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  certificationId: varchar("certification_id").notNull(),
  earnedDate: text("earned_date"),
  expiryDate: text("expiry_date"),
});

export const insertWorkerCertificationSchema = createInsertSchema(workerCertifications).omit({ id: true });
export type InsertWorkerCertification = z.infer<typeof insertWorkerCertificationSchema>;
export type WorkerCertification = typeof workerCertifications.$inferSelect;
