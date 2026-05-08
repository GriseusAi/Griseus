import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
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
  UploadCloud,
  X,
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

type UploadedDataset = {
  fileName: string;
  columns: string[];
  rows: Array<Record<string, any>>;
};

type WorkbookSheetDataset = UploadedDataset & {
  sheetName: string;
};

type WorkbookImport = {
  fileName: string;
  sheets: WorkbookSheetDataset[];
  assignments: Partial<Record<SourceId, string>>;
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

const sourceKeywords: Record<SourceId, string[]> = {
  recipe: ["recipe", "recete", "reçete", "bom", "urunagaci", "ürün_agacı", "urun_agaci", "cihaz"],
  component_stock: ["component_stock", "stock", "stok", "bilesen", "bileşen", "komponent", "component"],
  finished_stock: ["finished", "bitmis", "bitmiş", "mamul", "urun_stok", "ürün_stok", "depo"],
  sales_average: ["sales", "satis", "satış", "average", "ortalama", "forecast", "talep"],
};

export default function PipelineBuilderPage() {
  const [sources, setSources] = useState<SourceDef[]>([]);
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [selectedSku, setSelectedSku] = useState("GSS20P");
  const [enabledSources, setEnabledSources] = useState<SourceId[]>(defaultSources);
  const [result, setResult] = useState<RunResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<SourceId | "output">("recipe");
  const [uploadedData, setUploadedData] = useState<Partial<Record<SourceId, UploadedDataset>>>({});
  const [workbookImport, setWorkbookImport] = useState<WorkbookImport | null>(null);
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
      const customData = Object.fromEntries(
        Object.entries(uploadedData).map(([sourceId, dataset]) => [sourceId, dataset?.rows ?? []]),
      );
      const response = await fetch("/api/pipeline-builder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: selectedSku, sources: enabledSources, customData }),
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
  const selectedDataset = selectedNode === "output" ? undefined : uploadedData[selectedNode];
  const previewRows = selectedNode === "output" ? (result?.rows ?? []) : (selectedDataset?.rows ?? []);
  const previewColumns = selectedNode === "output"
    ? visibleColumns
    : (selectedDataset?.columns ?? []);
  const selectedDescription = selectedNode === "output"
    ? "Seçilen kaynakların join ve aggregate sonucu: cihaz datası."
    : selectedDataset
      ? `${selectedDataset.fileName} dosyasından ${selectedDataset.rows.length} satır okundu.`
      : selectedSource?.description ?? "Kaynak seç.";

  async function handleSourceFile(sourceId: SourceId, file: File) {
    try {
      setError(null);
      const dataset = await parseTabularFile(file);
      setUploadedData(prev => ({ ...prev, [sourceId]: dataset }));
      setWorkbookImport(prev => {
        if (!prev) return prev;
        const assignments = { ...prev.assignments };
        delete assignments[sourceId];
        return { ...prev, assignments };
      });
      setEnabledSources(prev => prev.includes(sourceId) ? prev : [...prev, sourceId]);
      setSelectedNode(sourceId);
    } catch (err: any) {
      setError(err.message || "Dosya okunamadı");
    }
  }

  async function handleWorkbookFile(file: File) {
    try {
      setError(null);
      const sheets = await parseWorkbookFile(file);
      const usedSources = new Set<SourceId>();
      const assignments: Partial<Record<SourceId, string>> = {};
      const nextUploads: Partial<Record<SourceId, UploadedDataset>> = {};

      for (const sheet of sheets) {
        const inferred = inferSourceForDataset(sheet, sources);
        if (!inferred || usedSources.has(inferred)) continue;
        assignments[inferred] = sheet.sheetName;
        nextUploads[inferred] = sheet;
        usedSources.add(inferred);
      }

      setWorkbookImport({ fileName: file.name, sheets, assignments });
      setUploadedData(prev => ({ ...prev, ...nextUploads }));
      setEnabledSources(prev => Array.from(new Set([...prev, ...usedSources])));
      const firstAssigned = Object.keys(assignments)[0] as SourceId | undefined;
      if (firstAssigned) setSelectedNode(firstAssigned);
    } catch (err: any) {
      setError(err.message || "Dosya okunamadı");
    }
  }

  function assignWorkbookSheet(sourceId: SourceId, sheetName: string) {
    if (!workbookImport) return;
    const nextAssignments = { ...workbookImport.assignments };
    const sourcePreviouslyUsingSheet = Object.entries(nextAssignments).find(([, assignedSheet]) => assignedSheet === sheetName)?.[0] as SourceId | undefined;
    if (sourcePreviouslyUsingSheet && sourcePreviouslyUsingSheet !== sourceId) {
      delete nextAssignments[sourcePreviouslyUsingSheet];
    }

    const selectedSheet = workbookImport.sheets.find(sheet => sheet.sheetName === sheetName);
    if (!selectedSheet) {
      delete nextAssignments[sourceId];
      setUploadedData(prev => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setWorkbookImport({ ...workbookImport, assignments: nextAssignments });
      return;
    }

    nextAssignments[sourceId] = selectedSheet.sheetName;
    setWorkbookImport({ ...workbookImport, assignments: nextAssignments });
    setUploadedData(prev => {
      const next = { ...prev, [sourceId]: selectedSheet };
      if (sourcePreviouslyUsingSheet && sourcePreviouslyUsingSheet !== sourceId) {
        delete next[sourcePreviouslyUsingSheet];
      }
      return next;
    });
    setEnabledSources(prev => prev.includes(sourceId) ? prev : [...prev, sourceId]);
    setSelectedNode(sourceId);
  }

  function clearSourceData(sourceId: SourceId) {
    setUploadedData(prev => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
    setWorkbookImport(prev => {
      if (!prev) return prev;
      const assignments = { ...prev.assignments };
      delete assignments[sourceId];
      return { ...prev, assignments };
    });
  }

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
          const uploaded = uploadedData[source.id];
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
              {uploaded && <span style={{ fontSize: 10, fontFamily: CT_MONO }}>({uploaded.rows.length})</span>}
            </button>
          );
        })}
        <WorkbookUploadPanel
          sources={sources}
          workbook={workbookImport}
          onFile={handleWorkbookFile}
          onAssign={assignWorkbookSheet}
          onClear={() => {
            if (workbookImport) {
              setUploadedData(prev => {
                const next = { ...prev };
                Object.keys(workbookImport.assignments).forEach(sourceId => delete next[sourceId as SourceId]);
                return next;
              });
            }
            setWorkbookImport(null);
          }}
        />
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
                    uploadedRows={uploadedData[source.id]?.rows.length ?? 0}
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
                {selectedNode === "output" ? "Cihaz data preview" : `${selectedSource?.label ?? "Kaynak"} verisi`}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: CT.inkMuted, fontSize: 11 }}>
                {error ? <AlertTriangle size={14} color={CT.err} /> : <CheckCircle2 size={14} color={CT.ok} />}
                {error ?? (selectedNode === "output" ? `${result?.rows.length ?? 0} satır üretildi` : `${previewRows.length} satır okundu`)}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: 266 }}>
              <aside style={{ borderRight: `1px solid ${CT.border}`, padding: 12, overflow: "auto" }}>
                {selectedNode !== "output" && (
                  <UploadDropzone
                    sourceId={selectedNode}
                    dataset={selectedDataset}
                    onFile={handleSourceFile}
                    onClear={clearSourceData}
                  />
                )}
                <div style={searchBoxStyle}>
                  <Search size={14} color={CT.inkMuted} />
                  <span style={{ color: CT.inkMuted, fontSize: 12 }}>Kolon ara...</span>
                </div>
                {previewColumns.map(col => (
                  <div key={col} style={columnRowStyle}>
                    <span>{columnLabels[col] ?? col}</span>
                    <Settings2 size={12} color={CT.inkMuted} />
                  </div>
                ))}
              </aside>

              <div style={{ overflow: "auto" }}>
                {loading && <div style={{ padding: 22, color: CT.inkMuted, fontSize: 13 }}>Pipeline çalışıyor...</div>}
                {!loading && selectedNode !== "output" && !selectedDataset && (
                  <div style={{ padding: 22, color: CT.inkMuted, fontSize: 13 }}>
                    Bu input kutusuna CSV, XLSX veya JSON sürükle. Kolonlar otomatik okunacak.
                  </div>
                )}
                {!loading && previewRows.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {previewColumns.map(col => <th key={col} style={thStyle}>{columnLabels[col] ?? col}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 100).map((row, idx) => (
                        <tr key={idx}>
                          {previewColumns.map(col => <td key={`${idx}-${col}`} style={tdStyle}>{formatCell(row[col])}</td>)}
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

function WorkbookUploadPanel({ sources, workbook, onFile, onAssign, onClear }: {
  sources: SourceDef[];
  workbook: WorkbookImport | null;
  onFile: (file: File) => void;
  onAssign: (sourceId: SourceId, sheetName: string) => void;
  onClear: () => void;
}) {
  const inputId = "pipeline-workbook-upload";
  return (
    <div style={workbookPanelStyle}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        style={workbookDropStyle}
      >
        <input
          id={inputId}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,.json"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = "";
          }}
        />
        <UploadCloud size={15} color={CT.accent} />
        <span>{workbook ? workbook.fileName : "Tek XLS / CSV yükle"}</span>
        {workbook && <small>{workbook.sheets.length} tablo</small>}
      </label>

      {workbook && (
        <div style={workbookSheetGridStyle}>
          {workbook.sheets.map(sheet => {
            const assignedSource = Object.entries(workbook.assignments).find(([, sheetName]) => sheetName === sheet.sheetName)?.[0] ?? "";
            return (
              <div key={sheet.sheetName} style={workbookSheetRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sheet.sheetName}</div>
                  <div style={{ fontSize: 10, color: CT.inkMuted, fontFamily: CT_MONO }}>{sheet.rows.length}x{sheet.columns.length}</div>
                </div>
                <select
                  value={assignedSource}
                  onChange={(event) => {
                    const nextSourceId = event.currentTarget.value as SourceId | "";
                    if (!nextSourceId && assignedSource) {
                      onAssign(assignedSource as SourceId, "");
                      return;
                    }
                    if (nextSourceId) onAssign(nextSourceId, sheet.sheetName);
                  }}
                  style={sheetSelectStyle}
                >
                  <option value="">Kullanma</option>
                  {sources.map(source => (
                    <option key={source.id} value={source.id}>{source.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
          <button type="button" onClick={onClear} style={workbookClearStyle} title="Workbook verisini kaldır">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function SourceNode({ source, enabled, selected, uploadedRows, left, top, onClick }: {
  source: SourceDef;
  enabled: boolean;
  selected: boolean;
  uploadedRows: number;
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
      <div style={{ ...nodeMetaStyle, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{source.primaryKey}</span>
        {uploadedRows > 0 && <span style={{ color: tone.color, fontFamily: CT_MONO }}>{uploadedRows}</span>}
      </div>
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

function UploadDropzone({ sourceId, dataset, onFile, onClear }: {
  sourceId: SourceId;
  dataset: UploadedDataset | undefined;
  onFile: (sourceId: SourceId, file: File) => void;
  onClear: (sourceId: SourceId) => void;
}) {
  const inputId = `pipeline-upload-${sourceId}`;
  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(sourceId, file);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        border: `1px dashed ${dataset ? CT.ok : CT.accentEdge}`,
        borderRadius: 8,
        background: dataset ? CT.okSoft : CT.accentSoft,
        padding: 10,
        marginBottom: 10,
        cursor: "pointer",
      }}
    >
      <input
        id={inputId}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls,.json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(sourceId, file);
          event.currentTarget.value = "";
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: dataset ? CT.ok : CT.accent }}>
          <UploadCloud size={15} />
          {dataset ? "Yüklü veri" : "Veri yükle"}
        </span>
        {dataset && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onClear(sourceId);
            }}
            style={{ border: 0, background: "transparent", color: CT.inkMuted, cursor: "pointer", display: "inline-flex" }}
            title="Veriyi kaldır"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ fontSize: 10.5, lineHeight: 1.4, color: CT.inkSub }}>
        {dataset ? `${dataset.fileName} - ${dataset.rows.length} satır, ${dataset.columns.length} kolon` : "CSV, XLSX veya JSON sürükle-bırak"}
      </div>
    </label>
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

async function parseTabularFile(file: File): Promise<UploadedDataset> {
  const sheets = await parseWorkbookFile(file);
  return sheets[0];
}

async function parseWorkbookFile(file: File): Promise<WorkbookSheetDataset[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const sheetEntries: Array<{ sheetName: string; rows: Array<Record<string, any>> }> = [];

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      sheetEntries.push({
        sheetName,
        rows: XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" }),
      });
    }
  } else if (ext === "json") {
    const parsed = JSON.parse(await file.text());
    if (Array.isArray(parsed)) {
      sheetEntries.push({ sheetName: "JSON", rows: parsed });
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed.rows)) {
      const tableKeys = Object.keys(parsed).filter(key => Array.isArray(parsed[key]));
      if (tableKeys.length > 0) {
        tableKeys.forEach(key => sheetEntries.push({ sheetName: key, rows: parsed[key] }));
      } else {
        sheetEntries.push({ sheetName: "JSON", rows: [parsed] });
      }
    } else {
      sheetEntries.push({ sheetName: "JSON", rows: Array.isArray(parsed.rows) ? parsed.rows : [parsed] });
    }
  } else {
    sheetEntries.push({ sheetName: ext === "tsv" ? "TSV" : "CSV", rows: parseDelimited(await file.text(), ext === "tsv" ? "\t" : undefined) });
  }

  const datasets = sheetEntries.map(({ sheetName, rows }) => {
    const normalizedRows = rows.map(row => normalizeParsedRow(row)).filter(row => Object.values(row).some(value => value !== ""));
    const columns = Array.from(normalizedRows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach(key => set.add(key));
      return set;
    }, new Set<string>()));
    return {
      fileName: file.name,
      sheetName,
      columns,
      rows: normalizedRows,
    };
  }).filter(dataset => dataset.rows.length > 0 && dataset.columns.length > 0);

  if (datasets.length === 0) {
    throw new Error("Dosyada okunabilir tablo verisi bulunamadı");
  }

  return datasets;
}

function inferSourceForDataset(dataset: WorkbookSheetDataset, sources: SourceDef[]): SourceId | null {
  const haystack = normalizeMatchText([
    dataset.fileName,
    dataset.sheetName,
    ...dataset.columns,
  ].join(" "));

  const scores = sources.map(source => {
    const keywords = sourceKeywords[source.id] ?? [];
    const keywordScore = keywords.reduce((score, keyword) => score + (haystack.includes(normalizeMatchText(keyword)) ? 4 : 0), 0);
    const joinScore = source.joinsOn.reduce((score, key) => score + (haystack.includes(normalizeMatchText(key)) ? 2 : 0), 0);
    const primaryScore = haystack.includes(normalizeMatchText(source.primaryKey)) ? 3 : 0;
    return { sourceId: source.id, score: keywordScore + joinScore + primaryScore };
  }).sort((a, b) => b.score - a.score);

  return scores[0]?.score > 0 ? scores[0].sourceId : null;
}

function normalizeMatchText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "_");
}

function parseDelimited(text: string, forcedDelimiter?: string): Array<Record<string, any>> {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = forcedDelimiter ?? detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map((header, index) => normalizeColumnName(header || `column_${index + 1}`));

  return lines.slice(1).map(line => {
    const cells = splitDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, coerceCell(cells[index] ?? "")]));
  });
}

function detectDelimiter(headerLine: string) {
  const candidates = [",", ";", "\t", "|"];
  return candidates
    .map(delimiter => ({ delimiter, count: splitDelimitedLine(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeParsedRow(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).map(([key, value], index) => [
    normalizeColumnName(key || `column_${index + 1}`),
    coerceCell(value),
  ]));
}

function normalizeColumnName(key: string) {
  return key
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\wğüşöçıİĞÜŞÖÇ.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "column";
}

function coerceCell(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const raw = String(value).trim();
  if (raw === "") return "";
  const normalizedNumber = raw.replace(/\./g, "").replace(",", ".");
  if (/^-?\d+([,.]\d+)?$/.test(raw) && Number.isFinite(Number(normalizedNumber))) {
    return Number(normalizedNumber);
  }
  return raw;
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

const workbookPanelStyle: CSSProperties = {
  flexBasis: "100%",
  display: "flex",
  alignItems: "stretch",
  gap: 10,
  minWidth: 0,
};

const workbookDropStyle: CSSProperties = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: `1px dashed ${CT.accentEdge}`,
  borderRadius: 8,
  background: CT.surface,
  color: CT.accent,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  minWidth: 196,
};

const workbookSheetGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr)) 32px",
  gap: 8,
  flex: 1,
  minWidth: 0,
};

const workbookSheetRowStyle: CSSProperties = {
  minHeight: 34,
  display: "grid",
  gridTemplateColumns: "minmax(86px, 1fr) 118px",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: "5px 8px",
};

const sheetSelectStyle: CSSProperties = {
  minWidth: 0,
  height: 26,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 6,
  background: CT.surface,
  color: CT.ink,
  fontSize: 11,
  fontFamily: CT_FONT,
};

const workbookClearStyle: CSSProperties = {
  width: 32,
  height: 34,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  color: CT.inkMuted,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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
