/**
 * GRISEUS — Zod Validation Middleware
 * Validates request body, query, and params against Zod schemas.
 */
import type { Request, Response, NextFunction } from "express";
import { z, type ZodSchema } from "zod";
import { ValidationError } from "../errors";

type ValidationTarget = "body" | "query" | "params";

/**
 * Create validation middleware for a Zod schema.
 * Usage: validate(myZodSchema) or validate(myZodSchema, "query")
 */
export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const data = req[target];
    const result = schema.safeParse(data);

    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".") || "_root";
        if (!details[path]) details[path] = [];
        details[path].push(issue.message);
      }
      return next(new ValidationError("Geçersiz istek verisi", details));
    }

    // Replace request data with parsed (and coerced) values
    (req as any)[target] = result.data;
    next();
  };
}

// ═══════════════════════════════════════════════════════════
// Shared Validation Schemas
// ═══════════════════════════════════════════════════════════

export const stockMovementSchema = z.object({
  product_id: z.number({ required_error: "product_id zorunlu" }).int().positive(),
  movement_type: z.enum(["produced", "to_warehouse", "to_sales", "raw_material_in", "inventory_count"], {
    required_error: "movement_type zorunlu",
    invalid_type_error: "Geçersiz hareket tipi",
  }),
  quantity: z.number({ required_error: "quantity zorunlu" }).int().min(0, "quantity >= 0 olmalı"),
  note: z.string().max(500).optional(),
  created_by: z.string().max(100).optional(),
  target: z.enum(["warehouse", "production"]).optional(),
});

export const agentChatSchema = z.object({
  message: z.string({ required_error: "message alanı gerekli" })
    .min(1, "message boş olamaz")
    .max(10000, "message çok uzun (max 10000 karakter)"),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
});

export const loginSchema = z.object({
  email: z.string({ required_error: "email zorunlu" }).email("Geçerli email adresi girin"),
  password: z.string({ required_error: "password zorunlu" }).min(1, "Şifre boş olamaz"),
});

export const productionPlanSchema = z.object({
  product_sku: z.string({ required_error: "product_sku zorunlu" }),
  target_year: z.number({ required_error: "target_year zorunlu" }).int().min(2020).max(2050),
  target_month: z.number({ required_error: "target_month zorunlu" }).int().min(1).max(12),
  forecasted_demand: z.number({ required_error: "forecasted_demand zorunlu" }).int().min(0),
  planned_production: z.number({ required_error: "planned_production zorunlu" }).int().min(0),
  component_gaps: z.any().optional(),
});

export const componentStockUpdateSchema = z.object({
  componentCode: z.string({ required_error: "componentCode zorunlu" }),
  currentStock: z.number({ required_error: "currentStock zorunlu" }).min(0, "Stok negatif olamaz"),
  countedBy: z.string().max(100).optional(),
});

export const planningImportQuerySchema = z.object({
  product_sku: z.string().optional(),
  source: z.string().optional(),
});
