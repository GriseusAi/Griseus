import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, doublePrecision, jsonb, serial, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(),
  name: text("name"),
  companyName: text("company_name"),
  industry: text("industry"),
  position: text("position"),
  trade: text("trade"),
  yearsExperience: integer("years_experience"),
  location: text("location"),
  companyType: text("company_type"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });

export const registerCompanySchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.literal("company"),
  name: z.string().min(1, "Contact name is required"),
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  position: z.string().min(1, "Position is required"),
});

export const registerWorkerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.literal("worker"),
  name: z.string().min(1, "Full name is required"),
  trade: z.string().min(1, "Trade is required"),
  yearsExperience: z.number().int().min(0, "Years of experience must be 0 or more"),
  location: z.string().min(1, "Location is required"),
});

export const registerSchema = z.discriminatedUnion("role", [
  registerCompanySchema,
  registerWorkerSchema,
]);

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
  website: text("website"),
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

export const tradeAdjacencies = pgTable("trade_adjacencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTradeId: varchar("source_trade_id").notNull(),
  targetTradeId: varchar("target_trade_id").notNull(),
  requiredCertificationId: varchar("required_certification_id"),
  transitionDifficulty: text("transition_difficulty").notNull(), // "easy" | "moderate" | "hard"
  description: text("description"),
});

export const insertTradeAdjacencySchema = createInsertSchema(tradeAdjacencies).omit({ id: true });
export type InsertTradeAdjacency = z.infer<typeof insertTradeAdjacencySchema>;
export type TradeAdjacency = typeof tradeAdjacencies.$inferSelect;

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

// --- Certification Expiry Tracking ---

export const certificationRequirements = pgTable("certification_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificationId: varchar("certification_id").notNull(),
  validityPeriod: integer("validity_period"), // months, null = never expires
  renewalProcess: text("renewal_process"),
  renewalCost: doublePrecision("renewal_cost"), // approximate USD
  continuingEducationHours: integer("continuing_education_hours"),
});

export const insertCertificationRequirementSchema = createInsertSchema(certificationRequirements).omit({ id: true });
export type InsertCertificationRequirement = z.infer<typeof insertCertificationRequirementSchema>;
export type CertificationRequirement = typeof certificationRequirements.$inferSelect;

// --- Wage Intelligence ---

export const wageData = pgTable("wage_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull(),
  region: text("region").notNull(),
  experienceLevel: text("experience_level").notNull(), // "entry" | "mid" | "senior" | "master"
  hourlyRateMin: doublePrecision("hourly_rate_min").notNull(),
  hourlyRateMax: doublePrecision("hourly_rate_max").notNull(),
  overtimeMultiplier: doublePrecision("overtime_multiplier").notNull().default(1.5),
  perDiemDaily: doublePrecision("per_diem_daily"),
  dataSource: text("data_source"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertWageDataSchema = createInsertSchema(wageData).omit({ id: true, lastUpdated: true });
export type InsertWageData = z.infer<typeof insertWageDataSchema>;
export type WageData = typeof wageData.$inferSelect;

// --- Phase-Trade Requirements Matrix ---

export const phaseTradeRequirements = pgTable("phase_trade_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectPhaseId: varchar("project_phase_id").notNull(),
  tradeId: varchar("trade_id").notNull(),
  workersNeeded: integer("workers_needed").notNull().default(1),
  priority: text("priority").notNull(), // "critical" | "important" | "supporting"
  durationWeeks: integer("duration_weeks").notNull(),
  requiredCertifications: text("required_certifications"), // comma-separated certification names for this phase-trade combo
  notes: text("notes"),
});

export const insertPhaseTradeRequirementSchema = createInsertSchema(phaseTradeRequirements).omit({ id: true });
export type InsertPhaseTradeRequirement = z.infer<typeof insertPhaseTradeRequirementSchema>;
export type PhaseTradeRequirement = typeof phaseTradeRequirements.$inferSelect;

// --- Project Schedules ---

export const projectSchedules = pgTable("project_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  projectId: varchar("project_id"),
  phaseName: text("phase_name").notNull(),
  phaseStartDate: text("phase_start_date").notNull(),
  sourcingDeadline: text("sourcing_deadline").notNull(),
  tradesNeeded: text("trades_needed").array().default(sql`'{}'::text[]`),
  status: text("status").notNull().default("planning"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectScheduleSchema = createInsertSchema(projectSchedules).omit({ id: true, createdAt: true });
export type InsertProjectSchedule = z.infer<typeof insertProjectScheduleSchema>;
export type ProjectSchedule = typeof projectSchedules.$inferSelect;

// --- Password Reset Codes ---

export const passwordResetCodes = pgTable("password_reset_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});

// --- Service Team Scheduling ---

export const serviceAppointments = pgTable("service_appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  projectId: varchar("project_id"),
  assigneeId: varchar("assignee_id"),
  title: text("title").notNull(),
  description: text("description"),
  appointmentType: text("appointment_type").notNull(), // "installation" | "maintenance" | "repair" | "inspection"
  status: text("status").notNull().default("scheduled"), // "scheduled" | "in_progress" | "completed" | "cancelled"
  priority: text("priority").notNull().default("normal"), // "low" | "normal" | "high" | "urgent"
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  estimatedDuration: integer("estimated_duration").notNull().default(60), // minutes
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertServiceAppointmentSchema = createInsertSchema(serviceAppointments).omit({ id: true, createdAt: true });
export type InsertServiceAppointment = z.infer<typeof insertServiceAppointmentSchema>;
export type ServiceAppointment = typeof serviceAppointments.$inferSelect;

// --- Manufacturing Ontology Engine ---

export const ontologyObjects = pgTable("ontology_objects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  objectType: text("object_type").notNull(), // "factory" | "location" | "production_line" | "operator" | "shift" | "task"
  objectId: varchar("object_id").notNull(), // references actual entity or internal key
  name: text("name").notNull(),
  properties: jsonb("properties").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOntologyObjectSchema = createInsertSchema(ontologyObjects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOntologyObject = z.infer<typeof insertOntologyObjectSchema>;
export type OntologyObject = typeof ontologyObjects.$inferSelect;

export const ontologyLinks = pgTable("ontology_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromType: text("from_type").notNull(),
  fromId: varchar("from_id").notNull(),
  linkType: text("link_type").notNull(), // "BELONGS_TO" | "ASSIGNED_TO" | "RUNS_ON" | "LOCATED_IN" | "WORKS_ON" | "PART_OF"
  toType: text("to_type").notNull(),
  toId: varchar("to_id").notNull(),
});

export const insertOntologyLinkSchema = createInsertSchema(ontologyLinks).omit({ id: true });
export type InsertOntologyLink = z.infer<typeof insertOntologyLinkSchema>;
export type OntologyLink = typeof ontologyLinks.$inferSelect;

export const ontologyActions = pgTable("ontology_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionType: text("action_type").notNull(), // "ASSIGN_OPERATOR" | "REASSIGN_SHIFT" | "FLAG_UNDERPERFORMANCE" | "RUN_SIMULATION"
  actorId: varchar("actor_id"),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  payload: jsonb("payload").default({}),
  result: jsonb("result").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOntologyActionSchema = createInsertSchema(ontologyActions).omit({ id: true, createdAt: true });
export type InsertOntologyAction = z.infer<typeof insertOntologyActionSchema>;
export type OntologyAction = typeof ontologyActions.$inferSelect;

// =============================================
// --- Griseus Engine: Katman 02 - Ontology Database Schema ---
// =============================================

export const facilities = pgTable("facilities", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  name: text("name").notNull(),
  type: text("type"), // factory, warehouse, office
  location: text("location"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFacilitySchema = createInsertSchema(facilities).omit({ id: true, createdAt: true });
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type Facility = typeof facilities.$inferSelect;

export const productionLines = pgTable("production_lines", {
  id: serial("id").primaryKey(),
  facilityId: integer("facility_id").references(() => facilities.id),
  name: text("name").notNull(),
  type: text("type"), // elektrikli, gazli
  workerCount: integer("worker_count"),
  capacityUnitTimeMin: numeric("capacity_unit_time_min"), // teorik kapasite birim suresi dakika
  currentUnitTimeMin: numeric("current_unit_time_min"), // mevcut birim suresi dakika
  dailyHours: numeric("daily_hours").default("9"),
  monthlyDays: integer("monthly_days").default(22),
  productionMonths: integer("production_months").default(10),
  status: text("status").default("active"),
});

export const insertProductionLineSchema = createInsertSchema(productionLines).omit({ id: true });
export type InsertProductionLine = z.infer<typeof insertProductionLineSchema>;
export type ProductionLine = typeof productionLines.$inferSelect;

export const geWorkers = pgTable("ge_workers", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  name: text("name").notNull(),
  department: text("department"),
  hireDate: date("hire_date"),
  status: text("status").default("active"),
  trustScore: numeric("trust_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGeWorkerSchema = createInsertSchema(geWorkers).omit({ id: true, createdAt: true });
export type InsertGeWorker = z.infer<typeof insertGeWorkerSchema>;
export type GeWorker = typeof geWorkers.$inferSelect;

export const workerCapabilities = pgTable("worker_capabilities", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").references(() => geWorkers.id),
  capabilityName: text("capability_name").notNull(),
  capabilityType: text("capability_type"), // skill, certification, authorization
  level: integer("level").default(1),
});

export const insertWorkerCapabilitySchema = createInsertSchema(workerCapabilities).omit({ id: true });
export type InsertWorkerCapability = z.infer<typeof insertWorkerCapabilitySchema>;
export type WorkerCapability = typeof workerCapabilities.$inferSelect;

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  sku: text("sku"),
  name: text("name").notNull(),
  category: text("category"),
  baseUnitTimeMin: numeric("base_unit_time_min"),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const operations = pgTable("operations", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id").references(() => productionLines.id),
  productId: integer("product_id").references(() => products.id),
  workOrderNo: text("work_order_no"),
  serialRange: text("serial_range"),
  plannedQty: integer("planned_qty"),
  actualQty: integer("actual_qty"),
  plannedDate: date("planned_date"),
  actualDate: date("actual_date"),
  status: text("status").default("completed"),
  notes: text("notes"),
});

export const insertOperationSchema = createInsertSchema(operations).omit({ id: true });
export type InsertOperation = z.infer<typeof insertOperationSchema>;
export type Operation = typeof operations.$inferSelect;

export const capacityMetrics = pgTable("capacity_metrics", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id").references(() => productionLines.id),
  period: text("period"), // weekly, monthly, yearly
  periodValue: text("period_value"), // H40, 2025-01, 2025
  theoreticalMax: integer("theoretical_max"),
  actualOutput: integer("actual_output"),
  utilizationPct: numeric("utilization_pct"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export const insertCapacityMetricSchema = createInsertSchema(capacityMetrics).omit({ id: true, calculatedAt: true });
export type InsertCapacityMetric = z.infer<typeof insertCapacityMetricSchema>;
export type CapacityMetric = typeof capacityMetrics.$inferSelect;

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id").references(() => productionLines.id),
  periodType: text("period_type"), // weekly, monthly
  periodValue: text("period_value"),
  plannedQty: integer("planned_qty"),
  actualQty: integer("actual_qty"),
  deviationPct: numeric("deviation_pct"),
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true });
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  name: text("name").notNull(),
  formula: text("formula"),
  unit: text("unit"),
  category: text("category"),
});

export const insertKpiDefinitionSchema = createInsertSchema(kpiDefinitions).omit({ id: true });
export type InsertKpiDefinition = z.infer<typeof insertKpiDefinitionSchema>;
export type KpiDefinition = typeof kpiDefinitions.$inferSelect;

export const kpiRecords = pgTable("kpi_records", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id").references(() => kpiDefinitions.id),
  period: text("period"),
  target: numeric("target"),
  actual: numeric("actual"),
  achievementPct: numeric("achievement_pct"),
});

export const insertKpiRecordSchema = createInsertSchema(kpiRecords).omit({ id: true });
export type InsertKpiRecord = z.infer<typeof insertKpiRecordSchema>;
export type KpiRecord = typeof kpiRecords.$inferSelect;

// --- Weekly Production Plans (Actions Layer) ---

export const weeklyPlans = pgTable("weekly_plans", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id"),
  weekLabel: text("week_label").notNull(),
  plannedQty: integer("planned_qty").notNull(),
  predictedQty: integer("predicted_qty"),
  actualQty: integer("actual_qty"),
  realizationRate: numeric("realization_rate"),
  predictionAccuracy: numeric("prediction_accuracy"),
  status: text("status").notNull().default("planned"),
  notes: text("notes"),
  deviationReason: text("deviation_reason"), // 'personnel' | 'material' | 'machine' | 'holiday' | 'demand' | 'other'
  deviationNotes: text("deviation_notes"),
  weekNumber: integer("week_number"), // 1-52
  monthNumber: integer("month_number"), // 1-12
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertWeeklyPlanSchema = createInsertSchema(weeklyPlans).omit({ id: true, createdAt: true, completedAt: true });
export type InsertWeeklyPlan = z.infer<typeof insertWeeklyPlanSchema>;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
