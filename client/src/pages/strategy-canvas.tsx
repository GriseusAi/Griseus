import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ════════════════════════════════════════════════════════════════════
   STRATEGY CANVAS — Freeform sipariş → BOM → strateji domino haritası
   Sipariş → mamul → bileşenler (fan-out) → yarımamül → strateji panel
   ──────────────────────────────────────────────────────────────────── */

const C = {
  bg: "#0a0a0e",
  panel: "rgba(255,255,255,0.04)",
  panelEdge: "rgba(255,255,255,0.10)",
  card: "#f5f5f7",
  cardInk: "#0a0a0e",
  cardSub: "#5a5a68",
  ink: "#ffffff",
  mid: "#9a9aa8",
  dim: "#5a5a68",
  edge: "rgba(255,255,255,0.55)",
  edgeFaint: "rgba(255,255,255,0.18)",
  shortfall: "#ef4444",
  shortfallSoft: "rgba(239,68,68,0.18)",
  ok: "#34d399",
  warn: "#fbbf24",
  accent: "#a78bfa",
} as const;
const mono = "'Inter', system-ui, -apple-system, sans-serif";
const fmtTR = (n: number) => (isFinite(n) ? n.toLocaleString("tr-TR") : "—");
const MONTH_LABELS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

/* SKU listesi — backend ile sync (shared/octopus-chain-config.ts) */
const ALL_SKUS = [
  "ELT.7-11", "ELT.5-7",
  "GSS20P", "GSS40P",
  "GSA15", "GSA20", "GSA30",
  "BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV",
] as const;

/* ─────── Tipler ─────── */
interface Order {
  id: string;
  customer: string;
  deadline: string;          // ISO date
  sku: string;
  quantity: number;
  createdAt: number;
}
interface BomComponent {
  code: string;
  name: string;
  requiredPerUnit: number;
  unit: string;
  currentStock: number;
  rawStock?: number;
  maxProducts: number | null;
  status: string;
  tier: number;
  parentComponentCode: string | null;
  isSubAssembly?: boolean;
  hasChildren?: boolean;
}
interface CapacityResp {
  product: string;
  maxProducible: number;
  bottlenecks: { code: string; name: string; maxProducts: number; reason?: string }[];
  subAssemblyStatus?: any[];
  onDemandComponents?: any[];
  variableComponents?: any[];
}
interface StockResp {
  product: string;
  components: BomComponent[];
}

const ORDERS_KEY = "griseus_strategy_orders_v1";

function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveOrders(orders: Order[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function monthSlots(start: Date, end: Date): { label: string; t: number }[] {
  const slots: { label: string; t: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    slots.push({ label: `${MONTH_LABELS[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`, t: cur.getTime() });
    cur.setMonth(cur.getMonth() + 1);
  }
  if (slots.length === 0) slots.push({ label: `${MONTH_LABELS[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`, t: start.getTime() });
  return slots;
}

/* ─────── Tek bir Order için strateji panosu ─────── */
function OrderBlock({
  order,
  capacity,
  stock,
  loading,
  onRemove,
  onEdit,
  yOffset,
}: {
  order: Order;
  capacity?: CapacityResp;
  stock?: StockResp;
  loading: boolean;
  onRemove: () => void;
  onEdit: () => void;
  yOffset: number;
}) {
  const components = useMemo(() => {
    if (!stock) return [] as BomComponent[];
    return stock.components.filter(c => (c.parentComponentCode === null) || c.isSubAssembly);
  }, [stock]);

  // top-level bileşenler — sipariş etkisi: requestedQty * reqPerUnit, eksik = max(0, needed - currentStock)
  const topLevel = useMemo(() => {
    const list = (stock?.components ?? []).filter(c => c.parentComponentCode === null);
    return list.map(c => {
      const needed = order.quantity * c.requiredPerUnit;
      const shortfall = Math.max(0, Math.ceil(needed - c.currentStock));
      return { ...c, needed, shortfall };
    });
  }, [stock, order.quantity]);

  const subAssemblies = useMemo(
    () => topLevel.filter(c => c.isSubAssembly || c.hasChildren),
    [topLevel],
  );
  const flatComponents = useMemo(
    () => topLevel.filter(c => !(c.isSubAssembly || c.hasChildren)),
    [topLevel],
  );

  const maxProd = capacity?.maxProducible ?? 0;
  const possible = Math.min(order.quantity, maxProd);
  const missing = Math.max(0, order.quantity - maxProd);

  // procurement listesi (en yüksek shortfall üstte)
  const procurement = useMemo(() => {
    return topLevel
      .filter(c => c.shortfall > 0)
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 6);
  }, [topLevel]);

  // BOM kart geometrisi
  const ORDER_X = 60;
  const PRODUCT_X = 380;
  const SUB_X = 720;
  const COMP_X = 980;
  const PANEL_X = 1240;
  const CENTER_Y = 280 + yOffset;

  // bileşenleri dikeyde dağıt
  const COMP_GAP = 56;
  const compY = (i: number, total: number) => CENTER_Y - ((total - 1) * COMP_GAP) / 2 + i * COMP_GAP;

  // timeline
  const today = new Date();
  const deadline = order.deadline ? new Date(order.deadline) : new Date(Date.now() + 90 * 86400000);
  const months = useMemo(() => monthSlots(today, deadline), [order.deadline]);
  const totalSpan = Math.max(1, deadline.getTime() - today.getTime());
  const TIMELINE_W = 380;
  const tToX = (t: number) => Math.max(0, Math.min(TIMELINE_W, ((t - today.getTime()) / totalSpan) * TIMELINE_W));

  return (
    <g>
      {/* Sipariş kartı */}
      <foreignObject x={ORDER_X} y={CENTER_Y - 50} width={260} height={100}>
        <div style={{
          background: C.card, color: C.cardInk, borderRadius: 14, padding: 14,
          boxShadow: "0 4px 18px rgba(0,0,0,0.4)", fontFamily: mono,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ fontSize: 9, color: C.cardSub, letterSpacing: 1.4, fontWeight: 600 }}>SİPARİŞ</div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{order.customer || "Bayi"}</div>
          <div style={{ fontSize: 11, color: C.cardSub }}>
            <b>{order.deadline ? new Date(order.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b> son tarih
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button onClick={onEdit} style={{
              background: "transparent", border: `1px solid ${C.cardSub}33`, borderRadius: 6,
              padding: "2px 8px", fontSize: 10, color: C.cardSub, cursor: "pointer", fontFamily: mono,
            }}>düzenle</button>
            <button onClick={onRemove} style={{
              background: "transparent", border: `1px solid ${C.cardSub}33`, borderRadius: 6,
              padding: "2px 8px", fontSize: 10, color: C.cardSub, cursor: "pointer", fontFamily: mono,
            }}>kaldır</button>
          </div>
        </div>
      </foreignObject>

      {/* Sipariş → Mamul kesik çizgi */}
      <line x1={ORDER_X + 260} y1={CENTER_Y} x2={PRODUCT_X} y2={CENTER_Y}
        stroke={C.edge} strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Mamul kartı */}
      <foreignObject x={PRODUCT_X} y={CENTER_Y - 40} width={200} height={80}>
        <div style={{
          background: C.card, color: C.cardInk, borderRadius: 12, padding: 12,
          boxShadow: "0 4px 18px rgba(0,0,0,0.4)", fontFamily: mono,
        }}>
          <div style={{ fontSize: 9, color: C.cardSub, letterSpacing: 1.4, fontWeight: 600 }}>MAMUL</div>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>{fmtTR(order.quantity)} adet</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.cardSub, marginTop: 1 }}>{order.sku}</div>
        </div>
      </foreignObject>

      {/* Mamul → BOM kesik çizgi (toplama merkez) */}
      {flatComponents.length > 0 && (
        <>
          <line x1={PRODUCT_X + 200} y1={CENTER_Y} x2={SUB_X - 30} y2={CENTER_Y}
            stroke={C.edge} strokeWidth="1.5" strokeDasharray="4 4" />
          {/* fan-out merkezden bileşenlere */}
          {flatComponents.map((c, i) => {
            const y = compY(i, flatComponents.length);
            const startX = SUB_X - 30;
            const endX = COMP_X;
            const cpx = (startX + endX) / 2;
            const path = `M ${startX} ${CENTER_Y} C ${cpx} ${CENTER_Y}, ${cpx} ${y}, ${endX} ${y}`;
            const isShort = c.shortfall > 0;
            return (
              <path key={c.code} d={path}
                stroke={isShort ? C.shortfall : C.edge}
                strokeWidth={isShort ? 1.6 : 1.2}
                strokeDasharray={isShort ? "5 4" : "3 4"}
                fill="none" />
            );
          })}
        </>
      )}

      {/* Yarımamül daireleri */}
      {subAssemblies.map((c, i) => {
        const total = subAssemblies.length;
        const y = CENTER_Y - ((total - 1) * 60) / 2 + i * 60;
        const isShort = c.shortfall > 0;
        return (
          <g key={c.code}>
            <line x1={PRODUCT_X + 200} y1={CENTER_Y} x2={SUB_X - 8} y2={y}
              stroke={isShort ? C.shortfall : C.edge}
              strokeWidth={1.4}
              strokeDasharray="4 4" />
            <circle cx={SUB_X + 22} cy={y} r="28"
              fill={C.card} stroke={isShort ? C.shortfall : C.panelEdge} strokeWidth="1.5" />
            <text x={SUB_X + 22} y={y - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.cardInk} fontFamily={mono}>
              {c.code.length > 8 ? c.code.slice(0, 7) + "…" : c.code}
            </text>
            <text x={SUB_X + 22} y={y + 8} textAnchor="middle" fontSize="8" fill={C.cardSub} fontFamily={mono}>
              {fmtTR(c.currentStock)} ad
            </text>
            {isShort && (
              <text x={SUB_X + 22} y={y + 20} textAnchor="middle" fontSize="8" fill={C.shortfall} fontFamily={mono}>
                eksik {fmtTR(c.shortfall)}
              </text>
            )}
          </g>
        );
      })}

      {/* Bileşen kartları */}
      {flatComponents.map((c, i) => {
        const y = compY(i, flatComponents.length);
        const isShort = c.shortfall > 0;
        return (
          <foreignObject key={c.code} x={COMP_X} y={y - 18} width={210} height={36}>
            <div style={{
              background: C.card, color: C.cardInk, borderRadius: 8,
              padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 2px 10px rgba(0,0,0,0.35)", fontFamily: mono,
              border: isShort ? `1.5px solid ${C.shortfall}` : "1.5px solid transparent",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.code}
                </div>
                <div style={{ fontSize: 9, color: C.cardSub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  stok {fmtTR(c.currentStock)} {c.unit || "ad"}
                </div>
              </div>
              {isShort && (
                <div style={{
                  background: C.shortfallSoft, color: C.shortfall,
                  fontSize: 9, padding: "3px 6px", borderRadius: 5, fontWeight: 700, whiteSpace: "nowrap",
                }}>−{fmtTR(c.shortfall)}</div>
              )}
            </div>
          </foreignObject>
        );
      })}

      {/* x{quantity} etiketi */}
      <text x={SUB_X + 70} y={CENTER_Y - 110} fontSize="11" fill={C.mid} fontStyle="italic" fontFamily={mono}>
        × {fmtTR(order.quantity)}
      </text>

      {/* Strateji panel — sağ */}
      <foreignObject x={PANEL_X} y={CENTER_Y - 200} width={400} height={420}>
        <div style={{
          background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 14,
          padding: 16, fontFamily: mono, color: C.ink,
          backdropFilter: "blur(6px)",
        }}>
          {/* Timeline */}
          <div style={{ position: "relative", marginBottom: 18, height: 70 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              {months.map(m => (
                <div key={m.t} style={{ fontSize: 10, color: C.mid, letterSpacing: 0.5 }}>{m.label}</div>
              ))}
            </div>
            <div style={{ position: "relative", height: 32, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
              {/* üretim bandı: bugünden deadline'a 90% */}
              <div style={{
                position: "absolute", left: 0, top: 6, height: 8,
                width: tToX(today.getTime() + totalSpan * 0.9),
                background: C.ink, borderRadius: 4,
              }} />
              <div style={{ position: "absolute", left: 4, top: -2, fontSize: 9, color: C.ink, fontWeight: 700 }}>
                {fmtTR(possible)} adet üret
              </div>
              {/* tedarik bandı: ilk %25 */}
              <div style={{
                position: "absolute", left: 0, top: 22, height: 4,
                width: tToX(today.getTime() + totalSpan * 0.25),
                background: C.mid, borderRadius: 2,
              }} />
              <div style={{ position: "absolute", left: 4, top: 16, fontSize: 8, color: C.mid }}>
                Tedarik süresi
              </div>
            </div>
          </div>

          {/* Strateji başlığı */}
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.6, fontWeight: 600, marginBottom: 4 }}>STRATEJİ</div>
          {loading ? (
            <div style={{ fontSize: 12, color: C.mid }}>Hesaplanıyor…</div>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>
                <b>Maks {fmtTR(maxProd)} adet</b> üretilebilir
                {missing > 0 ? <span style={{ color: C.shortfall }}> · {fmtTR(missing)} eksik</span>
                              : <span style={{ color: C.ok }}> · talep karşılanıyor</span>}
              </div>
              {procurement.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: C.mid, marginBottom: 6, fontWeight: 600, letterSpacing: 0.4 }}>
                    Tedarik et:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {procurement.map(p => (
                      <div key={p.code} style={{
                        display: "flex", justifyContent: "space-between", gap: 8,
                        fontSize: 12, padding: "4px 8px",
                        background: C.shortfallSoft, borderRadius: 6,
                      }}>
                        <span style={{ color: C.ink, fontWeight: 600 }}>{fmtTR(p.shortfall)} adet</span>
                        <span style={{ color: C.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "right" }}>
                          {p.code}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {capacity?.bottlenecks && capacity.bottlenecks.length > 0 && missing > 0 && (
                <div style={{ marginTop: 12, fontSize: 10, color: C.mid }}>
                  Darboğaz: <b style={{ color: C.warn }}>{capacity.bottlenecks[0].code}</b> — {capacity.bottlenecks[0].reason ?? `maks ${fmtTR(capacity.bottlenecks[0].maxProducts)}`}
                </div>
              )}
            </>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

/* ─────────── Add/Edit Order Modal ─────────── */
function OrderModal({
  initial, onClose, onSave,
}: {
  initial?: Order | null;
  onClose: () => void;
  onSave: (o: Order) => void;
}) {
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [sku, setSku] = useState<string>(initial?.sku ?? ALL_SKUS[0]);
  const [quantity, setQuantity] = useState<string>(initial ? String(initial.quantity) : "100");
  const [deadline, setDeadline] = useState<string>(
    initial?.deadline ?? new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  );

  const submit = () => {
    const q = parseInt(quantity, 10);
    if (!sku || isNaN(q) || q <= 0) return;
    onSave({
      id: initial?.id ?? `o_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      customer: customer.trim() || "Bayi",
      sku, quantity: q, deadline,
      createdAt: initial?.createdAt ?? Date.now(),
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: "92vw", background: "#15151c",
        border: `1px solid ${C.panelEdge}`, borderRadius: 14, padding: 22,
        fontFamily: mono, color: C.ink,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, marginBottom: 4 }}>
          {initial ? "SİPARİŞİ DÜZENLE" : "YENİ SİPARİŞ"}
        </div>
        <div style={{ fontSize: 18, marginBottom: 14 }}>Strateji canvas'a bayi siparişi ekle</div>

        <label style={{ fontSize: 10, color: C.mid, letterSpacing: 1 }}>BAYİ / MÜŞTERİ</label>
        <input value={customer} onChange={e => setCustomer(e.target.value)}
          placeholder="Örn: Ankara Bayi"
          style={inpStyle} />

        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: C.mid, letterSpacing: 1 }}>MAMUL (SKU)</label>
            <select value={sku} onChange={e => setSku(e.target.value)} style={{ ...inpStyle, height: 38 }}>
              {ALL_SKUS.map(s => <option key={s} value={s} style={{ background: "#15151c" }}>{s}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label style={{ fontSize: 10, color: C.mid, letterSpacing: 1 }}>ADET</label>
            <input type="number" min={1} value={quantity}
              onChange={e => setQuantity(e.target.value)}
              style={inpStyle} />
          </div>
        </div>

        <label style={{ fontSize: 10, color: C.mid, letterSpacing: 1, marginTop: 12, display: "block" }}>SON TARİH</label>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inpStyle} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.mid,
            fontFamily: mono, fontSize: 12,
          }}>Vazgeç</button>
          <button onClick={submit} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: C.accent, border: "none", color: "#0a0a0e",
            fontFamily: mono, fontSize: 12, fontWeight: 700,
          }}>{initial ? "Güncelle" : "Ekle"}</button>
        </div>
      </div>
    </div>
  );
}
const inpStyle: React.CSSProperties = {
  width: "100%", marginTop: 6,
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.panelEdge}`,
  borderRadius: 8, padding: "9px 12px", color: C.ink,
  fontFamily: mono, fontSize: 13, outline: "none",
};

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ──────────────────────────────────────────────────────────────────── */
export default function StrategyCanvasPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [orders, setOrders] = useState<Order[]>(() => loadOrders());
  useEffect(() => { saveOrders(orders); }, [orders]);

  const [modalOpen, setModalOpen] = useState(orders.length === 0);
  const [editing, setEditing] = useState<Order | null>(null);

  /* Sipariş başına BOM stock + capacity sorguları (n SKU'ya kadar paralel) */
  const skuSet = useMemo(() => Array.from(new Set(orders.map(o => o.sku))), [orders]);
  const stockQueries = useQueries({
    queries: skuSet.map(sku => ({
      queryKey: [`/api/bom/${sku}/stock`],
      enabled: !!sku,
    })),
  });
  const capacityQueries = useQueries({
    queries: skuSet.map(sku => ({
      queryKey: [`/api/bom/${sku}/production-capacity`],
      enabled: !!sku,
    })),
  });
  const stockBySku = useMemo(() => {
    const m: Record<string, StockResp> = {};
    skuSet.forEach((sku, i) => {
      const d = stockQueries[i]?.data as StockResp | undefined;
      if (d) m[sku] = d;
    });
    return m;
  }, [skuSet, stockQueries.map(q => q.data).join("|")]);
  const capacityBySku = useMemo(() => {
    const m: Record<string, CapacityResp> = {};
    skuSet.forEach((sku, i) => {
      const d = capacityQueries[i]?.data as CapacityResp | undefined;
      if (d) m[sku] = d;
    });
    return m;
  }, [skuSet, capacityQueries.map(q => q.data).join("|")]);
  const anyLoading = stockQueries.some(q => q.isLoading) || capacityQueries.some(q => q.isLoading);

  /* WS — stok değişince ilgili tüm sorgular invalidate olsun */
  const handleStockUpdate = useCallback(() => {
    skuSet.forEach(sku => {
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    });
  }, [qc, skuSet]);
  const { connected } = useStockWebSocket(handleStockUpdate);

  /* Octopus chain otomatik tetik — sipariş ekle/düzenle/kaldır sonrası */
  const triggerOctopus = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orchestrator/run-audit", { source: "strategy_canvas" });
      return res.json();
    },
    // sessizce başarısız ol — endpoint yoksa veya yetkisizse strateji yine çalışsın
    onError: () => {},
  });

  const upsertOrder = (o: Order) => {
    setOrders(prev => {
      const idx = prev.findIndex(p => p.id === o.id);
      const next = idx >= 0 ? prev.map((p, i) => i === idx ? o : p) : [...prev, o];
      return next;
    });
    setModalOpen(false);
    setEditing(null);
    triggerOctopus.mutate();
  };
  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    triggerOctopus.mutate();
  };

  /* Canvas geometri */
  const ROW_HEIGHT = 540;
  const canvasH = Math.max(720, 200 + orders.length * ROW_HEIGHT);
  const canvasW = 1700;

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.ink,
      fontFamily: mono, fontFeatureSettings: "'cv11', 'ss01', 'cv02'",
    }}>
      <TopNav connected={connected} />

      {/* Header */}
      <div style={{ padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.panelEdge}` }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2 }}>◇ STRATEJİ CANVAS</div>
          <div style={{ fontSize: 18, marginTop: 2 }}>Sipariş → Mamul → BOM → Strateji · Canlı Domino</div>
          <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
            Bayi siparişi gir → fan-out otomatik · stok değişince yeniden hesapla · her hareket octopus-chain tetikler
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/ontology")} style={{
            padding: "9px 14px", borderRadius: 8, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.mid,
            fontFamily: mono, fontSize: 12,
          }}>← Ontoloji</button>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: C.accent, border: "none", color: "#0a0a0e",
            fontFamily: mono, fontSize: 12, fontWeight: 700,
          }}>+ Sipariş ekle</button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative", overflow: "auto", height: "calc(100vh - 132px)" }}>
        {orders.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", color: C.mid, gap: 12,
          }}>
            <div style={{ fontSize: 14 }}>Boş canvas — sipariş ekleyerek başla</div>
            <button onClick={() => { setEditing(null); setModalOpen(true); }} style={{
              padding: "10px 20px", borderRadius: 8, cursor: "pointer",
              background: C.accent, border: "none", color: "#0a0a0e",
              fontFamily: mono, fontSize: 13, fontWeight: 700,
            }}>+ İlk siparişi ekle</button>
          </div>
        ) : (
          <svg width={canvasW} height={canvasH} style={{ display: "block" }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={canvasW} height={canvasH} fill="url(#grid)" />
            {orders.map((o, i) => (
              <OrderBlock
                key={o.id}
                order={o}
                capacity={capacityBySku[o.sku]}
                stock={stockBySku[o.sku]}
                loading={anyLoading && !stockBySku[o.sku]}
                onRemove={() => removeOrder(o.id)}
                onEdit={() => { setEditing(o); setModalOpen(true); }}
                yOffset={i * ROW_HEIGHT}
              />
            ))}
          </svg>
        )}
      </div>

      {modalOpen && (
        <OrderModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={upsertOrder}
        />
      )}
    </div>
  );
}
