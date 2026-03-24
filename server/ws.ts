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
