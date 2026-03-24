import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket, type StockUpdateEvent } from "@/lib/useStockWebSocket";

/* ═══════════════════════════════════════════════════════════
   PALETTE & TOKENS — Palantir-inspired dark operational UI
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
interface Toast { id: number; sku: string; type: string; qty: number; ts: number; exiting?: boolean; }

/* ── Object Set Definitions (Palantir pattern) ── */
type ObjectSetKey = "all" | "critical" | "transfer" | "low" | "normal";
const OBJECT_SETS: { key: ObjectSetKey; label: string; color: string; filter: (p: StockLevel) => boolean }[] = [
  { key: "all", label: "Tümü", color: C.mid, filter: () => true },
  { key: "critical", label: "Kritik", color: C.err, filter: p => p.inWarehouse === 0 && p.inProduction === 0 },
  { key: "transfer", label: "Transfer Bekliyor", color: C.warn, filter: p => p.inWarehouse === 0 && p.inProduction > 0 },
  { key: "low", label: "Düşük Stok", color: C.warn, filter: p => p.inWarehouse > 0 && p.inWarehouse <= 5 },
  { key: "normal", label: "Normal", color: C.ok, filter: p => p.inWarehouse > 5 },
];

/* ── Quick Action definitions ── */
const QUICK_ACTIONS = [
  { type: "to_warehouse", label: "Depoya Transfer", icon: "📦", color: C.blue, bg: C.blueDim, border: C.blueBorder, desc: "Üretimden depoya taşı" },
  { type: "produced", label: "Üretim Girişi", icon: "⚙", color: C.ok, bg: C.okDim, border: C.okBorder, desc: "Yeni üretim kaydet" },
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
function getProductStatus(p: StockLevel): { color: string; label: string; bg: string; border: string } {
  if (p.inWarehouse === 0 && p.inProduction === 0) return { color: C.err, label: "KRİTİK", bg: C.errDim, border: C.errBorder };
  if (p.inWarehouse === 0 && p.inProduction > 0) return { color: C.warn, label: "TRANSFER BEKLİYOR", bg: C.warnDim, border: C.warnBorder };
  if (p.inWarehouse > 0 && p.inWarehouse <= 5) return { color: C.warn, label: "DÜŞÜK STOK", bg: C.warnDim, border: C.warnBorder };
  return { color: C.ok, label: "NORMAL", bg: C.okDim, border: C.okBorder };
}

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════ */

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20,
      background: connected ? C.okDim : C.errDim,
      border: `1px solid ${connected ? C.okBorder : C.errBorder}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: connected ? C.ok : C.err,
        boxShadow: connected ? `0 0 8px ${C.ok}` : "none",
        animation: connected ? "pulse 2s infinite" : "none",
      }} />
      <span style={{ fontSize: 10, fontFamily: mono, color: connected ? C.ok : C.err, fontWeight: 600, letterSpacing: 0.5 }}>
        {connected ? "CANLI" : "BAĞLANTI KESİLDİ"}
      </span>
    </div>
  );
}

/* ── Pipeline Flow ── */
function PipelineView({ summary }: { summary: Summary | undefined }) {
  const stages = [
    { label: "ÜRETİMDE", value: summary?.totalInProduction ?? 0, color: C.warn, icon: "⚙" },
    { label: "DEPODA", value: summary?.totalInWarehouse ?? 0, color: C.ok, icon: "📦" },
    { label: "SATILAN", value: summary?.todaySold ?? 0, color: C.purple, icon: "🚚", sub: "bugün" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "24px 16px", marginBottom: 4 }}>
      {stages.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "16px 28px", textAlign: "center", position: "relative", minWidth: 130,
          }}>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: mono, color: s.color, lineHeight: 1 }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 9, color: C.dim, marginTop: 4, fontFamily: mono }}>{s.sub}</div>}
            <div style={{
              position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
              width: 60, height: 4, borderRadius: 4, background: s.color, opacity: 0.2, filter: "blur(4px)",
            }} />
          </div>
          {i < stages.length - 1 && (
            <div style={{ display: "flex", alignItems: "center", width: 60, position: "relative" }}>
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

/* ── Alert Banner (Clickable → selects product) ── */
function AlertBanner({ levels, onSelectProduct }: { levels: StockLevel[]; onSelectProduct: (id: number) => void }) {
  const alerts: { productId: number; sku: string; msg: string; color: string; severity: number; actionLabel?: string }[] = [];
  for (const p of levels) {
    if (p.inWarehouse === 0 && p.inProduction === 0) {
      alerts.push({ productId: p.productId, sku: p.productSku, msg: "Stok yok — acil üretim gerekli", color: C.err, severity: 0 });
    } else if (p.inWarehouse === 0 && p.inProduction > 0) {
      alerts.push({ productId: p.productId, sku: p.productSku, msg: `Üretimde ${p.inProduction} adet bekliyor`, color: C.warn, severity: 1, actionLabel: "Transfer Et →" });
    } else if (p.inWarehouse > 0 && p.inWarehouse <= 5) {
      alerts.push({ productId: p.productId, sku: p.productSku, msg: `Depoda sadece ${p.inWarehouse} adet`, color: C.warn, severity: 2 });
    }
  }
  alerts.sort((a, b) => a.severity - b.severity);

  if (alerts.length === 0) return null;

  return (
    <div style={{ marginBottom: 16, padding: "0 16px" }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
        ⚡ {alerts.length} UYARI — tıkla ve aksiyon al
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {alerts.map((a, i) => (
          <div key={i} onClick={() => onSelectProduct(a.productId)} style={{
            flex: "0 0 auto", padding: "8px 14px", borderRadius: 10, cursor: "pointer",
            background: a.color === C.err ? C.errDim : C.warnDim,
            border: `1px solid ${a.color === C.err ? C.errBorder : C.warnBorder}`,
            display: "flex", alignItems: "center", gap: 8,
            transition: "transform 0.1s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: a.color }}>{a.sku}</span>
            <span style={{ fontSize: 11, color: C.mid }}>{a.msg}</span>
            {a.actionLabel && (
              <span style={{ fontSize: 10, fontWeight: 700, color: a.color, marginLeft: 4 }}>{a.actionLabel}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Object Set Tabs ── */
function ObjectSetTabs({ activeSet, counts, onSelect }: {
  activeSet: ObjectSetKey; counts: Record<ObjectSetKey, number>; onSelect: (k: ObjectSetKey) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
      {OBJECT_SETS.map(os => {
        const isActive = activeSet === os.key;
        const count = counts[os.key];
        return (
          <button key={os.key} onClick={() => onSelect(os.key)} style={{
            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            background: isActive ? `${os.color}18` : "transparent",
            border: `1px solid ${isActive ? `${os.color}40` : C.border}`,
            color: isActive ? os.color : C.dim,
            fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            display: "flex", alignItems: "center", gap: 6,
            transition: "all 0.15s",
          }}>
            {os.label}
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 4,
              background: isActive ? `${os.color}20` : "rgba(255,255,255,0.03)",
              color: isActive ? os.color : C.dim,
            }}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Product Card ── */
function ProductCard({
  level, isSelected, isFlashing, onSelect,
}: {
  level: StockLevel; isSelected: boolean; isFlashing: boolean; onSelect: () => void;
}) {
  const status = getProductStatus(level);
  return (
    <div
      className={isFlashing ? "stock-flash" : ""}
      onClick={onSelect}
      style={{
        background: isSelected ? C.accentDim : C.surface,
        border: `1px solid ${isSelected ? C.borderActive : C.border}`,
        borderRadius: 14, padding: "14px 16px", cursor: "pointer",
        transition: "all 0.15s", position: "relative", overflow: "hidden",
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = C.surfaceHover; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = C.surface; }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: status.color, opacity: 0.6 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.white, letterSpacing: 0.5 }}>{level.productSku}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {level.productName}
          </div>
        </div>
        <div style={{
          fontSize: 8, fontFamily: mono, fontWeight: 700, letterSpacing: 0.8,
          padding: "3px 7px", borderRadius: 6, background: status.bg, color: status.color, border: `1px solid ${status.border}`,
        }}>
          {status.label}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <MiniNode label="P" value={level.inProduction} color={C.warn} />
        <span style={{ color: C.dim, fontSize: 10, opacity: 0.4 }}>›</span>
        <MiniNode label="D" value={level.inWarehouse} color={level.inWarehouse === 0 ? C.err : C.ok} />
        <span style={{ color: C.dim, fontSize: 10, opacity: 0.4 }}>›</span>
        <MiniNode label="S" value={level.totalSold} color={C.purple} />
      </div>
      <div style={{ marginTop: 10, fontSize: 9, color: C.dim, fontFamily: mono, textAlign: "right" }}>{timeAgo(level.updatedAt)}</div>
    </div>
  );
}
function MiniNode({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "6px 2px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: 8, color: C.dim, fontFamily: mono, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: mono, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

/* ── Detail Panel with Quick Actions ── */
function DetailPanel({
  product, movements, filterType, setFilterType, onClose, onUndo, onAction,
}: {
  product: StockLevel; movements: Movement[]; filterType: string;
  setFilterType: (t: string) => void; onClose: () => void; onUndo: (id: number) => void;
  onAction: (type: string, qty: number) => void;
}) {
  const status = getProductStatus(product);
  const filtered = filterType ? movements.filter(m => m.movementType === filterType) : movements;
  const needsTransfer = product.inWarehouse === 0 && product.inProduction > 0;
  const [actionType, setActionType] = useState<string | null>(null);
  const [actionQty, setActionQty] = useState("");

  const activeAction = QUICK_ACTIONS.find(a => a.type === actionType);

  // Max quantity validation
  const maxQty = actionType === "to_warehouse" ? product.inProduction
    : actionType === "to_sales" ? product.inWarehouse
    : 9999;
  const qtyNum = parseInt(actionQty, 10);
  const canExecute = !isNaN(qtyNum) && qtyNum > 0 && qtyNum <= maxQty;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.2 }}
      style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18,
        padding: "20px", marginTop: 16, position: "relative",
        backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
        backgroundSize: "30px 30px",
      }}
    >
      <button onClick={onClose} style={{
        position: "absolute", top: 14, right: 14, background: "none",
        border: "none", color: C.dim, cursor: "pointer", fontSize: 16,
      }}>✕</button>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: C.accent }}>{product.productSku}</span>
          <div style={{
            fontSize: 9, fontFamily: mono, fontWeight: 700, letterSpacing: 0.8,
            padding: "3px 8px", borderRadius: 6, background: status.bg, color: status.color, border: `1px solid ${status.border}`,
          }}>
            {status.label}
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.mid }}>{product.productName}</div>
      </div>

      {/* Pipeline */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 0,
        padding: "16px 0", marginBottom: 16, background: "rgba(0,0,0,0.2)", borderRadius: 14,
        border: `1px solid ${C.border}`,
      }}>
        <PNode label="ÜRETİMDE" value={product.inProduction} color={C.warn} icon="⚙" />
        <FConn active={product.inProduction > 0} />
        <PNode label="DEPODA" value={product.inWarehouse} color={product.inWarehouse === 0 ? C.err : C.ok} icon="📦"
          alert={needsTransfer ? `${product.inProduction} adet transfer bekliyor` : undefined} />
        <FConn active={product.inWarehouse > 0} />
        <PNode label="SATILAN" value={product.totalSold} color={C.purple} icon="🚚" />
      </div>

      {/* ══ QUICK ACTIONS — Palantir "Actions" pattern ══ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
          ⚡ EYLEMLER
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: actionType ? 10 : 0 }}>
          {QUICK_ACTIONS.map(a => {
            const isActive = actionType === a.type;
            const isDisabled = (a.type === "to_warehouse" && product.inProduction === 0) ||
              (a.type === "to_sales" && product.inWarehouse === 0);
            return (
              <button
                key={a.type}
                onClick={() => { setActionType(isActive ? null : a.type); setActionQty(""); }}
                disabled={isDisabled}
                style={{
                  flex: 1, padding: "10px 8px", borderRadius: 10, cursor: isDisabled ? "default" : "pointer",
                  background: isActive ? a.bg : C.surface,
                  border: `1px solid ${isActive ? a.border : C.border}`,
                  color: isDisabled ? C.dimmer : isActive ? a.color : C.mid,
                  fontFamily: sans, fontSize: 11, fontWeight: 600, textAlign: "center",
                  transition: "all 0.15s", opacity: isDisabled ? 0.4 : 1,
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 2 }}>{a.icon}</div>
                {a.label}
              </button>
            );
          })}
        </div>

        {/* Action execution form */}
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
                  <div style={{ fontSize: 11, color: activeAction.color, fontWeight: 700, marginBottom: 4 }}>
                    {activeAction.icon} {activeAction.desc}
                    {maxQty < 9999 && (
                      <span style={{ color: C.mid, fontWeight: 400 }}> · maks {maxQty} adet</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      inputMode="numeric"
                      placeholder="Adet"
                      value={actionQty}
                      onChange={(e) => setActionQty(e.target.value)}
                      autoFocus
                      style={{
                        width: 100, padding: "8px 10px", borderRadius: 8,
                        background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                        color: C.white, fontFamily: mono, fontSize: 16, fontWeight: 700,
                        textAlign: "center",
                      }}
                    />
                    <button
                      onClick={() => { if (canExecute) { onAction(actionType, qtyNum); setActionType(null); setActionQty(""); } }}
                      disabled={!canExecute}
                      style={{
                        padding: "8px 20px", borderRadius: 8, border: "none",
                        background: canExecute ? activeAction.color : C.dimmer,
                        color: canExecute ? "#000" : C.dim,
                        fontFamily: mono, fontSize: 12, fontWeight: 700, cursor: canExecute ? "pointer" : "default",
                        transition: "all 0.15s",
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

      {/* Transfer recommendation with action */}
      {needsTransfer && !actionType && (
        <div
          onClick={() => { setActionType("to_warehouse"); setActionQty(String(product.inProduction)); }}
          style={{
            padding: "12px 16px", borderRadius: 12, marginBottom: 16, cursor: "pointer",
            background: C.warnDim, border: `1px solid ${C.warnBorder}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            transition: "transform 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.warn }}>⚡ Transfer Önerisi</div>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
              Üretimde {product.inProduction} adet hazır — tıkla ve transfer et
            </div>
          </div>
          <div style={{
            padding: "8px 16px", borderRadius: 8, fontFamily: mono, fontSize: 12, fontWeight: 700,
            background: "rgba(251,191,36,0.2)", color: C.warn, border: `1px solid ${C.warnBorder}`,
          }}>
            TRANSFER ET →
          </div>
        </div>
      )}

      {/* Movement Filter */}
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
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {filtered.length === 0 ? (
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
                <button onClick={(e) => { e.stopPropagation(); onUndo(m.id); }} style={{
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
    </motion.div>
  );
}

function PNode({ label, value, color, icon, alert }: { label: string; value: number; color: string; icon: string; alert?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 20px", position: "relative" }}>
      <div style={{ fontSize: 10, color: C.dim, fontFamily: mono, fontWeight: 600, letterSpacing: 0.8, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color, lineHeight: 1 }}>{value}</div>
      {alert && (
        <div style={{
          position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)",
          fontSize: 8, color: C.warn, fontFamily: mono, whiteSpace: "nowrap", fontWeight: 600,
        }}>↑ {alert}</div>
      )}
    </div>
  );
}
function FConn({ active }: { active: boolean }) {
  return (
    <div style={{ width: 48, display: "flex", alignItems: "center", position: "relative" }}>
      <div style={{
        width: "100%", height: 2,
        background: active
          ? `repeating-linear-gradient(90deg, ${C.accent}80 0px, ${C.accent}80 6px, transparent 6px, transparent 12px)`
          : `repeating-linear-gradient(90deg, ${C.dim}40 0px, ${C.dim}40 4px, transparent 4px, transparent 8px)`,
        backgroundSize: active ? "24px 2px" : "16px 2px",
        animation: active ? "flowRight 0.8s linear infinite" : "none",
      }} />
      <div style={{
        position: "absolute", right: -2, top: "50%", transform: "translateY(-50%)",
        width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent",
        borderLeft: `5px solid ${active ? C.accent + "80" : C.dim + "40"}`,
      }} />
    </div>
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

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════ */
export default function StokDurum() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [activeSet, setActiveSet] = useState<ObjectSetKey>("all");
  const [flashedProductId, setFlashedProductId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const toastIdRef = useRef(0);

  // Data
  const { data: levels = [] } = useQuery<StockLevel[]>({ queryKey: ["/api/stock/levels"] });
  const { data: summary } = useQuery<Summary>({ queryKey: ["/api/stock/summary"] });
  const movementQuery = selectedProductId ? `/api/stock/movements?product_id=${selectedProductId}&limit=30` : null;
  const { data: movements = [] } = useQuery<Movement[]>({ queryKey: [movementQuery], enabled: !!selectedProductId });

  // Object Set counts
  const objectSetCounts = OBJECT_SETS.reduce((acc, os) => {
    acc[os.key] = levels.filter(os.filter).length;
    return acc;
  }, {} as Record<ObjectSetKey, number>);

  // Filtered levels by active Object Set
  const filteredLevels = levels.filter(OBJECT_SETS.find(os => os.key === activeSet)!.filter);

  // WebSocket
  const handleStockUpdate = useCallback((data: StockUpdateEvent) => {
    qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
    qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
    if (selectedProductId) {
      qc.invalidateQueries({ queryKey: [`/api/stock/movements?product_id=${selectedProductId}&limit=30`] });
    }
    setFlashedProductId(data.productId);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashedProductId(null), 700);
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-2), { id, sku: data.productSku, type: data.movementType, qty: data.quantity, ts: Date.now() }]);
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t)), 2500);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, [qc, selectedProductId]);

  const { connected } = useStockWebSocket(handleStockUpdate);

  // Undo
  const undoMutation = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/stock/movements/${id}/undo`, {}); return res.json(); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
      if (movementQuery) qc.invalidateQueries({ queryKey: [movementQuery] });
    },
  });

  // Quick Action — execute movement from detail panel (Palantir "Action" pattern)
  const actionMutation = useMutation({
    mutationFn: async ({ productId, movementType, quantity }: { productId: number; movementType: string; quantity: number }) => {
      const res = await apiRequest("POST", "/api/stock/movements", {
        product_id: productId,
        movement_type: movementType,
        quantity,
        created_by: "yönetim",
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
      if (movementQuery) qc.invalidateQueries({ queryKey: [movementQuery] });
    },
  });

  const handleAction = (type: string, qty: number) => {
    if (selectedProductId) {
      actionMutation.mutate({ productId: selectedProductId, movementType: type, quantity: qty });
    }
  };

  const selectedProduct = levels.find(l => l.productId === selectedProductId);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans,
      backgroundImage: `linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)`,
      backgroundSize: "60px 60px",
    }}>
      <style>{GLOBAL_STYLES}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <ToastStack toasts={toasts} />

      {/* Header — Main hub navigation */}
      <header style={{
        padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0,
        background: "rgba(6,6,10,0.9)", backdropFilter: "blur(12px)", zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>GRISEUS</h1>
            <div style={{ fontSize: 8, color: C.dim, fontFamily: mono, marginTop: 1, letterSpacing: 1 }}>
              MANUFACTURING INTELLIGENCE
            </div>
          </div>
          {/* Nav links */}
          <nav style={{ display: "flex", gap: 2 }}>
            {[
              { path: "/", label: "Stok", active: true },
              { path: "/stok/hareket", label: "Giriş" },
              { path: "/engine", label: "AI Agent" },
              { path: "/intelligence", label: "İstihbarat" },
              { path: "/ontology", label: "Ontoloji" },
            ].map(n => (
              <button key={n.path} onClick={() => navigate(n.path)} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: n.active ? C.accentDim : "transparent",
                border: `1px solid ${n.active ? C.borderActive : "transparent"}`,
                color: n.active ? C.accent : C.dim,
                cursor: "pointer", fontFamily: sans,
                transition: "all 0.15s",
              }}>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LiveBadge connected={connected} />
          <button onClick={() => navigate("/stok/hareket")} style={{
            background: C.okDim, border: `1px solid ${C.okBorder}`,
            borderRadius: 8, padding: "6px 14px", color: C.ok, fontFamily: mono, fontSize: 11, cursor: "pointer", fontWeight: 700,
          }}>+ GİRİŞ</button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <PipelineView summary={summary} />
        <AlertBanner levels={levels} onSelectProduct={(id) => setSelectedProductId(id)} />

        {/* Product Grid */}
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1 }}>
              OBJECT SETS · {filteredLevels.length} NESNE
            </div>
            <div style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>
              Son: {timeAgo(summary?.lastMovementAt ?? null)}
            </div>
          </div>

          <ObjectSetTabs activeSet={activeSet} counts={objectSetCounts} onSelect={setActiveSet} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {filteredLevels.map(level => (
              <ProductCard
                key={level.productId}
                level={level}
                isSelected={selectedProductId === level.productId}
                isFlashing={flashedProductId === level.productId}
                onSelect={() => setSelectedProductId(level.productId === selectedProductId ? null : level.productId)}
              />
            ))}
          </div>

          {filteredLevels.length === 0 && levels.length > 0 && (
            <div style={{
              textAlign: "center", padding: 32, color: C.dim, fontSize: 12,
              background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, marginTop: 8,
            }}>
              Bu filtrede ürün yok
            </div>
          )}
          {levels.length === 0 && (
            <div style={{
              textAlign: "center", padding: 48, color: C.dim, fontSize: 13,
              background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`,
            }}>
              Ürün verisi yükleniyor...
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div style={{ padding: "0 16px", paddingBottom: 40 }}>
          <AnimatePresence>
            {selectedProductId && selectedProduct && (
              <DetailPanel
                product={selectedProduct}
                movements={movements}
                filterType={filterType}
                setFilterType={setFilterType}
                onClose={() => setSelectedProductId(null)}
                onUndo={(id) => undoMutation.mutate(id)}
                onAction={handleAction}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
