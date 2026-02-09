import {
  type User, type InsertUser,
  type Worker, type InsertWorker,
  type Project, type InsertProject,
  type WorkOrder, type InsertWorkOrder,
  type JobApplication, type InsertJobApplication,
  type ProjectAssignment, type InsertProjectAssignment,
  type ChatMessage, type InsertChatMessage,
  users, workers, projects, workOrders, jobApplications, projectAssignments, chatMessages,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
