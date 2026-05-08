import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCode2,
  GitBranch,
  Link2,
  Loader2,
  PackageCheck,
  Play,
  Save,
  Search,
  Settings2,
  Table2,
  Wand2,
} from "lucide-react";

type SourceId = "recipe" | "component_stock" | "finished_stock" | "sales_average";

type SourceDef = {
  id: SourceId;
  label: string;
  description: string;
  primaryKey: string;
  joinsOn: string[];
};

type ProductDef = {
  sku: string;
  name: string;
  category: string | null;
  componentCount: number;
};

type RunResult = {
  runId: string;
  sku: string;
  sources: SourceId[];
  joins: Array<{ left: string; right: string; enabled: boolean }>;
  summary: {
    componentCount: number;
    criticalCount: number;
    warningCount: number;
    maxDeviceBuildable: number;
    bottleneckComponent: string | null;
    avgMonthlySales: number;
  };
  columns: string[];
  rows: Array<Record<string, any>>;
};

const defaultSources: SourceId[] = ["recipe", "component_stock", "finished_stock", "sales_average"];

const sourceTone: Record<SourceId, { color: string; bg: string; icon: JSX.Element }> = {
  recipe: { color: CT.accent, bg: CT.accentSoft, icon: <FileCode2 size={15} /> },
  component_stock: { color: CT.info, bg: CT.infoSoft, icon: <PackageCheck size={15} /> },
  finished_stock: { color: CT.ok, bg: CT.okSoft, icon: <Database size={15} /> },
  sales_average: { color: CT.warn, bg: CT.warnSoft, icon: <Wand2 size={15} /> },
};

const columnLabels: Record<string, string> = {
  productSku: "cihaz_sku",
  productName: "cihaz_adi",
  componentCode: "komponent_kodu",
  componentName: "komponent_adi",
  requiredPerUnit: "recete_adedi",
  currentStock: "komponent_stok",
  maxBuildableFromComponent: "uretilebilir_adet",
  finishedInWarehouse: "bitmis_depo",
  finishedInProduction: "bitmis_uretim",
  avgMonthlySales: "aylik_satis_ort",
  projectedMonthlyComponentDemand: "aylik_komponent_ihtiyac",
  monthsOfComponentCover: "stok_kac_ay_yeter",
  status: "durum",
};

export default function PipelineBuilderPage() {
  const [sources, setSources] = useState<SourceDef[]>([]);
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [selectedSku, setSelectedSku] = useState("GSS20P");
  const [enabledSources, setEnabledSources] = useState<SourceId[]>(defaultSources);
  const [result, setResult] = useState<RunResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<SourceId | "output">("recipe");
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadSources() {
      setBootLoading(true);
      try {
        const response = await fetch("/api/pipeline-builder/sources");
        if (!response.ok) throw new Error("Pipeline kaynakları alınamadı");
        const data = await response.json();
        if (!alive) return;
        setSources(data.sources ?? []);
        setProducts(data.products ?? []);
        const hasGss = (data.products ?? []).some((p: ProductDef) => p.sku === "GSS20P");
        setSelectedSku(hasGss ? "GSS20P" : data.products?.[0]?.sku ?? "GSS20P");
      } catch (err: any) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setBootLoading(false);
      }
    }
    loadSources();
    return () => { alive = false; };
  }, []);

  async function runPipeline() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pipeline-builder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: selectedSku, sources: enabledSources }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pipeline çalıştırılamadı");
      setResult(data);
      setSelectedNode("output");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!bootLoading && sources.length > 0) runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootLoading, selectedSku]);

  const selectedProduct = products.find(p => p.sku === selectedSku);
  const visibleColumns = useMemo(() => {
    const preferred = [
      "productSku",
      "productName",
      "componentCode",
      "componentName",
      "requiredPerUnit",
      "currentStock",
      "maxBuildableFromComponent",
      "avgMonthlySales",
      "projectedMonthlyComponentDemand",
      "monthsOfComponentCover",
      "status",
    ];
    return preferred.filter(c => result?.columns.includes(c));
  }, [result]);

  const selectedSource = selectedNode === "output" ? null : sources.find(s => s.id === selectedNode);
  const selectedDescription = selectedNode === "output"
    ? "Seçilen kaynakların join ve aggregate sonucu: cihaz datası."
    : selectedSource?.description ?? "Kaynak seç.";

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT }}>
      <TopNav />

      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GitBranch size={18} color={CT.accent} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 650 }}>Griseus Pipeline Builder</div>
            <div style={{ fontSize: 10, color: CT.inkMuted, fontFamily: CT_MONO }}>
              Reçete + stok + satış ortalaması → cihaz datası
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={selectedSku} onChange={e => setSelectedSku(e.target.value)} style={selectStyle}>
            {products.map(product => (
              <option key={product.sku} value={product.sku}>{product.sku} - {product.name}</option>
            ))}
          </select>
          <button style={toolbarButtonStyle}><Save size={14} />Taslak</button>
          <button onClick={runPipeline} disabled={loading || enabledSources.length === 0} style={deployButtonStyle}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Çalıştır
          </button>
        </div>
      </header>

      <div style={sourceBarStyle}>
        {sources.map(source => {
          const active = enabledSources.includes(source.id);
          const tone = sourceTone[source.id];
          return (
            <button
              key={source.id}
              onClick={() => {
                setEnabledSources(prev => active ? prev.filter(id => id !== source.id) : [...prev, source.id]);
                setSelectedNode(source.id);
              }}
              style={{
                ...sourceToggleStyle,
                background: active ? tone.bg : CT.surface,
                borderColor: active ? tone.color : CT.borderStrong,
                color: active ? tone.color : CT.inkSub,
              }}
            >
              {tone.icon}
              {source.label}
            </button>
          );
        })}
      </div>

      <main style={{ display: "grid", gridTemplateColumns: "minmax(760px, 1fr) 360px", minHeight: "calc(100vh - 148px)" }}>
        <section style={{ display: "grid", gridTemplateRows: "1fr 304px", minWidth: 0 }}>
          <div style={{ position: "relative", overflow: "auto", background: "#eef1f5" }}>
            <div style={{ position: "relative", width: 1220, height: 560 }}>
              <StageLabel text="Input" left={44} top={34} width={256} height={386} />
              <StageLabel text="Transform" left={340} top={34} width={480} height={386} />
              <StageLabel text="Output" left={868} top={124} width={236} height={204} />

              <svg width="1220" height="560" style={{ position: "absolute", inset: 0 }}>
                {enabledSources.map((id, index) => (
                  <EdgeLine key={id} x1={300} y1={120 + index * 78} x2={340} y2={202} />
                ))}
                {enabledSources.length > 0 && <EdgeLine x1={820} y1={202} x2={868} y2={226} />}
              </svg>

              {sources.map((source, index) => {
                const enabled = enabledSources.includes(source.id);
                return (
                  <SourceNode
                    key={source.id}
                    source={source}
                    enabled={enabled}
                    selected={selectedNode === source.id}
                    left={72}
                    top={92 + index * 78}
                    onClick={() => setSelectedNode(source.id)}
                  />
                );
              })}

              <TransformNode
                left={386}
                top={148}
                selected={selectedNode !== "output" && enabledSources.includes(selectedNode)}
                title="Join + Aggregate"
                subtitle={`${enabledSources.length} kaynak bağlı`}
              />
              <OutputNode
                left={900}
                top={190}
                selected={selectedNode === "output"}
                onClick={() => setSelectedNode("output")}
                count={result?.rows.length ?? 0}
              />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${CT.borderStrong}`, background: CT.surface, overflow: "hidden" }}>
            <div style={previewHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 650 }}>
                <Table2 size={15} color={CT.accent} />
                Cihaz data preview
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: CT.inkMuted, fontSize: 11 }}>
                {error ? <AlertTriangle size={14} color={CT.err} /> : <CheckCircle2 size={14} color={CT.ok} />}
                {error ?? `${result?.rows.length ?? 0} satır üretildi`}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: 266 }}>
              <aside style={{ borderRight: `1px solid ${CT.border}`, padding: 12, overflow: "auto" }}>
                <div style={searchBoxStyle}>
                  <Search size={14} color={CT.inkMuted} />
                  <span style={{ color: CT.inkMuted, fontSize: 12 }}>Kolon ara...</span>
                </div>
                {visibleColumns.map(col => (
                  <div key={col} style={columnRowStyle}>
                    <span>{columnLabels[col] ?? col}</span>
                    <Settings2 size={12} color={CT.inkMuted} />
                  </div>
                ))}
              </aside>

              <div style={{ overflow: "auto" }}>
                {loading && <div style={{ padding: 22, color: CT.inkMuted, fontSize: 13 }}>Pipeline çalışıyor...</div>}
                {!loading && result && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {visibleColumns.map(col => <th key={col} style={thStyle}>{columnLabels[col] ?? col}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 100).map((row, idx) => (
                        <tr key={idx}>
                          {visibleColumns.map(col => <td key={`${idx}-${col}`} style={tdStyle}>{formatCell(row[col])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside style={{ borderLeft: `1px solid ${CT.border}`, background: CT.surface, minWidth: 0 }}>
          <div style={{ padding: 18, borderBottom: `1px solid ${CT.border}` }}>
            <div style={{ fontSize: 11, color: CT.accent, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Aktif cihaz</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedSku}</div>
            <div style={{ color: CT.inkSub, fontSize: 13, marginTop: 5 }}>{selectedProduct?.name ?? "Ürün"}</div>
          </div>

          <div style={{ padding: 18, borderBottom: `1px solid ${CT.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{selectedNode === "output" ? "Cihaz Datası" : selectedSource?.label}</div>
            <p style={{ margin: 0, color: CT.inkSub, fontSize: 13, lineHeight: 1.55 }}>{selectedDescription}</p>
          </div>

          <div style={{ padding: 18, borderBottom: `1px solid ${CT.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Pipeline özeti</div>
            <Metric label="Komponent" value={result?.summary.componentCount ?? 0} />
            <Metric label="Üretilebilir cihaz" value={result?.summary.maxDeviceBuildable ?? 0} />
            <Metric label="Aylık satış ort." value={result?.summary.avgMonthlySales ?? 0} />
            <Metric label="Kritik satır" value={result?.summary.criticalCount ?? 0} tone={CT.err} />
            <Metric label="Darboğaz" value={result?.summary.bottleneckComponent ?? "-"} compact />
          </div>

          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              <Link2 size={14} color={CT.accent} />
              Join plan
            </div>
            {(result?.joins ?? [
              { left: "recipe.productSku", right: "finished_stock.productSku", enabled: true },
              { left: "recipe.componentCode", right: "component_stock.componentCode", enabled: true },
              { left: "recipe.productSku", right: "sales_average.productSku", enabled: true },
            ]).map(join => (
              <div key={`${join.left}-${join.right}`} style={{ display: "flex", gap: 8, marginBottom: 10, color: join.enabled ? CT.inkSub : CT.inkFaint, fontSize: 11, fontFamily: CT_MONO }}>
                {join.enabled ? <CheckCircle2 size={13} color={CT.ok} /> : <AlertTriangle size={13} color={CT.inkFaint} />}
                <span>{join.left} = {join.right}</span>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function SourceNode({ source, enabled, selected, left, top, onClick }: {
  source: SourceDef;
  enabled: boolean;
  selected: boolean;
  left: number;
  top: number;
  onClick: () => void;
}) {
  const tone = sourceTone[source.id];
  return (
    <button onClick={onClick} style={{
      ...nodeStyle,
      left,
      top,
      opacity: enabled ? 1 : 0.48,
      borderColor: selected ? tone.color : CT.borderStrong,
    }}>
      <div style={nodeTitleStyle}>
        <span style={{ color: tone.color, display: "inline-flex" }}>{tone.icon}</span>
        <span style={{ fontWeight: 700 }}>{source.label}</span>
      </div>
      <div style={nodeMetaStyle}>{source.primaryKey}</div>
    </button>
  );
}

function TransformNode({ left, top, selected, title, subtitle }: {
  left: number;
  top: number;
  selected: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ ...nodeStyle, left, top, width: 260, height: 104, borderColor: selected ? CT.accent : CT.borderStrong }}>
      <div style={nodeTitleStyle}>
        <Link2 size={15} color="#745fb4" />
        <span style={{ fontWeight: 700 }}>{title}</span>
      </div>
      <div style={nodeMetaStyle}>{subtitle}</div>
      <div style={{ padding: "0 12px", color: CT.inkMuted, fontSize: 11 }}>productSku ve componentCode üzerinden birleştir</div>
    </div>
  );
}

function OutputNode({ left, top, selected, count, onClick }: {
  left: number;
  top: number;
  selected: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{ ...nodeStyle, left, top, width: 210, height: 76, borderColor: selected ? CT.ok : CT.borderStrong }}>
      <div style={nodeTitleStyle}>
        <Database size={15} color={CT.ok} />
        <span style={{ fontWeight: 700 }}>Cihaz datası</span>
      </div>
      <div style={nodeMetaStyle}>{count} satır</div>
    </button>
  );
}

function EdgeLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mid = (x1 + x2) / 2;
  return (
    <g>
      <path d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke="rgba(86,101,119,0.55)" strokeWidth="2" />
      <circle cx={x1} cy={y1} r="5" fill={CT.surface} stroke="rgba(86,101,119,0.55)" strokeWidth="2" />
      <circle cx={x2} cy={y2} r="5" fill={CT.surface} stroke="rgba(86,101,119,0.55)" strokeWidth="2" />
    </g>
  );
}

function StageLabel({ text, left, top, width, height }: { text: string; left: number; top: number; width: number; height: number }) {
  return (
    <div style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      border: `2px solid rgba(201,100,66,0.38)`,
      color: "#ff5a4f",
      fontSize: 26,
      fontWeight: 800,
      display: "flex",
      justifyContent: "center",
      paddingTop: 22,
      pointerEvents: "none",
    }}>
      {text}
    </div>
  );
}

function Metric({ label, value, tone = CT.ink, compact = false }: { label: string; value: string | number; tone?: string; compact?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr auto", gap: 6, padding: "9px 0", borderBottom: `1px solid ${CT.border}` }}>
      <div style={{ color: CT.inkMuted, fontSize: 11 }}>{label}</div>
      <div style={{ color: tone, fontSize: compact ? 12 : 14, fontWeight: 700, textAlign: compact ? "left" : "right" }}>{String(value)}</div>
    </div>
  );
}

function formatCell(value: any) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("tr-TR") : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  return String(value);
}

const headerStyle: CSSProperties = {
  height: 46,
  borderBottom: `1px solid ${CT.border}`,
  background: CT.surface,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 18px",
};

const sourceBarStyle: CSSProperties = {
  minHeight: 54,
  borderBottom: `1px solid ${CT.border}`,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 18px",
  background: "rgba(250,249,245,0.72)",
  flexWrap: "wrap",
};

const toolbarButtonStyle: CSSProperties = {
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.inkSub,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: CT_FONT,
  cursor: "pointer",
};

const deployButtonStyle: CSSProperties = {
  ...toolbarButtonStyle,
  color: CT.ok,
  borderColor: "rgba(63,143,91,0.28)",
  background: CT.okSoft,
};

const selectStyle: CSSProperties = {
  height: 32,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.ink,
  padding: "0 10px",
  fontSize: 12,
  fontFamily: CT_FONT,
  minWidth: 250,
};

const sourceToggleStyle: CSSProperties = {
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 650,
  fontFamily: CT_FONT,
  cursor: "pointer",
};

const nodeStyle: CSSProperties = {
  position: "absolute",
  width: 228,
  height: 68,
  borderRadius: 7,
  border: `1px solid ${CT.borderStrong}`,
  background: CT.surface,
  boxShadow: "0 4px 12px rgba(20,20,19,0.08)",
  color: CT.ink,
  fontFamily: CT_FONT,
  textAlign: "left",
  cursor: "pointer",
  padding: 0,
  overflow: "hidden",
};

const nodeTitleStyle: CSSProperties = {
  height: 38,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
  borderBottom: `1px solid ${CT.border}`,
  fontSize: 12,
};

const nodeMetaStyle: CSSProperties = {
  padding: "7px 12px",
  color: CT.inkMuted,
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const previewHeaderStyle: CSSProperties = {
  height: 38,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 14px",
  borderBottom: `1px solid ${CT.border}`,
};

const searchBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  padding: "8px 10px",
  marginBottom: 12,
};

const columnRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 28,
  fontSize: 12,
  borderBottom: `1px solid ${CT.border}`,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  background: "#f3f4f6",
  borderBottom: `1px solid ${CT.borderStrong}`,
  borderRight: `1px solid ${CT.border}`,
  color: "#657084",
  fontWeight: 700,
  minWidth: 150,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "7px 10px",
  borderBottom: `1px solid ${CT.border}`,
  borderRight: `1px solid ${CT.border}`,
  color: CT.ink,
  whiteSpace: "nowrap",
  maxWidth: 240,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
