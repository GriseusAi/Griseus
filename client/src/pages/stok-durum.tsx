import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket, type StockUpdateEvent, type ProactiveAlertEvent, type ProactiveAlertData } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ═══════════════════════════════════════════════════════════
   PALETTE — Palantir Foundry dark operational UI
   ═══════════════════════════════════════════════════════════ */
const C = {
  bg: "#06060a", surface: "rgba(255,255,255,0.02)", surfaceHover: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)", borderActive: "rgba(99,102,241,0.4)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.15)", accentGlow: "rgba(99,102,241,0.3)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.12)", okBorder: "rgba(52,211,153,0.25)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.10)", warnBorder: "rgba(251,191,36,0.25)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.08)", errBorder: "rgba(239,68,68,0.2)",
  blue: "#60a5fa", blueDim: "rgba(96,165,250,0.12)", blueBorder: "rgba(96,165,250,0.25)",
  purple: "#a78bfa",
  white: "#f0f0f5", mid: "#8888a0", dim: "#4a4a60", dimmer: "#2a2a3a",
};
const mono = "'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";

const GLOBAL_STYLES = `
  @keyframes flowRight { from { background-position: 0 0; } to { background-position: 24px 0; } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes flashGreen { 0% { box-shadow: inset 0 0 0 1px ${C.ok}, 0 0 20px ${C.okDim}; } 100% { box-shadow: none; } }
  @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; transform: translateY(-8px); } }
  @keyframes capacityGlow { 0%,100% { box-shadow: 0 0 20px rgba(129,140,248,0.15); } 50% { box-shadow: 0 0 40px rgba(129,140,248,0.3); } }
  .stock-flash { animation: flashGreen 0.6s ease-out; }
  .toast-enter { animation: slideIn 0.3s ease-out; }
  .toast-exit  { animation: fadeOut 0.3s ease-out forwards; }
`;

/* ── Types ── */
interface StockLevel {
  id: number; productId: number; productSku: string; productName: string; productCategory: string | null;
  inProduction: number; inWarehouse: number; totalSold: number; updatedAt: string;
}
interface Summary {
  totalInProduction: number; totalInWarehouse: number; todaySold: number; lastMovementAt: string | null;
}
interface Movement {
  id: number; productId: number; productSku: string; productName: string;
  movementType: string; quantity: number; note: string | null;
  createdBy: string | null; createdAt: string;
}
interface BomComponent {
  code: string; name: string; requiredPerUnit: number; unit: string;
  tier: number; parentComponentCode: string | null;
  currentStock: number; maxProducts: number | null;
  status: "critical" | "warning" | "ok" | "abundant" | "N/A";
}
interface Capacity {
  product: string; maxProducible: number;
  bottlenecks: Array<{
    code: string; name: string; tier: number; stock: number;
    required: number; maxProducts: number; note?: string;
  }>;
  subAssemblyStatus: Record<string, {
    name: string; currentStock: number; producibleFromParts: number;
    partBottleneck: string;
    parts: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number }>;
  }>;
}
interface Toast { id: number; sku: string; type: string; qty: number; ts: number; exiting?: boolean; }

/* ── Quick Actions ── */
const QUICK_ACTIONS = [
  { type: "produced", label: "Üretim Girişi", icon: "⚙", color: C.ok, bg: C.okDim, border: C.okBorder, desc: "Yeni üretim kaydet" },
  { type: "to_warehouse", label: "Depoya Transfer", icon: "📦", color: C.blue, bg: C.blueDim, border: C.blueBorder, desc: "Üretimden depoya taşı" },
  { type: "to_sales", label: "Satış Çıkışı", icon: "🚚", color: C.purple, bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.25)", desc: "Depodan satışa çıkar" },
];

/* ── Helpers ── */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min}dk`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}sa`;
  return `${Math.floor(hours / 24)}g`;
}
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
const moveLabel: Record<string, string> = {
  produced: "Üretildi", to_warehouse: "Depoya Transfer", to_sales: "Satışa Çıktı",
  raw_material_in: "Hammadde Girişi", inventory_count: "Sayım", undo: "Geri Alındı",
};
const moveColor: Record<string, string> = {
  produced: C.ok, to_warehouse: C.blue, to_sales: C.purple,
  raw_material_in: C.warn, inventory_count: "#f97316", undo: C.err,
};
const fmt = (n: number) => n.toLocaleString("tr-TR");

type OntologyFilter = "all" | "critical" | "warning" | "ok" | "tier1" | "tier2" | "tier3";

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */

/* ── Pipeline ── */
function Pipeline({ product }: { product: StockLevel | null }) {
  const stages = [
    { label: "ÜRETİMDE", value: product?.inProduction ?? 0, color: C.warn, icon: "⚙" },
    { label: "DEPODA", value: product?.inWarehouse ?? 0, color: product && product.inWarehouse === 0 ? C.err : C.ok, icon: "📦" },
    { label: "SATILAN", value: product?.totalSold ?? 0, color: C.purple, icon: "🚚", sub: "toplam" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
      {stages.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "14px 24px", textAlign: "center", position: "relative", minWidth: 120,
          }}>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: mono, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: mono, color: s.color, lineHeight: 1 }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 9, color: C.dim, marginTop: 4, fontFamily: mono }}>{s.sub}</div>}
          </div>
          {i < stages.length - 1 && (
            <div style={{ display: "flex", alignItems: "center", width: 50, position: "relative" }}>
              <div style={{
                width: "100%", height: 2,
                background: `repeating-linear-gradient(90deg, ${C.accentGlow} 0px, ${C.accentGlow} 8px, transparent 8px, transparent 16px)`,
                backgroundSize: "24px 2px", animation: "flowRight 0.8s linear infinite",
              }} />
              <div style={{
                position: "absolute", right: -3, top: "50%", transform: "translateY(-50%)",
                width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent",
                borderLeft: `6px solid ${C.accentGlow}`,
              }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Capacity Gauge ── */
function CapacityGauge({ capacity }: { capacity: Capacity | undefined }) {
  if (!capacity) return null;
  const max = capacity.maxProducible;
  const top = capacity.bottlenecks[0];
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: "20px 24px", textAlign: "center", animation: "capacityGlow 4s ease-in-out infinite",
    }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1.5, marginBottom: 8 }}>
        MAKSİMUM ÜRETİLEBİLİR
      </div>
      <div style={{ fontSize: 48, fontWeight: 800, fontFamily: mono, color: C.accent, lineHeight: 1, marginBottom: 4 }}>
        {fmt(max)}
      </div>
      <div style={{ fontSize: 13, color: C.mid, marginBottom: 12 }}>adet ELT.7-11</div>
      {top && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px",
          borderRadius: 20, background: C.errDim, border: `1px solid ${C.errBorder}`,
        }}>
          <span style={{ fontSize: 11, color: C.err, fontWeight: 700, fontFamily: mono }}>Darboğaz:</span>
          <span style={{ fontSize: 11, color: C.mid }}>
            {top.name} ({fmt(top.stock)}/{top.required} = {fmt(top.maxProducts)})
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Component Card (Ontology Object) ── */
function ComponentCard({ comp, onClick, isFlashing }: { comp: BomComponent; onClick: () => void; isFlashing: boolean }) {
  const isNegative = comp.currentStock < 0;
  const statusColor = isNegative ? C.err : comp.status === "critical" ? C.err : comp.status === "warning" ? C.warn : comp.status === "ok" ? C.blue : C.ok;
  const statusBg = isNegative ? C.errDim : comp.status === "critical" ? C.errDim : comp.status === "warning" ? C.warnDim : comp.status === "ok" ? C.blueDim : C.okDim;
  const statusLabel = isNegative ? "NEGATİF" : comp.status === "critical" ? "KRİTİK" : comp.status === "warning" ? "DÜŞÜK" : comp.status === "ok" ? "YETERLİ" : "BOL";
  const maxP = comp.maxProducts ?? 0;
  // Bar: percentage of 500 max for visual
  const barPct = Math.min(maxP / 500, 1);

  return (
    <div
      className={isFlashing ? "stock-flash" : ""}
      onClick={onClick}
      style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "10px 12px", cursor: "pointer", position: "relative", overflow: "hidden",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.borderColor = statusColor + "40"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
    >
      {/* Top status bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: statusColor, opacity: 0.6 }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.white, letterSpacing: 0.5 }}>{comp.code}</div>
        <div style={{
          fontSize: 7, fontFamily: mono, fontWeight: 700, letterSpacing: 0.8,
          padding: "2px 5px", borderRadius: 4, background: statusBg, color: statusColor,
        }}>
          {statusLabel}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, height: 28, overflow: "hidden", lineHeight: "14px" }}>
        {comp.name}
      </div>

      {/* Stock info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: statusColor, lineHeight: 1 }}>
            {fmt(comp.currentStock)}
          </div>
          <div style={{ fontSize: 8, color: C.dim, fontFamily: mono }}>{comp.unit} stok</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: mono, color: C.mid, lineHeight: 1 }}>
            {maxP === null ? "—" : fmt(maxP)}
          </div>
          <div style={{ fontSize: 8, color: C.dim, fontFamily: mono }}>ürün yeter</div>
        </div>
      </div>

      {/* Capacity bar */}
      <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
        <div style={{
          width: `${barPct * 100}%`, height: "100%", borderRadius: 2,
          background: statusColor, transition: "width 0.5s ease",
        }} />
      </div>

      {/* Tier badge */}
      {comp.tier > 1 && (
        <div style={{
          position: "absolute", bottom: 6, right: 8, fontSize: 8, fontFamily: mono,
          color: C.dim, opacity: 0.5,
        }}>
          T{comp.tier}
        </div>
      )}
    </div>
  );
}

/* ── Brülör Sub-Assembly Panel ── */
function SubAssemblyPanel({ capacity }: { capacity: Capacity | undefined }) {
  if (!capacity) return null;
  const brulor = capacity.subAssemblyStatus["27.125"];
  if (!brulor) return null;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.warnBorder}`, borderRadius: 16,
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.warn, fontFamily: sans }}>
            ⚙ Brülör (Yerli Malzeme) <span style={{ color: C.dim, fontWeight: 400, fontSize: 11 }}>27.125</span>
          </div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>YARI MAMÜL — montaj gerektirir</div>
        </div>
        <div style={{ display: "flex", gap: 16, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 8, fontFamily: mono, color: C.dim, fontWeight: 600 }}>HAZIR</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: brulor.currentStock === 0 ? C.err : C.ok }}>{brulor.currentStock}</div>
          </div>
          <div>
            <div style={{ fontSize: 8, fontFamily: mono, color: C.dim, fontWeight: 600 }}>MONTELENEBİLİR</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: C.warn }}>{fmt(brulor.producibleFromParts)}</div>
          </div>
        </div>
      </div>

      {/* Sub-parts */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {brulor.parts.map(p => {
          const isBottleneck = p.maxProducts === Math.min(...brulor.parts.map(x => x.maxProducts));
          return (
            <div key={p.code} style={{
              flex: "1 1 calc(50% - 3px)", padding: "8px 10px", borderRadius: 8,
              background: isBottleneck ? C.errDim : "rgba(0,0,0,0.2)",
              border: `1px solid ${isBottleneck ? C.errBorder : C.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: C.mid, fontWeight: 600 }}>{p.code}</div>
                  <div style={{ fontSize: 10, color: isBottleneck ? C.err : C.mid, marginTop: 1 }}>{p.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: mono, color: isBottleneck ? C.err : C.white }}>{fmt(p.stock)}</div>
                  <div style={{ fontSize: 8, fontFamily: mono, color: C.dim }}>→ {fmt(p.maxProducts)} brülör</div>
                </div>
              </div>
              {isBottleneck && (
                <div style={{ fontSize: 8, fontFamily: mono, color: C.err, fontWeight: 700, marginTop: 4, letterSpacing: 0.5 }}>
                  ▲ DARBOĞAZ
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Proactive Alert Panel ── */
function ProactiveAlertPanel({ alerts, onDismiss }: { alerts: ProactiveAlertData[]; onDismiss: (id: string) => void }) {
  if (alerts.length === 0) return null;
  const severityIcon: Record<string, string> = { critical: "🔴", warning: "🟡", info: "🔵" };
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      style={{
        position: "fixed", top: 60, right: 16, zIndex: 200, width: 360,
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ fontSize: 9, fontFamily: mono, color: C.accent, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
        ⚡ PROACTIVE INTELLIGENCE
      </div>
      {alerts.map(a => (
        <motion.div key={a.id}
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          style={{
            padding: "12px 14px", borderRadius: 12,
            background: a.severity === "critical" ? "rgba(239,68,68,0.08)" : a.severity === "warning" ? "rgba(251,191,36,0.06)" : "rgba(96,165,250,0.06)",
            border: `1px solid ${a.severity === "critical" ? C.errBorder : a.severity === "warning" ? C.warnBorder : C.blueBorder}`,
            backdropFilter: "blur(16px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12 }}>{severityIcon[a.severity] || "🔵"}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: mono,
                color: a.severity === "critical" ? C.err : a.severity === "warning" ? C.warn : C.blue,
              }}>
                {a.title}
              </span>
            </div>
            <button onClick={() => onDismiss(a.id)} style={{
              background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, padding: 0,
            }}>✕</button>
          </div>
          <div style={{ fontSize: 11, color: C.mid, lineHeight: 1.5, marginBottom: a.suggestedAction ? 8 : 0 }}>
            {a.message}
          </div>
          {a.suggestedAction && (
            <div style={{
              fontSize: 10, fontFamily: mono, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              background: "rgba(99,102,241,0.1)", color: C.accent, display: "inline-block",
              border: `1px solid rgba(99,102,241,0.2)`,
            }}>
              → {a.suggestedAction}
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ── Toast ── */
function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 60, right: 16, zIndex: 100, display: "flex", flexDirection: "column", gap: 6 }}>
      {toasts.map(t => (
        <div key={t.id} className={t.exiting ? "toast-exit" : "toast-enter"} style={{
          padding: "8px 14px", borderRadius: 10,
          background: "rgba(10,10,20,0.95)", border: `1px solid ${C.border}`,
          backdropFilter: "blur(12px)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: moveColor[t.type] || C.mid }} />
          <span style={{ fontFamily: mono, fontSize: 11, color: C.accent, fontWeight: 700 }}>{t.sku}</span>
          <span style={{ fontSize: 11, color: C.mid }}>{moveLabel[t.type] || t.type} · {t.qty} adet</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function StokDurum() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>("");
  const [ontologyFilter, setOntologyFilter] = useState<OntologyFilter>("all");
  const [flashedCode, setFlashedCode] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionType, setActionType] = useState<string | null>(null);
  const [actionQty, setActionQty] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [proactiveAlerts, setProactiveAlerts] = useState<ProactiveAlertData[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const toastIdRef = useRef(0);

  // Data
  const { data: levels = [] } = useQuery<StockLevel[]>({ queryKey: ["/api/stock/levels"] });
  const { data: summary } = useQuery<Summary>({ queryKey: ["/api/stock/summary"] });
  const { data: bomData } = useQuery<{ product: string; components: BomComponent[] }>({
    queryKey: ["/api/bom/ELT.7-11/stock"],
  });
  const { data: capacity } = useQuery<Capacity>({
    queryKey: ["/api/bom/ELT.7-11/production-capacity"],
  });

  // Find ELT.7-11 product
  const product = levels.find(l => l.productSku === "ELT.7-11") || null;
  const productId = product?.productId;

  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: [`/api/stock/movements?product_id=${productId}&limit=30`],
    enabled: !!productId,
  });

  // Auto-reset: clean test data on first load if there are non-ELT products
  const hasOldData = levels.length > 0 && levels.some(l => l.productSku !== "ELT.7-11");
  useEffect(() => {
    if (hasOldData && !resetDone) {
      fetch("/api/stock/reset", { method: "POST" }).then(() => {
        setResetDone(true);
        qc.invalidateQueries();
      }).catch(() => {});
    }
  }, [hasOldData, resetDone, qc]);

  // Component filtering
  const components = bomData?.components || [];
  const tier1 = components.filter(c => c.tier === 1);
  const tier2 = components.filter(c => c.tier === 2);
  const tier3 = components.filter(c => c.tier === 3);

  const filteredComponents = ontologyFilter === "all" ? components
    : ontologyFilter === "critical" ? components.filter(c => c.status === "critical")
    : ontologyFilter === "warning" ? components.filter(c => c.status === "warning")
    : ontologyFilter === "ok" ? components.filter(c => c.status === "ok" || c.status === "abundant")
    : ontologyFilter === "tier1" ? tier1
    : ontologyFilter === "tier2" ? tier2
    : tier3;

  // Sort by maxProducts ascending (worst first)
  const sortedComponents = [...filteredComponents].sort((a, b) => (a.maxProducts ?? 0) - (b.maxProducts ?? 0));

  const ontologyCounts = {
    all: components.length,
    critical: components.filter(c => c.status === "critical").length,
    warning: components.filter(c => c.status === "warning").length,
    ok: components.filter(c => c.status === "ok" || c.status === "abundant").length,
    tier1: tier1.length,
    tier2: tier2.length,
    tier3: tier3.length,
  };

  // WebSocket
  const handleStockUpdate = useCallback((data: StockUpdateEvent) => {
    qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
    qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
    qc.invalidateQueries({ queryKey: ["/api/bom/ELT.7-11/stock"] });
    qc.invalidateQueries({ queryKey: ["/api/bom/ELT.7-11/production-capacity"] });
    if (productId) {
      qc.invalidateQueries({ queryKey: [`/api/stock/movements?product_id=${productId}&limit=30`] });
    }
    setFlashedCode(data.productSku);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashedCode(null), 700);
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-2), { id, sku: data.productSku, type: data.movementType, qty: data.quantity, ts: Date.now() }]);
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t)), 2500);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, [qc, productId]);

  const handleProactiveAlert = useCallback((data: ProactiveAlertEvent) => {
    setProactiveAlerts(prev => {
      const newAlerts = data.alerts.filter(a => !prev.some(p => p.id === a.id));
      return [...newAlerts, ...prev].slice(0, 5); // Keep max 5 alerts
    });
    // Auto-dismiss non-critical after 15s
    for (const alert of data.alerts) {
      if (alert.severity !== "critical") {
        setTimeout(() => {
          setProactiveAlerts(prev => prev.filter(a => a.id !== alert.id));
        }, 15000);
      }
    }
  }, []);

  const { connected } = useStockWebSocket(handleStockUpdate, handleProactiveAlert);

  // Mutations
  const undoMutation = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/stock/movements/${id}/undo`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries(); },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ movementType, quantity }: { movementType: string; quantity: number }) => {
      if (!productId) throw new Error("Ürün bulunamadı");
      const res = await apiRequest("POST", "/api/stock/movements", {
        product_id: productId,
        movement_type: movementType,
        quantity,
        created_by: "üretim_şefi",
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });

  const activeAction = QUICK_ACTIONS.find(a => a.type === actionType);
  const maxQty = actionType === "to_warehouse" ? (product?.inProduction ?? 0)
    : actionType === "to_sales" ? (product?.inWarehouse ?? 0) : 9999;
  const qtyNum = parseInt(actionQty, 10);
  const canExecute = !isNaN(qtyNum) && qtyNum > 0 && qtyNum <= maxQty;

  const filtered = filterType ? movements.filter(m => m.movementType === filterType) : movements;

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans,
      backgroundImage: `linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)`,
      backgroundSize: "60px 60px",
    }}>
      <style>{GLOBAL_STYLES}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <ToastStack toasts={toasts} />
      <ProactiveAlertPanel
        alerts={proactiveAlerts}
        onDismiss={(id) => setProactiveAlerts(prev => prev.filter(a => a.id !== id))}
      />
      <TopNav connected={connected} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>

        {/* ════ HERO — Product Identity ════ */}
        <div style={{ textAlign: "center", padding: "28px 0 8px" }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 2, marginBottom: 6 }}>
            ÇUKUROVA ISI SİSTEMLERİ — TEK ÜRÜN KOMUTA MERKEZİ
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, letterSpacing: -0.5, marginBottom: 4 }}>
            <span style={{ color: C.accent }}>ELT.7-11</span> — Goldsun Elite
          </div>
          <div style={{ fontSize: 12, color: C.dim }}>
            Seramik Plakalı Camlı Radyant Isıtıcı — 7/9/11 KW Üç kademeli
          </div>
        </div>

        {/* ════ PIPELINE + CAPACITY ════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20, marginTop: 16 }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "20px", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Pipeline product={product} />
          </div>
          <CapacityGauge capacity={capacity} />
        </div>

        {/* ════ QUICK ACTIONS ════ */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
          padding: "16px 20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1.5, marginBottom: 10 }}>
            ⚡ AKSİYONLAR — ELT.7-11 Stok Hareketi
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: actionType ? 10 : 0 }}>
            {QUICK_ACTIONS.map(a => {
              const isActive = actionType === a.type;
              const isDisabled = !product ||
                (a.type === "to_warehouse" && product.inProduction === 0) ||
                (a.type === "to_sales" && product.inWarehouse === 0);
              return (
                <button
                  key={a.type}
                  onClick={() => { setActionType(isActive ? null : a.type); setActionQty(""); }}
                  disabled={isDisabled}
                  style={{
                    flex: 1, padding: "12px 8px", borderRadius: 12, cursor: isDisabled ? "default" : "pointer",
                    background: isActive ? a.bg : "rgba(0,0,0,0.2)",
                    border: `1px solid ${isActive ? a.border : C.border}`,
                    color: isDisabled ? C.dimmer : isActive ? a.color : C.mid,
                    fontFamily: sans, fontSize: 12, fontWeight: 600, textAlign: "center",
                    transition: "all 0.15s", opacity: isDisabled ? 0.4 : 1,
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</div>
                  {a.label}
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {actionType && activeAction && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{
                  padding: "12px 14px", borderRadius: 12,
                  background: activeAction.bg, border: `1px solid ${activeAction.border}`,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: activeAction.color, fontWeight: 700, marginBottom: 6 }}>
                      {activeAction.icon} {activeAction.desc}
                      {maxQty < 9999 && <span style={{ color: C.mid, fontWeight: 400 }}> · maks {maxQty} adet</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number" min={1} max={maxQty} inputMode="numeric" placeholder="Adet"
                        value={actionQty} onChange={e => setActionQty(e.target.value)} autoFocus
                        style={{
                          width: 120, padding: "10px 12px", borderRadius: 10,
                          background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                          color: C.white, fontFamily: mono, fontSize: 18, fontWeight: 700, textAlign: "center",
                        }}
                      />
                      <button
                        onClick={() => { if (canExecute) { actionMutation.mutate({ movementType: actionType, quantity: qtyNum }); setActionType(null); setActionQty(""); } }}
                        disabled={!canExecute}
                        style={{
                          padding: "10px 24px", borderRadius: 10, border: "none",
                          background: canExecute ? activeAction.color : C.dimmer,
                          color: canExecute ? "#000" : C.dim,
                          fontFamily: mono, fontSize: 13, fontWeight: 700, cursor: canExecute ? "pointer" : "default",
                        }}
                      >
                        UYGULA
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ════ BRÜLÖR SUB-ASSEMBLY ════ */}
        <div style={{ marginBottom: 20 }}>
          <SubAssemblyPanel capacity={capacity} />
        </div>

        {/* ════ COMPONENT ONTOLOGY ════ */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1.5 }}>
              ONTOLOGY OBJECTS · {sortedComponents.length} BİLEŞEN
            </div>
            <div style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>
              {fmt(tier1.length)} direkt + {fmt(tier2.length)} yarı mamül + {fmt(tier3.length)} alt parça
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {([
              { key: "all" as const, label: "Tümü", color: C.mid },
              { key: "critical" as const, label: "Kritik", color: C.err },
              { key: "warning" as const, label: "Düşük", color: C.warn },
              { key: "ok" as const, label: "Yeterli", color: C.ok },
              { key: "tier1" as const, label: "Tier 1", color: C.accent },
              { key: "tier2" as const, label: "Tier 2", color: C.warn },
              { key: "tier3" as const, label: "Tier 3", color: C.blue },
            ]).map(f => {
              const isActive = ontologyFilter === f.key;
              const count = ontologyCounts[f.key];
              return (
                <button key={f.key} onClick={() => setOntologyFilter(f.key)} style={{
                  padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                  background: isActive ? `${f.color}18` : "transparent",
                  border: `1px solid ${isActive ? `${f.color}40` : C.border}`,
                  color: isActive ? f.color : C.dim,
                  fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
                }}>
                  {f.label}
                  <span style={{
                    fontSize: 9, padding: "1px 5px", borderRadius: 4,
                    background: isActive ? `${f.color}20` : "rgba(255,255,255,0.03)",
                    color: isActive ? f.color : C.dim,
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Component Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {sortedComponents.map(comp => (
              <ComponentCard
                key={comp.code}
                comp={comp}
                isFlashing={flashedCode === comp.code}
                onClick={() => {/* future: drill-down */}}
              />
            ))}
          </div>

          {sortedComponents.length === 0 && components.length > 0 && (
            <div style={{
              textAlign: "center", padding: 32, color: C.dim, fontSize: 12,
              background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`,
            }}>
              Bu filtrede bileşen yok
            </div>
          )}
          {components.length === 0 && (
            <div style={{
              textAlign: "center", padding: 48, color: C.dim, fontSize: 13,
              background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`,
            }}>
              BOM verisi yükleniyor...
            </div>
          )}
        </div>

        {/* ════ MOVEMENT HISTORY ════ */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
          padding: "16px 20px", marginBottom: 40,
        }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1.5, marginBottom: 10 }}>
            SON HAREKETLER — ELT.7-11
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { v: "", l: "Tümü" }, { v: "produced", l: "Üretim" }, { v: "to_warehouse", l: "Depo" },
              { v: "to_sales", l: "Satış" }, { v: "inventory_count", l: "Sayım" }, { v: "undo", l: "Geri Al" },
            ].map(f => (
              <button key={f.v} onClick={() => setFilterType(f.v)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: filterType === f.v ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${filterType === f.v ? "rgba(255,255,255,0.15)" : C.border}`,
                color: filterType === f.v ? C.white : C.dim, cursor: "pointer", fontFamily: sans,
              }}>
                {f.l}
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {!productId ? (
              <div style={{ textAlign: "center", padding: 24, color: C.dim, fontSize: 12 }}>
                Henüz stok kaydı yok — ilk hareket girişini yapın
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: C.dim, fontSize: 12 }}>Hareket bulunamadı</div>
            ) : (
              filtered.map((m, i) => (
                <div key={m.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4, flexShrink: 0 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: moveColor[m.movementType] || C.mid,
                      boxShadow: `0 0 6px ${moveColor[m.movementType] || C.mid}40`,
                    }} />
                    {i < filtered.length - 1 && <div style={{ width: 1, height: 28, background: C.border, marginTop: 2 }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: moveColor[m.movementType] || C.mid, fontWeight: 600 }}>
                      {moveLabel[m.movementType] || m.movementType} — {m.quantity} adet
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                      {formatDate(m.createdAt)} · {m.createdBy || "?"}{m.note ? ` · ${m.note}` : ""}
                    </div>
                  </div>
                  {m.movementType !== "undo" && (
                    <button onClick={() => undoMutation.mutate(m.id)} style={{
                      background: C.errDim, border: `1px solid ${C.errBorder}`, borderRadius: 6,
                      padding: "3px 8px", color: C.err, fontSize: 9, fontWeight: 600,
                      fontFamily: sans, cursor: "pointer", flexShrink: 0,
                    }}>
                      Geri Al
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
