import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

let wss: WebSocketServer;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws/stock" });

  wss.on("connection", (ws) => {
    console.log(`[ws] client connected (total: ${wss.clients.size})`);
    ws.on("close", () => {
      console.log(`[ws] client disconnected (total: ${wss.clients.size})`);
    });
  });

  console.log("[ws] WebSocket server ready on /ws/stock");
}

export function broadcastStockUpdate(payload: {
  event: "stock_update";
  productId: number;
  productSku: string;
  movementType: string;
  quantity: number;
  stockLevel: { inProduction: number; inWarehouse: number; totalSold: number };
}) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

export function broadcastImpactPropagation(payload: {
  event: "impact_propagation";
  impacts: Array<any>;
}) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

/**
 * Bulk mutasyonlar için jenerik "entity degisti, refetch" sinyali.
 * Octopus prensibi: bir atom degistigi anda TUM client'lar haberdar olmali.
 */
export function broadcastEntityChanged(payload: {
  event: "entity_changed";
  entities: Array<"products" | "bom_items" | "component_stock" | "sales_history" | "seasonal_indices">;
  scope?: string;  // opsiyonel — etkilenen sku/kod/pool
  count?: number;  // etkilenen satir sayisi
  source?: string; // "bulk_import", "admin_edit", "agent_action", vb.
}) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

export function broadcastProactiveAlert(payload: {
  event: "proactive_alert";
  alerts: Array<{
    id: string;
    type: string;
    severity: "critical" | "warning" | "info";
    title: string;
    message: string;
    componentCode?: string;
    productSku?: string;
    suggestedAction?: string;
    timestamp: string;
  }>;
}) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
