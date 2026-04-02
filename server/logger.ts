/**
 * GRISEUS — Structured Logging System
 * JSON-formatted logs with levels, context, and request tracking.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"];

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= MIN_LEVEL;
}

function formatLog(entry: LogEntry): string {
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(entry);
  }

  // Dev: human-readable format
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const levelColors: Record<LogLevel, string> = {
    debug: "\x1b[36m",  // cyan
    info: "\x1b[32m",   // green
    warn: "\x1b[33m",   // yellow
    error: "\x1b[31m",  // red
  };
  const reset = "\x1b[0m";
  const color = levelColors[entry.level];

  const { timestamp: _, level: __, source, message, ...extra } = entry;
  const extraStr = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  return `${time} ${color}${entry.level.toUpperCase().padEnd(5)}${reset} [${source}] ${message}${extraStr}`;
}

function writeLog(level: LogLevel, source: string, message: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    ...data,
  };

  const formatted = formatLog(entry);
  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

// ═══════════════════════════════════════════════════════════
// Logger Factory
// ═══════════════════════════════════════════════════════════

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(source: string): Logger {
  return {
    debug: (msg, data) => writeLog("debug", source, msg, data),
    info: (msg, data) => writeLog("info", source, msg, data),
    warn: (msg, data) => writeLog("warn", source, msg, data),
    error: (msg, data) => writeLog("error", source, msg, data),
  };
}

// Default logger for backward compatibility
export const logger = createLogger("app");

// ═══════════════════════════════════════════════════════════
// Request Logger Middleware
// ═══════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from "express";

const httpLogger = createLogger("http");

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;

    const duration = Date.now() - start;
    const level: LogLevel = res.statusCode >= 500 ? "error"
      : res.statusCode >= 400 ? "warn"
      : "info";

    httpLogger[level](`${req.method} ${path} ${res.statusCode}`, {
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get("user-agent"),
    });
  });

  next();
}
