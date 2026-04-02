import { describe, it, expect } from "vitest";

// Import the pure computation functions directly
// These don't need database access — they operate on in-memory data
import { computeProductionCapacity, computeSubAssemblyCapacity } from "./bom";

// Helper type matching BomRow
interface BomRow {
  code: string;
  name: string;
  requiredQty: number;
  unit: string;
  tier: number;
  parentComponentCode: string | null;
  currentStock: number;
}

function makeBomItem(overrides: Partial<BomRow> = {}): BomRow {
  return {
    code: "27.001",
    name: "Test Component",
    requiredQty: 1,
    unit: "adet",
    tier: 1,
    parentComponentCode: null,
    currentStock: 100,
    ...overrides,
  };
}

describe("BOM Capacity Calculations", () => {
  describe("computeProductionCapacity", () => {
    it("should calculate capacity from single component", () => {
      const items = [makeBomItem({ requiredQty: 2, currentStock: 100 })];
      const result = computeProductionCapacity(items);
      expect(result.maxProducible).toBe(50); // 100 / 2
    });

    it("should find bottleneck (minimum capacity component)", () => {
      const items = [
        makeBomItem({ code: "A", name: "Comp A", requiredQty: 1, currentStock: 500 }),
        makeBomItem({ code: "B", name: "Comp B", requiredQty: 2, currentStock: 100 }), // bottleneck: 100/2 = 50
        makeBomItem({ code: "C", name: "Comp C", requiredQty: 1, currentStock: 200 }),
      ];
      const result = computeProductionCapacity(items);
      expect(result.maxProducible).toBe(50);
      expect(result.bottlenecks[0].code).toBe("B");
    });

    it("should return 0 if any component has 0 stock", () => {
      const items = [
        makeBomItem({ code: "A", currentStock: 500 }),
        makeBomItem({ code: "B", currentStock: 0 }), // bottleneck
      ];
      const result = computeProductionCapacity(items);
      expect(result.maxProducible).toBe(0);
    });

    it("should handle tier 2 (sub-assembly) with parts", () => {
      const items = [
        makeBomItem({ code: "DIRECT", tier: 1, requiredQty: 1, currentStock: 1000 }),
        makeBomItem({ code: "SUB", tier: 2, name: "Brülör", requiredQty: 1, currentStock: 10 }),
        // Sub-assembly parts (tier 3 children of SUB)
        makeBomItem({ code: "PART1", tier: 3, parentComponentCode: "SUB", requiredQty: 1, currentStock: 50 }),
        makeBomItem({ code: "PART2", tier: 3, parentComponentCode: "SUB", requiredQty: 2, currentStock: 80 }),
      ];
      const result = computeProductionCapacity(items);
      // SUB has 10 in stock + can produce 40 from parts (min(50/1, 80/2) = 40) = 50 effective
      // DIRECT allows 1000
      // Bottleneck is SUB at 50
      expect(result.maxProducible).toBe(50);
      expect(result.subAssemblyStatus["SUB"]).toBeDefined();
      expect(result.subAssemblyStatus["SUB"].producibleFromParts).toBe(40);
    });

    it("should return 0 for empty items", () => {
      const result = computeProductionCapacity([]);
      expect(result.maxProducible).toBe(0);
    });

    it("should sort bottlenecks ascending by maxProducts", () => {
      const items = [
        makeBomItem({ code: "A", requiredQty: 1, currentStock: 300 }),
        makeBomItem({ code: "B", requiredQty: 1, currentStock: 100 }),
        makeBomItem({ code: "C", requiredQty: 1, currentStock: 200 }),
      ];
      const result = computeProductionCapacity(items);
      expect(result.bottlenecks[0].code).toBe("B");
      expect(result.bottlenecks[1].code).toBe("C");
      expect(result.bottlenecks[2].code).toBe("A");
    });

    it("should handle fractional requiredQty", () => {
      const items = [makeBomItem({ requiredQty: 0.5, currentStock: 100 })];
      const result = computeProductionCapacity(items);
      expect(result.maxProducible).toBe(200); // 100 / 0.5
    });
  });

  describe("computeSubAssemblyCapacity", () => {
    it("should calculate from sub-assembly parts", () => {
      const allItems = [
        makeBomItem({ code: "SUB", tier: 2, parentComponentCode: null }),
        makeBomItem({ code: "P1", tier: 3, parentComponentCode: "SUB", requiredQty: 1, currentStock: 50 }),
        makeBomItem({ code: "P2", tier: 3, parentComponentCode: "SUB", requiredQty: 2, currentStock: 80 }),
      ];
      const result = computeSubAssemblyCapacity("SUB", allItems);
      expect(result.producible).toBe(40); // min(50/1, 80/2) = 40
      expect(result.parts).toHaveLength(2);
    });

    it("should return 0 when no parts exist", () => {
      const allItems = [makeBomItem({ code: "SUB", tier: 2 })];
      const result = computeSubAssemblyCapacity("SUB", allItems);
      expect(result.producible).toBe(0);
    });

    it("should identify bottleneck part", () => {
      const allItems = [
        makeBomItem({ code: "SUB", tier: 2 }),
        makeBomItem({ code: "P1", tier: 3, parentComponentCode: "SUB", requiredQty: 1, currentStock: 100 }),
        makeBomItem({ code: "P2", tier: 3, parentComponentCode: "SUB", requiredQty: 1, currentStock: 30 }),
      ];
      const result = computeSubAssemblyCapacity("SUB", allItems);
      expect(result.producible).toBe(30);
      expect(result.bottleneck).toContain("P2");
    });
  });
});
