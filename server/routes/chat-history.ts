import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { chatSessions, chatMessages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

// GET /chat/sessions — list recent sessions
router.get("/chat/sessions", async (_req: Request, res: Response) => {
  try {
    const sessions = await db
      .select()
      .from(chatSessions)
      .orderBy(desc(chatSessions.updatedAt))
      .limit(50);
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/sessions — create a new session
router.post("/chat/sessions", async (req: Request, res: Response) => {
  try {
    const { title, mode } = req.body as { title?: string; mode?: string };
    const [session] = await db
      .insert(chatSessions)
      .values({ title: title || "Yeni Sohbet", mode: mode || "normal" })
      .returning();
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/sessions/:id/messages — get all messages in a session
router.get("/chat/sessions/:id/messages", async (req: Request, res: Response) => {
  try {
    const id = routeParam(req.params.id);
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(chatMessages.createdAt);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/sessions/:id/messages — add a message to a session
router.post("/chat/sessions/:id/messages", async (req: Request, res: Response) => {
  try {
    const id = routeParam(req.params.id);
    const { role, content, mode, toolsUsed, agentsUsed } = req.body as {
      role: string;
      content: string;
      mode?: string;
      toolsUsed?: string[];
      agentsUsed?: string[];
    };

    const [msg] = await db
      .insert(chatMessages)
      .values({
        sessionId: id,
        role,
        content,
        mode,
        toolsUsed: toolsUsed || null,
        agentsUsed: agentsUsed || null,
      })
      .returning();

    // Update session title from first user message + update timestamp
    const allMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(chatMessages.createdAt);

    if (allMessages.length === 1 && role === "user") {
      // First message — use it as title (truncated)
      const title = content.length > 60 ? content.slice(0, 57) + "..." : content;
      await db.update(chatSessions).set({ title, updatedAt: new Date() }).where(eq(chatSessions.id, id));
    } else {
      await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, id));
    }

    res.json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /chat/sessions/:id — rename a session
router.patch("/chat/sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = routeParam(req.params.id);
    const { title } = req.body as { title?: string };
    if (!title?.trim()) return res.status(400).json({ error: "title gerekli" });
    const [updated] = await db
      .update(chatSessions)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(eq(chatSessions.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /chat/sessions/:id — delete a session and its messages
router.delete("/chat/sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = routeParam(req.params.id);
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
    await db.delete(chatSessions).where(eq(chatSessions.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
