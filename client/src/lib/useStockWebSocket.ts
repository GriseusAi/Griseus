import { useEffect, useRef, useState, useCallback } from "react";

export interface StockUpdateEvent {
  event: "stock_update";
  productId: number;
  productSku: string;
  movementType: string;
  quantity: number;
  stockLevel: { inProduction: number; inWarehouse: number; totalSold: number };
}

export interface ProactiveAlertData {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  componentCode?: string;
  productSku?: string;
  suggestedAction?: string;
  timestamp: string;
}

export interface ProactiveAlertEvent {
  event: "proactive_alert";
  alerts: ProactiveAlertData[];
}

export interface ImpactEventData {
  id: string;
  timestamp: string;
  trigger: { type: string; actor: string; detail: string };
  severity: "critical" | "warning" | "info";
  headline: string;
  reasoning: Array<{ order: number; cause: string; data?: Record<string, any> }>;
  affectedNodes: Array<{ entity: string; code: string; name: string; field: string; previousValue: any; newValue: any }>;
  actions: Array<{ type: string; priority: string; description: string; componentCode?: string; quantity?: number; deadline?: string }>;
}

export interface ImpactPropagationEvent {
  event: "impact_propagation";
  impacts: ImpactEventData[];
}

export function useStockWebSocket(
  onStockUpdate: (data: StockUpdateEvent) => void,
  onProactiveAlert?: (data: ProactiveAlertEvent) => void,
  onImpactPropagation?: (data: ImpactPropagationEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onStockUpdateRef = useRef(onStockUpdate);
  onStockUpdateRef.current = onStockUpdate;
  const onProactiveAlertRef = useRef(onProactiveAlert);
  onProactiveAlertRef.current = onProactiveAlert;
  const onImpactRef = useRef(onImpactPropagation);
  onImpactRef.current = onImpactPropagation;

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/stock`);

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === "stock_update") {
          onStockUpdateRef.current(data as StockUpdateEvent);
        } else if (data.event === "proactive_alert") {
          onProactiveAlertRef.current?.(data as ProactiveAlertEvent);
        } else if (data.event === "impact_propagation") {
          onImpactRef.current?.(data as ImpactPropagationEvent);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
