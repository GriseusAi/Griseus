import {
  type User, type InsertUser,
  type Worker, type InsertWorker,
  type Project, type InsertProject,
  type WorkOrder, type InsertWorkOrder,
  type JobApplication, type InsertJobApplication,
  type ProjectAssignment, type InsertProjectAssignment,
  type ChatMessage, type InsertChatMessage,
  type Trade, type InsertTrade,
  type Skill, type InsertSkill,
  type Certification, type InsertCertification,
  type TradeCertification, type InsertTradeCertification,
  type ProjectPhase, type InsertProjectPhase,
  type ProjectPhaseTrade, type InsertProjectPhaseTrade,
  type WorkerSkill, type InsertWorkerSkill,
  type WorkerCertification, type InsertWorkerCertification,
  users, workers, projects, workOrders, jobApplications, projectAssignments, chatMessages,
  trades, skills, certifications, tradesCertifications, projectPhases, projectPhasesTrades,
  workerSkills, workerCertifications,
} from "@shared/schema";
import { db } from "./db";
import { eq, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getWorkers(): Promise<Worker[]>;
  getWorker(id: string): Promise<Worker | undefined>;
  createWorker(worker: InsertWorker): Promise<Worker>;

  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;

  getWorkOrders(): Promise<WorkOrder[]>;
  getWorkOrder(id: string): Promise<WorkOrder | undefined>;
  createWorkOrder(workOrder: InsertWorkOrder): Promise<WorkOrder>;
  updateWorkOrderStatus(id: string, status: string): Promise<WorkOrder | undefined>;

  getJobApplicationsByWorker(workerId: string): Promise<JobApplication[]>;
  createJobApplication(application: InsertJobApplication): Promise<JobApplication>;

  getProjectAssignmentsByProject(projectId: string): Promise<ProjectAssignment[]>;
  getProjectAssignmentsByWorker(workerId: string): Promise<ProjectAssignment[]>;
  createProjectAssignment(assignment: InsertProjectAssignment): Promise<ProjectAssignment>;

  getChatMessagesByProject(projectId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Ontology
  getTrades(): Promise<Trade[]>;
  getTrade(id: string): Promise<Trade | undefined>;
  createTrade(trade: InsertTrade): Promise<Trade>;

  getSkills(): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | undefined>;
  getSkillsByTrade(tradeId: string): Promise<Skill[]>;
  createSkill(skill: InsertSkill): Promise<Skill>;

  getCertifications(): Promise<Certification[]>;
  getCertification(id: string): Promise<Certification | undefined>;
  createCertification(cert: InsertCertification): Promise<Certification>;

  getCertificationsByTrade(tradeId: string): Promise<TradeCertification[]>;
  getTradesByCertification(certificationId: string): Promise<TradeCertification[]>;
  createTradeCertification(link: InsertTradeCertification): Promise<TradeCertification>;

  getProjectPhases(): Promise<ProjectPhase[]>;
  getProjectPhase(id: string): Promise<ProjectPhase | undefined>;
  createProjectPhase(phase: InsertProjectPhase): Promise<ProjectPhase>;

  getTradesByPhase(projectPhaseId: string): Promise<ProjectPhaseTrade[]>;
  createProjectPhaseTrade(link: InsertProjectPhaseTrade): Promise<ProjectPhaseTrade>;

  getWorkerSkills(workerId: string): Promise<WorkerSkill[]>;
  createWorkerSkill(ws: InsertWorkerSkill): Promise<WorkerSkill>;
  updateWorkerSkillProficiency(id: string, proficiencyLevel: number): Promise<WorkerSkill | undefined>;

  getWorkerCertifications(workerId: string): Promise<WorkerCertification[]>;
  createWorkerCertification(wc: InsertWorkerCertification): Promise<WorkerCertification>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getWorkers(): Promise<Worker[]> {
    return db.select().from(workers);
  }

  async getWorker(id: string): Promise<Worker | undefined> {
    const [worker] = await db.select().from(workers).where(eq(workers.id, id));
    return worker;
  }

  async createWorker(worker: InsertWorker): Promise<Worker> {
    const [created] = await db.insert(workers).values(worker).returning();
    return created;
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async getWorkOrders(): Promise<WorkOrder[]> {
    return db.select().from(workOrders);
  }

  async getWorkOrder(id: string): Promise<WorkOrder | undefined> {
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id));
    return wo;
  }

  async createWorkOrder(workOrder: InsertWorkOrder): Promise<WorkOrder> {
    const [created] = await db.insert(workOrders).values(workOrder).returning();
    return created;
  }

  async updateWorkOrderStatus(id: string, status: string): Promise<WorkOrder | undefined> {
    const [updated] = await db
      .update(workOrders)
      .set({ status })
      .where(eq(workOrders.id, id))
      .returning();
    return updated;
  }

  async getJobApplicationsByWorker(workerId: string): Promise<JobApplication[]> {
    return db.select().from(jobApplications).where(eq(jobApplications.workerId, workerId));
  }

  async createJobApplication(application: InsertJobApplication): Promise<JobApplication> {
    const [created] = await db.insert(jobApplications).values(application).returning();
    return created;
  }

  async getProjectAssignmentsByProject(projectId: string): Promise<ProjectAssignment[]> {
    return db.select().from(projectAssignments).where(eq(projectAssignments.projectId, projectId));
  }

  async getProjectAssignmentsByWorker(workerId: string): Promise<ProjectAssignment[]> {
    return db.select().from(projectAssignments).where(eq(projectAssignments.workerId, workerId));
  }

  async createProjectAssignment(assignment: InsertProjectAssignment): Promise<ProjectAssignment> {
    const [created] = await db.insert(projectAssignments).values(assignment).returning();
    return created;
  }

  async getChatMessagesByProject(projectId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.projectId, projectId))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }

  // ── Ontology: Trades ────────────────────────────────────────────────

  async getTrades(): Promise<Trade[]> {
    return db.select().from(trades);
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade;
  }

  async createTrade(trade: InsertTrade): Promise<Trade> {
    const [created] = await db.insert(trades).values(trade).returning();
    return created;
  }

  // ── Ontology: Skills ────────────────────────────────────────────────

  async getSkills(): Promise<Skill[]> {
    return db.select().from(skills);
  }

  async getSkill(id: string): Promise<Skill | undefined> {
    const [skill] = await db.select().from(skills).where(eq(skills.id, id));
    return skill;
  }

  async getSkillsByTrade(tradeId: string): Promise<Skill[]> {
    return db.select().from(skills).where(eq(skills.tradeId, tradeId));
  }

  async createSkill(skill: InsertSkill): Promise<Skill> {
    const [created] = await db.insert(skills).values(skill).returning();
    return created;
  }

  // ── Ontology: Certifications ────────────────────────────────────────

  async getCertifications(): Promise<Certification[]> {
    return db.select().from(certifications);
  }

  async getCertification(id: string): Promise<Certification | undefined> {
    const [cert] = await db.select().from(certifications).where(eq(certifications.id, id));
    return cert;
  }

  async createCertification(cert: InsertCertification): Promise<Certification> {
    const [created] = await db.insert(certifications).values(cert).returning();
    return created;
  }

  // ── Ontology: Trades ↔ Certifications ──────────────────────────────

  async getCertificationsByTrade(tradeId: string): Promise<TradeCertification[]> {
    return db.select().from(tradesCertifications).where(eq(tradesCertifications.tradeId, tradeId));
  }

  async getTradesByCertification(certificationId: string): Promise<TradeCertification[]> {
    return db.select().from(tradesCertifications).where(eq(tradesCertifications.certificationId, certificationId));
  }

  async createTradeCertification(link: InsertTradeCertification): Promise<TradeCertification> {
    const [created] = await db.insert(tradesCertifications).values(link).returning();
    return created;
  }

  // ── Ontology: Project Phases ────────────────────────────────────────

  async getProjectPhases(): Promise<ProjectPhase[]> {
    return db.select().from(projectPhases).orderBy(asc(projectPhases.orderIndex));
  }

  async getProjectPhase(id: string): Promise<ProjectPhase | undefined> {
    const [phase] = await db.select().from(projectPhases).where(eq(projectPhases.id, id));
    return phase;
  }

  async createProjectPhase(phase: InsertProjectPhase): Promise<ProjectPhase> {
    const [created] = await db.insert(projectPhases).values(phase).returning();
    return created;
  }

  // ── Ontology: Project Phases ↔ Trades ──────────────────────────────

  async getTradesByPhase(projectPhaseId: string): Promise<ProjectPhaseTrade[]> {
    return db.select().from(projectPhasesTrades).where(eq(projectPhasesTrades.projectPhaseId, projectPhaseId));
  }

  async createProjectPhaseTrade(link: InsertProjectPhaseTrade): Promise<ProjectPhaseTrade> {
    const [created] = await db.insert(projectPhasesTrades).values(link).returning();
    return created;
  }

  // ── Ontology: Worker Skills ─────────────────────────────────────────

  async getWorkerSkills(workerId: string): Promise<WorkerSkill[]> {
    return db.select().from(workerSkills).where(eq(workerSkills.workerId, workerId));
  }

  async createWorkerSkill(ws: InsertWorkerSkill): Promise<WorkerSkill> {
    const [created] = await db.insert(workerSkills).values(ws).returning();
    return created;
  }

  async updateWorkerSkillProficiency(id: string, proficiencyLevel: number): Promise<WorkerSkill | undefined> {
    const [updated] = await db
      .update(workerSkills)
      .set({ proficiencyLevel })
      .where(eq(workerSkills.id, id))
      .returning();
    return updated;
  }

  // ── Ontology: Worker Certifications ─────────────────────────────────

  async getWorkerCertifications(workerId: string): Promise<WorkerCertification[]> {
    return db.select().from(workerCertifications).where(eq(workerCertifications.workerId, workerId));
  }

  async createWorkerCertification(wc: InsertWorkerCertification): Promise<WorkerCertification> {
    const [created] = await db.insert(workerCertifications).values(wc).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
