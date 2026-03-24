import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

/* ── Palette ── */
const C = {
  bg: "#08080c", card: "rgba(255,255,255,0.015)", cardBorder: "rgba(255,255,255,0.05)",
  ok: "#34d399", warn: "#fbbf24", err: "#ef4444", white: "#fff", mid: "#999", dim: "#555",
  blue: "#3b82f6", purple: "#818cf8",
};
const mono = "'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Hiç";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dk önce`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function movementLabel(type: string): string {
  const map: Record<string, string> = {
    produced: "Üretildi", to_warehouse: "Depoya Transfer", to_sales: "Satışa Çıktı",
    raw_material_in: "Hammadde Girişi", inventory_count: "Sayım Girişi", undo: "Geri Alındı",
  };
  return map[type] || type;
}

function movementColor(type: string): string {
  const map: Record<string, string> = {
    produced: C.ok, to_warehouse: C.blue, to_sales: C.purple,
    raw_material_in: C.warn, inventory_count: "#f97316", undo: C.err,
  };
  return map[type] || C.mid;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/* ── Summary Card ── */
function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "14px 16px",
      flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: mono, color }}>{value}</div>
    </div>
  );
}

export default function StokDurum() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("");

  // Fetch stock levels
  const { data: levels = [] } = useQuery<StockLevel[]>({
    queryKey: ["/api/stock/levels"],
    refetchInterval: 10000,
  });

  // Fetch summary
  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/stock/summary"],
    refetchInterval: 10000,
  });

  // Fetch movements for selected product
  const movementQuery = selectedProductId
    ? `/api/stock/movements?product_id=${selectedProductId}&limit=30`
    : null;
  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: [movementQuery],
    enabled: !!selectedProductId,
    refetchInterval: 10000,
  });

  // Undo
  const undoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/stock/movements/${id}/undo`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
      if (movementQuery) qc.invalidateQueries({ queryKey: [movementQuery] });
    },
  });

  const selectedProduct = levels.find(l => l.productId === selectedProductId);

  const filteredMovements = filterType
    ? movements.filter(m => m.movementType === filterType)
    : movements;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{
        padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.cardBorder}`, position: "sticky", top: 0, background: C.bg, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/engine")} style={{
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.cardBorder}`,
            borderRadius: 8, padding: "6px 12px", color: C.mid, fontFamily: sans, fontSize: 13, cursor: "pointer",
          }}>
            ← Motor
          </button>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Stok Durumu</h1>
        </div>
        <button onClick={() => navigate("/stok/hareket")} style={{
          background: "rgba(52,211,153,0.1)", border: `1px solid rgba(52,211,153,0.3)`,
          borderRadius: 8, padding: "6px 12px", color: C.ok, fontFamily: sans, fontSize: 12, cursor: "pointer", fontWeight: 600,
        }}>
          + Hızlı Giriş
        </button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: "16px", maxWidth: 1000, margin: "0 auto" }}
      >
        {/* ── SUMMARY CARDS ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryCard label="ÜRETİMDE" value={summary?.totalInProduction ?? 0} color={C.warn} />
          <SummaryCard label="DEPODA" value={summary?.totalInWarehouse ?? 0} color={C.ok} />
          <SummaryCard label="BUGÜN SATILAN" value={summary?.todaySold ?? 0} color={C.purple} />
          <SummaryCard label="SON GÜNCELLEME" value={timeAgo(summary?.lastMovementAt ?? null)} color={C.mid} />
        </div>

        {/* ── PRODUCT TABLE ── */}
        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, overflow: "hidden",
        }}>
          {/* Header row */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1.5fr repeat(3, 80px) 90px",
            padding: "10px 14px", borderBottom: `1px solid ${C.cardBorder}`,
            fontSize: 11, color: C.dim, fontFamily: mono, fontWeight: 600, gap: 8,
          }}>
            <div>KOD</div>
            <div>ÜRÜN</div>
            <div style={{ textAlign: "right" }}>ÜRETİMDE</div>
            <div style={{ textAlign: "right" }}>DEPODA</div>
            <div style={{ textAlign: "right" }}>SATILAN</div>
            <div style={{ textAlign: "right" }}>SON</div>
          </div>

          {levels.map((level) => {
            const isLow = level.inWarehouse > 0 && level.inWarehouse < 5;
            const isEmpty = level.inWarehouse === 0 && level.totalSold > 0;
            const rowBg = isEmpty ? "rgba(239,68,68,0.04)" : isLow ? "rgba(251,191,36,0.04)" : "transparent";

            return (
              <div
                key={level.productId}
                onClick={() => setSelectedProductId(level.productId === selectedProductId ? null : level.productId)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 1.5fr repeat(3, 80px) 90px",
                  padding: "12px 14px", borderBottom: `1px solid ${C.cardBorder}`,
                  cursor: "pointer", transition: "background 0.15s", background: rowBg, gap: 8,
                  borderLeft: selectedProductId === level.productId ? `3px solid ${C.blue}` : "3px solid transparent",
                }}
                onMouseEnter={(e) => { if (!isEmpty && !isLow) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
              >
                <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: C.white }}>{level.productSku}</div>
                <div style={{ fontSize: 12, color: C.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{level.productName}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 13, fontWeight: 600, color: level.inProduction > 0 ? C.warn : C.dim }}>
                  {level.inProduction}
                </div>
                <div style={{
                  textAlign: "right", fontFamily: mono, fontSize: 13, fontWeight: 600,
                  color: isEmpty ? C.err : isLow ? C.warn : level.inWarehouse > 0 ? C.ok : C.dim,
                }}>
                  {level.inWarehouse}
                  {isEmpty && <span style={{ fontSize: 9, marginLeft: 4 }}>!</span>}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: level.totalSold > 0 ? C.purple : C.dim }}>
                  {level.totalSold}
                </div>
                <div style={{ textAlign: "right", fontSize: 10, color: C.dim }}>{timeAgo(level.updatedAt)}</div>
              </div>
            );
          })}

          {levels.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: C.dim, fontSize: 13 }}>
              Ürün verisi yükleniyor...
            </div>
          )}
        </div>

        {/* ── MOVEMENT HISTORY DRAWER ── */}
        <AnimatePresence>
          {selectedProductId && selectedProduct && (
            <motion.div
              key="drawer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden", marginTop: 16 }}
            >
              <div style={{
                background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: "16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: C.blue }}>
                      {selectedProduct.productSku}
                    </span>
                    <span style={{ fontSize: 13, color: C.mid, marginLeft: 8 }}>{selectedProduct.productName}</span>
                  </div>
                  <button
                    onClick={() => setSelectedProductId(null)}
                    style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 18 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Current stock summary */}
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", fontSize: 12, fontFamily: mono }}>
                    <span style={{ color: C.dim }}>Üretimde: </span>
                    <span style={{ color: C.warn, fontWeight: 700 }}>{selectedProduct.inProduction}</span>
                  </div>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(52,211,153,0.08)", fontSize: 12, fontFamily: mono }}>
                    <span style={{ color: C.dim }}>Depoda: </span>
                    <span style={{ color: C.ok, fontWeight: 700 }}>{selectedProduct.inWarehouse}</span>
                  </div>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(129,140,248,0.08)", fontSize: 12, fontFamily: mono }}>
                    <span style={{ color: C.dim }}>Satılan: </span>
                    <span style={{ color: C.purple, fontWeight: 700 }}>{selectedProduct.totalSold}</span>
                  </div>
                </div>

                {/* Filter */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {[
                    { value: "", label: "Tümü" },
                    { value: "produced", label: "Üretim" },
                    { value: "to_warehouse", label: "Depo" },
                    { value: "to_sales", label: "Satış" },
                    { value: "inventory_count", label: "Sayım" },
                    { value: "undo", label: "Geri Al" },
                  ].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFilterType(f.value)}
                      style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: filterType === f.value ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${filterType === f.value ? "rgba(255,255,255,0.2)" : C.cardBorder}`,
                        color: filterType === f.value ? C.white : C.dim,
                        cursor: "pointer", fontFamily: sans,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Movement list */}
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {filteredMovements.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: C.dim, fontSize: 12 }}>
                      Hareket bulunamadı
                    </div>
                  ) : (
                    filteredMovements.map((m, i) => (
                      <div
                        key={m.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                          borderBottom: i < filteredMovements.length - 1 ? `1px solid ${C.cardBorder}` : "none",
                        }}
                      >
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%", background: movementColor(m.movementType), flexShrink: 0,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: movementColor(m.movementType), fontWeight: 600 }}>
                            {movementLabel(m.movementType)} — {m.quantity} adet
                          </div>
                          <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                            {formatDate(m.createdAt)} · {m.createdBy || "?"}{m.note ? ` · ${m.note}` : ""}
                          </div>
                        </div>
                        {m.movementType !== "undo" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); undoMutation.mutate(m.id); }}
                            style={{
                              background: "rgba(239,68,68,0.06)", border: `1px solid rgba(239,68,68,0.15)`,
                              borderRadius: 6, padding: "4px 8px", color: C.err, fontSize: 10,
                              fontFamily: sans, cursor: "pointer", flexShrink: 0,
                            }}
                          >
                            Geri Al
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
