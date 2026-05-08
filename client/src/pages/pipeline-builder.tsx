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
        x1: from.x + nodeWidth(from.kind),
        y1: from.y + nodeHeight(from.kind) / 2,
        x2: to.x,
        y2: to.y + nodeHeight(to.kind) / 2,
      };
    }).filter((edge): edge is { key: string; x1: number; y1: number; x2: number; y2: number } => Boolean(edge));
  }, [connections, nodes]);

  async function handleNodeFile(nodeId: string, file: File) {
    try {
      setError(null);
      const [dataset] = await parseWorkbookFile(file);
      setNodes(prev => prev.map(node => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          title: dataset.sheetName === "CSV" || dataset.sheetName === "JSON" ? cleanTitle(file.name) : dataset.sheetName,
          subtitle: `${dataset.rows.length} rows, ${dataset.columns.length} columns`,
          rows: dataset.rows,
          columns: dataset.columns,
          sourceFile: dataset.fileName,
        };
      }));
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
    const cleaned = cleanRows(source.rows);
    const transformId = `transform-${Date.now()}`;
    const output = nodes.find(node => node.kind === "output");
    const x = Math.max(source.x + 330, 420);
    const y = source.y;

    const transformNode: PipelineNode = {
      id: transformId,
      kind: "transform",
      title: `${source.title} - Clean`,
      subtitle: `${cleaned.columns.length} columns`,
      x,
      y,
      rows: cleaned.rows,
      columns: cleaned.columns,
      sourceFile: source.sourceFile,
    };

    setNodes(prev => prev.map(node => {
      if (node.kind !== "output") return node;
      return {
        ...node,
        title: `${source.title} data`,
        subtitle: `${cleaned.rows.length} clean rows`,
        rows: cleaned.rows,
        columns: cleaned.columns,
        x: Math.max(x + 390, node.x),
        y: node.y,
      };
    }).concat(transformNode));

    setConnections(prev => {
      const withoutOutput = prev.filter(connection => !(connection.from === fromId && connection.to === output?.id));
      const next = [
        ...withoutOutput,
        { from: fromId, to: transformId },
      ];
      if (output) next.push({ from: transformId, to: output.id });
      return dedupeConnections(next);
    });

    setSelectedNodeId(transformId);
    setActionMenu(null);
    setError(cleaned.rows.length === 0 ? "Transform çalıştı ama kaynakta temizlenecek satır yok" : null);
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
    const output = nodes.find(node => node.kind === "output");
    setNodes(prev => prev.map(node => node.kind === "output" ? {
      ...node,
      title: joinNode.title,
      subtitle: `${joined.rows.length} rows`,
      rows: joined.rows,
      columns: joined.columns,
    } : node).concat(joinNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      { from: fromId, to: id },
      ...(second ? [{ from: second.id, to: id }] : []),
      ...(output ? [{ from: id, to: output.id }] : []),
    ]));
    setSelectedNodeId(id);
    setActionMenu(null);
  }

  function createUnion(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    const siblings = nodes.filter(node => node.kind === "dataset" && node.rows.length > 0);
    const allColumns = Array.from(new Set(siblings.flatMap(node => node.columns)));
    const rows = siblings.flatMap(node => node.rows.map(row => Object.fromEntries(allColumns.map(col => [col, row[col] ?? ""]))));
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
    const output = nodes.find(node => node.kind === "output");
    setNodes(prev => prev.map(node => node.kind === "output" ? {
      ...node,
      title: "Union data",
      subtitle: `${rows.length} rows`,
      rows,
      columns: allColumns,
    } : node).concat(unionNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      ...siblings.map(node => ({ from: node.id, to: id })),
      ...(output ? [{ from: id, to: output.id }] : []),
    ]));
    setSelectedNodeId(id);
    setActionMenu(null);
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
    setConnections(prev => dedupeConnections([...prev, { from: fromId, to: output.id }]));
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

      <main style={{ display: "grid", gridTemplateRows: "1fr 310px", minHeight: "calc(100vh - 94px)" }}>
        <section style={{ position: "relative", overflow: "auto", background: "#eef1f5" }}>
          <div style={{ position: "relative", width: 1280, height: 610 }}>
            <LaneLabel left={74} top={28} title="Input" />
            <LaneLabel left={430} top={28} title="Transform" />
            <LaneLabel left={900} top={28} title="Output" />

            <svg width="1280" height="610" style={{ position: "absolute", inset: 0 }}>
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
                canEdit={Boolean(nodes.find(node => node.id === actionMenu.nodeId)?.rows.length)}
                onTransform={() => createTransform(actionMenu.nodeId)}
                onJoin={() => createJoin(actionMenu.nodeId)}
                onUnion={() => createUnion(actionMenu.nodeId)}
                onNewDataset={() => {
                  addDataset();
                  setActionMenu(null);
                }}
                onOutput={() => createOutputFrom(actionMenu.nodeId)}
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
      {node.kind !== "dataset" && <GraphPort side="left" onClick={() => onPortClick("left")} />}
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

function NodeActionMenu({ state, canEdit, onTransform, onJoin, onUnion, onNewDataset, onOutput }: {
  state: NonNullable<ActionMenuState>;
  canEdit: boolean;
  onTransform: () => void;
  onJoin: () => void;
  onUnion: () => void;
  onNewDataset: () => void;
  onOutput: () => void;
}) {
  return (
    <div style={{ ...actionMenuStyle, left: state.x, top: state.y }}>
      <ActionItem icon={<Sparkles size={18} />} label="Transform" tone={CT.info} onClick={onTransform} disabled={!canEdit} />
      <ActionItem icon={<Layers3 size={18} />} label="Join" tone="#7b61d1" onClick={onJoin} disabled={!canEdit} />
      <ActionItem icon={<Box size={18} />} label="Union" tone="#d92f7d" onClick={onUnion} disabled={!canEdit} />
      <div style={actionDividerStyle} />
      <ActionItem icon={<ArrowDownToLine size={18} />} label="New dataset" tone="#cc8a00" onClick={onOutput} disabled={!canEdit} />
      <ActionItem icon={<Database size={18} />} label="New object type" tone="#cc8a00" onClick={onNewDataset} />
      <div style={actionDividerStyle} />
      <ActionItem icon={<Pencil size={18} />} label="Edit" tone={CT.inkMuted} onClick={onTransform} disabled={!canEdit} />
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
      title={side === "right" ? "Transform menüsü" : "Input port"}
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
      style={{ ...graphPortStyle, [side]: -13 }}
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

function LaneLabel({ left, top, title }: { left: number; top: number; title: string }) {
  return <div style={{ ...laneLabelStyle, left, top }}>{title}</div>;
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
      next[cleanKey] = cleanValue(row[rawKey]);
    });
    return next;
  }).filter(row => Object.values(row).some(value => value !== ""));

  const columns = collectColumns(cleanedRows);
  return { rows: cleanedRows, columns };
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
  return Object.fromEntries(Object.entries(row).map(([key, value], index) => [
    normalizeSourceColumn(key || `column_${index + 1}`),
    cleanValue(value),
  ]));
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
    return Object.fromEntries(headers.map((header, index) => [header, cleanValue(cells[index] ?? "")]));
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

const laneLabelStyle: CSSProperties = {
  position: "absolute",
  color: CT.err,
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: 0,
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
  background: "#eef1f5",
  transform: "translateY(-50%)",
  cursor: "crosshair",
  zIndex: 4,
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
