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

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Session setup
const isProduction = process.env.NODE_ENV === "production";
const MemoryStore = createMemoryStore(session);

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || "griseus-dev-secret-change-in-prod",
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

// Passport setup
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

passport.serializeUser((user: any, done) => done(null, user.id));
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

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { seedDatabase } = await import("./seed");
  await seedDatabase();
  const { ensureTables } = await import("./db");
  await ensureTables();

  // ADM — Agent Decision Memory decay (6 saatte bir)
  const { applyDecay } = await import("./lib/agent-memory");
  setInterval(() => {
    applyDecay().catch(err => console.error("[ADM] Decay error:", err));
  }, 6 * 60 * 60 * 1000);

  // DSE — Dynamic Seasonality Engine başlat
  const { initDSE } = await import("./lib/dynamic-seasonality");
  await initDSE().catch(err => console.error("[DSE] Init error:", err));

  // ATE — Adaptive Threshold Engine başlat
  const { initATE, updateBehaviorProfile } = await import("./lib/adaptive-thresholds");
  await initATE().catch(err => console.error("[ATE] Init error:", err));
  // Davranış analizi 30 dakikada bir
  setInterval(() => {
    updateBehaviorProfile().catch(err => console.error("[ATE] Behavior update error:", err));
  }, 30 * 60 * 1000);

  // OLE — Outcome Learning Engine başlat
  const { rebuildConfidenceCache, autoVerifyOutcomes } = await import("./lib/outcome-engine");
  await rebuildConfidenceCache().catch(err => console.error("[OLE] Cache rebuild error:", err));
  // Periyodik auto-verify (15 dakikada bir)
  const { OUTCOME_CHECK_FREQUENCY } = await import("./lib/constants");
  setInterval(() => {
    autoVerifyOutcomes().catch(err => console.error("[OLE] Auto-verify error:", err));
  }, OUTCOME_CHECK_FREQUENCY);

  initWebSocket(httpServer);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
