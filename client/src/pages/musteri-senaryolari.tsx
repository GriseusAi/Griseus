/**
 * Müşteri Senaryoları — kullanıcının tasarladığı senaryonun birebir
 * görselleştirilmiş canlı kopyası. Koyu mod, free-form pan/zoom canvas,
 * default değerlerle açılır.
 *
 * Akış: Customers → Elektrikli/Gazlı → Cihaz kartları (a, b shared) →
 *       Üretim/Depo/Satış → Fabrika · sağda tedarik denklemi · alt-orta
 *       flask · alt panel S1 vs S2 Gantt.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import { apiRequest } from "@/lib/queryClient";
import { ReactionGantt } from "@/components/reaction-gantt";
import type { ReactionResult } from "@/components/reaction-flask";

/* ──────────────────────────────────────────────────────────────────
   PALET — kullanıcının resmindeki dark mode birebir
   ────────────────────────────────────────────────────────────────── */
const D = {
  bg: "#0a0a0e",
  bgAlt: "#0e0e14",
  panel: "#15151c",
  edge: "rgba(255,255,255,0.16)",
  edgeFaint: "rgba(255,255,255,0.08)",
  edgeBold: "rgba(255,255,255,0.5)",
  ink: "#ffffff",
  inkSub: "#9a9aa8",
  green: "#3f8f5b",
  greenSoft: "rgba(63,143,91,0.22)",
  blue: "#3d6fb0",
  blueSoft: "rgba(61,111,176,0.22)",
  red: "#dc2626",
  redSoft: "rgba(220,38,38,0.32)",
  amber: "#f59e0b",
} as const;

const FONT = "'Inter', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/* ──────────────────────────────────────────────────────────────────
   SENARYO VERİSİ — resimle birebir
   ────────────────────────────────────────────────────────────────── */
const SCENARIO = {
  startDate: "2026-05-01",
  customers: [
    { id: "En", label: "En" },
    { id: "E3", label: "E3", highlighted: "green" as const },
    { id: "E2", label: "E2" },
    { id: "E1", label: "E1" },
    { id: "G1", label: "G1" },
    { id: "G2", label: "G2", highlighted: "blue" as const },
    { id: "G3", label: "G3" },
    { id: "Gn", label: "Gn" },
  ],
  orders: [
    { customer: "E3", sku: "GSA15", qty: 200, deadline: "2026-06-01", net: 100 },
    { customer: "G2", sku: "GSS20P", qty: 50, deadline: "2026-05-15", net: 50 },
  ],
  products: [
    { sku: "Z-elek", category: "Elektrikli", muted: true },
    { sku: "GSA15", category: "Elektrikli", highlight: "green" as const, sharedComps: ["a", "b"], leadDays: 30 },
    { sku: "T-elek", category: "Elektrikli", muted: true },
    { sku: "X-gazlı", category: "Gazlı", muted: true },
    { sku: "Y-gazlı", category: "Gazlı", muted: true },
    { sku: "GSS20P", category: "Gazlı", highlight: "blue" as const, sharedComps: ["a", "b"], leadDays: 10 },
  ],
  supply: [
    { code: "a", qty: 300, leadDays: 15 },
    { code: "b", qty: 180, leadDays: 12 },
  ],
  // Production rates (gün/birim) — picture: GSA15 100×30g=0.3, GSS20P 50×10g=0.2
  productionRates: {
    GSA15: 0.3,
    GSS20P: 0.2,
  } as Record<string, number>,
  // Stoklar — picture: a=110, b=120; depo GSA15=50
  componentStock: { a: 110, b: 120 },
  warehouseStock: { GSA15: 50, GSS20P: 0 },
};

/* ──────────────────────────────────────────────────────────────────
   GEOMETRY — picture'a göre default koordinatlar (world space)
   ────────────────────────────────────────────────────────────────── */
const G = {
  // Customers panel
  custBoxX: 60, custBoxY: 80, custBoxW: 320, custBoxH: 660,
  custLabelX: 100, custLabelY: 380, custLabelW: 130, custLabelH: 40,
  custChipX: 180, custChipFirstY: 110, custChipW: 90, custChipH: 36, custChipGap: 70,
  // Categories
  catEleX: 540, catEleY: 240, catGazX: 540, catGazY: 540, catR: 70,
  // Products
  prodX: 760, prodFirstY: 170, prodW: 180, prodH: 56, prodGap: 88,
  // Production circles
  flowX: 1100, flowUretY: 240, flowDepoY: 420, flowSatY: 600, flowR: 60,
  // Factory
  factX: 1330, factY: 360, factW: 140, factH: 110,
  // Lead-time pills
  leadGsaX: 1100, leadGsaY: 130,    // 30 gün green
  leadGssX: 1100, leadGssY: 720,   // 10 gün blue
  // Supply equation (right)
  supplyX: 1530, supplyY: 470, supplyW: 380, supplyH: 220,
  // Flask + S1/S2
  flaskX: 760, flaskY: 880, flaskW: 280, flaskH: 200,
  s1X: 60, s1Y: 1140,
  s2X: 1000, s2Y: 1140,
};

/* ══════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function MusteriSenaryolariPage() {
  const [, navigate] = useLocation();
  const [result, setResult] = useState<ReactionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Free-form pan/zoom
  const wrapRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ vx: 0, vy: 0, scale: 0.62 });
  const panRef = useRef<{ sx: number; sy: number; vx0: number; vy0: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const onBgDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, vx0: vp.vx, vy0: vp.vy };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setPanning(true);
  };
  const onBgMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    setVp((v) => ({
      ...v,
      vx: panRef.current!.vx0 + (e.clientX - panRef.current!.sx),
      vy: panRef.current!.vy0 + (e.clientY - panRef.current!.sy),
    }));
  };
  const onBgUp = (e: React.PointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setPanning(false);
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setVp((v) => {
        const ns = Math.max(0.25, Math.min(2.5, v.scale * factor));
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return { ...v, scale: ns };
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const k = ns / v.scale;
        return { vx: cx - k * (cx - v.vx), vy: cy - k * (cy - v.vy), scale: ns };
      });
    } else {
      setVp((v) => ({ ...v, vx: v.vx - e.deltaX, vy: v.vy - e.deltaY }));
    }
  };

  // Auto-fit on first mount
  const fitOnceRef = useRef(false);
  useEffect(() => {
    if (fitOnceRef.current) return;
    fitOnceRef.current = true;
    setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const worldW = G.s2X + 800;
      const worldH = G.s2Y + 500;
      const scale = Math.min(rect.width / worldW, rect.height / worldH) * 0.92;
      setVp({ vx: 20, vy: 20, scale: Math.max(0.32, Math.min(0.85, scale)) });
    }, 30);
  }, []);

  // Auto-call scheduler with picture's exact values on mount
  const runReaction = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiRequest("POST", "/api/strategy/reaction-equation", {
        startDate: SCENARIO.startDate,
        devices: SCENARIO.orders.map((o) => ({
          sku: o.sku,
          qty: o.net,
          deadline: o.deadline,
          color: o.sku === "GSA15" ? D.green : D.blue,
          productionDaysPerUnit: SCENARIO.productionRates[o.sku],
        })),
        supplyOrders: SCENARIO.supply.map((s) => ({
          componentCode: s.code,
          qty: s.qty,
          leadDays: s.leadDays,
        })),
        contextOverride: {
          devices: SCENARIO.orders.map((o) => ({
            sku: o.sku,
            inWarehouse: SCENARIO.warehouseStock[o.sku as keyof typeof SCENARIO.warehouseStock] ?? 0,
            bom: [
              { code: "a", requiredPerUnit: 1, tier: 1, parentCode: null },
              { code: "b", requiredPerUnit: 1, tier: 1, parentCode: null },
            ],
          })),
          components: [
            { code: "a", currentStock: SCENARIO.componentStock.a },
            { code: "b", currentStock: SCENARIO.componentStock.b },
          ],
        },
      });
      const data = (await res.json()) as ReactionResult;
      setResult(data);
    } catch (e: any) {
      setErr(e?.message || "Tepkime hesaplanamadı");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { runReaction(); }, [runReaction]);

  return (
    <div style={{ minHeight: "100vh", background: D.bg, color: D.ink, fontFamily: FONT, overflow: "hidden" }}>
      <TopNav />

      {/* Header bar */}
      <div style={{
        padding: "16px 28px", display: "flex", justifyContent: "space-between",
        alignItems: "center", borderBottom: `1px solid ${D.edgeFaint}`,
      }}>
        <div>
          <div style={{ fontSize: 9, color: D.amber, letterSpacing: 2, fontFamily: MONO }}>◇ MÜŞTERI SENARYOLARI</div>
          <div style={{ fontSize: 18, marginTop: 2 }}>E3 ×200 GSA15 (1 Haz) · G2 ×50 GSS20P (15 May) · paylaşılan a, b</div>
          <div style={{ fontSize: 11, color: D.inkSub, marginTop: 2 }}>
            Naif (S1) sıralı planda G2 8g geç · AI (S2) paralelle ikisi de zamanında
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/ontology/strategy")} style={btnGhost}>← Strateji Canvas</button>
          <button onClick={runReaction} disabled={busy} style={btnAccent}>
            {busy ? "hesaplıyor…" : "🧪 Tekrar hesapla"}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        onPointerDown={onBgDown}
        onPointerMove={onBgMove}
        onPointerUp={onBgUp}
        onWheel={onWheel}
        style={{
          position: "relative",
          height: result ? "calc(100vh - 580px)" : "calc(100vh - 132px)",
          minHeight: 480,
          overflow: "hidden",
          background: D.bg,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)`,
          backgroundSize: `${40 * vp.scale}px ${40 * vp.scale}px`,
          backgroundPosition: `${vp.vx}px ${vp.vy}px`,
          cursor: panning ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute", left: 0, top: 0,
            transformOrigin: "0 0",
            transform: `translate(${vp.vx}px, ${vp.vy}px) scale(${vp.scale})`,
            pointerEvents: "none",
          }}
        >
          <ScenarioStage result={result} />
        </div>

        {err && (
          <div style={{
            position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
            padding: "8px 14px", background: D.redSoft, border: `1px solid ${D.red}`,
            borderRadius: 8, fontSize: 12, color: D.red,
          }}>
            {err}
          </div>
        )}

        <div style={{
          position: "absolute", bottom: 12, left: 14,
          background: "rgba(0,0,0,0.7)", color: D.ink,
          padding: "5px 10px", borderRadius: 6, fontSize: 10, fontFamily: MONO,
          pointerEvents: "none",
        }}>
          sürükle = pan · Shift+wheel = zoom · ölçek {vp.scale.toFixed(2)}×
        </div>
      </div>

      {/* S1/S2 alt panel — Gantt'lar burada gösteriliyor */}
      {result && (
        <ReactionGantt result={result} onClose={() => setResult(null)} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   STAGE — picture'in birebir görsel kopyası
   ══════════════════════════════════════════════════════════════════ */
function ScenarioStage({ result }: { result: ReactionResult | null }) {
  const W = G.s2X + 800;
  const H = G.flaskY + G.flaskH + 80;
  const _ = result; // placeholder for future overlays (per-scenario coloring)

  // Customer chip positions
  const custChips = SCENARIO.customers.map((c, i) => ({
    ...c,
    x: G.custChipX,
    y: G.custChipFirstY + i * G.custChipGap,
  }));

  // Product card positions
  const prodCards = SCENARIO.products.map((p, i) => ({
    ...p,
    x: G.prodX,
    y: G.prodFirstY + i * G.prodGap,
  }));

  const e3Chip = custChips.find((c) => c.id === "E3")!;
  const g2Chip = custChips.find((c) => c.id === "G2")!;
  const elektrikliC = { x: G.catEleX, y: G.catEleY, r: G.catR };
  const gazliC = { x: G.catGazX, y: G.catGazY, r: G.catR };
  const gsaCard = prodCards.find((p) => p.sku === "GSA15")!;
  const gssCard = prodCards.find((p) => p.sku === "GSS20P")!;

  const flowUret = { x: G.flowX, y: G.flowUretY, r: G.flowR };
  const flowDepo = { x: G.flowX, y: G.flowDepoY, r: G.flowR };
  const flowSat = { x: G.flowX, y: G.flowSatY, r: G.flowR };

  return (
    <div style={{ position: "relative", width: W, height: H, pointerEvents: "auto" }}>
      {/* SVG layer for connection lines */}
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        <defs>
          <marker id="arrow-w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={D.edgeBold} />
          </marker>
          <marker id="arrow-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={D.red} />
          </marker>
          <marker id="arrow-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={D.green} />
          </marker>
          <marker id="arrow-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={D.blue} />
          </marker>
        </defs>

        {/* Customers label → individual chips (vertical spine) */}
        {custChips.map((c) => (
          <line
            key={`spine-${c.id}`}
            x1={G.custLabelX + G.custLabelW}
            y1={G.custLabelY + G.custLabelH / 2}
            x2={c.x}
            y2={c.y + G.custChipH / 2}
            stroke={D.edgeFaint}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        {/* E3 → Elektrikli (green) → GSA15 (green) — quantity x200 */}
        <CurvePath
          from={{ x: e3Chip.x + G.custChipW, y: e3Chip.y + G.custChipH / 2 }}
          to={{ x: elektrikliC.x - elektrikliC.r, y: elektrikliC.y }}
          color={D.green} />
        <CurvePath
          from={{ x: elektrikliC.x + elektrikliC.r, y: elektrikliC.y }}
          to={{ x: gsaCard.x, y: gsaCard.y + G.prodH / 2 }}
          color={D.green} />

        {/* G2 → Gazlı (blue) → GSS20P (blue) — quantity x50 */}
        <CurvePath
          from={{ x: g2Chip.x + G.custChipW, y: g2Chip.y + G.custChipH / 2 }}
          to={{ x: gazliC.x - gazliC.r, y: gazliC.y }}
          color={D.blue} />
        <CurvePath
          from={{ x: gazliC.x + gazliC.r, y: gazliC.y }}
          to={{ x: gssCard.x, y: gssCard.y + G.prodH / 2 }}
          color={D.blue} />

        {/* Categories → all their products (faint) */}
        {prodCards.filter((p) => p.category === "Elektrikli" && p.sku !== "GSA15").map((p) => (
          <CurvePath key={`ele-${p.sku}`}
            from={{ x: elektrikliC.x + elektrikliC.r, y: elektrikliC.y }}
            to={{ x: p.x, y: p.y + G.prodH / 2 }}
            color={D.edgeFaint} faint />
        ))}
        {prodCards.filter((p) => p.category === "Gazlı" && p.sku !== "GSS20P").map((p) => (
          <CurvePath key={`gaz-${p.sku}`}
            from={{ x: gazliC.x + gazliC.r, y: gazliC.y }}
            to={{ x: p.x, y: p.y + G.prodH / 2 }}
            color={D.edgeFaint} faint />
        ))}

        {/* Shared component cross-product lines (red, dashed) */}
        <path
          d={`M ${gsaCard.x + G.prodW - 30} ${gsaCard.y + G.prodH - 8}
              C ${gsaCard.x + G.prodW + 60} ${gsaCard.y + 80},
                ${gssCard.x + G.prodW - 60} ${gssCard.y - 60},
                ${gssCard.x + G.prodW - 30} ${gssCard.y + 8}`}
          stroke={D.red} strokeWidth={1.5} strokeDasharray="6 4" fill="none" markerEnd="url(#arrow-r)" />
        <text x={gsaCard.x + G.prodW + 30} y={gsaCard.y + 30} fill={D.red} fontSize="11" fontFamily={MONO}>×110</text>
        <text x={gsaCard.x + G.prodW + 30} y={gsaCard.y + 48} fill={D.red} fontSize="11" fontFamily={MONO}>×120</text>

        {/* GSA15 → Üretim (x100), Depo (x50), Satış (x50) — green */}
        <ArrowLine from={{ x: gsaCard.x + G.prodW, y: gsaCard.y + G.prodH / 2 }}
          to={{ x: flowUret.x - flowUret.r, y: flowUret.y - 12 }} color={D.green} label="x100" labelOffset={{ dx: -10, dy: -8 }} />
        <ArrowLine from={{ x: gsaCard.x + G.prodW, y: gsaCard.y + G.prodH / 2 + 14 }}
          to={{ x: flowDepo.x - flowDepo.r, y: flowDepo.y - 4 }} color={D.green} label="x50" />
        <ArrowLine from={{ x: gsaCard.x + G.prodW, y: gsaCard.y + G.prodH / 2 + 28 }}
          to={{ x: flowSat.x - flowSat.r, y: flowSat.y - 8 }} color={D.green} label="x50" />

        {/* GSS20P → Üretim (x50) — blue */}
        <ArrowLine from={{ x: gssCard.x + G.prodW, y: gssCard.y + G.prodH / 2 }}
          to={{ x: flowUret.x - flowUret.r, y: flowUret.y + 12 }} color={D.blue} label="x50" labelOffset={{ dx: 0, dy: 14 }} />

        {/* Flow circles → Factory */}
        <ArrowLine from={{ x: flowUret.x + flowUret.r, y: flowUret.y }}
          to={{ x: G.factX, y: G.factY + G.factH / 2 - 30 }} color={D.edgeBold} />
        <ArrowLine from={{ x: flowDepo.x + flowDepo.r, y: flowDepo.y }}
          to={{ x: G.factX, y: G.factY + G.factH / 2 }} color={D.edgeBold} />
        <ArrowLine from={{ x: flowSat.x + flowSat.r, y: flowSat.y }}
          to={{ x: G.factX, y: G.factY + G.factH / 2 + 30 }} color={D.edgeBold} />

        {/* GSA15 lead-time pill → factory line */}
        <line x1={gsaCard.x + G.prodW + 60} y1={gsaCard.y - 20}
          x2={G.leadGsaX + 30} y2={G.leadGsaY + 40} stroke={D.green} strokeWidth={1} strokeDasharray="2 3" />

        {/* GSS20P lead-time pill → factory line */}
        <line x1={gssCard.x + G.prodW + 60} y1={gssCard.y + G.prodH + 20}
          x2={G.leadGssX + 30} y2={G.leadGssY - 4} stroke={D.blue} strokeWidth={1} strokeDasharray="2 3" />

        {/* Tedarik denklemi: a, b boxes from products → supply equation widget */}
        <path
          d={`M ${gssCard.x + G.prodW - 12} ${gssCard.y + G.prodH - 6}
              C ${gssCard.x + G.prodW + 200} ${gssCard.y + 200},
                ${G.supplyX - 40} ${G.supplyY - 80},
                ${G.supplyX - 8} ${G.supplyY + G.supplyH / 2}`}
          stroke={D.red} strokeWidth={1.2} strokeDasharray="5 4" fill="none" markerEnd="url(#arrow-r)" />
        <text x={G.supplyX - 320} y={G.supplyY + G.supplyH / 2 - 30} fill={D.red} fontSize="12" fontFamily={MONO}>tedarik denklemi</text>

        {/* Flask line — products into flask */}
        <line x1={gsaCard.x + 30} y1={gsaCard.y + G.prodH}
          x2={G.flaskX + 80} y2={G.flaskY + 30} stroke={D.green} strokeWidth={1} strokeDasharray="2 4" opacity="0.6" />
        <line x1={gssCard.x + 30} y1={gssCard.y + G.prodH}
          x2={G.flaskX + 200} y2={G.flaskY + 30} stroke={D.blue} strokeWidth={1} strokeDasharray="2 4" opacity="0.6" />
      </svg>

      {/* ─────── HTML elements (positioned absolute) ─────── */}

      {/* Title (top-right) */}
      <div style={{
        position: "absolute", right: 60, top: 20,
        fontSize: 28, color: D.ink, letterSpacing: 0.5, fontWeight: 300,
      }}>
        Müşteri Senaryoları
      </div>

      {/* Customers panel border */}
      <div style={{
        position: "absolute", left: G.custBoxX, top: G.custBoxY,
        width: G.custBoxW, height: G.custBoxH,
        border: `1px dashed ${D.edgeFaint}`, borderRadius: 12,
        pointerEvents: "none",
      }} />

      {/* Customers label */}
      <div style={{
        position: "absolute", left: G.custLabelX, top: G.custLabelY,
        width: G.custLabelW, height: G.custLabelH,
        background: D.ink, color: D.bg, fontWeight: 700, fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 4,
      }}>
        Customers
      </div>

      {/* Customer chips */}
      {custChips.map((c) => (
        <div key={c.id} style={{
          position: "absolute", left: c.x, top: c.y,
          width: G.custChipW, height: G.custChipH,
          background: c.highlighted === "green" ? D.green
                    : c.highlighted === "blue" ? D.blue
                    : "#e8e6dc",
          color: c.highlighted ? "#fff" : "#0a0a0e",
          fontSize: 14, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 4, fontFamily: MONO,
        }}>
          {c.label}
        </div>
      ))}

      {/* Categories — Elektrikli circle */}
      <div style={{
        position: "absolute",
        left: elektrikliC.x - elektrikliC.r, top: elektrikliC.y - elektrikliC.r,
        width: elektrikliC.r * 2, height: elektrikliC.r * 2,
        borderRadius: "50%",
        background: "#cfcfcf",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#0a0a0e", fontSize: 16, fontFamily: FONT,
      }}>
        Elektrikli
      </div>

      {/* Categories — Gazlı circle */}
      <div style={{
        position: "absolute",
        left: gazliC.x - gazliC.r, top: gazliC.y - gazliC.r,
        width: gazliC.r * 2, height: gazliC.r * 2,
        borderRadius: "50%",
        background: "#cfcfcf",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#0a0a0e", fontSize: 16, fontFamily: FONT,
      }}>
        Gazlı
      </div>

      {/* Product cards */}
      {prodCards.map((p) => {
        const isGsa = p.sku === "GSA15";
        const isGss = p.sku === "GSS20P";
        const bg = isGsa ? D.green : isGss ? D.blue : "#e8e6dc";
        const fg = (isGsa || isGss) ? "#fff" : "#0a0a0e";
        return (
          <div key={p.sku} style={{
            position: "absolute", left: p.x, top: p.y,
            width: G.prodW, height: (isGsa || isGss) ? G.prodH + 12 : G.prodH - 16,
            background: bg, color: fg,
            borderRadius: 6, padding: "8px 12px",
            display: "flex", flexDirection: "column", justifyContent: "center",
            fontSize: 14, fontWeight: (isGsa || isGss) ? 700 : 500, fontFamily: MONO,
            opacity: p.muted ? 0.55 : 1,
          }}>
            <div>{p.sku}</div>
            {isGsa && (
              <div style={{ display: "flex", gap: 4, marginTop: 4, fontSize: 11 }}>
                <SubChip>a</SubChip><SubChip>b</SubChip>
              </div>
            )}
            {isGss && (
              <div style={{ display: "flex", gap: 4, marginTop: 4, fontSize: 11 }}>
                <SubChip>a</SubChip><SubChip>b</SubChip>
              </div>
            )}
          </div>
        );
      })}

      {/* Lead-time pill — GSA15 30 gün */}
      <div style={{
        position: "absolute", left: G.leadGsaX, top: G.leadGsaY,
        background: D.green, color: "#fff",
        padding: "6px 12px", borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: MONO,
      }}>30 gün</div>

      {/* Lead-time pill — GSS20P 10 gün */}
      <div style={{
        position: "absolute", left: G.leadGssX, top: G.leadGssY,
        background: D.blue, color: "#fff",
        padding: "6px 12px", borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: MONO,
      }}>10 gün</div>

      {/* Deadline pills */}
      <div style={{
        position: "absolute", left: G.prodX - 290, top: G.prodFirstY - 50,
        background: D.green, color: "#fff",
        padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: MONO,
      }}>Teslim = 1 Haz</div>
      <div style={{
        position: "absolute", left: G.prodX - 360, top: gssCard.y + G.prodH + 30,
        background: D.blue, color: "#fff",
        padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: MONO,
      }}>Teslim = 15 Mayıs</div>

      {/* Üretim/Depo/Satış circles */}
      {[
        { ...flowUret, label: "Üretim" },
        { ...flowDepo, label: "Depo" },
        { ...flowSat, label: "Satış" },
      ].map((c, i) => (
        <div key={i} style={{
          position: "absolute",
          left: c.x - c.r, top: c.y - c.r,
          width: c.r * 2, height: c.r * 2,
          borderRadius: "50%",
          background: "#cfcfcf",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#0a0a0e", fontSize: 14, fontFamily: FONT,
        }}>
          {c.label}
        </div>
      ))}

      {/* Factory icon */}
      <div style={{
        position: "absolute", left: G.factX, top: G.factY,
        width: G.factW, height: G.factH,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 90, color: D.ink,
      }}>
        🏭
      </div>

      {/* Supply equation widget */}
      <div style={{
        position: "absolute", left: G.supplyX, top: G.supplyY,
        width: G.supplyW, height: G.supplyH,
        border: `2px solid ${D.red}`, borderRadius: 12,
        background: "rgba(220,38,38,0.06)",
        padding: 18,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: "100%",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <SupplyComponent code="a" qty={300} leadDays={15} />
            <SupplyComponent code="b" qty={180} leadDays={12} />
          </div>
          <div style={{
            background: D.bgAlt, padding: "12px 18px", borderRadius: 10,
            border: `1px solid ${D.edge}`, color: D.ink,
            fontSize: 18, fontWeight: 700, fontFamily: MONO,
          }}>15 gün</div>
        </div>
      </div>

      {/* Flask widget */}
      <div style={{
        position: "absolute", left: G.flaskX, top: G.flaskY,
        width: G.flaskW, height: G.flaskH,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      }}>
        <div style={{ fontSize: 80, color: D.amber, lineHeight: 1 }}>🧪</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{
            background: D.green, color: "#fff",
            padding: "6px 14px", borderRadius: 6, fontSize: 14, fontWeight: 700, fontFamily: MONO,
          }}>GSA15</div>
          <div style={{
            background: D.blue, color: "#fff",
            padding: "6px 14px", borderRadius: 6, fontSize: 14, fontWeight: 700, fontFamily: MONO,
          }}>GSS20P</div>
        </div>
        <div style={{
          width: "100%", height: 1, background: D.edgeBold, marginTop: 6,
        }} />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Atomic helpers
   ────────────────────────────────────────────────────────────────── */
function SubChip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: "50%",
      background: "rgba(255,255,255,0.18)", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 700, fontFamily: MONO,
    }}>
      {children}
    </div>
  );
}

function SupplyComponent({ code, qty, leadDays }: { code: string; qty: number; leadDays: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{
        width: 60, height: 60, borderRadius: "50%",
        background: "#cfcfcf", color: "#0a0a0e",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, fontWeight: 700, fontFamily: FONT,
      }}>
        {code}
      </div>
      <div style={{ fontSize: 14, color: D.ink, fontFamily: MONO }}>×{qty}</div>
      <div style={{ fontSize: 18, color: D.inkSub }}>→</div>
      <div style={{
        background: D.bgAlt, padding: "6px 14px", borderRadius: 8,
        border: `1px solid ${D.edge}`, color: D.ink,
        fontSize: 14, fontWeight: 700, fontFamily: MONO,
      }}>{leadDays} gün</div>
    </div>
  );
}

function CurvePath({
  from, to, color, faint,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  faint?: boolean;
}) {
  const dx = (to.x - from.x) * 0.5;
  const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
  return <path d={d} stroke={color} strokeWidth={1.5} fill="none" strokeDasharray={faint ? "3 4" : undefined} opacity={faint ? 0.5 : 1} />;
}

function ArrowLine({
  from, to, color, label, labelOffset,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  label?: string;
  labelOffset?: { dx: number; dy: number };
}) {
  const id = color === D.green ? "arrow-g"
           : color === D.blue ? "arrow-b"
           : color === D.red ? "arrow-r"
           : "arrow-w";
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
        stroke={color} strokeWidth={1.5} strokeDasharray="3 3" markerEnd={`url(#${id})`} />
      {label && (
        <text
          x={(from.x + to.x) / 2 + (labelOffset?.dx ?? 0)}
          y={(from.y + to.y) / 2 + (labelOffset?.dy ?? -6)}
          fill={color === D.edgeBold ? D.ink : color}
          fontSize="13"
          fontFamily={MONO}
          fontWeight="600"
        >
          {label}
        </text>
      )}
    </g>
  );
}

const btnGhost: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 8, cursor: "pointer",
  background: "transparent", border: `1px solid ${D.edgeFaint}`,
  color: D.inkSub, fontFamily: FONT, fontSize: 12,
};
const btnAccent: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
  background: D.amber, border: "none", color: "#0a0a0e",
  fontFamily: FONT, fontSize: 12, fontWeight: 700,
};
