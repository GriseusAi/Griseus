/**
 * GRISEUS — Authentication & Authorization Middleware
 * Role-based access control (RBAC) for API endpoints.
 */
import type { Request, Response, NextFunction } from "express";
import type { User } from "@shared/schema";
import { AuthenticationError, AuthorizationError } from "../errors";

// ═══════════════════════════════════════════════════════════
// Role Definitions
// ═══════════════════════════════════════════════════════════

export type UserRole = "ceo" | "uretim_sefi" | "depo" | "satin_alma" | "viewer";

// Permissions map: which roles can access which operations
const ROLE_PERMISSIONS: Record<UserRole, Set<string>> = {
  ceo: new Set([
    "stock:read", "stock:write", "stock:reset",
    "bom:read",
    "agent:chat",
    "planning:read", "planning:write", "planning:import",
    "purchase:read", "purchase:approve",
    "component:read", "component:write",
    "admin:read",
  ]),
  uretim_sefi: new Set([
    "stock:read", "stock:write",
    "bom:read",
    "agent:chat",
    "planning:read",
    "purchase:read",
    "component:read", "component:write",
  ]),
  depo: new Set([
    "stock:read", "stock:write",
    "bom:read",
    "component:read", "component:write",
    "purchase:read",
  ]),
  satin_alma: new Set([
    "stock:read",
    "bom:read",
    "component:read",
    "purchase:read", "purchase:approve",
    "planning:read",
  ]),
  viewer: new Set([
    "stock:read",
    "bom:read",
    "component:read",
    "planning:read",
    "purchase:read",
  ]),
};

// ═══════════════════════════════════════════════════════════
// Middleware Functions
// ═══════════════════════════════════════════════════════════

/**
 * Require authentication — rejects unauthenticated requests.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return next(new AuthenticationError());
  }
  next();
}

/**
 * Require specific permission(s) — checks user role against allowed permissions.
 * Usage: requirePermission("stock:write") or requirePermission("stock:write", "agent:chat")
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return next(new AuthenticationError());
    }

    const user = req.user as User;
    const role = (user.role || "viewer") as UserRole;
    const userPermissions = ROLE_PERMISSIONS[role];

    if (!userPermissions) {
      return next(new AuthorizationError(`Bilinmeyen rol: ${role}`));
    }

    const hasPermission = permissions.some((p) => userPermissions.has(p));
    if (!hasPermission) {
      return next(new AuthorizationError(
        `Bu işlem '${permissions.join("' veya '")}' yetkisi gerektirir. Rolünüz: ${role}`
      ));
    }

    next();
  };
}

/**
 * Helper to get typed user from request.
 */
export function getAuthUser(req: Request): User {
  return req.user as User;
}
