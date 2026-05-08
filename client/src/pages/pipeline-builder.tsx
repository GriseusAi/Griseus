import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  ArrowDownToLine,
  Box,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GitBranch,
  Hammer,
  Layers3,
  Link2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Table2,
  UploadCloud,
} from "lucide-react";

type NodeKind = "dataset" | "transform" | "join" | "union" | "output";
type PortSide = "left" | "right";

type PipelineNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  rows: Array<Record<string, any>>;
  columns: string[];
  sourceFile?: string;
};

type GraphConnection = {
  from: string;
  to: string;
};

type UploadedDataset = {
  fileName: string;
  sheetName: string;
  columns: string[];
  rows: Array<Record<string, any>>;
};

type TransformResult = {
  kind: "recipe" | "stock" | "sales" | "generic";
  rows: Array<Record<string, any>>;
  columns: string[];
};

type ActionMenuState = {
  nodeId: string;
  x: number;
  y: number;
} | null;

const initialDatasetId = "dataset-raw-1";
const initialOutputId = "output-1";

const initialNodes: PipelineNode[] = [
  {
    id: initialDatasetId,
    kind: "dataset",
    title: "Data kutusu",
    subtitle: "XLS, CSV veya JSON yükle",
    x: 80,
    y: 146,
    rows: [],
    columns: [],
  },
  {
    id: initialOutputId,
    kind: "output",
    title: "Clean data output",
    subtitle: "Transform sonrası çıktı",
    x: 890,
    y: 188,
    rows: [],
    columns: [],
  },
];

export default function PipelineBuilderPage() {
  const [nodes, setNodes] = useState<PipelineNode[]>(initialNodes);
  const [connections, setConnections] = useState<GraphConnection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState(initialDatasetId);
  const [actionMenu, setActionMenu] = useState<ActionMenuState>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? nodes[0];
  const previewColumns = selectedNode?.columns ?? [];
  const previewRows = selectedNode?.rows ?? [];

  const outputNode = nodes.find(node => node.kind === "output");
  const datasetCount = nodes.filter(node => node.kind === "dataset").length;
  const transformCount = nodes.filter(node => node.kind === "transform").length;

  const renderedEdges = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return connections.map(connection => {
      const from = byId.get(connection.from);
      const to = byId.get(connection.to);
      if (!from || !to) return null;
      return {
        key: `${connection.from}-${connection.to}`,
        x1: getPortPosition(from, "right").x,
        y1: getPortPosition(from, "right").y,
        x2: getPortPosition(to, "left").x,
        y2: getPortPosition(to, "left").y,
      };
    }).filter((edge): edge is { key: string; x1: number; y1: number; x2: number; y2: number } => Boolean(edge));
  }, [connections, nodes]);

  const canvasSize = useMemo(() => {
    const maxX = Math.max(...nodes.map(node => node.x + nodeWidth(node.kind)), 1800);
    const maxY = Math.max(...nodes.map(node => node.y + nodeHeight(node.kind)), 900);
    return { width: maxX + 520, height: maxY + 320 };
  }, [nodes]);

  function getPortPosition(node: PipelineNode, side: PortSide) {
    const nodeW = nodeWidth(node.kind);
    const nodeH = nodeHeight(node.kind);
    return {
      x: side === "right" ? node.x + nodeW : node.x,
      y: node.y + nodeH / 2,
    };
  }

  async function handleNodeFile(nodeId: string, file: File) {
    try {
      setError(null);
      const [dataset] = await parseWorkbookFile(file);
      setNodes(prev => recalculateGraph(prev.map(node => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          title: dataset.sheetName === "CSV" || dataset.sheetName === "JSON" ? cleanTitle(file.name) : dataset.sheetName,
          subtitle: `${dataset.rows.length} rows, ${dataset.columns.length} columns`,
          rows: dataset.rows,
          columns: dataset.columns,
          sourceFile: dataset.fileName,
        };
      }), connections));
      setSelectedNodeId(nodeId);
    } catch (err: any) {
      setError(err.message || "Dosya okunamadı");
    }
  }

  function addDataset() {
    const index = nodes.filter(node => node.kind === "dataset").length + 1;
    const id = `dataset-raw-${Date.now()}`;
    setNodes(prev => [...prev, {
      id,
      kind: "dataset",
      title: `Dataset ${index}`,
      subtitle: "XLS, CSV veya JSON yükle",
      x: 80,
      y: 120 + index * 112,
      rows: [],
      columns: [],
    }]);
    setSelectedNodeId(id);
    setActionMenu(null);
  }

  function openPortMenu(nodeId: string, side: PortSide) {
    const node = nodes.find(item => item.id === nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    if (side === "left") {
      setActionMenu(null);
      return;
    }
    setActionMenu({
      nodeId,
      x: node.x + nodeWidth(node.kind) + 18,
      y: node.y - 26,
    });
  }

  function createTransform(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    const transformIndex = nodes.filter(node => node.kind === "transform").length + 1;
    const cleaned = transformRows(source.rows, source.sourceFile ?? source.title);
    const transformId = `transform-${Date.now()}`;
    const x = Math.max(source.x + 330, 420);
    const y = source.y;

    const transformNode: PipelineNode = {
      id: transformId,
      kind: "transform",
      title: `${source.title} - Clean`,
      subtitle: `${cleaned.kind} · ${cleaned.columns.length} columns`,
      x,
      y,
      rows: cleaned.rows,
      columns: cleaned.columns,
      sourceFile: source.sourceFile,
    };

    setNodes(prev => prev.concat(transformNode));

    setConnections(prev => {
      const next = [
        ...prev,
        { from: fromId, to: transformId },
      ];
      return dedupeConnections(next);
    });

    setSelectedNodeId(transformId);
    setActionMenu(null);
    setError(cleaned.rows.length === 0 ? "Transform node'u hazır. Data kutusuna dosya yüklenince clean data buraya akacak." : null);
    void transformIndex;
  }

  function createJoin(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    const otherInputs = nodes.filter(node => node.kind !== "output" && node.id !== fromId && node.rows.length > 0);
    const second = otherInputs[0];
    const joined = second ? joinRows(source, second) : { rows: source.rows, columns: source.columns };
    const id = `join-${Date.now()}`;
    const joinNode: PipelineNode = {
      id,
      kind: "join",
      title: second ? `Join ${source.title}` : "Join",
      subtitle: second ? `${joined.columns.length} columns` : "İkinci dataset bekleniyor",
      x: Math.max(source.x + 330, 420),
      y: source.y + 24,
      rows: joined.rows,
      columns: joined.columns,
    };
    setNodes(prev => prev.concat(joinNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      { from: fromId, to: id },
      ...(second ? [{ from: second.id, to: id }] : []),
    ]));
    setSelectedNodeId(id);
    setActionMenu(null);
  }

  function createUnion(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    const siblings = nodes.filter(node => node.kind === "dataset" && node.rows.length > 0);
    const groupedSources = siblings.length > 0 ? siblings : nodes.filter(node => node.kind === "dataset");
    const allColumns = Array.from(new Set(groupedSources.flatMap(node => node.columns)));
    const rows = groupedSources.flatMap(node => node.rows.map(row => Object.fromEntries(allColumns.map(col => [col, row[col] ?? ""]))));
    const id = `union-${Date.now()}`;
    const unionNode: PipelineNode = {
      id,
      kind: "union",
      title: "Union",
      subtitle: `${rows.length} rows`,
      x: Math.max(source.x + 330, 420),
      y: source.y + 24,
      rows,
      columns: allColumns,
    };
    setNodes(prev => prev.concat(unionNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      ...groupedSources.map(node => ({ from: node.id, to: id })),
    ]));
    setSelectedNodeId(id);
    setActionMenu(null);
  }

  function editNodeData(nodeId: string) {
    setSelectedNodeId(nodeId);
    setActionMenu(null);
    setError("Edit modu: alttaki Data preview üzerinden dosya yükleyip datayı yenileyebilirsin.");
  }

  function createOutputFrom(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    const output = nodes.find(node => node.kind === "output");
    if (!source || !output) return;
    setNodes(prev => prev.map(node => node.id === output.id ? {
      ...node,
      title: `${source.title} data`,
      subtitle: `${source.rows.length} rows`,
      rows: source.rows,
      columns: source.columns,
    } : node));
    setConnections(prev => dedupeConnections([
      ...prev.filter(connection => connection.to !== output.id),
      { from: fromId, to: output.id },
    ]));
    setSelectedNodeId(output.id);
    setActionMenu(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT }}>
      <TopNav />

      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GitBranch size={18} color={CT.accent} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Pipeline Builder</div>
            <div style={{ fontSize: 10, color: CT.inkMuted, fontFamily: CT_MONO }}>
              Input dataset → Transform → Preview → Output
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={addDataset} style={toolbarButtonStyle}>
            <Plus size={14} /> Add dataset
          </button>
          <button type="button" style={toolbarButtonStyle}>
            <Save size={14} /> Save
          </button>
          <button type="button" style={deployButtonStyle}>
            <ArrowDownToLine size={14} /> Deliver
          </button>
        </div>
      </header>

      <main style={{ display: "grid", gridTemplateRows: "1fr 310px", height: "calc(100vh - 94px)", minHeight: 680 }}>
        <section style={canvasViewportStyle}>
          <div style={{ position: "relative", width: canvasSize.width, height: canvasSize.height }}>
            <svg width={canvasSize.width} height={canvasSize.height} style={{ position: "absolute", inset: 0 }}>
              {renderedEdges.map(edge => (
                <EdgeLine key={edge.key} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
              ))}
            </svg>

            {nodes.map(node => (
              <PipelineGraphNode
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                onSelect={() => {
                  setSelectedNodeId(node.id);
                  setActionMenu(null);
                }}
                onPortClick={(side) => openPortMenu(node.id, side)}
                onFile={(file) => handleNodeFile(node.id, file)}
              />
            ))}

            {actionMenu && (
              <NodeActionMenu
                state={actionMenu}
                onTransform={() => createTransform(actionMenu.nodeId)}
                onJoin={() => createJoin(actionMenu.nodeId)}
                onUnion={() => createUnion(actionMenu.nodeId)}
                onNewDataset={() => {
                  addDataset();
                  setActionMenu(null);
                }}
                onOutput={() => createOutputFrom(actionMenu.nodeId)}
                onEdit={() => editNodeData(actionMenu.nodeId)}
              />
            )}
          </div>
        </section>

        <section style={{ borderTop: `1px solid ${CT.borderStrong}`, background: CT.surface, overflow: "hidden" }}>
          <div style={previewHeaderStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
              <Table2 size={15} color={CT.accent} />
              Data preview
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: error ? CT.err : CT.inkMuted, fontSize: 11 }}>
              <CheckCircle2 size={14} color={error ? CT.err : CT.ok} />
              {error ?? `${selectedNode?.title ?? "Dataset"} · ${previewRows.length} rows · ${previewColumns.length} columns`}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "270px 1fr", height: 272 }}>
            <aside style={{ borderRight: `1px solid ${CT.border}`, padding: 12, overflow: "auto" }}>
              {selectedNode?.kind === "dataset" && (
                <UploadDropzone
                  node={selectedNode}
                  onFile={(file) => handleNodeFile(selectedNode.id, file)}
                />
              )}
              <div style={previewNodePillStyle}>
                {nodeIcon(selectedNode?.kind ?? "dataset", 14)}
                <span>{selectedNode?.title ?? "Dataset"}</span>
              </div>
              <div style={searchBoxStyle}>
                <Search size={14} color={CT.inkMuted} />
                <span style={{ color: CT.inkMuted, fontSize: 12 }}>Search {previewColumns.length} columns...</span>
              </div>
              {previewColumns.map(col => (
                <div key={col} style={columnRowStyle}>
                  <span>{col}</span>
                  <span style={{ color: CT.inkMuted, fontSize: 10, fontFamily: CT_MONO }}>{inferColumnType(previewRows, col)}</span>
                </div>
              ))}
            </aside>

            <div style={{ overflow: "auto" }}>
              {previewRows.length === 0 && (
                <div style={{ padding: 22, color: CT.inkMuted, fontSize: 13 }}>
                  Dataset kutusuna dosya yükle, sonra kutunun sağ portuna basıp Transform seç.
                </div>
              )}
              {previewRows.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, minWidth: 44, width: 44 }}>#</th>
                      {previewColumns.map(col => <th key={col} style={thStyle}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 100).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ ...tdStyle, color: CT.inkMuted, fontFamily: CT_MONO }}>{idx + 1}</td>
                        {previewColumns.map(col => <td key={`${idx}-${col}`} style={tdStyle}>{formatCell(row[col])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </main>

      <aside style={summaryPanelStyle}>
        <Metric label="Datasets" value={datasetCount} />
        <Metric label="Transforms" value={transformCount} />
        <Metric label="Output rows" value={outputNode?.rows.length ?? 0} />
      </aside>
    </div>
  );
}

function PipelineGraphNode({ node, selected, onSelect, onPortClick, onFile }: {
  node: PipelineNode;
  selected: boolean;
  onSelect: () => void;
  onPortClick: (side: PortSide) => void;
  onFile: (file: File) => void;
}) {
  const uploadInputId = `pipeline-node-upload-${node.id}`;
  const isDataset = node.kind === "dataset";
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...nodeStyle,
        left: node.x,
        top: node.y,
        width: nodeWidth(node.kind),
        height: nodeHeight(node.kind),
        borderColor: selected ? nodeTone(node.kind) : CT.borderStrong,
        boxShadow: selected ? "0 0 0 3px rgba(73,92,114,0.16), 0 5px 16px rgba(20,20,19,0.12)" : nodeStyle.boxShadow,
      }}
    >
      <GraphPort side="left" onClick={() => onPortClick("left")} />
      <div style={nodeTitleStyle}>
        {nodeIcon(node.kind, 18)}
        <span style={{ fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.title}</span>
      </div>
      <div style={nodeMetaStyle}>{node.subtitle}</div>
      {node.columns.length > 0 && <div style={nodeCountStyle}>{node.columns.length} columns</div>}
      {isDataset && (
        <label htmlFor={uploadInputId} style={nodeUploadStyle} onClick={(event) => event.stopPropagation()}>
          <input
            id={uploadInputId}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onFile(file);
              event.currentTarget.value = "";
            }}
          />
          <UploadCloud size={13} />
        </label>
      )}
      <GraphPort side="right" onClick={() => onPortClick("right")} />
    </button>
  );
}

function NodeActionMenu({ state, onTransform, onJoin, onUnion, onNewDataset, onOutput, onEdit }: {
  state: NonNullable<ActionMenuState>;
  onTransform: () => void;
  onJoin: () => void;
  onUnion: () => void;
  onNewDataset: () => void;
  onOutput: () => void;
  onEdit: () => void;
}) {
  return (
    <div style={{ ...actionMenuStyle, left: state.x, top: state.y }}>
      <ActionItem icon={<Sparkles size={18} />} label="Transform" tone={CT.info} onClick={onTransform} />
      <ActionItem icon={<Layers3 size={18} />} label="Join" tone="#7b61d1" onClick={onJoin} />
      <ActionItem icon={<Box size={18} />} label="Union" tone="#d92f7d" onClick={onUnion} />
      <div style={actionDividerStyle} />
      <ActionItem icon={<ArrowDownToLine size={18} />} label="New dataset" tone="#cc8a00" onClick={onNewDataset} />
      <ActionItem icon={<Database size={18} />} label="Output" tone={CT.ok} onClick={onOutput} />
      <div style={actionDividerStyle} />
      <ActionItem icon={<Pencil size={18} />} label="Edit" tone={CT.inkMuted} onClick={onEdit} />
    </div>
  );
}

function ActionItem({ icon, label, tone, disabled = false, onClick }: {
  icon: JSX.Element;
  label: string;
  tone: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...actionItemStyle,
        color: disabled ? CT.inkFaint : tone,
        opacity: disabled ? 0.46 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function GraphPort({ side, onClick }: { side: PortSide; onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={side === "right" ? "Output (+)" : "Input (-)"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      style={{
        ...graphPortStyle,
        ...(side === "right" ? outputPortStyle : inputPortStyle),
        [side]: -13,
      }}
    />
  );
}

function UploadDropzone({ node, onFile }: { node: PipelineNode; onFile: (file: File) => void }) {
  const inputId = `pipeline-preview-upload-${node.id}`;
  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      style={uploadDropzoneStyle}
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
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 750, color: CT.accent }}>
        <UploadCloud size={15} /> Add data
      </span>
      <span style={{ fontSize: 10.5, color: CT.inkSub }}>{node.sourceFile ?? "CSV, XLSX, JSON"}</span>
    </label>
  );
}

function EdgeLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mid = (x1 + x2) / 2;
  return (
    <g>
      <path d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke="rgba(86,101,119,0.58)" strokeWidth="2" />
      <circle cx={x1} cy={y1} r="5" fill="#eef1f5" stroke="rgba(86,101,119,0.58)" strokeWidth="2" />
      <circle cx={x2} cy={y2} r="5" fill="#eef1f5" stroke="rgba(86,101,119,0.58)" strokeWidth="2" />
    </g>
  );
}

async function parseWorkbookFile(file: File): Promise<UploadedDataset[]> {
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
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.rows)) {
      sheetEntries.push({ sheetName: "JSON", rows: parsed.rows });
    } else if (parsed && typeof parsed === "object") {
      const tableKeys = Object.keys(parsed).filter(key => Array.isArray(parsed[key]));
      if (tableKeys.length > 0) {
        tableKeys.forEach(key => sheetEntries.push({ sheetName: key, rows: parsed[key] }));
      } else {
        sheetEntries.push({ sheetName: "JSON", rows: [parsed] });
      }
    }
  } else {
    sheetEntries.push({ sheetName: ext === "tsv" ? "TSV" : "CSV", rows: parseDelimited(await file.text(), ext === "tsv" ? "\t" : undefined) });
  }

  const datasets = sheetEntries.map(({ sheetName, rows }) => {
    const normalizedRows = rows.map(row => normalizeParsedRow(row)).filter(row => Object.values(row).some(value => value !== ""));
    const columns = collectColumns(normalizedRows);
    return {
      fileName: file.name,
      sheetName,
      columns,
      rows: normalizedRows,
    };
  }).filter(dataset => dataset.rows.length > 0 && dataset.columns.length > 0);

  if (datasets.length === 0) throw new Error("Dosyada okunabilir tablo verisi bulunamadı");
  return datasets;
}

function transformRows(rows: Array<Record<string, any>>, sourceName = ""): TransformResult {
  const generic = cleanRows(rows);
  const profile = inferDatasetProfile(generic.rows, generic.columns, sourceName);

  if (profile.kind === "recipe") {
    return { ...normalizeRecipeDataset(rows), kind: "recipe" };
  }
  if (profile.kind === "stock") {
    return { ...normalizeStockDataset(rows), kind: "stock" };
  }

  return { ...generic, kind: profile.kind };
}

function cleanRows(rows: Array<Record<string, any>>) {
  const cleanColumnByRaw = new Map<string, string>();
  const used = new Map<string, number>();

  rows.forEach(row => {
    Object.keys(row).forEach(rawKey => {
      if (cleanColumnByRaw.has(rawKey)) return;
      const base = normalizeCleanColumn(rawKey);
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      cleanColumnByRaw.set(rawKey, count === 0 ? base : `${base}_${count + 1}`);
    });
  });

  const cleanedRows = rows.map(row => {
    const next: Record<string, any> = {};
    cleanColumnByRaw.forEach((cleanKey, rawKey) => {
      next[cleanKey] = coerceValueForColumn(row[rawKey], cleanKey);
    });
    return next;
  }).filter(row => Object.values(row).some(value => value !== ""));

  const columns = collectColumns(cleanedRows);
  return { rows: cleanedRows, columns };
}

function inferDatasetProfile(rows: Array<Record<string, any>>, columns: string[], sourceName: string) {
  const normalizedColumns = new Set(columns.map(normalizeCleanColumn));
  const normalizedName = normalizeCleanColumn(sourceName);
  const has = (name: string) => normalizedColumns.has(name);

  if (has("stok_kodu") && has("stok_ismi") && has("stok_bakiyesi")) {
    return { kind: "stock" as const, confidence: 0.96 };
  }
  if (has("stok_kodu") && has("stok_ismi") && has("miktar") && (has("sira_no") || has("stok_sevi"))) {
    return { kind: "recipe" as const, confidence: 0.96 };
  }
  if (normalizedName.includes("stok") && rows.some(row => row.stok_bakiyesi !== undefined || row.current_stock !== undefined)) {
    return { kind: "stock" as const, confidence: 0.75 };
  }
  if (normalizedName.includes("recete") || rows.some(row => row.miktar !== undefined && row.stok_kodu !== undefined)) {
    return { kind: "recipe" as const, confidence: 0.72 };
  }
  if (columns.some(col => ["sales", "satis", "quantity_sold", "adet", "aylik_satis"].includes(normalizeCleanColumn(col)))) {
    return { kind: "sales" as const, confidence: 0.68 };
  }
  return { kind: "generic" as const, confidence: 0.35 };
}

function normalizeRecipeDataset(rows: Array<Record<string, any>>) {
  const columnsByAlias = buildAliasMap(rows);
  const codeCol = pickAlias(columnsByAlias, ["stok_kodu", "stock_code", "code", "kod"]);
  const nameCol = pickAlias(columnsByAlias, ["stok_ismi", "stok_adi", "stock_name", "name", "isim"]);
  const sequenceCol = pickAlias(columnsByAlias, ["sira_no", "sira", "sequence_no"]);
  const quantityCol = pickAlias(columnsByAlias, ["miktar", "quantity", "qty", "recete_adedi"]);
  const unitCol = pickAlias(columnsByAlias, ["br", "birim", "unit"]);
  const unitCostCol = pickAlias(columnsByAlias, ["br_maliyet", "birim_maliyet", "unit_cost"]);
  const totalCostCol = pickAlias(columnsByAlias, ["t_maliyet", "toplam_maliyet", "total_cost"]);
  const stockLevelCol = pickAlias(columnsByAlias, ["stok_sevi", "stok_seviyesi", "stock_level"]);

  const root = rows.find(row => getCell(row, codeCol));
  const productSku = normalizeIdentifier(getRawStockCode(root ?? {}, codeCol));
  const productName = trimText(getCell(root, nameCol));
  const stack: Record<number, string> = {};

  const normalizedRows = rows.map((row, index): Record<string, any> | null => {
    const rawCode = getRawStockCode(row, codeCol);
    const code = normalizeIdentifier(rawCode);
    if (!code) return null;
    const sequenceNo = trimText(getCell(row, sequenceCol));
    const rowType = index === 0 || (!sequenceNo && code === productSku) ? "product" : "component";
    const tier = rowType === "product" ? 0 : inferTier(rawCode, sequenceNo);
    const parentComponentCode = rowType === "component" && tier > 1 ? stack[tier - 1] ?? null : null;
    if (rowType === "component") stack[tier] = code;

    return {
      dataset_type: "recipe",
      row_type: rowType,
      product_sku: productSku || code,
      product_name: productName || trimText(getCell(row, nameCol)),
      component_code: rowType === "component" ? code : null,
      component_name: rowType === "component" ? trimText(getCell(row, nameCol)) : null,
      sequence_no: sequenceNo || null,
      quantity: toNumberOrNull(getCell(row, quantityCol)),
      unit: trimText(getCell(row, unitCol)) || null,
      tier,
      parent_component_code: parentComponentCode,
      unit_cost: toNumberOrNull(getCell(row, unitCostCol)),
      total_cost: toNumberOrNull(getCell(row, totalCostCol)),
      stock_level: toNumberOrNull(getCell(row, stockLevelCol)),
    };
  }).filter((row): row is Record<string, any> => row !== null);

  return { rows: normalizedRows, columns: collectColumns(normalizedRows) };
}

function normalizeStockDataset(rows: Array<Record<string, any>>) {
  const columnsByAlias = buildAliasMap(rows);
  const codeCol = pickAlias(columnsByAlias, ["stok_kodu", "stock_code", "code", "kod"]);
  const nameCol = pickAlias(columnsByAlias, ["stok_ismi", "stok_adi", "stock_name", "name", "isim"]);
  const balanceCol = pickAlias(columnsByAlias, ["stok_bakiyesi", "stok_bakiye", "current_stock", "stock", "bakiye"]);

  const root = rows.find(row => getCell(row, codeCol));
  const productSku = normalizeIdentifier(getRawStockCode(root ?? {}, codeCol));
  const productName = trimText(getCell(root, nameCol));

  const normalizedRows = rows.map((row, index): Record<string, any> | null => {
    const rawCode = getRawStockCode(row, codeCol);
    const code = normalizeIdentifier(rawCode);
    if (!code) return null;
    const rowType = index === 0 || code === productSku ? "product" : "component";

    return {
      dataset_type: "stock",
      row_type: rowType,
      product_sku: productSku || code,
      product_name: productName || trimText(getCell(row, nameCol)),
      component_code: rowType === "component" ? code : null,
      component_name: rowType === "component" ? trimText(getCell(row, nameCol)) : null,
      current_stock: toNumberOrNull(getCell(row, balanceCol)),
      tier: rowType === "product" ? 0 : inferTier(rawCode, null),
    };
  }).filter((row): row is Record<string, any> => row !== null);

  return { rows: normalizedRows, columns: collectColumns(normalizedRows) };
}

function buildAliasMap(rows: Array<Record<string, any>>) {
  const aliases = new Map<string, string>();
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      aliases.set(normalizeCleanColumn(key), key);
    });
  });
  return aliases;
}

function pickAlias(aliases: Map<string, string>, names: string[]) {
  for (const name of names) {
    const found = aliases.get(name);
    if (found) return found;
  }
  return undefined;
}

function getCell(row: Record<string, any> | undefined, key: string | undefined) {
  if (!row || !key) return "";
  return row[key];
}

function getRawStockCode(row: Record<string, any>, codeCol: string | undefined) {
  const raw = (row as any).__stockCodeRaw;
  if (raw !== undefined) return String(raw);
  return String(getCell(row, codeCol) ?? "");
}

function inferTier(rawCode: string, sequenceNo: string | null) {
  const indent = rawCode.match(/^\s*/)?.[0].length ?? 0;
  if (indent > 0) return Math.max(1, Math.round(indent / 5));
  return sequenceNo ? 1 : 1;
}

function trimText(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeIdentifier(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, "");
}

function toNumberOrNull(value: any) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceValueForColumn(value: any, columnName: string) {
  const normalized = normalizeCleanColumn(columnName);
  if (isIdentifierColumn(normalized)) return normalizeIdentifier(value);
  if (isTextColumn(normalized)) return trimText(value);
  if (isNumericColumn(normalized)) return toNumberOrNull(value) ?? "";
  return cleanValue(value);
}

function isIdentifierColumn(columnName: string) {
  return [
    "stok_kodu",
    "stock_code",
    "component_code",
    "component_kodu",
    "komponent_kodu",
    "product_sku",
    "cihaz_sku",
    "sku",
    "code",
    "kod",
  ].includes(columnName);
}

function isTextColumn(columnName: string) {
  return [
    "stok_ismi",
    "stok_adi",
    "stock_name",
    "component_name",
    "component_adi",
    "komponent_adi",
    "product_name",
    "cihaz_adi",
    "name",
    "isim",
    "br",
    "birim",
    "unit",
  ].includes(columnName);
}

function isNumericColumn(columnName: string) {
  return [
    "miktar",
    "quantity",
    "qty",
    "recete_adedi",
    "stok_sevi",
    "stok_seviyesi",
    "stok_bakiyesi",
    "stok_bakiye",
    "stock_level",
    "current_stock",
    "stock",
    "bakiye",
    "br_maliyet",
    "birim_maliyet",
    "unit_cost",
    "t_maliyet",
    "toplam_maliyet",
    "total_cost",
    "sales",
    "satis",
    "quantity_sold",
    "adet",
  ].includes(columnName);
}

function recalculateGraph(nodes: PipelineNode[], connections: GraphConnection[]) {
  const next = [...nodes];

  for (let pass = 0; pass < 3; pass++) {
    const byId = new Map(next.map(node => [node.id, node]));
    for (let i = 0; i < next.length; i++) {
      const node = next[i];
      if (node.kind === "dataset") continue;

      const inputNodes = connections
        .filter(connection => connection.to === node.id)
        .map(connection => byId.get(connection.from))
        .filter((input): input is PipelineNode => Boolean(input));

      if (inputNodes.length === 0) continue;

      if (node.kind === "transform") {
        const source = inputNodes[0];
        const cleaned = transformRows(source.rows, source.sourceFile ?? source.title);
        next[i] = {
          ...node,
          title: `${source.title} - Clean`,
          subtitle: source.rows.length > 0 ? `${cleaned.kind} · ${cleaned.columns.length} columns` : "Data bekleniyor",
          rows: cleaned.rows,
          columns: cleaned.columns,
          sourceFile: source.sourceFile,
        };
      } else if (node.kind === "join") {
        const [left, right] = inputNodes;
        const joined = right ? joinRows(left, right) : { rows: left.rows, columns: left.columns };
        next[i] = {
          ...node,
          title: right ? `Join ${left.title}` : "Join",
          subtitle: right ? `${joined.columns.length} columns` : "İkinci dataset bekleniyor",
          rows: joined.rows,
          columns: joined.columns,
        };
      } else if (node.kind === "union") {
        const columns = Array.from(new Set(inputNodes.flatMap(input => input.columns)));
        const rows = inputNodes.flatMap(input => input.rows.map(row => Object.fromEntries(columns.map(col => [col, row[col] ?? ""]))));
        next[i] = {
          ...node,
          subtitle: inputNodes.some(input => input.rows.length > 0) ? `${rows.length} rows` : "Data bekleniyor",
          rows,
          columns,
        };
      } else if (node.kind === "output") {
        const source = inputNodes[inputNodes.length - 1];
        next[i] = {
          ...node,
          title: `${source.title} data`,
          subtitle: `${source.rows.length} rows`,
          rows: source.rows,
          columns: source.columns,
        };
      }
    }
  }

  return next;
}

function normalizeCleanColumn(key: string) {
  const normalized = key
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "column";
}

function normalizeParsedRow(row: Record<string, any>) {
  const next: Record<string, any> = {};
  Object.entries(row).forEach(([key, value], index) => {
    const normalizedKey = normalizeSourceColumn(key || `column_${index + 1}`);
    next[normalizedKey] = coerceValueForColumn(value, normalizedKey);
    if (normalizeCleanColumn(normalizedKey) === "stok_kodu") {
      Object.defineProperty(next, "__stockCodeRaw", {
        value: value === null || value === undefined ? "" : String(value),
        enumerable: false,
      });
    }
  });
  return next;
}

function normalizeSourceColumn(key: string) {
  return key
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\wğüşöçıİĞÜŞÖÇ.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "column";
}

function cleanValue(value: any) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  const raw = String(value).trim();
  if (raw === "") return "";
  const normalizedNumber = raw.replace(/\./g, "").replace(",", ".");
  if (/^-?\d+([,.]\d+)?$/.test(raw) && Number.isFinite(Number(normalizedNumber))) {
    return Number(normalizedNumber);
  }
  return raw.replace(/\s+/g, " ");
}

function parseDelimited(text: string, forcedDelimiter?: string): Array<Record<string, any>> {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = forcedDelimiter ?? detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map((header, index) => normalizeSourceColumn(header || `column_${index + 1}`));

  return lines.slice(1).map(line => {
    const cells = splitDelimitedLine(line, delimiter);
    const row: Record<string, any> = {};
    headers.forEach((header, index) => {
      const value = cells[index] ?? "";
      row[header] = coerceValueForColumn(value, header);
      if (normalizeCleanColumn(header) === "stok_kodu") {
        Object.defineProperty(row, "__stockCodeRaw", {
          value,
          enumerable: false,
        });
      }
    });
    return row;
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

function joinRows(left: PipelineNode, right: PipelineNode) {
  const leftKey = pickJoinKey(left.columns, right.columns);
  if (!leftKey) {
    const columns = collectColumns(left.rows);
    return { rows: left.rows, columns };
  }
  const rightMap = new Map(right.rows.map(row => [String(row[leftKey]), row]));
  const rows = left.rows.map(row => ({ ...row, ...(rightMap.get(String(row[leftKey])) ?? {}) }));
  return { rows, columns: collectColumns(rows) };
}

function pickJoinKey(leftColumns: string[], rightColumns: string[]) {
  const preferred = ["id", "sku", "product_sku", "component_code", "code"];
  return preferred.find(key => leftColumns.includes(key) && rightColumns.includes(key))
    ?? leftColumns.find(key => rightColumns.includes(key))
    ?? null;
}

function collectColumns(rows: Array<Record<string, any>>) {
  return Array.from(rows.reduce<Set<string>>((set, row) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set<string>()));
}

function dedupeConnections(connections: GraphConnection[]) {
  const seen = new Set<string>();
  return connections.filter(connection => {
    const key = `${connection.from}-${connection.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
}

function nodeWidth(kind: NodeKind) {
  if (kind === "output") return 250;
  if (kind === "join" || kind === "union") return 260;
  return 300;
}

function nodeHeight(kind: NodeKind) {
  if (kind === "output") return 72;
  if (kind === "join" || kind === "union") return 104;
  return 92;
}

function nodeTone(kind: NodeKind) {
  if (kind === "dataset") return "#6b7a8f";
  if (kind === "transform") return CT.info;
  if (kind === "join") return "#7b61d1";
  if (kind === "union") return "#d92f7d";
  return CT.ok;
}

function nodeIcon(kind: NodeKind, size: number) {
  if (kind === "dataset") return <FileSpreadsheet size={size} color="#6b7a8f" />;
  if (kind === "transform") return <Hammer size={size} color={CT.info} />;
  if (kind === "join") return <Layers3 size={size} color="#7b61d1" />;
  if (kind === "union") return <Box size={size} color="#d92f7d" />;
  return <Database size={size} color={CT.ok} />;
}

function inferColumnType(rows: Array<Record<string, any>>, col: string) {
  const sample = rows.map(row => row[col]).find(value => value !== "" && value !== undefined && value !== null);
  if (typeof sample === "number") return "Number";
  if (typeof sample === "boolean") return "Bool";
  return "String";
}

function formatCell(value: any) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("tr-TR") : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  return String(value);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 0", borderBottom: `1px solid ${CT.border}` }}>
      <div style={{ color: CT.inkMuted, fontSize: 11 }}>{label}</div>
      <div style={{ color: CT.ink, fontSize: 13, fontWeight: 750, fontFamily: CT_MONO }}>{String(value)}</div>
    </div>
  );
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
  fontWeight: 650,
  fontFamily: CT_FONT,
  cursor: "pointer",
};

const deployButtonStyle: CSSProperties = {
  ...toolbarButtonStyle,
  color: CT.ok,
  borderColor: "rgba(63,143,91,0.28)",
  background: CT.okSoft,
};

const canvasViewportStyle: CSSProperties = {
  position: "relative",
  overflow: "auto",
  background: "#eef1f5",
  cursor: "default",
};

const nodeStyle: CSSProperties = {
  position: "absolute",
  borderRadius: 7,
  border: `1px solid ${CT.borderStrong}`,
  background: CT.surface,
  boxShadow: "0 4px 12px rgba(20,20,19,0.08)",
  color: CT.ink,
  fontFamily: CT_FONT,
  textAlign: "left",
  cursor: "pointer",
  padding: 0,
};

const nodeTitleStyle: CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px",
  borderBottom: `1px solid ${CT.borderStrong}`,
  fontSize: 14,
};

const nodeMetaStyle: CSSProperties = {
  padding: "10px 14px 4px",
  color: CT.inkMuted,
  fontSize: 12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const nodeCountStyle: CSSProperties = {
  padding: "0 14px",
  color: CT.inkMuted,
  fontSize: 12,
  fontFamily: CT_MONO,
};

const nodeUploadStyle: CSSProperties = {
  position: "absolute",
  right: 14,
  bottom: 10,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 24,
  borderRadius: 6,
  border: `1px dashed ${CT.accentEdge}`,
  color: CT.accent,
  background: CT.accentSoft,
  cursor: "pointer",
};

const graphPortStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 24,
  height: 24,
  borderRadius: 999,
  border: "4px solid #566577",
  transform: "translateY(-50%)",
  cursor: "crosshair",
  zIndex: 4,
};

const inputPortStyle: CSSProperties = {
  background: "#eef1f5",
  boxShadow: "inset 0 0 0 3px rgba(86,101,119,0.12)",
};

const outputPortStyle: CSSProperties = {
  background: CT.surface,
  boxShadow: "0 0 0 4px rgba(63,143,91,0.12)",
};

const actionMenuStyle: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  width: 220,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  boxShadow: "0 8px 24px rgba(20,20,19,0.16)",
  padding: 8,
};

const actionItemStyle: CSSProperties = {
  width: "100%",
  height: 40,
  display: "flex",
  alignItems: "center",
  gap: 12,
  border: 0,
  borderRadius: 6,
  background: "transparent",
  fontFamily: CT_FONT,
  fontSize: 16,
  fontWeight: 650,
  textAlign: "left",
};

const actionDividerStyle: CSSProperties = {
  height: 1,
  background: CT.borderStrong,
  margin: "6px 0",
};

const previewHeaderStyle: CSSProperties = {
  height: 38,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 14px",
  borderBottom: `1px solid ${CT.border}`,
};

const uploadDropzoneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  border: `1px dashed ${CT.accentEdge}`,
  borderRadius: 8,
  background: CT.accentSoft,
  padding: 10,
  marginBottom: 10,
  cursor: "pointer",
};

const previewNodePillStyle: CSSProperties = {
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  padding: "0 10px",
  marginBottom: 10,
  fontSize: 12,
  fontWeight: 700,
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
  gap: 8,
  minHeight: 30,
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
  fontWeight: 750,
  minWidth: 150,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "7px 10px",
  borderBottom: `1px solid ${CT.border}`,
  borderRight: `1px solid ${CT.border}`,
  color: CT.ink,
  whiteSpace: "nowrap",
  maxWidth: 260,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const summaryPanelStyle: CSSProperties = {
  position: "fixed",
  right: 14,
  bottom: 324,
  width: 210,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: "rgba(250,249,245,0.94)",
  padding: "8px 12px",
  boxShadow: "0 4px 18px rgba(20,20,19,0.08)",
};
