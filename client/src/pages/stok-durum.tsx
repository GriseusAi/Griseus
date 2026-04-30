import { useState, useCallback, useRef, useEffect } from "react";
import { useSKU } from "@/lib/sku-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket, type StockUpdateEvent, type ProactiveAlertEvent, type ProactiveAlertData, type ImpactPropagationEvent, type ImpactEventData } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import ProductSelector from "@/components/ProductSelector";
import { useGlobalAlerts } from "../App";

/* PALETTE — claude.ai aesthetic via shared theme */
import { CT, CT_FONT } from "@/lib/claude-theme";
const C = {
  bg: CT.bg, surface: CT.surface, surfaceHover: CT.surfaceHover,
  border: CT.border, borderActive: CT.borderStrong,
  accent: CT.accent, accentDim: CT.accentSoft, accentGlow: CT.accentEdge,
  ok: CT.ok, okDim: CT.okSoft, okBorder: "rgba(63,143,91,0.28)",
  warn: CT.warn, warnDim: CT.warnSoft, warnBorder: "rgba(184,118,28,0.28)",
  variable: "#c96442", variableDim: "rgba(201,100,66,0.12)", variableBorder: "rgba(201,100,66,0.32)",
  err: CT.err, errDim: CT.errSoft, errBorder: "rgba(179,64,55,0.28)",
  blue: CT.info, blueDim: CT.infoSoft, blueBorder: "rgba(61,111,176,0.28)",
  purple: "#8a72c7",
  white: CT.ink, mid: CT.inkSub, dim: CT.inkMuted, dimmer: CT.inkFaint,
};
const mono = CT_FONT;
const sans = CT_FONT;
const glass = {
  boxShadow: "0 1px 2px rgba(20,20,19,0.04), 0 4px 16px rgba(20,20,19,0.04)",
} as const;

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
  currentStock: number; rawStock?: number; maxProducts: number | null;
  status: "critical" | "warning" | "ok" | "abundant" | "variable" | "N/A";
  isSubAssembly?: boolean;
  children?: BomComponent[];
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
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: mono, fontWeight: 400, letterSpacing: 1, marginBottom: 4 }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 400, fontFamily: mono, color: s.color, lineHeight: 1 }}>{s.value}</div>
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
function CapacityGauge({ capacity, sku }: { capacity: Capacity | undefined; sku: string }) {
  if (!capacity) return null;
  const max = capacity.maxProducible;
  const top = capacity.bottlenecks[0];
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: "20px 24px", textAlign: "center",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
    }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1.5, marginBottom: 8 }}>
        MAKSİMUM ÜRETİLEBİLİR
      </div>
      <div style={{ fontSize: 48, fontWeight: 400, fontFamily: mono, color: C.accent, lineHeight: 1, marginBottom: 4 }}>
        {fmt(max)}
      </div>
      <div style={{ fontSize: 13, color: C.mid, marginBottom: 12 }}>adet {sku}</div>
      {top && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px",
          borderRadius: 20, background: C.errDim, border: `1px solid ${C.errBorder}`,
        }}>
          <span style={{ fontSize: 11, color: C.err, fontWeight: 400, fontFamily: mono }}>Darboğaz:</span>
          <span style={{ fontSize: 11, color: C.mid }}>
            {top.name} ({fmt(top.stock)}/{top.required} = {fmt(top.maxProducts)})
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Component Card (Ontology Object) ── */
function ComponentCard({ comp, onClick, isFlashing, onStockUpdate, isSaving }: {
  comp: BomComponent;
  onClick: () => void;
  isFlashing: boolean;
  onStockUpdate: (code: string, stock: number, unit: string) => void;
  isSaving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const isNegative = comp.currentStock < 0;
  // Status → renk (tüm sistemde aynı kural):
  //   critical=kırmızı · warning=sarı · ok=mavi · abundant=yeşil
  //   variable=koyu turuncu (opsiyonel/değişken — VA-pattern kodlar)
  const statusColor = isNegative ? C.err : comp.status === "critical" ? C.err : comp.status === "variable" ? C.variable : comp.status === "warning" ? C.warn : comp.status === "ok" ? C.blue : C.ok;
  const statusBg = isNegative ? C.errDim : comp.status === "critical" ? C.errDim : comp.status === "variable" ? C.variableDim : comp.status === "warning" ? C.warnDim : comp.status === "ok" ? C.blueDim : C.okDim;
  const statusLabel = isNegative ? "NEGATİF" : comp.status === "critical" ? "KRİTİK" : comp.status === "variable" ? "DEĞİŞKEN" : comp.status === "warning" ? "DÜŞÜK" : comp.status === "ok" ? "YETERLİ" : "BOL";
  const maxP = comp.maxProducts ?? 0;
  const barPct = Math.min(maxP / 500, 1);
  const hasChildren = comp.isSubAssembly && (comp.children?.length ?? 0) > 0;
  const monteFark = comp.rawStock !== undefined && comp.currentStock > comp.rawStock
    ? comp.currentStock - comp.rawStock : 0;

  return (
    <div
      className={isFlashing ? "stock-flash" : ""}
      onClick={() => { if (hasChildren) setExpanded(p => !p); else onClick(); }}
      style={{
        background: C.surface, border: `1px solid ${expanded ? statusColor + "60" : C.border}`, borderRadius: 12,
        padding: "10px 12px", cursor: "pointer", position: "relative", overflow: "hidden", ...glass,
        transition: "all 0.15s",
        gridColumn: expanded ? "1 / -1" : "auto",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.borderColor = statusColor + "40"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = expanded ? statusColor + "60" : C.border; }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: statusColor, opacity: 0.6 }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 400, color: C.white, letterSpacing: 0.5 }}>
          {comp.code}
          {hasChildren && (
            <span style={{ marginLeft: 6, fontSize: 9, color: statusColor, opacity: 0.7 }}>
              {expanded ? "▾" : "▸"} {comp.children!.length} alt
            </span>
          )}
        </div>
        <div style={{
          fontSize: 7, fontFamily: mono, fontWeight: 400, letterSpacing: 0.8,
          padding: "2px 5px", borderRadius: 4, background: statusBg, color: statusColor,
        }}>
          {hasChildren ? "YARI MAMÜL" : statusLabel}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, height: 28, overflow: "hidden", lineHeight: "14px" }}>
        {comp.name}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                type="number"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const v = parseFloat(editVal);
                    if (!isNaN(v) && v >= 0) {
                      onStockUpdate(comp.code, v, comp.unit);
                      setEditing(false);
                    }
                  } else if (e.key === "Escape") {
                    setEditing(false);
                  }
                }}
                disabled={isSaving}
                style={{
                  width: 70, fontSize: 16, fontFamily: mono, fontWeight: 400,
                  color: statusColor, background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${statusColor}60`, borderRadius: 6,
                  padding: "4px 6px", outline: "none",
                }}
              />
              <button
                disabled={isSaving}
                onClick={e => {
                  e.stopPropagation();
                  const v = parseFloat(editVal);
                  if (!isNaN(v) && v >= 0) {
                    onStockUpdate(comp.code, v, comp.unit);
                    setEditing(false);
                  }
                }}
                style={{
                  fontSize: 14, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                  background: C.ok + "20", border: `1px solid ${C.okBorder}`, color: C.ok,
                }}
              >✓</button>
              <button
                onClick={e => { e.stopPropagation(); setEditing(false); }}
                style={{
                  fontSize: 14, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.mid,
                }}
              >✕</button>
            </div>
          ) : (
            <div
              onClick={e => {
                e.stopPropagation();
                setEditVal(String(comp.rawStock !== undefined ? comp.rawStock : comp.currentStock));
                setEditing(true);
              }}
              title="Stok miktarını değiştir"
              style={{ cursor: "pointer", display: "inline-block" }}
            >
              <div style={{ fontSize: 18, fontWeight: 400, fontFamily: mono, color: statusColor, lineHeight: 1 }}>
                {fmt(comp.currentStock)}
                <span style={{ fontSize: 9, color: C.dim, marginLeft: 4, opacity: 0.6 }}>✎</span>
              </div>
              <div style={{ fontSize: 8, color: C.dim, fontFamily: mono }}>
                {comp.unit} {monteFark > 0 ? `(${comp.rawStock}+${monteFark} monte)` : "stok"}
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 400, fontFamily: mono, color: C.mid, lineHeight: 1 }}>
            {maxP === null ? "—" : fmt(maxP)}
          </div>
          <div style={{ fontSize: 8, color: C.dim, fontFamily: mono }}>ürün yeter</div>
        </div>
      </div>

      <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
        <div style={{
          width: `${barPct * 100}%`, height: "100%", borderRadius: 2,
          background: statusColor, transition: "width 0.5s ease",
        }} />
      </div>

      {/* Drill-down: alt bileşenler */}
      {expanded && hasChildren && (
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.border}`,
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8,
        }}>
          {comp.children!.map(ch => (
            <ChildRow key={ch.code} child={ch} depth={1} onStockUpdate={onStockUpdate} isSaving={isSaving} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Recursive child row for drill-down ── */
function ChildRow({ child, depth, onStockUpdate, isSaving }: {
  child: BomComponent;
  depth: number;
  onStockUpdate: (code: string, stock: number, unit: string) => void;
  isSaving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const color = child.status === "critical" ? C.err : child.status === "warning" ? C.warn : child.status === "ok" ? C.blue : C.ok;
  const hasKids = (child.children?.length ?? 0) > 0;
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 8,
      padding: "8px 10px", marginLeft: depth * 8,
    }}
      onClick={(e) => { e.stopPropagation(); if (hasKids) setOpen(p => !p); }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.white }}>
          {hasKids && <span style={{ color, marginRight: 4 }}>{open ? "▾" : "▸"}</span>}
          {child.code}
          <span style={{ fontSize: 8, color: C.dim, marginLeft: 6 }}>T{child.tier}</span>
        </div>
        {editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 3 }} onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              type="number"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const v = parseFloat(editVal);
                  if (!isNaN(v) && v >= 0) { onStockUpdate(child.code, v, child.unit); setEditing(false); }
                } else if (e.key === "Escape") { setEditing(false); }
              }}
              disabled={isSaving}
              style={{
                width: 55, fontSize: 11, fontFamily: mono, color,
                background: "rgba(0,0,0,0.4)", border: `1px solid ${color}60`,
                borderRadius: 4, padding: "2px 4px", outline: "none",
              }}
            />
            <button
              disabled={isSaving}
              onClick={e => {
                e.stopPropagation();
                const v = parseFloat(editVal);
                if (!isNaN(v) && v >= 0) { onStockUpdate(child.code, v, child.unit); setEditing(false); }
              }}
              style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, cursor: "pointer", background: C.ok + "20", border: `1px solid ${C.okBorder}`, color: C.ok }}
            >✓</button>
            <button
              onClick={e => { e.stopPropagation(); setEditing(false); }}
              style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.mid }}
            >✕</button>
          </div>
        ) : (
          <div
            onClick={e => {
              e.stopPropagation();
              setEditVal(String(child.rawStock !== undefined ? child.rawStock : child.currentStock));
              setEditing(true);
            }}
            title="Stok miktarını değiştir"
            style={{ fontFamily: mono, fontSize: 11, color, cursor: "pointer" }}
          >
            {fmt(child.currentStock)} {child.unit}
            <span style={{ fontSize: 8, color: C.dim, marginLeft: 3, opacity: 0.6 }}>✎</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 9, color: C.dim, marginTop: 3, lineHeight: "12px" }}>
        {child.name}
      </div>
      <div style={{ fontSize: 8, color: C.dim, marginTop: 2, fontFamily: mono }}>
        {child.requiredPerUnit} {child.unit}/ürün · {child.maxProducts === null ? "—" : fmt(child.maxProducts)} ürün yeter
      </div>
      {open && hasKids && (
        <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: `1px dashed ${C.border}` }}>
          {child.children!.map(gc => <ChildRow key={gc.code} child={gc} depth={depth + 1} onStockUpdate={onStockUpdate} isSaving={isSaving} />)}
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
  const brulorCapacity = brulor.currentStock + brulor.producibleFromParts;
  // Brülör is only a real bottleneck if its capacity < product max producible
  const isBrulorRealBottleneck = brulorCapacity < capacity.maxProducible;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${(brulor.currentStock + brulor.producibleFromParts) > 0 ? C.okBorder : C.errBorder}`, borderRadius: 16,
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 400, color: (brulor.currentStock + brulor.producibleFromParts) > 0 ? C.ok : C.err, fontFamily: sans }}>
            ⚙ Brülör (Yerli Malzeme) <span style={{ color: C.dim, fontWeight: 400, fontSize: 11 }}>27.125</span>
          </div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>YARI MAMÜL — stok 0 normaldir, alt bileşenlerden montajlanır</div>
        </div>
        <div style={{ display: "flex", gap: 16, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 8, fontFamily: mono, color: C.dim, fontWeight: 400 }}>EFEKTİF STOK</div>
            <div style={{ fontSize: 22, fontWeight: 400, fontFamily: mono, color: (brulor.currentStock + brulor.producibleFromParts) > 0 ? C.ok : C.err }}>{fmt(brulor.currentStock + brulor.producibleFromParts)}</div>
          </div>
          <div>
            <div style={{ fontSize: 8, fontFamily: mono, color: C.dim, fontWeight: 400 }}>HAZIR / MONTELENEBİLİR</div>
            <div style={{ fontSize: 14, fontWeight: 400, fontFamily: mono, color: C.mid }}>{brulor.currentStock} + {fmt(brulor.producibleFromParts)}</div>
          </div>
        </div>
      </div>

      {/* Sub-parts */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {brulor.parts.map(p => {
          const isMinPart = p.maxProducts === Math.min(...brulor.parts.map(x => x.maxProducts));
          // Only show red if this part actually limits product output
          const isRealBottleneck = isMinPart && isBrulorRealBottleneck;
          return (
            <div key={p.code} style={{
              flex: "1 1 calc(50% - 3px)", padding: "8px 10px", borderRadius: 8,
              background: isRealBottleneck ? C.errDim : "rgba(0,0,0,0.2)",
              border: `1px solid ${isRealBottleneck ? C.errBorder : C.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: C.mid, fontWeight: 400 }}>{p.code}</div>
                  <div style={{ fontSize: 10, color: isRealBottleneck ? C.err : C.mid, marginTop: 1 }}>{p.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 400, fontFamily: mono, color: isRealBottleneck ? C.err : C.white }}>{fmt(p.stock)}</div>
                  <div style={{ fontSize: 8, fontFamily: mono, color: C.dim }}>→ {fmt(p.maxProducts)} brülör</div>
                </div>
              </div>
              {isMinPart && (
                <div style={{ fontSize: 8, fontFamily: mono, color: isBrulorRealBottleneck ? C.err : C.dim, fontWeight: 400, marginTop: 4, letterSpacing: 0.5 }}>
                  {isBrulorRealBottleneck ? "▲ DARBOĞAZ" : "▽ İÇ LİMİT (ürünü etkilemiyor)"}
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
      <div style={{ fontSize: 9, fontFamily: mono, color: C.accent, fontWeight: 400, letterSpacing: 1, marginBottom: 2 }}>
        PROACTIVE INTELLIGENCE
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
                fontSize: 11, fontWeight: 400, fontFamily: mono,
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
              fontSize: 10, fontFamily: mono, fontWeight: 400, padding: "4px 10px", borderRadius: 6,
              background: "rgba(99,102,241,0.1)", color: C.accent, display: "inline-block",
              border: `1px solid rgba(99,102,241,0.2)`,
            }}>
              → {a.suggestedAction}
            </div>
          )}
          {a.rootCause && a.rootCause.length > 0 && (
            <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 9, fontFamily: mono, color: C.dim, marginBottom: 4, letterSpacing: 0.5 }}>
                SEBEP ZİNCİRİ
              </div>
              {a.rootCause.map((step: any, i: number) => (
                <div key={i} style={{ fontSize: 10, color: C.mid, lineHeight: 1.6, paddingLeft: 8 }}>
                  {step.order}. {step.cause}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ── Impact Insight Panel ── */
function ImpactInsightPanel({ impact, onDismiss }: { impact: ImpactEventData | null; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!impact) return null;
  const severityColor = impact.severity === "critical" ? C.err : impact.severity === "warning" ? C.warn : C.blue;
  const severityBg = impact.severity === "critical" ? "rgba(239,68,68,0.08)" : impact.severity === "warning" ? "rgba(251,191,36,0.06)" : "rgba(96,165,250,0.06)";
  const severityBorder = impact.severity === "critical" ? C.errBorder : impact.severity === "warning" ? C.warnBorder : C.blueBorder;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      style={{
        position: "fixed", bottom: 16, right: 16, zIndex: 200, width: 380,
        borderRadius: 14, background: severityBg, border: `1px solid ${severityBorder}`,
        backdropFilter: "blur(16px)", overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: severityColor, fontWeight: 400, letterSpacing: 1 }}>
            🧠 IMPACT PROPAGATION
          </div>
          <button onClick={onDismiss} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 400, color: C.white, lineHeight: 1.5, marginBottom: 8 }}>
          {impact.headline}
        </div>

        {/* Reasoning chain (expandable) */}
        <button
          onClick={() => setExpanded(p => !p)}
          style={{
            background: "none", border: "none", color: C.accent, cursor: "pointer",
            fontSize: 10, fontFamily: mono, padding: 0, marginBottom: expanded ? 8 : 0,
          }}
        >
          {expanded ? "▾ Sebep zincirini gizle" : "▸ Sebep zincirini göster"} ({impact.reasoning.length} adım)
        </button>

        {expanded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {impact.reasoning.map(r => (
              <div key={r.order} style={{
                fontSize: 10, color: C.mid, lineHeight: 1.5, paddingLeft: 8,
                borderLeft: `2px solid ${severityColor}20`,
              }}>
                <span style={{ color: C.dim, fontFamily: mono }}>{r.order}.</span> {r.cause}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {impact.actions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {impact.actions.slice(0, 3).map((a, i) => (
              <div key={i} style={{
                fontSize: 9, fontFamily: mono, fontWeight: 400, padding: "3px 8px", borderRadius: 6,
                background: a.priority === "immediate" ? "rgba(239,68,68,0.15)" : "rgba(99,102,241,0.1)",
                color: a.priority === "immediate" ? C.err : C.accent,
                border: `1px solid ${a.priority === "immediate" ? "rgba(239,68,68,0.25)" : "rgba(99,102,241,0.2)"}`,
              }}>
                → {a.description}
              </div>
            ))}
          </div>
        )}
      </div>
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
          <span style={{ fontFamily: mono, fontSize: 11, color: C.accent, fontWeight: 400 }}>{t.sku}</span>
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
  const { selectedSku: sku, setSelectedSku: setSku } = useSKU();
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
    queryKey: [`/api/bom/${sku}/stock`],
  });
  const { data: capacity } = useQuery<Capacity>({
    queryKey: [`/api/bom/${sku}/production-capacity`],
  });

  const product = levels.find(l => l.productSku === sku) || null;
  const productId = product?.productId;

  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: [`/api/stock/movements?product_id=${productId}&limit=30`],
    enabled: !!productId,
  });

  // Auto-reset: clean test data on first load if there are unexpected products
  const hasOldData = false; // disabled — multi-product now supported
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
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/intelligence`] });
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
  }, [qc, productId, sku]);

  const { alerts: globalAlerts, pushAlerts } = useGlobalAlerts();

  const handleProactiveAlert = useCallback((data: ProactiveAlertEvent) => {
    // Lokal toast-tarzı gösterim (geçici)
    setProactiveAlerts(prev => {
      const newAlerts = data.alerts.filter(a => !prev.some(p => p.id === a.id));
      return [...newAlerts, ...prev].slice(0, 5);
    });
    // Global bildirim havuzuna ekle (kalıcı)
    pushAlerts(data.alerts);
    // Auto-dismiss non-critical after 15s
    for (const alert of data.alerts) {
      if (alert.severity !== "critical") {
        setTimeout(() => {
          setProactiveAlerts(prev => prev.filter(a => a.id !== alert.id));
        }, 15000);
      }
    }
  }, [pushAlerts]);

  // Impact Propagation
  const [latestImpact, setLatestImpact] = useState<ImpactEventData | null>(null);
  const handleImpactPropagation = useCallback((data: ImpactPropagationEvent) => {
    if (data.impacts.length > 0) {
      const impact = data.impacts[0];
      setLatestImpact(impact);
      // Auto-dismiss info after 10s, warning 20s, critical stays
      if (impact.severity !== "critical") {
        setTimeout(() => setLatestImpact(prev => prev?.id === impact.id ? null : prev),
          impact.severity === "warning" ? 20000 : 10000);
      }
    }
  }, []);

  const { connected } = useStockWebSocket(handleStockUpdate, handleProactiveAlert, handleImpactPropagation);

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

  // Component stok güncellemesi — bulk/stock otomatik octopus-chain audit tetikler
  const componentStockMutation = useMutation({
    mutationFn: async ({ code, stock, unit }: { code: string; stock: number; unit: string }) => {
      const res = await apiRequest("POST", "/api/import/bulk/stock", {
        items: [{ code, stock, unit }],
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });
  const handleComponentStockUpdate = useCallback((code: string, stock: number, unit: string) => {
    componentStockMutation.mutate({ code, stock, unit: unit || "AD" });
  }, [componentStockMutation]);

  const activeAction = QUICK_ACTIONS.find(a => a.type === actionType);
  // Her buton her an çalışsın — maxQty kaldırıldı, sadece pozitif sayı kontrolü
  const qtyNum = parseInt(actionQty, 10);
  const canExecute = !isNaN(qtyNum) && qtyNum > 0;

  const filtered = filterType ? movements.filter(m => m.movementType === filterType) : movements;

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans,
      position: "relative", overflow: "hidden",
    }}>
      {/* Glassmorphism background orbs */}
      <div className="glass-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <style>{GLOBAL_STYLES}</style>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <ToastStack toasts={toasts} />
      <ProactiveAlertPanel
        alerts={proactiveAlerts}
        onDismiss={(id) => setProactiveAlerts(prev => prev.filter(a => a.id !== id))}
      />
      <ImpactInsightPanel
        impact={latestImpact}
        onDismiss={() => setLatestImpact(null)}
      />
      <TopNav connected={connected} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", position: "relative", zIndex: 1 }}>

        {/* ════ HERO — Product Identity ════ */}
        <div style={{ textAlign: "center", padding: "28px 0 8px" }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 2, marginBottom: 6 }}>
            ÇUKUROVA ISI SİSTEMLERİ — ÜRÜN KOMUTA MERKEZİ
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 400, color: C.white, letterSpacing: -0.5 }}>
              <span style={{ color: C.accent }}>{sku}</span>
            </div>
            <ProductSelector value={sku} onChange={setSku} />
          </div>
        </div>

        {/* ════ PIPELINE + CAPACITY ════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20, marginTop: 16 }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "20px", display: "flex", alignItems: "center", justifyContent: "center", ...glass,
          }}>
            <Pipeline product={product} />
          </div>
          <CapacityGauge capacity={capacity} sku={sku} />
        </div>

        {/* ════ QUICK ACTIONS ════ */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
          padding: "16px 20px", marginBottom: 20, ...glass,
        }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1.5, marginBottom: 10 }}>
            AKSİYONLAR — {sku} Stok Hareketi
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: actionType ? 10 : 0 }}>
            {QUICK_ACTIONS.map(a => {
              const isActive = actionType === a.type;
              // Her buton her an tıklanabilir — workflow dependency kaldırıldı
              // (user: "üretim girişi yapılmadan depoya transfer edilemiyor
              // - direk her butona her an giriş yapılabilsin")
              const isDisabled = !product;
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
                    fontFamily: sans, fontSize: 12, fontWeight: 400, textAlign: "center",
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
                    <div style={{ fontSize: 12, color: activeAction.color, fontWeight: 400, marginBottom: 6 }}>
                      {activeAction.icon} {activeAction.desc}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number" min={1} inputMode="numeric" placeholder="Adet"
                        value={actionQty} onChange={e => setActionQty(e.target.value)} autoFocus
                        style={{
                          width: 120, padding: "10px 12px", borderRadius: 10,
                          background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                          color: C.white, fontFamily: mono, fontSize: 18, fontWeight: 400, textAlign: "center",
                        }}
                      />
                      <button
                        onClick={() => { if (canExecute) { actionMutation.mutate({ movementType: actionType, quantity: qtyNum }); setActionType(null); setActionQty(""); } }}
                        disabled={!canExecute}
                        style={{
                          padding: "10px 24px", borderRadius: 10, border: "none",
                          background: canExecute ? activeAction.color : C.dimmer,
                          color: canExecute ? "#000" : C.dim,
                          fontFamily: mono, fontSize: 13, fontWeight: 400, cursor: canExecute ? "pointer" : "default",
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
            <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1.5 }}>
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
                  fontFamily: mono, fontSize: 10, fontWeight: 400, letterSpacing: 0.5,
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
                onStockUpdate={handleComponentStockUpdate}
                isSaving={componentStockMutation.isPending}
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
          padding: "16px 20px", marginBottom: 40, ...glass,
        }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1.5, marginBottom: 10 }}>
            SON HAREKETLER — {sku}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { v: "", l: "Tümü" }, { v: "produced", l: "Üretim" }, { v: "to_warehouse", l: "Depo" },
              { v: "to_sales", l: "Satış" }, { v: "inventory_count", l: "Sayım" }, { v: "undo", l: "Geri Al" },
            ].map(f => (
              <button key={f.v} onClick={() => setFilterType(f.v)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 400,
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
                    <div style={{ fontSize: 12, color: moveColor[m.movementType] || C.mid, fontWeight: 400 }}>
                      {moveLabel[m.movementType] || m.movementType} — {m.quantity} adet
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                      {formatDate(m.createdAt)} · {m.createdBy || "?"}{m.note ? ` · ${m.note}` : ""}
                    </div>
                  </div>
                  {m.movementType !== "undo" && (
                    <button onClick={() => undoMutation.mutate(m.id)} style={{
                      background: C.errDim, border: `1px solid ${C.errBorder}`, borderRadius: 6,
                      padding: "3px 8px", color: C.err, fontSize: 9, fontWeight: 400,
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
