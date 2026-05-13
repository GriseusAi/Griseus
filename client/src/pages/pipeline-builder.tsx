import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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
  ListTree,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Table2,
  Trash2,
  UploadCloud,
} from "lucide-react";

type NodeKind = "dataset" | "transform" | "union" | "output" | "component";
type NodeFunctionKind = "customer" | "order" | "orderLine" | "device";
type SemanticRole = "customer" | "order" | "orderLine" | "device";
type PortSide = "left" | "right";

type OrderFields = {
  customer: string;
  deadline: string;
};

type OrderLineFields = {
  customer: string;
  deviceType: string;
  quantity: string;
  deadline: string;
};

type ProductOption = {
  id?: number;
  sku?: string;
  name: string;
  category?: string;
};

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
  functionKind?: NodeFunctionKind;
  semanticRole?: SemanticRole;
  semanticLabel?: string;
  backendKey?: SemanticRole;
  orderFields?: OrderFields;
  orderLineFields?: OrderLineFields;
  deviceSku?: string;
  deviceQuantity?: string;
  drilldownParentId?: string;
  bomComponent?: BomComponentNodeMeta;
  bomChildren?: BomStockComponent[];
  dbLinkedSku?: string;
};

type ConnectionKind = "transform" | "union" | "output" | "smart" | "drilldown";
type DrilldownConnectionScope = "device_component" | "subassembly_component";

type BomComponentNodeMeta = {
  sku: string;
  code: string;
  name: string;
  requiredPerUnit: number | null;
  unit: string;
  tier: number;
  currentStock: number | null;
  maxProducts: number | null;
  status: string;
  isSubAssembly: boolean;
  parentComponentCode: string | null;
};

type BomStockComponent = {
  code: string;
  name: string;
  requiredPerUnit: number;
  unit: string;
  tier: number;
  parentComponentCode: string | null;
  currentStock: number;
  rawStock?: number;
  maxProducts: number | null;
  status: string;
  isSubAssembly?: boolean;
  children?: BomStockComponent[];
};

type BomStockResponse = {
  product: string;
  components: BomStockComponent[];
};

type SemanticConnectionContract = {
  relation: "customer_order" | "order_order_line" | "order_line_device" | "order_device" | "generic";
  fromRole?: SemanticRole;
  toRole?: SemanticRole;
  fieldMap: Array<{ from: string; to: string }>;
  context: Record<string, string>;
  internal?: {
    entity: "orderLine";
    fields: OrderLineFields;
    contracts: Array<{
      relation: "order_order_line" | "order_line_device";
      fieldMap: Array<{ from: string; to: string }>;
    }>;
  };
  status: "local" | "validated" | "invalid";
  backendValidatedAt?: string;
  message?: string;
};

type GraphConnection = {
  from: string;
  to: string;
  kind?: ConnectionKind;
  scope?: DrilldownConnectionScope;
  contract?: SemanticConnectionContract;
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
  profileLabel?: string;
  productSku?: string;
  productFamily?: string;
};

type DatasetProfile = {
  kind: TransformResult["kind"];
  label: string;
  confidence: number;
  productSku?: string;
  productFamily?: string;
};

type ImportPlanAction = {
  id: string;
  label: string;
  targetTable: "bom_items" | "component_stock" | "sales_history" | "manual_review";
  mode: "replace" | "upsert" | "review";
  endpoint?: string;
  scope?: string;
  rowCount: number;
  confidence: number;
  warnings: string[];
  errors: string[];
  sample: Array<Record<string, any>>;
};

type ImportPlan = {
  id: string;
  sourceNodeTitle: string;
  totalRows: number;
  actions: ImportPlanAction[];
  warnings: string[];
  errors: string[];
  createdAt: string;
};

type ActionMenuState = {
  nodeId: string;
  x: number;
  y: number;
} | null;

type PendingConnection = {
  kind: "union" | "smart";
  sourceId: string;
} | null;

type DragState = {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  initialNodes: PipelineNode[];
  initialConnections: GraphConnection[];
  initialSelectedNodeId: string;
  historyPushed: boolean;
};

type GraphSnapshot = {
  nodes: PipelineNode[];
  connections: GraphConnection[];
  selectedNodeId: string;
};

type SavedPipelineGraph = GraphSnapshot & {
  id: string;
  name: string;
  savedAt: string;
  backendStored?: boolean;
};

const pipelineBuilderStorageKey = "griseus_pipeline_builder_graph_v1";
const pipelineBuilderHistoryStorageKey = "griseus_pipeline_builder_history_v1";
const initialDatasetId = "dataset-raw-1";
const fallbackProductOptions: ProductOption[] = [
  { sku: "GSS20P", name: "GSS20P" },
  { sku: "ELT.7-11", name: "ELT.7-11" },
  { sku: "BH.50ST.SV", name: "BH.50ST.SV" },
  { sku: "BH.50UT.SV", name: "BH.50UT.SV" },
  { sku: "BH.55ST.SV", name: "BH.55ST.SV" },
  { sku: "BH.55UT.SV", name: "BH.55UT.SV" },
];

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
];

export default function PipelineBuilderPage() {
  const initialGraph = useMemo(() => loadSavedPipelineGraph(), []);
  const initialSavedPipelines = useMemo(() => loadSavedPipelineHistory(), []);
  const [nodes, setNodes] = useState<PipelineNode[]>(initialGraph?.nodes ?? initialNodes);
  const [connections, setConnections] = useState<GraphConnection[]>(initialGraph?.connections ?? []);
  const [selectedNodeId, setSelectedNodeId] = useState(initialGraph?.selectedNodeId ?? initialDatasetId);
  const [actionMenu, setActionMenu] = useState<ActionMenuState>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [history, setHistory] = useState<GraphSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialGraph?.savedAt ?? null);
  const [productOptions, setProductOptions] = useState<ProductOption[]>(fallbackProductOptions);
  const [savedPipelines, setSavedPipelines] = useState<SavedPipelineGraph[]>(initialSavedPipelines);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(initialGraph?.id ?? null);
  const [savedPanelOpen, setSavedPanelOpen] = useState(false);

  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? nodes[0];
  const previewColumns = selectedNode?.columns ?? [];
  const previewRows = selectedNode?.rows ?? [];

  const outputNode = getOutputNode(nodes, connections, selectedNodeId);
  const datasetCount = nodes.filter(node => node.kind === "dataset").length;
  const transformCount = nodes.filter(node => node.kind === "transform").length;
  const canUndo = history.length > 0;
  const canDelete = Boolean(selectedNode);

  const renderedEdges = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return connections.map(connection => {
      const from = byId.get(connection.from);
      const to = byId.get(connection.to);
      if (!from || !to) return null;
      return {
        key: `${connection.from}-${connection.to}`,
        kind: connection.kind,
        scope: connection.scope,
        x1: getPortPosition(from, "right").x,
        y1: getPortPosition(from, "right").y,
        x2: getPortPosition(to, "left").x,
        y2: getPortPosition(to, "left").y,
      };
    }).filter((edge): edge is { key: string; kind: ConnectionKind | undefined; scope: DrilldownConnectionScope | undefined; x1: number; y1: number; x2: number; y2: number } => Boolean(edge));
  }, [connections, nodes]);

  const canvasSize = useMemo(() => {
    const maxX = Math.max(...nodes.map(node => node.x + nodeWidth(node.kind)), 1800);
    const maxY = Math.max(...nodes.map(node => node.y + effectiveNodeHeight(node)), 900);
    return { width: maxX + 520, height: maxY + 320 };
  }, [nodes]);

  function getPortPosition(node: PipelineNode, side: PortSide) {
    const nodeW = nodeWidth(node.kind);
    const nodeH = effectiveNodeHeight(node);
    return {
      x: side === "right" ? node.x + nodeW : node.x,
      y: node.y + nodeH / 2,
    };
  }

  function pushHistory() {
    setHistory(prev => [...prev.slice(-39), {
      nodes,
      connections,
      selectedNodeId,
    }]);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/products")
      .then(res => res.ok ? res.json() : Promise.reject(new Error("products unavailable")))
      .then((items: ProductOption[]) => {
        if (!alive || !Array.isArray(items)) return;
        const valid = items.filter(item => item && (item.sku || item.name));
        if (valid.length > 0) setProductOptions(valid);
      })
      .catch(() => {
        if (alive) setProductOptions(fallbackProductOptions);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/pipeline-builder/definitions")
      .then(res => res.ok ? res.json() : Promise.reject(new Error("pipeline definitions unavailable")))
      .then((data: { pipelines?: SavedPipelineGraph[] }) => {
        if (!alive || !Array.isArray(data.pipelines)) return;
        const normalized = data.pipelines
          .map(normalizeSavedPipeline)
          .filter((item): item is SavedPipelineGraph => Boolean(item));
        setSavedPipelines(prev => mergeSavedPipelines(normalized, prev));
        if (!initialGraph && normalized[0]) {
          setNodes(normalized[0].nodes);
          setConnections(normalized[0].connections);
          setSelectedNodeId(normalized[0].selectedNodeId);
          setActiveSavedId(normalized[0].id);
          setLastSavedAt(normalized[0].savedAt);
        }
      })
      .catch(() => {
        // Browser storage remains the offline fallback.
      });
    return () => {
      alive = false;
    };
  }, [initialGraph]);

  function restorePreviousGraph() {
    setHistory(prev => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      setNodes(snapshot.nodes);
      setConnections(snapshot.connections);
      setSelectedNodeId(snapshot.selectedNodeId);
      setActionMenu(null);
      setPendingConnection(null);
      setError(null);
      return prev.slice(0, -1);
    });
  }

  async function saveGraph() {
    const savedAt = new Date().toISOString();
    const id = activeSavedId ?? `pipeline-${Date.now()}`;
    const snapshot: SavedPipelineGraph = {
      id,
      name: inferPipelineName(nodes),
      nodes,
      connections,
      selectedNodeId,
      savedAt,
    };
    try {
      localStorage.setItem(pipelineBuilderStorageKey, JSON.stringify(snapshot));
      const nextSaved = upsertSavedPipeline(savedPipelines, snapshot);
      localStorage.setItem(pipelineBuilderHistoryStorageKey, JSON.stringify(nextSaved));
      setSavedPipelines(nextSaved);
      setActiveSavedId(id);
      setLastSavedAt(savedAt);
      setError(`Pipeline kaydedildi · ${formatSavedAt(savedAt)}`);
    } catch (err: any) {
      setError(`Pipeline kaydedilemedi: ${err?.message || "browser storage dolu olabilir"}`);
    }

    try {
      const res = await fetch("/api/pipeline-builder/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.pipeline) throw new Error(data.error || "backend kayıt başarısız");
      const backendSnapshot = normalizeSavedPipeline(data.pipeline);
      if (!backendSnapshot) throw new Error("backend kayıt formatı okunamadı");
      const nextSaved = upsertSavedPipeline(savedPipelines, backendSnapshot);
      localStorage.setItem(pipelineBuilderStorageKey, JSON.stringify(backendSnapshot));
      localStorage.setItem(pipelineBuilderHistoryStorageKey, JSON.stringify(nextSaved));
      setSavedPipelines(nextSaved);
      setActiveSavedId(backendSnapshot.id);
      setLastSavedAt(backendSnapshot.savedAt);
      setError(`Pipeline DB'ye kaydedildi · ${formatSavedAt(backendSnapshot.savedAt)}`);
    } catch (err: any) {
      setError(`Pipeline browser'a kaydedildi; DB kaydı başarısız: ${err?.message || "backend unavailable"}`);
    }
  }

  function loadSavedPipeline(pipeline: SavedPipelineGraph) {
    pushHistory();
    setNodes(pipeline.nodes);
    setConnections(pipeline.connections);
    setSelectedNodeId(pipeline.selectedNodeId);
    setActiveSavedId(pipeline.id);
    setLastSavedAt(pipeline.savedAt);
    setActionMenu(null);
    setPendingConnection(null);
    setSavedPanelOpen(false);
    setError(`${pipeline.name} açıldı · ${formatSavedAt(pipeline.savedAt)}`);
  }

  useEffect(() => {
    if (!dragState) return;
    const activeDrag = dragState;

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      const dx = event.clientX - activeDrag.startClientX;
      const dy = event.clientY - activeDrag.startClientY;
      const moved = Math.abs(dx) + Math.abs(dy) > 3;

      if (moved && !activeDrag.historyPushed) {
        setHistory(prev => [...prev.slice(-39), {
          nodes: activeDrag.initialNodes,
          connections: activeDrag.initialConnections,
          selectedNodeId: activeDrag.initialSelectedNodeId,
        }]);
        setDragState(prev => prev ? { ...prev, historyPushed: true } : prev);
      }

      if (!moved && !activeDrag.historyPushed) return;
      setNodes(prev => prev.map(node => {
        if (node.id !== activeDrag.nodeId) return node;
        return {
          ...node,
          x: Math.max(20, Math.round(activeDrag.originX + dx)),
          y: Math.max(40, Math.round(activeDrag.originY + dy)),
        };
      }));
      setActionMenu(null);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      setDragState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragState]);

  function deleteSelectedNode() {
    const selected = nodes.find(node => node.id === selectedNodeId);
    if (!selected) return;
    pushHistory();
    const nextConnections = connections.filter(connection => connection.from !== selected.id && connection.to !== selected.id);
    const nextNodes = nodes.filter(node => node.id !== selected.id);
    setConnections(nextConnections);
    setNodes(recalculateGraph(nextNodes, nextConnections));
    setSelectedNodeId(nextNodes[0]?.id ?? initialDatasetId);
    setActionMenu(null);
    setPendingConnection(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = tagName === "input" || tagName === "textarea" || target?.isContentEditable;
      if (isEditable) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        restorePreviousGraph();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedNode();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nodes, connections, selectedNodeId, history]);

  async function handleNodeFile(nodeId: string, file: File) {
    try {
      setError(null);
      setImportPlan(null);
      const [dataset] = await parseWorkbookFile(file);
      pushHistory();
      setNodes(prev => recalculateGraph(prev.map(node => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          title: node.semanticRole ? semanticRoleLabel(node.semanticRole) : dataset.sheetName === "CSV" || dataset.sheetName === "JSON" ? cleanTitle(file.name) : dataset.sheetName,
          subtitle: node.semanticRole
            ? `${dataset.rows.length} rows · ${semanticRoleLabel(node.semanticRole).toLocaleLowerCase("tr-TR")} entity`
            : `${dataset.rows.length} rows, ${dataset.columns.length} columns`,
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
    const anchor = selectedNode ?? nodes.at(-1);
    const preferredX = anchor ? anchor.x + nodeWidth(anchor.kind) + 86 : 80;
    const preferredY = anchor ? anchor.y + 28 : 120 + index * 112;
    const position = findFreePosition(nodes, "dataset", preferredX, preferredY);
    pushHistory();
    setNodes(prev => [...prev, {
      id,
      kind: "dataset",
      title: `Dataset ${index}`,
      subtitle: "XLS, CSV veya JSON yükle",
      x: position.x,
      y: position.y,
      rows: [],
      columns: [],
    }]);
    setSelectedNodeId(id);
    setActionMenu(null);
    setPendingConnection(null);
  }

  function deliverOutput() {
    if (!outputNode || outputNode.rows.length === 0) {
      setError("Deliver için önce Output node oluştur ve içinde data olduğundan emin ol.");
      return;
    }
    const plan = buildImportPlan(outputNode);
    setImportPlan(plan);
    setSelectedNodeId(outputNode.id);
    setError(plan.errors.length > 0 ? `Import plan ${plan.errors.length} kritik hata ile üretildi.` : `Import plan hazır: ${plan.actions.length} aksiyon.`);
  }

  function openPortMenu(nodeId: string, side: PortSide) {
    const node = nodes.find(item => item.id === nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);

    if (pendingConnection && nodeId !== pendingConnection.sourceId && node.kind !== "output") {
      if (pendingConnection.kind === "union") {
        completeUnion(pendingConnection.sourceId, nodeId);
      } else {
        completeSmartConnection(pendingConnection.sourceId, nodeId);
      }
      return;
    }

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

  function selectGraphNode(nodeId: string) {
    const node = nodes.find(item => item.id === nodeId);
    if (pendingConnection && nodeId !== pendingConnection.sourceId && node && node.kind !== "output") {
      if (pendingConnection.kind === "union") {
        completeUnion(pendingConnection.sourceId, nodeId);
      } else {
        completeSmartConnection(pendingConnection.sourceId, nodeId);
      }
      return;
    }

    setSelectedNodeId(nodeId);
    setActionMenu(null);
  }

  function startNodeDrag(nodeId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (isInteractiveDragTarget(event.target)) return;
    if (event.button !== 0) return;
    const node = nodes.find(item => item.id === nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    setActionMenu(null);
    setDragState({
      nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: node.x,
      originY: node.y,
      initialNodes: nodes,
      initialConnections: connections,
      initialSelectedNodeId: selectedNodeId,
      historyPushed: false,
    });
  }

  function createTransform(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    const transformIndex = nodes.filter(node => node.kind === "transform").length + 1;
    const cleaned = transformRows(source.rows, source.sourceFile ?? source.title);
    const transformId = `transform-${Date.now()}`;
    const position = findFreePosition(nodes, "transform", nextNodeX(source, "transform"), alignNodeY(source, "transform"));

    const transformNode: PipelineNode = {
      id: transformId,
      kind: "transform",
      title: `${source.title} - Clean`,
      subtitle: describeTransform(cleaned),
      x: position.x,
      y: position.y,
      rows: cleaned.rows,
      columns: cleaned.columns,
      sourceFile: source.sourceFile,
      functionKind: source.functionKind,
      semanticRole: source.semanticRole,
      semanticLabel: source.semanticLabel,
      backendKey: source.backendKey,
    };

    pushHistory();
    setNodes(prev => prev.concat(transformNode));

    setConnections(prev => {
      const next = [
        ...prev,
        { from: fromId, to: transformId, kind: "transform" as const },
      ];
      return dedupeConnections(next);
    });

    setSelectedNodeId(transformId);
    setActionMenu(null);
    setPendingConnection(null);
    setError(cleaned.rows.length === 0 ? "Transform node'u hazır. Data kutusuna dosya yüklenince clean data buraya akacak." : null);
    void transformIndex;
  }

  function createUnion(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    setSelectedNodeId(fromId);
    setActionMenu(null);
    setPendingConnection({ kind: "union", sourceId: fromId });
    setError("Union için ikinci node'u seç.");
  }

  function createSmartConnection(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;
    setSelectedNodeId(fromId);
    setActionMenu(null);
    setPendingConnection({ kind: "smart", sourceId: fromId });
    setError("Connect için hedef node'u seç. Müşteri → Sipariş veya Sipariş → Cihaz zinciri semantic olarak bağlanır.");
  }

  function completeSmartConnection(fromId: string, toId: string) {
    const source = nodes.find(node => node.id === fromId);
    const target = nodes.find(node => node.id === toId);
    if (!source || !target || source.kind === "output" || target.kind === "output") return;
    const connection = buildSmartConnection(source, target);
    pushHistory();
    setConnections(prev => dedupeConnections([
      ...prev,
      connection,
    ]));
    setNodes(prev => prev.map(node => applySmartNodeContext(source, target, node)));
    setSelectedNodeId(toId);
    setActionMenu(null);
    setPendingConnection(null);
    setError(describeSmartConnection(source, target));
    validateSemanticConnection(connection, source, target);
  }

  async function validateSemanticConnection(connection: GraphConnection, source: PipelineNode, target: PipelineNode) {
    if (!connection.contract) return;
    try {
      const res = await fetch("/api/pipeline-builder/semantic/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection, source, target }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "semantic validation failed");
      setConnections(prev => prev.map(item => {
        if (connectionKey(item) !== connectionKey(connection)) return item;
        return {
          ...item,
          contract: {
            ...item.contract!,
            status: "validated",
            backendValidatedAt: payload.validatedAt,
            context: payload.context ?? item.contract!.context,
            internal: payload.internal ?? item.contract!.internal,
            message: payload.message,
          },
        };
      }));
      setError(payload.message || describeSmartConnection(source, target));
    } catch (err: any) {
      setConnections(prev => prev.map(item => {
        if (connectionKey(item) !== connectionKey(connection) || !item.contract) return item;
        return {
          ...item,
          contract: {
            ...item.contract,
            status: "invalid",
            message: err?.message || "Backend semantic validation failed",
          },
        };
      }));
      setError(`Semantic bağlantı local kaldı: ${err?.message || "backend doğrulaması başarısız"}`);
    }
  }

  function completeUnion(firstId: string, secondId: string) {
    const first = nodes.find(node => node.id === firstId);
    const second = nodes.find(node => node.id === secondId);
    if (!first || !second || first.kind === "output" || second.kind === "output") return;
    const id = `union-${Date.now()}`;
    const position = findFreePosition(
      nodes,
      "union",
      Math.max(first.x + nodeWidth(first.kind), second.x + nodeWidth(second.kind)) + 72,
      centerNodeYBetween(first, second, "union"),
    );
    const columns = Array.from(new Set([...first.columns, ...second.columns]));
    const rows = [first, second].flatMap(input => input.rows.map(row => Object.fromEntries(columns.map(col => [col, row[col] ?? ""]))));
    const unionNode: PipelineNode = {
      id,
      kind: "union",
      title: "Union",
      subtitle: rows.length > 0 ? `${rows.length} rows` : "Data bekleniyor",
      x: position.x,
      y: position.y,
      rows,
      columns,
    };
    pushHistory();
    setNodes(prev => prev.concat(unionNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      { from: firstId, to: id, kind: "union" },
      { from: secondId, to: id, kind: "union" },
    ]));
    setSelectedNodeId(id);
    setActionMenu(null);
    setPendingConnection(null);
    setError("Union oluşturuldu.");
  }

  function createOutputFrom(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source) return;

    const id = `output-${Date.now()}`;
    const position = findFreePosition(nodes, "output", nextNodeX(source, "output"), alignNodeY(source, "output"));
    const outputNode: PipelineNode = {
      id,
      kind: "output",
      title: `${source.title} data`,
      subtitle: `${source.rows.length} rows`,
      x: position.x,
      y: position.y,
      rows: source.rows,
      columns: source.columns,
      sourceFile: source.sourceFile,
      functionKind: source.functionKind,
      semanticRole: source.semanticRole,
      semanticLabel: source.semanticLabel,
      backendKey: source.backendKey,
    };

    pushHistory();
    setNodes(prev => prev.concat(outputNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      { from: fromId, to: id, kind: "output" },
    ]));
    setSelectedNodeId(id);
    setActionMenu(null);
    setPendingConnection(null);
    setError(null);
  }

  function editNodeData(nodeId: string) {
    setSelectedNodeId(nodeId);
    setActionMenu(null);
    setError("Edit modu: alttaki Data preview üzerinden dosya yükleyip datayı yenileyebilirsin.");
  }

  function updateNodeFunction(nodeId: string, functionKind: NodeFunctionKind) {
    const current = nodes.find(node => node.id === nodeId);
    const nextDeviceSku = functionKind === "device"
      ? current?.deviceSku || productOptions[0]?.sku || productOptions[0]?.name || ""
      : current?.deviceSku;
    pushHistory();
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      const semanticRole = nodeFunctionToSemanticRole(functionKind);
      const label = semanticRoleLabel(semanticRole);
      const deviceLabel = semanticRole === "device" && nextDeviceSku ? nextDeviceSku : label;
      return {
        ...node,
        title: deviceLabel,
        subtitle: semanticRole === "device" && nextDeviceSku
          ? `${nextDeviceSku} cihaz entity · DB bağlanıyor`
          : node.rows.length > 0 ? `${node.rows.length} rows · ${label.toLocaleLowerCase("tr-TR")} entity` : `${label} entity node`,
        functionKind,
        semanticRole,
        semanticLabel: deviceLabel,
        backendKey: semanticRole,
        orderFields: semanticRole === "order" ? node.orderFields ?? emptyOrderFields() : node.orderFields,
        deviceSku: semanticRole === "device" ? nextDeviceSku : node.deviceSku,
        deviceQuantity: semanticRole === "device" ? node.deviceQuantity ?? "" : node.deviceQuantity,
      };
    }));
    setSelectedNodeId(nodeId);
    setActionMenu(null);
    const label = semanticRoleLabel(nodeFunctionToSemanticRole(functionKind));
    setError(`${label} fonksiyonu seçildi. Bu kutu artık pipeline içinde ${label.toLocaleLowerCase("tr-TR")} entity olarak davranır.`);
    if (functionKind === "device" && nextDeviceSku) {
      void loadDeviceBomFromDatabase(nodeId, nextDeviceSku, { pushSnapshot: false });
    }
  }

  function updateNodeTitle(nodeId: string, title: string) {
    const cleaned = title.trim();
    if (!cleaned) return;
    const current = nodes.find(node => node.id === nodeId);
    if (!current || current.title === cleaned) return;
    pushHistory();
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        title: cleaned,
        semanticLabel: node.semanticRole ? cleaned : node.semanticLabel,
      };
    }));
  }

  function updateOrderField(nodeId: string, field: keyof OrderFields, value: string) {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        orderFields: {
          ...emptyOrderFields(),
          ...node.orderFields,
          [field]: value,
        },
      };
    }));
  }

  function updateDeviceSelection(nodeId: string, value: string) {
    const label = value || "Cihaz";
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        title: label,
        subtitle: value ? `${value} cihaz entity` : "Cihaz entity node",
        semanticLabel: label,
        deviceSku: value,
        dbLinkedSku: undefined,
      };
    }));
    if (value) void loadDeviceBomFromDatabase(nodeId, value, { pushSnapshot: true });
  }

  function updateDeviceQuantity(nodeId: string, value: string) {
    setNodes(prev => prev.map(node => node.id === nodeId ? { ...node, deviceQuantity: value } : node));
  }

  async function drillDownDeviceNode(nodeId: string) {
    const source = nodes.find(node => node.id === nodeId);
    const sku = source?.deviceSku || (source?.semanticLabel !== "Cihaz" ? source?.semanticLabel : "") || source?.title || "";
    const cleanSku = sku.trim();
    if (!source || source.semanticRole !== "device" || !cleanSku || cleanSku === "Cihaz") {
      setError("Drill-down için önce cihaz SKU seç.");
      return;
    }

    await loadDeviceBomFromDatabase(nodeId, cleanSku, { pushSnapshot: true });
  }

  async function loadDeviceBomFromDatabase(nodeId: string, sku: string, opts: { pushSnapshot: boolean }) {
    const cleanSku = sku.trim();
    const source = nodes.find(node => node.id === nodeId);
    if (!source || !cleanSku) return;

    try {
      setError(`${cleanSku} DB semantic layer bağlanıyor...`);
      const res = await fetch(`/api/bom/${encodeURIComponent(cleanSku)}/stock`);
      const data: BomStockResponse | { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray((data as BomStockResponse).components)) {
        throw new Error((data as { error?: string }).error || "BOM okunamadı");
      }

      const components = (data as BomStockResponse).components;
      const generated = buildBomDrilldownNodes({ ...source, deviceSku: cleanSku, semanticLabel: cleanSku, title: cleanSku }, cleanSku, components);
      if (generated.nodes.length === 0) {
        setError(`${cleanSku} için gösterilecek BOM bulunamadı.`);
        return;
      }

      if (opts.pushSnapshot) pushHistory();
      setNodes(prev => {
        const staleIds = collectDrilldownDescendantIds(prev, nodeId);
        const base = prev.filter(node => !staleIds.has(node.id));
        return base.map(node => node.id === nodeId ? {
          ...node,
          title: cleanSku,
          subtitle: `${cleanSku} cihaz entity · DB bağlı · ${generated.nodes.length} direkt BOM`,
          semanticLabel: cleanSku,
          deviceSku: cleanSku,
          dbLinkedSku: cleanSku,
        } : node).concat(generated.nodes);
      });
      setConnections(prev => {
        const staleIds = collectDrilldownDescendantIds(nodes, nodeId);
        const base = prev.filter(connection => !staleIds.has(connection.from) && !staleIds.has(connection.to));
        return dedupeConnections(base.concat(generated.connections));
      });
      setSelectedNodeId(nodeId);
      setActionMenu(null);
      setPendingConnection(null);
      setError(`${cleanSku}: DB'den ${generated.nodes.length} direkt BOM node'u açıldı.`);
    } catch (err: any) {
      setError(`DB bağlantısı başarısız: ${err?.message || "BOM endpoint unavailable"}`);
    }
  }

  function drillDownComponentNode(nodeId: string) {
    const source = nodes.find(node => node.id === nodeId);
    const children = source?.bomChildren ?? [];
    if (!source || source.kind !== "component" || children.length === 0) {
      setSelectedNodeId(nodeId);
      setActionMenu(null);
      return;
    }

    const generated = buildBomChildDrilldownNodes(source, children);
    pushHistory();
    setNodes(prev => {
      const staleIds = collectDrilldownDescendantIds(prev, nodeId);
      const base = prev.filter(node => !staleIds.has(node.id));
      return base.concat(generated.nodes);
    });
    setConnections(prev => {
      const staleIds = collectDrilldownDescendantIds(nodes, nodeId);
      const base = prev.filter(connection => !staleIds.has(connection.from) && !staleIds.has(connection.to));
      return dedupeConnections(base.concat(generated.connections));
    });
    setSelectedNodeId(generated.nodes[0]?.id ?? nodeId);
    setActionMenu(null);
    setPendingConnection(null);
    setError(`${source.title}: ${generated.nodes.length} alt BOM node'u açıldı.`);
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
          <button
            type="button"
            aria-label="Undo"
            title="Undo"
            onClick={restorePreviousGraph}
            disabled={!canUndo}
            style={iconToolbarButtonStyle(!canUndo)}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={deleteSelectedNode}
            disabled={!canDelete}
            style={iconToolbarButtonStyle(!canDelete)}
          >
            <Trash2 size={15} />
          </button>
          {lastSavedAt && (
            <span style={saveStatusStyle}>Saved {formatSavedAt(lastSavedAt)}</span>
          )}
          <button type="button" onClick={saveGraph} style={toolbarButtonStyle}>
            <Save size={14} /> Save
          </button>
          <button
            type="button"
            aria-label="Saved pipelines"
            title="Saved pipelines"
            onClick={() => setSavedPanelOpen(prev => !prev)}
            style={iconToolbarButtonStyle(false)}
          >
            <Database size={15} />
          </button>
        </div>
      </header>

      <main style={{ display: "grid", gridTemplateRows: "1fr 310px", height: "calc(100vh - 94px)", minHeight: 680 }}>
        <section style={canvasViewportStyle}>
          <div style={{ position: "relative", width: canvasSize.width, height: canvasSize.height }}>
            <svg width={canvasSize.width} height={canvasSize.height} style={{ position: "absolute", inset: 0 }}>
              {renderedEdges.map(edge => (
                <EdgeLine key={edge.key} kind={edge.kind} scope={edge.scope} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
              ))}
            </svg>

            {nodes.map(node => (
              <PipelineGraphNode
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                onSelect={() => selectGraphNode(node.id)}
                onPortClick={(side) => openPortMenu(node.id, side)}
                onFile={(file) => handleNodeFile(node.id, file)}
                onFunctionSelect={(functionKind) => updateNodeFunction(node.id, functionKind)}
                onTitleChange={(title) => updateNodeTitle(node.id, title)}
                onDragStart={(event) => startNodeDrag(node.id, event)}
                onOrderFieldChange={(field, value) => updateOrderField(node.id, field, value)}
                onDeviceSelect={(value) => updateDeviceSelection(node.id, value)}
                onDeviceQuantityChange={(value) => updateDeviceQuantity(node.id, value)}
                onDrillDown={() => drillDownDeviceNode(node.id)}
                onComponentDrillDown={() => drillDownComponentNode(node.id)}
                productOptions={productOptions}
              />
            ))}

            {actionMenu && (
              <NodeActionMenu
                state={actionMenu}
                onTransform={() => createTransform(actionMenu.nodeId)}
                onUnion={() => createUnion(actionMenu.nodeId)}
                onConnect={() => createSmartConnection(actionMenu.nodeId)}
                onOutput={() => createOutputFrom(actionMenu.nodeId)}
                onNewDataset={() => {
                  addDataset();
                  setActionMenu(null);
                }}
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
              {selectedNode?.bomComponent && (
                <ComponentStockPanel meta={selectedNode.bomComponent} childCount={selectedNode.bomChildren?.length ?? 0} />
              )}
              {importPlan && (
                <ImportPlanPanel plan={importPlan} />
              )}
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
        <Metric label="Import actions" value={importPlan?.actions.length ?? 0} />
      </aside>

      {savedPanelOpen && (
        <SavedPipelinesPanel
          pipelines={savedPipelines}
          activeId={activeSavedId}
          onLoad={loadSavedPipeline}
        />
      )}
    </div>
  );
}

function PipelineGraphNode({ node, selected, onSelect, onPortClick, onFile, onFunctionSelect, onTitleChange, onDragStart, onOrderFieldChange, onDeviceSelect, onDeviceQuantityChange, onDrillDown, onComponentDrillDown, productOptions }: {
  node: PipelineNode;
  selected: boolean;
  onSelect: () => void;
  onPortClick: (side: PortSide) => void;
  onFile: (file: File) => void;
  onFunctionSelect: (functionKind: NodeFunctionKind) => void;
  onTitleChange: (title: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOrderFieldChange: (field: keyof OrderFields, value: string) => void;
  onDeviceSelect: (value: string) => void;
  onDeviceQuantityChange: (value: string) => void;
  onDrillDown: () => void;
  onComponentDrillDown: () => void;
  productOptions: ProductOption[];
}) {
  const uploadInputId = `pipeline-node-upload-${node.id}`;
  const isDataset = node.kind === "dataset";
  const isComponent = node.kind === "component";
  const isSubAssembly = Boolean(node.bomComponent?.isSubAssembly);
  const [draftTitle, setDraftTitle] = useState(node.title);

  useEffect(() => {
    setDraftTitle(node.title);
  }, [node.title]);

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onDragStart}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      style={{
        ...nodeStyle,
        left: node.x,
        top: node.y,
        width: nodeWidth(node.kind),
        height: effectiveNodeHeight(node),
        borderColor: selected ? nodeTone(node.kind) : isSubAssembly ? "#416f6b" : CT.borderStrong,
        borderLeft: isSubAssembly ? "5px solid #416f6b" : nodeStyle.border,
        background: isSubAssembly ? "#f3fbf8" : nodeStyle.background,
        boxShadow: selected ? "0 0 0 3px rgba(73,92,114,0.16), 0 5px 16px rgba(20,20,19,0.12)" : nodeStyle.boxShadow,
      }}
    >
      {!isComponent && <GraphPort side="left" onClick={() => onPortClick("left")} />}
      <div style={nodeTitleStyle}>
        {nodeIcon(node.kind, 18)}
        {isSubAssembly && <span style={subAssemblyBadgeStyle}>YM</span>}
        {isComponent ? (
          <div style={componentCodeTitleStyle}>{node.title}</div>
        ) : (
          <input
            aria-label="Node name"
            value={draftTitle}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraftTitle(event.currentTarget.value)}
            onBlur={() => onTitleChange(draftTitle)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setDraftTitle(node.title);
                event.currentTarget.blur();
              }
            }}
            style={nodeTitleInputStyle}
          />
        )}
      </div>
      {isDataset && (
        <div data-no-drag="true" style={nodeFunctionBarStyle} onClick={(event) => event.stopPropagation()}>
          <span style={nodeFunctionPrefixStyle}>f(x)</span>
          <select
            aria-label="Node function"
            value={node.functionKind ?? ""}
            onChange={(event) => {
              const next = event.currentTarget.value as NodeFunctionKind;
              if (next) onFunctionSelect(next);
            }}
            style={nodeFunctionSelectStyle}
          >
            <option value="">Fonksiyon seç</option>
            <option value="customer">Müşteri</option>
            <option value="order">Sipariş</option>
            <option value="device">Cihaz</option>
          </select>
        </div>
      )}
      {!isComponent && <div style={nodeMetaStyle}>{node.subtitle}</div>}
      {node.semanticRole === "order" && (
        <OrderFieldsEditor
          fields={node.orderFields ?? emptyOrderFields()}
          onChange={onOrderFieldChange}
        />
      )}
      {node.semanticRole === "device" && (
        <DeviceSelector
          value={node.deviceSku ?? (node.semanticLabel !== "Cihaz" ? node.semanticLabel ?? "" : "")}
          onChange={onDeviceSelect}
          quantity={node.deviceQuantity ?? ""}
          onQuantityChange={onDeviceQuantityChange}
          onDrillDown={onDrillDown}
          productOptions={productOptions}
        />
      )}
      {!isComponent && node.columns.length > 0 && <div style={nodeCountStyle}>{node.columns.length} columns</div>}
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
      {node.kind !== "output" && !isComponent && <GraphPort side="right" onClick={() => onPortClick("right")} />}
    </div>
  );
}

function NodeActionMenu({ state, onTransform, onUnion, onConnect, onOutput, onNewDataset, onEdit }: {
  state: NonNullable<ActionMenuState>;
  onTransform: () => void;
  onUnion: () => void;
  onConnect: () => void;
  onOutput: () => void;
  onNewDataset: () => void;
  onEdit: () => void;
}) {
  return (
    <div style={{ ...actionMenuStyle, left: state.x, top: state.y }}>
      <ActionItem icon={<GitBranch size={18} />} label="Connect" tone={CT.accent} onClick={onConnect} />
      <div style={actionDividerStyle} />
      <ActionItem icon={<Sparkles size={18} />} label="Transform" tone={CT.info} onClick={onTransform} />
      <ActionItem icon={<Box size={18} />} label="Union" tone="#d92f7d" onClick={onUnion} />
      <ActionItem icon={<Database size={18} />} label="Output" tone={CT.ok} onClick={onOutput} />
      <div style={actionDividerStyle} />
      <ActionItem icon={<ArrowDownToLine size={18} />} label="New dataset" tone="#cc8a00" onClick={onNewDataset} />
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

function OrderFieldsEditor({ fields, onChange }: {
  fields: OrderFields;
  onChange: (field: keyof OrderFields, value: string) => void;
}) {
  return (
    <div data-no-drag="true" style={orderFieldsGridStyle}>
      <OrderField label="Müşteri" value={fields.customer} onChange={(value) => onChange("customer", value)} />
      <OrderField label="Teslim" value={fields.deadline} type="date" onChange={(value) => onChange("deadline", value)} />
    </div>
  );
}

function OrderDeviceField({ value, products, onChange }: {
  value: string;
  products: ProductOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={orderFieldStyle}>
      <span style={orderFieldLabelStyle}>Cihaz tipi</span>
      <select
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={orderFieldSelectStyle}
      >
        <option value="">Cihaz seç</option>
        {products.map(product => {
          const valueKey = product.sku || product.name;
          return (
            <option key={`${valueKey}-${product.id ?? product.name}`} value={valueKey}>
              {product.sku ? `${product.sku} · ${product.name}` : product.name}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function DeviceSelector({ value, quantity, onChange, onQuantityChange, onDrillDown, productOptions }: {
  value: string;
  quantity: string;
  onChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onDrillDown: () => void;
  productOptions: ProductOption[];
}) {
  return (
    <div data-no-drag="true" style={deviceEditorStyle}>
      <div style={deviceFieldsGridStyle}>
        <label style={orderFieldStyle}>
          <span style={orderFieldLabelStyle}>Cihaz</span>
          <select
            value={value}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onChange(event.currentTarget.value)}
            style={orderFieldSelectStyle}
          >
            <option value="">Cihaz seç</option>
            {productOptions.map(product => {
              const valueKey = product.sku || product.name;
              return (
                <option key={`${valueKey}-${product.id ?? product.name}`} value={valueKey}>
                  {product.sku ? `${product.sku} · ${product.name}` : product.name}
                </option>
              );
            })}
          </select>
        </label>
        <OrderField label="Adet" value={quantity} inputMode="numeric" onChange={onQuantityChange} />
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDrillDown();
        }}
        disabled={!value}
        style={drilldownButtonStyle(!value)}
      >
        <ListTree size={13} />
        Drill-down
      </button>
    </div>
  );
}

function BomComponentMeta({ meta, childCount, onDrillDown }: {
  meta: BomComponentNodeMeta;
  childCount: number;
  onDrillDown: () => void;
}) {
  return (
    <div style={bomMetaStackStyle}>
      <div style={bomMetaGridStyle}>
        <span>Tier {meta.tier}</span>
        <span>{formatCell(meta.requiredPerUnit)} {meta.unit}</span>
        <span style={meta.isSubAssembly ? bomSubAssemblyTextStyle : undefined}>
          {meta.isSubAssembly ? "Yarı-mamül" : "Bileşen"}
        </span>
        <span style={bomStatusTextStyle(meta.status)}>{statusLabel(meta.status)}</span>
        <span>Stok {meta.currentStock === null ? "N/A" : formatCell(meta.currentStock)}</span>
        <span>{meta.maxProducts === null ? "Üretim N/A" : `Üretim ${formatCell(meta.maxProducts)}`}</span>
      </div>
      {childCount > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDrillDown();
          }}
          style={componentDrillButtonStyle}
        >
          <ListTree size={11} />
          Alt bileşenler ({childCount})
        </button>
      )}
    </div>
  );
}

function ComponentStockPanel({ meta, childCount }: { meta: BomComponentNodeMeta; childCount: number }) {
  return (
    <div style={componentStockPanelStyle}>
      <div style={componentStockPanelHeaderStyle}>
        <span>{meta.name}</span>
        <span style={bomStatusTextStyle(meta.status)}>{statusLabel(meta.status)}</span>
      </div>
      <Metric label="Kod" value={meta.code} />
      <Metric label="Tip" value={meta.isSubAssembly ? "Yarı-mamül" : "Bileşen"} />
      <Metric label="Stok" value={meta.currentStock === null ? "N/A" : `${formatCell(meta.currentStock)} ${meta.unit}`} />
      <Metric label="Birim ihtiyaç" value={meta.requiredPerUnit === null ? "N/A" : `${formatCell(meta.requiredPerUnit)} ${meta.unit}`} />
      <Metric label="Üretilebilir" value={meta.maxProducts === null ? "N/A" : formatCell(meta.maxProducts)} />
      {childCount > 0 && <Metric label="Alt bileşen" value={childCount} />}
    </div>
  );
}

function OrderField({ label, value, placeholder, inputMode, type = "text", onChange }: {
  label: string;
  value: string;
  placeholder?: string;
  inputMode?: "numeric";
  type?: "text" | "date";
  onChange: (value: string) => void;
}) {
  return (
    <label style={orderFieldStyle}>
      <span style={orderFieldLabelStyle}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={orderFieldInputStyle}
      />
    </label>
  );
}

function GraphPort({ side, onClick }: { side: PortSide; onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      data-no-drag="true"
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

function EdgeLine({ kind, scope, x1, y1, x2, y2 }: {
  kind?: ConnectionKind;
  scope?: DrilldownConnectionScope;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const mid = (x1 + x2) / 2;
  const isDrilldown = kind === "drilldown";
  const isSubassemblyEdge = scope === "subassembly_component";
  const stroke = isSubassemblyEdge ? "rgba(65,111,107,0.46)" : isDrilldown ? "rgba(88,124,122,0.16)" : "rgba(86,101,119,0.58)";
  const strokeWidth = isSubassemblyEdge ? 2 : isDrilldown ? 1.2 : 2;
  return (
    <g>
      <path d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
      {!isDrilldown && (
        <>
          <circle cx={x1} cy={y1} r="5" fill="#eef1f5" stroke="rgba(86,101,119,0.58)" strokeWidth="2" />
          <circle cx={x2} cy={y2} r="5" fill="#eef1f5" stroke="rgba(86,101,119,0.58)" strokeWidth="2" />
        </>
      )}
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
    return { ...normalizeRecipeDataset(rows, profile), kind: "recipe", profileLabel: profile.label, productSku: profile.productSku, productFamily: profile.productFamily };
  }
  if (profile.kind === "stock") {
    return { ...normalizeStockDataset(rows, profile), kind: "stock", profileLabel: profile.label, productSku: profile.productSku, productFamily: profile.productFamily };
  }
  if (profile.kind === "sales") {
    return { ...normalizeSalesDataset(generic.rows, generic.columns, profile), kind: "sales", profileLabel: profile.label, productSku: profile.productSku, productFamily: profile.productFamily };
  }

  return { ...generic, kind: profile.kind, profileLabel: profile.label, productSku: profile.productSku, productFamily: profile.productFamily };
}

function describeTransform(result: TransformResult) {
  const identity = result.productSku || result.productFamily || result.profileLabel || result.kind;
  return `${result.kind} · ${identity} · ${result.columns.length} columns`;
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

function inferDatasetProfile(rows: Array<Record<string, any>>, columns: string[], sourceName: string): DatasetProfile {
  const normalizedColumns = new Set(columns.map(normalizeCleanColumn));
  const normalizedName = normalizeCleanColumn(sourceName);
  const has = (name: string) => normalizedColumns.has(name);
  const firstCode = rows.map(row => row.stok_kodu ?? row.stock_code ?? row.code ?? row.kod).find(Boolean);
  const productSku = normalizeIdentifier(firstCode ?? inferSkuFromSourceName(sourceName));
  const productFamily = inferProductFamily(productSku || sourceName);

  if (has("stok_kodu") && has("stok_ismi") && has("stok_bakiyesi")) {
    return { kind: "stock", label: "component_stock", confidence: 0.96, productSku, productFamily };
  }
  if (has("stok_kodu") && has("stok_ismi") && has("miktar") && (has("sira_no") || has("stok_sevi"))) {
    return { kind: "recipe", label: "bom_recipe", confidence: 0.96, productSku, productFamily };
  }
  if (normalizedName.includes("stok") && rows.some(row => row.stok_bakiyesi !== undefined || row.current_stock !== undefined)) {
    return { kind: "stock", label: "component_stock", confidence: 0.75, productSku, productFamily };
  }
  if (normalizedName.includes("recete") || rows.some(row => row.miktar !== undefined && row.stok_kodu !== undefined)) {
    return { kind: "recipe", label: "bom_recipe", confidence: 0.72, productSku, productFamily };
  }
  if (looksLikeSalesMatrix(rows, columns) || columns.some(col => ["sales", "satis", "cikis", "cikis_adedi", "quantity_sold", "adet", "aylik_satis"].includes(normalizeCleanColumn(col)))) {
    return { kind: "sales", label: "sales_matrix", confidence: 0.82, productSku, productFamily };
  }
  return { kind: "generic", label: "generic_table", confidence: 0.35, productSku, productFamily };
}

function normalizeRecipeDataset(rows: Array<Record<string, any>>, profile: DatasetProfile) {
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
  const productSku = normalizeIdentifier(getRawStockCode(root ?? {}, codeCol)) || profile.productSku || "";
  const productName = trimText(getCell(root, nameCol));
  const productFamily = inferProductFamily(productSku || profile.productFamily || "");
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
      dataset_profile: profile.label,
      product_family: productFamily,
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
      source_confidence: profile.confidence,
    };
  }).filter((row): row is Record<string, any> => row !== null);

  return { rows: normalizedRows, columns: collectColumns(normalizedRows) };
}

function normalizeStockDataset(rows: Array<Record<string, any>>, profile: DatasetProfile) {
  const columnsByAlias = buildAliasMap(rows);
  const codeCol = pickAlias(columnsByAlias, ["stok_kodu", "stock_code", "code", "kod"]);
  const nameCol = pickAlias(columnsByAlias, ["stok_ismi", "stok_adi", "stock_name", "name", "isim"]);
  const balanceCol = pickAlias(columnsByAlias, ["stok_bakiyesi", "stok_bakiye", "current_stock", "stock", "bakiye"]);

  const root = rows.find(row => getCell(row, codeCol));
  const productSku = normalizeIdentifier(getRawStockCode(root ?? {}, codeCol)) || profile.productSku || "";
  const productName = trimText(getCell(root, nameCol));
  const productFamily = inferProductFamily(productSku || profile.productFamily || "");

  const normalizedRows = rows.map((row, index): Record<string, any> | null => {
    const rawCode = getRawStockCode(row, codeCol);
    const code = normalizeIdentifier(rawCode);
    if (!code) return null;
    const rowType = index === 0 || code === productSku ? "product" : "component";

    return {
      dataset_type: "stock",
      dataset_profile: profile.label,
      product_family: productFamily,
      row_type: rowType,
      product_sku: productSku || code,
      product_name: productName || trimText(getCell(row, nameCol)),
      component_code: rowType === "component" ? code : null,
      component_name: rowType === "component" ? trimText(getCell(row, nameCol)) : null,
      current_stock: toNumberOrNull(getCell(row, balanceCol)),
      tier: rowType === "product" ? 0 : inferTier(rawCode, null),
      source_confidence: profile.confidence,
    };
  }).filter((row): row is Record<string, any> => row !== null);

  return { rows: normalizedRows, columns: collectColumns(normalizedRows) };
}

function normalizeSalesDataset(rows: Array<Record<string, any>>, columns: string[], profile: DatasetProfile) {
  const monthColumn = columns.find(col => ["ay", "month", "donem", "period"].includes(normalizeCleanColumn(col))) ?? columns[0];
  const productColumns = columns.filter(col => col !== monthColumn && !String(col).startsWith("__"));
  const normalizedRows = rows.flatMap(row => {
    const monthValue = getCell(row, monthColumn);
    const month = toNumberOrNull(monthValue);
    if (month === null) return [];
    return productColumns.map(col => {
      const sku = normalizeIdentifier(col);
      return {
        dataset_type: "sales",
        dataset_profile: profile.label,
        product_family: inferProductFamily(sku),
        row_type: "monthly_sale",
        product_sku: sku,
        month,
        quantity_sold: toNumberOrNull(getCell(row, col)) ?? 0,
        source_confidence: profile.confidence,
      };
    });
  });
  return { rows: normalizedRows, columns: collectColumns(normalizedRows) };
}

function buildImportPlan(outputNode: PipelineNode): ImportPlan {
  const rows = outputNode.rows;
  const actions: ImportPlanAction[] = [];
  const rowKey = (row: Record<string, any>) => `${row.dataset_type ?? ""}:${row.row_type ?? ""}:${row.product_sku ?? ""}:${row.component_code ?? ""}:${row.month ?? ""}`;
  const consumed = new Set<string>();

  const recipeRows = rows.filter(row => row.dataset_type === "recipe" && row.row_type === "component" && row.component_code);
  const recipeGroups = groupRowsBy(recipeRows, row => normalizeIdentifier(row.product_sku) || "UNKNOWN");
  recipeGroups.forEach((groupRows, sku) => {
    groupRows.forEach(row => consumed.add(rowKey(row)));
    const warnings = [
      groupRows.some(row => toNumberOrNull(row.quantity) === null) ? "Bazı reçete satırlarında miktar eksik." : "",
      groupRows.some(row => !trimText(row.unit)) ? "Bazı reçete satırlarında birim eksik." : "",
    ].filter(Boolean);
    const errors = sku === "UNKNOWN" ? ["Ürün SKU okunamadı, BOM yazımı kilitlendi."] : [];
    actions.push({
      id: `bom-${sku}`,
      label: `BOM reçete: ${sku}`,
      targetTable: "bom_items",
      mode: "replace",
      endpoint: "/api/import/bulk/bom",
      scope: sku,
      rowCount: groupRows.length,
      confidence: averageConfidence(groupRows),
      warnings,
      errors,
      sample: groupRows.slice(0, 3).map(row => ({
        code: row.component_code,
        name: row.component_name,
        qty: row.quantity,
        unit: row.unit,
        tier: row.tier,
        parentCode: row.parent_component_code,
      })),
    });
  });

  const stockRows = rows.filter(row => {
    if (!row.component_code) return false;
    if (row.dataset_type === "stock" && toNumberOrNull(row.current_stock) !== null) return true;
    if (row.dataset_type === "recipe" && toNumberOrNull(row.stock_level) !== null) return true;
    return false;
  });
  const uniqueStockRows = uniqueRowsBy(stockRows, row => normalizeIdentifier(row.component_code));
  uniqueStockRows.forEach(row => consumed.add(rowKey(row)));
  if (uniqueStockRows.length > 0) {
    actions.push({
      id: "component-stock",
      label: "Bileşen stok havuzu",
      targetTable: "component_stock",
      mode: "upsert",
      endpoint: "/api/import/bulk/stock",
      rowCount: uniqueStockRows.length,
      confidence: averageConfidence(uniqueStockRows),
      warnings: uniqueStockRows.some(row => !trimText(row.unit)) ? ["Birim gelmeyen stok satırları AD varsayımı isteyebilir."] : [],
      errors: [],
      sample: uniqueStockRows.slice(0, 3).map(row => ({
        code: row.component_code,
        name: row.component_name,
        stock: toNumberOrNull(row.current_stock) ?? toNumberOrNull(row.stock_level),
        unit: row.unit ?? "AD",
      })),
    });
  }

  const salesRows = rows.filter(row => (
    row.dataset_type === "sales"
    && row.product_sku
    && toNumberOrNull(row.month) !== null
    && toNumberOrNull(row.quantity_sold) !== null
  ));
  const salesGroups = groupRowsBy(salesRows, row => normalizeIdentifier(row.product_sku) || "UNKNOWN");
  salesGroups.forEach((groupRows, sku) => {
    groupRows.forEach(row => consumed.add(rowKey(row)));
    actions.push({
      id: `sales-${sku}`,
      label: `Satış geçmişi: ${sku}`,
      targetTable: "sales_history",
      mode: "upsert",
      endpoint: "/api/import/bulk/sales",
      scope: sku,
      rowCount: groupRows.length,
      confidence: averageConfidence(groupRows),
      warnings: groupRows.some(row => !row.year) ? ["Yıl kolonu yoksa import anındaki yıl varsayılır."] : [],
      errors: sku === "UNKNOWN" ? ["Satış datasında SKU okunamadı."] : [],
      sample: groupRows.slice(0, 3).map(row => ({
        sku,
        year: row.year ?? new Date().getFullYear(),
        month: row.month,
        qty: row.quantity_sold,
      })),
    });
  });

  const unknownRows = rows.filter(row => !consumed.has(rowKey(row)));
  if (unknownRows.length > 0) {
    actions.push({
      id: "manual-review",
      label: "Manuel eşleme gerekir",
      targetTable: "manual_review",
      mode: "review",
      rowCount: unknownRows.length,
      confidence: Math.min(averageConfidence(unknownRows), 0.4),
      warnings: ["Bu satırlar otomatik olarak BOM/stok/satış şemasına bağlanamadı."],
      errors: [],
      sample: unknownRows.slice(0, 3),
    });
  }

  const errors = actions.flatMap(action => action.errors);
  const warnings = actions.flatMap(action => action.warnings);
  return {
    id: `import-plan-${Date.now()}`,
    sourceNodeTitle: outputNode.title,
    totalRows: rows.length,
    actions,
    warnings,
    errors,
    createdAt: new Date().toISOString(),
  };
}

function groupRowsBy(rows: Array<Record<string, any>>, keyFor: (row: Record<string, any>) => string) {
  return rows.reduce<Map<string, Array<Record<string, any>>>>((groups, row) => {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
    return groups;
  }, new Map());
}

function uniqueRowsBy(rows: Array<Record<string, any>>, keyFor: (row: Record<string, any>) => string) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = keyFor(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function averageConfidence(rows: Array<Record<string, any>>) {
  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, row) => sum + (toNumberOrNull(row.source_confidence) ?? 0.5), 0);
  return Math.max(0, Math.min(1, total / rows.length));
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

function looksLikeSalesMatrix(rows: Array<Record<string, any>>, columns: string[]) {
  if (columns.length < 2 || rows.length < 2) return false;
  const firstColumn = normalizeCleanColumn(columns[0]);
  const hasMonthColumn = ["ay", "month", "donem", "period", "empty"].includes(firstColumn) || columns[0].startsWith("__");
  const firstRow = rows[0] ?? {};
  const firstRowLooksLikeHeader = Object.values(firstRow).some(value => normalizeCleanColumn(String(value)).includes("cikis"));
  const laterRowsHaveMonthNumbers = rows.slice(1, 6).filter(row => toNumberOrNull(getCell(row, columns[0])) !== null).length >= 2;
  return hasMonthColumn && firstRowLooksLikeHeader && laterRowsHaveMonthNumbers;
}

function inferSkuFromSourceName(sourceName: string) {
  const decoded = sourceName.normalize("NFC");
  const match = decoded.match(/[A-ZÇĞİÖŞÜ]{2,}\.?[A-ZÇĞİÖŞÜ0-9.-]*\d[A-ZÇĞİÖŞÜ0-9.-]*/i);
  return match?.[0] ?? "";
}

function inferProductFamily(value: string) {
  const normalized = normalizeIdentifier(value).toLocaleUpperCase("tr-TR");
  if (normalized.startsWith("BH.")) return "BH";
  if (normalized.startsWith("ELT.")) return "ELT";
  if (normalized.startsWith("GSA")) return "GSA";
  if (normalized.startsWith("GSS")) return "GSS";
  const prefix = normalized.match(/^[A-ZÇĞİÖŞÜ]+/)?.[0];
  return prefix || "UNKNOWN";
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
  const raw = String(value).trim().replace(/\s/g, "");
  const numeric = raw.replace(/[^\d,.-]/g, "");
  if (!numeric || numeric === "-" || numeric === "." || numeric === ",") return null;
  const withoutTrailingDot = numeric.endsWith(".") && !numeric.includes(",") ? numeric.slice(0, -1) : numeric;
  let normalized = withoutTrailingDot;
  if (withoutTrailingDot.includes(",") && withoutTrailingDot.includes(".")) {
    const lastComma = withoutTrailingDot.lastIndexOf(",");
    const lastDot = withoutTrailingDot.lastIndexOf(".");
    normalized = lastComma > lastDot
      ? withoutTrailingDot.replace(/\./g, "").replace(",", ".")
      : withoutTrailingDot.replace(/,/g, "");
  } else if (withoutTrailingDot.includes(",")) {
    const parts = withoutTrailingDot.split(",");
    normalized = parts[1]?.length === 3 ? parts.join("") : withoutTrailingDot.replace(",", ".");
  } else if (withoutTrailingDot.includes(".")) {
    const parts = withoutTrailingDot.split(".");
    normalized = parts.length > 2 || parts[1]?.length === 3 ? parts.join("") : withoutTrailingDot;
  }
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
          subtitle: source.rows.length > 0 ? describeTransform(cleaned) : "Data bekleniyor",
          rows: cleaned.rows,
          columns: cleaned.columns,
          sourceFile: source.sourceFile,
          functionKind: source.functionKind,
          semanticRole: source.semanticRole,
          semanticLabel: source.semanticLabel,
          backendKey: source.backendKey,
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
          sourceFile: source.sourceFile,
          functionKind: source.functionKind,
          semanticRole: source.semanticRole,
          semanticLabel: source.semanticLabel,
          backendKey: source.backendKey,
        };
      }
    }
  }

  return next;
}

function getOutputNode(nodes: PipelineNode[], connections: GraphConnection[], selectedNodeId: string) {
  const selected = nodes.find(node => node.id === selectedNodeId);
  if (selected?.kind === "output") return selected;

  const sourceIds = new Set(connections.map(connection => connection.from));
  const terminalOutputs = nodes.filter(node => node.kind === "output" && !sourceIds.has(node.id));
  return terminalOutputs.at(-1) ?? nodes.filter(node => node.kind === "output").at(-1) ?? null;
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

function buildBomDrilldownNodes(source: PipelineNode, sku: string, components: BomStockComponent[]) {
  const nodes: PipelineNode[] = [];
  const connections: GraphConnection[] = [];
  const rootX = source.x + nodeWidth(source.kind) + 76;
  const rowsPerColumn = 10;
  const rowStep = 54;
  const columnStep = 182;
  const centerY = source.y + effectiveNodeHeight(source) / 2 - nodeHeight("component") / 2;
  const sortedComponents = [...components].sort((a, b) => String(a.code).localeCompare(String(b.code), "tr"));
  const leafComponents = sortedComponents.filter(component => (component.children?.length ?? 0) === 0);
  const subAssemblyComponents = sortedComponents.filter(component => (component.children?.length ?? 0) > 0);
  const leafColumnCount = Math.max(1, Math.ceil(leafComponents.length / rowsPerColumn));
  const subAssemblyColumn = leafColumnCount;
  const orderedComponents = [...leafComponents, ...subAssemblyComponents];

  orderedComponents.forEach((component, index) => {
    const isSubAssembly = (component.children?.length ?? 0) > 0;
    const localIndex = isSubAssembly ? index - leafComponents.length : index;
    const column = isSubAssembly ? subAssemblyColumn : Math.floor(localIndex / rowsPerColumn);
    const row = isSubAssembly ? localIndex : localIndex % rowsPerColumn;
    const columnSize = isSubAssembly
      ? subAssemblyComponents.length
      : Math.min(rowsPerColumn, leafComponents.length - column * rowsPerColumn);
    const x = rootX + column * columnStep + (isSubAssembly ? 28 : 0);
    const y = Math.max(70, Math.round(centerY + (row - (columnSize - 1) / 2) * rowStep));
    const node = buildBomComponentNode({
      source,
      sku,
      component,
      x,
      y,
      parentId: source.id,
      order: `${index + 1}`,
    });
    nodes.push(node);
    connections.push({ from: source.id, to: node.id, kind: "drilldown", scope: "device_component" });
    if ((component.children?.length ?? 0) > 0) {
      const childGraph = buildBomChildDrilldownNodes(node, component.children ?? []);
      nodes.push(...childGraph.nodes);
      connections.push(...childGraph.connections);
    }
  });

  return { nodes, connections };
}

function buildBomChildDrilldownNodes(parentNode: PipelineNode, children: BomStockComponent[]) {
  const nodes: PipelineNode[] = [];
  const connections: GraphConnection[] = [];
  const rowsPerColumn = 6;
  const rowStep = 54;
  const columnStep = 182;
  const rootX = parentNode.x + nodeWidth(parentNode.kind) + 22;
  const centerY = parentNode.y + effectiveNodeHeight(parentNode) / 2 - nodeHeight("component") / 2;

  children.forEach((child, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const rowsInColumn = Math.min(rowsPerColumn, children.length - column * rowsPerColumn);
    const node = buildBomComponentNode({
      source: parentNode,
      sku: parentNode.bomComponent?.sku ?? child.parentComponentCode ?? "",
      component: child,
      x: rootX + column * columnStep,
      y: Math.max(70, Math.round(centerY + (row - (rowsInColumn - 1) / 2) * rowStep)),
      parentId: parentNode.id,
      order: `${parentNode.id}-${index + 1}`,
    });
    nodes.push(node);
    connections.push({ from: parentNode.id, to: node.id, kind: "drilldown", scope: "subassembly_component" });
  });

  return { nodes, connections };
}

function addBomChildren(args: {
  source: PipelineNode;
  sku: string;
  parentNode: PipelineNode;
  children: BomStockComponent[];
  depth: number;
  baseX: number;
  baseY: number;
  childStep: number;
  childXStep: number;
  nodes: PipelineNode[];
  connections: GraphConnection[];
}) {
  const { source, sku, parentNode, children, depth, baseX, baseY, childStep, childXStep, nodes, connections } = args;
  const startY = baseY - Math.max(0, children.length - 1) * (childStep / 2);
  children.forEach((child, index) => {
    const node = buildBomComponentNode({
      source,
      sku,
      component: child,
      x: baseX,
      y: Math.max(70, startY + index * childStep),
      parentId: parentNode.id,
      order: `${parentNode.id}-${depth}-${index + 1}`,
    });
    nodes.push(node);
    connections.push({ from: parentNode.id, to: node.id, kind: "drilldown" });
    addBomChildren({
      source,
      sku,
      parentNode: node,
      children: child.children ?? [],
      depth: depth + 1,
      baseX: baseX + childXStep,
      baseY: node.y,
      childStep,
      childXStep,
      nodes,
      connections,
    });
  });
}

function buildBomComponentNode(args: {
  source: PipelineNode;
  sku: string;
  component: BomStockComponent;
  x: number;
  y: number;
  parentId: string;
  order: string;
}): PipelineNode {
  const { source, sku, component, x, y, parentId, order } = args;
  const isSubAssembly = Boolean(component.isSubAssembly || (component.children?.length ?? 0) > 0);
  const meta: BomComponentNodeMeta = {
    sku,
    code: component.code,
    name: component.name,
    requiredPerUnit: component.requiredPerUnit ?? null,
    unit: component.unit,
    tier: component.tier,
    currentStock: component.currentStock ?? null,
    maxProducts: component.maxProducts ?? null,
    status: component.status,
    isSubAssembly,
    parentComponentCode: component.parentComponentCode ?? null,
  };
  const rows = [bomComponentToRow(meta)];
  return {
    id: `bom-${source.id}-${sanitizeNodeId(component.code)}-${order}`,
    kind: "component",
    title: component.code,
    subtitle: component.name,
    x,
    y,
    rows,
    columns: collectColumns(rows),
    drilldownParentId: parentId,
    bomComponent: meta,
    bomChildren: component.children ?? [],
  };
}

function bomComponentToRow(meta: BomComponentNodeMeta) {
  return {
    product_sku: meta.sku,
    component_code: meta.code,
    component_name: meta.name,
    required_per_unit: meta.requiredPerUnit,
    unit: meta.unit,
    tier: meta.tier,
    parent_component_code: meta.parentComponentCode,
    current_stock: meta.currentStock,
    max_products: meta.maxProducts,
    status: meta.status,
    is_subassembly: meta.isSubAssembly,
  };
}

function sanitizeNodeId(value: string) {
  return normalizeIdentifier(value).replace(/[^a-zA-Z0-9_.-]/g, "_") || "component";
}

function collectDrilldownDescendantIds(nodes: PipelineNode[], rootId: string) {
  const childIdsByParent = new Map<string, string[]>();
  nodes.forEach(node => {
    if (!node.drilldownParentId) return;
    childIdsByParent.set(node.drilldownParentId, [...(childIdsByParent.get(node.drilldownParentId) ?? []), node.id]);
  });
  const stale = new Set<string>();
  const stack = [...(childIdsByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (stale.has(id)) continue;
    stale.add(id);
    stack.push(...(childIdsByParent.get(id) ?? []));
  }
  return stale;
}

function nextNodeX(source: PipelineNode, kind: NodeKind) {
  return source.x + nodeWidth(source.kind) + 72;
}

function alignNodeY(source: PipelineNode, kind: NodeKind) {
  return Math.round(source.y + (nodeHeight(source.kind) - nodeHeight(kind)) / 2);
}

function centerNodeYBetween(first: PipelineNode, second: PipelineNode, kind: NodeKind) {
  const firstCenter = first.y + nodeHeight(first.kind) / 2;
  const secondCenter = second.y + nodeHeight(second.kind) / 2;
  return Math.round((firstCenter + secondCenter) / 2 - nodeHeight(kind) / 2);
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
    const key = connectionKey(connection);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function connectionKey(connection: GraphConnection) {
  return `${connection.from}-${connection.to}`;
}

function cleanTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
}

function loadSavedPipelineGraph(): SavedPipelineGraph | null {
  return loadSavedPipelineHistory()[0] ?? loadLegacySavedPipelineGraph();
}

function loadSavedPipelineHistory(): SavedPipelineGraph[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(pipelineBuilderHistoryStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(parsed)
      ? parsed.map(normalizeSavedPipeline).filter((item): item is SavedPipelineGraph => Boolean(item))
      : [];
    const legacy = loadLegacySavedPipelineGraph();
    const merged = legacy ? upsertSavedPipeline(history, legacy) : history;
    return merged.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)).slice(0, 30);
  } catch {
    return [];
  }
}

function loadLegacySavedPipelineGraph(): SavedPipelineGraph | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(pipelineBuilderStorageKey);
    if (!raw) return null;
    return normalizeSavedPipeline(JSON.parse(raw));
  } catch {
    return null;
  }
}

function normalizeSavedPipeline(raw: any): SavedPipelineGraph | null {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.connections) || !raw.savedAt) return null;
  const nodeIds = new Set(raw.nodes.map((node: PipelineNode) => node.id));
  const selectedNodeId = raw.selectedNodeId && nodeIds.has(raw.selectedNodeId)
    ? raw.selectedNodeId
    : raw.nodes[0]?.id ?? initialDatasetId;
  return {
    id: typeof raw.id === "string" ? raw.id : `pipeline-${Date.parse(raw.savedAt) || Date.now()}`,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : inferPipelineName(raw.nodes),
    nodes: raw.nodes,
    connections: raw.connections.filter((connection: GraphConnection) => nodeIds.has(connection.from) && nodeIds.has(connection.to)),
    selectedNodeId,
    savedAt: raw.savedAt,
  };
}

function upsertSavedPipeline(items: SavedPipelineGraph[], snapshot: SavedPipelineGraph) {
  return [snapshot, ...items.filter(item => item.id !== snapshot.id)]
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, 30);
}

function mergeSavedPipelines(primary: SavedPipelineGraph[], fallback: SavedPipelineGraph[]) {
  const byId = new Map<string, SavedPipelineGraph>();
  [...fallback, ...primary].forEach(item => byId.set(item.id, item));
  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, 30);
}

function inferPipelineName(nodes: PipelineNode[]) {
  const semanticNames = nodes
    .filter(node => node.semanticRole)
    .map(node => node.semanticLabel || node.title)
    .filter(Boolean);
  if (semanticNames.length > 0) return semanticNames.slice(0, 3).join(" → ");
  return nodes[0]?.title || "Pipeline";
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function nodeFunctionToSemanticRole(functionKind: NodeFunctionKind): SemanticRole {
  return functionKind;
}

function emptyOrderFields(): OrderFields {
  return {
    customer: "",
    deadline: "",
  };
}

function emptyOrderLineFields(orderFields?: OrderFields): OrderLineFields {
  return {
    customer: orderFields?.customer ?? "",
    deviceType: "",
    quantity: "",
    deadline: orderFields?.deadline ?? "",
  };
}

function semanticRoleLabel(role: SemanticRole) {
  if (role === "customer") return "Müşteri";
  if (role === "order") return "Sipariş";
  return "Cihaz";
}

function buildSmartConnection(source: PipelineNode, target: PipelineNode): GraphConnection {
  const relation =
    source.semanticRole === "customer" && target.semanticRole === "order"
      ? "customer_order"
      : source.semanticRole === "order" && target.semanticRole === "device"
        ? "order_device"
        : "generic";
  const context: Record<string, string> = {};
  if (relation === "customer_order") context.customer = source.semanticLabel || source.title;
  if (relation === "order_device") {
    if (source.orderFields?.customer) context.customer = source.orderFields.customer;
    if (source.orderFields?.deadline) context.deadline = source.orderFields.deadline;
    context.device = target.deviceSku || target.semanticLabel || target.title;
    if (target.deviceQuantity) context.quantity = target.deviceQuantity;
  }
  const internalOrderLine = relation === "order_device" ? buildInternalOrderLine(source, target) : undefined;
  const fieldMap = relation === "customer_order"
    ? [{ from: "semanticLabel", to: "orderFields.customer" }]
    : relation === "order_device"
      ? [
          { from: "orderFields.customer", to: "internal.orderLine.customer" },
          { from: "orderFields.deadline", to: "internal.orderLine.deadline" },
          { from: "deviceSku", to: "internal.orderLine.deviceType" },
          { from: "deviceQuantity", to: "internal.orderLine.quantity" },
          { from: "internal.orderLine.deviceType", to: "semanticLabel" },
        ]
      : [];
  return {
    from: source.id,
    to: target.id,
    kind: "smart",
    contract: {
      relation,
      fromRole: source.semanticRole,
      toRole: target.semanticRole,
      fieldMap,
      context,
      internal: internalOrderLine,
      status: "local",
      message: relation === "customer_order"
        ? "Customer context mapped into order.customer"
        : relation === "order_device"
          ? "Order linked to device through hidden orderLine semantic entity"
          : "Generic smart connection",
    },
  };
}

function buildInternalOrderLine(order: PipelineNode, device: PipelineNode): SemanticConnectionContract["internal"] {
  const deviceValue = device.deviceSku || (device.semanticLabel !== "Cihaz" ? device.semanticLabel : "") || device.title;
  return {
    entity: "orderLine",
    fields: {
      customer: order.orderFields?.customer ?? "",
      deadline: order.orderFields?.deadline ?? "",
      deviceType: deviceValue !== "Cihaz" ? deviceValue : "",
      quantity: device.deviceQuantity ?? "",
    },
    contracts: [
      {
        relation: "order_order_line",
        fieldMap: [
          { from: "orderFields.customer", to: "orderLineFields.customer" },
          { from: "orderFields.deadline", to: "orderLineFields.deadline" },
        ],
      },
      {
        relation: "order_line_device",
        fieldMap: [
          { from: "orderLineFields.deviceType", to: "semanticLabel" },
          { from: "orderLineFields.quantity", to: "deviceQuantity" },
        ],
      },
    ],
  };
}

function applySmartNodeContext(source: PipelineNode, target: PipelineNode, node: PipelineNode): PipelineNode {
  if (node.id !== target.id) return node;
  if (source.semanticRole === "customer" && target.semanticRole === "order") {
    return {
      ...node,
      orderFields: {
        ...emptyOrderFields(),
        ...node.orderFields,
        customer: source.semanticLabel || source.title,
      },
    };
  }
  if (source.semanticRole === "order" && target.semanticRole === "device") {
    return node;
  }
  if (source.semanticRole === "order" && target.semanticRole === "orderLine") {
    return {
      ...node,
      orderLineFields: {
        ...emptyOrderLineFields(source.orderFields),
        ...node.orderLineFields,
        customer: source.orderFields?.customer || node.orderLineFields?.customer || "",
        deadline: source.orderFields?.deadline || node.orderLineFields?.deadline || "",
      },
    };
  }
  if (source.semanticRole === "orderLine" && target.semanticRole === "device") {
    const device = source.orderLineFields?.deviceType;
    const quantity = source.orderLineFields?.quantity;
    return {
      ...node,
      title: device || node.title,
      subtitle: device ? `${device} cihaz entity` : node.subtitle,
      semanticLabel: device || node.semanticLabel,
      deviceSku: device || node.deviceSku,
      deviceQuantity: quantity || node.deviceQuantity,
    };
  }
  return node;
}

function describeSmartConnection(source: PipelineNode, target: PipelineNode) {
  if (source.semanticRole === "customer" && target.semanticRole === "order") {
    return `${source.title} → ${target.title}: müşteri alanı siparişe aktarıldı.`;
  }
  if (source.semanticRole === "order" && target.semanticRole === "orderLine") {
    return `${source.title} → ${target.title}: sipariş bağlamı kaleme aktarıldı.`;
  }
  if (source.semanticRole === "orderLine" && target.semanticRole === "device") {
    return `${source.title} → ${target.title}: cihaz tipi cihaz node'una aktarıldı.`;
  }
  const left = source.semanticRole ? semanticRoleLabel(source.semanticRole) : source.title;
  const right = target.semanticRole ? semanticRoleLabel(target.semanticRole) : target.title;
  return `${left} → ${right} bağlantısı kuruldu.`;
}

function isInteractiveDragTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, select, textarea, button, label, [data-no-drag='true']"));
}

function findFreePosition(nodes: PipelineNode[], kind: NodeKind, preferredX: number, preferredY: number) {
  let x = preferredX;
  let y = Math.max(60, preferredY);
  const width = nodeWidth(kind);
  const height = nodeHeight(kind);

  for (let attempt = 0; attempt < 24; attempt++) {
    const overlaps = nodes.some(node => rectanglesOverlap(
      { x, y, width, height },
      { x: node.x, y: node.y, width: nodeWidth(node.kind), height: effectiveNodeHeight(node) },
    ));
    if (!overlaps) return { x, y };
    y += 132;
    if (y > 760) {
      y = 80 + (attempt % 3) * 40;
      x += 340;
    }
  }

  return { x, y };
}

function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  const gap = 30;
  return !(
    a.x + a.width + gap < b.x
    || b.x + b.width + gap < a.x
    || a.y + a.height + gap < b.y
    || b.y + b.height + gap < a.y
  );
}

function nodeWidth(kind: NodeKind) {
  if (kind === "component") return 150;
  if (kind === "output") return 250;
  if (kind === "union") return 260;
  return 300;
}

function nodeHeight(kind: NodeKind) {
  if (kind === "component") return 44;
  if (kind === "output") return 72;
  if (kind === "union") return 104;
  if (kind === "dataset") return 122;
  return 92;
}

function effectiveNodeHeight(node: PipelineNode) {
  if (node.semanticRole === "order") return 164;
  if (node.semanticRole === "device") return 212;
  return nodeHeight(node.kind);
}

function nodeTone(kind: NodeKind) {
  if (kind === "component") return "#587c7a";
  if (kind === "dataset") return "#6b7a8f";
  if (kind === "transform") return CT.info;
  if (kind === "union") return "#d92f7d";
  return CT.ok;
}

function nodeIcon(kind: NodeKind, size: number) {
  if (kind === "component") return <Box size={size} color="#587c7a" />;
  if (kind === "dataset") return <FileSpreadsheet size={size} color="#6b7a8f" />;
  if (kind === "transform") return <Hammer size={size} color={CT.info} />;
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

function statusLabel(status: string) {
  if (status === "critical") return "Kritik";
  if (status === "warning") return "Düşük";
  if (status === "ok") return "OK";
  if (status === "abundant") return "Bol";
  if (status === "variable") return "Değişken";
  return status || "N/A";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 0", borderBottom: `1px solid ${CT.border}` }}>
      <div style={{ color: CT.inkMuted, fontSize: 11 }}>{label}</div>
      <div style={{ color: CT.ink, fontSize: 13, fontWeight: 750, fontFamily: CT_MONO }}>{String(value)}</div>
    </div>
  );
}

function ImportPlanPanel({ plan }: { plan: ImportPlan }) {
  return (
    <div style={importPlanPanelStyle}>
      <div style={{ fontSize: 11, fontWeight: 800, color: CT.ink, marginBottom: 8 }}>Import plan</div>
      <div style={{ display: "grid", gap: 8 }}>
        {plan.actions.map(action => (
          <div key={action.id} style={importPlanActionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: CT.ink }}>{action.label}</span>
              <span style={{ fontSize: 10, color: action.errors.length > 0 ? CT.err : CT.ok, fontFamily: CT_MONO }}>
                {Math.round(action.confidence * 100)}%
              </span>
            </div>
            <div style={{ color: CT.inkMuted, fontSize: 10.5, marginTop: 3 }}>
              {action.mode} {"->"} {action.targetTable} · {action.rowCount} rows
            </div>
            {action.endpoint && <div style={{ color: CT.inkFaint, fontSize: 10, fontFamily: CT_MONO, marginTop: 3 }}>{action.endpoint}</div>}
            {[...action.errors, ...action.warnings].slice(0, 2).map(item => (
              <div key={item} style={{ color: action.errors.includes(item) ? CT.err : "#a96f00", fontSize: 10.5, marginTop: 4 }}>{item}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SavedPipelinesPanel({ pipelines, activeId, onLoad }: {
  pipelines: SavedPipelineGraph[];
  activeId: string | null;
  onLoad: (pipeline: SavedPipelineGraph) => void;
}) {
  return (
    <aside style={savedPipelinesPanelStyle}>
      <div style={savedPipelinesHeaderStyle}>
        <span>Kaydedilen pipeline'lar</span>
        <span style={{ color: CT.inkMuted, fontFamily: CT_MONO }}>{pipelines.length}</span>
      </div>
      <div style={savedPipelinesListStyle}>
        {pipelines.length === 0 && (
          <div style={savedPipelineEmptyStyle}>Henüz kayıt yok.</div>
        )}
        {pipelines.map(pipeline => (
          <button
            key={pipeline.id}
            type="button"
            onClick={() => onLoad(pipeline)}
            style={savedPipelineItemStyle(activeId === pipeline.id)}
          >
            <span style={savedPipelineNameStyle}>{pipeline.name}</span>
            <span style={savedPipelineMetaStyle}>
              {pipeline.nodes.length} node · {pipeline.connections.length} bağ · {formatSavedAt(pipeline.savedAt)}
            </span>
          </button>
        ))}
      </div>
    </aside>
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

const saveStatusStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 11,
  fontFamily: CT_MONO,
  marginRight: 2,
};

function iconToolbarButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...toolbarButtonStyle,
    width: 32,
    justifyContent: "center",
    padding: 0,
    color: disabled ? CT.inkFaint : CT.inkSub,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function deployButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...toolbarButtonStyle,
    color: disabled ? CT.inkFaint : CT.ok,
    borderColor: disabled ? CT.border : "rgba(63,143,91,0.28)",
    background: disabled ? "#f2f2ef" : CT.okSoft,
    opacity: disabled ? 0.54 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const importPlanPanelStyle: CSSProperties = {
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  padding: 10,
  marginBottom: 12,
  background: "#fffdf7",
};

const importPlanActionStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  padding: 8,
  background: CT.surface,
};

const savedPipelinesPanelStyle: CSSProperties = {
  position: "fixed",
  top: 118,
  right: 14,
  zIndex: 30,
  width: 286,
  maxHeight: "calc(100vh - 154px)",
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 8,
  background: "rgba(250,249,245,0.98)",
  boxShadow: "0 12px 34px rgba(20,20,19,0.18)",
  overflow: "hidden",
};

const savedPipelinesHeaderStyle: CSSProperties = {
  height: 42,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 12px",
  borderBottom: `1px solid ${CT.borderStrong}`,
  fontSize: 12,
  fontWeight: 800,
};

const savedPipelinesListStyle: CSSProperties = {
  maxHeight: "calc(100vh - 198px)",
  overflowY: "auto",
  padding: 8,
};

const savedPipelineEmptyStyle: CSSProperties = {
  padding: 12,
  color: CT.inkMuted,
  fontSize: 12,
};

function savedPipelineItemStyle(active: boolean): CSSProperties {
  return {
    width: "100%",
    display: "grid",
    gap: 4,
    border: `1px solid ${active ? CT.accentEdge : CT.border}`,
    borderRadius: 7,
    background: active ? CT.accentSoft : CT.surface,
    color: CT.ink,
    padding: "9px 10px",
    marginBottom: 7,
    textAlign: "left",
    fontFamily: CT_FONT,
    cursor: "pointer",
  };
}

const savedPipelineNameStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const savedPipelineMetaStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 10,
  fontFamily: CT_MONO,
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

const nodeTitleInputStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  border: 0,
  outline: 0,
  background: "transparent",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 14,
  fontWeight: 750,
};

const componentCodeTitleStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 14,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const subAssemblyBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(65,111,107,0.34)",
  borderRadius: 5,
  background: "#e4f3ef",
  color: "#416f6b",
  padding: "0 5px",
  fontFamily: CT_MONO,
  fontSize: 9,
  fontWeight: 900,
};

const nodeFunctionBarStyle: CSSProperties = {
  height: 34,
  display: "grid",
  gridTemplateColumns: "48px 1fr",
  alignItems: "center",
  gap: 8,
  margin: "9px 12px 0",
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 6,
  background: "#fbfbf8",
  overflow: "hidden",
};

const nodeFunctionPrefixStyle: CSSProperties = {
  height: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRight: `1px solid ${CT.borderStrong}`,
  color: CT.inkSub,
  fontFamily: CT_MONO,
  fontSize: 12,
  fontWeight: 800,
  background: "#f3f4f6",
};

const nodeFunctionSelectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: 0,
  outline: 0,
  background: "transparent",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const orderFieldsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 7,
  padding: "6px 12px 0",
};

const deviceEditorStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  padding: "6px 12px 0",
};

const deviceFieldsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 78px",
  gap: 7,
};

function drilldownButtonStyle(disabled: boolean): CSSProperties {
  return {
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: `1px solid ${disabled ? CT.border : "rgba(88,124,122,0.34)"}`,
    borderRadius: 6,
    background: disabled ? "#f2f2ef" : "#eef7f4",
    color: disabled ? CT.inkFaint : "#416f6b",
    fontFamily: CT_FONT,
    fontSize: 11,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const orderFieldStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 3,
};

const orderFieldLabelStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 9.5,
  fontWeight: 750,
};

const orderFieldInputStyle: CSSProperties = {
  minWidth: 0,
  height: 26,
  border: `1px solid ${CT.border}`,
  borderRadius: 6,
  background: "#fbfbf8",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 11,
  fontWeight: 650,
  padding: "0 7px",
  outline: 0,
};

const orderFieldSelectStyle: CSSProperties = {
  ...orderFieldInputStyle,
  cursor: "pointer",
};

const nodeMetaStyle: CSSProperties = {
  padding: "7px 12px 3px",
  color: CT.inkMuted,
  fontSize: 11,
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

const bomMetaStackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const bomMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 4,
  padding: "3px 12px 0",
  color: CT.inkSub,
  fontSize: 9.5,
  fontFamily: CT_MONO,
};

const bomSubAssemblyTextStyle: CSSProperties = {
  color: "#416f6b",
  fontWeight: 900,
};

function bomStatusTextStyle(status: string): CSSProperties {
  const color =
    status === "critical" ? CT.err :
    status === "warning" ? "#a96f00" :
    status === "abundant" ? CT.ok :
    status === "variable" ? "#b75e00" :
    CT.inkSub;
  return {
    color,
    fontWeight: 900,
  };
}

const componentDrillButtonStyle: CSSProperties = {
  height: 22,
  margin: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  border: `1px solid rgba(65,111,107,0.38)`,
  borderRadius: 5,
  background: "#e4f3ef",
  color: "#416f6b",
  fontFamily: CT_FONT,
  fontSize: 10.5,
  fontWeight: 800,
  cursor: "pointer",
};

const componentStockPanelStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fbfbf8",
  padding: 10,
  marginBottom: 10,
};

const componentStockPanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  color: CT.ink,
  fontSize: 12,
  fontWeight: 800,
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
