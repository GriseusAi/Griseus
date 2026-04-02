import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  InsufficientStockError,
  ExternalServiceError,
  RateLimitError,
} from "./errors";

describe("Error Classes", () => {
  describe("AppError", () => {
    it("should create error with correct properties", () => {
      const err = new AppError("test error", 400, "TEST_ERROR");
      expect(err.message).toBe("test error");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("TEST_ERROR");
      expect(err.isOperational).toBe(true);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
    });

    it("should support non-operational errors", () => {
      const err = new AppError("system failure", 500, "SYSTEM_ERROR", false);
      expect(err.isOperational).toBe(false);
    });
  });

  describe("ValidationError", () => {
    it("should create 400 error with details", () => {
      const err = new ValidationError("bad input", { email: ["Email geçersiz"] });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details.email).toEqual(["Email geçersiz"]);
    });

    it("should work without details", () => {
      const err = new ValidationError("bad input");
      expect(err.details).toEqual({});
    });
  });

  describe("NotFoundError", () => {
    it("should create 404 error with resource name", () => {
      const err = new NotFoundError("Ürün", "ELT.7-11");
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe("Ürün bulunamadı: ELT.7-11");
    });

    it("should work without identifier", () => {
      const err = new NotFoundError("BOM");
      expect(err.message).toBe("BOM bulunamadı");
    });
  });

  describe("AuthenticationError", () => {
    it("should create 401 error", () => {
      const err = new AuthenticationError();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe("AUTHENTICATION_REQUIRED");
    });
  });

  describe("AuthorizationError", () => {
    it("should create 403 error", () => {
      const err = new AuthorizationError();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
    });
  });

  describe("InsufficientStockError", () => {
    it("should include available and requested quantities", () => {
      const err = new InsufficientStockError("Depoda", 10, 50);
      expect(err.statusCode).toBe(400);
      expect(err.available).toBe(10);
      expect(err.requested).toBe(50);
      expect(err.message).toContain("Mevcut: 10");
      expect(err.message).toContain("İstenen: 50");
    });
  });

  describe("ExternalServiceError", () => {
    it("should create 502 non-operational error", () => {
      const err = new ExternalServiceError("Anthropic", "rate limit");
      expect(err.statusCode).toBe(502);
      expect(err.isOperational).toBe(false);
      expect(err.service).toBe("Anthropic");
    });
  });

  describe("RateLimitError", () => {
    it("should create 429 error", () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
    });
  });
});
