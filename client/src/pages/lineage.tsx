import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSKU } from "@/lib/sku-context";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TopNav from "@/components/top-nav";
import ProductSelector from "@/components/ProductSelector";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — LINEAGE CANVAS (Palantir SDDI)
   Software Defined Data Integration — Freeform Pipeline Graph
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.10)", accentGlow: "rgba(99,102,241,0.25)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.08)", okBorder: "rgba(52,211,153,0.15)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.08)", warnBorder: "rgba(251,191,36,0.15)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.06)", errBorder: "rgba(239,68,68,0.15)",
  blue: "#60a5fa", purple: "#a78bfa", cyan: "#22d3ee", orange: "#fb923c",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60", dimmer: "#2a2a3a",
  // Node type colors
  source: "#fb923c",    // orange — data sources
  store: "#60a5fa",     // blue — data stores (tables)
  engine: "#a78bfa",    // purple — transform engines
  output: "#34d399",    // green — outputs/actions
  ontology: "#818cf8",  // accent — ontology triangle
};
const mono = "'Outfit', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ═══════════════════════════════════════════════════════════
   PIPELINE ARCHITECTURE — The Blueprint
   Defines all nodes and edges in the Griseus data pipeline
   ═══════════════════════════════════════════════════════════ */

type NodeType = "source" | "store" | "engine" | "output" | "ontology";

interface PipelineNode {
  id: string;
  label: string;
  sublabel?: string;
  type: NodeType;
  table?: string; // maps to DB table for live stats
  x: number;
  y: number;
}

interface PipelineEdge {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
}

// Initial layout: positions as ratios (0..1) of canvas size — scales to any screen
// User can drag to rearrange at runtime
function createPipelineBlueprint(): { nodes: PipelineNode[]; edges: PipelineEdge[] } {
  // Ratio-based layout: 5 columns, rows spread vertically
  const cols = [0.07, 0.27, 0.50, 0.70, 0.92]; // source, store, engine, knowledge, output
  const row = (i: number, total: number) => 0.08 + (i / Math.max(total - 1, 1)) * 0.82;

  const nodes: PipelineNode[] = [
    // ── SOURCES (Column 0) ──
    { id: "excel_bom",     label: "Excel BOM",       sublabel: "Reçete İthalatı",       type: "source",  x: cols[0], y: row(0, 5) },
    { id: "excel_sales",   label: "Excel Satış",     sublabel: "3 Yıllık Satış",        type: "source",  x: cols[0], y: row(1, 5) },
    { id: "excel_stock",   label: "Excel Stok",      sublabel: "Stok Sayım",            type: "source",  x: cols[0], y: row(2, 5) },
    { id: "manual_entry",  label: "Manuel Giriş",    sublabel: "Stok Hareketi",         type: "source",  x: cols[0], y: row(3, 5) },
    { id: "agent_wb",      label: "Agent Write-back", sublabel: "Karar → Veri",         type: "source",  x: cols[0], y: row(4, 5) },

    // ── DATA STORES (Column 1) ──
    { id: "products",       label: "Ürünler",         sublabel: "products",           type: "store", table: "products",         x: cols[1], y: row(0, 6) },
    { id: "bom_items",      label: "BOM Ağacı",       sublabel: "bom_items",          type: "store", table: "bom_items",        x: cols[1], y: row(1, 6) },
    { id: "comp_stock",     label: "Bileşen Stok",    sublabel: "component_stock",    type: "store", table: "component_stock",  x: cols[1], y: row(2, 6) },
    { id: "sales_hist",     label: "Satış Geçmişi",   sublabel: "sales_history",      type: "store", table: "sales_history",    x: cols[1], y: row(3, 6) },
    { id: "stock_moves",    label: "Stok Hareketleri", sublabel: "stock_movements",   type: "store", table: "stock_movements_v2", x: cols[1], y: row(4, 6) },
    { id: "season_idx",     label: "Mevsimsel İndeks", sublabel: "seasonal_indices",  type: "store", table: "seasonal_indices",  x: cols[1], y: row(5, 6) },

    // ── ENGINES (Column 2) ──
    { id: "dse",         label: "DSE",              sublabel: "Mevsimsellik Motoru",      type: "engine", x: cols[2], y: row(0, 6) },
    { id: "ate",         label: "ATE",              sublabel: "Adaptif Eşik Motoru",      type: "engine", x: cols[2], y: row(1, 6) },
    { id: "intel",       label: "Intelligence",     sublabel: "Bileşen İstihbarat",       type: "engine", x: cols[2], y: row(2, 6) },
    { id: "impact",      label: "Impact Engine",    sublabel: "Etki Yayılım Motoru",      type: "engine", x: cols[2], y: row(3, 6) },
    { id: "whatif",      label: "What-If",          sublabel: "Senaryo Simülatörü",       type: "engine", x: cols[2], y: row(4, 6) },
    { id: "validation",  label: "Validation",       sublabel: "10 Kural Motoru",          type: "engine", x: cols[2], y: row(5, 6) },

    // ── KNOWLEDGE (Column 3) ──
    { id: "ole",         label: "OLE",              sublabel: "Öğrenme Motoru",           type: "engine", table: "outcome_tracking",  x: cols[3], y: row(0, 3) },
    { id: "adm",         label: "ADM",              sublabel: "Agent Hafıza",             type: "engine", table: "agent_memory",      x: cols[3], y: row(1, 3) },
    { id: "tvt",         label: "TVT",              sublabel: "Token Değer Takibi",       type: "engine", table: "token_metrics",     x: cols[3], y: row(2, 3) },

    // ── OUTPUTS (Column 4) ──
    { id: "ceo_agent",   label: "CEO Agent",        sublabel: "24 Tool · 4 Mod",          type: "output", x: cols[4], y: row(0, 4) },
    { id: "alerts",      label: "Uyarılar",         sublabel: "validation_alerts",        type: "output", table: "validation_alerts",   x: cols[4], y: row(1, 4) },
    { id: "suggestions", label: "Satın Alma",       sublabel: "purchase_suggestions",     type: "output", table: "purchase_suggestions", x: cols[4], y: row(2, 4) },
    { id: "plans",       label: "Üretim Planları",  sublabel: "production_plans",         type: "output", table: "production_plans",     x: cols[4], y: row(3, 4) },

    // ── ONTOLOGY TRIANGLE (Center-bottom overlay) ──
    { id: "ont_miktar",  label: "MİKTAR",           sublabel: "X Ekseni",                 type: "ontology", x: 0.60, y: 0.72 },
    { id: "ont_sure",    label: "SÜRE",             sublabel: "Y Ekseni",                 type: "ontology", x: 0.52, y: 0.88 },
    { id: "ont_bilesen", label: "BİLEŞEN",          sublabel: "Z Ekseni",                 type: "ontology", x: 0.68, y: 0.88 },
  ];

  const edges: PipelineEdge[] = [
    // Sources → Data Stores
    { from: "excel_bom",    to: "bom_items",    label: "import",  animated: true },
    { from: "excel_bom",    to: "products",     label: "import" },
    { from: "excel_sales",  to: "sales_hist",   label: "import",  animated: true },
    { from: "excel_stock",  to: "comp_stock",   label: "import",  animated: true },
    { from: "manual_entry", to: "stock_moves",  label: "create",  animated: true },
    { from: "manual_entry", to: "comp_stock",   label: "update" },
    { from: "agent_wb",     to: "stock_moves",  label: "writeback" },

    // Data Stores → Engines
    { from: "sales_hist",  to: "dse",         label: "EWMA",     animated: true },
    { from: "dse",         to: "season_idx",  label: "indeksler", animated: true },
    { from: "comp_stock",  to: "intel",       label: "stok verisi" },
    { from: "bom_items",   to: "intel",       label: "reçete" },
    { from: "season_idx",  to: "intel",       label: "mevsimsel", animated: true },
    { from: "products",    to: "intel",       label: "ürün bilgi" },
    { from: "intel",       to: "ate",         label: "urgency" },
    { from: "comp_stock",  to: "impact",      label: "stok delta" },
    { from: "stock_moves", to: "impact",      label: "hareket" },
    { from: "intel",       to: "whatif",      label: "kapasite" },
    { from: "season_idx",  to: "whatif",      label: "talep" },
    { from: "ate",         to: "validation",  label: "eşikler" },
    { from: "intel",       to: "validation",  label: "risk skoru" },

    // Engines → Outputs
    { from: "intel",       to: "ceo_agent",    label: "istihbarat", animated: true },
    { from: "whatif",      to: "ceo_agent",    label: "simülasyon" },
    { from: "impact",      to: "ceo_agent",    label: "etki analiz" },
    { from: "validation",  to: "alerts",       label: "uyarı",      animated: true },
    { from: "ceo_agent",   to: "suggestions",  label: "öneri",      animated: true },
    { from: "ceo_agent",   to: "plans",        label: "plan" },

    // Knowledge ↔ Agent (feedback loops)
    { from: "ole",  to: "ceo_agent", label: "güven skoru" },
    { from: "adm",  to: "ceo_agent", label: "hafıza recall" },
    { from: "tvt",  to: "ceo_agent", label: "V/T metrik" },
    { from: "ceo_agent", to: "ole",  label: "sonuç takip" },
    { from: "ceo_agent", to: "adm",  label: "embedding" },
    { from: "ceo_agent", to: "tvt",  label: "token log" },

    // Write-back loop (the SDDI feedback)
    { from: "ceo_agent",  to: "agent_wb",    label: "karar →",    animated: true },
    { from: "stock_moves", to: "comp_stock",  label: "güncelle",   animated: true },

    // Ontology triangle edges (conceptual)
    { from: "ont_miktar",  to: "ont_sure",    label: "tükenme·whatif·sipariş" },
    { from: "ont_sure",    to: "ont_bilesen", label: "istihbarat·risk·adaptif" },
    { from: "ont_bilesen", to: "ont_miktar",  label: "kapasite·BOM·cross" },
  ];

  return { nodes, edges };
}

/* ═══════════════════════════════════════════════════════════
   CANVAS RENDERER
   ═══════════════════════════════════════════════════════════ */

const NODE_W = 140;
const NODE_H = 56;

function getNodeColor(type: NodeType): string {
  return C[type] || C.accent;
}

function getNodeShape(type: NodeType): "rect" | "hexagon" | "diamond" {
  if (type === "engine") return "hexagon";
  if (type === "ontology") return "diamond";
  return "rect";
}

interface LiveStats {
  tables: Record<string, { count: number; lastUpdate: string | null }>;
  flows: Array<{ source_type: string; cnt: number; last_ts: string }>;
  pipelines: Array<{ name: string; pipeline_type: string; enabled: boolean; last_status: string }>;
}

function drawNode(
  ctx: CanvasRenderingContext2D, node: PipelineNode,
  isHovered: boolean, isSelected: boolean, isDragging: boolean,
  stats: LiveStats | null,
) {
  const color = getNodeColor(node.type);
  const shape = getNodeShape(node.type);
  const x = node.x - NODE_W / 2;
  const y = node.y - NODE_H / 2;

  // Glow for hovered/selected
  if (isHovered || isSelected) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
  }

  ctx.beginPath();
  if (shape === "hexagon") {
    // Hexagon for engines
    const hw = NODE_W / 2, hh = NODE_H / 2;
    const cx = node.x, cy = node.y;
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx - hw * 0.65, cy - hh);
    ctx.lineTo(cx + hw * 0.65, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx + hw * 0.65, cy + hh);
    ctx.lineTo(cx - hw * 0.65, cy + hh);
    ctx.closePath();
  } else if (shape === "diamond") {
    // Diamond for ontology
    const hw = NODE_W / 2 * 0.75, hh = NODE_H / 2 * 1.1;
    ctx.moveTo(node.x, node.y - hh);
    ctx.lineTo(node.x + hw, node.y);
    ctx.lineTo(node.x, node.y + hh);
    ctx.lineTo(node.x - hw, node.y);
    ctx.closePath();
  } else {
    // Rounded rect for sources/stores/outputs
    const r = 10;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + NODE_W - r, y);
    ctx.quadraticCurveTo(x + NODE_W, y, x + NODE_W, y + r);
    ctx.lineTo(x + NODE_W, y + NODE_H - r);
    ctx.quadraticCurveTo(x + NODE_W, y + NODE_H, x + NODE_W - r, y + NODE_H);
    ctx.lineTo(x + r, y + NODE_H);
    ctx.quadraticCurveTo(x, y + NODE_H, x, y + NODE_H - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  // Fill
  ctx.fillStyle = isDragging ? color + "25" : color + "12";
  ctx.fill();
  ctx.strokeStyle = isSelected ? color : color + "80";
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.font = "bold 11px 'Outfit', sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(node.label, node.x, node.y - 6);

  // Sublabel
  if (node.sublabel) {
    ctx.font = "9px 'Outfit', sans-serif";
    ctx.fillStyle = C.dim;
    ctx.fillText(node.sublabel, node.x, node.y + 10);
  }

  // Live stats badge
  if (stats && node.table && stats.tables[node.table]) {
    const count = stats.tables[node.table].count;
    if (count > 0) {
      const badge = fmt(count);
      ctx.font = "bold 8px 'Outfit', sans-serif";
      const bw = ctx.measureText(badge).width + 8;
      const bx = node.x + NODE_W / 2 - bw / 2 - 4;
      const by = node.y - NODE_H / 2 - 6;
      ctx.beginPath();
      const br = 4, bh = 14;
      ctx.moveTo(bx + br, by);
      ctx.lineTo(bx + bw - br, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
      ctx.lineTo(bx + bw, by + bh - br);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
      ctx.lineTo(bx + br, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
      ctx.lineTo(bx, by + br);
      ctx.quadraticCurveTo(bx, by, bx + br, by);
      ctx.closePath();
      ctx.fillStyle = color + "30";
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(badge, bx + bw / 2, by + 8);
    }
  }
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  fromNode: PipelineNode, toNode: PipelineNode,
  edge: PipelineEdge, isHighlighted: boolean,
) {
  const fromColor = getNodeColor(fromNode.type);
  const toColor = getNodeColor(toNode.type);

  // Calculate connection points (from center to center, clipped to node edge)
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  // Start/end offset from center
  const startOff = 40;
  const endOff = 40;
  const sx = fromNode.x + (dx / dist) * startOff;
  const sy = fromNode.y + (dy / dist) * startOff;
  const ex = toNode.x - (dx / dist) * endOff;
  const ey = toNode.y - (dy / dist) * endOff;

  // Draw edge line
  ctx.beginPath();
  ctx.moveTo(sx, sy);

  // Bezier curve for organic feel
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const perpX = -(ey - sy) * 0.1;
  const perpY = (ex - sx) * 0.1;
  ctx.quadraticCurveTo(midX + perpX, midY + perpY, ex, ey);

  ctx.strokeStyle = isHighlighted ? fromColor + "60" : "rgba(255,255,255,0.06)";
  ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(ey - (midY + perpY), ex - (midX + perpX));
  const arrowLen = 6;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - arrowLen * Math.cos(angle - 0.4), ey - arrowLen * Math.sin(angle - 0.4));
  ctx.lineTo(ex - arrowLen * Math.cos(angle + 0.4), ey - arrowLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = isHighlighted ? toColor + "60" : "rgba(255,255,255,0.08)";
  ctx.fill();

  // Flow animation dots
  if (edge.animated || isHighlighted) {
    const t = (Date.now() % 3000) / 3000;
    // Evaluate point on the quadratic bezier
    const t1 = 1 - t;
    const dotX = t1 * t1 * sx + 2 * t1 * t * (midX + perpX) + t * t * ex;
    const dotY = t1 * t1 * sy + 2 * t1 * t * (midY + perpY) + t * t * ey;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = fromColor;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Edge label (at midpoint)
  if (edge.label && isHighlighted) {
    ctx.font = "8px 'Outfit', sans-serif";
    ctx.fillStyle = C.dim;
    ctx.textAlign = "center";
    ctx.fillText(edge.label, midX + perpX, midY + perpY - 6);
  }
}

function drawCanvas(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  nodes: PipelineNode[], edges: PipelineEdge[],
  hoveredNode: string | null, selectedNode: string | null,
  dragNode: string | null, stats: LiveStats | null,
) {
  ctx.clearRect(0, 0, width, height);

  // Grid dots
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  for (let x = 20; x < width; x += 30) {
    for (let y = 20; y < height; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Column labels (ratio-based)
  ctx.font = "9px 'Outfit', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = C.dim;
  const colX = [0.07, 0.27, 0.50, 0.70, 0.92].map(r => r * width);
  const colLabels = ["VERİ KAYNAKLARI", "VERİ HAVUZLARI", "MOTORLAR", "BİLGİ KATMANI", "ÇIKTILAR / AKSİYON"];
  for (let i = 0; i < colLabels.length; i++) {
    ctx.fillText(colLabels[i], colX[i], 40);
  }

  // Section dividers
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const dividers = [0.17, 0.385, 0.60, 0.81].map(r => r * width);
  for (const x of dividers) {
    ctx.beginPath();
    ctx.moveTo(x, 50);
    ctx.lineTo(x, height - 30);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Ontology triangle background
  const ontNodes = nodes.filter(n => n.type === "ontology");
  if (ontNodes.length === 3) {
    ctx.beginPath();
    ctx.moveTo(ontNodes[0].x, ontNodes[0].y);
    ctx.lineTo(ontNodes[1].x, ontNodes[1].y);
    ctx.lineTo(ontNodes[2].x, ontNodes[2].y);
    ctx.closePath();
    ctx.fillStyle = C.accent + "06";
    ctx.fill();
    ctx.strokeStyle = C.accent + "15";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Build node map
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Connected edges for highlight
  const connectedEdges = new Set<number>();
  if (hoveredNode || selectedNode) {
    const target = selectedNode || hoveredNode;
    edges.forEach((e, i) => {
      if (e.from === target || e.to === target) connectedEdges.add(i);
    });
  }

  // Edges
  edges.forEach((edge, i) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return;
    drawEdge(ctx, from, to, edge, connectedEdges.has(i));
  });

  // Nodes
  for (const node of nodes) {
    drawNode(ctx, node, hoveredNode === node.id, selectedNode === node.id, dragNode === node.id, stats);
  }

  // Legend
  const legendY = height - 30;
  const types: Array<{ type: NodeType; label: string }> = [
    { type: "source", label: "Veri Kaynağı" },
    { type: "store", label: "Veri Havuzu" },
    { type: "engine", label: "Motor" },
    { type: "output", label: "Çıktı" },
    { type: "ontology", label: "Ontology" },
  ];
  let legendX = 16;
  ctx.font = "9px 'Outfit', sans-serif";
  ctx.textAlign = "left";
  for (const t of types) {
    ctx.beginPath();
    ctx.arc(legendX, legendY, 4, 0, Math.PI * 2);
    ctx.fillStyle = getNodeColor(t.type);
    ctx.fill();
    ctx.fillStyle = C.dim;
    ctx.fillText(t.label, legendX + 10, legendY + 3);
    legendX += ctx.measureText(t.label).width + 28;
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function LineagePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const sizeRef = useRef({ w: 1200, h: 800 });

  const { selectedSku: sku } = useSKU();

  // Pipeline blueprint (mutable positions for drag)
  const [blueprint] = useState(() => createPipelineBlueprint());
  const nodesRef = useRef<PipelineNode[]>(blueprint.nodes);
  const edgesRef = useRef<PipelineEdge[]>(blueprint.edges);
  const scaledRef = useRef(false); // track if we've done initial scale

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  // Live stats from backend
  const { data: stats } = useQuery<LiveStats>({
    queryKey: ["/api/foundry/lineage/graph/stats"],
    queryFn: () => apiRequest("GET", "/api/foundry/lineage/graph/stats").then(r => r.json()),
    staleTime: 30000,
    retry: false,
  });

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      sizeRef.current = { w: rect.width, h: rect.height };

      // Scale ratio-based positions to actual canvas size (only on first render)
      if (!scaledRef.current && rect.width > 100 && rect.height > 100) {
        for (const node of nodesRef.current) {
          node.x = node.x * rect.width;
          node.y = node.y * rect.height;
        }
        scaledRef.current = true;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const tick = () => {
      if (!running) return;
      const { w, h } = sizeRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCanvas(ctx, w, h, nodesRef.current, edgesRef.current, hoveredNode, selectedNode, dragNode, stats ?? null);
      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [hoveredNode, selectedNode, dragNode, stats]);

  // Mouse helpers
  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  }, []);

  const findNodeAt = useCallback((mx: number, my: number): PipelineNode | null => {
    // Reverse order so top-drawn nodes get picked first
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (Math.abs(mx - n.x) < NODE_W / 2 + 4 && Math.abs(my - n.y) < NODE_H / 2 + 4) return n;
    }
    return null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getMousePos(e);

    // Dragging
    if (dragNode) {
      const node = nodesRef.current.find(n => n.id === dragNode);
      if (node) {
        node.x = mx - dragOffsetRef.current.dx;
        node.y = my - dragOffsetRef.current.dy;
      }
      return;
    }

    const node = findNodeAt(mx, my);
    setHoveredNode(node?.id || null);
    e.currentTarget.style.cursor = node ? "grab" : "default";
  }, [dragNode, findNodeAt, getMousePos]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getMousePos(e);
    const node = findNodeAt(mx, my);
    if (node) {
      setDragNode(node.id);
      dragOffsetRef.current = { dx: mx - node.x, dy: my - node.y };
      e.currentTarget.style.cursor = "grabbing";
    }
  }, [findNodeAt, getMousePos]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragNode) {
      // If barely moved, treat as click
      setDragNode(null);
      e.currentTarget.style.cursor = "grab";
    }
  }, [dragNode]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragNode) return; // don't select while dragging
    const { mx, my } = getMousePos(e);
    const node = findNodeAt(mx, my);
    setSelectedNode(prev => node?.id === prev ? null : (node?.id || null));
  }, [dragNode, findNodeAt, getMousePos]);

  // Selected node details
  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodesRef.current.find(n => n.id === selectedNode) || null;
  }, [selectedNode]);

  // Connected nodes for selected
  const connections = useMemo(() => {
    if (!selectedNode) return { incoming: [] as PipelineEdge[], outgoing: [] as PipelineEdge[] };
    const incoming = edgesRef.current.filter(e => e.to === selectedNode);
    const outgoing = edgesRef.current.filter(e => e.from === selectedNode);
    return { incoming, outgoing };
  }, [selectedNode]);

  // Summary stats
  const totalRecords = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats.tables).reduce((sum, t) => sum + t.count, 0);
  }, [stats]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: mono }}>
      <TopNav connected={true} />
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 48px)" }}>
        {/* ═══ LEFT: Info Panel ═══ */}
        <div style={{
          width: 300, borderRight: `1px solid ${C.border}`, padding: 20,
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
        }}>
          {/* Header */}
          <div>
            <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.5 }}>
              LINEAGE CANVAS
            </div>
            <div style={{ fontSize: 18, fontWeight: 400, color: C.white, marginTop: 4 }}>
              Veri Akış Haritası
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
              Palantir SDDI — Software Defined Data Integration
            </div>
          </div>

          {/* Overall Stats */}
          <div style={{
            padding: 16, borderRadius: 12, background: C.surface,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>SİSTEM GENEL</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                <div style={{ fontSize: 8, color: C.dim }}>TOPLAM KAYIT</div>
                <div style={{ fontSize: 18, fontWeight: 400, color: C.accent }}>{stats ? fmt(totalRecords) : "—"}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                <div style={{ fontSize: 8, color: C.dim }}>BAĞLANTI</div>
                <div style={{ fontSize: 18, fontWeight: 400, color: C.purple }}>{edgesRef.current.length}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                <div style={{ fontSize: 8, color: C.dim }}>DÜĞÜM</div>
                <div style={{ fontSize: 18, fontWeight: 400, color: C.blue }}>{nodesRef.current.length}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                <div style={{ fontSize: 8, color: C.dim }}>VERİ AKIŞI</div>
                <div style={{ fontSize: 18, fontWeight: 400, color: C.ok }}>{stats?.flows?.length ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Data Flow Types */}
          {stats?.flows && stats.flows.length > 0 && (
            <div style={{
              padding: 16, borderRadius: 12, background: C.surface,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>VERİ AKIŞ TİPLERİ</div>
              {stats.flows.map((f: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10 }}>
                  <span style={{ color: C.mid }}>{f.source_type}</span>
                  <span style={{ color: C.white }}>{fmt(f.cnt)} kayıt</span>
                </div>
              ))}
            </div>
          )}

          {/* Pipeline Health */}
          {stats?.pipelines && stats.pipelines.length > 0 && (
            <div style={{
              padding: 16, borderRadius: 12, background: C.surface,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>PIPELINE DURUMU</div>
              {stats.pipelines.map((p: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: C.mid }}>{p.name}</span>
                  <span style={{
                    fontSize: 8, padding: "2px 6px", borderRadius: 4,
                    background: p.last_status === "completed" ? C.okDim : p.last_status === "failed" ? C.errDim : C.surface,
                    color: p.last_status === "completed" ? C.ok : p.last_status === "failed" ? C.err : C.dim,
                  }}>
                    {p.last_status || "bekliyor"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Selected Node Details */}
          {selectedNodeData && (
            <div style={{
              padding: 16, borderRadius: 12,
              background: getNodeColor(selectedNodeData.type) + "08",
              border: `1px solid ${getNodeColor(selectedNodeData.type)}20`,
            }}>
              <div style={{ fontSize: 9, color: getNodeColor(selectedNodeData.type), letterSpacing: 1, marginBottom: 8 }}>
                SEÇİLİ DÜĞÜM
              </div>
              <div style={{ fontSize: 14, fontWeight: 400, color: C.white }}>{selectedNodeData.label}</div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{selectedNodeData.sublabel}</div>
              <div style={{ fontSize: 9, color: C.mid, marginTop: 2 }}>
                Tip: {selectedNodeData.type === "source" ? "Veri Kaynağı" :
                  selectedNodeData.type === "store" ? "Veri Havuzu" :
                  selectedNodeData.type === "engine" ? "Motor" :
                  selectedNodeData.type === "output" ? "Çıktı" : "Ontology"}
              </div>

              {/* Live stats for table */}
              {selectedNodeData.table && stats?.tables[selectedNodeData.table] && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: C.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: C.dim }}>Kayıt Sayısı</span>
                    <span style={{ color: C.white, fontWeight: 400 }}>{fmt(stats.tables[selectedNodeData.table].count)}</span>
                  </div>
                  {stats.tables[selectedNodeData.table].lastUpdate && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 4 }}>
                      <span style={{ color: C.dim }}>Son Güncelleme</span>
                      <span style={{ color: C.mid }}>
                        {new Date(stats.tables[selectedNodeData.table].lastUpdate!).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Connections */}
              {connections.incoming.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>GELEN VERİ ({connections.incoming.length})</div>
                  {connections.incoming.map((e, i) => {
                    const fromNode = nodesRef.current.find(n => n.id === e.from);
                    return (
                      <div key={i} style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>
                        <span style={{ color: getNodeColor(fromNode?.type || "store") }}>{fromNode?.label}</span>
                        {e.label && <span style={{ color: C.dim }}> ({e.label})</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {connections.outgoing.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>GİDEN VERİ ({connections.outgoing.length})</div>
                  {connections.outgoing.map((e, i) => {
                    const toNode = nodesRef.current.find(n => n.id === e.to);
                    return (
                      <div key={i} style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>
                        <span style={{ color: getNodeColor(toNode?.type || "store") }}>{toNode?.label}</span>
                        {e.label && <span style={{ color: C.dim }}> ({e.label})</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div style={{ fontSize: 9, color: C.dim, lineHeight: 1.6, marginTop: "auto", padding: "12px 0" }}>
            Sürükle: Düğüm taşı &middot; Tıkla: Detay gör &middot; Animasyon: Canlı veri akışı
          </div>
        </div>

        {/* ═══ RIGHT: Canvas ═══ */}
        <div ref={containerRef} style={{ flex: 1, position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{ display: "block" }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
          />

          {/* Title overlay */}
          <div style={{
            position: "absolute", top: 12, left: 20,
            fontSize: 9, color: C.dim, letterSpacing: 1,
          }}>
            GRISEUS SDDI — SOFTWARE DEFINED DATA INTEGRATION
          </div>

          {/* Ontology triangle label */}
          <div style={{
            position: "absolute", bottom: 60, right: 20,
            fontSize: 9, color: C.accent + "60", letterSpacing: 1,
          }}>
            ONTOLOGY TRIANGLE — MİKTAR × SÜRE × BİLEŞEN
          </div>
        </div>
      </div>
    </div>
  );
}
