import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
