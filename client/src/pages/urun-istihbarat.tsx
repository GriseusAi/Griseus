import React, { useState, useMemo, useEffect } from "react";
import { useSKU } from "@/lib/sku-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import ProductSelector from "@/components/ProductSelector";

/* ═══════════════════════════════════════════════════════════
   PALETTE — same Palantir dark theme as stok-durum
   ═══════════════════════════════════════════════════════════ */
const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.10)", accentGlow: "rgba(99,102,241,0.20)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.06)", okBorder: "rgba(52,211,153,0.15)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.06)", warnBorder: "rgba(251,191,36,0.15)",
  variable: "#ea580c", variableDim: "rgba(234,88,12,0.08)", variableBorder: "rgba(234,88,12,0.25)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.05)", errBorder: "rgba(239,68,68,0.12)",
  blue: "#60a5fa", blueDim: "rgba(96,165,250,0.06)", blueBorder: "rgba(96,165,250,0.15)",
  purple: "#a78bfa",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60", dimmer: "#1a1a2a",
};
const mono = "'Outfit', sans-serif";
const sans = "'Outfit', sans-serif";

const GLOBAL_STYLES = `
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes flowRight { from { background-position: 0 0; } to { background-position: 24px 0; } }
`;

/* ── Types ── */
interface BomComponent {
  code: string; name: string; requiredPerUnit: number; unit: string;
  tier: number; parentComponentCode: string | null;
  currentStock: number; rawStock?: number; maxProducts: number | null; status: string;
  isSubAssembly?: boolean;
  children?: BomComponent[];
}

interface Bottleneck {
  code: string; name: string; tier: number; stock: number;
  required: number; maxProducts: number; note?: string;
}

interface SubAssembly {
  name: string; currentStock: number; producibleFromParts: number;
  partBottleneck: string;
  parts: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number }>;
}

interface CapacityData {
  product: string; maxProducible: number;
  bottlenecks: Bottleneck[];
  subAssemblyStatus: Record<string, SubAssembly>;
}

interface StockData {
  product: string;
  components: BomComponent[];
}

interface IntelComponent {
  code: string; name: string; tier: number; unit: string;
  currentStock: number; requiredPerUnit: number;
  dailyBurnRate: number; weeklyBurnRate: number;
  daysToStockout: number | null; reorderPoint: number;
  isAboveReorderPoint: boolean;
  trend: "accelerating" | "stable" | "decelerating";
  trendRatio: number; suggestedOrderQty: number;
  urgency: "critical" | "warning" | "ok" | "abundant";
  urgencyReasoning?: Array<{ order: number; cause: string; data?: Record<string, any> }>;
}

interface IntelData {
  product: string; salesLast30Days: number; dailySalesRate: number;
  leadTimeDays: number; components: IntelComponent[];
  criticalCount: number; warningCount: number;
  topRisks: IntelComponent[];
}

interface SimulationData {
  product: string; requestedQuantity: number; canProduce: boolean;
  maxProducible: number;
  shortages: Array<{ code: string; name: string; need: number; have: number; shortage: number }>;
  materialsNeeded: Array<{ code: string; name: string; need: number; have: number; remaining: number; mustAssemble?: number; tier: number }>;
  subAssemblyStatus: Record<string, SubAssembly>;
}

/* ── Recursive drill-down row ── */
function ChildRowUI({ child, depth }: { child: BomComponent; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasKids = (child.children?.length ?? 0) > 0;
  // Status → renk (tüm sistemde aynı): critical=kırmızı, warning=sarı, ok=mavi, abundant=yeşil, variable=koyu turuncu
  const color = child.status === "critical" ? "#ef4444"
    : child.status === "variable" ? "#ea580c"
    : child.status === "warning" ? "#fbbf24"
    : child.status === "ok" ? "#818cf8"
    : "#34d399";
  return (
    <>
      <div style={{
        display: "grid", gridTemplateColumns: "70px 1fr 90px 80px 80px 90px 80px",
        gap: 8, padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(255,255,255,0.015)",
        paddingLeft: 12 + depth * 20,
        cursor: hasKids ? "pointer" : "default",
      }}
        onClick={() => hasKids && setOpen(p => !p)}
      >
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
          {hasKids ? (open ? "▾ " : "▸ ") : "└ "}{child.code}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }}>{child.name}</div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#cbd5e1" }}>{child.requiredPerUnit}</div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{child.unit}</div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color }}>
          {child.currentStock % 1 === 0 ? child.currentStock : child.currentStock.toFixed(2)}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{child.maxProducts ?? "—"}</div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color, opacity: 0.7 }}>T{child.tier}</div>
      </div>
      {open && hasKids && child.children!.map(gc => <ChildRowUI key={gc.code} child={gc} depth={depth + 1} />)}
    </>
  );
}

/* ── Status helpers ── */
function getStatusColor(status: string): string {
  switch (status) {
    case "critical": return C.err;
    case "warning": return C.warn;
    case "ok": return C.ok;
    case "abundant": return C.blue;
    default: return C.mid;
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case "critical": return C.errDim;
    case "warning": return C.warnDim;
    case "ok": return C.okDim;
    case "abundant": return C.blueDim;
    default: return C.surface;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "critical": return "KRİTİK";
    case "variable": return "DEĞİŞKEN";
    case "warning": return "DİKKAT";
    case "ok": return "NORMAL";
    case "abundant": return "BOL";
    default: return "—";
  }
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function UrunIstihbarat() {
  const [, params] = useRoute("/stok/urun/:sku");
  const [, navigate] = useLocation();
  const { selectedSku: globalSku, setSelectedSku: setGlobalSku } = useSKU();
  const sku = params?.sku || globalSku;

  // URL'deki SKU değişince global context'i sync et
  useEffect(() => {
    if (params?.sku && params.sku !== globalSku) {
      setGlobalSku(params.sku);
    }
  }, [params?.sku]);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [showAllComponents, setShowAllComponents] = useState(false);

  // WebSocket — cross-page live sync (shared query keys with Stok Durumu & Ontology)
  const qc = useQueryClient();
  const { connected } = useStockWebSocket(() => {
    // Invalidate ALL shared keys — any stock change pumps to all pages
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/intelligence`] });
    qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
    qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
  });

  const capacityQuery = useQuery<CapacityData>({
    queryKey: [`/api/bom/${sku}/production-capacity`],
    queryFn: () => fetch(`/api/bom/${sku}/production-capacity`).then(r => r.json()),
  });

  const stockQuery = useQuery<StockData>({
    queryKey: [`/api/bom/${sku}/stock`],
    queryFn: () => fetch(`/api/bom/${sku}/stock`).then(r => r.json()),
  });

  const intelQuery = useQuery<IntelData>({
    queryKey: [`/api/bom/${sku}/intelligence`],
    queryFn: () => fetch(`/api/bom/${sku}/intelligence`).then(r => r.json()),
  });

  const seasonQuery = useQuery<any>({
    queryKey: ["/api/palantir/demo/6-ay-plan"],
    queryFn: () => fetch("/api/palantir/demo/6-ay-plan").then(r => r.json()),
  });

  const MONTH_NAMES_SHORT = ["", "Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
  const currentMonth = new Date().getMonth() + 1;

  // API'den dinamik monthlyDemand — intel.ontology.monthlyDemand
  const MONTHLY_DEMAND = useMemo<number[]>(() => {
    const md = (intelQuery.data as any)?.ontology?.monthlyDemand || [];
    const arr = [0];
    for (let i = 1; i <= 12; i++) {
      const label = MONTH_NAMES_SHORT[i];
      const row = md.find((x: any) => x.month === label);
      arr.push(Math.round(row?.demand || 0));
    }
    return arr;
  }, [intelQuery.data]);

  const thisMonthDemand = MONTHLY_DEMAND[currentMonth];
  const yearlyTotal = MONTHLY_DEMAND.slice(1).reduce((a, b) => a + b, 0);
  const monthlyAvg = yearlyTotal / 12;

  const capacity = capacityQuery.data;
  const stock = stockQuery.data;
  const intel = intelQuery.data;

  // Components are already tier=1 only (backend filter). Yarı-mamüllerin alt bileşenleri
  // children[] alaninda embedded — drill-down expand ile goruntulenir.
  const sortedComponents = useMemo(() => {
    return stock?.components || [];
  }, [stock]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (code: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const topBottleneck = capacity?.bottlenecks?.[0];
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans, position: "relative", overflow: "hidden" }}>
      <div className="glass-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <style>{GLOBAL_STYLES}</style>

      <TopNav connected={connected} />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px", position: "relative", zIndex: 1 }}>
        {/* ═══ Product Selector ═══ */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <ProductSelector value={sku} onChange={(newSku) => { setGlobalSku(newSku); navigate(`/stok/urun/${newSku}`); }} />
        </div>

        {/* ═══ Section 1: Production Capacity Card ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "32px 40px", marginBottom: 24, textAlign: "center", position: "relative",
            overflow: "hidden", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${C.accent}, ${C.ok}, ${C.accent})`,
            opacity: 0.6,
          }} />
          <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 2, marginBottom: 12 }}>
            MEVCUT STOKLA ÜRETİLEBİLİR
          </div>
          <div style={{
            fontSize: 72, fontWeight: 400, fontFamily: mono, lineHeight: 1,
            color: capacity ? (capacity.maxProducible > 200 ? C.ok : capacity.maxProducible > 50 ? C.warn : C.err) : C.dim,
            marginBottom: 8,
          }}>
            {capacity?.maxProducible ?? "—"}
          </div>
          <div style={{ fontSize: 16, fontFamily: sans, color: C.mid, marginBottom: 16 }}>
            adet {sku}
          </div>
          {topBottleneck && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px",
              borderRadius: 24, background: C.warnDim, border: `1px solid ${C.warnBorder}`,
            }}>
              <span style={{ fontSize: 12, fontFamily: mono, color: C.warn }}>
                Darboğaz: {topBottleneck.name} ({topBottleneck.stock}/{topBottleneck.required} = {topBottleneck.maxProducts})
              </span>
            </div>
          )}
        </motion.div>

        {/* ═══ Sub-Assembly Status ═══ */}
        {capacity?.subAssemblyStatus && Object.entries(capacity.subAssemblyStatus).map(([code, sub]) => (
          <motion.div key={code}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
            style={{
              background: C.surface, border: `1px solid ${(sub.currentStock + sub.producibleFromParts) === 0 ? C.errBorder : sub.producibleFromParts > 0 ? C.okBorder : C.warnBorder}`,
              borderRadius: 12, padding: "16px 24px", marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: C.white }}>
                    {sub.name} <span style={{ color: C.dim, fontFamily: mono, fontSize: 11 }}>({code})</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.mid, fontFamily: mono }}>YARI MAMÜL — stok 0 normaldir, alt bileşenler önemli</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, letterSpacing: 1 }}>EFEKTİF STOK</div>
                  <div style={{
                    fontSize: 24, fontWeight: 400, fontFamily: mono,
                    color: (sub.currentStock + sub.producibleFromParts) > 0 ? C.ok : C.err,
                  }}>
                    {sub.currentStock + sub.producibleFromParts}
                  </div>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.dim, marginTop: 2 }}>
                    {sub.currentStock} hazır + {sub.producibleFromParts} monte
                  </div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.mid }}>
              Alt bileşen darboğazı: {sub.partBottleneck}
            </div>
            {/* Toggle sub-assembly parts */}
            <button
              onClick={() => setExpandedSub(expandedSub === code ? null : code)}
              style={{
                marginTop: 8, background: "none", border: "none", color: C.accent,
                fontFamily: mono, fontSize: 11, cursor: "pointer", padding: 0,
              }}
            >
              {expandedSub === code ? "▼ Alt bileşenleri gizle" : "► Alt bileşenleri göster"}
            </button>
            {expandedSub === code && sub.parts && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {sub.parts.map(p => (
                  <div key={p.code} style={{
                    padding: "8px 12px", borderRadius: 8, background: C.bg,
                    border: `1px solid ${p.maxProducts < 50 ? C.errBorder : p.maxProducts < 200 ? C.warnBorder : C.border}`,
                  }}>
                    <div style={{ fontSize: 10, fontFamily: mono, color: C.dim }}>{p.code}</div>
                    <div style={{ fontSize: 12, color: C.white, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: mono }}>
                      <span style={{ color: C.mid }}>Stok: <span style={{ color: C.white }}>{p.stock}</span></span>
                      <span style={{ color: p.maxProducts < 50 ? C.err : p.maxProducts < 200 ? C.warn : C.ok }}>
                        {p.maxProducts} ürün
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ))}

        {/* ═══ Seasonal Demand Pattern ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "24px", marginBottom: 24,
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1, marginBottom: 20 }}>
            MEVSIMSEL TALEP PATERNI — {sku} AYLIK DAĞILIM
          </div>

          {/* Bar chart */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 220, marginBottom: 20 }}>
            {MONTHLY_DEMAND.slice(1).map((demand, i) => {
              const monthIndex = i + 1;
              const maxDemand = Math.max(1, ...MONTHLY_DEMAND.slice(1));
              const barHeight = (demand / maxDemand) * 170;
              const isCurrent = monthIndex === currentMonth;
              const barColor = isCurrent ? C.accent
                : demand > 250 ? C.err
                : demand < 120 ? C.blue
                : C.ok;
              return (
                <div key={monthIndex} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.white, fontWeight: 400, marginBottom: 4 }}>
                    {demand}
                  </div>
                  <div style={{
                    width: "70%", height: barHeight, borderRadius: "4px 4px 0 0",
                    background: `linear-gradient(180deg, ${barColor}, ${barColor}33)`,
                    transition: "height 0.5s ease",
                    ...(isCurrent ? {
                      boxShadow: `0 0 12px ${C.accentGlow}, inset 0 0 8px ${C.accentDim}`,
                      border: `1px solid ${C.accent}`,
                    } : {}),
                  }} />
                  <div style={{
                    fontSize: 10, fontFamily: mono, marginTop: 6,
                    color: isCurrent ? C.accent : C.dim,
                    fontWeight: isCurrent ? 600 : 400,
                  }}>
                    {MONTH_NAMES_SHORT[monthIndex]}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary stats */}
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: C.accentDim, border: `1px solid ${C.borderActive}`,
              fontSize: 12, fontFamily: mono, color: C.accent, fontWeight: 400,
            }}>
              Bu Ay: {MONTH_NAMES_SHORT[currentMonth]} — {thisMonthDemand} adet
            </div>
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
              fontSize: 12, fontFamily: mono, color: C.mid, fontWeight: 400,
            }}>
              Yillik: {yearlyTotal.toLocaleString("tr-TR")} adet
            </div>
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
              fontSize: 12, fontFamily: mono, color: C.mid, fontWeight: 400,
            }}>
              Mevsim Endeksi: {monthlyAvg > 0 ? (thisMonthDemand / monthlyAvg).toFixed(2) : "0.00"}x
            </div>
          </div>
        </motion.div>


        {/* ═══ Section 4: Full Component Table ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "24px", marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
              BİLEŞEN STOK TABLOSU — {stock?.components.length || 0} PARÇA
            </div>
            <button onClick={() => setShowAllComponents(!showAllComponents)} style={{
              background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
              padding: "4px 12px", color: C.mid, fontFamily: mono, fontSize: 10, cursor: "pointer",
            }}>
              {showAllComponents ? "Sadece kritik göster" : "Tümünü göster"}
            </button>
          </div>

          {/* Table Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "70px 1fr 90px 80px 80px 90px 80px",
            gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
          }}>
            {["KOD", "BİLEŞEN ADI", "GEREKLİ", "BİRİM", "STOK", "ÜRETEBİLİR", "DURUM"].map(h => (
              <div key={h} style={{ fontSize: 9, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Table Rows — tier=1 only, yari-mamuller expand ile alt bilesenleri gosterir */}
          {sortedComponents
            .filter(c => showAllComponents || c.status === "critical" || c.status === "warning" || c.isSubAssembly)
            .map((c) => {
              const statusColor = getStatusColor(c.status);
              const isSubAssembly = c.isSubAssembly && (c.children?.length ?? 0) > 0;
              const isExpanded = expandedRows.has(c.code);
              return (
                <React.Fragment key={c.code}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "70px 1fr 90px 80px 80px 90px 80px",
                    gap: 8, padding: "8px 12px", borderBottom: isExpanded ? "none" : `1px solid ${C.border}`,
                    background: isSubAssembly ? C.accentDim : "transparent",
                    transition: "background 0.15s",
                    cursor: isSubAssembly ? "pointer" : "default",
                  }}
                    onClick={() => isSubAssembly && toggleExpand(c.code)}
                    onMouseEnter={e => { if (!isSubAssembly) e.currentTarget.style.background = C.surfaceHover; }}
                    onMouseLeave={e => { if (!isSubAssembly) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ fontFamily: mono, fontSize: 11, color: C.mid }}>
                      {isSubAssembly && <span style={{ marginRight: 4, color: C.accent }}>{isExpanded ? "▾" : "▸"}</span>}
                      {c.code}
                    </div>
                    <div style={{ fontSize: 12, color: C.white, display: "flex", alignItems: "center", gap: 6 }}>
                      {c.name}
                      {isSubAssembly && <span style={{ fontSize: 9, color: C.accent, fontFamily: mono }}>⚡ YARI MAMÜL ({c.children!.length} alt)</span>}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: C.white, fontWeight: 400 }}>{c.requiredPerUnit}</div>
                    <div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{c.unit}</div>
                    <div style={{
                      fontFamily: mono, fontSize: 12, fontWeight: 400,
                      color: c.currentStock < 0 ? C.err : c.currentStock === 0 ? C.err : c.currentStock < 100 ? C.warn : C.white,
                    }}>
                      {c.currentStock < 0 && "⚠️ "}
                      {c.currentStock % 1 === 0 ? c.currentStock : c.currentStock.toFixed(2)}
                      {c.rawStock !== undefined && c.currentStock > c.rawStock && (
                        <span style={{ fontSize: 9, color: C.dim, marginLeft: 4 }}>({c.rawStock}+{(c.currentStock - c.rawStock).toFixed(0)})</span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: mono, fontSize: 12, fontWeight: 400,
                      color: c.maxProducts === null ? C.dim :
                        c.maxProducts === 0 ? C.err :
                        c.maxProducts < 50 ? C.err :
                        c.maxProducts < 200 ? C.warn : C.ok,
                    }}>
                      {c.maxProducts ?? "—"}
                    </div>
                    <div>
                      <span style={{
                        fontSize: 9, fontFamily: mono, fontWeight: 400, padding: "2px 8px",
                        borderRadius: 4, background: getStatusBg(c.status), color: statusColor,
                      }}>
                        {getStatusLabel(c.status)}
                      </span>
                    </div>
                  </div>

                  {/* Drill-down: alt bileşenler (recursive) */}
                  {isExpanded && isSubAssembly && c.children!.map(child => (
                    <ChildRowUI key={child.code} child={child} depth={1} />
                  ))}
                </React.Fragment>
              );
            })}
        </motion.div>

        {/* ═══ Section 5: Consumption Intelligence ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "24px", marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
              TÜKETİM İSTİHBARATI
            </div>
            {intel && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{
                  fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
                  background: C.accentDim, color: C.accent, fontWeight: 400,
                }}>
                  {intel.dailySalesRate} adet/gün satış
                </span>
                {intel.criticalCount > 0 && (
                  <span style={{
                    fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
                    background: C.errDim, color: C.err, fontWeight: 400,
                  }}>
                    {intel.criticalCount} KRİTİK
                  </span>
                )}
                {intel.warningCount > 0 && (
                  <span style={{
                    fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
                    background: C.warnDim, color: C.warn, fontWeight: 400,
                  }}>
                    {intel.warningCount} DİKKAT
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Intelligence Table Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "70px 1fr 80px 80px 80px 70px 80px",
            gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
          }}>
            {["KOD", "BİLEŞEN", "TÜKETİM/GÜN", "KAÇ GÜN", "SİP.NOKTASI", "BİTİŞ AYI", "ACİLİYET"].map(h => (
              <div key={h} style={{ fontSize: 9, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Intelligence Rows — Seasonal Only, yari-mamul drill-down */}
          {intel?.components.map((c: any) => {
            const renderIntelRow = (row: any, depth: number = 0) => {
              const urgencyColor = row.urgency === "critical" ? C.err : row.urgency === "warning" ? C.warn : row.urgency === "ok" ? C.blue : C.ok;
              const urgencyBg = row.urgency === "critical" ? C.errDim : row.urgency === "warning" ? C.warnDim : row.urgency === "ok" ? C.blueDim : C.okDim;
              const urgencyLabel = row.urgency === "critical" ? "KRİTİK" : row.urgency === "warning" ? "DİKKAT" : row.urgency === "ok" ? "YETERLİ" : "BOL";
              const riskColor = row.depletionRisk === "KRİTİK" ? C.err : row.depletionRisk === "YÜKSEK" ? C.warn : row.depletionRisk === "ORTA" ? C.blue : C.ok;
              const isReasoningExpanded = expandedReasoning === row.code;
              const isDrillExpanded = expandedRows.has(row.code);
              const isSub = row.isSubAssembly && (row.children?.length ?? 0) > 0;

              return (
                <div key={row.code}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "70px 1fr 80px 80px 80px 70px 80px",
                    gap: 8, padding: "8px 12px", borderBottom: isReasoningExpanded || isDrillExpanded ? "none" : `1px solid ${C.border}`,
                    background: depth > 0 ? "rgba(255,255,255,0.015)" : (row.urgency === "critical" ? C.errDim : row.winterStress ? "rgba(249,115,22,0.03)" : isSub ? C.accentDim : "transparent"),
                    borderLeft: depth > 0 ? `2px solid ${C.accent}` : "none",
                    paddingLeft: depth > 0 ? 12 + depth * 16 : 12,
                    transition: "background 0.15s",
                    cursor: isSub ? "pointer" : "default",
                  }}
                    onClick={() => isSub && toggleExpand(row.code)}
                    onMouseEnter={e => { if (row.urgency !== "critical" && !isSub && depth === 0) e.currentTarget.style.background = C.surfaceHover; }}
                    onMouseLeave={e => { if (row.urgency !== "critical" && !isSub && depth === 0) e.currentTarget.style.background = row.winterStress ? "rgba(249,115,22,0.03)" : "transparent"; }}
                  >
                    <div style={{ fontFamily: mono, fontSize: 11, color: C.mid }}>
                      {isSub && <span style={{ marginRight: 4, color: C.accent }}>{isDrillExpanded ? "▾" : "▸"}</span>}
                      {row.code}
                    </div>
                    <div style={{ fontSize: 12, color: C.white, display: "flex", alignItems: "center", gap: 6 }}>
                      {row.name}
                      {isSub && <span style={{ fontSize: 9, color: C.accent, fontFamily: mono }}>⚡ YARI MAMÜL ({row.children.length} alt)</span>}
                      {depth > 0 && <span style={{ fontSize: 8, color: C.dim, fontFamily: mono }}>alt bileşen</span>}
                      {row.winterStress && <span style={{ fontSize: 8, color: "#f97316", fontFamily: mono }}>KIS RISKI</span>}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: C.white, fontWeight: 400 }}>
                      {row.dailyBurnRate}
                    </div>
                    <div style={{
                      fontFamily: mono, fontSize: 13, fontWeight: 600,
                      color: row.seasonalDays === 0 ? C.err
                        : row.seasonalDays !== null && row.seasonalDays < 30 ? C.err
                        : row.seasonalDays !== null && row.seasonalDays < 90 ? C.warn : C.ok,
                    }}>
                      {row.seasonalDays === null ? "—"
                        : row.seasonalDays > 1095 ? "3+yıl"
                        : `${row.seasonalDays}g`}
                    </div>
                    <div style={{
                      fontFamily: mono, fontSize: 11,
                      color: row.currentStock > row.seasonalReorderPoint ? C.ok : C.err,
                    }}>
                      {row.seasonalReorderPoint}
                      {row.currentStock <= row.seasonalReorderPoint && <span style={{ color: C.err, fontSize: 9 }}> !</span>}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: riskColor, fontWeight: 400 }}>
                      {row.depletionMonth
                        ? `${row.depletionMonth} ${row.depletionYear}`
                        : row.currentStock > 0 && row.seasonalDays !== null && row.seasonalDays > 1095
                          ? "Uzak vadeli"
                          : "—"}
                    </div>
                    <div>
                      <span
                        onClick={(e) => { e.stopPropagation(); row.urgencyReasoning && setExpandedReasoning(prev => prev === row.code ? null : row.code); }}
                        style={{
                          fontSize: 9, fontFamily: mono, fontWeight: 400, padding: "2px 8px",
                          borderRadius: 4, background: isReasoningExpanded ? urgencyColor : urgencyBg,
                          color: isReasoningExpanded ? "#000" : urgencyColor,
                          cursor: row.urgencyReasoning ? "pointer" : "default",
                          transition: "all 0.15s",
                        }}>
                        {urgencyLabel} {row.urgencyReasoning ? (isReasoningExpanded ? "▾" : "▸") : ""}
                      </span>
                    </div>
                  </div>
                  {isReasoningExpanded && row.urgencyReasoning && (
                    <div style={{
                      padding: "8px 16px 12px", background: "rgba(255,255,255,0.02)",
                      borderBottom: `1px solid ${C.border}`, borderLeft: `2px solid ${urgencyColor}`,
                    }}>
                      <div style={{ fontSize: 8, fontFamily: mono, color: C.accent, letterSpacing: 0.5, marginBottom: 4 }}>
                        SEBEP ZİNCİRİ — {row.code} {row.name}
                      </div>
                      {row.urgencyReasoning.map((step: any, i: number) => (
                        <div key={i} style={{ fontSize: 10, color: C.mid, lineHeight: 1.7, paddingLeft: 8 }}>
                          {step.order}. {step.cause}
                        </div>
                      ))}
                    </div>
                  )}
                  {isDrillExpanded && isSub && row.children.map((ch: any) => renderIntelRow(ch, depth + 1))}
                </div>
              );
            };

            return renderIntelRow(c);
          })}

          {!intel && (
            <div style={{ textAlign: "center", padding: 24, color: C.dim, fontSize: 12 }}>
              İstihbarat verisi yükleniyor...
            </div>
          )}
        </motion.div>

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 10, fontFamily: mono, color: C.dim }}>
          GRISEUS ÜRÜN İSTİHBARATI — {sku} — Palantir Ontoloji Motoru v1.0 — Veriler Çukurova Netsis'ten içe aktarıldı
        </div>
      </div>
    </div>
  );
}
