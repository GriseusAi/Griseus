import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ── Palette ── */
const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.08)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.06)", okBorder: "rgba(52,211,153,0.15)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.06)", warnBorder: "rgba(251,191,36,0.15)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.05)", errBorder: "rgba(239,68,68,0.12)",
  blue: "#60a5fa", purple: "#a78bfa",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60",
};
const mono = "'Space Mono', monospace";
const sans = "'Outfit', sans-serif";

interface Product { id: number; sku: string; name: string; category: string | null }
interface Movement {
  id: number; productId: number; productSku: string; productName: string;
  movementType: string; quantity: number; note: string | null;
  createdBy: string | null; createdAt: string;
}

const MOVEMENT_TYPES = [
  { value: "produced", label: "Üretildi", icon: "⚙", color: C.ok, desc: "Üretim stokuna ekle" },
  { value: "to_warehouse", label: "Depoya Transfer", icon: "📦", color: C.blue, desc: "Üretimden depoya" },
  { value: "to_sales", label: "Satışa Çıktı", icon: "🚚", color: C.purple, desc: "Depodan satışa" },
  { value: "raw_material_in", label: "Hammadde Girişi", icon: "🏗️", color: C.warn, desc: "Hammadde stokuna" },
  { value: "inventory_count", label: "Sayım Girişi", icon: "📋", color: "#f97316", desc: "Stoku elle set et" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min}dk`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}sa`;
  return `${Math.floor(hours / 24)}g`;
}

const moveLabel: Record<string, string> = {
  produced: "Üretildi", to_warehouse: "Depoya Transfer", to_sales: "Satışa Çıktı",
  raw_material_in: "Hammadde", inventory_count: "Sayım", undo: "Geri Alındı",
};
const moveColor: Record<string, string> = {
  produced: C.ok, to_warehouse: C.blue, to_sales: C.purple,
  raw_material_in: C.warn, inventory_count: "#f97316", undo: C.err,
};

export default function StokHareket() {
  const qc = useQueryClient();

  const [selectedProduct, setSelectedProduct] = useState<number | "">("");
  const [quantity, setQuantity] = useState("");
  const [movementType, setMovementType] = useState("");
  const [countTarget, setCountTarget] = useState<"warehouse" | "production">("warehouse");
  const [note, setNote] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Only fetch ELT.7-11 product
  const { data: productList = [] } = useQuery<Product[]>({ queryKey: ["/api/stock/products"] });
  const eltProducts = productList.filter(p => p.sku === "ELT.7-11");

  // Auto-select ELT.7-11 when loaded
  const eltProduct = eltProducts[0];
  if (eltProduct && selectedProduct === "") {
    setSelectedProduct(eltProduct.id);
  }

  const { data: movements = [] } = useQuery<Movement[]>({ queryKey: ["/api/stock/movements?limit=15"] });

  const handleWsUpdate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/stock/movements?limit=15"] });
  }, [qc]);
  const { connected } = useStockWebSocket(handleWsUpdate);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = { product_id: selectedProduct, movement_type: movementType, quantity: parseInt(quantity, 10), note: note || undefined, created_by: "üretim_şefi" };
      if (movementType === "inventory_count") body.target = countTarget;
      const res = await apiRequest("POST", "/api/stock/movements", body);
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessMsg(`Kaydedildi! Üretimde: ${data.stockLevel.inProduction} · Depoda: ${data.stockLevel.inWarehouse} · Satılan: ${data.stockLevel.totalSold}`);
      setErrorMsg("");
      setQuantity("");
      setNote("");
      setMovementType("");
      qc.invalidateQueries();
      setTimeout(() => setSuccessMsg(""), 5000);
    },
    onError: (err: Error) => {
      try { setErrorMsg(JSON.parse(err.message.replace(/^\d+:\s*/, "")).error || err.message); }
      catch { setErrorMsg(err.message); }
      setSuccessMsg("");
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/stock/movements/${id}/undo`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries(); },
    onError: (err: Error) => {
      try { setErrorMsg(JSON.parse(err.message.replace(/^\d+:\s*/, "")).error || err.message); }
      catch { setErrorMsg(err.message); }
    },
  });

  const qtyNum = parseInt(quantity, 10);
  const canSubmit = selectedProduct !== "" && quantity !== "" && !isNaN(qtyNum) &&
    (movementType === "inventory_count" ? qtyNum >= 0 : qtyNum > 0) &&
    movementType && !createMutation.isPending;

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans,
      position: "relative", overflow: "hidden",
    }}>
      <div className="glass-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <TopNav connected={connected} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: "16px", maxWidth: 560, margin: "0 auto", position: "relative", zIndex: 1 }}
      >
        {/* ── Product Header ── */}
        <div style={{
          textAlign: "center", padding: "20px 0 16px",
        }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 2, marginBottom: 6 }}>
            STOK HAREKETİ GİRİŞİ
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>
            <span style={{ color: C.accent }}>ELT.7-11</span> — Goldsun Elite
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            Seramik Plakalı Camlı Radyant Isıtıcı
          </div>
        </div>

        {/* ── FORM ── */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "20px 16px",
        }}>

          {/* 1. Adet */}
          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
            1 · ADET
          </label>
          <input
            type="number"
            min={movementType === "inventory_count" ? 0 : 1}
            inputMode="numeric"
            placeholder={movementType === "inventory_count" ? "Mevcut adet" : "Kaç adet?"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{
              width: "100%", padding: "14px 12px", borderRadius: 10, boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              color: C.white, fontFamily: mono, fontSize: 22, fontWeight: 700, marginBottom: 16,
              textAlign: "center",
            }}
          />

          {/* 2. Hareket Tipi */}
          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 8, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
            2 · HAREKET TİPİ
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {MOVEMENT_TYPES.map(mt => (
              <button
                key={mt.value}
                onClick={() => setMovementType(mt.value)}
                style={{
                  padding: "14px 8px", borderRadius: 12, cursor: "pointer",
                  background: movementType === mt.value ? `${mt.color}12` : C.surface,
                  border: `2px solid ${movementType === mt.value ? mt.color : C.border}`,
                  color: movementType === mt.value ? mt.color : C.dim,
                  fontFamily: sans, fontSize: 13, fontWeight: 600, textAlign: "center",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>{mt.icon}</div>
                {mt.label}
                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.6 }}>{mt.desc}</div>
              </button>
            ))}
          </div>

          {/* Inventory count target */}
          {movementType === "inventory_count" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
                NEREYE SAYIM?
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { value: "warehouse" as const, label: "Depoda", icon: "📦" },
                  { value: "production" as const, label: "Üretimde", icon: "⚙" },
                ] as const).map(t => (
                  <button key={t.value} onClick={() => setCountTarget(t.value)} style={{
                    flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                    background: countTarget === t.value ? "rgba(249,115,22,0.1)" : C.surface,
                    border: `2px solid ${countTarget === t.value ? "#f97316" : C.border}`,
                    color: countTarget === t.value ? "#f97316" : C.dim,
                    fontFamily: sans, fontSize: 14, fontWeight: 600, textAlign: "center",
                  }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
            NOT (opsiyonel)
          </label>
          <input
            type="text"
            placeholder="Örn: Müşteri X için ayrıldı"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              color: C.white, fontFamily: sans, fontSize: 13, marginBottom: 16,
            }}
          />

          {/* Submit */}
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            style={{
              width: "100%", padding: "18px", borderRadius: 12, border: "none",
              background: canSubmit
                ? `linear-gradient(135deg, ${C.ok}, #2dd4a0)`
                : "rgba(255,255,255,0.04)",
              color: canSubmit ? "#000" : C.dim,
              fontFamily: mono, fontSize: 16, fontWeight: 700, cursor: canSubmit ? "pointer" : "default",
              transition: "all 0.2s", letterSpacing: 1,
            }}
          >
            {createMutation.isPending ? "KAYDEDİLİYOR..." : "KAYDET"}
          </button>

          {/* Feedback */}
          {successMsg && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 10,
              background: C.okDim, border: `1px solid ${C.okBorder}`,
              color: C.ok, fontSize: 12, fontFamily: mono,
            }}>
              ✓ {successMsg}
            </motion.div>
          )}
          {errorMsg && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 10,
              background: C.errDim, border: `1px solid ${C.errBorder}`,
              color: C.err, fontSize: 12, fontFamily: mono,
            }}>
              ✕ {errorMsg}
            </motion.div>
          )}
        </div>

        {/* ── SON HAREKETLER ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 24, marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.dim, letterSpacing: 1 }}>
            SON HAREKETLER
          </div>
          <div style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>
            Canlı akış
          </div>
        </div>
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden",
        }}>
          {movements.length === 0 ? (
            <div style={{ textAlign: "center", color: C.dim, padding: 32, fontSize: 12 }}>
              Henüz hareket yok — yukarıdan ilk girişi yap
            </div>
          ) : (
            movements.map((m, i) => (
              <div key={m.id} style={{
                padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
                borderBottom: i < movements.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${moveColor[m.movementType] || C.mid}10`, fontSize: 14, flexShrink: 0,
                }}>
                  {m.movementType === "undo" ? "↩" : MOVEMENT_TYPES.find(t => t.value === m.movementType)?.icon || "?"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: moveColor[m.movementType] || C.mid }}>
                    {moveLabel[m.movementType] || m.movementType} — {m.quantity} adet
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                    <span style={{ fontFamily: mono, fontWeight: 600, color: C.mid }}>{m.productSku}</span>
                    {" · "}{timeAgo(m.createdAt)}{m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>

                {m.movementType !== "undo" && (
                  <button onClick={() => undoMutation.mutate(m.id)} disabled={undoMutation.isPending} style={{
                    background: C.errDim, border: `1px solid ${C.errBorder}`,
                    borderRadius: 8, padding: "5px 10px", color: C.err, fontSize: 10, fontWeight: 600,
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
    </div>
  );
}
