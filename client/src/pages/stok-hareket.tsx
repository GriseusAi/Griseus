import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

/* ── Palette ── */
const C = {
  bg: "#08080c", card: "rgba(255,255,255,0.015)", cardBorder: "rgba(255,255,255,0.05)",
  ok: "#34d399", warn: "#fbbf24", err: "#ef4444", white: "#fff", mid: "#999", dim: "#555",
  blue: "#3b82f6", purple: "#818cf8",
};
const mono = "'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";

interface Product { id: number; sku: string; name: string; category: string | null }
interface Movement {
  id: number; productId: number; productSku: string; productName: string;
  movementType: string; quantity: number; note: string | null;
  createdBy: string | null; createdAt: string;
}

const MOVEMENT_TYPES = [
  { value: "produced", label: "Üretildi", icon: "🔨", color: C.ok, desc: "Üretim stokuna ekle" },
  { value: "to_warehouse", label: "Depoya Transfer", icon: "📦", color: C.blue, desc: "Üretimden depoya" },
  { value: "to_sales", label: "Satışa Çıktı", icon: "🚚", color: C.purple, desc: "Depodan satışa" },
  { value: "raw_material_in", label: "Hammadde Girişi", icon: "🏗️", color: C.warn, desc: "Hammadde stokuna ekle" },
  { value: "inventory_count", label: "Sayım Girişi", icon: "📋", color: "#f97316", desc: "Stoku elle set et" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dk önce`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function movementLabel(type: string): string {
  if (type === "undo") return "Geri Alındı";
  return MOVEMENT_TYPES.find(m => m.value === type)?.label || type;
}
function movementColor(type: string): string {
  if (type === "undo") return C.err;
  return MOVEMENT_TYPES.find(m => m.value === type)?.color || C.mid;
}

export default function StokHareket() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [selectedProduct, setSelectedProduct] = useState<number | "">("");
  const [quantity, setQuantity] = useState("");
  const [movementType, setMovementType] = useState("");
  const [countTarget, setCountTarget] = useState<"warehouse" | "production">("warehouse");
  const [note, setNote] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch products
  const { data: productList = [] } = useQuery<Product[]>({
    queryKey: ["/api/stock/products"],
  });

  // Fetch recent movements
  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: ["/api/stock/movements?limit=10"],
    refetchInterval: 10000,
  });

  // Create movement
  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        product_id: selectedProduct,
        movement_type: movementType,
        quantity: parseInt(quantity, 10),
        note: note || undefined,
      };
      if (movementType === "inventory_count") body.target = countTarget;
      const res = await apiRequest("POST", "/api/stock/movements", body);
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessMsg(`Kaydedildi! Üretimde: ${data.stockLevel.inProduction}, Depoda: ${data.stockLevel.inWarehouse}, Satılan: ${data.stockLevel.totalSold}`);
      setErrorMsg("");
      setQuantity("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["/api/stock/movements?limit=10"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: Error) => {
      try {
        const parsed = JSON.parse(err.message.replace(/^\d+:\s*/, ""));
        setErrorMsg(parsed.error || err.message);
      } catch {
        setErrorMsg(err.message);
      }
      setSuccessMsg("");
    },
  });

  // Undo movement
  const undoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/stock/movements/${id}/undo`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock/movements?limit=10"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
    },
    onError: (err: Error) => {
      try {
        const parsed = JSON.parse(err.message.replace(/^\d+:\s*/, ""));
        setErrorMsg(parsed.error || err.message);
      } catch {
        setErrorMsg(err.message);
      }
    },
  });

  const qtyNum = parseInt(quantity, 10);
  const canSubmit = selectedProduct !== "" && quantity !== "" && !isNaN(qtyNum) &&
    (movementType === "inventory_count" ? qtyNum >= 0 : qtyNum > 0) &&
    movementType && !createMutation.isPending;

  const selectedProductInfo = productList.find(p => p.id === selectedProduct);

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
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Hızlı Stok Girişi</h1>
        </div>
        <button onClick={() => navigate("/stok/durum")} style={{
          background: "rgba(59,130,246,0.1)", border: `1px solid rgba(59,130,246,0.3)`,
          borderRadius: 8, padding: "6px 12px", color: C.blue, fontFamily: sans, fontSize: 12, cursor: "pointer",
        }}>
          Stok Durumu →
        </button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: "16px", maxWidth: 600, margin: "0 auto" }}
      >
        {/* ── FORM ── */}
        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: "20px 16px",
        }}>
          {/* 1. Ürün Seç */}
          <label style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 6, fontWeight: 600 }}>
            1. ÜRÜN SEÇ
          </label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value ? Number(e.target.value) : "")}
            style={{
              width: "100%", padding: "14px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.05)", border: `1px solid ${C.cardBorder}`,
              color: C.white, fontFamily: mono, fontSize: 15, marginBottom: 16,
              appearance: "none", WebkitAppearance: "none",
            }}
          >
            <option value="">-- Ürün seç --</option>
            {productList.map(p => (
              <option key={p.id} value={p.id} style={{ background: "#1a1a2e", color: C.white }}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>

          {/* 2. Adet */}
          <label style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 6, fontWeight: 600 }}>
            2. ADET
          </label>
          <input
            type="number"
            min={movementType === "inventory_count" ? 0 : 1}
            inputMode="numeric"
            placeholder={movementType === "inventory_count" ? "Mevcut adet (örn: 42)" : "Kaç adet?"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{
              width: "100%", padding: "14px 12px", borderRadius: 10, boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${C.cardBorder}`,
              color: C.white, fontFamily: mono, fontSize: 20, fontWeight: 700, marginBottom: 16,
              textAlign: "center",
            }}
          />

          {/* 3. Hareket Tipi */}
          <label style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 8, fontWeight: 600 }}>
            3. HAREKET TİPİ
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {MOVEMENT_TYPES.map(mt => (
              <button
                key={mt.value}
                onClick={() => setMovementType(mt.value)}
                style={{
                  padding: "14px 8px", borderRadius: 12, cursor: "pointer",
                  background: movementType === mt.value ? `${mt.color}15` : "rgba(255,255,255,0.02)",
                  border: `2px solid ${movementType === mt.value ? mt.color : C.cardBorder}`,
                  color: movementType === mt.value ? mt.color : C.mid,
                  fontFamily: sans, fontSize: 13, fontWeight: 600, textAlign: "center",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{mt.icon}</div>
                {mt.label}
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{mt.desc}</div>
              </button>
            ))}
          </div>

          {/* Inventory count target selector */}
          {movementType === "inventory_count" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 6, fontWeight: 600 }}>
                NEREYE SAYIM?
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { value: "warehouse" as const, label: "Depoda", icon: "📦" },
                  { value: "production" as const, label: "Üretimde", icon: "🔨" },
                ] as const).map(t => (
                  <button
                    key={t.value}
                    onClick={() => setCountTarget(t.value)}
                    style={{
                      flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                      background: countTarget === t.value ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.02)",
                      border: `2px solid ${countTarget === t.value ? "#f97316" : C.cardBorder}`,
                      color: countTarget === t.value ? "#f97316" : C.mid,
                      fontFamily: sans, fontSize: 14, fontWeight: 600, textAlign: "center",
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <label style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 6, fontWeight: 600 }}>
            NOT (opsiyonel)
          </label>
          <input
            type="text"
            placeholder="Örn: Müşteri X için ayrıldı"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${C.cardBorder}`,
              color: C.white, fontFamily: sans, fontSize: 13, marginBottom: 16,
            }}
          />

          {/* Submit */}
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            style={{
              width: "100%", padding: "18px", borderRadius: 12, border: "none",
              background: canSubmit ? C.ok : "rgba(255,255,255,0.05)",
              color: canSubmit ? "#000" : C.dim,
              fontFamily: sans, fontSize: 18, fontWeight: 700, cursor: canSubmit ? "pointer" : "default",
              transition: "all 0.2s",
            }}
          >
            {createMutation.isPending ? "Kaydediliyor..." : "KAYDET"}
          </button>

          {/* Feedback */}
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 12, padding: "12px 14px", borderRadius: 10,
                background: `${C.ok}15`, border: `1px solid ${C.ok}40`,
                color: C.ok, fontSize: 13, fontFamily: mono,
              }}
            >
              {successMsg}
            </motion.div>
          )}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 12, padding: "12px 14px", borderRadius: 10,
                background: `${C.err}15`, border: `1px solid ${C.err}40`,
                color: C.err, fontSize: 13, fontFamily: mono,
              }}
            >
              {errorMsg}
            </motion.div>
          )}
        </div>

        {/* ── SON HAREKETLER ── */}
        <h2 style={{ fontSize: 13, fontWeight: 600, color: C.mid, marginTop: 24, marginBottom: 12, letterSpacing: 1 }}>
          SON HAREKETLER
        </h2>
        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, overflow: "hidden",
        }}>
          {movements.length === 0 ? (
            <div style={{ textAlign: "center", color: C.dim, padding: 32, fontSize: 13 }}>
              Henüz hareket yok — yukarıdan ilk girişi yap
            </div>
          ) : (
            movements.map((m, i) => (
              <div
                key={m.id}
                style={{
                  padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
                  borderBottom: i < movements.length - 1 ? `1px solid ${C.cardBorder}` : "none",
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${movementColor(m.movementType)}12`, fontSize: 16, flexShrink: 0,
                }}>
                  {m.movementType === "undo" ? "↩️" : MOVEMENT_TYPES.find(t => t.value === m.movementType)?.icon || "?"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: movementColor(m.movementType) }}>
                    {m.movementType === "undo" ? "Geri Alındı" : movementLabel(m.movementType)} — {m.quantity} adet
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    {m.productSku} · {timeAgo(m.createdAt)}{m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>

                {/* Undo button */}
                {m.movementType !== "undo" && (
                  <button
                    onClick={() => undoMutation.mutate(m.id)}
                    disabled={undoMutation.isPending}
                    style={{
                      background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.2)`,
                      borderRadius: 8, padding: "6px 10px", color: C.err, fontSize: 11, fontWeight: 600,
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
      </motion.div>
    </div>
  );
}
