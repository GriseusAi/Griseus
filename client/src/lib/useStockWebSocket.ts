import { useEffect, useRef, useState, useCallback } from "react";

export interface StockUpdateEvent {
  event: "stock_update";
  productId: number;
  productSku: string;
  movementType: string;
  quantity: number;
  stockLevel: { inProduction: number; inWarehouse: number; totalSold: number };
}

export function useStockWebSocket(onUpdate: (data: StockUpdateEvent) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/stock`);

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as StockUpdateEvent;
        if (data.event === "stock_update") {
          onUpdateRef.current(data);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
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
