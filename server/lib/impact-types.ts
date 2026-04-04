// ═══════════════════════════════════════════════════════════
// IMPACT PROPAGATION ENGINE — Type Definitions
// Palantir AIP "Octopus Brain" — her değişikliğin dalga etkisi
// ═══════════════════════════════════════════════════════════

export interface ImpactNode {
  entity: "component" | "product" | "production" | "supply_chain";
  code: string;
  name: string;
  field: string;
  previousValue: number | string | null;
  newValue: number | string | null;
}

export interface ReasoningStep {
  order: number;
  cause: string;       // Turkish human-readable
  data?: Record<string, number | string>;
}

export interface ImpactAction {
  type: "order" | "transfer" | "alert" | "plan_revision";
  priority: "immediate" | "soon" | "planned";
  description: string;
  componentCode?: string;
  quantity?: number;
  deadline?: string;
}

export interface ImpactEvent {
  id: string;
  timestamp: string;
  trigger: {
    type: "stock_movement" | "component_stock_update" | "sales_data_import" | "correction";
    actor: string;
    detail: string;
  };
  severity: "critical" | "warning" | "info";
  headline: string;
  reasoning: ReasoningStep[];
  affectedNodes: ImpactNode[];
  actions: ImpactAction[];
}

export interface ImpactPropagationResult {
  event: "impact_propagation";
  impacts: ImpactEvent[];
}
