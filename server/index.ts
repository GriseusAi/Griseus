import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { initWebSocket } from "./ws";
import { errorHandler } from "./errors";
import { requestLogger, createLogger } from "./logger";
import { apiRateLimit } from "./middleware/rate-limit";
import type { User } from "@shared/schema";

const log = createLogger("express");
const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ═══════════════════════════════════════════════════════════
// Security Headers & CORS
// ═══════════════════════════════════════════════════════════

const isProduction = process.env.NODE_ENV === "production";

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// CORS — explicit origin whitelist
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || "").split(",").filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || !isProduction)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ═══════════════════════════════════════════════════════════
// Body Parsing
// ═══════════════════════════════════════════════════════════

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ═══════════════════════════════════════════════════════════
// Session — enforced secret in production
// ═══════════════════════════════════════════════════════════

if (isProduction && !process.env.SESSION_SECRET) {
  log.warn("SESSION_SECRET ayarlanmamış — rastgele secret üretiliyor. Kalıcılık için env var ekleyin.");
}

// Production'da env var yoksa rastgele üret (restart'larda session'lar düşer ama crash etmez)
const sessionSecret = process.env.SESSION_SECRET || (isProduction
  ? require("crypto").randomBytes(32).toString("hex")
  : "griseus-dev-secret-local-only");

const MemoryStore = createMemoryStore(session);

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 86400000 }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProduction,
      sameSite: "lax",
      httpOnly: true,
    },
  }),
);

// ═══════════════════════════════════════════════════════════
// Passport Authentication
// ═══════════════════════════════════════════════════════════

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, buf) => {
      if (err) reject(err);
      resolve(`${buf.toString("hex")}.${salt}`);
    });
  });
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  return new Promise((resolve, reject) => {
    scrypt(supplied, salt, 64, (err, buf) => {
      if (err) reject(err);
      resolve(timingSafeEqual(Buffer.from(hashed, "hex"), buf));
    });
  });
}

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) return done(null, false, { message: "Invalid email or password" });
      const match = await comparePasswords(password, user.password);
      if (!match) return done(null, false, { message: "Invalid email or password" });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

passport.serializeUser((user: Express.User, done) => done(null, (user as User).id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

// ═══════════════════════════════════════════════════════════
// Logging & Rate Limiting
// ═══════════════════════════════════════════════════════════

app.use(requestLogger);
app.use("/api", apiRateLimit);

// ═══════════════════════════════════════════════════════════
// Routes & Error Handler
// ═══════════════════════════════════════════════════════════

(async () => {
  const { seedDatabase } = await import("./seed");
  await seedDatabase();
  initWebSocket(httpServer);
  await registerRoutes(httpServer, app);

  // Unified error handler — must be AFTER routes
  app.use(errorHandler);

  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log.info(`serving on port ${port}`);
  });
})();

// Backward compat export for routes.ts
export function log_compat(message: string, source = "express") {
  createLogger(source).info(message);
}
