import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requirePermission } from "./auth";
import { AuthenticationError, AuthorizationError } from "../errors";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    isAuthenticated: () => false,
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe("Auth Middleware", () => {
  describe("requireAuth", () => {
    it("should call next() for authenticated users", () => {
      const req = mockReq({ isAuthenticated: () => true });
      const next = vi.fn();
      requireAuth(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should pass AuthenticationError for unauthenticated users", () => {
      const req = mockReq({ isAuthenticated: () => false });
      const next = vi.fn();
      requireAuth(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe("requirePermission", () => {
    it("should allow CEO to access stock:write", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "1", email: "ceo@test.com", role: "ceo", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("stock:write")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should deny viewer access to stock:write", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "2", email: "viewer@test.com", role: "viewer", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("stock:write")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it("should allow viewer access to stock:read", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "2", email: "viewer@test.com", role: "viewer", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("stock:read")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should allow depo role to access component:write", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "3", email: "depo@test.com", role: "depo", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("component:write")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should deny depo role access to agent:chat", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "3", email: "depo@test.com", role: "depo", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("agent:chat")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it("should allow if any of multiple permissions match", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "3", email: "depo@test.com", role: "depo", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("agent:chat", "stock:read")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should handle unknown role", () => {
      const req = mockReq({
        isAuthenticated: () => true,
        user: { id: "4", email: "x@test.com", role: "unknown_role", password: "" } as any,
      });
      const next = vi.fn();
      requirePermission("stock:read")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it("should deny unauthenticated users", () => {
      const req = mockReq({ isAuthenticated: () => false });
      const next = vi.fn();
      requirePermission("stock:read")(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });
});
