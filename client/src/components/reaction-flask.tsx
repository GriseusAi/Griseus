import { useState, useEffect, useRef, useMemo } from "react";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { apiRequest } from "@/lib/queryClient";

/* ════════════════════════════════════════════════════════════════════
   REACTION FLASK — Tepkime Denklemi (free-form widget)
   ──────────────────────────────────────────────────────────────────── */

export interface FlaskItem {
  id: string;
  sku: string;
  qty: number;
  deadline: string;
  color?: string;
}

export interface SupplyItem {
  id: string;
  componentCode: string;
  qty: number;
  leadDays: number;
}

export interface ScenarioOutcome {
  sku: string;
  requested: number;
  fromStock: number;
  toProduce: number;
  finishesDay: number;
  deadlineDay: number;
  ontime: boolean;
  daysLate: number;
}

export interface GanttSegment {
  sku: string;
  label: string;
  startDay: number;
  endDay: number;
  qty: number;
  color?: string;
  blocked?: boolean;
  note?: string;
}

export interface SupplySegment {
  code: string;
  qty: number;
  startDay: number;
  endDay: number;
}

export interface Scenario {
  id: "S1" | "S2";
  label: string;
  rationale: string;
  segments: GanttSegment[];
  supplySegments: SupplySegment[];
  outcomes: ScenarioOutcome[];
  ontime: boolean;
  worstLateDays: number;
}

export interface ReactionResult {
  startDate: string;
  horizonDays: number;
  scenarios: [Scenario, Scenario];
  sharedComponents: string[];
  warnings: string[];
  contextSummary: { sku: string; requested: number; inWarehouse: number; toProduce: number }[];
}

const DEVICE_COLORS = ["#3f8f5b", "#3d6fb0", "#c96442", "#b8761c", "#8b5cf6", "#0891b2", "#dc2626"];

function colorFor(idx: number) {
  return DEVICE_COLORS[idx % DEVICE_COLORS.length];
}

/* ────── Flask Widget ──────
   Screen-space (fixed bottom-right). Ingredients dropdown, supply opt, başlat. */
export function ReactionFlask({
  items,
  setItems,
  supplies,
  setSupplies,
  result,
  setResult,
  onClose,
  pendingOrdersCount,
  onAddAll,
  onDropPayload,
}: {
  items: FlaskItem[];
  setItems: (next: FlaskItem[]) => void;
  supplies: SupplyItem[];
  setSupplies: (next: SupplyItem[]) => void;
  result: ReactionResult | null;
  setResult: (r: ReactionResult | null) => void;
  onClose: () => void;
  pendingOrdersCount: number;
  onAddAll: () => void;
  onDropPayload: (payload: { sku: string; qty: number; deadline: string; orderId?: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSupply, setShowSupply] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const raw = e.dataTransfer.getData("application/x-griseus-order");
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload?.sku && payload?.qty && payload?.deadline) {
        onDropPayload(payload);
      }
    } catch {
      /* ignore malformed drag */
    }
  };

  const startReaction = async () => {
    if (items.length === 0) {
      setError("Önce flask'a en az bir cihaz ekle.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/strategy/reaction-equation", {
        devices: items.map((it) => ({
          sku: it.sku,
          qty: it.qty,
          deadline: it.deadline,
          color: it.color,
        })),
        supplyOrders: supplies.length
          ? supplies.map((s) => ({
              componentCode: s.componentCode,
              qty: s.qty,
              leadDays: s.leadDays,
            }))
          : undefined,
      });
      const data = (await res.json()) as ReactionResult;
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Tepkime hesaplanamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-griseus-order")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 100,
        width: 360,
        maxHeight: "78vh",
        display: "flex",
        flexDirection: "column",
        background: CT.surface,
        border: dragOver ? `2px dashed ${CT.accent}` : `1px solid ${CT.borderStrong}`,
        borderRadius: 14,
        boxShadow: dragOver
          ? `0 0 0 4px ${CT.accentSoft}, 0 12px 36px rgba(20,20,19,0.18)`
          : "0 12px 36px rgba(20,20,19,0.16)",
        fontFamily: CT_FONT,
        color: CT.ink,
        overflow: "hidden",
        transition: "border 0.12s, box-shadow 0.12s",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: CT.bgAlt,
          borderBottom: `1px solid ${CT.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: CT.accentSoft,
              border: `1px solid ${CT.accentEdge}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            T
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Tepkime Denklemi</div>
            <div style={{ fontSize: 10, color: CT.inkSub }}>
              {items.length} cihaz · {supplies.length} tedarik
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: CT.inkSub,
            cursor: "pointer",
            fontSize: 16,
            padding: 4,
          }}
          aria-label="kapat"
        >
          ✕
        </button>
      </div>

      {/* Body — scroll */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.length === 0 && (
          <div
            style={{
              padding: 16,
              border: `1px dashed ${CT.borderStrong}`,
              borderRadius: 10,
              fontSize: 11,
              color: CT.inkSub,
              textAlign: "center",
              lineHeight: 1.6,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 2, color: CT.inkSub, fontWeight: 700 }}>TEPKIME</div>
            <div>
              Boş flask. Sipariş kartlarını <b style={{ color: CT.ink }}>buraya sürükle</b>,
              <br />
              kart üstündeki <span style={{ color: CT.accent, fontWeight: 600 }}>+ tepkime</span> butona bas,
              <br />
              ya da aşağıdaki tek tıkla doldur.
            </div>
            {pendingOrdersCount > 0 && (
              <button
                onClick={onAddAll}
                style={{
                  padding: "8px 14px",
                  background: CT.accent,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#fff",
                  fontFamily: CT_FONT,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                + Tüm siparişleri ekle ({pendingOrdersCount})
              </button>
            )}
          </div>
        )}

        {items.map((it, i) => (
          <FlaskRow
            key={it.id}
            item={it}
            color={it.color ?? colorFor(i)}
            onChange={(next) => setItems(items.map((x) => (x.id === next.id ? next : x)))}
            onRemove={() => setItems(items.filter((x) => x.id !== it.id))}
          />
        ))}

        <button
          onClick={() => {
            const id = `m_${Date.now()}`;
            const today = new Date();
            const def = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
            setItems([
              ...items,
              {
                id,
                sku: "GSA15",
                qty: 50,
                deadline: def,
                color: colorFor(items.length),
              },
            ]);
          }}
          style={{
            padding: "8px 12px",
            background: "transparent",
            border: `1px dashed ${CT.borderStrong}`,
            borderRadius: 8,
            cursor: "pointer",
            color: CT.inkSub,
            fontFamily: CT_FONT,
            fontSize: 11,
          }}
        >
          + cihaz ekle (manuel)
        </button>

        {/* Supply orders */}
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => setShowSupply((s) => !s)}
            style={{
              background: "transparent",
              border: "none",
              color: CT.inkSub,
              cursor: "pointer",
              fontSize: 10,
              padding: 0,
              fontFamily: CT_MONO,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {showSupply ? "▾" : "▸"} Tedarik siparişleri ({supplies.length})
          </button>
          {showSupply && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {supplies.map((s) => (
                <SupplyRow
                  key={s.id}
                  item={s}
                  onChange={(next) => setSupplies(supplies.map((x) => (x.id === next.id ? next : x)))}
                  onRemove={() => setSupplies(supplies.filter((x) => x.id !== s.id))}
                />
              ))}
              <button
                onClick={() => {
                  const id = `s_${Date.now()}`;
                  setSupplies([...supplies, { id, componentCode: "", qty: 100, leadDays: 15 }]);
                }}
                style={{
                  padding: "6px 10px",
                  background: "transparent",
                  border: `1px dashed ${CT.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  color: CT.inkSub,
                  fontFamily: CT_MONO,
                  fontSize: 10,
                }}
              >
                + tedarik
              </button>
              <div style={{ fontSize: 9, color: CT.inkMuted, lineHeight: 1.5 }}>
                Boş bırakırsan AI eksik bileşeni saptayıp 15g tedariği otomatik önerecek.
              </div>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: 8,
              background: CT.errSoft,
              border: `1px solid ${CT.err}`,
              borderRadius: 6,
              fontSize: 11,
              color: CT.err,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: 12,
          background: CT.bgAlt,
          borderTop: `1px solid ${CT.border}`,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          onClick={() => {
            setItems([]);
            setSupplies([]);
            setResult(null);
          }}
          disabled={items.length === 0}
          style={{
            padding: "9px 12px",
            background: "transparent",
            border: `1px solid ${CT.border}`,
            borderRadius: 8,
            cursor: items.length === 0 ? "not-allowed" : "pointer",
            color: CT.inkSub,
            fontFamily: CT_FONT,
            fontSize: 11,
            opacity: items.length === 0 ? 0.5 : 1,
          }}
        >
          temizle
        </button>
        <button
          onClick={startReaction}
          disabled={busy || items.length === 0}
          style={{
            flex: 1,
            padding: "9px 14px",
            background: busy || items.length === 0 ? CT.surfaceMuted : CT.accent,
            border: "none",
            borderRadius: 8,
            cursor: busy || items.length === 0 ? "not-allowed" : "pointer",
            color: busy || items.length === 0 ? CT.inkMuted : "#fff",
            fontFamily: CT_FONT,
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {busy ? <Spinner /> : null} Tepkime başlat
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

function FlaskRow({
  item,
  color,
  onChange,
  onRemove,
}: {
  item: FlaskItem;
  color: string;
  onChange: (next: FlaskItem) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: CT.bg,
        border: `1px solid ${CT.border}`,
        borderRadius: 8,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <input
        value={item.sku}
        onChange={(e) => onChange({ ...item, sku: e.target.value.toUpperCase() })}
        style={{
          width: 92,
          padding: "5px 6px",
          background: "transparent",
          border: `1px solid ${CT.border}`,
          borderRadius: 4,
          fontSize: 11,
          fontFamily: CT_MONO,
          color: CT.ink,
        }}
        title="SKU"
      />
      <input
        type="number"
        value={item.qty}
        onChange={(e) => onChange({ ...item, qty: Math.max(1, parseInt(e.target.value || "1", 10)) })}
        style={{
          width: 60,
          padding: "5px 6px",
          background: "transparent",
          border: `1px solid ${CT.border}`,
          borderRadius: 4,
          fontSize: 11,
          fontFamily: CT_MONO,
          color: CT.ink,
          textAlign: "right",
        }}
        title="adet"
      />
      <input
        type="date"
        value={item.deadline}
        onChange={(e) => onChange({ ...item, deadline: e.target.value })}
        style={{
          flex: 1,
          padding: "5px 6px",
          background: "transparent",
          border: `1px solid ${CT.border}`,
          borderRadius: 4,
          fontSize: 11,
          fontFamily: CT_MONO,
          color: CT.ink,
          minWidth: 0,
        }}
        title="teslim"
      />
      <button
        onClick={onRemove}
        style={{
          background: "transparent",
          border: "none",
          color: CT.inkMuted,
          cursor: "pointer",
          fontSize: 14,
          padding: 2,
        }}
        aria-label="kaldır"
      >
        ✕
      </button>
    </div>
  );
}

function SupplyRow({
  item,
  onChange,
  onRemove,
}: {
  item: SupplyItem;
  onChange: (next: SupplyItem) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        background: CT.bg,
        border: `1px solid ${CT.border}`,
        borderRadius: 6,
      }}
    >
      <input
        value={item.componentCode}
        onChange={(e) => onChange({ ...item, componentCode: e.target.value })}
        placeholder="kod"
        style={{
          flex: 1,
          padding: "4px 6px",
          background: "transparent",
          border: `1px solid ${CT.border}`,
          borderRadius: 4,
          fontSize: 10,
          fontFamily: CT_MONO,
          color: CT.ink,
          minWidth: 0,
        }}
      />
      <input
        type="number"
        value={item.qty}
        onChange={(e) => onChange({ ...item, qty: Math.max(1, parseFloat(e.target.value || "1")) })}
        style={{
          width: 56,
          padding: "4px 6px",
          background: "transparent",
          border: `1px solid ${CT.border}`,
          borderRadius: 4,
          fontSize: 10,
          fontFamily: CT_MONO,
          color: CT.ink,
          textAlign: "right",
        }}
        title="miktar"
      />
      <input
        type="number"
        value={item.leadDays}
        onChange={(e) => onChange({ ...item, leadDays: Math.max(1, parseInt(e.target.value || "1", 10)) })}
        style={{
          width: 44,
          padding: "4px 6px",
          background: "transparent",
          border: `1px solid ${CT.border}`,
          borderRadius: 4,
          fontSize: 10,
          fontFamily: CT_MONO,
          color: CT.ink,
          textAlign: "right",
        }}
        title="lead gün"
      />
      <span style={{ fontSize: 9, color: CT.inkMuted }}>g</span>
      <button
        onClick={onRemove}
        style={{
          background: "transparent",
          border: "none",
          color: CT.inkMuted,
          cursor: "pointer",
          fontSize: 12,
          padding: 0,
        }}
        aria-label="kaldır"
      >
        ✕
      </button>
    </div>
  );
}
