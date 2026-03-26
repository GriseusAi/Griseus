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

export function useStockWebSocket(
  onStockUpdate: (data: StockUpdateEvent) => void,
  onProactiveAlert?: (data: ProactiveAlertEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onStockUpdateRef = useRef(onStockUpdate);
  onStockUpdateRef.current = onStockUpdate;
  const onProactiveAlertRef = useRef(onProactiveAlert);
  onProactiveAlertRef.current = onProactiveAlert;

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
