/**
 * Natural Language Rules Evaluator
 * Custom kuralları mevcut stok/kapasite verisine karşı değerlendirir.
 * Her stok hareketi veya bileşen güncellemesinde çağrılır.
 */
import { db } from "../db";
import { customRules } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ProactiveAlert } from "../rules-engine";
import type { ComponentIntelligence } from "../routes/intelligence";
import type { ParsedRule } from "./nl-rules-parser";
import type { ReasoningStep } from "./impact-types";

let alertCounter = 1000;
function makeCustomAlertId(): string {
  return `custom_${Date.now()}_${++alertCounter}`;
}

export async function evaluateCustomRules(context: {
  intel: { components: ComponentIntelligence[] } | null;
  capacity: { maxProducible: number; bottlenecks: any[] } | null;
  currentMonth: number;
}): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const now = new Date().toISOString();

  try {
    const rules = await db.select().from(customRules).where(eq(customRules.isActive, true));
    if (rules.length === 0) return alerts;

    for (const rule of rules) {
      const parsed = rule.parsedRule as ParsedRule;
      if (!parsed || !parsed.condition || !parsed.action) continue;

      const triggered = checkCondition(parsed, context);
      if (!triggered) continue;

      // Kural tetiklendi
      alerts.push({
        id: makeCustomAlertId(),
        type: `custom_${parsed.type}`,
        severity: parsed.action.severity || (rule.severity as "critical" | "warning" | "info"),
        title: `Özel Kural: ${rule.nlDescription.slice(0, 40)}${rule.nlDescription.length > 40 ? "..." : ""}`,
        message: parsed.action.message,
        productSku: "ELT.7-11",
        componentCode: parsed.condition.componentCode || undefined,
        suggestedAction: getSuggestedAction(parsed),
        rootCause: [
          { order: 1, cause: `Özel kural değerlendirildi: "${rule.nlDescription}"` },
          { order: 2, cause: `Koşul: ${describeCondition(parsed)}` },
          { order: 3, cause: `Sonuç: Koşul sağlandı — ${parsed.action.type} tetiklendi` },
          { order: 4, cause: parsed.explanation || "Kullanıcı tanımlı iş kuralı" },
        ],
        timestamp: now,
      });

      // Trigger count güncelle
      await db.update(customRules)
        .set({
          lastTriggered: new Date(),
          triggerCount: (rule.triggerCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(customRules.id, rule.id))
        .catch(() => {}); // fire-and-forget
    }
  } catch (err) {
    console.error("[nl-rules-evaluator] Error:", err);
  }

  return alerts;
}

function checkCondition(parsed: ParsedRule, context: {
  intel: { components: ComponentIntelligence[] } | null;
  capacity: { maxProducible: number; bottlenecks: any[] } | null;
  currentMonth: number;
}): boolean {
  const { condition } = parsed;

  // Mevsimsel filtre — ay listesi varsa sadece o aylarda çalış
  if (condition.months && condition.months.length > 0) {
    if (!condition.months.includes(context.currentMonth)) return false;
  }

  switch (condition.field) {
    case "stock": {
      if (!context.intel) return false;
      const components = condition.componentCode
        ? context.intel.components.filter(c => c.code === condition.componentCode)
        : context.intel.components;
      return components.some(c => compare(c.currentStock, condition.operator, condition.value, condition.value2));
    }
    case "capacity": {
      if (!context.capacity) return false;
      return compare(context.capacity.maxProducible, condition.operator, condition.value, condition.value2);
    }
    case "burn_rate": {
      if (!context.intel) return false;
      const components = condition.componentCode
        ? context.intel.components.filter(c => c.code === condition.componentCode)
        : context.intel.components;
      return components.some(c => compare(c.dailyBurnRate, condition.operator, condition.value, condition.value2));
    }
    case "days_to_stockout": {
      if (!context.intel) return false;
      const components = condition.componentCode
        ? context.intel.components.filter(c => c.code === condition.componentCode)
        : context.intel.components;
      return components.some(c =>
        c.daysToStockout !== null && compare(c.daysToStockout, condition.operator, condition.value, condition.value2)
      );
    }
    case "safety_stock": {
      // Güvenlik stoku kuralları — mevsimsel modifier olarak çalışır
      if (!context.intel) return false;
      return context.intel.components.some(c => compare(c.currentStock, "lt", c.reorderPoint * (parsed.action.modifier || 1)));
    }
    default:
      return false;
  }
}

function compare(actual: number, operator: string, value: number, value2?: number): boolean {
  switch (operator) {
    case "lt": return actual < value;
    case "gt": return actual > value;
    case "eq": return actual === value;
    case "between": return value2 !== undefined && actual >= value && actual <= value2;
    default: return false;
  }
}

function describeCondition(parsed: ParsedRule): string {
  const { condition } = parsed;
  const fieldNames: Record<string, string> = {
    stock: "Stok", capacity: "Kapasite", burn_rate: "Tüketim hızı",
    days_to_stockout: "Stok ömrü", safety_stock: "Güvenlik stoku",
  };
  const opNames: Record<string, string> = { lt: "<", gt: ">", eq: "=", between: "aralığında" };
  const field = fieldNames[condition.field] || condition.field;
  const op = opNames[condition.operator] || condition.operator;
  const comp = condition.componentCode ? ` (${condition.componentCode})` : "";
  const months = condition.months?.length
    ? ` [Aylar: ${condition.months.map(m => ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"][m]).join(",")}]`
    : "";
  return `${field}${comp} ${op} ${condition.value}${condition.value2 ? `-${condition.value2}` : ""}${months}`;
}

function getSuggestedAction(parsed: ParsedRule): string {
  switch (parsed.action.type) {
    case "alert": return parsed.action.message;
    case "purchase_suggestion": return `Sipariş oluştur${parsed.action.quantity ? `: ${parsed.action.quantity} adet` : ""}`;
    case "modify_safety_stock": return `Güvenlik stokunu ${parsed.action.modifier ? `${((parsed.action.modifier - 1) * 100).toFixed(0)}%` : ""} artır`;
    case "notify": return parsed.action.message;
    default: return parsed.action.message;
  }
}
