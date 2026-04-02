/**
 * GRISEUS — Rate Limiting Middleware
 * In-memory rate limiter (no Redis dependency needed for current scale).
 */
import type { Request, Response, NextFunction } from "express";
import { RateLimitError } from "../errors";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyFn?: (req: Request) => string; // Custom key function
}

function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every minute
  setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now > entry.resetAt) store.delete(key);
    });
  }, 60_000);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyFn
      ? config.keyFn(req)
      : req.ip || req.socket.remoteAddress || "unknown";

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + config.windowMs });
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", config.maxRequests - 1);
      return next();
    }

    entry.count++;

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", 0);
      return next(new RateLimitError());
    }

    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", config.maxRequests - entry.count);
    next();
  };
}

// ═══════════════════════════════════════════════════════════
// Pre-configured Rate Limiters
// ═══════════════════════════════════════════════════════════

/** Login endpoint: 5 attempts per minute per IP */
export const loginRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
});

/** Agent chat: 20 requests per minute per IP */
export const agentChatRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
});

/** General API: 100 requests per minute per IP */
export const apiRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
});

/** Stock mutations: 30 per minute per IP */
export const stockWriteRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
});
