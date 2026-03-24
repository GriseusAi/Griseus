import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ── Palette (matches cukurova-overview) ── */
const C = {
  bg: "#08080c",
  card: "rgba(255,255,255,0.015)",
  cardBorder: "rgba(255,255,255,0.05)",
  elektrik: "#818cf8",
  gaz: "#f472b6",
  ok: "#34d399",
  warn: "#fbbf24",
  err: "#ef4444",
  white: "#fff",
  mid: "#999",
  dim: "#555",
  blue: "#3b82f6",
};

const mono = "'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Types ── */
interface StockData {
  confirmed: number;
  pendingProduction: number;
  pendingSales: number;
  predicted: number;
  blindSpotHours: number;
  confidence: number;
  status: "in_sync" | "drifting" | "stale" | "critical";
}

interface StockResponse {
  product: { id: number; name: string; sku: string };
  stock: StockData;
  confirmedUpdatedAt: string | null;
  predictedUpdatedAt: string | null;
}

interface Movement {
  id: string;
  productId: number;
  movementType: string;
  quantity: number;
  source: string;
  referenceId: string | null;
  enteredBy: string | null;
  enteredAt: string;
  syncedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface MovementsResponse {
  product: string;
  movements: Movement[];
}

/* ── Helpers ── */
function statusColor(status: string) {
  switch (status) {
    case "in_sync": return C.ok;
    case "drifting": return C.warn;
    case "stale": return "#f97316";
    case "critical": return C.err;
    default: return C.mid;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "in_sync": return "Senkron";
    case "drifting": return "Kayıyor";
    case "stale": return "Bayat";
    case "critical": return "Kritik";
    default: return status;
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Hiç";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Az önce";
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Dün";
  return `${days} gün önce`;
}

function movementIcon(type: string) {
  switch (type) {
    case "production": return "+";
    case "sale": return "-";
    case "adjustment": return "~";
    case "return": return "+";
    case "transfer": return "→";
    default: return "?";
  }
}

function movementLabel(type: string) {
  switch (type) {
    case "production": return "Üretim";
    case "sale": return "Satış";
    case "adjustment": return "Düzeltme";
    case "return": return "İade";
    case "transfer": return "Transfer";
    default: return type;
  }
}

/* ── Card Component ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 12,
        padding: "20px 24px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Confidence Bar ── */
function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? C.ok : value >= 50 ? C.warn : C.err;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontFamily: mono, fontSize: 13, color: C.mid }}>Güven Skoru:</span>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: color, borderRadius: 4 }}
        />
      </div>
      <span style={{ fontFamily: mono, fontSize: 14, color, minWidth: 40 }}>%{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ProductDetail() {
  const [, params] = useRoute("/product/:productCode");
  const [, navigate] = useLocation();
  const productCode = params?.productCode || "";
  const qc = useQueryClient();

  // State for quick entry forms
  const [prodQty, setProdQty] = useState("");
  const [saleQty, setSaleQty] = useState("");

  // Fetch stock data
  const { data: stockData, isLoading: stockLoading, error: stockError } = useQuery<StockResponse>({
    queryKey: [`/api/ontology/stock/${productCode}`],
    enabled: !!productCode,
    refetchInterval: 30000, // refresh every 30s
  });

  // Fetch movements
  const { data: movementsData } = useQuery<MovementsResponse>({
    queryKey: [`/api/ontology/stock/${productCode}/movements`],
    enabled: !!productCode,
    refetchInterval: 30000,
  });

  // Production mutation
  const prodMutation = useMutation({
    mutationFn: async (qty: number) => {
      const res = await apiRequest("POST", "/api/ontology/stock/production", {
        product_code: productCode,
        quantity: qty,
      });
      return res.json();
    },
    onSuccess: () => {
      setProdQty("");
      qc.invalidateQueries({ queryKey: [`/api/ontology/stock/${productCode}`] });
      qc.invalidateQueries({ queryKey: [`/api/ontology/stock/${productCode}/movements`] });
    },
  });

  // Sale mutation
  const saleMutation = useMutation({
    mutationFn: async (qty: number) => {
      const res = await apiRequest("POST", "/api/ontology/stock/sale", {
        product_code: productCode,
        quantity: qty,
      });
      return res.json();
    },
    onSuccess: () => {
      setSaleQty("");
      qc.invalidateQueries({ queryKey: [`/api/ontology/stock/${productCode}`] });
      qc.invalidateQueries({ queryKey: [`/api/ontology/stock/${productCode}/movements`] });
    },
  });

  const stock = stockData?.stock;
  const product = stockData?.product;
  const movements = movementsData?.movements || [];

  // Monthly forecast placeholder (mock data based on seasonal pattern)
  const forecastData = [
    { ay: "Oca", tahmin: 80 }, { ay: "Şub", tahmin: 90 }, { ay: "Mar", tahmin: 120 },
    { ay: "Nis", tahmin: 150 }, { ay: "May", tahmin: 180 }, { ay: "Haz", tahmin: 200 },
    { ay: "Tem", tahmin: 160 }, { ay: "Ağu", tahmin: 250 }, { ay: "Eyl", tahmin: 300 },
    { ay: "Eki", tahmin: 220 }, { ay: "Kas", tahmin: 140 }, { ay: "Ara", tahmin: 60 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header
        style={{
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${C.cardBorder}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => navigate("/engine")}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 8,
              padding: "6px 14px",
              color: C.mid,
              fontFamily: sans,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← Geri
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: mono }}>
              {productCode}
            </h1>
            <span style={{ fontSize: 13, color: C.mid }}>{product?.name || "Yükleniyor..."}</span>
          </div>
        </div>
        {stock && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 14px",
              borderRadius: 20,
              border: `1px solid ${statusColor(stock.status)}40`,
              background: `${statusColor(stock.status)}10`,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(stock.status) }} />
            <span style={{ fontFamily: mono, fontSize: 12, color: statusColor(stock.status) }}>
              {statusLabel(stock.status)}
            </span>
          </div>
        )}
      </header>

      {/* Loading / Error */}
      {stockLoading && (
        <div style={{ padding: 80, textAlign: "center", color: C.mid }}>Yükleniyor...</div>
      )}
      {stockError && (
        <div style={{ padding: 80, textAlign: "center", color: C.err }}>
          Hata: {(stockError as Error).message}
        </div>
      )}

      {stock && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}
        >
          {/* ── STOK DURUMU (Dual State) ── */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, marginBottom: 16, letterSpacing: 1 }}>
            STOK DURUMU
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Netsis (Confirmed) */}
            <Card>
              <div style={{ fontSize: 11, color: C.mid, fontFamily: mono, marginBottom: 4 }}>NETSİS (ONAYLI)</div>
              <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: C.elektrik }}>
                {fmt(stock.confirmed)}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                {timeAgo(stockData.confirmedUpdatedAt)}
              </div>
            </Card>

            {/* Predicted */}
            <Card>
              <div style={{ fontSize: 11, color: C.mid, fontFamily: mono, marginBottom: 4 }}>TAHMİNİ (HESAPLI)</div>
              <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: C.ok }}>
                {fmt(stock.predicted)}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                {timeAgo(stockData.predictedUpdatedAt)}
              </div>
            </Card>

            {/* Difference (Blind Spot) */}
            <Card>
              <div style={{ fontSize: 11, color: C.mid, fontFamily: mono, marginBottom: 4 }}>FARK (KÖR NOKTA)</div>
              <div style={{
                fontSize: 36,
                fontWeight: 700,
                fontFamily: mono,
                color: stock.predicted - stock.confirmed > 0 ? C.ok : stock.predicted - stock.confirmed < 0 ? C.err : C.mid,
              }}>
                {stock.predicted - stock.confirmed > 0 ? "+" : ""}{fmt(stock.predicted - stock.confirmed)} adet
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                +{fmt(stock.pendingProduction)} üretim / -{fmt(stock.pendingSales)} satış
              </div>
            </Card>
          </div>

          {/* Confidence + Blind Spot */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
            <Card>
              <ConfidenceBar value={stock.confidence} />
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: mono, fontSize: 13, color: C.mid }}>Kör Nokta:</span>
                <span style={{
                  fontFamily: mono,
                  fontSize: 14,
                  color: stock.blindSpotHours > 168 ? C.err : stock.blindSpotHours > 72 ? C.warn : stock.blindSpotHours > 24 ? "#f97316" : C.ok,
                }}>
                  {stock.blindSpotHours >= 999 ? "Hiç senkronize edilmedi" : `${stock.blindSpotHours} saat`}
                </span>
                {stock.blindSpotHours > 72 && stock.blindSpotHours < 999 && (
                  <span style={{ fontSize: 12, color: C.warn }}>(uyarı)</span>
                )}
              </div>
            </Card>
          </div>

          {/* ── SON HAREKETLER ── */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, marginBottom: 16, letterSpacing: 1 }}>
            SON HAREKETLER
          </h2>
          <Card style={{ marginBottom: 32, maxHeight: 360, overflowY: "auto" }}>
            {movements.length === 0 ? (
              <div style={{ textAlign: "center", color: C.dim, padding: 24 }}>Henüz hareket yok</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
                    <th style={{ textAlign: "left", padding: "8px 4px", color: C.dim, fontWeight: 500 }}>Tür</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", color: C.dim, fontWeight: 500 }}>Miktar</th>
                    <th style={{ textAlign: "left", padding: "8px 4px", color: C.dim, fontWeight: 500 }}>Zaman</th>
                    <th style={{ textAlign: "left", padding: "8px 4px", color: C.dim, fontWeight: 500 }}>Kaynak</th>
                    <th style={{ textAlign: "center", padding: "8px 4px", color: C.dim, fontWeight: 500 }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => {
                    const isSyncLine = m.source === "netsis_sync" && m.movementType === "adjustment";
                    return (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: i < movements.length - 1 ? `1px solid ${C.cardBorder}` : "none",
                          background: isSyncLine ? "rgba(56,189,248,0.04)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 4px" }}>
                          {isSyncLine ? (
                            <span style={{ color: C.blue }}>--- Netsis Sync ---</span>
                          ) : (
                            <span style={{ color: m.quantity > 0 ? C.ok : C.err }}>
                              {movementIcon(m.movementType)} {movementLabel(m.movementType)}
                            </span>
                          )}
                        </td>
                        <td style={{
                          textAlign: "right",
                          padding: "10px 4px",
                          color: m.quantity > 0 ? C.ok : C.err,
                          fontWeight: 600,
                        }}>
                          {m.quantity > 0 ? "+" : ""}{fmt(m.quantity)}
                        </td>
                        <td style={{ padding: "10px 4px", color: C.mid }}>{timeAgo(m.enteredAt)}</td>
                        <td style={{ padding: "10px 4px", color: C.dim }}>{m.enteredBy || "-"}</td>
                        <td style={{ textAlign: "center", padding: "10px 4px" }}>
                          {m.syncedAt ? (
                            <span style={{ color: C.ok, fontSize: 12 }}>Onaylı ✓</span>
                          ) : (
                            <span style={{ color: C.warn, fontSize: 12 }}>Beklemede</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── HIZLI GİRİŞ ── */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, marginBottom: 16, letterSpacing: 1 }}>
            HIZLI GİRİŞ
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
            {/* Production Entry */}
            <Card>
              <div style={{ fontSize: 12, color: C.mid, marginBottom: 8 }}>Üretim Girişi</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const qty = parseInt(prodQty, 10);
                  if (qty > 0) prodMutation.mutate(qty);
                }}
                style={{ display: "flex", gap: 8 }}
              >
                <input
                  type="number"
                  min={1}
                  placeholder="Adet"
                  value={prodQty}
                  onChange={(e) => setProdQty(e.target.value)}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: C.white,
                    fontFamily: mono,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={prodMutation.isPending || !prodQty}
                  style={{
                    background: C.ok,
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    color: "#000",
                    fontFamily: sans,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    opacity: prodMutation.isPending || !prodQty ? 0.5 : 1,
                  }}
                >
                  {prodMutation.isPending ? "..." : "+Üretim"}
                </button>
              </form>
              {prodMutation.isError && (
                <div style={{ color: C.err, fontSize: 12, marginTop: 6 }}>{(prodMutation.error as Error).message}</div>
              )}
            </Card>

            {/* Sale Entry */}
            <Card>
              <div style={{ fontSize: 12, color: C.mid, marginBottom: 8 }}>Satış Girişi</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const qty = parseInt(saleQty, 10);
                  if (qty > 0) saleMutation.mutate(qty);
                }}
                style={{ display: "flex", gap: 8 }}
              >
                <input
                  type="number"
                  min={1}
                  placeholder="Adet"
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: C.white,
                    fontFamily: mono,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={saleMutation.isPending || !saleQty}
                  style={{
                    background: C.err,
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    color: C.white,
                    fontFamily: sans,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    opacity: saleMutation.isPending || !saleQty ? 0.5 : 1,
                  }}
                >
                  {saleMutation.isPending ? "..." : "-Satış"}
                </button>
              </form>
              {saleMutation.isError && (
                <div style={{ color: C.err, fontSize: 12, marginTop: 6 }}>{(saleMutation.error as Error).message}</div>
              )}
            </Card>
          </div>

          {/* ── MEVSİMSEL TAHMİN ── */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, marginBottom: 16, letterSpacing: 1 }}>
            MEVSİMSEL TAHMİN
          </h2>
          <Card style={{ marginBottom: 32 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={forecastData}>
                <XAxis dataKey="ay" tick={{ fill: C.dim, fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.dim, fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a2e",
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 8,
                    fontFamily: mono,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: C.white }}
                />
                <Bar dataKey="tahmin" fill={C.elektrik} radius={[4, 4, 0, 0]} name="Tahmin" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* ── BOM AĞACI ── */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, marginBottom: 16, letterSpacing: 1 }}>
            BOM AĞACI (ÜRÜN AĞACI)
          </h2>
          <Card style={{ marginBottom: 32 }}>
            <div style={{ fontFamily: mono, fontSize: 13, color: C.dim, lineHeight: 2 }}>
              <div>└─ {productCode} (mamül)</div>
              <div style={{ paddingLeft: 24, color: C.mid, fontStyle: "italic" }}>
                [BOM boş — belge bekleniyor]
              </div>
            </div>
          </Card>

          {/* ── INTELLIGENCE ── */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, marginBottom: 16, letterSpacing: 1 }}>
            INTELLIGENCE
          </h2>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, marginBottom: 4 }}>Risk Skoru</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, color: stock.confidence >= 70 ? C.ok : C.warn }}>
                  {Math.max(0, 100 - stock.confidence)}/100
                </div>
                <div style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 8,
                  display: "inline-block",
                  marginTop: 4,
                  background: stock.confidence >= 70 ? `${C.ok}20` : `${C.warn}20`,
                  color: stock.confidence >= 70 ? C.ok : C.warn,
                }}>
                  RAG: {stock.confidence >= 70 ? "Yeşil" : stock.confidence >= 40 ? "Sarı" : "Kırmızı"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, marginBottom: 4 }}>Stok / Sipariş</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, color: C.white }}>
                  {stock.predicted > 0 ? Math.round((stock.confirmed / Math.max(1, stock.predicted)) * 100) : 0}% / {stock.predicted > 0 ? Math.round((stock.pendingSales / Math.max(1, stock.predicted)) * 100) : 0}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, marginBottom: 4 }}>Günlük Stok</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, color: C.white }}>
                  {stock.pendingSales > 0 ? Math.round(stock.predicted / (stock.pendingSales / 30)) : "∞"} gün
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, marginBottom: 4 }}>Kör Nokta</div>
                <div style={{
                  fontSize: 20,
                  fontWeight: 700,
                  fontFamily: mono,
                  color: statusColor(stock.status),
                }}>
                  {stock.blindSpotHours >= 999 ? "N/A" : `${stock.blindSpotHours}h`}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
