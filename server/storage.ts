import { type User, type InsertUser, users, passwordResetCodes } from "@shared/schema";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  // Password reset helpers
  async deleteExpiredResetCodes(userId: string): Promise<void> {
    // no-op for now, codes expire naturally
  }

  async createPasswordResetCode(userId: string, code: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetCodes).values({ userId, code, expiresAt });
  }

  async getValidResetCode(userId: string, code: string): Promise<any | null> {
    const [row] = await db.select().from(passwordResetCodes)
      .where(and(
        eq(passwordResetCodes.userId, userId),
        eq(passwordResetCodes.code, code),
        eq(passwordResetCodes.used, false),
        gt(passwordResetCodes.expiresAt, new Date()),
      ));
    return row || null;
  }

  async markResetCodeUsed(id: string): Promise<void> {
    await db.update(passwordResetCodes).set({ used: true }).where(eq(passwordResetCodes.id, id));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
