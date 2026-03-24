import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";

/* ── Palette — matches stok-durum ── */
const C = {
  bg: "#06060a", surface: "rgba(255,255,255,0.02)", surfaceHover: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)", borderActive: "rgba(99,102,241,0.4)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.15)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.12)", okBorder: "rgba(52,211,153,0.25)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.10)", warnBorder: "rgba(251,191,36,0.25)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.08)", errBorder: "rgba(239,68,68,0.2)",
  blue: "#60a5fa", purple: "#a78bfa",
  white: "#f0f0f5", mid: "#8888a0", dim: "#4a4a60",
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
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [selectedProduct, setSelectedProduct] = useState<number | "">("");
  const [quantity, setQuantity] = useState("");
  const [movementType, setMovementType] = useState("");
  const [countTarget, setCountTarget] = useState<"warehouse" | "production">("warehouse");
  const [note, setNote] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: productList = [] } = useQuery<Product[]>({ queryKey: ["/api/stock/products"] });
  const { data: movements = [] } = useQuery<Movement[]>({ queryKey: ["/api/stock/movements?limit=10"] });

  const handleWsUpdate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/stock/movements?limit=10"] });
  }, [qc]);
  const { connected } = useStockWebSocket(handleWsUpdate);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = { product_id: selectedProduct, movement_type: movementType, quantity: parseInt(quantity, 10), note: note || undefined };
      if (movementType === "inventory_count") body.target = countTarget;
      const res = await apiRequest("POST", "/api/stock/movements", body);
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessMsg(`Kaydedildi! P:${data.stockLevel.inProduction} D:${data.stockLevel.inWarehouse} S:${data.stockLevel.totalSold}`);
      setErrorMsg("");
      setQuantity("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["/api/stock/movements?limit=10"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: Error) => {
      try { setErrorMsg(JSON.parse(err.message.replace(/^\d+:\s*/, "")).error || err.message); }
      catch { setErrorMsg(err.message); }
      setSuccessMsg("");
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/stock/movements/${id}/undo`, {}); return res.json(); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock/movements?limit=10"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
      qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
    },
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
      backgroundImage: `
        linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)
      `,
      backgroundSize: "60px 60px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header — Unified nav */}
      <header style={{
        padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0,
        background: "rgba(6,6,10,0.9)", backdropFilter: "blur(12px)", zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>GRISEUS</h1>
            <div style={{ fontSize: 8, color: C.dim, fontFamily: mono, marginTop: 1, letterSpacing: 1 }}>
              MANUFACTURING INTELLIGENCE
            </div>
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {[
              { path: "/", label: "Stok" },
              { path: "/stok/hareket", label: "Giriş", active: true },
              { path: "/engine", label: "AI Agent" },
              { path: "/intelligence", label: "İstihbarat" },
              { path: "/ontology", label: "Ontoloji" },
            ].map(n => (
              <button key={n.path} onClick={() => navigate(n.path)} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: n.active ? C.accentDim : "transparent",
                border: `1px solid ${n.active ? "rgba(99,102,241,0.4)" : "transparent"}`,
                color: n.active ? C.accent : C.dim,
                cursor: "pointer", fontFamily: sans, transition: "all 0.15s",
              }}>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20,
            background: connected ? C.okDim : C.errDim,
            border: `1px solid ${connected ? C.okBorder : C.errBorder}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", background: connected ? C.ok : C.err,
              boxShadow: connected ? `0 0 8px ${C.ok}` : "none",
            }} />
            <span style={{ fontSize: 10, fontFamily: mono, color: connected ? C.ok : C.err, fontWeight: 600 }}>
              {connected ? "CANLI" : "KESİLDİ"}
            </span>
          </div>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: "16px", maxWidth: 560, margin: "0 auto" }}
      >
        {/* ── FORM ── */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "20px 16px",
        }}>
          {/* 1. Ürün Seç */}
          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
            1 · ÜRÜN SEÇ
          </label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value ? Number(e.target.value) : "")}
            style={{
              width: "100%", padding: "14px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              color: C.white, fontFamily: mono, fontSize: 14, marginBottom: 16,
              appearance: "none", WebkitAppearance: "none",
            }}
          >
            <option value="">— Ürün seç —</option>
            {productList.map(p => (
              <option key={p.id} value={p.id} style={{ background: "#0a0a14", color: C.white }}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>

          {/* 2. Adet */}
          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
            2 · ADET
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

          {/* 3. Hareket Tipi */}
          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 8, fontWeight: 700, fontFamily: mono, letterSpacing: 1 }}>
            3 · HAREKET TİPİ
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
                {/* Timeline dot */}
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
