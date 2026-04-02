import { describe, it, expect } from "vitest";
import {
  stockMovementSchema,
  agentChatSchema,
  loginSchema,
  productionPlanSchema,
  componentStockUpdateSchema,
} from "./validate";

describe("Validation Schemas", () => {
  describe("stockMovementSchema", () => {
    it("should accept valid stock movement", () => {
      const result = stockMovementSchema.safeParse({
        product_id: 1,
        movement_type: "produced",
        quantity: 50,
        note: "Test üretim",
      });
      expect(result.success).toBe(true);
    });

    it("should reject missing product_id", () => {
      const result = stockMovementSchema.safeParse({
        movement_type: "produced",
        quantity: 50,
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid movement_type", () => {
      const result = stockMovementSchema.safeParse({
        product_id: 1,
        movement_type: "invalid_type",
        quantity: 50,
      });
      expect(result.success).toBe(false);
    });

    it("should reject negative quantity", () => {
      const result = stockMovementSchema.safeParse({
        product_id: 1,
        movement_type: "produced",
        quantity: -5,
      });
      expect(result.success).toBe(false);
    });

    it("should accept inventory_count with target", () => {
      const result = stockMovementSchema.safeParse({
        product_id: 1,
        movement_type: "inventory_count",
        quantity: 100,
        target: "warehouse",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid target", () => {
      const result = stockMovementSchema.safeParse({
        product_id: 1,
        movement_type: "inventory_count",
        quantity: 100,
        target: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("should limit note length to 500", () => {
      const result = stockMovementSchema.safeParse({
        product_id: 1,
        movement_type: "produced",
        quantity: 50,
        note: "a".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("agentChatSchema", () => {
    it("should accept valid message", () => {
      const result = agentChatSchema.safeParse({
        message: "Kaç adet üretebiliriz?",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty message", () => {
      const result = agentChatSchema.safeParse({
        message: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject message over 10000 chars", () => {
      const result = agentChatSchema.safeParse({
        message: "x".repeat(10001),
      });
      expect(result.success).toBe(false);
    });

    it("should accept message with history", () => {
      const result = agentChatSchema.safeParse({
        message: "hello",
        history: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "merhaba" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid history role", () => {
      const result = agentChatSchema.safeParse({
        message: "hello",
        history: [{ role: "system", content: "hack" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("should accept valid credentials", () => {
      const result = loginSchema.safeParse({
        email: "test@cukurova.com",
        password: "secure123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "secure123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty password", () => {
      const result = loginSchema.safeParse({
        email: "test@cukurova.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("productionPlanSchema", () => {
    it("should accept valid plan", () => {
      const result = productionPlanSchema.safeParse({
        product_sku: "ELT.7-11",
        target_year: 2026,
        target_month: 5,
        forecasted_demand: 200,
        planned_production: 250,
      });
      expect(result.success).toBe(true);
    });

    it("should reject month > 12", () => {
      const result = productionPlanSchema.safeParse({
        product_sku: "ELT.7-11",
        target_year: 2026,
        target_month: 13,
        forecasted_demand: 200,
        planned_production: 250,
      });
      expect(result.success).toBe(false);
    });

    it("should reject year < 2020", () => {
      const result = productionPlanSchema.safeParse({
        product_sku: "ELT.7-11",
        target_year: 2019,
        target_month: 5,
        forecasted_demand: 200,
        planned_production: 250,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("componentStockUpdateSchema", () => {
    it("should accept valid update", () => {
      const result = componentStockUpdateSchema.safeParse({
        componentCode: "27.004",
        currentStock: 500,
      });
      expect(result.success).toBe(true);
    });

    it("should reject negative stock", () => {
      const result = componentStockUpdateSchema.safeParse({
        componentCode: "27.004",
        currentStock: -10,
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing componentCode", () => {
      const result = componentStockUpdateSchema.safeParse({
        currentStock: 500,
      });
      expect(result.success).toBe(false);
    });
  });
});
