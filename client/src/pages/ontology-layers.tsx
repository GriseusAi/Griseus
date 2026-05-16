import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  Activity,
  Boxes,
  BrainCircuit,
  CircleDot,
  Database,
  GitBranch,
  Layers3,
  Network,
  Search,
  SlidersHorizontal,
  Split,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

type OntologyObjectType = {
  id: string;
  displayName: string;
  displayNameTr?: string;
  description?: string;
  icon?: string;
  backingTable: string;
  titleField?: string;
  ontologyAxis?: "miktar" | "sure" | "bilesen" | null;
  properties: Record<string, { type: string; displayName: string; displayNameTr?: string; required?: boolean; unit?: string }>;
};

type OntologyLinkType = {
  id: string;
  displayName: string;
  sourceObjectType: string;
  targetObjectType: string;
  sourceField: string;
  targetField: string;
  cardinality: string;
};

type OntologyFunctionType = {
  id: string;
  displayName: string;
  displayNameTr?: string;
  description?: string;
  sourceObjectType: string;
  returnType: string;
  implementation: string;
  ontologyEdge?: string | null;
};

type OntologyGraphResponse = {
  objectTypes: OntologyObjectType[];
  linkTypes: OntologyLinkType[];
  functionTypes: OntologyFunctionType[];
  actionTypes: Array<{ id: string; targetObjectType: string; displayName: string; enabled: boolean }>;
  stats: { objects: number; links: number; actions: number; functions: number };
};

type PipelineDefinitionsResponse = {
  pipelines?: Array<{
    id: string;
    name: string;
    savedAt?: string;
    nodes?: Array<{ semanticRole?: string; kind?: string }>;
    connections?: Array<{ contract?: { relation?: string; status?: string } }>;
  }>;
};

type Mode = "schema" | "links" | "functions" | "scenarios";

const axisMeta: Record<string, { label: string; color: string; bg: string }> = {
  bilesen: { label: "Bilesen", color: "#3c6f7a", bg: "rgba(60,111,122,0.10)" },
  miktar: { label: "Miktar", color: "#9a6a22", bg: "rgba(154,106,34,0.12)" },
  sure: { label: "Sure", color: "#6f5ea8", bg: "rgba(111,94,168,0.12)" },
  none: { label: "Baglam", color: CT.inkMuted, bg: CT.surfaceMuted },
};

export default function OntologyLayersPage() {
  const [mode, setMode] = useState<Mode>("schema");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("product");

  const { data: graph, isLoading } = useQuery<OntologyGraphResponse>({
    queryKey: ["/api/ontology/graph"],
  });
  const { data: definitions } = useQuery<PipelineDefinitionsResponse>({
    queryKey: ["/api/pipeline-builder/definitions"],
  });

  const objects = graph?.objectTypes ?? [];
  const links = graph?.linkTypes ?? [];
  const functions = graph?.functionTypes ?? [];
  const scenarios = definitions?.pipelines ?? [];
  const filteredObjects = objects.filter(item => {
    const haystack = `${item.id} ${item.displayName} ${item.displayNameTr ?? ""} ${item.backingTable}`.toLocaleLowerCase("tr-TR");
    return haystack.includes(query.toLocaleLowerCase("tr-TR"));
  });
  const selected = objects.find(item => item.id === selectedId) ?? objects[0];

  const linkCountByObject = useMemo(() => {
    const counts = new Map<string, number>();
    links.forEach(link => {
      counts.set(link.sourceObjectType, (counts.get(link.sourceObjectType) ?? 0) + 1);
      counts.set(link.targetObjectType, (counts.get(link.targetObjectType) ?? 0) + 1);
    });
    return counts;
  }, [links]);

  const functionsByObject = useMemo(() => {
    const counts = new Map<string, number>();
    functions.forEach(fn => counts.set(fn.sourceObjectType, (counts.get(fn.sourceObjectType) ?? 0) + 1));
    return counts;
  }, [functions]);

  return (
    <div style={pageStyle}>
      <TopNav />
      <main style={shellStyle}>
        <section style={toolbarStyle}>
          <div>
            <div style={eyebrowStyle}>Semantic workspace</div>
            <h1 style={titleStyle}>Ontology</h1>
          </div>
          <div style={searchWrapStyle}>
            <Search size={15} color={CT.inkMuted} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Object, tablo veya semantic rol ara"
              style={searchInputStyle}
            />
          </div>
        </section>

        <section style={modeBarStyle}>
          <ModeButton icon={<Boxes size={15} />} label="Objects" active={mode === "schema"} onClick={() => setMode("schema")} />
          <ModeButton icon={<GitBranch size={15} />} label="Links" active={mode === "links"} onClick={() => setMode("links")} />
          <ModeButton icon={<Activity size={15} />} label="Functions" active={mode === "functions"} onClick={() => setMode("functions")} />
          <ModeButton icon={<Split size={15} />} label="Scenarios" active={mode === "scenarios"} onClick={() => setMode("scenarios")} />
        </section>

        <section style={statsGridStyle}>
          <Stat icon={<Database size={16} />} label="Objects" value={graph?.stats.objects ?? objects.length} />
          <Stat icon={<Network size={16} />} label="Links" value={graph?.stats.links ?? links.length} />
          <Stat icon={<BrainCircuit size={16} />} label="Functions" value={graph?.stats.functions ?? functions.length} />
          <Stat icon={<Layers3 size={16} />} label="Saved scenarios" value={scenarios.length} />
        </section>

        <section style={workspaceStyle}>
          <aside style={objectRailStyle}>
            <div style={panelHeaderStyle}>
              <span>Object set</span>
              <SlidersHorizontal size={14} color={CT.inkMuted} />
            </div>
            {isLoading && <div style={emptyStyle}>Ontology yukleniyor.</div>}
            {!isLoading && filteredObjects.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                style={objectButtonStyle(selected?.id === item.id)}
              >
                <span style={objectIconStyle}>{item.icon || "[]"}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={objectTitleStyle}>{item.displayNameTr || item.displayName}</strong>
                  <span style={objectMetaStyle}>{item.backingTable}</span>
                </span>
                <AxisBadge axis={item.ontologyAxis} />
              </button>
            ))}
          </aside>

          <div style={canvasStyle}>
            {mode === "schema" && (
              <SchemaCanvas
                objects={filteredObjects}
                links={links}
                selectedId={selected?.id}
                onSelect={setSelectedId}
              />
            )}
            {mode === "links" && <LinkMatrix objects={objects} links={links} selectedId={selected?.id} />}
            {mode === "functions" && <FunctionBoard functions={functions} objects={objects} selectedId={selected?.id} />}
            {mode === "scenarios" && <ScenarioBoard scenarios={scenarios} />}
          </div>

          <aside style={detailStyle}>
            <div style={panelHeaderStyle}>
              <span>Inspector</span>
              <CircleDot size={14} color={CT.accent} />
            </div>
            {selected ? (
              <>
                <div style={inspectorHeadStyle}>
                  <span style={bigIconStyle}>{selected.icon || "[]"}</span>
                  <div>
                    <h2 style={inspectorTitleStyle}>{selected.displayNameTr || selected.displayName}</h2>
                    <div style={inspectorSubStyle}>{selected.id} · {selected.backingTable}</div>
                  </div>
                </div>
                <p style={descriptionStyle}>{selected.description || "Semantic object type."}</p>
                <div style={miniMetricGridStyle}>
                  <MiniMetric label="Fields" value={Object.keys(selected.properties ?? {}).length} />
                  <MiniMetric label="Links" value={linkCountByObject.get(selected.id) ?? 0} />
                  <MiniMetric label="Functions" value={functionsByObject.get(selected.id) ?? 0} />
                </div>
                <div style={sectionLabelStyle}>Properties</div>
                <div style={propertyListStyle}>
                  {Object.entries(selected.properties ?? {}).slice(0, 8).map(([key, prop]) => (
                    <div key={key} style={propertyRowStyle}>
                      <span>{prop.displayNameTr || prop.displayName || key}</span>
                      <strong>{prop.type}{prop.unit ? ` · ${prop.unit}` : ""}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={emptyStyle}>Object sec.</div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

function SchemaCanvas({ objects, links, selectedId, onSelect }: {
  objects: OntologyObjectType[];
  links: OntologyLinkType[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const positions = useMemo(() => layoutObjects(objects), [objects]);
  return (
    <div style={canvasInnerStyle}>
      <svg viewBox="0 0 980 520" style={svgStyle} role="img" aria-label="Ontology semantic graph">
        <defs>
          <pattern id="ontology-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(20,20,19,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="980" height="520" fill="url(#ontology-grid)" />
        {links.map(link => {
          const source = positions.get(link.sourceObjectType);
          const target = positions.get(link.targetObjectType);
          if (!source || !target) return null;
          return (
            <g key={link.id}>
              <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="rgba(85,100,110,0.35)" strokeWidth="1.4" />
              <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6} fill={CT.inkMuted} fontSize="10" textAnchor="middle">{shortLinkLabel(link.displayName)}</text>
            </g>
          );
        })}
        {objects.map(item => {
          const p = positions.get(item.id);
          if (!p) return null;
          const active = item.id === selectedId;
          const axis = axisMeta[item.ontologyAxis || "none"] ?? axisMeta.none;
          return (
            <g key={item.id} onClick={() => onSelect(item.id)} style={{ cursor: "pointer" }}>
              <rect x={p.x - 86} y={p.y - 30} width="172" height="60" rx="8" fill={active ? "#fffaf4" : CT.surface} stroke={active ? CT.borderStrong : CT.border} strokeWidth={active ? 2 : 1} />
              <circle cx={p.x - 62} cy={p.y} r="13" fill={axis.bg} stroke={axis.color} />
              <text x={p.x - 62} y={p.y + 4} fill={axis.color} fontSize="12" textAnchor="middle">{item.icon || "o"}</text>
              <text x={p.x - 40} y={p.y - 4} fill={CT.ink} fontSize="13" fontWeight="700">{item.displayNameTr || item.displayName}</text>
              <text x={p.x - 40} y={p.y + 14} fill={CT.inkMuted} fontSize="10">{item.backingTable}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LinkMatrix({ objects, links, selectedId }: {
  objects: OntologyObjectType[];
  links: OntologyLinkType[];
  selectedId?: string;
}) {
  return (
    <div style={boardStyle}>
      <div style={boardTitleStyle}>Semantic links</div>
      <div style={linkListStyle}>
        {links.map(link => {
          const active = link.sourceObjectType === selectedId || link.targetObjectType === selectedId;
          const source = objects.find(item => item.id === link.sourceObjectType);
          const target = objects.find(item => item.id === link.targetObjectType);
          return (
            <div key={link.id} style={linkRowStyle(active)}>
              <strong>{source?.displayNameTr || source?.displayName || link.sourceObjectType}</strong>
              <span>{link.sourceField}</span>
              <GitBranch size={14} color={active ? CT.accent : CT.inkMuted} />
              <span>{link.targetField}</span>
              <strong>{target?.displayNameTr || target?.displayName || link.targetObjectType}</strong>
              <em>{link.cardinality.replaceAll("_", " ")}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunctionBoard({ functions, objects, selectedId }: {
  functions: OntologyFunctionType[];
  objects: OntologyObjectType[];
  selectedId?: string;
}) {
  const visible = functions.filter(fn => !selectedId || fn.sourceObjectType === selectedId || functions.length < 6);
  const rows = visible.length > 0 ? visible : functions;
  return (
    <div style={boardStyle}>
      <div style={boardTitleStyle}>Derived intelligence</div>
      <div style={functionGridStyle}>
        {rows.map(fn => {
          const source = objects.find(item => item.id === fn.sourceObjectType);
          const active = fn.sourceObjectType === selectedId;
          return (
            <div key={fn.id} style={functionCardStyle(active)}>
              <div style={functionTopStyle}>
                <Activity size={15} color={active ? CT.accent : CT.inkMuted} />
                <span>{fn.returnType}</span>
              </div>
              <strong>{fn.displayNameTr || fn.displayName}</strong>
              <p>{fn.description || fn.implementation}</p>
              <div style={functionFooterStyle}>
                <span>{source?.displayNameTr || source?.displayName || fn.sourceObjectType}</span>
                <span>{fn.ontologyEdge?.replaceAll("_", " · ") || "context"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioBoard({ scenarios }: { scenarios: NonNullable<PipelineDefinitionsResponse["pipelines"]> }) {
  return (
    <div style={boardStyle}>
      <div style={boardTitleStyle}>Saved scenario diagrams</div>
      <div style={scenarioGridStyle}>
        {scenarios.length === 0 && <div style={emptyStyle}>Kayitli pipeline senaryosu bulunamadi.</div>}
        {scenarios.map(item => {
          const semanticNodes = item.nodes?.filter(node => node.semanticRole).length ?? 0;
          const contracts = item.connections?.filter(connection => connection.contract?.relation).length ?? 0;
          return (
            <div key={item.id} style={scenarioCardStyle}>
              <div style={scenarioHeaderStyle}>
                <strong>{item.name}</strong>
                <span>{item.savedAt ? new Date(item.savedAt).toLocaleDateString("tr-TR") : "local"}</span>
              </div>
              <div style={scenarioPathStyle}>
                <span>Input</span>
                <span>Transform</span>
                <span>Preview</span>
                <span>Output</span>
              </div>
              <div style={miniMetricGridStyle}>
                <MiniMetric label="Nodes" value={item.nodes?.length ?? 0} />
                <MiniMetric label="Semantic" value={semanticNodes} />
                <MiniMetric label="Contracts" value={contracts} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={modeButtonStyle(active)}>
      {icon}
      {label}
    </button>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div style={statStyle}>
      <span style={statIconStyle}>{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={miniMetricStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AxisBadge({ axis }: { axis?: string | null }) {
  const meta = axisMeta[axis || "none"] ?? axisMeta.none;
  return <span style={{ ...axisBadgeStyle, color: meta.color, background: meta.bg }}>{meta.label}</span>;
}

function layoutObjects(objects: OntologyObjectType[]) {
  const buckets = {
    bilesen: objects.filter(item => item.ontologyAxis === "bilesen"),
    miktar: objects.filter(item => item.ontologyAxis === "miktar"),
    sure: objects.filter(item => item.ontologyAxis === "sure"),
    none: objects.filter(item => !item.ontologyAxis),
  };
  const map = new Map<string, { x: number; y: number }>();
  placeBucket(buckets.bilesen, 260, 135, 145, map);
  placeBucket(buckets.miktar, 250, 370, 145, map);
  placeBucket(buckets.sure, 700, 160, 145, map);
  placeBucket(buckets.none, 700, 382, 145, map);
  return map;
}

function placeBucket(items: OntologyObjectType[], x: number, y: number, step: number, map: Map<string, { x: number; y: number }>) {
  items.forEach((item, index) => {
    map.set(item.id, {
      x: x + (index % 2) * step,
      y: y + Math.floor(index / 2) * 78,
    });
  });
}

function shortLinkLabel(label: string) {
  return label.replace("Product has ", "").replace("Component has ", "").replace(" has ", " -> ");
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: CT.bg,
  color: CT.ink,
  fontFamily: CT_FONT,
};

const shellStyle: CSSProperties = {
  padding: "18px clamp(14px, 2vw, 28px) 28px",
  display: "grid",
  gap: 12,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  color: CT.accent,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  fontWeight: 800,
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 850,
  letterSpacing: 0,
};

const searchWrapStyle: CSSProperties = {
  width: "min(420px, 42vw)",
  height: 36,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surface,
  padding: "0 10px",
};

const searchInputStyle: CSSProperties = {
  border: 0,
  outline: "none",
  background: "transparent",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 13,
  width: "100%",
};

const modeBarStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  borderBottom: `1px solid ${CT.border}`,
  paddingBottom: 10,
};

function modeButtonStyle(active: boolean): CSSProperties {
  return {
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${active ? CT.borderStrong : CT.border}`,
    borderRadius: 7,
    background: active ? CT.accentSoft : CT.surface,
    color: active ? CT.accent : CT.inkSub,
    fontFamily: CT_FONT,
    fontSize: 12,
    fontWeight: 850,
    padding: "0 12px",
    cursor: "pointer",
  };
}

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const statStyle: CSSProperties = {
  minHeight: 70,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "32px 1fr auto",
  alignItems: "center",
  gap: 10,
  color: CT.inkSub,
  fontSize: 12,
};

const statIconStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 7,
  background: CT.surfaceMuted,
  color: CT.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const workspaceStyle: CSSProperties = {
  minHeight: "calc(100vh - 232px)",
  display: "grid",
  gridTemplateColumns: "270px minmax(520px, 1fr) 310px",
  gap: 10,
};

const objectRailStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 10,
  overflow: "auto",
};

const panelHeaderStyle: CSSProperties = {
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: CT.ink,
  fontSize: 12,
  fontWeight: 850,
};

function objectButtonStyle(active: boolean): CSSProperties {
  return {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 9,
    minHeight: 54,
    border: `1px solid ${active ? CT.borderStrong : CT.border}`,
    borderRadius: 8,
    background: active ? "#fffaf4" : CT.surface,
    color: CT.ink,
    cursor: "pointer",
    fontFamily: CT_FONT,
    textAlign: "left",
    padding: "8px 9px",
    marginTop: 7,
  };
}

const objectIconStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  background: CT.surfaceMuted,
  fontSize: 14,
};

const objectTitleStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
};

const objectMetaStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 10,
  color: CT.inkMuted,
  fontFamily: CT_MONO,
  marginTop: 3,
};

const axisBadgeStyle: CSSProperties = {
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 850,
  padding: "3px 7px",
};

const canvasStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  minWidth: 0,
  overflow: "hidden",
};

const canvasInnerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 560,
};

const svgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 560,
  display: "block",
};

const detailStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 12,
  overflow: "auto",
};

const inspectorHeadStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  marginTop: 10,
};

const bigIconStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 8,
  background: CT.surfaceMuted,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
};

const inspectorTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 850,
};

const inspectorSubStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: CT.inkMuted,
  fontFamily: CT_MONO,
};

const descriptionStyle: CSSProperties = {
  fontSize: 12,
  color: CT.inkSub,
  lineHeight: 1.55,
  margin: "14px 0",
};

const miniMetricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const miniMetricStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surfaceMuted,
  padding: 8,
  display: "grid",
  gap: 5,
  fontSize: 10,
  color: CT.inkMuted,
};

const sectionLabelStyle: CSSProperties = {
  marginTop: 18,
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 850,
  color: CT.ink,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const propertyListStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const propertyRowStyle: CSSProperties = {
  minHeight: 32,
  borderTop: `1px solid ${CT.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 11,
  color: CT.inkSub,
};

const boardStyle: CSSProperties = {
  padding: 14,
  height: "100%",
  overflow: "auto",
};

const boardTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 850,
  marginBottom: 12,
};

const linkListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

function linkRowStyle(active: boolean): CSSProperties {
  return {
    minHeight: 44,
    display: "grid",
    gridTemplateColumns: "1fr 0.8fr 24px 0.8fr 1fr 110px",
    alignItems: "center",
    gap: 10,
    border: `1px solid ${active ? CT.borderStrong : CT.border}`,
    borderRadius: 8,
    background: active ? "#fffaf4" : CT.surface,
    padding: "8px 10px",
    color: CT.inkSub,
    fontSize: 12,
  };
}

const functionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

function functionCardStyle(active: boolean): CSSProperties {
  return {
    minHeight: 150,
    border: `1px solid ${active ? CT.borderStrong : CT.border}`,
    borderRadius: 8,
    background: active ? "#fffaf4" : CT.surface,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
}

const functionTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: CT.inkMuted,
  fontSize: 10,
  fontFamily: CT_MONO,
};

const functionFooterStyle: CSSProperties = {
  marginTop: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  color: CT.inkMuted,
  fontSize: 10,
  fontFamily: CT_MONO,
};

const scenarioGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const scenarioCardStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 12,
  display: "grid",
  gap: 12,
};

const scenarioHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
};

const scenarioPathStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 6,
  color: CT.accent,
  fontSize: 11,
  fontWeight: 850,
};

const emptyStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 12,
  padding: 12,
};

