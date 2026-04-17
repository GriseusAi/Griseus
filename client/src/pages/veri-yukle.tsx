import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStockWebSocket, type ProactiveAlertData } from "@/lib/useStockWebSocket";
import { useGlobalAlerts } from "../App";
import TopNav from "@/components/top-nav";

/* ═══════════════════════════════════════════════════════════
   PALETTE — Palantir Foundry dark operational UI
   ═══════════════════════════════════════════════════════════ */
const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.10)", accentGlow: "rgba(99,102,241,0.20)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.06)", okBorder: "rgba(52,211,153,0.15)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.06)", warnBorder: "rgba(251,191,36,0.15)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.05)", errBorder: "rgba(239,68,68,0.12)",
  blue: "#60a5fa", blueDim: "rgba(96,165,250,0.06)", blueBorder: "rgba(96,165,250,0.15)",
  purple: "#a78bfa",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60", dimmer: "#1a1a2a",
};
const mono = "'Outfit', sans-serif";
const glass = {
  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
} as const;

/* ── Types ── */
interface ProductOption {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  component_count: string;
}

type ImportType = "component_stock" | "bom_update" | "sales_history" | "cukurova_bom_stock" | "auto";

interface ImportResult {
  success: boolean;
  detectedType: string;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; column?: string; value?: any; reason: string }>;
  anomalies: Array<{ row: number; column: string; value: any; expected: string; severity: string; reason: string }>;
  columnMapping: Record<string, string>;
  preview: Record<string, any>[];
  message: string;
}

const IMPORT_TYPES: Array<{ key: ImportType; label: string; desc: string; icon: string; color: string }> = [
  { key: "cukurova_bom_stock", label: "Cukurova ERP", desc: "BOM + Stok hibrit (Stok Kodu/Ismi/Miktar/Sevi.)", icon: "\u{1F3ED}", color: C.accent },
  { key: "component_stock", label: "Bilesen Stok", desc: "Bilesen stok miktarlarini guncelle", icon: "\u{1F4E6}", color: C.ok },
  { key: "bom_update", label: "BOM Recete", desc: "Urun agaci (BOM) miktarlarini guncelle", icon: "\u{1F9E9}", color: C.blue },
  { key: "sales_history", label: "Satis Gecmisi", desc: "Aylik satis verilerini yukle", icon: "\u{1F4C8}", color: C.purple },
  { key: "auto", label: "Otomatik Tespit", desc: "Kolon isimlerinden otomatik belirle", icon: "\u{1F50D}", color: C.warn },
];

/* ═══════════════════════════════════════════════════════════
   DEVICE IMPORT CARD
   ═══════════════════════════════════════════════════════════ */
function DeviceImportCard({ product }: { product: ProductOption }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [selectedType, setSelectedType] = useState<ImportType>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ImportResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "analyzed" | "importing" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeMutation = useMutation({
    mutationFn: async (f: File) => {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/import/analyze", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      setPhase("analyzed");
      // Auto-detect type from analysis
      if (data.detectedType !== "auto" && selectedType === "auto") {
        setSelectedType(data.detectedType as ImportType);
      }
    },
    onError: () => setPhase("idle"),
  });

  const importMutation = useMutation({
    mutationFn: async (f: File) => {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("type", selectedType);
      formData.append("product_sku", product.sku);
      const res = await fetch("/api/import/execute", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setPhase("done");
      // Invalidate all queries to refresh data
      qc.invalidateQueries();
    },
    onError: () => setPhase("analyzed"),
  });

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xls", "xlsx", "csv"].includes(ext)) {
      alert("Sadece .xls, .xlsx veya .csv dosyalari desteklenir.");
      return;
    }
    setFile(f);
    setAnalysisResult(null);
    setImportResult(null);
    setPhase("analyzing");
    analyzeMutation.mutate(f);
  }, [analyzeMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleExecute = useCallback(() => {
    if (!file) return;
    setPhase("importing");
    importMutation.mutate(file);
  }, [file, importMutation]);

  const handleReset = useCallback(() => {
    setFile(null);
    setAnalysisResult(null);
    setImportResult(null);
    setPhase("idle");
    setSelectedType("auto");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const compCount = parseInt(product.component_count) || 0;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${expanded ? C.borderActive : C.border}`,
      borderRadius: 16, overflow: "hidden", transition: "all 0.2s", ...glass,
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", padding: "16px 20px", background: "transparent",
          border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* SKU badge */}
          <div style={{
            padding: "8px 16px", borderRadius: 10,
            background: C.accentDim, border: `1px solid rgba(99,102,241,0.25)`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 500, fontFamily: mono, color: C.accent, letterSpacing: 0.5 }}>
              {product.sku}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, color: C.white, fontWeight: 400, marginBottom: 2 }}>
              {product.name}
            </div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: mono }}>
              {product.category || "Urun"} — {compCount} bilesen
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Status indicator */}
          {phase === "done" && importResult?.success && (
            <div style={{
              padding: "4px 10px", borderRadius: 6, background: C.okDim,
              border: `1px solid ${C.okBorder}`, fontSize: 9, fontFamily: mono,
              color: C.ok, fontWeight: 400,
            }}>
              SON YUKLEME BASARILI
            </div>
          )}

          <span style={{
            fontSize: 18, color: C.dim, transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-block",
          }}>
            &#9662;
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${C.border}` }}>
          {/* Import type selector */}
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontFamily: mono, color: C.dim, letterSpacing: 1.5, marginBottom: 8, fontWeight: 400 }}>
              VERI TIPI
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {IMPORT_TYPES.map(t => {
                const isActive = selectedType === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setSelectedType(t.key)}
                    style={{
                      padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                      background: isActive ? `${t.color}15` : "rgba(0,0,0,0.2)",
                      border: `1px solid ${isActive ? `${t.color}40` : C.border}`,
                      color: isActive ? t.color : C.dim,
                      fontFamily: mono, fontSize: 11, fontWeight: 400,
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{t.icon}</span>
                    <div style={{ textAlign: "left" }}>
                      <div>{t.label}</div>
                      <div style={{ fontSize: 8, opacity: 0.6 }}>{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* File drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "32px 20px", borderRadius: 12, textAlign: "center",
              cursor: "pointer", transition: "all 0.2s",
              background: dragOver ? "rgba(99,102,241,0.08)" : "rgba(0,0,0,0.2)",
              border: `2px dashed ${dragOver ? C.accent : file ? C.ok + "60" : C.border}`,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {!file ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{"\u{1F4C4}"}</div>
                <div style={{ fontSize: 12, color: C.mid, marginBottom: 4 }}>
                  Excel dosyasini surukleyip birakin veya tiklayin
                </div>
                <div style={{ fontSize: 10, color: C.dim, fontFamily: mono }}>
                  .xls / .xlsx / .csv — Turkce ve Ingilizce karakter destegi
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u{2705}"}</div>
                <div style={{ fontSize: 12, color: C.ok, fontWeight: 400 }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 10, color: C.dim, fontFamily: mono, marginTop: 2 }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </>
            )}
          </div>

          {/* Loading state */}
          {(phase === "analyzing" || phase === "importing") && (
            <div style={{
              marginTop: 12, padding: "12px 16px", borderRadius: 10,
              background: C.accentDim, border: `1px solid rgba(99,102,241,0.2)`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 14, height: 14, border: `2px solid ${C.accent}`,
                borderTopColor: "transparent", borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ fontSize: 11, color: C.accent, fontFamily: mono }}>
                {phase === "analyzing" ? "Dosya analiz ediliyor..." : "Import ediliyor..."}
              </span>
            </div>
          )}

          {/* Analysis result */}
          {phase === "analyzed" && analysisResult && (
            <div style={{ marginTop: 12 }}>
              {/* Summary */}
              <div style={{
                padding: "12px 16px", borderRadius: 10,
                background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                marginBottom: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.dim, letterSpacing: 1, fontWeight: 400 }}>
                    ANALIZ SONUCU
                  </div>
                  <div style={{
                    fontSize: 9, fontFamily: mono, padding: "2px 8px", borderRadius: 4,
                    background: analysisResult.detectedType !== "auto" ? C.okDim : C.warnDim,
                    color: analysisResult.detectedType !== "auto" ? C.ok : C.warn,
                    border: `1px solid ${analysisResult.detectedType !== "auto" ? C.okBorder : C.warnBorder}`,
                  }}>
                    {analysisResult.detectedType !== "auto"
                      ? `Tip: ${analysisResult.detectedType === "cukurova_bom_stock" ? "Cukurova ERP (BOM+Stok)"
                        : analysisResult.detectedType === "component_stock" ? "Bilesen Stok"
                        : analysisResult.detectedType === "bom_update" ? "BOM Recete"
                        : analysisResult.detectedType === "sales_history" ? "Satis Gecmisi" : analysisResult.detectedType}`
                      : "Tip tespit edilemedi"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontFamily: mono, color: C.white, fontWeight: 400 }}>
                      {analysisResult.totalRows}
                    </div>
                    <div style={{ fontSize: 9, color: C.dim, fontFamily: mono }}>satir</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontFamily: mono, color: C.warn, fontWeight: 400 }}>
                      {analysisResult.anomalies.length}
                    </div>
                    <div style={{ fontSize: 9, color: C.dim, fontFamily: mono }}>anomali</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontFamily: mono, color: Object.keys(analysisResult.columnMapping).length > 0 ? C.ok : C.err, fontWeight: 400 }}>
                      {Object.keys(analysisResult.columnMapping).length}
                    </div>
                    <div style={{ fontSize: 9, color: C.dim, fontFamily: mono }}>kolon eslesti</div>
                  </div>
                </div>

                {/* Column mapping */}
                {Object.keys(analysisResult.columnMapping).length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {Object.entries(analysisResult.columnMapping).map(([key, col]) => (
                      <span key={key} style={{
                        fontSize: 8, fontFamily: mono, padding: "2px 6px",
                        borderRadius: 4, background: "rgba(99,102,241,0.08)",
                        color: C.mid, border: `1px solid rgba(99,102,241,0.15)`,
                      }}>
                        {key} = "{col}"
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview table */}
              {analysisResult.preview.length > 0 && (
                <div style={{
                  borderRadius: 10, overflow: "hidden",
                  border: `1px solid ${C.border}`, marginBottom: 10,
                }}>
                  <div style={{
                    padding: "8px 12px", background: "rgba(0,0,0,0.3)",
                    fontSize: 9, fontFamily: mono, color: C.dim, letterSpacing: 1,
                  }}>
                    ON IZLEME (ilk {analysisResult.preview.length} satir)
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: mono }}>
                      <thead>
                        <tr>
                          {Object.keys(analysisResult.preview[0]).map(col => (
                            <th key={col} style={{
                              padding: "6px 10px", textAlign: "left",
                              background: "rgba(0,0,0,0.2)", color: C.accent,
                              borderBottom: `1px solid ${C.border}`, fontWeight: 400,
                              whiteSpace: "nowrap",
                            }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.preview.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} style={{
                                padding: "5px 10px", color: C.mid,
                                borderBottom: `1px solid ${C.border}`,
                                whiteSpace: "nowrap",
                              }}>
                                {String(val ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Anomalies */}
              {analysisResult.anomalies.length > 0 && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, marginBottom: 10,
                  background: C.warnDim, border: `1px solid ${C.warnBorder}`,
                }}>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.warn, letterSpacing: 1, marginBottom: 6, fontWeight: 400 }}>
                    ANOMALILER
                  </div>
                  {analysisResult.anomalies.slice(0, 5).map((a, i) => (
                    <div key={i} style={{ fontSize: 10, color: C.mid, lineHeight: 1.6, display: "flex", gap: 6 }}>
                      <span style={{
                        fontSize: 8, padding: "1px 4px", borderRadius: 3, flexShrink: 0, marginTop: 2,
                        background: a.severity === "critical" ? C.errDim : C.warnDim,
                        color: a.severity === "critical" ? C.err : C.warn,
                      }}>
                        {a.severity === "critical" ? "KRITIK" : "UYARI"}
                      </span>
                      <span>Satir {a.row}: {a.reason}</span>
                    </div>
                  ))}
                  {analysisResult.anomalies.length > 5 && (
                    <div style={{ fontSize: 9, color: C.dim, marginTop: 4 }}>
                      +{analysisResult.anomalies.length - 5} anomali daha...
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleExecute}
                  disabled={analysisResult.detectedType === "auto" && selectedType === "auto"}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 10, border: "none",
                    background: (analysisResult.detectedType === "auto" && selectedType === "auto") ? C.dimmer : C.ok,
                    color: (analysisResult.detectedType === "auto" && selectedType === "auto") ? C.dim : "#000",
                    fontFamily: mono, fontSize: 12, fontWeight: 500,
                    cursor: (analysisResult.detectedType === "auto" && selectedType === "auto") ? "default" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {product.sku} IMPORT ET — {analysisResult.totalRows} satir
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    padding: "12px 20px", borderRadius: 10,
                    background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                    color: C.mid, fontFamily: mono, fontSize: 11, cursor: "pointer",
                  }}
                >
                  Sifirla
                </button>
              </div>
            </div>
          )}

          {/* Import result */}
          {phase === "done" && importResult && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                padding: "16px 20px", borderRadius: 12,
                background: importResult.success ? "rgba(52,211,153,0.06)" : C.errDim,
                border: `1px solid ${importResult.success ? C.okBorder : C.errBorder}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{importResult.success ? "\u{2705}" : "\u{274C}"}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 400, color: importResult.success ? C.ok : C.err,
                  }}>
                    {product.sku} — {importResult.success ? "Import Basarili" : "Import Hatali"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: mono, color: C.ok, fontWeight: 400 }}>{importResult.imported}</div>
                    <div style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>yeni kayit</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: mono, color: C.blue, fontWeight: 400 }}>{importResult.updated}</div>
                    <div style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>guncellendi</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: mono, color: C.warn, fontWeight: 400 }}>{importResult.skipped}</div>
                    <div style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>atlandi</div>
                  </div>
                </div>

                {/* Errors */}
                {importResult.errors.length > 0 && (
                  <div style={{
                    padding: "8px 12px", borderRadius: 8, marginBottom: 8,
                    background: C.errDim, border: `1px solid ${C.errBorder}`,
                  }}>
                    <div style={{ fontSize: 9, fontFamily: mono, color: C.err, marginBottom: 4, letterSpacing: 0.5 }}>
                      HATALAR ({importResult.errors.length})
                    </div>
                    {importResult.errors.slice(0, 5).map((e, i) => (
                      <div key={i} style={{ fontSize: 10, color: C.mid, lineHeight: 1.6 }}>
                        Satir {e.row}: {e.reason}
                      </div>
                    ))}
                    {importResult.errors.length > 5 && (
                      <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>
                        +{importResult.errors.length - 5} hata daha...
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: 10, color: C.mid, lineHeight: 1.5 }}>
                  {importResult.message}
                </div>

                <button
                  onClick={handleReset}
                  style={{
                    marginTop: 10, padding: "8px 16px", borderRadius: 8,
                    background: C.accentDim, border: `1px solid rgba(99,102,241,0.25)`,
                    color: C.accent, fontFamily: mono, fontSize: 11, cursor: "pointer",
                  }}
                >
                  Yeni Dosya Yukle
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function VeriYukle() {
  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then(r => r.json()),
  });

  // WS for live updates
  const { alerts: globalAlerts, pushAlerts } = useGlobalAlerts();
  const handleProactiveAlert = useCallback((data: any) => {
    pushAlerts(data.alerts);
  }, [pushAlerts]);
  const { connected } = useStockWebSocket(() => {}, handleProactiveAlert, () => {});

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "'Outfit', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <div className="glass-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <TopNav connected={connected} />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: "center", padding: "32px 0 24px" }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 2, marginBottom: 8 }}>
            CUKUROVA ISI SISTEMLERI — VERI YUKLEME MERKEZI
          </div>
          <div style={{ fontSize: 24, fontWeight: 400, color: C.white, letterSpacing: -0.5, marginBottom: 6 }}>
            Cihaz Bazli Import
          </div>
          <div style={{ fontSize: 12, color: C.mid, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
            Her urun icin ayri Excel dosyasi yukleyin. Sistem otomatik olarak kolon isimlerini tanir,
            anomalileri tespit eder ve veriyi dogrular.
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          padding: "12px 16px", borderRadius: 12, marginBottom: 20,
          background: C.accentDim, border: `1px solid rgba(99,102,241,0.2)`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 16 }}>{"\u{1F4CB}"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 400, marginBottom: 2 }}>
              Desteklenen Format: .xls / .xlsx / .csv
            </div>
            <div style={{ fontSize: 10, color: C.mid }}>
              Turkce kolon isimleri otomatik tanilir: kod/stok/adet/birim/yil/ay/ciro/bilesen...
              Ingilizce de desteklenir: code/stock/quantity/unit/year/month/revenue...
            </div>
          </div>
        </div>

        {/* Device cards */}
        {products.length === 0 ? (
          <div style={{
            padding: 48, textAlign: "center", borderRadius: 16,
            background: C.surface, border: `1px solid ${C.border}`, ...glass,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>{"\u{1F4E6}"}</div>
            <div style={{ fontSize: 13, color: C.dim }}>Henuz aktif urun yok</div>
            <div style={{ fontSize: 10, color: C.dimmer, marginTop: 4 }}>
              Urunler BOM verisi yuklendikten sonra burada gorunecektir
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
            {products.map(p => (
              <DeviceImportCard key={p.sku} product={p} />
            ))}
          </div>
        )}

        {/* Bottom info */}
        <div style={{
          textAlign: "center", padding: "16px 0 32px",
          fontSize: 10, fontFamily: mono, color: C.dim,
        }}>
          {products.length} aktif cihaz — her import sonrasi Orchestrator otomatik denetim baslatir
        </div>
      </div>
    </div>
  );
}
