import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import * as XLSX from "xlsx";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownToLine,
  Box,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GitBranch,
  Hammer,
  ListTree,
  Minus,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Table2,
  Trash2,
  UploadCloud,
} from "lucide-react";

type NodeKind = "dataset" | "transform" | "union" | "output" | "component";
type NodeFunctionKind = "customer" | "order" | "orderLine" | "device" | "procurement" | "ontology";
type SemanticRole = "customer" | "order" | "orderLine" | "device" | "procurement" | "ontology";
type PortSide = "left" | "right";
type DeviceOperationMode = "warehouse_sale" | "produce_sale";
type DeviceDrilldownMode = "all" | "shortage";
type OntologyChartMode = "fulfillment" | "capacity" | "risk";
type OntologyXDimension = "device" | "customer" | "deadline" | "riskTier";
type OntologyYMetric = "requested" | "warehouse" | "producible" | "shortage" | "criticalComponents" | "warningComponents" | "riskScore" | "totalSold";

type DeliveryDecision = {
  status: "ontime" | "risk" | "late" | "missing";
  label: string;
  customer: string;
  device: string;
  requestedQuantity: number;
  deadline: string;
  readyDate: string;
  delayDays: number | null;
  bottleneck: string;
  recommendation: string;
  summary: string;
  agentFindings: Array<{ agent: string; finding: string; tone: "ok" | "risk" | "late" }>;
};

type OntologyAnalysisResponse = {
  provider: string;
  model: string | null;
  intent: string;
  title: string;
  narrative: string;
  chartSpec: {
    type: "line" | "bar" | "area" | "combo";
    xKey: string;
    yLabel: string;
    series: Array<{ key: string; label: string; color: string }>;
    data: Array<Record<string, any>>;
  };
  recommendedActions: string[];
  missingContext: string[];
  analyzedAt: string;
};

type SemanticLayerDecision = {
  id: string;
  status: "on_track" | "at_risk" | "late" | "missing_context";
  riskScore: number;
  customer: string;
  device: string;
  requested: number;
  deadline: string;
  warehouse: number;
  producible: number;
  fulfillmentGap: number;
  shortageCount: number;
  linkedProcurementCount: number;
  missingProcurementCount: number;
  lateProcurementCount: number;
  summary: string;
  recommendation: string;
  bottleneck: null | {
    code: string;
    name: string;
    shortage: number;
    readyDate: string;
    delayDays: number | null;
  };
};

type SemanticLayerResponse = {
  provider: string;
  generatedAt: string;
  ontology: {
    objectTypes: string[];
    linkTypes: string[];
    actionTypes: string[];
  };
  kpis: {
    devices: number;
    customers: number;
    bomComponents: number;
    procurementNodes: number;
    decisions: number;
    riskyDecisions: number;
    stagedActions: number;
  };
  decisions: SemanticLayerDecision[];
  actionQueue: Array<{
    id: string;
    actionType: string;
    label: string;
    targetObject?: string;
    ownerAgent: string;
    requiresHumanApproval: boolean;
    reason: string;
  }>;
  agentLanes: Array<{ agent: string; responsibility: string; finding: string }>;
};

type GraphFunctionResponse = {
  provider: string;
  functionId: "fulfillment-risk-by-device";
  generatedAt: string;
  chart: {
    type: "bar";
    xKey: OntologyXDimension;
    rows: Array<Record<string, any> & { objectId: string; device: string }>;
    series: Array<{ key: string; label: string; color: string }>;
  };
  objects: Array<{
    id: string;
    objectType: string;
    title: string;
    subtitle: string;
    decision: SemanticLayerDecision & { bomRows?: Array<Record<string, any>> };
  }>;
  actions: SemanticLayerResponse["actionQueue"];
  semantic: SemanticLayerResponse;
};

type OntologyScopeItem = {
  id: string;
  type: "device" | "customer" | "component" | "procurement";
  label: string;
  detail: string;
  tone: "neutral" | "risk" | "ok";
};

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

type ProcurementFields = {
  componentCode: string;
  supplier: string;
  quantity: string;
  eta: string;
  inboundBufferDays: string;
  productionLeadDays: string;
  status: string;
};

type ProcurementOverride = {
  plannedQuantity?: string;
  supplier?: string;
  eta?: string;
  inboundBufferDays?: string;
  productionLeadDays?: string;
  status?: string;
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
  procurementFields?: ProcurementFields;
  procurementOverrides?: Record<string, ProcurementOverride>;
  deviceSku?: string;
  deviceQuantity?: string;
  deviceOperationMode?: DeviceOperationMode;
  deviceOperation?: DeviceOperationSnapshot;
  drilldownParentId?: string;
  bomComponent?: BomComponentNodeMeta;
  bomChildren?: BomStockComponent[];
  dbLinkedSku?: string;
  dbLinkedDrilldownMode?: DeviceDrilldownMode;
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
  orderQuantity: number | null;
  requiredForOrder: number | null;
  stockShortage: number | null;
  isInsufficient: boolean;
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

type DeviceOperationSnapshot = {
  status: "idle" | "loading" | "ready" | "error";
  sku: string;
  productName?: string;
  inProduction: number;
  inWarehouse: number;
  totalSold: number;
  maxProducible: number | null;
  bottleneck?: {
    code?: string;
    name?: string;
    maxProducts?: number;
  } | null;
  updatedAt?: string;
  loadedAt?: string;
  error?: string;
};

type SemanticConnectionContract = {
  relation: "customer_order" | "customer_device" | "order_order_line" | "order_line_device" | "order_device" | "component_procurement" | "ontology_input" | "generic";
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

const CANVAS_WORKSPACE_PADDING = 1400;

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
  const initialGraph = useMemo(() => {
    const graph = loadSavedPipelineGraph();
    return graph ? repairGraphSnapshot(graph) : null;
  }, []);
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
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [twinHealthRunning, setTwinHealthRunning] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(310);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasInitialScrollDone = useRef(false);

  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? nodes[0];
  const previewColumns = selectedNode?.columns ?? [];
  const previewRows = selectedNode?.rows ?? [];

  const outputNode = getOutputNode(nodes, connections, selectedNodeId);
  const canUndo = history.length > 0;
  const canDelete = Boolean(selectedNode);
  const canZoomOut = canvasZoom > 0.55;
  const canZoomIn = canvasZoom < 1.45;

  const canvasMetrics = useMemo(() => {
    const minX = Math.min(...nodes.map(node => node.x), 0);
    const minY = Math.min(...nodes.map(node => node.y), 0);
    const maxX = Math.max(...nodes.map(node => node.x + nodeWidth(node.kind)), 1800);
    const maxY = Math.max(...nodes.map(node => node.y + effectiveNodeHeight(node)), 900);
    const originX = CANVAS_WORKSPACE_PADDING - minX;
    const originY = CANVAS_WORKSPACE_PADDING - minY;
    return {
      width: Math.ceil(maxX - minX + CANVAS_WORKSPACE_PADDING * 2),
      height: Math.ceil(maxY - minY + CANVAS_WORKSPACE_PADDING * 2),
      originX,
      originY,
    };
  }, [nodes]);

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
        x1: getPortPosition(from, "right").x + canvasMetrics.originX,
        y1: getPortPosition(from, "right").y + canvasMetrics.originY,
        x2: getPortPosition(to, "left").x + canvasMetrics.originX,
        y2: getPortPosition(to, "left").y + canvasMetrics.originY,
      };
    }).filter((edge): edge is { key: string; kind: ConnectionKind | undefined; scope: DrilldownConnectionScope | undefined; x1: number; y1: number; x2: number; y2: number } => Boolean(edge));
  }, [canvasMetrics.originX, canvasMetrics.originY, connections, nodes]);
  const scaledCanvasSize = useMemo(() => ({
    width: Math.ceil(canvasMetrics.width * canvasZoom),
    height: Math.ceil(canvasMetrics.height * canvasZoom),
  }), [canvasMetrics.height, canvasMetrics.width, canvasZoom]);

  useEffect(() => {
    if (canvasInitialScrollDone.current) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, canvasMetrics.originX * canvasZoom - 160);
    viewport.scrollTop = Math.max(0, canvasMetrics.originY * canvasZoom - 80);
    canvasInitialScrollDone.current = true;
  }, [canvasMetrics.originX, canvasMetrics.originY, canvasZoom]);

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

  function startPreviewResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = previewHeight;
    const viewportHeight = window.innerHeight;
    const minHeight = 190;
    const maxHeight = Math.max(260, viewportHeight - 250);

    function onPointerMove(moveEvent: PointerEvent) {
      const delta = startY - moveEvent.clientY;
      setPreviewHeight(Math.min(maxHeight, Math.max(minHeight, startHeight + delta)));
    }

    function onPointerUp() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
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
    if (selectedNode?.semanticRole !== "device") return;
    const sku = resolveDeviceNodeSku(selectedNode);
    if (!sku || sku === "Cihaz") return;
    const operation = selectedNode.deviceOperation;
    if (operation?.sku === sku && (operation.status === "loading" || operation.status === "ready")) return;
    void loadDeviceOperationFromDatabase(selectedNode.id, sku);
  }, [selectedNodeId, selectedNode?.deviceSku, selectedNode?.semanticLabel, selectedNode?.title, selectedNode?.deviceOperation?.sku, selectedNode?.deviceOperation?.status]);

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
        const latestCloudGraph = normalized[0];
        if (latestCloudGraph && shouldOpenCloudGraph(initialGraph, latestCloudGraph)) {
          const repaired = repairGraphSnapshot(latestCloudGraph);
          setNodes(repaired.nodes);
          setConnections(repaired.connections);
          setSelectedNodeId(repaired.selectedNodeId);
          setActiveSavedId(latestCloudGraph.id);
          setLastSavedAt(latestCloudGraph.savedAt);
          try {
            localStorage.setItem(pipelineBuilderStorageKey, JSON.stringify(latestCloudGraph));
            localStorage.setItem(pipelineBuilderHistoryStorageKey, JSON.stringify(mergeSavedPipelines(normalized, initialSavedPipelines)));
          } catch {
            // Cloud remains the source of truth when browser storage is unavailable.
          }
          if (initialGraph) setError(`Cloud'daki güncel pipeline açıldı · ${formatSavedAt(latestCloudGraph.savedAt)}`);
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
    const repaired = repairGraphSnapshot(pipeline);
    pushHistory();
    setNodes(repaired.nodes);
    setConnections(repaired.connections);
    setSelectedNodeId(repaired.selectedNodeId);
    setActiveSavedId(pipeline.id);
    setLastSavedAt(pipeline.savedAt);
    setActionMenu(null);
    setPendingConnection(null);
    setSavedPanelOpen(false);
    setError(`${pipeline.name} açıldı · ${formatSavedAt(pipeline.savedAt)}`);
  }

  async function runTwinHealth() {
    if (twinHealthRunning) return;
    setTwinHealthRunning(true);
    setActionMenu(null);
    setPendingConnection(null);

    const repaired = repairGraphSnapshot({
      nodes,
      connections,
      selectedNodeId,
    });
    setNodes(repaired.nodes);
    setConnections(repaired.connections);
    setSelectedNodeId(repaired.selectedNodeId);

    const semanticConnections = repaired.connections.filter(connection => connection.contract);
    if (semanticConnections.length === 0) {
      setTwinHealthRunning(false);
      setError("Twin health: semantic bağlantı yok. Graph temizlendi ve riskler yeniden hesaplandı.");
      return;
    }

    const byId = new Map(repaired.nodes.map(node => [node.id, node]));
    const checked = await Promise.all(semanticConnections.map(async connection => {
      const source = byId.get(connection.from);
      const target = byId.get(connection.to);
      if (!source || !target || !connection.contract) return { key: connectionKey(connection), connection, ok: false, message: "Bağlantı node'u eksik" };
      try {
        const res = await fetch("/api/pipeline-builder/semantic/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection, source, target }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "semantic validation failed");
        return {
          key: connectionKey(connection),
          ok: true,
          message: payload.message || "validated",
          connection: {
            ...connection,
            contract: {
              ...connection.contract,
              status: "validated" as const,
              backendValidatedAt: payload.validatedAt,
              context: payload.context ?? connection.contract.context,
              internal: payload.internal ?? connection.contract.internal,
              message: payload.message,
            },
          },
        };
      } catch (err: any) {
        return {
          key: connectionKey(connection),
          ok: false,
          message: err?.message || "semantic validation failed",
          connection: {
            ...connection,
            contract: {
              ...connection.contract,
              status: "invalid" as const,
              message: err?.message || "semantic validation failed",
            },
          },
        };
      }
    }));

    const checkedByKey = new Map(checked.map(item => [item.key, item.connection]));
    setConnections(prev => prev.map(connection => checkedByKey.get(connectionKey(connection)) ?? connection));
    const passed = checked.filter(item => item.ok).length;
    const failed = checked.length - passed;
    setTwinHealthRunning(false);
    setError(failed > 0
      ? `Twin health: ${passed} bağ sağlıklı, ${failed} bağ uyarıda. Graph ve stok riskleri yenilendi.`
      : `Twin health: ${passed} semantic bağ sağlıklı. Graph ve stok riskleri yenilendi.`);
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
      const scaledDx = dx / canvasZoom;
      const scaledDy = dy / canvasZoom;
      setNodes(prev => prev.map(node => {
        if (node.id !== activeDrag.nodeId) return node;
        return {
          ...node,
          x: Math.max(20, Math.round(activeDrag.originX + scaledDx)),
          y: Math.max(40, Math.round(activeDrag.originY + scaledDy)),
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
  }, [canvasZoom, dragState]);

  function adjustCanvasZoom(delta: number) {
    setCanvasZoom(prev => Math.min(1.5, Math.max(0.5, Number((prev + delta).toFixed(2)))));
  }

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
    setActionMenu(actionMenuPosition(node));
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
    setActionMenu(node && node.kind !== "output" && node.kind !== "component" ? actionMenuPosition(node) : null);
  }

  function actionMenuPosition(node: PipelineNode): NonNullable<ActionMenuState> {
    return {
      nodeId: node.id,
      x: node.x + canvasMetrics.originX + nodeWidth(node.kind) + 18,
      y: node.y + canvasMetrics.originY - 26,
    };
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
    setError("Connect için hedef node'u seç. Müşteri → Cihaz semantic olarak bağlanır.");
  }

  function connectToOntologyFunction(fromId: string) {
    const source = nodes.find(node => node.id === fromId);
    if (!source || source.kind === "output") return;
    if (source.semanticRole === "ontology") {
      setSelectedNodeId(source.id);
      setActionMenu(null);
      setError("Bu kutu zaten Ontology f(x) olarak çalışıyor.");
      return;
    }

    const existingOntology = nodes.find(node => node.semanticRole === "ontology");
    const ontologyId = existingOntology?.id ?? `ontology-${Date.now()}`;
    const position = findFreePosition(nodes, "transform", nextNodeX(source, "transform"), alignNodeY(source, "transform"));
    const ontologyNode: PipelineNode | null = existingOntology ?? {
      id: ontologyId,
      kind: "transform",
      title: "Ontology AI",
      subtitle: "Visionary analysis engine · bağlı node'ları okur",
      x: position.x,
      y: position.y,
      rows: createOntologyRows(),
      columns: ["mode", "scope", "output"],
      functionKind: "ontology",
      semanticRole: "ontology",
      semanticLabel: "Ontology",
      backendKey: "ontology",
    };
    const connection = buildSmartConnection(source, ontologyNode, nodes, connections);

    pushHistory();
    setNodes(prev => existingOntology ? prev : prev.concat(ontologyNode));
    setConnections(prev => dedupeConnections([
      ...prev,
      connection,
    ]));
    setSelectedNodeId(ontologyId);
    setActionMenu(null);
    setPendingConnection(null);
    setError(`${source.title} → Ontology f(x): graph function girdisi olarak bağlandı.`);
    validateSemanticConnection(connection, source, ontologyNode);
  }

  function completeSmartConnection(fromId: string, toId: string) {
    const source = nodes.find(node => node.id === fromId);
    const target = nodes.find(node => node.id === toId);
    if (!source || !target || source.kind === "output" || target.kind === "output") return;
    const connection = buildSmartConnection(source, target, nodes, connections);
    pushHistory();
    setConnections(prev => dedupeConnections([
      ...prev,
      connection,
    ]));
    setNodes(prev => {
      const contextual = refreshAllDeviceOrderRisks(prev.map(node => applySmartNodeContext(source, target, node)));
      return refreshProcurementNeedTables(contextual, dedupeConnections([...connections, connection]));
    });
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
        title: semanticRole === "ontology" ? "Ontology AI" : deviceLabel,
        subtitle: semanticRole === "ontology"
          ? "Visionary analysis engine · bağlı node'ları okur"
          : semanticRole === "device" && nextDeviceSku
            ? `${nextDeviceSku} cihaz entity · DB bağlanıyor`
            : node.rows.length > 0 ? `${node.rows.length} rows · ${label.toLocaleLowerCase("tr-TR")} entity` : `${label} entity node`,
        rows: semanticRole === "ontology" ? createOntologyRows() : node.rows,
        columns: semanticRole === "ontology" ? ["mode", "scope", "output"] : node.columns,
        functionKind,
        semanticRole,
        semanticLabel: deviceLabel,
        backendKey: semanticRole,
        orderFields: semanticRole === "order" ? node.orderFields ?? emptyOrderFields() : node.orderFields,
        procurementFields: semanticRole === "procurement" ? node.procurementFields ?? emptyProcurementFields() : node.procurementFields,
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
    setNodes(prev => refreshProcurementNeedTables(prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        orderFields: {
          ...emptyOrderFields(),
          ...node.orderFields,
          [field]: value,
        },
      };
    }), connections));
    if (field === "deadline") {
      setConnections(prev => updateProcurementDeadlineContexts(prev, nodes, nodeId, value));
    }
  }

  function updateProcurementField(nodeId: string, field: keyof ProcurementFields, value: string) {
    setNodes(prev => refreshProcurementNeedTables(prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        procurementFields: {
          ...emptyProcurementFields(),
          ...node.procurementFields,
          [field]: value,
        },
      };
    }), connections));
    setConnections(prev => updateProcurementFieldContexts(prev, nodeId, field, value));
  }

  function updateProcurementRowCell(nodeId: string, componentCode: string, column: string, value: string) {
    const overrideField = procurementOverrideField(column);
    if (!componentCode || !overrideField) return;
    setNodes(prev => refreshProcurementNeedTables(prev.map(node => {
      if (node.id !== nodeId) return node;
      const current = node.procurementOverrides?.[componentCode] ?? {};
      const nextProcurementFields = {
        ...emptyProcurementFields(),
        ...node.procurementFields,
        componentCode,
      };
      if (column === "planned_quantity") nextProcurementFields.quantity = value;
      if (column === "supplier") nextProcurementFields.supplier = value;
      if (column === "eta") nextProcurementFields.eta = value;
      if (column === "inbound_buffer_days") nextProcurementFields.inboundBufferDays = value;
      if (column === "production_lead_days") nextProcurementFields.productionLeadDays = value;
      return {
        ...node,
        title: `Tedarik · ${componentCode}`,
        semanticLabel: `Tedarik ${componentCode}`,
        procurementFields: nextProcurementFields,
        procurementOverrides: {
          ...(node.procurementOverrides ?? {}),
          [componentCode]: {
            ...current,
            [overrideField]: value,
          },
        },
      };
    }), connections));
    setConnections(prev => prev.map(connection => updateProcurementConnectionContext(connection, nodeId, componentCode, column, value)));
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
        deviceOperation: value ? { status: "loading", sku: value, inProduction: 0, inWarehouse: 0, totalSold: 0, maxProducible: null } : undefined,
        rows: value ? node.rows : [],
        columns: value ? node.columns : [],
      };
    }));
    if (value) void loadDeviceOperationFromDatabase(nodeId, value);
    if (value) void loadDeviceBomFromDatabase(nodeId, value, { pushSnapshot: true });
  }

  function updateDeviceQuantity(nodeId: string, value: string) {
    setNodes(prev => refreshDeviceOrderRisk(
      prev.map(node => node.id === nodeId ? withDeviceOperationRows({ ...node, deviceQuantity: value }) : node),
      nodeId,
      value,
    ));
  }

  function updateDeviceOperationMode(nodeId: string, mode: DeviceOperationMode) {
    setNodes(prev => prev.map(node => (
      node.id === nodeId ? withDeviceOperationRows({ ...node, deviceOperationMode: mode }) : node
    )));
  }

  function updateDeviceCustomerOrderContext(
    deviceId: string,
    targetConnectionKey: string,
    field: "deadline" | "fulfillmentMode",
    value: string,
  ) {
    const targetConnection = connections.find(connection => (
      connection.to === deviceId
      && connectionKey(connection) === targetConnectionKey
      && (connection.contract?.relation === "customer_device" || connection.contract?.relation === "order_device")
    ));
    if (!targetConnection?.contract) return;

    setConnections(prev => {
      const updated = prev.map(connection => {
        if (connection.to !== deviceId || connectionKey(connection) !== targetConnectionKey || !connection.contract) return connection;
        if (connection.contract.relation !== "customer_device" && connection.contract.relation !== "order_device") return connection;
        const nextContext = {
          ...connection.contract.context,
          [field]: value,
        };
        return {
          ...connection,
          contract: {
            ...connection.contract,
            context: nextContext,
            internal: connection.contract.internal
              ? {
                  ...connection.contract.internal,
                  fields: {
                    ...connection.contract.internal.fields,
                    ...(field === "deadline" ? { deadline: value } : {}),
                  },
                }
              : connection.contract.internal,
            status: "local" as const,
            message: field === "deadline"
              ? "Customer delivery date synced into device context"
              : "Customer fulfillment mode synced into device context",
          },
        };
      });
      if (field === "deadline" && targetConnection.contract?.relation === "order_device") {
        return updateProcurementDeadlineContexts(updated, nodes, targetConnection.from, value);
      }
      return updated;
    });

    if (field === "deadline" && targetConnection.contract.relation === "order_device") {
      setNodes(prev => refreshProcurementNeedTables(prev.map(node => {
        if (node.id !== targetConnection.from) return node;
        return {
          ...node,
          orderFields: {
            ...emptyOrderFields(),
            ...node.orderFields,
            deadline: value,
          },
        };
      }), connections));
    }
  }

  async function loadDeviceOperationFromDatabase(nodeId: string, sku: string) {
    const cleanSku = sku.trim();
    if (!cleanSku) return;

    setNodes(prev => prev.map(node => (
      node.id === nodeId
        ? withDeviceOperationRows({
            ...node,
            deviceOperation: { status: "loading", sku: cleanSku, inProduction: 0, inWarehouse: 0, totalSold: 0, maxProducible: null },
          })
        : node
    )));

    try {
      const [stockResult, capacityResult] = await Promise.allSettled([
        fetch(`/api/stock/levels?sku=${encodeURIComponent(cleanSku)}`).then(async res => {
          if (!res.ok) throw new Error("mamul stok okunamadı");
          const rows = await res.json();
          return Array.isArray(rows) ? rows[0] : null;
        }),
        fetch(`/api/bom/${encodeURIComponent(cleanSku)}/production-capacity`).then(async res => {
          if (!res.ok) return null;
          return res.json();
        }),
      ]);

      const stock = stockResult.status === "fulfilled" ? stockResult.value : null;
      const capacity = capacityResult.status === "fulfilled" ? capacityResult.value : null;
      const snapshot: DeviceOperationSnapshot = {
        status: "ready",
        sku: cleanSku,
        productName: stock?.productName ?? capacity?.product ?? cleanSku,
        inProduction: toNumberOrNull(stock?.inProduction) ?? 0,
        inWarehouse: toNumberOrNull(stock?.inWarehouse) ?? 0,
        totalSold: toNumberOrNull(stock?.totalSold) ?? 0,
        maxProducible: toNumberOrNull(capacity?.maxProducible),
        bottleneck: Array.isArray(capacity?.bottlenecks) ? capacity.bottlenecks[0] ?? null : null,
        updatedAt: stock?.updatedAt,
        loadedAt: new Date().toISOString(),
      };

      setNodes(prev => prev.map(node => (
        node.id === nodeId && node.deviceSku === cleanSku
          ? withDeviceOperationRows({ ...node, deviceOperation: snapshot })
          : node
      )));
    } catch (err: any) {
      setNodes(prev => prev.map(node => (
        node.id === nodeId
          ? withDeviceOperationRows({
              ...node,
              deviceOperation: {
                status: "error",
                sku: cleanSku,
                inProduction: 0,
                inWarehouse: 0,
                totalSold: 0,
                maxProducible: null,
                error: err?.message || "operasyon verisi okunamadı",
              },
            })
          : node
      )));
    }
  }

  async function drillDownDeviceNode(nodeId: string, mode: DeviceDrilldownMode) {
    const source = nodes.find(node => node.id === nodeId);
    const sku = source?.deviceSku || (source?.semanticLabel !== "Cihaz" ? source?.semanticLabel : "") || source?.title || "";
    const cleanSku = sku.trim();
    if (!source || source.semanticRole !== "device" || !cleanSku || cleanSku === "Cihaz") {
      setError("Drill-down için önce cihaz SKU seç.");
      return;
    }
    if (
      source.dbLinkedSku === cleanSku
      && source.dbLinkedDrilldownMode === mode
      && collectDeviceDrilldownNodeIds(nodes, nodeId).size > 0
    ) {
      closeDeviceDrilldown(nodeId, cleanSku);
      return;
    }

    await loadDeviceBomFromDatabase(nodeId, cleanSku, { pushSnapshot: true, mode });
  }

  function closeDeviceDrilldown(nodeId: string, sku?: string) {
    pushHistory();
    setNodes(prev => {
      const staleIds = collectDeviceDrilldownNodeIds(prev, nodeId);
      return prev
        .filter(node => !staleIds.has(node.id))
        .map(node => {
          if (node.id !== nodeId || node.semanticRole !== "device" || !node.dbLinkedSku) return node;
          const label = node.deviceSku || node.semanticLabel || node.title;
          return {
            ...node,
            subtitle: `${label} cihaz entity`,
            dbLinkedSku: undefined,
            dbLinkedDrilldownMode: undefined,
          };
        });
    });
    setConnections(prev => {
      const staleIds = collectDeviceDrilldownNodeIds(nodes, nodeId);
      return prev.filter(connection => !staleIds.has(connection.from) && !staleIds.has(connection.to));
    });
    setActionMenu(null);
    setPendingConnection(null);
    setError(sku ? `${sku}: drill-down kapatıldı.` : "Açık drill-down kapatıldı.");
  }

  async function loadDeviceBomFromDatabase(nodeId: string, sku: string, opts: { pushSnapshot: boolean; mode?: DeviceDrilldownMode }) {
    const cleanSku = sku.trim();
    const source = nodes.find(node => node.id === nodeId);
    if (!source || !cleanSku) return;
    const mode = opts.mode ?? "all";

    try {
      setError(`${cleanSku} DB semantic layer bağlanıyor...`);
      const res = await fetch(`/api/bom/${encodeURIComponent(cleanSku)}/stock`);
      const data: BomStockResponse | { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray((data as BomStockResponse).components)) {
        throw new Error((data as { error?: string }).error || "BOM okunamadı");
      }

      const components = filterBomComponentsForDrilldown((data as BomStockResponse).components, source.deviceQuantity, mode);
      const generatedRaw = buildBomDrilldownNodes({ ...source, deviceSku: cleanSku, semanticLabel: cleanSku, title: cleanSku }, cleanSku, components);
      const staleIds = collectDeviceDrilldownNodeIds(nodes, nodeId);
      const generated = placeBomDrilldownBelowOpenGraphs(generatedRaw, nodes.filter(node => !staleIds.has(node.id)));
      if (generated.nodes.length === 0) {
        setError(mode === "shortage"
          ? `${cleanSku} için tedarik ihtiyacı olan BOM bulunamadı.`
          : `${cleanSku} için gösterilecek BOM bulunamadı.`);
        return;
      }

      if (opts.pushSnapshot) pushHistory();
      setNodes(prev => {
        const staleIds = collectDeviceDrilldownNodeIds(prev, nodeId);
        const base = prev.filter(node => !staleIds.has(node.id));
        return base.map(node => {
          if (node.id === nodeId) {
            return {
              ...node,
              title: cleanSku,
              subtitle: `${cleanSku} cihaz entity · DB bağlı · ${mode === "shortage" ? "tedarik ihtiyacı" : "tüm BOM"} · ${generated.nodes.length} node`,
              semanticLabel: cleanSku,
              deviceSku: cleanSku,
              dbLinkedSku: cleanSku,
              dbLinkedDrilldownMode: mode,
            };
          }
          return node;
        }).concat(generated.nodes);
      });
      setConnections(prev => {
        const staleIds = collectDeviceDrilldownNodeIds(nodes, nodeId);
        const base = prev.filter(connection => !staleIds.has(connection.from) && !staleIds.has(connection.to));
        return dedupeConnections(base.concat(generated.connections));
      });
      setSelectedNodeId(nodeId);
      setActionMenu(null);
      setPendingConnection(null);
      setError(`${cleanSku}: DB'den ${mode === "shortage" ? "tedarik ihtiyacı olan" : "tüm"} ${generated.nodes.length} BOM node'u açıldı.`);
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
            onClick={runTwinHealth}
            disabled={twinHealthRunning}
            style={toolbarButtonStyle}
          >
            <Activity size={14} /> {twinHealthRunning ? "Checking" : "Twin health"}
          </button>
          <div style={zoomControlStyle}>
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => adjustCanvasZoom(-0.1)}
              disabled={!canZoomOut}
              style={zoomButtonStyle(!canZoomOut)}
            >
              <Minus size={14} />
            </button>
            <span style={zoomValueStyle}>{Math.round(canvasZoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => adjustCanvasZoom(0.1)}
              disabled={!canZoomIn}
              style={zoomButtonStyle(!canZoomIn)}
            >
              <Plus size={14} />
            </button>
          </div>
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

      <main style={{ display: "grid", gridTemplateRows: `minmax(0, 1fr) 8px ${previewHeight}px`, height: "calc(100vh - 94px)", minHeight: 680 }}>
        <section ref={canvasViewportRef} style={canvasViewportStyle}>
          <div style={{ position: "relative", width: scaledCanvasSize.width, height: scaledCanvasSize.height }}>
            <div style={{ position: "relative", width: canvasMetrics.width, height: canvasMetrics.height, transform: `scale(${canvasZoom})`, transformOrigin: "top left" }}>
              <svg width={canvasMetrics.width} height={canvasMetrics.height} style={{ position: "absolute", inset: 0 }}>
                {renderedEdges.map(edge => (
                  <EdgeLine key={edge.key} kind={edge.kind} scope={edge.scope} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
                ))}
              </svg>

              {nodes.map(node => (
                <PipelineGraphNode
                  key={node.id}
                  node={node}
                  canvasOffset={{ x: canvasMetrics.originX, y: canvasMetrics.originY }}
                  selected={selectedNodeId === node.id}
                  onSelect={() => selectGraphNode(node.id)}
                  onPortClick={(side) => openPortMenu(node.id, side)}
                  onFile={(file) => handleNodeFile(node.id, file)}
                  onFunctionSelect={(functionKind) => updateNodeFunction(node.id, functionKind)}
                  onTitleChange={(title) => updateNodeTitle(node.id, title)}
                  onDragStart={(event) => startNodeDrag(node.id, event)}
                  onOrderFieldChange={(field, value) => updateOrderField(node.id, field, value)}
                  onProcurementFieldChange={(field, value) => updateProcurementField(node.id, field, value)}
                  onDeviceSelect={(value) => updateDeviceSelection(node.id, value)}
                  onDeviceQuantityChange={(value) => updateDeviceQuantity(node.id, value)}
                  onDrillDown={(mode) => drillDownDeviceNode(node.id, mode)}
                  onComponentDrillDown={() => drillDownComponentNode(node.id)}
                  productOptions={productOptions}
                />
              ))}

              {actionMenu && (
                <NodeActionMenu
                  state={actionMenu}
                  onOntology={() => connectToOntologyFunction(actionMenu.nodeId)}
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
          </div>
        </section>

        <div
          role="separator"
          aria-label="Data preview panel height"
          aria-orientation="horizontal"
          title="Paneli büyüt/küçült"
          onPointerDown={startPreviewResize}
          onDoubleClick={() => setPreviewHeight(310)}
          style={previewResizeHandleStyle}
        >
          <span style={previewResizeGripStyle} />
        </div>

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

          <div style={{ display: "grid", gridTemplateColumns: "270px 1fr", height: Math.max(120, previewHeight - 38) }}>
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
              {selectedNode?.semanticRole === "device" && (
                <DeviceOperationPreviewPanel
                  node={selectedNode}
                  nodes={nodes}
                  connections={connections}
                  productOptions={productOptions}
                  onDeviceSelect={(value) => updateDeviceSelection(selectedNode.id, value)}
                  onQuantityChange={(value) => updateDeviceQuantity(selectedNode.id, value)}
                  onModeChange={(mode) => updateDeviceOperationMode(selectedNode.id, mode)}
                  onCustomerOrderChange={(connectionId, field, value) => updateDeviceCustomerOrderContext(selectedNode.id, connectionId, field, value)}
                  onRefresh={() => {
                    const sku = resolveDeviceNodeSku(selectedNode);
                    if (sku) void loadDeviceOperationFromDatabase(selectedNode.id, sku);
                  }}
                />
              )}
              {selectedNode?.semanticRole === "ontology" && (
                <OntologyFunctionPreviewPanel node={selectedNode} nodes={nodes} connections={connections} />
              )}
              {selectedNode?.semanticRole !== "device" && selectedNode?.semanticRole !== "ontology" && previewRows.length === 0 && (
                <div style={{ padding: 22, color: CT.inkMuted, fontSize: 13 }}>
                  Dataset kutusuna dosya yükle, sonra kutunun sağ portuna basıp Transform seç.
                </div>
              )}
              {selectedNode?.semanticRole !== "device" && selectedNode?.semanticRole !== "ontology" && previewRows.length > 0 && (
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
                        {previewColumns.map(col => (
                          <td key={`${idx}-${col}`} style={tdStyle}>
                            {selectedNode?.semanticRole === "procurement" && isEditableProcurementColumn(col) ? (
                              <input
                                value={formatCell(row[col])}
                                onChange={(event) => updateProcurementRowCell(selectedNode.id, row.component_code, col, event.currentTarget.value)}
                                style={previewCellInputStyle}
                              />
                            ) : formatCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </main>

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

function PipelineGraphNode({ node, canvasOffset, selected, onSelect, onPortClick, onFile, onFunctionSelect, onTitleChange, onDragStart, onOrderFieldChange, onProcurementFieldChange, onDeviceSelect, onDeviceQuantityChange, onDrillDown, onComponentDrillDown, productOptions }: {
  node: PipelineNode;
  canvasOffset: { x: number; y: number };
  selected: boolean;
  onSelect: () => void;
  onPortClick: (side: PortSide) => void;
  onFile: (file: File) => void;
  onFunctionSelect: (functionKind: NodeFunctionKind) => void;
  onTitleChange: (title: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOrderFieldChange: (field: keyof OrderFields, value: string) => void;
  onProcurementFieldChange: (field: keyof ProcurementFields, value: string) => void;
  onDeviceSelect: (value: string) => void;
  onDeviceQuantityChange: (value: string) => void;
  onDrillDown: (mode: DeviceDrilldownMode) => void;
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
        left: node.x + canvasOffset.x,
        top: node.y + canvasOffset.y,
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
            value={node.semanticRole === "ontology" ? "Ontology" : draftTitle}
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
            <option value="device">Cihaz</option>
            <option value="procurement">Tedarik</option>
            <option value="ontology">Ontology</option>
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
      {node.semanticRole === "procurement" && (
        <ProcurementFieldsEditor
          fields={node.procurementFields ?? emptyProcurementFields()}
          onChange={onProcurementFieldChange}
        />
      )}
      {node.semanticRole === "ontology" && (
        <div style={ontologyNodeHintStyle}>
          <Network size={13} />
          <span>projection builder</span>
        </div>
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
      {isComponent && node.bomComponent?.isInsufficient && (
        <button
          type="button"
          data-no-drag="true"
          title="Tedarik bağlantısı kur"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPortClick("right");
          }}
          style={procurementMiniNodeStyle}
        >
          T
        </button>
      )}
      {node.bomComponent?.isInsufficient && (
        <span
          style={componentWarningDotStyle}
          title={componentWarningTitle(node.bomComponent)}
        />
      )}
    </div>
  );
}

function NodeActionMenu({ state, onOntology, onUnion, onConnect, onOutput, onNewDataset, onEdit }: {
  state: NonNullable<ActionMenuState>;
  onOntology: () => void;
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
      <ActionItem icon={<Network size={18} />} label="Ontology" tone={CT.info} onClick={onOntology} />
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

function ProcurementFieldsEditor({ fields, onChange }: {
  fields: ProcurementFields;
  onChange: (field: keyof ProcurementFields, value: string) => void;
}) {
  return (
    <div data-no-drag="true" style={procurementFieldsGridStyle}>
      <OrderField label="Kod" value={fields.componentCode} onChange={(value) => onChange("componentCode", value)} />
      <OrderField label="Miktar" value={fields.quantity} inputMode="numeric" onChange={(value) => onChange("quantity", value)} />
      <OrderField label="Tedarikçi" value={fields.supplier} onChange={(value) => onChange("supplier", value)} />
      <OrderField label="ETA" value={fields.eta} type="date" onChange={(value) => onChange("eta", value)} />
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
  onDrillDown: (mode: DeviceDrilldownMode) => void;
  productOptions: ProductOption[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
          setMenuOpen(prev => !prev);
        }}
        disabled={!value}
        style={drilldownButtonStyle(!value)}
      >
        <ListTree size={13} />
        Drill-down
      </button>
      {menuOpen && value && (
        <div
          data-no-drag="true"
          onClick={(event) => event.stopPropagation()}
          style={drilldownMenuStyle}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDrillDown("all");
            }}
            style={drilldownMenuItemStyle}
          >
            Hepsi
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDrillDown("shortage");
            }}
            style={drilldownMenuItemStyle}
          >
            Tedarik ihtiyacı olanlar
          </button>
        </div>
      )}
    </div>
  );
}

function DeviceOperationPreviewPanel({ node, nodes, connections, productOptions, onDeviceSelect, onQuantityChange, onModeChange, onCustomerOrderChange, onRefresh }: {
  node: PipelineNode;
  nodes: PipelineNode[];
  connections: GraphConnection[];
  productOptions: ProductOption[];
  onDeviceSelect: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onModeChange: (mode: DeviceOperationMode) => void;
  onCustomerOrderChange: (connectionId: string, field: "deadline" | "fulfillmentMode", value: string) => void;
  onRefresh: () => void;
}) {
  const mode = normalizeDeviceOperationMode(node.deviceOperationMode);
  const plan = buildDeviceOperationPlan(node.deviceOperation, node.deviceQuantity ?? "", mode);
  const operation = node.deviceOperation;
  const selectedMode = plan.mode;
  const currentSku = resolveDeviceNodeSku(node);
  const customerOrders = collectDeviceCustomerOrders(node, nodes, connections);
  const bottleneck = operation?.bottleneck?.code
    ? `${operation.bottleneck.code}${operation.bottleneck.name ? ` · ${operation.bottleneck.name}` : ""}`
    : "-";

  return (
    <div style={deviceOperationPreviewStyle}>
      <div style={deviceOperationPreviewHeaderStyle}>
        <div>
          <div style={deviceOperationTitleStyle}>Üretim · Depo · Satış</div>
          <div style={deviceOperationSubStyle}>
            {currentSku || "Cihaz"} için gerçek mamul stok ve BOM kapasitesi
          </div>
        </div>
        <button type="button" onClick={onRefresh} disabled={!currentSku} style={previewRefreshButtonStyle(!currentSku)}>
          <RotateCcw size={13} />
          Yenile
        </button>
      </div>

      <div style={deviceOperationControlsStyle}>
        <OrderDeviceField value={currentSku} products={productOptions} onChange={onDeviceSelect} />
        <OrderField label="Sipariş adedi" value={node.deviceQuantity ?? ""} inputMode="numeric" onChange={onQuantityChange} />
        <div style={deviceOperationStatusStyle}>
          <span>Durum</span>
          <strong style={operationBadgeStyle(plan.status)}>{plan.badge}</strong>
        </div>
      </div>

      <div style={deviceCustomerPanelStyle}>
        <div style={deviceCustomerHeaderStyle}>
          <span>Müşteri / Sipariş</span>
          <strong>{customerOrders.length}</strong>
        </div>
        {customerOrders.length === 0 ? (
          <div style={deviceCustomerEmptyStyle}>Müşteri node'unu bu cihaza bağla; sipariş bağlamı burada görünür.</div>
        ) : (
          <div style={deviceCustomerListStyle}>
            {customerOrders.map(item => (
              <div key={item.connectionId} style={deviceCustomerRowStyle}>
                <strong style={deviceCustomerNameStyle}>{item.customer}</strong>
                <span>{item.quantity ? `${item.quantity} adet` : "adet -"}</span>
                <input
                  type="date"
                  value={toDateInputValue(item.deadline)}
                  onChange={(event) => onCustomerOrderChange(item.connectionId, "deadline", fromDateInputValue(event.target.value))}
                  style={deviceCustomerDateInputStyle}
                  aria-label={`${item.customer} teslim tarihi`}
                />
                <select
                  value={item.fulfillmentMode}
                  onChange={(event) => onCustomerOrderChange(item.connectionId, "fulfillmentMode", event.target.value)}
                  style={deviceCustomerModeSelectStyle}
                  aria-label={`${item.customer} karşılama modu`}
                >
                  {deviceOperationModes.map(modeItem => (
                    <option key={modeItem.mode} value={modeItem.mode}>{modeItem.label}</option>
                  ))}
                </select>
                <span style={deviceCustomerSourceStyle}>{item.source}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={previewModeGridStyle}>
        {deviceOperationModes.map(item => (
          <button
            key={item.mode}
            type="button"
            onClick={() => onModeChange(item.mode)}
            style={previewModeButtonStyle(mode === item.mode)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={deviceDecisionGridStyle}>
        <DecisionCard
          title="Depo"
          value={plan.warehouse}
          detail={`${formatCell(operation?.inWarehouse ?? 0)} mamul depoda`}
          active={selectedMode === "warehouse_sale"}
        />
        <DecisionCard
          title="Üretim"
          value={plan.production}
          detail={operation?.maxProducible === null ? "BOM kapasitesi yok" : `${formatCell(operation?.maxProducible ?? 0)} adet üretilebilir`}
          active={selectedMode === "produce_sale"}
        />
        <DecisionCard
          title="Satış"
          value={plan.sales}
          detail={plan.shortage > 0 ? `${formatCell(plan.shortage)} adet açık` : "Commit karşılanıyor"}
          active={plan.salesCommit > 0}
          tone={plan.shortage > 0 ? "critical" : "ok"}
        />
      </div>

      <div style={deviceOperationDetailGridStyle}>
        <Metric label="Seçilen mod" value={plan.title} />
        <Metric label="Sipariş adedi" value={plan.requestedQuantity ? formatCell(plan.requestedQuantity) : "-"} />
        <Metric label="Üretimde" value={formatCell(operation?.inProduction ?? 0)} />
        <Metric label="Toplam satılan" value={formatCell(operation?.totalSold ?? 0)} />
        <Metric label="Darboğaz" value={bottleneck} />
        <Metric label="Durum" value={plan.note} />
      </div>
    </div>
  );
}

function OntologyFunctionPreviewPanel({ node, nodes, connections }: { node: PipelineNode; nodes: PipelineNode[]; connections: GraphConnection[] }) {
  const context = collectOntologyContext(node, nodes, connections);
  const contextSignature = useMemo(() => JSON.stringify({
    devices: context.devices.map(device => ({
      id: device.id,
      sku: resolveDeviceNodeSku(device),
      qty: device.deviceQuantity,
      mode: device.deviceOperationMode,
      op: device.deviceOperation,
    })),
    customers: context.customers.map(customer => customer.id),
    orders: context.orders.map(order => order.id),
    bom: context.components.map(component => ({
      id: component.id,
      sku: component.bomComponent?.sku,
      status: component.bomComponent?.status,
      shortage: component.bomComponent?.stockShortage,
    })),
    procurement: context.procurements.map(procurement => ({
      id: procurement.id,
      rows: procurement.rows,
    })),
  }), [context.devices, context.customers, context.orders, context.components, context.procurements]);
  const [chartMode, setChartMode] = useState<OntologyChartMode>("fulfillment");
  const [xDimension, setXDimension] = useState<OntologyXDimension>("device");
  const [yMetrics, setYMetrics] = useState<OntologyYMetric[]>(["requested", "warehouse", "producible", "shortage"]);
  const [graphFunction, setGraphFunction] = useState<GraphFunctionResponse | null>(null);
  const [selectedGraphObjectId, setSelectedGraphObjectId] = useState<string | null>(null);
  const [semanticLayer, setSemanticLayer] = useState<SemanticLayerResponse | null>(null);
  const [semanticStatus, setSemanticStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
  const compareRows = useMemo(() => buildOntologyCompareRows(context), [contextSignature]);
  const scopeItems = useMemo(() => buildOntologyScopeItems(context), [contextSignature]);
  const scopeSignature = selectedScopeIds.join("|");
  const scopedCompareRows = useMemo(() => filterOntologyRowsByScope(compareRows, selectedScopeIds, scopeItems), [compareRows, scopeSignature, scopeItems]);
  const localChartSpec = buildOntologyChartSpec(scopedCompareRows, chartMode, xDimension, yMetrics);
  const scopedGraphRows = graphFunction ? filterOntologyRowsByScope(graphFunction.chart.rows, selectedScopeIds, scopeItems) : [];
  const activeChartSpec = graphFunction?.chart
    && scopedGraphRows.length > 0
    ? {
        ...graphFunction.chart,
        rows: scopedGraphRows,
      }
    : localChartSpec;
  const graphObjectsByDevice = useMemo(() => new Map((graphFunction?.objects ?? []).map(item => [item.decision.device, item])), [graphFunction]);
  const selectedGraphObject = graphFunction?.objects.find(item => item.id === selectedGraphObjectId) ?? null;
  function toggleScopeItem(id: string) {
    setSelectedGraphObjectId(null);
    setSelectedScopeIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }
  function clearScope() {
    setSelectedGraphObjectId(null);
    setSelectedScopeIds([]);
  }
  function selectGraphRow(row: any) {
    const objectId = String(row?.objectId || "");
    if (objectId) {
      setSelectedGraphObjectId(objectId);
      return;
    }
    const object = graphObjectsByDevice.get(String(row?.device || ""));
    setSelectedGraphObjectId(object?.id ?? null);
  }
  function changeChartMode(mode: OntologyChartMode) {
    setChartMode(mode);
    setYMetrics(defaultOntologyYMetrics(mode));
    setSelectedGraphObjectId(null);
  }
  function toggleYMetric(metric: OntologyYMetric) {
    setYMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.length === 1 ? prev : prev.filter(item => item !== metric);
      }
      return [...prev, metric].slice(-6);
    });
  }
  useEffect(() => {
    const controller = new AbortController();
    setSemanticStatus("loading");
    fetch("/api/pipeline-builder/ontology/graph-function/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        functionId: "fulfillment-risk-by-device",
        selectedNodeId: node.id,
        chartMode,
        xDimension,
        yMetrics,
        nodes,
        connections,
        filters: { scopeIds: selectedScopeIds },
      }),
      signal: controller.signal,
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("ontology graph function unavailable")))
      .then((payload: GraphFunctionResponse) => {
        if (controller.signal.aborted) return;
        setGraphFunction(payload);
        setSemanticLayer(payload.semantic);
        setSemanticStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setGraphFunction(null);
        setSemanticLayer(null);
        setSemanticStatus("fallback");
      });
    return () => controller.abort();
  }, [node.id, chartMode, xDimension, yMetrics.join("|"), contextSignature, scopeSignature]);

  return (
    <div style={ontologyPreviewStyle}>
      <div style={ontologyAnalysisShellStyle}>
        <div style={ontologyAnalysisTopStyle}>
          <div>
            <div style={ontologyEyebrowStyle}>ONTOLOGY AI</div>
            <h3 style={ontologyTitleStyle}>Ürün karşılaştırma</h3>
          </div>
          <div style={ontologyContextPillsStyle}>
            <span>{context.devices.length} cihaz</span>
            <span>{context.customers.length} müşteri</span>
            <span>{context.components.length} BOM</span>
          </div>
        </div>

        <div style={ontologyAnalysisCenterStyle}>
          <div style={ontologyWorkspaceStyle}>
            <OntologyScopePicker
              items={scopeItems}
              selectedIds={selectedScopeIds}
              onToggle={toggleScopeItem}
              onClear={clearScope}
            />
            <div style={ontologyWorkspaceToolbarStyle}>
              <div style={ontologyModeToggleGroupStyle}>
                {([
                  ["fulfillment", "Fulfillment"],
                  ["capacity", "Kapasite"],
                  ["risk", "BOM risk"],
                ] as Array<[OntologyChartMode, string]>).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeChartMode(mode)}
                    style={ontologyModeButtonStyle(chartMode === mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={ontologyDimensionPanelStyle}>
              <div style={ontologyDimensionGroupStyle}>
                <strong>Metrik</strong>
                {([
                  ["requested", "Sipariş"],
                  ["warehouse", "Depo"],
                  ["producible", "Üretilebilir"],
                  ["shortage", "Açık"],
                  ["criticalComponents", "Kritik BOM"],
                  ["warningComponents", "Düşük BOM"],
                  ["riskScore", "Risk skoru"],
                  ["totalSold", "Satılan"],
                ] as Array<[OntologyYMetric, string]>).map(([metric, label]) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => toggleYMetric(metric)}
                    style={ontologyDimensionButtonStyle(yMetrics.includes(metric))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={ontologyChartCanvasStyle}>
              {activeChartSpec.rows.length === 0 ? (
                <div style={ontologyEmptyChartStyle}>Listeden satırların yanındaki kutuları seç; seçilen birimler grafiğe eklenir.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={activeChartSpec.rows}
                    margin={{ top: 10, right: 18, bottom: 0, left: -16 }}
                    onClick={(event: any) => selectGraphRow(event?.activePayload?.[0]?.payload)}
                  >
                    <CartesianGrid stroke={CT.border} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey={activeChartSpec.xKey} stroke={CT.inkMuted} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={CT.inkMuted} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={ontologyTooltipStyle} />
                    <Legend wrapperStyle={ontologyLegendStyle} />
                    {activeChartSpec.series.map(series => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={series.label}
                        fill={series.color}
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {selectedGraphObject && (
              <GraphFunctionDrilldown object={selectedGraphObject} actions={graphFunction?.actions ?? []} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OntologyScopePicker({ items, selectedIds, onToggle, onClear }: {
  items: OntologyScopeItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const selected = new Set(selectedIds);
  const groups: Array<[OntologyScopeItem["type"], string]> = [
    ["device", "Cihaz"],
    ["customer", "Müşteri"],
    ["component", "Bileşen"],
    ["procurement", "Tedarik"],
  ];
  return (
    <div style={ontologyScopePanelStyle}>
      <div style={ontologyScopeHeaderStyle}>
        <strong>Birimler</strong>
        <span>{selectedIds.length ? `${selectedIds.length} seçili` : "Grafik için satır seç"}</span>
        <button type="button" onClick={onClear} disabled={selectedIds.length === 0} style={ontologyScopeClearStyle(selectedIds.length === 0)}>
          Temizle
        </button>
      </div>
      <div style={ontologyScopeGroupsStyle}>
        {groups.map(([type, label]) => {
          const groupItems = items.filter(item => item.type === type);
          if (groupItems.length === 0) return null;
          return (
            <div key={type} style={ontologyScopeGroupStyle}>
              <span>{label}</span>
              <div style={ontologyScopeRowsStyle}>
                {groupItems.map(item => (
                  <label
                    key={item.id}
                    title={item.detail}
                    style={ontologyScopeRowStyle(selected.has(item.id), item.tone)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => onToggle(item.id)}
                      style={ontologyScopeCheckboxStyle}
                    />
                    <span style={ontologyScopeRowLabelStyle}>{item.label}</span>
                    <span style={ontologyScopeRowDetailStyle}>{item.detail}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GraphFunctionDrilldown({ object, actions }: { object: GraphFunctionResponse["objects"][number]; actions: GraphFunctionResponse["actions"] }) {
  const decision = object.decision;
  const bomRows = (decision.bomRows ?? []).filter(row => Number(row.shortage ?? 0) > 0).slice(0, 6);
  const relatedActions = actions.filter(action => action.targetObject === object.id || action.reason?.includes(decision.device)).slice(0, 3);
  return (
    <div style={graphFunctionDrilldownStyle}>
      <div style={graphFunctionDrilldownHeaderStyle}>
        <strong>{object.title || decision.device}</strong>
        <span>{object.subtitle || decision.customer || "Müşteri yok"} · {decision.status}</span>
      </div>
      <div style={graphFunctionMetricGridStyle}>
        <Metric label="Sipariş" value={formatCell(decision.requested)} />
        <Metric label="Depo" value={formatCell(decision.warehouse)} />
        <Metric label="Üretilebilir" value={formatCell(decision.producible)} />
        <Metric label="Açık" value={formatCell(decision.fulfillmentGap)} />
      </div>
      {bomRows.length > 0 && (
        <div style={graphFunctionListStyle}>
          {bomRows.map(row => (
            <div key={String(row.code)} style={graphFunctionListRowStyle}>
              <span>{String(row.code)} · {String(row.name)}</span>
              <b>{formatCell(Number(row.shortage ?? 0))}</b>
            </div>
          ))}
        </div>
      )}
      {relatedActions.length > 0 && (
        <div style={graphFunctionListStyle}>
          {relatedActions.map(action => (
            <div key={action.id} style={graphFunctionListRowStyle}>
              <span>{action.ownerAgent}</span>
              <b>{action.label}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveryDecisionPanel({ decision }: { decision: DeliveryDecision }) {
  const tone =
    decision.status === "late" ? "late" :
    decision.status === "risk" || decision.status === "missing" ? "risk" :
    "ok";
  return (
    <section style={deliveryDecisionPanelStyle(tone)}>
      <div style={deliveryDecisionHeaderStyle}>
        <div>
          <div style={ontologyEyebrowStyle}>DELIVERY DECISION</div>
          <h4 style={deliveryDecisionTitleStyle}>{decision.label}</h4>
        </div>
        <span style={deliveryDecisionBadgeStyle(tone)}>{decision.status === "missing" ? "Bağlam eksik" : decision.label}</span>
      </div>
      <div style={deliveryDecisionSummaryStyle}>{decision.summary}</div>
      <div style={deliveryDecisionGridStyle}>
        <Metric label="Müşteri" value={decision.customer || "-"} />
        <Metric label="Cihaz" value={decision.device || "-"} />
        <Metric label="Adet" value={decision.requestedQuantity ? formatCell(decision.requestedQuantity) : "-"} />
        <Metric label="Deadline" value={formatDecisionDate(decision.deadline)} />
        <Metric label="En erken hazır" value={formatDecisionDate(decision.readyDate)} />
        <Metric label="Gecikme" value={decision.delayDays === null ? "-" : decision.delayDays > 0 ? `${decision.delayDays} gün` : "0 gün"} />
      </div>
      <div style={deliveryDecisionActionStyle}>
        <strong>{decision.bottleneck}</strong>
        <span>{decision.recommendation}</span>
      </div>
      <div style={deliveryAgentGridStyle}>
        {decision.agentFindings.map(item => (
          <div key={item.agent} style={deliveryAgentCardStyle(item.tone)}>
            <strong>{item.agent}</strong>
            <span>{item.finding}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SemanticLayerPanel({ layer, status }: { layer: SemanticLayerResponse | null; status: "idle" | "loading" | "ready" | "fallback" }) {
  const primary = layer?.decisions[0] ?? null;
  const statusLabel = primary?.status === "late" ? "Geç kalır" :
    primary?.status === "at_risk" ? "Riskli" :
    primary?.status === "missing_context" ? "Bağlam eksik" :
    primary ? "Kontrolde" :
    status === "loading" ? "Kuruluyor" : "Beklemede";
  const tone = primary?.status === "late" ? "late" :
    primary?.status === "at_risk" || primary?.status === "missing_context" ? "risk" :
    "ok";
  const kpis = layer?.kpis;
  return (
    <section style={deliveryDecisionPanelStyle(tone)}>
      <div style={deliveryDecisionHeaderStyle}>
        <div>
          <div style={ontologyEyebrowStyle}>SEMANTIC LAYER</div>
          <h4 style={deliveryDecisionTitleStyle}>Yönetim katmanı</h4>
        </div>
        <span style={deliveryDecisionBadgeStyle(tone)}>{statusLabel}</span>
      </div>

      <div style={deliveryDecisionGridStyle}>
        <Metric label="Obje tipi" value={layer ? String(layer.ontology.objectTypes.length) : "-"} />
        <Metric label="Bağ tipi" value={layer ? String(layer.ontology.linkTypes.length) : "-"} />
        <Metric label="Aksiyon tipi" value={layer ? String(layer.ontology.actionTypes.length) : "-"} />
        <Metric label="Karar" value={kpis ? String(kpis.decisions) : "-"} />
        <Metric label="Riskli karar" value={kpis ? String(kpis.riskyDecisions) : "-"} />
        <Metric label="Stage aksiyon" value={kpis ? String(kpis.stagedActions) : "-"} />
      </div>

      <div style={semanticLayerBodyStyle}>
        <div style={semanticLayerColumnStyle}>
          <strong>Decision queue</strong>
          {(layer?.decisions.length ? layer.decisions : []).slice(0, 4).map(decision => (
            <div key={decision.id} style={semanticDecisionRowStyle(decision.status)}>
              <span>{decision.customer || "Müşteri"} / {decision.device}</span>
              <b>{decision.shortageCount} BOM açık · {decision.linkedProcurementCount} tedarik linki</b>
            </div>
          ))}
          {!layer?.decisions.length && <span style={semanticMutedTextStyle}>Cihaz bağlanınca backend karar kuyruğu oluşur.</span>}
        </div>
        <div style={semanticLayerColumnStyle}>
          <strong>Action queue</strong>
          {(layer?.actionQueue.length ? layer.actionQueue : []).slice(0, 4).map(action => (
            <div key={action.id} style={semanticActionRowStyle}>
              <span>{action.ownerAgent}</span>
              <b>{action.label}</b>
            </div>
          ))}
          {!layer?.actionQueue.length && <span style={semanticMutedTextStyle}>İnsan onayına gidecek aksiyon yok.</span>}
        </div>
      </div>
    </section>
  );
}

function buildOntologyScopeItems(context: ReturnType<typeof collectOntologyContext>): OntologyScopeItem[] {
  const deviceItems = context.devices.map(device => {
    const plan = buildDeviceOperationPlan(device.deviceOperation, device.deviceQuantity ?? "", normalizeDeviceOperationMode(device.deviceOperationMode));
    const sku = resolveDeviceNodeSku(device) || device.title;
    return {
      id: device.id,
      type: "device" as const,
      label: sku,
      detail: plan.shortage > 0 ? `${formatCell(plan.shortage)} açık` : "Cihaz kapsamı",
      tone: plan.shortage > 0 ? "risk" as const : "ok" as const,
    };
  });
  const customerItems = context.customers.map(customer => ({
    id: customer.id,
    type: "customer" as const,
    label: customer.semanticLabel || customer.title,
    detail: "Müşteri kapsamı",
    tone: "neutral" as const,
  }));
  const componentItems = context.components.map(component => {
    const meta = component.bomComponent;
    const shortage = Number(meta?.stockShortage ?? 0);
    return {
      id: component.id,
      type: "component" as const,
      label: String(meta?.code || component.title),
      detail: String(meta?.name || component.subtitle || "BOM bileşeni"),
      tone: shortage > 0 || meta?.status === "critical" ? "risk" as const : "neutral" as const,
    };
  });
  const procurementItems = context.procurements.map(procurement => ({
    id: procurement.id,
    type: "procurement" as const,
    label: procurement.title,
    detail: `${procurement.rows.length} tedarik satırı`,
    tone: "neutral" as const,
  }));
  return [...deviceItems, ...customerItems, ...componentItems, ...procurementItems];
}

function filterOntologyRowsByScope<T extends Record<string, any>>(rows: T[], selectedScopeIds: string[], scopeItems: OntologyScopeItem[]) {
  if (selectedScopeIds.length === 0) {
    return [];
  }
  const selected = new Set(selectedScopeIds);
  const selectedLabels = new Set(scopeItems.filter(item => selected.has(item.id)).map(item => item.label));
  return rows.filter(row => {
    const objectId = String(row.objectId || "");
    if (selected.has(objectId)) return true;
    if (objectId.startsWith("decision:") && selected.has(objectId.replace(/^decision:/, ""))) return true;
    if (selectedLabels.has(String(row.customer || ""))) return true;
    if (selectedLabels.has(String(row.device || ""))) return true;
    return false;
  });
}

function buildOntologyCompareRows(context: ReturnType<typeof collectOntologyContext>) {
  const deviceRows = context.devices.map(device => {
    const sku = resolveDeviceNodeSku(device) || device.title;
    const relatedOrders = context.orders.filter(order => {
      const fields: any = order.orderLineFields || order.orderFields;
      const orderDevice = String(fields?.deviceType || "");
      return !orderDevice || orderDevice === sku || context.orders.length === 1;
    });
    const firstOrder: any = relatedOrders[0]?.orderLineFields || relatedOrders[0]?.orderFields;
    const plan = buildDeviceOperationPlan(device.deviceOperation, device.deviceQuantity ?? "", normalizeDeviceOperationMode(device.deviceOperationMode));
    const relatedComponents = context.components.filter(component => component.bomComponent?.sku === sku);
    const criticalComponents = relatedComponents.filter(component => component.bomComponent?.status === "critical").length;
    const warningComponents = relatedComponents.filter(component => component.bomComponent?.status === "warning").length;
    const requested = Number(device.deviceQuantity || plan.requestedQuantity || 0);
    const warehouse = device.deviceOperation?.inWarehouse ?? 0;
    const producible = device.deviceOperation?.maxProducible ?? 0;
    const totalSold = device.deviceOperation?.totalSold ?? 0;
    const shortage = plan.shortage;
    const riskScore = Math.max(0, shortage) + criticalComponents * 25 + warningComponents * 10;
    return {
      objectId: device.id,
      rowKind: "device",
      device: sku,
      customer: firstOrder?.customer || "Müşteri yok",
      deadline: firstOrder?.deadline || "Deadline yok",
      riskTier: riskScore > 75 ? "Kritik" : riskScore > 0 ? "Riskli" : "Sağlıklı",
      requested,
      warehouse,
      producible,
      totalSold,
      shortage,
      criticalComponents,
      warningComponents,
      riskScore,
    };
  });
  const componentRows = context.components.map(componentNode => {
    const component = componentNode.bomComponent;
    const code = String(component?.code || componentNode.title || componentNode.id);
    const status = String(component?.status || "ok");
    const shortage = Math.max(0, Number(component?.stockShortage ?? 0));
    return {
      objectId: componentNode.id,
      rowKind: "component",
      device: code,
      customer: String(component?.sku || componentNode.semanticLabel || "BOM"),
      deadline: component?.tier === null || component?.tier === undefined ? "BOM" : `Tier ${component.tier}`,
      riskTier: status === "critical" ? "Kritik BOM" : status === "warning" ? "Düşük BOM" : "BOM",
      requested: Number(component?.requiredForOrder ?? component?.orderQuantity ?? component?.requiredPerUnit ?? 0),
      warehouse: Number(component?.currentStock ?? 0),
      producible: component?.maxProducts === null ? 0 : Number(component?.maxProducts ?? 0),
      totalSold: 0,
      shortage,
      criticalComponents: status === "critical" ? 1 : 0,
      warningComponents: status === "warning" ? 1 : 0,
      riskScore: shortage + (status === "critical" ? 25 : status === "warning" ? 10 : 0),
    };
  });
  const procurementRows = context.procurements.map(procurement => {
    const planned = procurement.rows.reduce((sum, row) => sum + Number(row.planned_quantity ?? row.quantity ?? row.miktar ?? 0), 0);
    const shortage = procurement.rows.reduce((sum, row) => sum + Number(row.shortage ?? row.eksik ?? 0), 0);
    const supplier = String(procurement.procurementFields?.supplier || procurement.rows[0]?.supplier || procurement.rows[0]?.tedarikci || "Tedarik");
    return {
      objectId: procurement.id,
      rowKind: "procurement",
      device: procurement.title,
      customer: supplier,
      deadline: procurement.procurementFields?.eta || procurement.rows[0]?.eta || "ETA yok",
      riskTier: shortage > 0 ? "Tedarik açığı" : "Tedarik",
      requested: planned,
      warehouse: 0,
      producible: planned,
      totalSold: 0,
      shortage,
      criticalComponents: shortage > 0 ? 1 : 0,
      warningComponents: 0,
      riskScore: shortage,
    };
  });
  return deviceRows.concat(componentRows, procurementRows);
}

function defaultOntologyYMetrics(mode: OntologyChartMode): OntologyYMetric[] {
  if (mode === "risk") return ["criticalComponents", "warningComponents", "shortage", "riskScore"];
  if (mode === "capacity") return ["warehouse", "producible", "totalSold"];
  return ["requested", "warehouse", "producible", "shortage"];
}

function buildOntologyDeliveryDecision(
  context: ReturnType<typeof collectOntologyContext>,
  nodes: PipelineNode[],
  connections: GraphConnection[],
): DeliveryDecision {
  if (context.devices.length === 0) {
    return {
      status: "missing",
      label: "Bağlam eksik",
      customer: "",
      device: "",
      requestedQuantity: 0,
      deadline: "",
      readyDate: "",
      delayDays: null,
      bottleneck: "Cihaz bağlantısı yok",
      recommendation: "Müşteri node'unu cihaz node'una bağla; adet ve deadline cihaz panelinde görünsün.",
      summary: "Teslim kararı üretmek için en az bir müşteri-cihaz bağlantısı gerekli.",
      agentFindings: [
        { agent: "Data agent", finding: "Müşteri-cihaz ilişkisi bekleniyor.", tone: "risk" },
        { agent: "Logic agent", finding: "Kapasite ve tedarik hesabı henüz çalışamaz.", tone: "risk" },
        { agent: "Action agent", finding: "Aksiyon staging kapalı.", tone: "risk" },
      ],
    };
  }

  const deviceDecisions = context.devices.map(device => buildDeviceDeliveryDecision(device, context, nodes, connections));
  return deviceDecisions.sort((a, b) => deliverySeverity(b) - deliverySeverity(a))[0] ?? deviceDecisions[0];
}

function buildDeviceDeliveryDecision(
  device: PipelineNode,
  context: ReturnType<typeof collectOntologyContext>,
  nodes: PipelineNode[],
  connections: GraphConnection[],
): DeliveryDecision {
  const sku = resolveDeviceNodeSku(device) || device.title;
  const orders = collectDeviceCustomerOrders(device, nodes, connections);
  const order = orders[0] ?? null;
  const requestedQuantity = parsePositiveQuantity(device.deviceQuantity || order?.quantity || "") ?? 0;
  const deadline = order?.deadline ?? "";
  const plan = buildDeviceOperationPlan(device.deviceOperation, String(requestedQuantity || device.deviceQuantity || ""), normalizeDeviceOperationMode(order?.fulfillmentMode || device.deviceOperationMode));
  const relatedComponents = context.components
    .filter(component => component.bomComponent?.sku === sku)
    .map(component => ({ node: component, meta: normalizeBomDecisionMeta(component.bomComponent!, requestedQuantity) }))
    .filter(item => item.meta.isInsufficient || (item.meta.stockShortage ?? 0) > 0);
  const procurementByCode = buildProcurementRowsByComponent(context.procurements, relatedComponents.map(item => item.node), connections);
  const shortageRows = relatedComponents.map(({ meta }) => {
    const procurement = procurementByCode.get(meta.code) ?? null;
    const readyDate = String(procurement?.ready_date || procurement?.eta || "");
    const slackDays = parseNullableNumber(procurement?.slack_days);
    const deadlineDate = parseIsoDate(deadline);
    const derivedReadyDate = !readyDate && deadlineDate && slackDays !== null ? formatIsoDate(addDays(deadlineDate, -slackDays)) : readyDate;
    const shortageQty = meta.stockShortage ?? 0;
    return {
      meta,
      procurement,
      readyDate: derivedReadyDate,
      slackDays,
      shortageQty,
    };
  });
  const datedShortages = shortageRows.filter(row => row.readyDate);
  const latestReadyDate = datedShortages
    .map(row => row.readyDate)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? "";
  const delayDays = deadline && latestReadyDate ? diffIsoDays(latestReadyDate, deadline) : null;
  const missingProcurement = shortageRows.filter(row => !row.procurement).length;
  const missingReadyDate = shortageRows.filter(row => row.procurement && !row.readyDate).length;
  const worstShortage = shortageRows
    .sort((a, b) => {
      const aDelay = a.readyDate && deadline ? diffIsoDays(a.readyDate, deadline) : a.shortageQty;
      const bDelay = b.readyDate && deadline ? diffIsoDays(b.readyDate, deadline) : b.shortageQty;
      return bDelay - aDelay;
    })[0] ?? null;
  const deviceShortage = plan.shortage > 0;
  const status: DeliveryDecision["status"] =
    !deadline ? "missing" :
    delayDays !== null && delayDays > 0 ? "late" :
    missingProcurement > 0 || missingReadyDate > 0 || deviceShortage || shortageRows.length > 0 || (delayDays !== null && delayDays <= 3 && shortageRows.length > 0) ? "risk" :
    "ontime";
  const label =
    status === "late" ? "Geç kalır" :
    status === "risk" ? "Riskli" :
    status === "missing" ? "Bağlam eksik" :
    "Zamanında";
  const bottleneck = worstShortage
    ? `${worstShortage.meta.code} ${worstShortage.meta.name}`
    : device.deviceOperation?.bottleneck?.code
      ? `${device.deviceOperation.bottleneck.code} ${device.deviceOperation.bottleneck.name ?? ""}`.trim()
      : "Darboğaz görünmüyor";
  const recommendation =
    status === "late"
      ? `${bottleneck} için expedite aç veya ${sku} sevkiyatını iki partiye böl.`
      : status === "risk"
        ? missingProcurement > 0
          ? `${missingProcurement} tedarik ihtiyacı procurement node'una bağlı değil; karar güveni eksik.`
          : missingReadyDate > 0
            ? `${missingReadyDate} tedarik satırı için ready date/ETA tamamla.`
          : `${sku} için tedarik tamponunu koru; kritik bileşen ready date'lerini takip et.`
        : status === "missing"
          ? "Deadline ve müşteri-cihaz context'ini tamamla."
          : `${sku} mevcut graph'a göre teslim tarihine yetişiyor.`;
  const readyDate = latestReadyDate || (status === "ontime" ? deadline : "");
  const summary =
    status === "late"
      ? `${order?.customer ?? "Müşteri"} / ${sku}: en erken hazır tarih deadline'dan ${delayDays} gün sonra.`
      : status === "risk"
        ? `${order?.customer ?? "Müşteri"} / ${sku}: ${shortageRows.length} eksik bileşen, ${shortageRows.length - missingProcurement} bağlı tedarik satırı, ${missingReadyDate} eksik ready date.`
        : status === "missing"
          ? `${sku}: teslim kararı için deadline veya tedarik bağlamı eksik.`
          : `${order?.customer ?? "Müşteri"} / ${sku}: mevcut kapasite ve tedarik tarihleriyle zamanında.`;
  return {
    status,
    label,
    customer: order?.customer ?? "",
    device: sku,
    requestedQuantity,
    deadline,
    readyDate,
    delayDays,
    bottleneck,
    recommendation,
    summary,
    agentFindings: [
      {
        agent: "Fulfillment agent",
        finding: plan.shortage > 0 ? `${formatCell(plan.shortage)} adet açık var.` : "Depo/üretim commit'i okunuyor.",
        tone: plan.shortage > 0 ? "risk" : "ok",
      },
      {
        agent: "Supply agent",
        finding: shortageRows.length > 0
          ? `${shortageRows.length} eksik bileşen, ${shortageRows.length - missingProcurement} tedarik bağlantısı.`
          : "Kritik tedarik açığı görünmüyor.",
        tone: shortageRows.length > 0 ? "risk" : "ok",
      },
      {
        agent: "Action agent",
        finding: status === "late" ? "Expedite veya kısmi sevk stage edilmeli." : "Writeback yok; öneri insan onayında.",
        tone: status === "late" ? "late" : status === "risk" ? "risk" : "ok",
      },
    ],
  };
}

function deliverySeverity(decision: DeliveryDecision) {
  if (decision.status === "late") return 4 + Math.max(0, decision.delayDays ?? 0) / 100;
  if (decision.status === "risk") return 3;
  if (decision.status === "missing") return 2;
  return 1;
}

function normalizeBomDecisionMeta(meta: BomComponentNodeMeta, requestedQuantity: number): BomComponentNodeMeta {
  const quantity = requestedQuantity || meta.orderQuantity;
  const next = applyOrderRiskToBomMeta(meta, quantity);
  const requiredForOrder = next.requiredForOrder ?? (next.requiredPerUnit !== null && quantity ? next.requiredPerUnit * quantity : null);
  const stockShortage = requiredForOrder === null || next.currentStock === null
    ? next.stockShortage
    : Math.max(0, requiredForOrder - next.currentStock);
  const capacityInsufficient = next.maxProducts !== null && quantity !== null && next.maxProducts < quantity;
  return {
    ...next,
    orderQuantity: quantity,
    requiredForOrder,
    stockShortage,
    isInsufficient: capacityInsufficient || (stockShortage !== null && stockShortage > 0),
  };
}

function buildProcurementRowsByComponent(
  procurementNodes: PipelineNode[],
  componentNodes: PipelineNode[],
  connections: GraphConnection[],
) {
  const procurementById = new Map(procurementNodes.map(node => [node.id, node]));
  const rowsByCode = new Map<string, Record<string, any>>();

  componentNodes.forEach(component => {
    const code = component.bomComponent?.code;
    if (!code) return;
    const directConnection = connections.find(connection => (
      connection.from === component.id
      && connection.contract?.relation === "component_procurement"
      && procurementById.has(connection.to)
    ));
    const directProcurement = directConnection ? procurementById.get(directConnection.to) : null;
    const directRow = directProcurement?.rows.find(row => String(row.component_code) === code);
    if (directRow) {
      rowsByCode.set(code, directRow);
      return;
    }
    const fallbackRow = procurementNodes
      .flatMap(node => node.rows)
      .find(row => String(row.component_code) === code);
    if (fallbackRow) rowsByCode.set(code, fallbackRow);
  });

  return rowsByCode;
}

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function diffIsoDays(left: string, right: string) {
  const leftDate = parseIsoDate(left);
  const rightDate = parseIsoDate(right);
  if (!leftDate || !rightDate) return 0;
  return diffDays(leftDate, rightDate);
}

function formatDecisionDate(value: string) {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function buildOntologyChartSpec(
  rows: ReturnType<typeof buildOntologyCompareRows>,
  mode: OntologyChartMode,
  xDimension: OntologyXDimension,
  yMetrics: OntologyYMetric[],
) {
  const palette = {
    warehouse: CT.info,
    producible: CT.ok,
    requested: CT.accent,
    shortage: CT.err,
    critical: "#8f332b",
    warning: CT.warn,
    sold: "#6f6258",
  };
  const catalog: Record<OntologyYMetric, { key: OntologyYMetric; label: string; color: string }> = {
    requested: { key: "requested", label: "Sipariş", color: palette.requested },
    warehouse: { key: "warehouse", label: "Depo", color: palette.warehouse },
    producible: { key: "producible", label: "Üretilebilir", color: palette.producible },
    shortage: { key: "shortage", label: "Açık", color: palette.shortage },
    criticalComponents: { key: "criticalComponents", label: "Kritik BOM", color: palette.critical },
    warningComponents: { key: "warningComponents", label: "Düşük BOM", color: palette.warning },
    riskScore: { key: "riskScore", label: "Risk skoru", color: CT.accent },
    totalSold: { key: "totalSold", label: "Satılan", color: palette.sold },
  };
  const activeMetrics = yMetrics.length > 0 ? yMetrics : defaultOntologyYMetrics(mode);
  const groupedRows = aggregateOntologyRows(rows, xDimension, activeMetrics);
  const series = activeMetrics.map(metric => catalog[metric]).filter(Boolean);
  return {
    kind: "bar" as const,
    xKey: xDimension,
    rows: groupedRows,
    series,
  };
}

function aggregateOntologyRows(
  rows: ReturnType<typeof buildOntologyCompareRows>,
  xDimension: OntologyXDimension,
  metrics: OntologyYMetric[],
) {
  const grouped = new Map<string, Record<string, any>>();
  rows.forEach(row => {
    const key = String(row[xDimension] || "Belirsiz");
    const existing = grouped.get(key) ?? { [xDimension]: key };
    metrics.forEach(metric => {
      existing[metric] = Number(existing[metric] ?? 0) + Number(row[metric] ?? 0);
    });
    grouped.set(key, existing);
  });
  return Array.from(grouped.values());
}

function collectOntologyContext(node: PipelineNode, nodes: PipelineNode[], connections: GraphConnection[]) {
  const byId = new Map(nodes.map(item => [item.id, item]));
  const upstreamIds = new Set<string>();
  const walk = (targetId: string) => {
    connections
      .filter(connection => connection.to === targetId)
      .forEach(connection => {
        if (upstreamIds.has(connection.from)) return;
        upstreamIds.add(connection.from);
        walk(connection.from);
      });
  };
  walk(node.id);
  const connected = Array.from(upstreamIds).map(id => byId.get(id)).filter((item): item is PipelineNode => Boolean(item));
  const customers = connected.filter(item => item.semanticRole === "customer");
  const devices = connected.filter(item => item.semanticRole === "device");
  const components = connected.filter(item => item.kind === "component" || item.bomComponent);
  const procurements = connected.filter(item => item.semanticRole === "procurement");
  const visibleOrders = connected.filter(item => item.semanticRole === "order" || item.semanticRole === "orderLine");
  const implicitOrders: PipelineNode[] = connections.filter(connection => (
    connection.contract?.relation === "customer_device"
    && upstreamIds.has(connection.from)
    && upstreamIds.has(connection.to)
  )).map((connection, index) => ({
    id: `implicit-order-${index}`,
    kind: "dataset" as const,
    title: "Sipariş",
    subtitle: "Müşteri → Cihaz hidden orderLine",
    x: 0,
    y: 0,
    rows: [],
    columns: [],
    semanticRole: "orderLine" as const,
    orderLineFields: {
      customer: connection.contract?.internal?.fields.customer || connection.contract?.context.customer || "",
      deviceType: connection.contract?.internal?.fields.deviceType || connection.contract?.context.device || "",
      quantity: connection.contract?.internal?.fields.quantity || connection.contract?.context.quantity || "",
      deadline: connection.contract?.internal?.fields.deadline || connection.contract?.context.deadline || "",
    },
  }));
  const orders: PipelineNode[] = [
    ...visibleOrders,
    ...implicitOrders,
  ];
  const criticalComponents = components.filter(item => item.bomComponent?.status === "critical").length;
  const shortageDevices = devices.filter(item => {
    const plan = buildDeviceOperationPlan(item.deviceOperation, item.deviceQuantity ?? "", normalizeDeviceOperationMode(item.deviceOperationMode));
    return plan.shortage > 0;
  });
  const riskTone: "critical" | "ok" | "idle" = criticalComponents > 0 || shortageDevices.length > 0 ? "critical" : devices.length > 0 ? "ok" : "idle";
  const headline = devices.length === 0
    ? "Henüz analiz edilecek cihaz bağlı değil."
    : riskTone === "critical"
      ? `${shortageDevices.length + criticalComponents} risk sinyali bulundu.`
      : `${devices.length} cihaz için operasyon planı okunabilir.`;
  const note = orders.length > 0
    ? "Sipariş bağlamı da grafiğe dahil edilecek."
    : devices.length > 0
      ? "Sipariş bağlanırsa teslim tarihi ve fulfillment kararı da hesaba katılır."
      : "Cihaz, sipariş veya BOM node'larını bu kutuya bağla.";
  return { connected, customers, devices, components, procurements, orders, criticalComponents, shortageDevices, riskTone, headline, note };
}

function DecisionCard({ title, value, detail, active, tone = "neutral" }: {
  title: string;
  value: string;
  detail: string;
  active: boolean;
  tone?: "neutral" | "ok" | "critical";
}) {
  const border = tone === "critical"
    ? "rgba(178,34,34,0.28)"
    : tone === "ok"
      ? "rgba(63,143,91,0.30)"
      : active
        ? CT.accentEdge
        : CT.border;
  return (
    <div style={{ ...decisionCardStyle, borderColor: border, background: active ? "#fbfbf8" : "#f6f6f2" }}>
      <span style={decisionCardLabelStyle}>{title}</span>
      <strong style={decisionCardValueStyle}>{value}</strong>
      <span style={decisionCardDetailStyle}>{detail}</span>
    </div>
  );
}

function collectDeviceCustomerOrders(device: PipelineNode, nodes: PipelineNode[], connections: GraphConnection[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return connections.flatMap(connection => {
    if (connection.to !== device.id) return [];
    const source = byId.get(connection.from);
    const relation = connection.contract?.relation;
    if (relation === "customer_device" && source?.semanticRole === "customer") {
      return [{
        connectionId: connectionKey(connection),
        customer: connection.contract?.context.customer || source.semanticLabel || source.title,
        quantity: device.deviceQuantity || connection.contract?.context.quantity || "",
        deadline: connection.contract?.context.deadline || "",
        fulfillmentMode: normalizeDeviceOperationMode(connection.contract?.context.fulfillmentMode || device.deviceOperationMode),
        source: "Müşteri → Cihaz",
      }];
    }
    if (relation === "order_device" && source?.semanticRole === "order") {
      return [{
        connectionId: connectionKey(connection),
        customer: connection.contract?.context.customer || source.orderFields?.customer || source.semanticLabel || source.title,
        quantity: device.deviceQuantity || connection.contract?.context.quantity || "",
        deadline: connection.contract?.context.deadline || source.orderFields?.deadline || "",
        fulfillmentMode: normalizeDeviceOperationMode(connection.contract?.context.fulfillmentMode || device.deviceOperationMode),
        source: "Sipariş → Cihaz",
      }];
    }
    return [];
  });
}

function toDateInputValue(value: string) {
  const clean = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function fromDateInputValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
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
      {meta.orderQuantity !== null && <Metric label="Sipariş adedi" value={formatCell(meta.orderQuantity)} />}
      {meta.isInsufficient && <Metric label="Eksik" value={meta.stockShortage === null ? "Yetersiz" : `${formatCell(meta.stockShortage)} ${meta.unit}`} />}
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

function filterBomComponentsForDrilldown(
  components: BomStockComponent[],
  quantity: string | number | null | undefined,
  mode: DeviceDrilldownMode,
): BomStockComponent[] {
  if (mode === "all") return components;
  return components.flatMap(component => {
    const filteredChildren = filterBomComponentsForDrilldown(component.children ?? [], quantity, mode);
    const ownNeed = componentNeedsProcurement(component, quantity);
    if (!ownNeed && filteredChildren.length === 0) return [];
    return [{
      ...component,
      children: filteredChildren,
      isSubAssembly: Boolean(component.isSubAssembly || filteredChildren.length > 0),
    }];
  });
}

function componentNeedsProcurement(component: BomStockComponent, quantity: string | number | null | undefined) {
  const meta = applyOrderRiskToBomMeta({
    sku: "",
    code: component.code,
    name: component.name,
    requiredPerUnit: component.requiredPerUnit ?? null,
    unit: component.unit,
    tier: component.tier,
    currentStock: component.currentStock ?? null,
    maxProducts: component.maxProducts ?? null,
    status: component.status,
    isSubAssembly: Boolean(component.isSubAssembly || (component.children?.length ?? 0) > 0),
    parentComponentCode: component.parentComponentCode ?? null,
    orderQuantity: null,
    requiredForOrder: null,
    stockShortage: null,
    isInsufficient: false,
  }, quantity);
  return meta.isInsufficient;
}

function buildBomDrilldownNodes(source: PipelineNode, sku: string, components: BomStockComponent[]) {
  const nodes: PipelineNode[] = [];
  const connections: GraphConnection[] = [];
  const rootX = source.x + nodeWidth(source.kind) + 76;
  const rowsPerColumn = 10;
  const rowStep = 54;
  const columnStep = 182;
  const centerY = source.y + effectiveNodeHeight(source) / 2 - nodeHeight("component") / 2;
  const minY = 116;
  const sortedComponents = [...components].sort((a, b) => String(a.code).localeCompare(String(b.code), "tr"));
  const leafComponents = sortedComponents.filter(component => (component.children?.length ?? 0) === 0);
  const subAssemblyComponents = sortedComponents.filter(component => (component.children?.length ?? 0) > 0);
  const leafColumnCount = Math.max(1, Math.ceil(leafComponents.length / rowsPerColumn));
  const subAssemblyColumn = leafColumnCount;
  const orderedComponents = [...leafComponents, ...subAssemblyComponents];
  let childLaneOffset = 0;

  orderedComponents.forEach((component, index) => {
    const isSubAssembly = (component.children?.length ?? 0) > 0;
    const localIndex = isSubAssembly ? index - leafComponents.length : index;
    const column = isSubAssembly ? subAssemblyColumn : Math.floor(localIndex / rowsPerColumn);
    const row = isSubAssembly ? localIndex : localIndex % rowsPerColumn;
    const columnSize = isSubAssembly
      ? subAssemblyComponents.length
      : Math.min(rowsPerColumn, leafComponents.length - column * rowsPerColumn);
    const x = rootX + column * columnStep + (isSubAssembly ? 28 : 0);
    const y = layoutColumnY(row, columnSize, centerY, rowStep, minY);
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
      const childColumnCount = Math.max(1, Math.ceil((component.children?.length ?? 0) / 6));
      const childRootX = node.x + nodeWidth(node.kind) + 44 + childLaneOffset * columnStep;
      const childGraph = buildBomChildDrilldownNodes(node, component.children ?? [], childRootX);
      nodes.push(...childGraph.nodes);
      connections.push(...childGraph.connections);
      childLaneOffset += childColumnCount;
    }
  });

  return { nodes, connections };
}

function buildBomChildDrilldownNodes(parentNode: PipelineNode, children: BomStockComponent[], rootXOverride?: number) {
  const nodes: PipelineNode[] = [];
  const connections: GraphConnection[] = [];
  const rowsPerColumn = 6;
  const rowStep = 54;
  const columnStep = 182;
  const rootX = rootXOverride ?? parentNode.x + nodeWidth(parentNode.kind) + 22;
  const centerY = parentNode.y + effectiveNodeHeight(parentNode) / 2 - nodeHeight("component") / 2;
  const minY = 116;

  children.forEach((child, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const rowsInColumn = Math.min(rowsPerColumn, children.length - column * rowsPerColumn);
    const node = buildBomComponentNode({
      source: parentNode,
      sku: parentNode.bomComponent?.sku ?? child.parentComponentCode ?? "",
      component: child,
      x: rootX + column * columnStep,
      y: layoutColumnY(row, rowsInColumn, centerY, rowStep, minY),
      parentId: parentNode.id,
      order: `${parentNode.id}-${index + 1}`,
    });
    nodes.push(node);
    connections.push({ from: parentNode.id, to: node.id, kind: "drilldown", scope: "subassembly_component" });
  });

  return { nodes, connections };
}

function layoutColumnY(row: number, rowCount: number, centerY: number, rowStep: number, minY: number) {
  const columnTop = Math.max(minY, centerY - ((rowCount - 1) / 2) * rowStep);
  return Math.round(columnTop + row * rowStep);
}

function placeBomDrilldownBelowOpenGraphs(
  generated: { nodes: PipelineNode[]; connections: GraphConnection[] },
  existingNodes: PipelineNode[],
) {
  if (generated.nodes.length === 0) return generated;
  const rowGap = 96;
  let yOffset = 0;

  for (let attempt = 0; attempt < 18; attempt++) {
    const shiftedNodes = yOffset === 0
      ? generated.nodes
      : generated.nodes.map(node => ({ ...node, y: node.y + yOffset }));
    const overlaps = shiftedNodes.some(node => existingNodes.some(existing => rectanglesOverlap(
      { x: node.x, y: node.y, width: nodeWidth(node.kind), height: effectiveNodeHeight(node) },
      { x: existing.x, y: existing.y, width: nodeWidth(existing.kind), height: effectiveNodeHeight(existing) },
    )));
    if (!overlaps) {
      return yOffset === 0 ? generated : { ...generated, nodes: shiftedNodes };
    }
    yOffset += rowGap;
  }

  return {
    ...generated,
    nodes: generated.nodes.map(node => ({ ...node, y: node.y + yOffset })),
  };
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
  const meta = applyOrderRiskToBomMeta({
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
    orderQuantity: null,
    requiredForOrder: null,
    stockShortage: null,
    isInsufficient: false,
  }, source.deviceQuantity);
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
    order_quantity: meta.orderQuantity,
    required_for_order: meta.requiredForOrder,
    stock_shortage: meta.stockShortage,
    semantic_warning: meta.isInsufficient ? "insufficient_stock" : null,
  };
}

function refreshAllDeviceOrderRisks(nodes: PipelineNode[]) {
  return nodes.reduce((current, node) => {
    if (node.semanticRole !== "device") return current;
    return refreshDeviceOrderRisk(current, node.id, node.deviceQuantity ?? "");
  }, nodes);
}

function refreshProcurementNeedTables(nodes: PipelineNode[], connections: GraphConnection[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const procurementConnections = connections.filter(connection => connection.contract?.relation === "component_procurement");
  const connectionCountByProcurement = procurementConnections.reduce<Map<string, number>>((counts, connection) => {
    counts.set(connection.to, (counts.get(connection.to) ?? 0) + 1);
    return counts;
  }, new Map());
  const needsByProcurement = new Map<string, Array<Record<string, any>>>();

  procurementConnections.forEach(connection => {
    const source = byId.get(connection.from);
    const target = byId.get(connection.to);
    if (!source?.bomComponent || target?.semanticRole !== "procurement") return;
    const meta = source.bomComponent;
    const orderDeadline = findOrderDeadlineForBomSource(source, byId, connections);
    const defaultQuantity = meta.stockShortage === null ? "" : String(Math.ceil(meta.stockShortage));
    const override = target.procurementOverrides?.[meta.code] ?? {};
    const plannedQuantity = connectionCountByProcurement.get(connection.to) === 1
      ? (override.plannedQuantity ?? target.procurementFields?.quantity ?? defaultQuantity)
      : override.plannedQuantity ?? defaultQuantity;
    const eta = override.eta ?? target.procurementFields?.eta ?? "";
    const inboundBufferDays = override.inboundBufferDays ?? target.procurementFields?.inboundBufferDays ?? "1";
    const productionLeadDays = override.productionLeadDays ?? target.procurementFields?.productionLeadDays ?? "5";
    const schedule = buildProcurementSchedule(eta, orderDeadline, inboundBufferDays, productionLeadDays);
    const row = {
      component_code: meta.code,
      component_name: meta.name,
      shortage: meta.stockShortage,
      unit: meta.unit,
      order_quantity: meta.orderQuantity,
      required_for_order: meta.requiredForOrder,
      available_stock: meta.currentStock,
      planned_quantity: plannedQuantity,
      supplier: override.supplier ?? target.procurementFields?.supplier ?? "",
      eta,
      inbound_buffer_days: inboundBufferDays,
      production_lead_days: productionLeadDays,
      ready_date: schedule.readyDate,
      order_deadline: orderDeadline,
      slack_days: schedule.slackDays,
      schedule_status: schedule.status,
      schedule_message: schedule.message,
      status: override.status ?? target.procurementFields?.status ?? "planned",
    };
    needsByProcurement.set(connection.to, [...(needsByProcurement.get(connection.to) ?? []), row]);
  });

  return nodes.map(node => {
    if (node.semanticRole !== "procurement") return node;
    const rows = needsByProcurement.get(node.id) ?? [];
    if (rows.length === 0) return node;
    return {
      ...node,
      rows,
      columns: collectColumns(rows),
      subtitle: `${rows.length} bağlı tedarik ihtiyacı`,
    };
  });
}

function findOrderDeadlineForBomSource(
  source: PipelineNode,
  byId: Map<string, PipelineNode>,
  connections: GraphConnection[],
) {
  const rootDeviceId = findRootDeviceNodeId(source, byId);
  if (!rootDeviceId) return "";
  const orderConnection = connections.find(connection => (
    connection.to === rootDeviceId
    && connection.contract?.relation === "order_device"
  ));
  const orderNode = orderConnection ? byId.get(orderConnection.from) : null;
  return orderNode?.orderFields?.deadline
    || orderConnection?.contract?.context.deadline
    || orderConnection?.contract?.internal?.fields.deadline
    || "";
}

function findRootDeviceNodeId(source: PipelineNode, byId: Map<string, PipelineNode>) {
  let cursor: PipelineNode | undefined = source;
  for (let depth = 0; cursor && depth < 12; depth++) {
    if (cursor.semanticRole === "device") return cursor.id;
    if (!cursor.drilldownParentId) return "";
    cursor = byId.get(cursor.drilldownParentId);
  }
  return "";
}

function buildProcurementSchedule(
  eta: string,
  orderDeadline: string,
  inboundBufferDays: string,
  productionLeadDays: string,
) {
  const etaDate = parseIsoDate(eta);
  const deadlineDate = parseIsoDate(orderDeadline);
  const buffer = parseNonNegativeDays(inboundBufferDays);
  const production = parseNonNegativeDays(productionLeadDays);
  if (!etaDate || !deadlineDate) {
    return { readyDate: "", slackDays: "", status: "pending", message: "ETA veya sipariş tarihi eksik" };
  }
  const ready = addDays(etaDate, buffer + production);
  const slack = diffDays(deadlineDate, ready);
  const status = slack < 0 ? "late" : slack <= 2 ? "risk" : "ok";
  const message = status === "late"
    ? `${Math.abs(slack)} gün geç`
    : status === "risk"
      ? `${slack} gün tampon`
      : `${slack} gün rahat`;
  return {
    readyDate: formatIsoDate(ready),
    slackDays: String(slack),
    status,
    message,
  };
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNonNegativeDays(value: string) {
  const parsed = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.ceil(parsed);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86400000);
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function refreshDeviceOrderRisk(nodes: PipelineNode[], deviceNodeId: string, quantity: string) {
  const staleIds = collectDeviceDrilldownNodeIds(nodes, deviceNodeId);
  if (staleIds.size === 0) return nodes;
  return nodes.map(node => {
    if (!staleIds.has(node.id) || !node.bomComponent) return node;
    return updateBomNodeOrderRisk(node, quantity);
  });
}

function updateBomNodeOrderRisk(node: PipelineNode, quantity: string): PipelineNode {
  if (!node.bomComponent) return node;
  const bomComponent = applyOrderRiskToBomMeta(node.bomComponent, quantity);
  const rows = [bomComponentToRow(bomComponent)];
  return {
    ...node,
    bomComponent,
    rows,
    columns: collectColumns(rows),
  };
}

function applyOrderRiskToBomMeta(meta: BomComponentNodeMeta, quantity: string | number | null | undefined): BomComponentNodeMeta {
  const orderQuantity = parsePositiveQuantity(quantity);
  if (orderQuantity === null) {
    return {
      ...meta,
      orderQuantity: null,
      requiredForOrder: null,
      stockShortage: null,
      isInsufficient: false,
    };
  }
  const requiredForOrder = meta.requiredPerUnit === null ? null : meta.requiredPerUnit * orderQuantity;
  const stockShortage = requiredForOrder === null || meta.currentStock === null
    ? null
    : Math.max(0, requiredForOrder - meta.currentStock);
  const capacityInsufficient = meta.maxProducts !== null && meta.maxProducts < orderQuantity;
  const isInsufficient = capacityInsufficient || (stockShortage !== null && stockShortage > 0);
  return {
    ...meta,
    orderQuantity,
    requiredForOrder,
    stockShortage,
    isInsufficient,
  };
}

function parsePositiveQuantity(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function componentWarningTitle(meta: BomComponentNodeMeta) {
  const order = meta.orderQuantity === null ? "N/A" : formatCell(meta.orderQuantity);
  const capacity = meta.maxProducts === null ? "N/A" : formatCell(meta.maxProducts);
  const shortage = meta.stockShortage === null ? "stok yetersiz" : `${formatCell(meta.stockShortage)} ${meta.unit} eksik`;
  return `${meta.code}: sipariş ${order}, üretilebilir ${capacity}, ${shortage}`;
}

function isEditableProcurementColumn(column: string) {
  return column === "planned_quantity"
    || column === "supplier"
    || column === "eta"
    || column === "inbound_buffer_days"
    || column === "production_lead_days"
    || column === "status";
}

function procurementOverrideField(column: string): keyof ProcurementOverride | null {
  if (column === "planned_quantity") return "plannedQuantity";
  if (column === "supplier") return "supplier";
  if (column === "eta") return "eta";
  if (column === "inbound_buffer_days") return "inboundBufferDays";
  if (column === "production_lead_days") return "productionLeadDays";
  if (column === "status") return "status";
  return null;
}

function updateProcurementConnectionContext(
  connection: GraphConnection,
  procurementNodeId: string,
  componentCode: string,
  column: string,
  value: string,
): GraphConnection {
  if (connection.to !== procurementNodeId || connection.contract?.relation !== "component_procurement") return connection;
  if (connection.contract.context.componentCode !== componentCode) return connection;
  const contextKey = procurementContextKey(column);
  if (!contextKey) return connection;
  const nextContext = {
    ...connection.contract.context,
    [contextKey]: value,
  };
  const schedule = buildProcurementSchedule(
    nextContext.eta ?? "",
    nextContext.orderDeadline ?? "",
    nextContext.inboundBufferDays ?? "1",
    nextContext.productionLeadDays ?? "5",
  );
  return {
    ...connection,
    contract: {
      ...connection.contract,
      context: {
        ...nextContext,
        readyDate: schedule.readyDate,
        slackDays: schedule.slackDays,
        scheduleStatus: schedule.status,
        scheduleMessage: schedule.message,
      },
      status: "local" as const,
      message: "Procurement row edit synced into semantic context",
    },
  };
}

function updateProcurementDeadlineContexts(
  connections: GraphConnection[],
  nodes: PipelineNode[],
  orderNodeId: string,
  deadline: string,
) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const orderDeviceTargets = new Set(connections
    .filter(connection => connection.from === orderNodeId && connection.contract?.relation === "order_device")
    .map(connection => connection.to));
  return connections.map(connection => {
    if (connection.contract?.relation !== "component_procurement") return connection;
    const source = byId.get(connection.from);
    const rootDeviceId = source ? findRootDeviceNodeId(source, byId) : "";
    if (!rootDeviceId || !orderDeviceTargets.has(rootDeviceId)) return connection;
    const nextContext: Record<string, string> = {
      ...connection.contract.context,
      orderDeadline: deadline,
    };
    const schedule = buildProcurementSchedule(
      nextContext.eta ?? "",
      nextContext.orderDeadline ?? "",
      nextContext.inboundBufferDays ?? "1",
      nextContext.productionLeadDays ?? "5",
    );
    return {
      ...connection,
      contract: {
        ...connection.contract,
        context: {
          ...nextContext,
          readyDate: schedule.readyDate,
          slackDays: schedule.slackDays,
          scheduleStatus: schedule.status,
          scheduleMessage: schedule.message,
        },
        status: "local" as const,
        message: "Order deadline synced into procurement schedule",
      },
    };
  });
}

function updateProcurementFieldContexts(
  connections: GraphConnection[],
  procurementNodeId: string,
  field: keyof ProcurementFields,
  value: string,
) {
  const procurementConnections = connections.filter(connection => (
    connection.to === procurementNodeId
    && connection.contract?.relation === "component_procurement"
  ));
  return connections.map(connection => {
    if (connection.to !== procurementNodeId || connection.contract?.relation !== "component_procurement") return connection;
    if (field === "componentCode") return connection;
    const nextContext = { ...connection.contract.context };
    if (field === "quantity" && procurementConnections.length === 1) nextContext.plannedQuantity = value;
    if (field === "supplier") nextContext.supplier = value;
    if (field === "eta") nextContext.eta = value;
    if (field === "inboundBufferDays") nextContext.inboundBufferDays = value;
    if (field === "productionLeadDays") nextContext.productionLeadDays = value;
    if (field === "status") nextContext.status = value;
    const schedule = buildProcurementSchedule(
      nextContext.eta ?? "",
      nextContext.orderDeadline ?? "",
      nextContext.inboundBufferDays ?? "1",
      nextContext.productionLeadDays ?? "5",
    );
    return {
      ...connection,
      contract: {
        ...connection.contract,
        context: {
          ...nextContext,
          readyDate: schedule.readyDate,
          slackDays: schedule.slackDays,
          scheduleStatus: schedule.status,
          scheduleMessage: schedule.message,
        },
        status: "local" as const,
        message: "Procurement schedule field synced into semantic context",
      },
    };
  });
}

function procurementContextKey(column: string) {
  if (column === "planned_quantity") return "plannedQuantity";
  if (column === "supplier") return "supplier";
  if (column === "eta") return "eta";
  if (column === "inbound_buffer_days") return "inboundBufferDays";
  if (column === "production_lead_days") return "productionLeadDays";
  if (column === "status") return "status";
  return null;
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

function collectDeviceDrilldownNodeIds(nodes: PipelineNode[], deviceNodeId: string) {
  return collectDrilldownDescendantIds(nodes, deviceNodeId);
}

function collectAllDrilldownNodeIds(nodes: PipelineNode[]) {
  return new Set(
    nodes
      .filter(node => node.drilldownParentId || (node.kind === "component" && node.id.startsWith("bom-")))
      .map(node => node.id),
  );
}

function repairGraphSnapshot<T extends GraphSnapshot>(snapshot: T): T {
  const cleaned = removeVisibleOrderNodes(snapshot);
  const nodeIds = new Set(cleaned.nodes.map(node => node.id));
  const connections = dedupeConnections(cleaned.connections.filter(connection => (
    nodeIds.has(connection.from) && nodeIds.has(connection.to)
  )));
  const nodes = refreshProcurementNeedTables(refreshAllDeviceOrderRisks(cleaned.nodes), connections);
  const selectedNodeId = nodeIds.has(cleaned.selectedNodeId)
    ? cleaned.selectedNodeId
    : nodes[0]?.id ?? initialDatasetId;
  return {
    ...snapshot,
    nodes,
    connections,
    selectedNodeId,
  };
}

function removeVisibleOrderNodes<T extends GraphSnapshot>(snapshot: T): T {
  const orderNodeIds = new Set(
    snapshot.nodes
      .filter(node => node.semanticRole === "order" || node.semanticRole === "orderLine" || node.functionKind === "order" || node.functionKind === "orderLine")
      .map(node => node.id),
  );
  if (orderNodeIds.size === 0) return snapshot;

  const byId = new Map(snapshot.nodes.map(node => [node.id, node]));
  const bridgedConnections = snapshot.connections.flatMap(connection => {
    if (connection.contract?.relation !== "order_device" || !orderNodeIds.has(connection.from)) return [];
    const orderNode = byId.get(connection.from);
    const incomingCustomer = snapshot.connections.find(item => (
      item.to === connection.from
      && item.contract?.relation === "customer_order"
      && !orderNodeIds.has(item.from)
    ));
    if (!incomingCustomer) return [];
    const customerNode = byId.get(incomingCustomer.from);
    if (!customerNode) return [];

    const context = {
      ...(incomingCustomer.contract?.context ?? {}),
      ...(connection.contract.context ?? {}),
      customer: connection.contract.context.customer
        || orderNode?.orderFields?.customer
        || incomingCustomer.contract?.context.customer
        || customerNode.semanticLabel
        || customerNode.title,
      deadline: connection.contract.context.deadline || orderNode?.orderFields?.deadline || "",
    };

    return [{
      ...connection,
      from: customerNode.id,
      contract: {
        ...connection.contract,
        relation: "customer_device" as const,
        fromRole: "customer" as const,
        fieldMap: [
          { from: "semanticLabel", to: "internal.orderLine.customer" },
          { from: "deviceSku", to: "internal.orderLine.deviceType" },
          { from: "deviceQuantity", to: "internal.orderLine.quantity" },
        ],
        context,
        message: "Customer linked directly to device through visible order context",
      },
    }];
  });

  const nodes = snapshot.nodes.filter(node => !orderNodeIds.has(node.id));
  const nodeIds = new Set(nodes.map(node => node.id));
  const connections = dedupeConnections([
    ...snapshot.connections.filter(connection => (
      !orderNodeIds.has(connection.from)
      && !orderNodeIds.has(connection.to)
      && nodeIds.has(connection.from)
      && nodeIds.has(connection.to)
    )),
    ...bridgedConnections,
  ]);

  return {
    ...snapshot,
    nodes,
    connections,
    selectedNodeId: nodeIds.has(snapshot.selectedNodeId)
      ? snapshot.selectedNodeId
      : nodes[0]?.id ?? initialDatasetId,
  };
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
    backendStored: raw.backendStored === true,
  };
}

function shouldOpenCloudGraph(localGraph: SavedPipelineGraph | null, cloudGraph: SavedPipelineGraph) {
  if (!localGraph) return true;
  if (cloudGraph.id === localGraph.id) {
    return Date.parse(cloudGraph.savedAt) > Date.parse(localGraph.savedAt);
  }
  if (!localGraph.backendStored && Date.parse(localGraph.savedAt) > Date.parse(cloudGraph.savedAt)) {
    return false;
  }
  return Date.parse(cloudGraph.savedAt) > Date.parse(localGraph.savedAt);
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

const deviceOperationModes: Array<{ mode: DeviceOperationMode; label: string }> = [
  { mode: "warehouse_sale", label: "Depo" },
  { mode: "produce_sale", label: "Üretim" },
];

function emptyOrderFields(): OrderFields {
  return {
    customer: "",
    deadline: "",
  };
}

function emptyProcurementFields(): ProcurementFields {
  return {
    componentCode: "",
    supplier: "",
    quantity: "",
    eta: "",
    inboundBufferDays: "1",
    productionLeadDays: "5",
    status: "planned",
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

function resolveDeviceNodeSku(node: PipelineNode) {
  const sku = node.deviceSku || (node.semanticLabel !== "Cihaz" ? node.semanticLabel : "") || node.title || "";
  return sku.trim();
}

function normalizeDeviceOperationMode(mode: unknown): DeviceOperationMode {
  return mode === "produce_sale" ? "produce_sale" : "warehouse_sale";
}

function withDeviceOperationRows(node: PipelineNode): PipelineNode {
  if (node.semanticRole !== "device") return node;
  const rows = deviceOperationToRows(node);
  return {
    ...node,
    rows,
    columns: collectColumns(rows),
  };
}

function deviceOperationToRows(node: PipelineNode) {
  const op = node.deviceOperation;
  if (!op) return node.rows;
  const plan = buildDeviceOperationPlan(op, node.deviceQuantity ?? "", normalizeDeviceOperationMode(node.deviceOperationMode));
  return [{
    product_sku: op.sku,
    product_name: op.productName ?? op.sku,
    operation_mode: plan.mode,
    requested_quantity: plan.requestedQuantity,
    finished_in_warehouse: op.inWarehouse,
    in_production: op.inProduction,
    max_producible_from_components: op.maxProducible,
    warehouse_reserved: plan.warehouseReserve,
    production_order: plan.productionOrder,
    sales_commit: plan.salesCommit,
    shortage: plan.shortage,
    bottleneck: op.bottleneck?.code ?? null,
    status: plan.status,
  }];
}

function buildDeviceOperationPlan(
  operation: DeviceOperationSnapshot | undefined,
  quantity: string,
  requestedMode: DeviceOperationMode,
) {
  const requestedQuantity = parsePositiveQuantity(quantity) ?? 0;
  if (!operation || !operation.sku) {
    return {
      mode: requestedMode,
      requestedQuantity,
      warehouseReserve: 0,
      productionOrder: 0,
      salesCommit: 0,
      shortage: 0,
      status: "idle",
      badge: "SKU yok",
      title: "Operasyon modu",
      warehouse: "-",
      production: "-",
      sales: "-",
      note: "Cihaz seçilince mamul depo ve üretilebilirlik canlı okunur.",
    };
  }
  if (operation.status === "loading") {
    return {
      mode: requestedMode,
      requestedQuantity,
      warehouseReserve: 0,
      productionOrder: 0,
      salesCommit: 0,
      shortage: 0,
      status: "loading",
      badge: "Canlı",
      title: "Operasyon modu",
      warehouse: "okunuyor",
      production: "okunuyor",
      sales: "beklemede",
      note: `${operation.sku} için stock_levels ve BOM kapasitesi okunuyor.`,
    };
  }
  if (operation.status === "error") {
    return {
      mode: requestedMode,
      requestedQuantity,
      warehouseReserve: 0,
      productionOrder: 0,
      salesCommit: 0,
      shortage: requestedQuantity,
      status: "critical",
      badge: "Veri yok",
      title: "Operasyon modu",
      warehouse: "-",
      production: "-",
      sales: "-",
      note: operation.error ?? "Operasyon verisi okunamadı.",
    };
  }

  const warehouseAvailable = Math.max(0, operation.inWarehouse);
  const producible = Math.max(0, operation.maxProducible ?? 0);
  const mode = normalizeDeviceOperationMode(requestedMode);

  const warehouseReserve = mode === "produce_sale"
    ? 0
    : Math.min(requestedQuantity, warehouseAvailable);
  const remainingAfterWarehouse = Math.max(0, requestedQuantity - warehouseReserve);
  const productionOrder = mode === "warehouse_sale"
    ? 0
    : Math.min(remainingAfterWarehouse, producible);
  const salesCommit = Math.min(requestedQuantity, warehouseReserve + productionOrder);
  const shortage = Math.max(0, requestedQuantity - salesCommit);
  const status = requestedQuantity === 0
    ? "idle"
    : shortage > 0
      ? "critical"
      : productionOrder > 0
        ? "warning"
        : "ok";
  const modeLabel = mode === "warehouse_sale"
    ? "Depo"
    : "Üretim";
  const bottleneck = operation.bottleneck?.code
    ? ` Darboğaz: ${operation.bottleneck.code}.`
    : "";

  return {
    mode,
    requestedQuantity,
    warehouseReserve,
    productionOrder,
    salesCommit,
    shortage,
    status,
    badge: status === "critical" ? "Risk" : status === "warning" ? "Üretim" : status === "ok" ? "Hazır" : "Bekliyor",
    title: modeLabel,
    warehouse: `${formatCell(warehouseReserve)}/${formatCell(operation.inWarehouse)}`,
    production: operation.maxProducible === null ? "BOM yok" : `${formatCell(productionOrder)}/${formatCell(operation.maxProducible)}`,
    sales: `${formatCell(salesCommit)}/${requestedQuantity ? formatCell(requestedQuantity) : "-"}`,
    note: shortage > 0
      ? `${formatCell(shortage)} adet açık kalıyor.${bottleneck}`
      : requestedQuantity > 0
        ? "Sipariş bu cihaz kutusu içinden karşılanabilir."
        : "Sipariş adedi girilince depo, üretim ve satış commit'i hesaplanır.",
  };
}

function semanticRoleLabel(role: SemanticRole) {
  if (role === "customer") return "Müşteri";
  if (role === "order") return "Sipariş";
  if (role === "orderLine") return "Sipariş kalemi";
  if (role === "procurement") return "Tedarik";
  if (role === "ontology") return "Ontology";
  return "Cihaz";
}

function createOntologyRows() {
  return [
    { mode: "graph-function", scope: "pipeline", output: "fulfillment-risk-by-device" },
    { mode: "semantic-layer", scope: "connected nodes", output: "object/action context" },
    { mode: "decision-layer", scope: "stock / BOM / procurement", output: "recommended action plan" },
  ];
}

function buildSmartConnection(
  source: PipelineNode,
  target: PipelineNode,
  graphNodes: PipelineNode[] = [],
  graphConnections: GraphConnection[] = [],
): GraphConnection {
  const relation =
    target.semanticRole === "ontology"
      ? "ontology_input"
      : source.bomComponent && target.semanticRole === "procurement"
      ? "component_procurement"
      : source.semanticRole === "customer" && target.semanticRole === "device"
      ? "customer_device"
      : source.semanticRole === "customer" && target.semanticRole === "order"
      ? "customer_order"
      : source.semanticRole === "order" && target.semanticRole === "device"
        ? "order_device"
        : "generic";
  const context: Record<string, string> = {};
  if (relation === "component_procurement" && source.bomComponent) {
    const byId = new Map(graphNodes.map(node => [node.id, node]));
    const orderDeadline = findOrderDeadlineForBomSource(source, byId, graphConnections);
    const eta = target.procurementFields?.eta ?? "";
    const inboundBufferDays = target.procurementFields?.inboundBufferDays ?? "1";
    const productionLeadDays = target.procurementFields?.productionLeadDays ?? "5";
    const schedule = buildProcurementSchedule(eta, orderDeadline, inboundBufferDays, productionLeadDays);
    context.componentCode = source.bomComponent.code;
    context.componentName = source.bomComponent.name;
    context.shortage = source.bomComponent.stockShortage === null ? "" : String(source.bomComponent.stockShortage);
    context.unit = source.bomComponent.unit;
    context.orderQuantity = source.bomComponent.orderQuantity === null ? "" : String(source.bomComponent.orderQuantity);
    context.plannedQuantity = source.bomComponent.stockShortage === null ? "" : String(Math.ceil(source.bomComponent.stockShortage));
    context.supplier = target.procurementFields?.supplier ?? "";
    context.eta = eta;
    context.inboundBufferDays = inboundBufferDays;
    context.productionLeadDays = productionLeadDays;
    context.readyDate = schedule.readyDate;
    context.orderDeadline = orderDeadline;
    context.slackDays = schedule.slackDays;
    context.scheduleStatus = schedule.status;
    context.scheduleMessage = schedule.message;
    context.status = target.procurementFields?.status ?? "planned";
  }
  if (relation === "customer_order") context.customer = source.semanticLabel || source.title;
  if (relation === "ontology_input") {
    context.sourceNode = source.title;
    context.sourceRole = source.semanticRole ?? source.kind;
    if (source.semanticLabel) context.semanticLabel = source.semanticLabel;
    if (source.deviceSku) context.device = source.deviceSku;
    if (source.deviceQuantity) context.quantity = source.deviceQuantity;
    if (source.bomComponent?.code) context.componentCode = source.bomComponent.code;
  }
  if (relation === "customer_device") {
    context.customer = source.semanticLabel || source.title;
    context.device = target.deviceSku || target.semanticLabel || target.title;
    if (target.deviceQuantity) context.quantity = target.deviceQuantity;
  }
  if (relation === "order_device") {
    if (source.orderFields?.customer) context.customer = source.orderFields.customer;
    if (source.orderFields?.deadline) context.deadline = source.orderFields.deadline;
    context.device = target.deviceSku || target.semanticLabel || target.title;
    if (target.deviceQuantity) context.quantity = target.deviceQuantity;
  }
  const internalOrderLine = relation === "order_device"
    ? buildInternalOrderLine(source, target)
    : relation === "customer_device"
      ? buildCustomerDeviceInternalOrderLine(source, target)
      : undefined;
  const fieldMap = relation === "component_procurement"
    ? [
        { from: "bomComponent.code", to: "procurementFields.componentCode" },
        { from: "bomComponent.stockShortage", to: "procurementFields.quantity" },
      ]
    : relation === "ontology_input"
      ? [
          { from: "id", to: "ontology.input.objectId" },
          { from: "semanticRole", to: "ontology.input.role" },
          { from: "rows", to: "ontology.input.rows" },
        ]
    : relation === "customer_order"
    ? [{ from: "semanticLabel", to: "orderFields.customer" }]
    : relation === "customer_device"
      ? [
          { from: "semanticLabel", to: "internal.orderLine.customer" },
          { from: "deviceSku", to: "internal.orderLine.deviceType" },
          { from: "deviceQuantity", to: "internal.orderLine.quantity" },
        ]
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
      message: relation === "component_procurement"
        ? "Shortage component mapped into procurement need"
        : relation === "ontology_input"
        ? "Node projected into ontology graph function"
        : relation === "customer_device"
        ? "Customer linked directly to device through visible order context"
        : relation === "customer_order"
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

function buildCustomerDeviceInternalOrderLine(customer: PipelineNode, device: PipelineNode): SemanticConnectionContract["internal"] {
  const deviceValue = device.deviceSku || (device.semanticLabel !== "Cihaz" ? device.semanticLabel : "") || device.title;
  return {
    entity: "orderLine",
    fields: {
      customer: customer.semanticLabel || customer.title,
      deadline: "",
      deviceType: deviceValue !== "Cihaz" ? deviceValue : "",
      quantity: device.deviceQuantity ?? "",
    },
    contracts: [
      {
        relation: "order_order_line",
        fieldMap: [
          { from: "semanticLabel", to: "orderLineFields.customer" },
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
  if (source.bomComponent && target.semanticRole === "procurement") {
    const shortage = source.bomComponent.stockShortage;
    const quantity = shortage === null ? "" : String(Math.ceil(shortage));
    const override = node.procurementOverrides?.[source.bomComponent.code] ?? {};
    const eta = override.eta ?? node.procurementFields?.eta ?? "";
    const inboundBufferDays = override.inboundBufferDays ?? node.procurementFields?.inboundBufferDays ?? "1";
    const productionLeadDays = override.productionLeadDays ?? node.procurementFields?.productionLeadDays ?? "5";
    const schedule = buildProcurementSchedule(eta, "", inboundBufferDays, productionLeadDays);
    const row = {
      component_code: source.bomComponent.code,
      component_name: source.bomComponent.name,
      shortage,
      unit: source.bomComponent.unit,
      order_quantity: source.bomComponent.orderQuantity,
      required_for_order: source.bomComponent.requiredForOrder,
      available_stock: source.bomComponent.currentStock,
      planned_quantity: override.plannedQuantity ?? quantity,
      supplier: override.supplier ?? node.procurementFields?.supplier ?? "",
      eta,
      inbound_buffer_days: inboundBufferDays,
      production_lead_days: productionLeadDays,
      ready_date: schedule.readyDate,
      order_deadline: "",
      slack_days: schedule.slackDays,
      schedule_status: schedule.status,
      schedule_message: schedule.message,
      status: override.status ?? node.procurementFields?.status ?? "planned",
    };
    const existingRows = node.rows.filter(row => row.component_code && row.component_code !== source.bomComponent?.code);
    const rows = existingRows.concat(row);
    return {
      ...node,
      title: `Tedarik · ${source.bomComponent.code}`,
      semanticLabel: `Tedarik ${source.bomComponent.code}`,
      subtitle: `${rows.length} bağlı tedarik ihtiyacı`,
      procurementFields: {
        ...emptyProcurementFields(),
        ...node.procurementFields,
        componentCode: source.bomComponent.code,
        quantity,
        inboundBufferDays,
        productionLeadDays,
      },
      rows,
      columns: collectColumns(rows),
    };
  }
  return node;
}

function describeSmartConnection(source: PipelineNode, target: PipelineNode) {
  if (target.semanticRole === "ontology") {
    return `${source.title} → Ontology f(x): graph function girdisi olarak bağlandı.`;
  }
  if (source.semanticRole === "customer" && target.semanticRole === "order") {
    return `${source.title} → ${target.title}: müşteri alanı siparişe aktarıldı.`;
  }
  if (source.semanticRole === "customer" && target.semanticRole === "device") {
    return `${source.title} → ${target.title}: müşteri bağlamı cihaz paneline aktarıldı.`;
  }
  if (source.semanticRole === "order" && target.semanticRole === "orderLine") {
    return `${source.title} → ${target.title}: sipariş bağlamı kaleme aktarıldı.`;
  }
  if (source.semanticRole === "orderLine" && target.semanticRole === "device") {
    return `${source.title} → ${target.title}: cihaz tipi cihaz node'una aktarıldı.`;
  }
  if (source.bomComponent && target.semanticRole === "procurement") {
    const shortage = source.bomComponent.stockShortage === null ? "eksik" : `${formatCell(source.bomComponent.stockShortage)} ${source.bomComponent.unit}`;
    return `${source.title} → ${target.title}: tedarik ihtiyacı bağlandı (${shortage}).`;
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
  if (node.semanticRole === "procurement") return 190;
  if (node.semanticRole === "ontology") return 152;
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

const zoomControlStyle: CSSProperties = {
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  overflow: "hidden",
};

function zoomButtonStyle(disabled: boolean): CSSProperties {
  return {
    width: 31,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRight: `1px solid ${CT.border}`,
    background: "transparent",
    color: disabled ? CT.inkFaint : CT.inkSub,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const zoomValueStyle: CSSProperties = {
  minWidth: 44,
  textAlign: "center",
  color: CT.inkMuted,
  fontSize: 11,
  fontFamily: CT_MONO,
  fontWeight: 700,
  borderRight: `1px solid ${CT.border}`,
};

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

const previewResizeHandleStyle: CSSProperties = {
  height: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef1f5",
  borderTop: `1px solid ${CT.border}`,
  borderBottom: `1px solid ${CT.borderStrong}`,
  cursor: "ns-resize",
  touchAction: "none",
};

const previewResizeGripStyle: CSSProperties = {
  width: 92,
  height: 4,
  borderRadius: 999,
  background: "rgba(86,101,119,0.42)",
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

const componentWarningDotStyle: CSSProperties = {
  position: "absolute",
  top: -6,
  right: -6,
  width: 14,
  height: 14,
  borderRadius: 999,
  border: "2px solid #ffffff",
  background: CT.err,
  boxShadow: "0 2px 8px rgba(178,34,34,0.34)",
};

const procurementMiniNodeStyle: CSSProperties = {
  position: "absolute",
  right: -22,
  top: "50%",
  width: 18,
  height: 18,
  transform: "translateY(-50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "2px solid #ffffff",
  background: CT.err,
  color: "#ffffff",
  fontFamily: CT_MONO,
  fontSize: 9,
  fontWeight: 900,
  boxShadow: "0 2px 8px rgba(178,34,34,0.32)",
  cursor: "crosshair",
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

const procurementFieldsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 78px",
  gap: 7,
  padding: "6px 12px 0",
};

const deviceEditorStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gap: 7,
  padding: "6px 12px 0",
};

const deviceFieldsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 78px",
  gap: 7,
};

function operationBadgeStyle(status: string): CSSProperties {
  const color =
    status === "critical" ? CT.err :
    status === "warning" ? "#a96f00" :
    status === "ok" ? CT.ok :
    CT.inkMuted;
  return {
    flex: "0 0 auto",
    color,
    fontFamily: CT_MONO,
    fontSize: 9.5,
    fontWeight: 900,
  };
}

const deviceOperationPreviewStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
};

const deviceOperationPreviewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const deviceOperationTitleStyle: CSSProperties = {
  color: CT.ink,
  fontSize: 16,
  fontWeight: 850,
};

const deviceOperationSubStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 12,
  marginTop: 3,
};

const deviceOperationControlsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.4fr) minmax(120px, 0.6fr) 110px",
  gap: 10,
  alignItems: "end",
};

const deviceOperationStatusStyle: CSSProperties = {
  minWidth: 0,
  height: 44,
  display: "grid",
  alignContent: "center",
  gap: 3,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fbfbf8",
  padding: "0 10px",
  color: CT.inkMuted,
  fontSize: 10,
  fontWeight: 750,
};

const deviceCustomerPanelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fbfbf8",
  padding: 10,
};

const deviceCustomerHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: CT.ink,
  fontSize: 12,
  fontWeight: 850,
};

const deviceCustomerEmptyStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 12,
};

const deviceCustomerListStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const deviceCustomerRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 1.2fr) 72px 138px 112px minmax(110px, 0.8fr)",
  gap: 8,
  alignItems: "center",
  minHeight: 34,
  borderTop: `1px solid ${CT.border}`,
  paddingTop: 6,
  color: CT.inkSub,
  fontSize: 11,
};

const deviceCustomerNameStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: CT.ink,
};

const deviceCustomerSourceStyle: CSSProperties = {
  color: CT.inkMuted,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const deviceCustomerDateInputStyle: CSSProperties = {
  width: "100%",
  height: 28,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.ink,
  fontFamily: CT_MONO,
  fontSize: 11,
  padding: "0 7px",
  outline: "none",
  boxSizing: "border-box",
};

const deviceCustomerModeSelectStyle: CSSProperties = {
  width: "100%",
  height: 28,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 11,
  fontWeight: 850,
  padding: "0 8px",
  outline: "none",
};

function previewRefreshButtonStyle(disabled: boolean): CSSProperties {
  return {
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: `1px solid ${disabled ? CT.border : CT.borderStrong}`,
    borderRadius: 7,
    background: disabled ? "#f2f2ef" : CT.surface,
    color: disabled ? CT.inkFaint : CT.inkSub,
    fontFamily: CT_FONT,
    fontSize: 12,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 10px",
  };
}

const previewModeGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 150px))",
  gap: 8,
};

function previewModeButtonStyle(active: boolean): CSSProperties {
  return {
    height: 34,
    border: `1px solid ${active ? CT.accentEdge : CT.border}`,
    borderRadius: 7,
    background: active ? CT.accentSoft : CT.surface,
    color: active ? CT.accent : CT.inkSub,
    fontFamily: CT_FONT,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}

const deviceDecisionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
  gap: 10,
};

const decisionCardStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  padding: 12,
};

const decisionCardLabelStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 11,
  fontWeight: 800,
};

const decisionCardValueStyle: CSSProperties = {
  color: CT.ink,
  fontSize: 20,
  fontFamily: CT_MONO,
};

const decisionCardDetailStyle: CSSProperties = {
  color: CT.inkSub,
  fontSize: 11,
};

const deviceOperationDetailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
  columnGap: 18,
  borderTop: `1px solid ${CT.border}`,
  paddingTop: 4,
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

const drilldownMenuStyle: CSSProperties = {
  position: "absolute",
  zIndex: 8,
  left: 12,
  right: 12,
  top: 95,
  display: "grid",
  gap: 4,
  padding: 5,
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  boxShadow: "0 8px 18px rgba(20,20,19,0.14)",
};

const drilldownMenuItemStyle: CSSProperties = {
  height: 27,
  border: "none",
  borderRadius: 5,
  background: "transparent",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 11,
  fontWeight: 800,
  textAlign: "left",
  padding: "0 8px",
  cursor: "pointer",
};

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

const ontologyNodeHintStyle: CSSProperties = {
  margin: "8px 10px 0",
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#eef3f5",
  color: "#33554f",
  fontSize: 11,
  fontWeight: 850,
};

const ontologyPreviewStyle: CSSProperties = {
  padding: 14,
};

const ontologyAnalysisShellStyle: CSSProperties = {
  minHeight: 390,
  border: `1px solid ${CT.border}`,
  borderRadius: 10,
  background: "#f7f6f1",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  overflow: "hidden",
};

const ontologyAnalysisTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "16px 22px 10px",
};

const ontologyEyebrowStyle: CSSProperties = {
  color: CT.accent,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1,
};

const ontologyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  lineHeight: 1.05,
};

const ontologyOpenButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 30,
  border: "1px solid rgba(47,93,80,0.28)",
  borderRadius: 7,
  background: "#e9f2ee",
  color: "#2f5d50",
  textDecoration: "none",
  padding: "0 10px",
  fontSize: 11,
  fontWeight: 850,
};

const ontologyContextPillsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const ontologyAnalysisCenterStyle: CSSProperties = {
  width: "min(920px, 100%)",
  margin: "0 auto",
  padding: "4px 22px 18px",
  display: "grid",
  gap: 10,
  alignContent: "start",
};

const ontologyWorkspaceStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 12,
  background: CT.surface,
  overflow: "hidden",
};

const ontologyScopePanelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  borderBottom: `1px solid ${CT.border}`,
  padding: "10px 12px",
  background: "#fbfaf6",
};

const ontologyScopeHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 10,
  color: CT.ink,
  fontSize: 12,
};

const ontologyScopeGroupsStyle: CSSProperties = {
  display: "grid",
  gap: 9,
  maxHeight: 260,
  overflowY: "auto",
};

const ontologyScopeGroupStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "76px 1fr",
  gap: 8,
  alignItems: "start",
  color: CT.inkMuted,
  fontSize: 11,
  fontWeight: 800,
};

const ontologyScopeRowsStyle: CSSProperties = {
  display: "grid",
  gap: 3,
};

const ontologyScopeClearStyle = (disabled: boolean): CSSProperties => ({
  height: 24,
  border: `1px solid ${CT.border}`,
  borderRadius: 6,
  background: disabled ? "#f0efeb" : CT.surface,
  color: disabled ? CT.inkMuted : CT.ink,
  fontFamily: CT_FONT,
  fontSize: 11,
  fontWeight: 850,
  padding: "0 9px",
  cursor: disabled ? "default" : "pointer",
});

const ontologyScopeRowStyle = (active: boolean, tone: OntologyScopeItem["tone"]): CSSProperties => ({
  minHeight: 29,
  display: "grid",
  gridTemplateColumns: "18px minmax(86px, 160px) 1fr",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${active ? CT.accentEdge : tone === "risk" ? "rgba(179,64,55,0.35)" : "transparent"}`,
  borderRadius: 4,
  background: active ? CT.accentSoft : tone === "risk" ? "#fff3ef" : "transparent",
  color: active ? CT.accent : tone === "risk" ? CT.err : CT.ink,
  fontFamily: CT_FONT,
  fontSize: 11,
  fontWeight: 850,
  padding: "2px 7px",
  cursor: "pointer",
});

const ontologyScopeCheckboxStyle: CSSProperties = {
  width: 13,
  height: 13,
  margin: 0,
  accentColor: CT.accent,
  cursor: "pointer",
};

const ontologyScopeRowLabelStyle: CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const ontologyScopeRowDetailStyle: CSSProperties = {
  minWidth: 0,
  color: CT.inkMuted,
  fontSize: 10.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const ontologyNarrativeStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  color: CT.inkSub,
  padding: "10px 12px",
  marginBottom: 10,
  fontSize: 12,
};

const ontologyWorkspaceToolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: `1px solid ${CT.border}`,
  padding: "10px 12px",
  color: CT.ink,
  fontSize: 12,
};

const ontologyModeToggleGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 3,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#f6f5ef",
};

const ontologyModeButtonStyle = (active: boolean): CSSProperties => ({
  minWidth: 82,
  height: 28,
  border: `1px solid ${active ? CT.borderStrong : "transparent"}`,
  borderRadius: 5,
  background: active ? CT.surface : "transparent",
  color: active ? CT.ink : CT.inkMuted,
  fontFamily: CT_FONT,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
});

const ontologyDimensionPanelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  borderBottom: `1px solid ${CT.border}`,
  padding: "9px 12px 10px",
  background: "#fbfaf6",
};

const ontologyDimensionGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  color: CT.inkMuted,
  fontSize: 11,
};

const ontologyDimensionButtonStyle = (active: boolean): CSSProperties => ({
  height: 24,
  border: `1px solid ${active ? "rgba(201,100,66,0.45)" : CT.border}`,
  borderRadius: 5,
  background: active ? "#f6e7de" : CT.surface,
  color: active ? CT.accent : CT.inkMuted,
  fontFamily: CT_FONT,
  fontSize: 10,
  fontWeight: 850,
  padding: "0 8px",
  cursor: "pointer",
});

const ontologyChartCanvasStyle: CSSProperties = {
  height: 282,
  padding: "10px 10px 6px",
};

const ontologyEmptyChartStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px dashed ${CT.borderStrong}`,
  borderRadius: 8,
  color: CT.inkMuted,
  fontSize: 13,
  textAlign: "center",
  padding: 18,
};

const graphFunctionDrilldownStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  borderTop: `1px solid ${CT.border}`,
  padding: "12px 14px",
  background: "#fbfaf6",
};

const graphFunctionDrilldownHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  color: CT.ink,
  fontSize: 13,
};

const graphFunctionMetricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(110px, 1fr))",
  gap: 14,
};

const graphFunctionListStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const graphFunctionListRowStyle: CSSProperties = {
  minHeight: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  border: `1px solid ${CT.border}`,
  borderRadius: 6,
  background: CT.surface,
  color: CT.inkSub,
  fontSize: 11,
  padding: "5px 8px",
};

const ontologyTooltipStyle: CSSProperties = {
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.ink,
  fontFamily: CT_MONO,
  fontSize: 11,
};

const ontologyLegendStyle: CSSProperties = {
  color: CT.inkSub,
  fontFamily: CT_MONO,
  fontSize: 11,
};

const ontologyInsightGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 10,
  color: CT.inkSub,
  fontSize: 12,
};

const ontologyInsightLineStyle: CSSProperties = {
  display: "block",
  marginTop: 5,
  lineHeight: 1.45,
};

function deliveryDecisionPanelStyle(tone: "ok" | "risk" | "late"): CSSProperties {
  const edge = tone === "late"
    ? "rgba(178,34,34,0.32)"
    : tone === "risk"
      ? "rgba(169,111,0,0.32)"
      : "rgba(63,143,91,0.30)";
  return {
    display: "grid",
    gap: 10,
    border: `1px solid ${edge}`,
    borderRadius: 10,
    background: CT.surface,
    padding: 12,
  };
}

const deliveryDecisionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const deliveryDecisionTitleStyle: CSSProperties = {
  margin: 0,
  color: CT.ink,
  fontSize: 20,
  lineHeight: 1.1,
};

function deliveryDecisionBadgeStyle(tone: "ok" | "risk" | "late"): CSSProperties {
  return {
    flex: "0 0 auto",
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "0 10px",
    background: tone === "late" ? "#f7e7e5" : tone === "risk" ? "#fff1d6" : "#e7f3ea",
    color: tone === "late" ? CT.err : tone === "risk" ? "#986500" : CT.ok,
    fontSize: 11,
    fontWeight: 900,
  };
}

const deliveryDecisionSummaryStyle: CSSProperties = {
  color: CT.inkSub,
  fontSize: 13,
  lineHeight: 1.35,
};

const deliveryDecisionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const deliveryDecisionActionStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  borderTop: `1px solid ${CT.border}`,
  paddingTop: 9,
  color: CT.inkSub,
  fontSize: 12,
};

const deliveryAgentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

function deliveryAgentCardStyle(tone: "ok" | "risk" | "late"): CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minHeight: 58,
    border: `1px solid ${tone === "late" ? "rgba(178,34,34,0.22)" : tone === "risk" ? "rgba(169,111,0,0.22)" : CT.border}`,
    borderRadius: 7,
    background: "#fbfbf8",
    padding: 9,
    color: CT.inkSub,
    fontSize: 11,
  };
}

const semanticLayerBodyStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const semanticLayerColumnStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 7,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fbfbf8",
  padding: 9,
  color: CT.inkSub,
  fontSize: 11,
};

function semanticDecisionRowStyle(status: SemanticLayerDecision["status"]): CSSProperties {
  const edge = status === "late"
    ? "rgba(178,34,34,0.30)"
    : status === "at_risk" || status === "missing_context"
      ? "rgba(169,111,0,0.28)"
      : "rgba(63,143,91,0.24)";
  return {
    display: "grid",
    gap: 3,
    borderLeft: `3px solid ${edge}`,
    paddingLeft: 8,
    minWidth: 0,
  };
}

const semanticActionRowStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  borderLeft: `3px solid ${CT.accentEdge}`,
  paddingLeft: 8,
  minWidth: 0,
};

const semanticMutedTextStyle: CSSProperties = {
  color: CT.inkMuted,
};

const ontologyBottomBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  borderTop: `1px solid ${CT.border}`,
  padding: "10px 16px",
  color: CT.inkMuted,
  fontSize: 11,
  background: "#fffdf8",
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

const previewCellInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 82,
  border: `1px solid ${CT.border}`,
  borderRadius: 5,
  background: "#fffefb",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 12,
  fontWeight: 650,
  padding: "4px 6px",
  outline: 0,
};
