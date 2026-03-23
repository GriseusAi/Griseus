import { db } from "../db";
import { objects, links, linkTypes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { GEObject } from "@shared/schema";

interface BomNode {
  object: GEObject;
  quantity: number;
  children: BomNode[];
}

export class BomService {
  /**
   * Get the full Bill of Materials tree for a product using recursive CTE
   */
  async getBomTree(productId: string): Promise<BomNode | null> {
    const [product] = await db.select().from(objects).where(eq(objects.id, productId));
    if (!product) return null;

    // Get bom_contains link type
    const [bomLinkType] = await db.select().from(linkTypes).where(eq(linkTypes.apiName, "bom_contains"));
    if (!bomLinkType) return { object: product, quantity: 1, children: [] };

    // Recursive CTE to get full BOM
    const bomRows = await db.execute(sql`
      WITH RECURSIVE bom_tree AS (
        SELECT
          l.target_object_id as object_id,
          l.source_object_id as parent_id,
          COALESCE((l.properties->>'quantity')::numeric, 1) as quantity,
          1 as depth
        FROM ge_links l
        WHERE l.source_object_id = ${productId}
          AND l.link_type_id = ${bomLinkType.id}

        UNION ALL

        SELECT
          l.target_object_id,
          l.source_object_id,
          COALESCE((l.properties->>'quantity')::numeric, 1) * bt.quantity,
          bt.depth + 1
        FROM ge_links l
        JOIN bom_tree bt ON bt.object_id = l.source_object_id
        WHERE l.link_type_id = ${bomLinkType.id}
          AND bt.depth < 10
      )
      SELECT object_id, parent_id, quantity, depth FROM bom_tree
    `);

    // Build tree from flat results
    const objectIds = new Set<string>();
    objectIds.add(productId);
    for (const row of bomRows.rows as any[]) {
      objectIds.add(row.object_id);
    }

    const objectMap = new Map<string, GEObject>();
    for (const oid of Array.from(objectIds)) {
      const [obj] = await db.select().from(objects).where(eq(objects.id, oid));
      if (obj) objectMap.set(oid, obj);
    }

    // Build children map
    const childrenMap = new Map<string, { objectId: string; quantity: number }[]>();
    for (const row of bomRows.rows as any[]) {
      const parentId = row.parent_id as string;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push({ objectId: row.object_id, quantity: Number(row.quantity) });
    }

    function buildNode(id: string, qty: number): BomNode | null {
      const obj = objectMap.get(id);
      if (!obj) return null;
      const children = (childrenMap.get(id) || [])
        .map(c => buildNode(c.objectId, c.quantity))
        .filter(Boolean) as BomNode[];
      return { object: obj, quantity: qty, children };
    }

    return buildNode(productId, 1);
  }

  /**
   * Compute total BOM cost by aggregating material costs through the tree
   */
  async computeBomCost(productId: string): Promise<{ totalCost: number; breakdown: { material: string; quantity: number; unitCost: number; totalCost: number }[] }> {
    const tree = await this.getBomTree(productId);
    if (!tree) return { totalCost: 0, breakdown: [] };

    const breakdown: { material: string; quantity: number; unitCost: number; totalCost: number }[] = [];

    function collectLeaves(node: BomNode) {
      if (node.children.length === 0) {
        const props = node.object.properties as any;
        const unitCost = Number(props?.unit_cost || 0);
        breakdown.push({
          material: node.object.title,
          quantity: node.quantity,
          unitCost,
          totalCost: unitCost * node.quantity,
        });
      }
      for (const child of node.children) {
        collectLeaves(child);
      }
    }

    collectLeaves(tree);
    const totalCost = breakdown.reduce((sum, b) => sum + b.totalCost, 0);
    return { totalCost, breakdown };
  }

  /**
   * Get material requirements for producing N units of a product
   */
  async getMaterialRequirements(productId: string, quantity: number): Promise<{ material: string; materialId: string; requiredQuantity: number }[]> {
    const tree = await this.getBomTree(productId);
    if (!tree) return [];

    const requirements = new Map<string, { material: string; materialId: string; requiredQuantity: number }>();

    function collectMaterials(node: BomNode, parentQuantity: number) {
      if (node.children.length === 0 && node.object.id !== productId) {
        const existing = requirements.get(node.object.id);
        const qty = node.quantity * parentQuantity;
        if (existing) {
          existing.requiredQuantity += qty;
        } else {
          requirements.set(node.object.id, {
            material: node.object.title,
            materialId: node.object.id,
            requiredQuantity: qty,
          });
        }
      }
      for (const child of node.children) {
        collectMaterials(child, parentQuantity);
      }
    }

    collectMaterials(tree, quantity);
    return Array.from(requirements.values());
  }
}

export const bomService = new BomService();
