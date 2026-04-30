import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ════════════════════════════════════════════════════════════════════
   STRATEGY CANVAS — Freeform sipariş → BOM → strateji domino haritası
   Pan + zoom + per-node drag · Apple Freeform + Palantir Foundry mood
   ──────────────────────────────────────────────────────────────────── */

const C = {
  bg: "#f8fafc",
  panelBg: "rgba(10,10,15,0.92)",
  panelEdge: "rgba(255,255,255,0.10)",
  cardBg: "#0a0a0e",
  cardInk: "#ffffff",
  cardSub: "#9a9aa8",
  ink: "#0a0a0e",
  mid: "#5a6072",
  dim: "#94a3b8",
  edge: "rgba(15,23,42,0.55)",
  edgeFaint: "rgba(15,23,42,0.20)",
  shortfall: "#ef4444",
  shortfallSoft: "rgba(239,68,68,0.18)",
  ok: "#059669",
  warn: "#d97706",
  accent: "#7c3aed",
  accentSoft: "rgba(124,58,237,0.10)",
} as const;
const mono = "'Inter', system-ui, -apple-system, sans-serif";
const INTER_FEATS = "'cv11', 'ss01', 'cv02'";
const fmtTR = (n: number) => (isFinite(n) ? n.toLocaleString("tr-TR") : "—");
const MONTH_LABELS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

const ALL_SKUS = [
  "ELT.7-11", "ELT.5-7",
  "GSS20P", "GSS40P",
  "GSA15", "GSA20", "GSA30",
  "BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV",
] as const;

interface Order {
  id: string;
  customer: string;
  deadline: string;
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
}
interface StockResp {
  product: string;
  components: BomComponent[];
}

type XY = { x: number; y: number };
type PositionOverrides = Record<string, Record<string, XY>>; // orderId → nodeId → XY

const ORDERS_KEY = "griseus_strategy_orders_v1";
const POS_KEY = "griseus_strategy_positions_v2";
const VIEW_KEY = "griseus_strategy_viewport_v1";

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

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

/* ─────── DragLayer geometri ─────── */
const ORDER_W = 260, ORDER_H = 100;
const PRODUCT_W = 200, PRODUCT_H = 80;
const COMP_W = 210, COMP_H = 40;
const SUB_R = 30;
const PANEL_W = 400, PANEL_H = 420;

function defaultPositions(order: Order, components: BomComponent[], yOffset: number): Record<string, XY> {
  const CENTER_Y = 320 + yOffset;
  const ORDER_X = 80;
  const PRODUCT_X = 420;
  const SUB_X = 740;
  const COMP_X = 1020;
  const PANEL_X = 1280;

  const top = components.filter(c => c.parentComponentCode === null);
  const subs = top.filter(c => c.isSubAssembly || c.hasChildren);
  const flats = top.filter(c => !(c.isSubAssembly || c.hasChildren));

  const flatGap = Math.max(46, Math.min(56, 1100 / Math.max(1, flats.length)));
  const flatStartY = CENTER_Y - ((flats.length - 1) * flatGap) / 2;
  const subGap = 70;
  const subStartY = CENTER_Y - ((subs.length - 1) * subGap) / 2;

  const pos: Record<string, XY> = {
    [`order:${order.id}`]: { x: ORDER_X, y: CENTER_Y - ORDER_H / 2 },
    [`product:${order.id}`]: { x: PRODUCT_X, y: CENTER_Y - PRODUCT_H / 2 },
    [`panel:${order.id}`]: { x: PANEL_X, y: CENTER_Y - PANEL_H / 2 },
  };
  flats.forEach((c, i) => {
    pos[`comp:${order.id}:${c.code}`] = { x: COMP_X, y: flatStartY + i * flatGap - COMP_H / 2 };
  });
  subs.forEach((c, i) => {
    pos[`sub:${order.id}:${c.code}`] = { x: SUB_X, y: subStartY + i * subGap - SUB_R };
  });
  return pos;
}

/* ─────── Sürüklenebilir kart (HTML foreignObject + onPointerDown) ─────── */
interface DragCardProps {
  nodeId: string;
  pos: XY;
  width: number;
  height: number;
  onDrag: (xy: XY) => void;
  children: React.ReactNode;
  setSvgPoint: (e: React.PointerEvent) => XY;
}
function DragNode({ nodeId, pos, width, height, onDrag, children, setSvgPoint }: DragCardProps) {
  const offsetRef = useRef<XY>({ x: 0, y: 0 });
  const handleDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = setSvgPoint(e);
    offsetRef.current = { x: p.x - pos.x, y: p.y - pos.y };
  };
  const handleMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    const p = setSvgPoint(e);
    onDrag({ x: p.x - offsetRef.current.x, y: p.y - offsetRef.current.y });
  };
  const handleUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  return (
    <foreignObject x={pos.x} y={pos.y} width={width} height={height} style={{ overflow: "visible" }}>
      <div
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        style={{ width, height, cursor: "grab", touchAction: "none", userSelect: "none" }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

/* ─────── Sipariş bloğu — fan-out + strateji panel ─────── */
function OrderBlock({
  order, capacity, stock, loading,
  positions, defaults, onMove,
  onRemove, onEdit,
  setSvgPoint,
}: {
  order: Order;
  capacity?: CapacityResp;
  stock?: StockResp;
  loading: boolean;
  positions: Record<string, XY>;
  defaults: Record<string, XY>;
  onMove: (nodeId: string, xy: XY) => void;
  onRemove: () => void;
  onEdit: () => void;
  setSvgPoint: (e: React.PointerEvent) => XY;
}) {
  const top = useMemo(() => (stock?.components ?? []).filter(c => c.parentComponentCode === null), [stock]);
  const enriched = useMemo(() => top.map(c => {
    const needed = order.quantity * c.requiredPerUnit;
    const shortfall = Math.max(0, Math.ceil(needed - c.currentStock));
    return { ...c, needed, shortfall };
  }), [top, order.quantity]);
  const subs = useMemo(() => enriched.filter(c => c.isSubAssembly || c.hasChildren), [enriched]);
  const flats = useMemo(() => enriched.filter(c => !(c.isSubAssembly || c.hasChildren)), [enriched]);

  const get = (id: string): XY => positions[id] ?? defaults[id] ?? { x: 0, y: 0 };
  const orderP = get(`order:${order.id}`);
  const productP = get(`product:${order.id}`);
  const panelP = get(`panel:${order.id}`);

  const orderC = { x: orderP.x + ORDER_W, y: orderP.y + ORDER_H / 2 };
  const productC = { x: productP.x + PRODUCT_W / 2, y: productP.y + PRODUCT_H / 2 };
  const productOut = { x: productP.x + PRODUCT_W, y: productP.y + PRODUCT_H / 2 };

  const maxProd = capacity?.maxProducible ?? 0;
  const possible = Math.min(order.quantity, maxProd);
  const missing = Math.max(0, order.quantity - maxProd);

  const procurement = useMemo(() =>
    enriched.filter(c => c.shortfall > 0).sort((a, b) => b.shortfall - a.shortfall).slice(0, 8),
    [enriched]);

  const today = new Date();
  const deadline = order.deadline ? new Date(order.deadline) : new Date(Date.now() + 90 * 86400000);
  const months = useMemo(() => monthSlots(today, deadline), [order.deadline]);
  const totalSpan = Math.max(1, deadline.getTime() - today.getTime());
  const TIMELINE_W = 360;
  const tToX = (t: number) => Math.max(0, Math.min(TIMELINE_W, ((t - today.getTime()) / totalSpan) * TIMELINE_W));

  return (
    <g>
      {/* Sipariş → Mamul edge */}
      <line x1={orderC.x} y1={orderC.y} x2={productP.x} y2={productC.y}
        stroke={C.edge} strokeWidth={1.5} strokeDasharray="5 5" />

      {/* Mamul → BOM ana hat */}
      {(flats.length > 0 || subs.length > 0) && (
        <line x1={productOut.x} y1={productC.y} x2={productOut.x + 140} y2={productC.y}
          stroke={C.edge} strokeWidth={1.5} strokeDasharray="5 5" />
      )}

      {/* Yarımamül edge'leri */}
      {subs.map(c => {
        const sp = get(`sub:${order.id}:${c.code}`);
        const sc = { x: sp.x + SUB_R, y: sp.y + SUB_R };
        const start = { x: productOut.x + 140, y: productC.y };
        const cpx = (start.x + sc.x) / 2;
        const path = `M ${start.x} ${start.y} C ${cpx} ${start.y}, ${cpx} ${sc.y}, ${sc.x - SUB_R} ${sc.y}`;
        const isShort = c.shortfall > 0;
        return (
          <path key={`se:${c.code}`} d={path}
            stroke={isShort ? C.shortfall : C.edge}
            strokeWidth={isShort ? 1.7 : 1.3}
            strokeDasharray={isShort ? "5 5" : "4 5"} fill="none" />
        );
      })}

      {/* Flat bileşen edge'leri */}
      {flats.map(c => {
        const cp = get(`comp:${order.id}:${c.code}`);
        const cc = { x: cp.x, y: cp.y + COMP_H / 2 };
        const start = { x: productOut.x + 140, y: productC.y };
        const cpx = (start.x + cc.x) / 2;
        const path = `M ${start.x} ${start.y} C ${cpx} ${start.y}, ${cpx} ${cc.y}, ${cc.x} ${cc.y}`;
        const isShort = c.shortfall > 0;
        return (
          <path key={`fe:${c.code}`} d={path}
            stroke={isShort ? C.shortfall : C.edge}
            strokeWidth={isShort ? 1.7 : 1.2}
            strokeDasharray={isShort ? "5 5" : "3 5"} fill="none" />
        );
      })}

      {/* x quantity */}
      <text x={productOut.x + 60} y={productC.y - 14} fontSize={11} fill={C.mid} fontStyle="italic" fontFamily={mono}>
        × {fmtTR(order.quantity)}
      </text>

      {/* Sipariş kartı */}
      <DragNode nodeId={`order:${order.id}`} pos={orderP} width={ORDER_W} height={ORDER_H}
        onDrag={(xy) => onMove(`order:${order.id}`, xy)} setSvgPoint={setSvgPoint}>
        <div style={{
          width: "100%", height: "100%",
          background: C.cardBg, color: C.cardInk, borderRadius: 14, padding: 14,
          boxShadow: "0 6px 22px rgba(0,0,0,0.35)", fontFamily: mono,
          display: "flex", flexDirection: "column", gap: 4, boxSizing: "border-box",
        }}>
          <div style={{ fontSize: 9, color: C.cardSub, letterSpacing: 1.6, fontWeight: 600 }}>SİPARİŞ</div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{order.customer || "Bayi"}</div>
          <div style={{ fontSize: 11, color: C.cardSub }}>
            <b>{order.deadline ? new Date(order.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b> son tarih
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onEdit} style={btnGhost}>düzenle</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} style={btnGhost}>kaldır</button>
          </div>
        </div>
      </DragNode>

      {/* Mamul kartı */}
      <DragNode nodeId={`product:${order.id}`} pos={productP} width={PRODUCT_W} height={PRODUCT_H}
        onDrag={(xy) => onMove(`product:${order.id}`, xy)} setSvgPoint={setSvgPoint}>
        <div style={{
          width: "100%", height: "100%",
          background: C.cardBg, color: C.cardInk, borderRadius: 12, padding: 12,
          boxShadow: "0 5px 20px rgba(0,0,0,0.32)", fontFamily: mono, boxSizing: "border-box",
        }}>
          <div style={{ fontSize: 9, color: C.cardSub, letterSpacing: 1.6, fontWeight: 600 }}>MAMUL</div>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>{fmtTR(order.quantity)} adet</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.cardSub, marginTop: 1 }}>{order.sku}</div>
        </div>
      </DragNode>

      {/* Yarımamül daireleri */}
      {subs.map(c => {
        const sp = get(`sub:${order.id}:${c.code}`);
        const isShort = c.shortfall > 0;
        return (
          <DragNode key={`sub:${c.code}`} nodeId={`sub:${order.id}:${c.code}`}
            pos={sp} width={SUB_R * 2} height={SUB_R * 2}
            onDrag={(xy) => onMove(`sub:${order.id}:${c.code}`, xy)} setSvgPoint={setSvgPoint}>
            <div title={c.name} style={{
              width: SUB_R * 2, height: SUB_R * 2, borderRadius: "50%",
              background: C.cardBg, color: C.cardInk,
              border: isShort ? `2px solid ${C.shortfall}` : `1.5px solid ${C.cardSub}33`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: "0 5px 18px rgba(0,0,0,0.35)", fontFamily: mono,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700 }}>{c.code.length > 9 ? c.code.slice(0, 8) + "…" : c.code}</div>
              <div style={{ fontSize: 7, color: C.cardSub, marginTop: 1 }}>{fmtTR(c.currentStock)} ad</div>
              {isShort && <div style={{ fontSize: 7, color: C.shortfall, marginTop: 1, fontWeight: 700 }}>−{fmtTR(c.shortfall)}</div>}
            </div>
          </DragNode>
        );
      })}

      {/* Flat bileşen kartları */}
      {flats.map(c => {
        const cp = get(`comp:${order.id}:${c.code}`);
        const isShort = c.shortfall > 0;
        return (
          <DragNode key={`comp:${c.code}`} nodeId={`comp:${order.id}:${c.code}`}
            pos={cp} width={COMP_W} height={COMP_H}
            onDrag={(xy) => onMove(`comp:${order.id}:${c.code}`, xy)} setSvgPoint={setSvgPoint}>
            <div title={c.name} style={{
              width: "100%", height: "100%", boxSizing: "border-box",
              background: C.cardBg, color: C.cardInk, borderRadius: 8,
              padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 3px 12px rgba(0,0,0,0.30)", fontFamily: mono,
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
                  background: "rgba(239,68,68,0.18)", color: C.shortfall,
                  fontSize: 9, padding: "3px 6px", borderRadius: 5, fontWeight: 700, whiteSpace: "nowrap",
                }}>−{fmtTR(c.shortfall)}</div>
              )}
            </div>
          </DragNode>
        );
      })}

      {/* Strateji paneli — sürüklenebilir */}
      <DragNode nodeId={`panel:${order.id}`} pos={panelP} width={PANEL_W} height={PANEL_H}
        onDrag={(xy) => onMove(`panel:${order.id}`, xy)} setSvgPoint={setSvgPoint}>
        <div style={{
          width: "100%", height: "100%", boxSizing: "border-box",
          background: C.panelBg, border: `1px solid ${C.panelEdge}`, borderRadius: 14,
          padding: 16, fontFamily: mono, color: C.cardInk,
          boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
          overflow: "auto",
        }}>
          {/* Timeline */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              {months.map(m => (
                <div key={m.t} style={{ fontSize: 10, color: C.cardSub, letterSpacing: 0.5 }}>{m.label}</div>
              ))}
            </div>
            <div style={{ position: "relative", height: 32, background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
              <div style={{
                position: "absolute", left: 0, top: 6, height: 8,
                width: tToX(today.getTime() + totalSpan * 0.9),
                background: C.cardInk, borderRadius: 4,
              }} />
              <div style={{ position: "absolute", left: 4, top: -2, fontSize: 9, color: C.cardInk, fontWeight: 700 }}>
                {fmtTR(possible)} adet üret
              </div>
              <div style={{
                position: "absolute", left: 0, top: 22, height: 4,
                width: tToX(today.getTime() + totalSpan * 0.25),
                background: C.cardSub, borderRadius: 2,
              }} />
              <div style={{ position: "absolute", left: 4, top: 16, fontSize: 8, color: C.cardSub }}>Tedarik süresi</div>
            </div>
          </div>

          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.6, fontWeight: 600, marginBottom: 4 }}>STRATEJİ</div>
          {loading ? (
            <div style={{ fontSize: 12, color: C.cardSub }}>Hesaplanıyor…</div>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
                <b>Maks {fmtTR(maxProd)} adet</b> üretilebilir
                {missing > 0
                  ? <span style={{ color: C.shortfall }}> · {fmtTR(missing)} eksik</span>
                  : <span style={{ color: C.ok }}> · talep karşılanıyor</span>}
              </div>
              {procurement.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: C.cardSub, marginBottom: 6, fontWeight: 600, letterSpacing: 0.4 }}>
                    Tedarik et:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {procurement.map(p => (
                      <div key={p.code} style={{
                        display: "flex", justifyContent: "space-between", gap: 8,
                        fontSize: 12, padding: "4px 8px",
                        background: "rgba(239,68,68,0.18)", borderRadius: 6,
                      }}>
                        <span style={{ color: C.cardInk, fontWeight: 600 }}>{fmtTR(p.shortfall)} adet</span>
                        <span style={{ color: C.cardSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "right" }}>
                          {p.code}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {capacity?.bottlenecks && capacity.bottlenecks.length > 0 && missing > 0 && (
                <div style={{ marginTop: 12, fontSize: 10, color: C.cardSub }}>
                  Darboğaz: <b style={{ color: C.warn }}>{capacity.bottlenecks[0].code}</b> — {capacity.bottlenecks[0].reason ?? `maks ${fmtTR(capacity.bottlenecks[0].maxProducts)}`}
                </div>
              )}
            </>
          )}
        </div>
      </DragNode>
    </g>
  );
}

const btnGhost: React.CSSProperties = {
  background: "transparent", border: `1px solid ${C.cardSub}40`, borderRadius: 6,
  padding: "2px 8px", fontSize: 10, color: C.cardSub, cursor: "pointer", fontFamily: mono,
};

/* ─────── Order modal ─────── */
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
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: "92vw", background: C.cardBg,
        border: `1px solid ${C.panelEdge}`, borderRadius: 14, padding: 22,
        fontFamily: mono, color: C.cardInk,
        boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, marginBottom: 4 }}>
          {initial ? "SİPARİŞİ DÜZENLE" : "YENİ SİPARİŞ"}
        </div>
        <div style={{ fontSize: 18, marginBottom: 14 }}>Strateji canvas'a bayi siparişi ekle</div>
        <label style={lbl}>BAYİ / MÜŞTERİ</label>
        <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Örn: Ankara Bayi" style={inp} />
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>MAMUL (SKU)</label>
            <select value={sku} onChange={e => setSku(e.target.value)} style={{ ...inp, height: 38 }}>
              {ALL_SKUS.map(s => <option key={s} value={s} style={{ background: C.cardBg }}>{s}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label style={lbl}>ADET</label>
            <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} style={inp} />
          </div>
        </div>
        <label style={{ ...lbl, marginTop: 12, display: "block" }}>SON TARİH</label>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.cardSub,
            fontFamily: mono, fontSize: 12,
          }}>Vazgeç</button>
          <button onClick={submit} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: C.accent, border: "none", color: "#ffffff",
            fontFamily: mono, fontSize: 12, fontWeight: 700,
          }}>{initial ? "Güncelle" : "Ekle"}</button>
        </div>
      </div>
    </div>
  );
}
const lbl: React.CSSProperties = { fontSize: 10, color: C.cardSub, letterSpacing: 1 };
const inp: React.CSSProperties = {
  width: "100%", marginTop: 6,
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.panelEdge}`,
  borderRadius: 8, padding: "9px 12px", color: C.cardInk,
  fontFamily: mono, fontSize: 13, outline: "none",
};

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ──────────────────────────────────────────────────────────────────── */
export default function StrategyCanvasPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [orders, setOrders] = useState<Order[]>(() => safeParse<Order[]>(localStorage.getItem(ORDERS_KEY), []));
  useEffect(() => { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }, [orders]);

  const [posOverrides, setPosOverrides] = useState<PositionOverrides>(
    () => safeParse<PositionOverrides>(localStorage.getItem(POS_KEY), {}),
  );
  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(posOverrides)); }, [posOverrides]);

  const [modalOpen, setModalOpen] = useState(orders.length === 0);
  const [editing, setEditing] = useState<Order | null>(null);

  /* Pan + zoom state */
  const initialView = safeParse<{ vx: number; vy: number; scale: number }>(localStorage.getItem(VIEW_KEY), { vx: 0, vy: 0, scale: 1 });
  const [viewport, setViewport] = useState(initialView);
  useEffect(() => { localStorage.setItem(VIEW_KEY, JSON.stringify(viewport)); }, [viewport]);

  /* Sipariş başına BOM stock + capacity sorguları */
  const skuSet = useMemo(() => Array.from(new Set(orders.map(o => o.sku))), [orders]);
  const stockQueries = useQueries({
    queries: skuSet.map(sku => ({ queryKey: [`/api/bom/${sku}/stock`], enabled: !!sku })),
  });
  const capacityQueries = useQueries({
    queries: skuSet.map(sku => ({ queryKey: [`/api/bom/${sku}/production-capacity`], enabled: !!sku })),
  });
  const stockBySku = useMemo(() => {
    const m: Record<string, StockResp> = {};
    skuSet.forEach((sku, i) => { const d = stockQueries[i]?.data as StockResp | undefined; if (d) m[sku] = d; });
    return m;
  }, [skuSet, stockQueries.map(q => q.data).join("|")]);
  const capacityBySku = useMemo(() => {
    const m: Record<string, CapacityResp> = {};
    skuSet.forEach((sku, i) => { const d = capacityQueries[i]?.data as CapacityResp | undefined; if (d) m[sku] = d; });
    return m;
  }, [skuSet, capacityQueries.map(q => q.data).join("|")]);
  const anyLoading = stockQueries.some(q => q.isLoading) || capacityQueries.some(q => q.isLoading);

  /* WS canlı invalidation */
  const handleStockUpdate = useCallback(() => {
    skuSet.forEach(sku => {
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    });
  }, [qc, skuSet]);
  const { connected } = useStockWebSocket(handleStockUpdate);

  /* Octopus auto-trigger */
  const triggerOctopus = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orchestrator/run-audit", { source: "strategy_canvas" });
      return res.json();
    },
    onError: () => {},
  });

  const upsertOrder = (o: Order) => {
    setOrders(prev => {
      const idx = prev.findIndex(p => p.id === o.id);
      return idx >= 0 ? prev.map((p, i) => i === idx ? o : p) : [...prev, o];
    });
    setModalOpen(false); setEditing(null);
    triggerOctopus.mutate();
  };
  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    setPosOverrides(prev => {
      const next = { ...prev }; delete next[id]; return next;
    });
    triggerOctopus.mutate();
  };

  const moveNode = useCallback((orderId: string, nodeId: string, xy: XY) => {
    setPosOverrides(prev => ({
      ...prev,
      [orderId]: { ...(prev[orderId] ?? {}), [nodeId]: xy },
    }));
  }, []);
  const resetLayout = (orderId?: string) => {
    if (!orderId) {
      setPosOverrides({});
    } else {
      setPosOverrides(prev => { const next = { ...prev }; delete next[orderId]; return next; });
    }
  };

  /* Defaults — her sipariş için (yOffset ile dikey istif) */
  const ROW_HEIGHT = 720;
  const allDefaults = useMemo(() => {
    const all: Record<string, Record<string, XY>> = {};
    orders.forEach((o, i) => {
      const stock = stockBySku[o.sku];
      all[o.id] = defaultPositions(o, stock?.components ?? [], i * ROW_HEIGHT);
    });
    return all;
  }, [orders, stockBySku]);

  /* SVG koordinat dönüştürme — pan/zoom altında */
  const svgRef = useRef<SVGSVGElement>(null);
  const setSvgPoint = useCallback((e: React.PointerEvent): XY => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.vx) / viewport.scale;
    const y = (e.clientY - rect.top - viewport.vy) / viewport.scale;
    return { x, y };
  }, [viewport]);

  /* Background pan */
  const panRef = useRef<{ startX: number; startY: number; vx0: number; vy0: number } | null>(null);
  const handleBgDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== "rect") return;
    panRef.current = { startX: e.clientX, startY: e.clientY, vx0: viewport.vx, vy0: viewport.vy };
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
  };
  const handleBgMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    setViewport(v => ({ ...v, vx: panRef.current!.vx0 + dx, vy: panRef.current!.vy0 + dy }));
  };
  const handleBgUp = (e: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = null;
    (e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId);
  };

  /* Wheel: shift/ctrl/cmd → zoom; default → pan */
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setViewport(v => {
        const newScale = Math.max(0.2, Math.min(2.5, v.scale * factor));
        // Zoom around cursor
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return { ...v, scale: newScale };
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const k = newScale / v.scale;
        return {
          vx: cx - k * (cx - v.vx),
          vy: cy - k * (cy - v.vy),
          scale: newScale,
        };
      });
    } else {
      setViewport(v => ({ ...v, vx: v.vx - e.deltaX, vy: v.vy - e.deltaY }));
    }
  };

  const zoomBy = (factor: number) => setViewport(v => ({ ...v, scale: Math.max(0.2, Math.min(2.5, v.scale * factor)) }));
  const fitToView = () => setViewport({ vx: 0, vy: 0, scale: 1 });

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.ink,
      fontFamily: mono, fontFeatureSettings: INTER_FEATS,
      // @ts-ignore
      WebkitFontSmoothing: "antialiased", overflow: "hidden",
    }}>
      <TopNav connected={connected} />

      {/* Header */}
      <div style={{ padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.edgeFaint}` }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2 }}>◇ STRATEJİ CANVAS</div>
          <div style={{ fontSize: 18, marginTop: 2, color: C.ink }}>Sipariş → Mamul → BOM → Strateji · Canlı Domino</div>
          <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
            Bayi siparişi ekle → fan-out otomatik · kart sürükle-bırak · scroll/Shift+wheel = pan/zoom · stok değişince yeniden hesapla
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/ontology")} style={hdrBtnGhost}>← Ontoloji</button>
          <button onClick={() => zoomBy(1.2)} style={hdrBtnGhost} title="Yakınlaştır">+</button>
          <button onClick={() => zoomBy(0.83)} style={hdrBtnGhost} title="Uzaklaştır">−</button>
          <button onClick={fitToView} style={hdrBtnGhost} title="Sıfırla">⊡</button>
          <button onClick={() => resetLayout()} style={hdrBtnGhost} title="Yerleşimi sıfırla">⟲ layout</button>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} style={hdrBtnAccent}>+ Sipariş ekle</button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative", height: "calc(100vh - 132px)" }}>
        {orders.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", color: C.mid, gap: 12,
          }}>
            <div style={{ fontSize: 14 }}>Boş canvas — sipariş ekleyerek başla</div>
            <button onClick={() => { setEditing(null); setModalOpen(true); }} style={hdrBtnAccent}>+ İlk siparişi ekle</button>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%" height="100%"
            onPointerDown={handleBgDown}
            onPointerMove={handleBgMove}
            onPointerUp={handleBgUp}
            onWheel={handleWheel}
            style={{ display: "block", cursor: panRef.current ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"
                patternTransform={`translate(${viewport.vx} ${viewport.vy}) scale(${viewport.scale})`}>
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(15,23,42,0.05)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <g transform={`translate(${viewport.vx} ${viewport.vy}) scale(${viewport.scale})`}>
              {orders.map(o => (
                <OrderBlock
                  key={o.id}
                  order={o}
                  capacity={capacityBySku[o.sku]}
                  stock={stockBySku[o.sku]}
                  loading={anyLoading && !stockBySku[o.sku]}
                  positions={posOverrides[o.id] ?? {}}
                  defaults={allDefaults[o.id] ?? {}}
                  onMove={(nodeId, xy) => moveNode(o.id, nodeId, xy)}
                  onRemove={() => removeOrder(o.id)}
                  onEdit={() => { setEditing(o); setModalOpen(true); }}
                  setSvgPoint={setSvgPoint}
                />
              ))}
            </g>
          </svg>
        )}

        {/* Mini hint */}
        <div style={{
          position: "absolute", bottom: 14, left: 14,
          background: "rgba(15,23,42,0.75)", color: C.cardInk,
          padding: "6px 10px", borderRadius: 6, fontSize: 10, fontFamily: mono,
          letterSpacing: 0.4, pointerEvents: "none",
        }}>
          sürükle = pan · Shift+wheel = zoom · kart tut = taşı · ölçek {viewport.scale.toFixed(2)}×
        </div>
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

const hdrBtnGhost: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 8, cursor: "pointer",
  background: "transparent", border: `1px solid ${C.edgeFaint}`, color: C.mid,
  fontFamily: mono, fontSize: 12,
};
const hdrBtnAccent: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
  background: C.accent, border: "none", color: "#ffffff",
  fontFamily: mono, fontSize: 12, fontWeight: 700,
};
