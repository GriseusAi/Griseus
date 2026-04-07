import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSKU } from "@/lib/sku-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TopNav from "@/components/top-nav";
import ProductSelector from "@/components/ProductSelector";
import { useStockWebSocket, type StockUpdateEvent } from "@/lib/useStockWebSocket";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — ONTOLOGY DIAGRAM & SIMULATION ENGINE
   Palantir-style interactive force graph with live simulation
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.10)", accentGlow: "rgba(99,102,241,0.25)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.08)", okBorder: "rgba(52,211,153,0.15)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.08)", warnBorder: "rgba(251,191,36,0.15)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.06)", errBorder: "rgba(239,68,68,0.15)",
  blue: "#60a5fa", purple: "#a78bfa", cyan: "#22d3ee",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60", dimmer: "#2a2a3a",
};
const mono = "'Outfit', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Types ── */
interface BomComponent {
  code: string; name: string; requiredPerUnit: number; unit: string;
  tier: number; parentComponentCode: string | null;
  currentStock: number; maxProducts: number | null; status: string;
}

interface CapacityData {
  product: string; maxProducible: number;
  bottlenecks: Array<{ code: string; name: string; tier: number; stock: number; required: number; maxProducts: number; note?: string }>;
  subAssemblyStatus: Record<string, { name: string; currentStock: number; producibleFromParts: number; partBottleneck: string; parts: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number }> }>;
}

interface StockData { product: string; components: BomComponent[] }

/* ═══════════════════════════════════════════════════════════
   GRAPH ENGINE — Pure Canvas force-directed layout
   No external graph lib dependency, full control
   ═══════════════════════════════════════════════════════════ */

interface GNode {
  id: string; label: string; tier: number; stock: number; required: number;
  maxProducts: number | null; status: string; unit: string;
  x: number; y: number; vx: number; vy: number;
  parentCode: string | null;
  isProduct?: boolean; isSubAssembly?: boolean;
}

interface GEdge { source: string; target: string; label: string; qty: number }

function buildGraph(components: BomComponent[], sku: string): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  // Product node (center)
  nodes.push({
    id: sku, label: `${sku}\nGoldsun`, tier: 0,
    stock: 0, required: 0, maxProducts: null, status: "product", unit: "",
    x: 0, y: 0, vx: 0, vy: 0, parentCode: null, isProduct: true,
  });

  for (const c of components) {
    nodes.push({
      id: c.code, label: `${c.code}\n${c.name}`, tier: c.tier,
      stock: c.currentStock, required: c.requiredPerUnit, maxProducts: c.maxProducts,
      status: c.status, unit: c.unit,
      x: (Math.random() - 0.5) * 600, y: (Math.random() - 0.5) * 400,
      vx: 0, vy: 0, parentCode: c.parentComponentCode,
      isSubAssembly: c.tier === 2,
    });

    // Edge: parent → child
    if (c.tier === 1 || c.tier === 2) {
      edges.push({ source: sku, target: c.code, label: `×${c.requiredPerUnit}`, qty: c.requiredPerUnit });
    } else if (c.tier === 3 && c.parentComponentCode) {
      edges.push({ source: c.parentComponentCode, target: c.code, label: `×${c.requiredPerUnit}`, qty: c.requiredPerUnit });
    }
  }

  return { nodes, edges };
}

/* Force simulation tick */
function simulateForces(nodes: GNode[], edges: GEdge[], width: number, height: number) {
  const cx = width / 2, cy = height / 2;
  const REPULSION = 8000;
  const SPRING = 0.008;
  const SPRING_LEN = 140;
  const DAMPING = 0.85;
  const CENTER_PULL = 0.002;

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx += fx; nodes[i].vy += fy;
      nodes[j].vx -= fx; nodes[j].vy -= fy;
    }
  }

  // Spring forces along edges
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const e of edges) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) continue;
    const dx = t.x - s.x, dy = t.y - s.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = SPRING * (dist - SPRING_LEN);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx; s.vy += fy;
    t.vx -= fx; t.vy -= fy;
  }

  // Tier-based Y layering
  for (const n of nodes) {
    const targetY = cy + (n.tier - 1) * 120;
    n.vy += (targetY - n.y) * 0.01;
  }

  // Center pull + damping + update
  for (const n of nodes) {
    n.vx += (cx - n.x) * CENTER_PULL;
    n.vy += (cy - n.y) * CENTER_PULL;
    n.vx *= DAMPING; n.vy *= DAMPING;
    if (!n.isProduct) { n.x += n.vx; n.y += n.vy; }
    else { n.x = cx; n.y = cy - 80; }
  }
}

/* ═══════════════════════════════════════════════════════════
   SIMULATION MATH — Production optimization algorithms
   ═══════════════════════════════════════════════════════════ */

interface SimResult {
  canProduce: boolean;
  maxProducible: number;
  bottleneck: { code: string; name: string; maxProducts: number } | null;
  components: Array<{
    code: string; name: string; tier: number;
    required: number; available: number; surplus: number;
    isBottleneck: boolean; utilizationPct: number;
  }>;
  totalCost: number; // opportunity cost index
  optimizationSuggestions: string[];
}

function runSimulation(components: BomComponent[], targetQty: number): SimResult {
  const tier1and2 = components.filter(c => c.tier === 1 || c.tier === 2);

  // API already returns effective stock for tier 2 (currentStock includes producible from parts)
  // No need to recalculate — just use currentStock directly
  const results = tier1and2.map(c => {
    const available = c.currentStock;
    const required = c.requiredPerUnit * targetQty;
    const maxProducts = c.requiredPerUnit > 0 ? Math.floor(available / c.requiredPerUnit) : Infinity;
    const surplus = available - required;
    const utilizationPct = available > 0 ? Math.min((required / available) * 100, 100) : (required > 0 ? 100 : 0);
    return {
      code: c.code, name: c.name, tier: c.tier,
      required, available, surplus,
      isBottleneck: false, utilizationPct,
      maxProducts,
    };
  }).sort((a, b) => a.maxProducts - b.maxProducts);

  const maxProducible = results.length > 0 ? Math.max(0, results[0].maxProducts === Infinity ? 0 : results[0].maxProducts) : 0;
  if (results.length > 0) results[0].isBottleneck = true;

  // Mark top 3 bottlenecks
  for (let i = 0; i < Math.min(3, results.length); i++) {
    if (results[i].surplus < 0) results[i].isBottleneck = true;
  }

  // Optimization suggestions
  const suggestions: string[] = [];
  const shortages = results.filter(r => r.surplus < 0);
  if (shortages.length > 0) {
    suggestions.push(`${shortages.length} bileşen eksik — ${maxProducible} adet üretilebilir`);
    for (const s of shortages.slice(0, 3)) {
      suggestions.push(`${s.code} ${s.name}: ${fmt(Math.abs(s.surplus))} ${components.find(c => c.code === s.code)?.unit || "adet"} sipariş ver`);
    }
  }
  const overstock = results.filter(r => r.utilizationPct < 5 && r.available > 500);
  if (overstock.length > 0) {
    suggestions.push(`${overstock.length} bileşende aşırı stok — sermaye bağlı`);
  }
  if (maxProducible >= targetQty) {
    suggestions.push(`Hedef ${fmt(targetQty)} adet karşılanabilir!`);
    const leftover = maxProducible - targetQty;
    if (leftover > 50) suggestions.push(`Üretim sonrası ${fmt(leftover)} adet daha üretilebilir`);
  }

  // Opportunity cost: sum of (shortage × urgency weight)
  const totalCost = shortages.reduce((sum, s) => sum + Math.abs(s.surplus) * (s.isBottleneck ? 3 : 1), 0);

  return {
    canProduce: maxProducible >= targetQty,
    maxProducible,
    bottleneck: results.length > 0 ? { code: results[0].code, name: results[0].name, maxProducts: results[0].maxProducts } : null,
    components: results,
    totalCost,
    optimizationSuggestions: suggestions,
  };
}

/* ═══════════════════════════════════════════════════════════
   CANVAS RENDERER — Draws the force graph
   ═══════════════════════════════════════════════════════════ */

function getNodeColor(node: GNode, sim: SimResult | null): string {
  if (node.isProduct) return C.accent;
  if (!sim) {
    if (node.status === "critical") return C.err;
    if (node.status === "warning") return C.warn;
    if (node.status === "ok") return C.blue;
    return C.ok;
  }
  const sc = sim.components.find(c => c.code === node.id);
  if (!sc) return C.dim;
  if (sc.surplus < 0) return C.err;  // Stok yetersiz = kırmızı
  if (sc.isBottleneck) return C.warn; // En zayıf halka ama yeterli = turuncu
  if (sc.utilizationPct > 80) return C.blue;
  return C.ok;
}

function getNodeRadius(node: GNode): number {
  if (node.isProduct) return 32;
  if (node.isSubAssembly) return 22;
  if (node.tier === 3) return 14;
  return 18;
}

function drawGraph(
  ctx: CanvasRenderingContext2D, nodes: GNode[], edges: GEdge[],
  width: number, height: number, hoveredNode: string | null,
  selectedNode: string | null, sim: SimResult | null, simQty: number,
) {
  ctx.clearRect(0, 0, width, height);

  // Background grid
  ctx.strokeStyle = "rgba(255,255,255,0.02)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Edges
  for (const e of edges) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) continue;

    const isHighlighted = selectedNode === e.source || selectedNode === e.target;
    const sc = sim?.components.find(c => c.code === e.target);
    const edgeColor = sim && sc
      ? (sc.surplus < 0 ? C.err : sc.isBottleneck ? C.warn : "rgba(255,255,255,0.08)")
      : isHighlighted ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.06)";

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = isHighlighted ? 2 : 1;
    ctx.stroke();

    // Flow animation dots when simulating
    if (sim && sc && simQty > 0) {
      const progress = (Date.now() % 2000) / 2000;
      const dotX = s.x + (t.x - s.x) * progress;
      const dotY = s.y + (t.y - s.y) * progress;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = sc.surplus >= 0 ? C.ok : C.err;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Edge label
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
    ctx.font = "9px 'Outfit', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.textAlign = "center";
    ctx.fillText(e.label, mx, my - 4);
  }

  // Nodes
  for (const n of nodes) {
    const r = getNodeRadius(n);
    const color = getNodeColor(n, sim);
    const isHovered = hoveredNode === n.id;
    const isSelected = selectedNode === n.id;

    // Glow for hovered/selected
    if (isHovered || isSelected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 12);
      grad.addColorStop(0, color + "40");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Pulse ring: red only if surplus < 0, orange if bottleneck but sufficient
    if (sim) {
      const sc = sim.components.find(c => c.code === n.id);
      if (sc && (sc.surplus < 0 || sc.isBottleneck)) {
        const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = sc.surplus < 0 ? C.err : C.warn;
        ctx.lineWidth = 2;
        ctx.globalAlpha = pulse;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.isProduct ? C.accent + "30" : color + "15";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // Utilization arc (sim mode)
    if (sim && !n.isProduct) {
      const sc = sim.components.find(c => c.code === n.id);
      if (sc) {
        const pct = Math.min(sc.utilizationPct / 100, 1);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 2, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
        ctx.strokeStyle = pct > 0.95 ? C.err : pct > 0.7 ? C.warn : C.ok;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Label
    ctx.font = n.isProduct ? "bold 11px 'Outfit', sans-serif" : "10px 'Outfit', sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    const lines = n.label.split("\n");
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], n.x, n.y + r + 12 + i * 12);
    }

    // Stock number inside node
    if (!n.isProduct) {
      ctx.font = "bold 10px 'Outfit', sans-serif";
      ctx.fillStyle = C.white;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.stock > 9999 ? `${(n.stock / 1000).toFixed(1)}k` : String(Math.round(n.stock)), n.x, n.y);
      ctx.textBaseline = "alphabetic";
    } else {
      ctx.font = "bold 13px 'Outfit', sans-serif";
      ctx.fillStyle = C.accent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const skuParts = n.id.split(/[.\-]/);
      ctx.fillText(skuParts[0] || n.id, n.x, n.y - 4);
      ctx.font = "9px 'Outfit', sans-serif";
      ctx.fillText(skuParts.slice(1).join("-") || "", n.x, n.y + 8);
      ctx.textBaseline = "alphabetic";
    }
  }

  // Legend
  ctx.font = "9px 'Outfit', sans-serif";
  ctx.textAlign = "left";
  const legendItems = [
    { color: C.accent, label: "Ürün" },
    { color: C.ok, label: "Bol Stok" },
    { color: C.blue, label: "Yeterli" },
    { color: C.warn, label: "Düşük" },
    { color: C.err, label: "Kritik / Darboğaz" },
  ];
  for (let i = 0; i < legendItems.length; i++) {
    const lx = 16, ly = height - 80 + i * 16;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = legendItems[i].color; ctx.fill();
    ctx.fillStyle = C.dim; ctx.fillText(legendItems[i].label, lx + 10, ly + 3);
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function OntologyPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const animRef = useRef<number>(0);
  const sizeRef = useRef({ w: 1200, h: 800 });

  const { selectedSku: sku, setSelectedSku: setSku } = useSKU();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [simQty, setSimQty] = useState(0);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const qc = useQueryClient();

  // WebSocket — live blood flow: stock changes pump to all organs instantly
  const handleStockUpdate = useCallback((data: StockUpdateEvent) => {
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
    qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/intelligence`] });
    setLastUpdate(`${data.productSku} ${data.movementType} ×${data.quantity}`);
    setTimeout(() => setLastUpdate(null), 3000);
  }, [qc, sku]);
  const { connected } = useStockWebSocket(handleStockUpdate);

  // Reset state when SKU changes
  useEffect(() => {
    setSimQty(0);
    setSimResult(null);
    setSelectedNode(null);
    setGraphReady(false);
  }, [sku]);

  // Data — shared query keys with other pages = automatic cross-page sync
  const { data: stockData } = useQuery<StockData>({
    queryKey: [`/api/bom/${sku}/stock`],
    queryFn: () => apiRequest("GET", `/api/bom/${sku}/stock`).then(r => r.json()),
    staleTime: 5000,
  });

  const { data: capacityData } = useQuery<CapacityData>({
    queryKey: [`/api/bom/${sku}/production-capacity`],
    queryFn: () => apiRequest("GET", `/api/bom/${sku}/production-capacity`).then(r => r.json()),
    staleTime: 5000,
  });

  // Resize canvas to container with DPR (Retina support)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      sizeRef.current = { w, h };
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Build graph when data arrives
  useEffect(() => {
    if (!stockData?.components) return;
    const { nodes, edges } = buildGraph(stockData.components, sku);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    // Run initial layout iterations
    const { w, h } = sizeRef.current;
    for (let i = 0; i < 150; i++) simulateForces(nodes, edges, w, h);
    setGraphReady(true);
  }, [stockData]);

  // Run simulation when qty changes
  useEffect(() => {
    if (!stockData?.components || simQty === 0) {
      setSimResult(null);
      return;
    }
    setSimResult(runSimulation(stockData.components, simQty));
  }, [simQty, stockData]);

  // Animation loop
  useEffect(() => {
    if (!graphReady) return;
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
      simulateForces(nodesRef.current, edgesRef.current, w, h);
      drawGraph(ctx, nodesRef.current, edgesRef.current, w, h, hoveredNode, selectedNode, simResult, simQty);
      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [graphReady, hoveredNode, selectedNode, simResult, simQty]);

  // Mouse interaction
  const findNodeAt = useCallback((mx: number, my: number): GNode | null => {
    for (const n of nodesRef.current) {
      const r = getNodeRadius(n);
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy < (r + 6) * (r + 6)) return n;
    }
    return null;
  }, []);

  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getMousePos(e);
    const node = findNodeAt(mx, my);
    setHoveredNode(node?.id || null);
    e.currentTarget.style.cursor = node ? "pointer" : "default";
  }, [findNodeAt, getMousePos]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getMousePos(e);
    const node = findNodeAt(mx, my);
    setSelectedNode(prev => node?.id === prev ? null : (node?.id || null));
  }, [findNodeAt, getMousePos]);

  // Selected node details
  const selectedComp = useMemo(() => {
    if (!selectedNode || !stockData?.components) return null;
    return stockData.components.find(c => c.code === selectedNode) || null;
  }, [selectedNode, stockData]);

  const selectedSimComp = useMemo(() => {
    if (!selectedNode || !simResult) return null;
    return simResult.components.find(c => c.code === selectedNode) || null;
  }, [selectedNode, simResult]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: mono }}>
      <TopNav connected={connected} />
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${C.accent}; cursor: pointer; border: 2px solid ${C.white}; }
        input[type="range"] { -webkit-appearance: none; background: ${C.border}; height: 4px; border-radius: 4px; outline: none; }
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 48px)" }}>
        {/* ═══ LEFT: Controls + Simulation Panel ═══ */}
        <div style={{
          width: 340, borderRight: `1px solid ${C.border}`, padding: 20,
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
        }}>
          {/* Header */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 9, fontFamily: mono, color: C.accent, letterSpacing: 1.5, fontWeight: 400 }}>
                ONTOLOGY DIAGRAM
              </div>
              <ProductSelector value={sku} onChange={setSku} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 400, color: C.white, marginTop: 4 }}>
              {sku} Üretim Grafi
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
              {stockData?.components.length || 0} bileşen &middot; {edgesRef.current.length} bağlantı
            </div>
          </div>

          {/* Capacity Summary */}
          {capacityData && (
            <div style={{
              padding: 16, borderRadius: 12, background: C.surface,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>MEVCUT KAPASİTE</div>
              <div style={{ fontSize: 32, fontWeight: 400, color: C.accent }}>{fmt(capacityData.maxProducible)}</div>
              <div style={{ fontSize: 10, color: C.dim }}>adet {sku} üretilebilir</div>
              {capacityData.bottlenecks[0] && (
                <div style={{ fontSize: 10, color: C.err, marginTop: 8 }}>
                  Darboğaz: {capacityData.bottlenecks[0].name} ({fmt(capacityData.bottlenecks[0].stock)}/{capacityData.bottlenecks[0].required})
                </div>
              )}
            </div>
          )}

          {/* ═══ SIMULATION SLIDER ═══ */}
          <div style={{
            padding: 16, borderRadius: 12,
            background: simQty > 0 ? C.accentDim : C.surface,
            border: `1px solid ${simQty > 0 ? C.accent + "40" : C.border}`,
          }}>
            <div style={{ fontSize: 9, color: simQty > 0 ? C.accent : C.dim, letterSpacing: 1, marginBottom: 12 }}>
              {simQty > 0 ? "SİMÜLASYON AKTİF" : "ÜRETİM SİMÜLASYONU"}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.mid }}>Hedef üretim:</span>
              <span style={{ fontSize: 24, fontWeight: 400, color: simQty > 0 ? C.accent : C.dim }}>{fmt(simQty)}</span>
            </div>

            <input
              type="range" min={0} max={1000} step={10} value={simQty}
              onChange={e => setSimQty(Number(e.target.value))}
              style={{ width: "100%", marginBottom: 12 }}
            />

            {/* Quick presets */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[0, 50, 100, 200, 500, 1000].map(v => (
                <button key={v} onClick={() => setSimQty(v)} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 10,
                  background: simQty === v ? C.accent + "30" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${simQty === v ? C.accent + "60" : C.border}`,
                  color: simQty === v ? C.accent : C.dim, cursor: "pointer", fontFamily: mono,
                }}>
                  {v === 0 ? "Sıfırla" : `${v} adet`}
                </button>
              ))}
            </div>
          </div>

          {/* ═══ SIMULATION RESULTS ═══ */}
          {simResult && (
            <div style={{
              padding: 16, borderRadius: 12,
              background: simResult.canProduce ? C.okDim : C.errDim,
              border: `1px solid ${simResult.canProduce ? C.okBorder : C.errBorder}`,
            }}>
              <div style={{
                fontSize: 14, fontWeight: 400, marginBottom: 8,
                color: simResult.canProduce ? C.ok : C.err,
              }}>
                {simResult.canProduce ? "ULAŞILABİLİR" : "KARŞILANAMAZ"}
              </div>
              <div style={{ fontSize: 11, color: C.mid, marginBottom: 8 }}>
                Max üretilebilir: <span style={{ color: C.white, fontWeight: 400 }}>{fmt(simResult.maxProducible)}</span>
              </div>
              {simResult.bottleneck && (
                <div style={{ fontSize: 10, color: C.err, marginBottom: 8 }}>
                  Darboğaz: {simResult.bottleneck.name} (max {fmt(simResult.bottleneck.maxProducts)})
                </div>
              )}

              {/* Suggestions */}
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 12, marginBottom: 6 }}>OPTİMİZASYON</div>
              {simResult.optimizationSuggestions.map((s, i) => (
                <div key={i} style={{ fontSize: 10, color: C.mid, marginBottom: 4, paddingLeft: 8, borderLeft: `2px solid ${C.accent}30` }}>
                  {s}
                </div>
              ))}

              {/* Top components by utilization */}
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 12, marginBottom: 6 }}>KULLANIM ORANI</div>
              {simResult.components.slice(0, 6).map(c => (
                <div key={c.code} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: c.surplus < 0 ? C.err : c.isBottleneck ? C.warn : C.mid }}>{c.code} {c.name.slice(0, 20)}</span>
                    <span style={{ color: c.utilizationPct > 90 ? C.err : c.utilizationPct > 70 ? C.warn : C.ok }}>
                      {c.utilizationPct.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                    <div style={{
                      width: `${Math.min(c.utilizationPct, 100)}%`, height: "100%", borderRadius: 2,
                      background: c.utilizationPct > 90 ? C.err : c.utilizationPct > 70 ? C.warn : C.ok,
                      transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ SELECTED NODE DETAIL ═══ */}
          {selectedComp && (
            <div style={{
              padding: 16, borderRadius: 12, background: C.surface, border: `1px solid ${C.borderActive}`,
            }}>
              <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1, marginBottom: 8 }}>SEÇİLİ BİLEŞEN</div>
              <div style={{ fontSize: 14, fontWeight: 400, color: C.white }}>{selectedComp.name}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{selectedComp.code} &middot; Tier {selectedComp.tier} &middot; {selectedComp.unit}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                  <div style={{ fontSize: 8, color: C.dim }}>STOK</div>
                  <div style={{ fontSize: 18, fontWeight: 400, color: C.white }}>{fmt(selectedComp.currentStock)}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                  <div style={{ fontSize: 8, color: C.dim }}>ÜRÜN YETERLİLİK</div>
                  <div style={{ fontSize: 18, fontWeight: 400, color: C.white }}>{selectedComp.maxProducts !== null ? fmt(selectedComp.maxProducts) : "—"}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                  <div style={{ fontSize: 8, color: C.dim }}>BİRİM BAŞI</div>
                  <div style={{ fontSize: 18, fontWeight: 400, color: C.white }}>{selectedComp.requiredPerUnit}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 8, background: C.bg }}>
                  <div style={{ fontSize: 8, color: C.dim }}>DURUM</div>
                  <div style={{ fontSize: 14, fontWeight: 400, color:
                    selectedComp.status === "critical" ? C.err : selectedComp.status === "warning" ? C.warn : C.ok
                  }}>
                    {selectedComp.status === "critical" ? "KRİTİK" : selectedComp.status === "warning" ? "DÜŞÜK" : selectedComp.status === "ok" ? "YETERLİ" : "BOL"}
                  </div>
                </div>
              </div>

              {/* Sim detail for this component */}
              {selectedSimComp && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: selectedSimComp.surplus >= 0 ? C.okDim : C.errDim }}>
                  <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>SİMÜLASYON ETKİSİ</div>
                  <div style={{ fontSize: 11, color: C.mid }}>
                    Gerekli: <span style={{ color: C.white }}>{fmt(selectedSimComp.required)}</span> &middot;
                    Mevcut: <span style={{ color: C.white }}>{fmt(selectedSimComp.available)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 400, marginTop: 4, color: selectedSimComp.surplus >= 0 ? C.ok : C.err }}>
                    {selectedSimComp.surplus >= 0 ? `+${fmt(selectedSimComp.surplus)} fazla` : `${fmt(Math.abs(selectedSimComp.surplus))} eksik`}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Canvas ═══ */}
        <div ref={containerRef} style={{ flex: 1, position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{ display: "block" }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
          />

          {/* Tier labels */}
          {graphReady && (
            <>
              <div style={{ position: "absolute", top: 60, left: 20, fontSize: 9, color: C.dim, letterSpacing: 1 }}>ÜRÜN</div>
              <div style={{ position: "absolute", top: 180, left: 20, fontSize: 9, color: C.dim, letterSpacing: 1 }}>TIER 1 — DİREKT MALZEME</div>
              <div style={{ position: "absolute", top: 300, left: 20, fontSize: 9, color: C.dim, letterSpacing: 1 }}>TIER 2 — YARI MAMÜL</div>
              <div style={{ position: "absolute", top: 420, left: 20, fontSize: 9, color: C.dim, letterSpacing: 1 }}>TIER 3 — ALT BİLEŞEN</div>
            </>
          )}

          {/* Sim mode indicator */}
          {simQty > 0 && (
            <div style={{
              position: "absolute", top: 16, right: 16, padding: "8px 16px",
              borderRadius: 8, background: C.accent + "20", border: `1px solid ${C.accent}50`,
              fontSize: 11, color: C.accent, fontFamily: mono,
              animation: "pulse 2s infinite",
            }}>
              SİMÜLASYON: {fmt(simQty)} adet üretim
            </div>
          )}

          {/* Live update flash */}
          {lastUpdate && (
            <div style={{
              position: "absolute", bottom: 16, right: 16, padding: "8px 16px",
              borderRadius: 8, background: C.okDim, border: `1px solid ${C.okBorder}`,
              fontSize: 10, color: C.ok, fontFamily: mono,
              animation: "pulse 1s infinite",
            }}>
              ⚡ CANLI GÜNCELLEME: {lastUpdate}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
