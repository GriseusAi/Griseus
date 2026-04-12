/**
 * ONTOLOGY — The Heart of Griseus
 *
 * Palantir-inspired semantic layer: Object Types, Link Types, Action Types, Function Types.
 * Everything in the system is described through the ontology.
 * Agent tools, dashboards, and APIs build against this layer — not raw tables.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────┐
 *   │  AIP Layer (CEO Agent, multi-agent v2)      │
 *   │  → reads ontology to discover capabilities  │
 *   ├─────────────────────────────────────────────┤
 *   │  ONTOLOGY (this file)                       │
 *   │  Objects ─ Links ─ Actions ─ Functions      │
 *   ├─────────────────────────────────────────────┤
 *   │  FOUNDRY (data_lineage, pipelines, etc.)    │
 *   │  Raw DB tables, versioning, scheduling      │
 *   └─────────────────────────────────────────────┘
 */

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import {
  ontologyObjectTypes,
  ontologyLinkTypes,
  ontologyActionTypes,
  ontologyFunctionTypes,
  type OntologyProperty,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// ══════════════════════════════════════════════════════════════════════
// OBJECT TYPES — "What exists in our world?"
// ══════════════════════════════════════════════════════════════════════

router.get("/object-types", async (_req: Request, res: Response) => {
  try {
    const types = await db.select().from(ontologyObjectTypes).where(eq(ontologyObjectTypes.enabled, true));
    res.json(types);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/object-types/:id", async (req: Request, res: Response) => {
  try {
    const [type] = await db.select().from(ontologyObjectTypes).where(eq(ontologyObjectTypes.id, req.params.id));
    if (!type) return res.status(404).json({ error: "Object type bulunamadi" });

    // Get related links, actions, functions
    const links = await db.select().from(ontologyLinkTypes).where(
      sql`${ontologyLinkTypes.sourceObjectType} = ${req.params.id} OR ${ontologyLinkTypes.targetObjectType} = ${req.params.id}`
    );
    const actions = await db.select().from(ontologyActionTypes).where(eq(ontologyActionTypes.targetObjectType, req.params.id));
    const functions = await db.select().from(ontologyFunctionTypes).where(eq(ontologyFunctionTypes.sourceObjectType, req.params.id));

    res.json({ ...type, links, actions, functions });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Dynamic object instances from backing table
router.get("/object-types/:id/objects", async (req: Request, res: Response) => {
  try {
    const [type] = await db.select().from(ontologyObjectTypes).where(eq(ontologyObjectTypes.id, req.params.id));
    if (!type) return res.status(404).json({ error: "Object type bulunamadi" });

    const limit = parseInt(req.query.limit as string) || 100;
    const result = await db.execute(sql.raw(`SELECT * FROM ${type.backingTable} LIMIT ${limit}`));
    res.json({ objectType: type.id, objects: result.rows, count: result.rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// LINK TYPES — "How are objects related?"
// ══════════════════════════════════════════════════════════════════════

router.get("/link-types", async (_req: Request, res: Response) => {
  try {
    const types = await db.select().from(ontologyLinkTypes).where(eq(ontologyLinkTypes.enabled, true));
    res.json(types);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Resolve a link: get related objects for a specific object instance
router.get("/link-types/:linkId/resolve", async (req: Request, res: Response) => {
  try {
    const [link] = await db.select().from(ontologyLinkTypes).where(eq(ontologyLinkTypes.id, req.params.linkId));
    if (!link) return res.status(404).json({ error: "Link type bulunamadi" });

    const sourceId = req.query.sourceId as string;
    if (!sourceId) return res.status(400).json({ error: "sourceId query param gerekli" });

    // Get backing tables
    const [sourceType] = await db.select().from(ontologyObjectTypes).where(eq(ontologyObjectTypes.id, link.sourceObjectType));
    const [targetType] = await db.select().from(ontologyObjectTypes).where(eq(ontologyObjectTypes.id, link.targetObjectType));
    if (!sourceType || !targetType) return res.status(404).json({ error: "Object type bulunamadi" });

    // Execute join query
    const result = await db.execute(
      sql.raw(`SELECT t.* FROM ${targetType.backingTable} t WHERE t.${link.targetField} = '${sourceId}'`)
    );

    res.json({
      link: link.id,
      sourceType: link.sourceObjectType,
      sourceId,
      targetType: link.targetObjectType,
      relatedObjects: result.rows,
      count: result.rows.length,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// ACTION TYPES — "What can be done?"
// ══════════════════════════════════════════════════════════════════════

router.get("/action-types", async (_req: Request, res: Response) => {
  try {
    const types = await db.select().from(ontologyActionTypes).where(eq(ontologyActionTypes.enabled, true));
    res.json(types);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// FUNCTION TYPES — "What can be computed?"
// ══════════════════════════════════════════════════════════════════════

router.get("/function-types", async (_req: Request, res: Response) => {
  try {
    const types = await db.select().from(ontologyFunctionTypes).where(eq(ontologyFunctionTypes.enabled, true));
    res.json(types);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// FULL GRAPH — The complete ontology in one call
// Agent'lar bunu çağırıp tüm yetenekleri keşfeder
// ══════════════════════════════════════════════════════════════════════

router.get("/graph", async (_req: Request, res: Response) => {
  try {
    const [objectTypes, linkTypes, actionTypes, functionTypes] = await Promise.all([
      db.select().from(ontologyObjectTypes).where(eq(ontologyObjectTypes.enabled, true)),
      db.select().from(ontologyLinkTypes).where(eq(ontologyLinkTypes.enabled, true)),
      db.select().from(ontologyActionTypes).where(eq(ontologyActionTypes.enabled, true)),
      db.select().from(ontologyFunctionTypes).where(eq(ontologyFunctionTypes.enabled, true)),
    ]);

    res.json({
      objectTypes,
      linkTypes,
      actionTypes,
      functionTypes,
      stats: {
        objects: objectTypes.length,
        links: linkTypes.length,
        actions: actionTypes.length,
        functions: functionTypes.length,
      },
      ontologyTriangle: {
        axes: ["miktar", "sure", "bilesen"],
        edges: ["miktar_sure", "sure_bilesen", "bilesen_miktar"],
        center: "orchestrator",
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// SEED — Initialize ontology with Griseus's current structure
// Run once; idempotent (ON CONFLICT DO NOTHING)
// ══════════════════════════════════════════════════════════════════════

router.post("/seed", async (_req: Request, res: Response) => {
  try {
    const result = await seedOntology();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export async function seedOntology(): Promise<{ seeded: Record<string, number> }> {
  const counts = { objectTypes: 0, linkTypes: 0, actionTypes: 0, functionTypes: 0 };

  // ── OBJECT TYPES ──
  const objectTypes = [
    {
      id: "product",
      displayName: "Product",
      displayNameTr: "Urun",
      description: "A manufactured product (e.g. ELT.7-11, GSS20P)",
      icon: "🏭",
      backingTable: "products",
      primaryKeyField: "id",
      titleField: "name",
      ontologyAxis: "bilesen",
      properties: {
        sku: { type: "string" as const, displayName: "SKU", displayNameTr: "Urun Kodu", required: true },
        name: { type: "string" as const, displayName: "Name", displayNameTr: "Ad", required: true },
        category: { type: "string" as const, displayName: "Category", displayNameTr: "Kategori" },
      },
    },
    {
      id: "component",
      displayName: "Component",
      displayNameTr: "Bilesen",
      description: "A component/material used in BOM (Bill of Materials)",
      icon: "🔩",
      backingTable: "bom_items",
      primaryKeyField: "id",
      titleField: "component_name",
      ontologyAxis: "bilesen",
      properties: {
        componentCode: { type: "string" as const, displayName: "Code", displayNameTr: "Bilesen Kodu", required: true },
        componentName: { type: "string" as const, displayName: "Name", displayNameTr: "Bilesen Adi", required: true },
        quantity: { type: "number" as const, displayName: "BOM Quantity", displayNameTr: "BOM Miktari", unit: "adet" },
        unit: { type: "string" as const, displayName: "Unit", displayNameTr: "Birim" },
        tier: { type: "number" as const, displayName: "Tier Level", displayNameTr: "Kademe" },
      },
    },
    {
      id: "component_stock",
      displayName: "Component Stock",
      displayNameTr: "Bilesen Stoku",
      description: "Current stock level of a component",
      icon: "📦",
      backingTable: "component_stock",
      primaryKeyField: "id",
      titleField: "component_code",
      ontologyAxis: "miktar",
      properties: {
        componentCode: { type: "string" as const, displayName: "Code", displayNameTr: "Bilesen Kodu", required: true },
        quantity: { type: "number" as const, displayName: "Quantity", displayNameTr: "Miktar", unit: "adet", required: true },
        lastUpdated: { type: "date" as const, displayName: "Last Updated", displayNameTr: "Son Guncelleme" },
      },
    },
    {
      id: "stock_movement",
      displayName: "Stock Movement",
      displayNameTr: "Stok Hareketi",
      description: "A record of stock change (production, purchase, transfer, adjustment)",
      icon: "📋",
      backingTable: "stock_movements_v2",
      primaryKeyField: "id",
      titleField: "id",
      ontologyAxis: "miktar",
      properties: {
        movementType: { type: "string" as const, displayName: "Type", displayNameTr: "Hareket Tipi", required: true, constraints: { enum: ["production", "purchase", "transfer", "adjustment", "consumption"] } },
        quantity: { type: "number" as const, displayName: "Quantity", displayNameTr: "Miktar", unit: "adet", required: true },
        note: { type: "string" as const, displayName: "Note", displayNameTr: "Not" },
      },
    },
    {
      id: "purchase_suggestion",
      displayName: "Purchase Suggestion",
      displayNameTr: "Satin Alma Onerisi",
      description: "An AI-generated or manual purchase recommendation",
      icon: "🛒",
      backingTable: "purchase_suggestions",
      primaryKeyField: "id",
      titleField: "component_code",
      ontologyAxis: null,
      properties: {
        componentCode: { type: "string" as const, displayName: "Component", displayNameTr: "Bilesen", required: true },
        suggestedQuantity: { type: "number" as const, displayName: "Suggested Qty", displayNameTr: "Onerilen Miktar", unit: "adet" },
        reason: { type: "string" as const, displayName: "Reason", displayNameTr: "Neden" },
        status: { type: "string" as const, displayName: "Status", displayNameTr: "Durum", constraints: { enum: ["pending", "approved", "rejected", "ordered"] } },
      },
    },
    {
      id: "seasonal_index",
      displayName: "Seasonal Index",
      displayNameTr: "Mevsimsel Endeks",
      description: "Monthly demand multiplier for a product (DSE output)",
      icon: "📅",
      backingTable: "seasonal_indices",
      primaryKeyField: "id",
      titleField: "product_sku",
      ontologyAxis: "sure",
      properties: {
        month: { type: "number" as const, displayName: "Month", displayNameTr: "Ay", required: true, constraints: { min: 1, max: 12 } },
        indexValue: { type: "number" as const, displayName: "Index Value", displayNameTr: "Endeks Degeri", required: true },
        confidence: { type: "number" as const, displayName: "Confidence", displayNameTr: "Guven" },
      },
    },
    {
      id: "sales_record",
      displayName: "Sales Record",
      displayNameTr: "Satis Kaydi",
      description: "Historical sales data",
      icon: "💰",
      backingTable: "sales_history",
      primaryKeyField: "id",
      titleField: "product_sku",
      ontologyAxis: "sure",
      properties: {
        quantity: { type: "number" as const, displayName: "Quantity", displayNameTr: "Miktar", unit: "adet" },
        saleDate: { type: "date" as const, displayName: "Sale Date", displayNameTr: "Satis Tarihi" },
      },
    },
    {
      id: "validation_alert",
      displayName: "Validation Alert",
      displayNameTr: "Dogrulama Uyarisi",
      description: "System-generated quality/risk alert",
      icon: "⚠️",
      backingTable: "validation_alerts",
      primaryKeyField: "id",
      titleField: "type",
      ontologyAxis: null,
      properties: {
        type: { type: "string" as const, displayName: "Alert Type", displayNameTr: "Uyari Tipi" },
        severity: { type: "string" as const, displayName: "Severity", displayNameTr: "Siddet", constraints: { enum: ["low", "medium", "high", "critical"] } },
        outcome: { type: "string" as const, displayName: "Outcome", displayNameTr: "Sonuc", constraints: { enum: ["true_positive", "false_positive", "unresolved"] } },
      },
    },
  ];

  for (const ot of objectTypes) {
    await db.insert(ontologyObjectTypes).values(ot as any).onConflictDoNothing();
    counts.objectTypes++;
  }

  // ── LINK TYPES ──
  const linkTypes = [
    { id: "product_has_components", displayName: "Product has Components", sourceObjectType: "product", targetObjectType: "component", joinType: "field_match", sourceField: "sku", targetField: "parent_product_sku", cardinality: "one_to_many" },
    { id: "component_has_stock", displayName: "Component has Stock", sourceObjectType: "component", targetObjectType: "component_stock", joinType: "field_match", sourceField: "component_code", targetField: "component_code", cardinality: "one_to_one" },
    { id: "component_has_movements", displayName: "Component has Movements", sourceObjectType: "component_stock", targetObjectType: "stock_movement", joinType: "field_match", sourceField: "component_code", targetField: "component_code", cardinality: "one_to_many" },
    { id: "product_has_sales", displayName: "Product has Sales", sourceObjectType: "product", targetObjectType: "sales_record", joinType: "field_match", sourceField: "sku", targetField: "product_sku", cardinality: "one_to_many" },
    { id: "product_has_seasonality", displayName: "Product has Seasonal Indices", sourceObjectType: "product", targetObjectType: "seasonal_index", joinType: "field_match", sourceField: "sku", targetField: "product_sku", cardinality: "one_to_many" },
    { id: "component_has_suggestions", displayName: "Component has Purchase Suggestions", sourceObjectType: "component", targetObjectType: "purchase_suggestion", joinType: "field_match", sourceField: "component_code", targetField: "component_code", cardinality: "one_to_many" },
    { id: "product_has_alerts", displayName: "Product has Alerts", sourceObjectType: "product", targetObjectType: "validation_alert", joinType: "field_match", sourceField: "sku", targetField: "entity_id", cardinality: "one_to_many" },
  ];

  for (const lt of linkTypes) {
    await db.insert(ontologyLinkTypes).values(lt as any).onConflictDoNothing();
    counts.linkTypes++;
  }

  // ── ACTION TYPES ──
  const actionTypes = [
    {
      id: "create_stock_movement", displayName: "Record Stock Movement", displayNameTr: "Stok Hareketi Kaydet",
      description: "Record a production, purchase, transfer, or adjustment",
      targetObjectType: "stock_movement", actionCategory: "create",
      agentToolName: "create_stock_movement", requiresConfirmation: true,
      parameters: {
        productId: { type: "string" as const, displayName: "Product ID", required: true },
        movementType: { type: "string" as const, displayName: "Movement Type", required: true, constraints: { enum: ["production", "purchase", "transfer", "adjustment", "consumption"] } },
        quantity: { type: "number" as const, displayName: "Quantity", required: true, unit: "adet" },
        note: { type: "string" as const, displayName: "Note" },
      },
    },
    {
      id: "update_component_stock", displayName: "Update Component Stock", displayNameTr: "Bilesen Stoku Guncelle",
      description: "Directly update a component stock quantity",
      targetObjectType: "component_stock", actionCategory: "update",
      agentToolName: "update_component_stock", requiresConfirmation: true,
      parameters: {
        componentCode: { type: "string" as const, displayName: "Component Code", required: true },
        newQuantity: { type: "number" as const, displayName: "New Quantity", required: true, unit: "adet" },
        reason: { type: "string" as const, displayName: "Reason" },
      },
    },
    {
      id: "create_purchase_suggestion", displayName: "Create Purchase Suggestion", displayNameTr: "Satin Alma Onerisi Olustur",
      description: "Generate a purchase recommendation for a component",
      targetObjectType: "purchase_suggestion", actionCategory: "create",
      agentToolName: "create_purchase_suggestion", requiresConfirmation: false,
      parameters: {
        componentCode: { type: "string" as const, displayName: "Component Code", required: true },
        quantity: { type: "number" as const, displayName: "Suggested Quantity", required: true, unit: "adet" },
        reason: { type: "string" as const, displayName: "Reason" },
      },
    },
    {
      id: "create_custom_rule", displayName: "Create Custom Rule", displayNameTr: "Ozel Kural Olustur",
      description: "Add a custom business rule to the rules engine",
      targetObjectType: "product", actionCategory: "create",
      agentToolName: "create_custom_rule", requiresConfirmation: false,
      parameters: {
        ruleDescription: { type: "string" as const, displayName: "Rule Description", required: true },
      },
    },
  ];

  for (const at of actionTypes) {
    await db.insert(ontologyActionTypes).values(at as any).onConflictDoNothing();
    counts.actionTypes++;
  }

  // ── FUNCTION TYPES ──
  const functionTypes = [
    // Miktar × Süre edge
    { id: "depletion_calc", displayName: "Depletion Calculator", displayNameTr: "Tukenme Hesaplayici", description: "Forward-walk: how long will current stock last given seasonal demand?", sourceObjectType: "component_stock", returnType: "object", implementation: "get_seasonal_intelligence", ontologyEdge: "miktar_sure" },
    { id: "what_if_simulation", displayName: "What-If Simulation", displayNameTr: "Eger Simulasyonu", description: "Simulate production, order, restock, or time-forward scenarios", sourceObjectType: "product", returnType: "object", implementation: "what_if_analysis", ontologyEdge: "miktar_sure" },
    { id: "order_fulfillment", displayName: "Order Fulfillment Check", displayNameTr: "Siparis Karsilama Kontrolu", description: "Can we fulfill N units? Which components are bottlenecks?", sourceObjectType: "product", returnType: "object", implementation: "simulate_order_fulfillment", ontologyEdge: "miktar_sure" },
    // Süre × Bileşen edge
    { id: "intelligence_engine", displayName: "Intelligence Engine", displayNameTr: "Istihbarat Motoru", description: "Urgent orders, 6-month plan, risk assessment", sourceObjectType: "product", returnType: "object", implementation: "get_intelligence_engine", ontologyEdge: "sure_bilesen" },
    { id: "risk_score", displayName: "Risk Score", displayNameTr: "Risk Skoru", description: "Validation dashboard — alert accuracy, false positive rate", sourceObjectType: "validation_alert", returnType: "object", implementation: "get_validation_dashboard", ontologyEdge: "sure_bilesen" },
    { id: "adaptive_profile", displayName: "Adaptive Profile", displayNameTr: "Adaptif Profil", description: "Learned tenant profile — lead time drift, demand volatility", sourceObjectType: "product", returnType: "object", implementation: "get_adaptive_profile", ontologyEdge: "sure_bilesen" },
    // Bileşen × Miktar edge
    { id: "production_capacity", displayName: "Production Capacity", displayNameTr: "Uretim Kapasitesi", description: "How many units can we produce? Bottleneck component?", sourceObjectType: "product", returnType: "object", implementation: "get_production_capacity", ontologyEdge: "bilesen_miktar" },
    { id: "bom_tree", displayName: "BOM Tree", displayNameTr: "BOM Agaci", description: "Full Bill of Materials tree with stock levels", sourceObjectType: "product", returnType: "object", implementation: "get_bom_tree", ontologyEdge: "bilesen_miktar" },
    { id: "cross_product_analysis", displayName: "Cross-Product Analysis", displayNameTr: "Capraz Urun Analizi", description: "Shared components across products — Octopus Brain", sourceObjectType: "component", returnType: "object", implementation: "get_cross_product_analysis", ontologyEdge: "bilesen_miktar" },
    { id: "component_intelligence", displayName: "Component Intelligence", displayNameTr: "Bilesen Istihbarati", description: "Deep analysis of a single component — stock, BOM usage, forecast", sourceObjectType: "component_stock", returnType: "object", implementation: "get_component_intelligence", ontologyEdge: "bilesen_miktar" },
  ];

  for (const ft of functionTypes) {
    await db.insert(ontologyFunctionTypes).values(ft as any).onConflictDoNothing();
    counts.functionTypes++;
  }

  return { seeded: counts };
}

export default router;
