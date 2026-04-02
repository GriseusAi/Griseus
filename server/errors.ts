/**
 * GRISEUS — Unified Error Handling System
 * Custom error classes with proper HTTP status codes and structured responses.
 */
import type { Request, Response, NextFunction } from "express";

// ═══════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  readonly details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]> = {}) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const msg = identifier
      ? `${resource} bulunamadı: ${identifier}`
      : `${resource} bulunamadı`;
    super(msg, 404, "NOT_FOUND");
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Kimlik doğrulama gerekli") {
    super(message, 401, "AUTHENTICATION_REQUIRED");
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Bu işlem için yetkiniz yok") {
    super(message, 403, "FORBIDDEN");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class InsufficientStockError extends AppError {
  readonly available: number;
  readonly requested: number;

  constructor(resource: string, available: number, requested: number) {
    super(`${resource} — yeterli stok yok. Mevcut: ${available}, İstenen: ${requested}`, 400, "INSUFFICIENT_STOCK");
    this.available = available;
    this.requested = requested;
  }
}

export class ExternalServiceError extends AppError {
  readonly service: string;

  constructor(service: string, message: string) {
    super(`${service} hatası: ${message}`, 502, "EXTERNAL_SERVICE_ERROR", false);
    this.service = service;
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Çok fazla istek. Lütfen bekleyin.") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

// ═══════════════════════════════════════════════════════════
// Async Handler — catches async errors automatically
// ═══════════════════════════════════════════════════════════

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ═══════════════════════════════════════════════════════════
// Global Error Handler Middleware
// ═══════════════════════════════════════════════════════════

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  // AppError — known operational error
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err instanceof ValidationError && Object.keys(err.details).length > 0) {
      response.error.details = err.details;
    }

    if (!err.isOperational) {
      console.error(`[error] Non-operational error:`, err);
    }

    return res.status(err.statusCode).json(response);
  }

  // Unknown error — log and return 500
  console.error(`[error] Unhandled error:`, err);

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production"
        ? "Sunucu hatası oluştu"
        : err.message || "Internal Server Error",
    },
  });
}
