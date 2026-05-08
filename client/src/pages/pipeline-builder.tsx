import { useMemo, useState } from "react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  Braces,
  CheckCircle2,
  Columns3,
  Database,
  Eye,
  FileCode2,
  GitBranch,
  LayoutGrid,
  Link2,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Table2,
  Wand2,
} from "lucide-react";

type NodeKind = "input" | "transform" | "join" | "output";

type PipelineNode = {
  id: string;
  label: string;
  kind: NodeKind;
  columns: number;
  x: number;
  y: number;
  detail: string;
};

type Edge = { from: string; to: string };

const nodes: PipelineNode[] = [
  { id: "flight_alerts_raw", label: "flight_alerts_raw", kind: "input", columns: 9, x: 36, y: 106, detail: "Raw flight alerts dataset" },
  { id: "status_mapping_raw", label: "status_mapping_raw", kind: "input", columns: 2, x: 36, y: 236, detail: "Status value mapping" },
  { id: "passengers_preprocessed", label: "passengers_preprocessed", kind: "input", columns: 6, x: 36, y: 366, detail: "Passenger profile base" },
  { id: "flight_clean", label: "Flight Alerts - Clean", kind: "transform", columns: 9, x: 286, y: 106, detail: "Cast flight_date as Date, clean category whitespace" },
  { id: "status_clean", label: "Status Mapping - Clean", kind: "transform", columns: 2, x: 286, y: 236, detail: "Clean mapped_value strings" },
  { id: "passengers_clean", label: "Passengers - Clean", kind: "transform", columns: 7, x: 286, y: 366, detail: "Cast dob to dob_date, title case flyer_status" },
  { id: "join_status", label: "Join Status", kind: "join", columns: 11, x: 536, y: 164, detail: "Left join: status = value, right prefix status" },
  { id: "priority_mapping_raw", label: "priority_mapping_raw", kind: "input", columns: 2, x: 536, y: 314, detail: "Priority value mapping" },
  { id: "join_priority", label: "Join (2)", kind: "join", columns: 13, x: 764, y: 236, detail: "Left join: priority = value, right prefix priority" },
  { id: "flight_alerts_data", label: "Flight Alerts data", kind: "output", columns: 13, x: 970, y: 258, detail: "Dataset output using input schema" },
];

const edges: Edge[] = [
  { from: "flight_alerts_raw", to: "flight_clean" },
  { from: "status_mapping_raw", to: "status_clean" },
  { from: "passengers_preprocessed", to: "passengers_clean" },
  { from: "flight_clean", to: "join_status" },
  { from: "status_clean", to: "join_status" },
  { from: "join_status", to: "join_priority" },
  { from: "priority_mapping_raw", to: "join_priority" },
  { from: "join_priority", to: "flight_alerts_data" },
];

const previewRows = [
  ["delay", "2018-07-05", "Extreme Delays: UA200 GUM", "d9af5aeb9a584a7978e9634", "UA200 GUM->HNL", "14ea29e1", "Extreme Delays", "3"],
  ["delay", "2018-05-29", "Extreme Delays: OO4203 MSP", "20a98c774b4211303f655af", "OO4203 MSP->MLI", "14ea29e1", "Extreme Delays", "2"],
  ["delay", "2018-05-20", "Extreme Delays: DL1193 CMH", "31488da8e64c5881efaa34d", "DL1193 CMH->ATL", "14ea29e1", "Extreme Delays", "1"],
  ["delay", "2018-01-17", "Extreme Delays: OO4598 AUS", "c9c1fe17c7ab44b331a9581", "OO4598 AUS->DTW", "14ea29e1", "Extreme Delays", "2"],
  ["delay", "2018-06-26", "Extreme Delays: DL2009 OF", "9ec357dfaea60b27adc6acf", "DL2009 ORD->ATL", "14ea29e1", "Extreme Delays", "3"],
  ["security", "2018-02-02", "Security Delays over 1 Hour", "e9e72f06c6691e757cdc079", "YX4449 CHS->PHL", "a8639a8e", "Security Delays over 1 Hour", "2"],
];

const blueprint = `pipeline: Flight Alerts Data
type: Batch pipeline

inputs:
  - passengers_preprocessed
  - flight_alerts_raw
  - status_mapping_raw
  - priority_mapping_raw

transforms:
  - Flight Alerts - Clean:
      cast flight_date as Date format MM/dd/yy
      clean string category
  - Status Mapping - Clean:
      clean string mapped_value
  - Passengers - Clean:
      cast dob -> dob_date as Date format MM/dd/yy
      title case flyer_status

joins:
  - Join Status:
      type: left_join
      condition: status = value
      right_prefix: status
  - Join (2):
      type: left_join
      condition: priority = value
      right_prefix: priority

output:
  - Flight Alerts data:
      source: Join (2)
      schema: use input schema`;

const javaReference = `// Pipeline Builder export reference
// Foundry exports supported pipelines to:
// transforms-java/src/main/java/com/PipelineLogic.java

Dataset<Row> flightClean = flightAlertsRaw
  .withColumn("flight_date", to_date(col("flight_date"), "MM/dd/yy"))
  .withColumn("category", trim(regexp_replace(col("category"), "\\\\s+", " ")));

Dataset<Row> joinStatus = flightClean
  .join(statusMappingClean, flightClean.col("status").equalTo(statusMappingClean.col("value")), "left");

Dataset<Row> output = joinStatus
  .join(priorityMappingRaw, joinStatus.col("priority").equalTo(priorityMappingRaw.col("value")), "left");`;

const kindTone: Record<NodeKind, { bg: string; color: string; icon: JSX.Element }> = {
  input: { bg: CT.infoSoft, color: CT.info, icon: <Table2 size={15} /> },
  transform: { bg: CT.accentSoft, color: CT.accent, icon: <Wand2 size={15} /> },
  join: { bg: "rgba(116,95,180,0.12)", color: "#745fb4", icon: <Link2 size={15} /> },
  output: { bg: CT.okSoft, color: CT.ok, icon: <Database size={15} /> },
};

function NodeCard({ node, active, onSelect }: { node: PipelineNode; active: boolean; onSelect: () => void }) {
  const tone = kindTone[node.kind];
  return (
    <button
      onClick={onSelect}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.kind === "output" ? 190 : 212,
        height: node.kind === "join" ? 88 : 62,
        borderRadius: 7,
        border: `1px solid ${active ? CT.accentEdge : CT.borderStrong}`,
        background: CT.surface,
        boxShadow: active ? "0 8px 24px rgba(20,20,19,0.12)" : "0 2px 8px rgba(20,20,19,0.06)",
        color: CT.ink,
        fontFamily: CT_FONT,
        textAlign: "left",
        cursor: "pointer",
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: `1px solid ${CT.border}` }}>
        <span style={{ color: tone.color, display: "inline-flex" }}>{tone.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", color: CT.inkMuted, fontSize: 11 }}>
        <span>{node.columns} columns</span>
        {node.kind === "join" && <span style={{ color: tone.color }}>Left dataset</span>}
      </div>
    </button>
  );
}

function EdgeLine({ edge }: { edge: Edge }) {
  const from = nodes.find(n => n.id === edge.from)!;
  const to = nodes.find(n => n.id === edge.to)!;
  const fromW = from.kind === "output" ? 190 : 212;
  const fromH = from.kind === "join" ? 88 : 62;
  const toH = to.kind === "join" ? 88 : 62;
  const x1 = from.x + fromW;
  const y1 = from.y + fromH / 2;
  const x2 = to.x;
  const y2 = to.y + toH / 2;
  const mid = (x1 + x2) / 2;
  return (
    <g>
      <path d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke="rgba(86,101,119,0.55)" strokeWidth="2" />
      <circle cx={x1} cy={y1} r="6" fill={CT.surface} stroke="rgba(86,101,119,0.55)" strokeWidth="2" />
      <circle cx={x2} cy={y2} r="6" fill={CT.surface} stroke="rgba(86,101,119,0.55)" strokeWidth="2" />
    </g>
  );
}

export default function PipelineBuilderPage() {
  const [selectedId, setSelectedId] = useState("join_status");
  const [codeTab, setCodeTab] = useState<"blueprint" | "java">("blueprint");
  const selected = useMemo(() => nodes.find(n => n.id === selectedId) ?? nodes[0], [selectedId]);
  const selectedTone = kindTone[selected.kind];

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT }}>
      <TopNav />

      <div style={{ height: 46, borderBottom: `1px solid ${CT.border}`, background: CT.surface, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GitBranch size={18} color={CT.accent} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Flight Alerts Pipeline Builder</div>
            <div style={{ fontSize: 10, color: CT.inkMuted, fontFamily: CT_MONO }}>Main / Batch / Foundry reference blueprint</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={toolbarButtonStyle}><Save size={14} />Save</button>
          <button style={{ ...toolbarButtonStyle, color: CT.ok, borderColor: "rgba(63,143,91,0.28)", background: CT.okSoft }}><Play size={14} />Deploy</button>
          <button style={iconButtonStyle}><Settings2 size={15} /></button>
        </div>
      </div>

      <div style={{ height: 54, borderBottom: `1px solid ${CT.border}`, display: "flex", alignItems: "center", gap: 14, padding: "0 18px", background: "rgba(250,249,245,0.72)" }}>
        <button style={toolbarButtonStyle}><Plus size={15} />Add datasets</button>
        <button style={toolbarButtonStyle}><Braces size={15} />Parameters</button>
        <div style={{ width: 1, height: 26, background: CT.border }} />
        <button style={iconButtonStyle}><Columns3 size={16} /></button>
        <button style={iconButtonStyle}><LayoutGrid size={16} /></button>
        <button style={iconButtonStyle}><Wand2 size={16} /></button>
        <span style={{ fontSize: 11, color: CT.inkMuted, marginLeft: 2 }}>Transform tools</span>
      </div>

      <main style={{ display: "grid", gridTemplateColumns: "minmax(720px, 1fr) 340px", minHeight: "calc(100vh - 150px)" }}>
        <section style={{ display: "grid", gridTemplateRows: "1fr 278px", minWidth: 0 }}>
          <div style={{ position: "relative", overflow: "auto", background: "#eef1f5" }}>
            <div style={{ position: "relative", width: 1168, height: 584 }}>
              <StageLabel text="Input" left={46} top={34} width={204} />
              <StageLabel text="Transform" left={278} top={34} width={628} />
              <StageLabel text="Output" left={934} top={164} width={210} />
              <svg width="1168" height="584" style={{ position: "absolute", inset: 0 }}>
                {edges.map(edge => <EdgeLine key={`${edge.from}-${edge.to}`} edge={edge} />)}
              </svg>
              {nodes.map(node => (
                <NodeCard key={node.id} node={node} active={node.id === selectedId} onSelect={() => setSelectedId(node.id)} />
              ))}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${CT.borderStrong}`, background: CT.surface, overflow: "hidden" }}>
            <div style={{ height: 38, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: `1px solid ${CT.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <Eye size={15} color={CT.accent} /> Data preview
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: CT.inkMuted, fontSize: 11 }}>
                <CheckCircle2 size={14} color={CT.ok} /> 6 sample rows from {selected.label}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: 240 }}>
              <aside style={{ borderRight: `1px solid ${CT.border}`, padding: 12, overflow: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${CT.borderStrong}`, borderRadius: 7, padding: "8px 10px", marginBottom: 12 }}>
                  <Search size={14} color={CT.inkMuted} />
                  <span style={{ color: CT.inkMuted, fontSize: 12 }}>Search 13 columns...</span>
                </div>
                {["category", "flight_date", "alert_display_name", "flight_id", "flight_display_name", "rule_id", "rule_name", "priority"].map(col => (
                  <div key={col} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28, fontSize: 12, borderBottom: `1px solid ${CT.border}` }}>
                    <span>{col}</span>
                    <Settings2 size={12} color={CT.inkMuted} />
                  </div>
                ))}
              </aside>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["category", "flight_date", "alert_display_name", "flight_id", "flight_display_name", "rule_id", "rule_name", "priority"].map(h => (
                        <th key={h} style={thStyle}>{h}<div style={{ color: CT.inkMuted, fontWeight: 400, fontSize: 10 }}>{h === "priority" ? "Integer" : h === "flight_date" ? "Date" : "String"}</div></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={idx}>
                        {row.map((cell, cidx) => <td key={`${idx}-${cidx}`} style={tdStyle}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <aside style={{ borderLeft: `1px solid ${CT.border}`, background: CT.surface, minWidth: 0 }}>
          <div style={{ padding: 18, borderBottom: `1px solid ${CT.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 8, background: selectedTone.bg, color: selectedTone.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selectedTone.icon}
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 650 }}>{selected.label}</div>
                <div style={{ fontSize: 11, color: CT.inkMuted, textTransform: "uppercase", letterSpacing: 1 }}>{selected.kind}</div>
              </div>
            </div>
            <p style={{ margin: 0, color: CT.inkSub, fontSize: 13, lineHeight: 1.55 }}>{selected.detail}</p>
          </div>

          <div style={{ padding: 18, borderBottom: `1px solid ${CT.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 650 }}>
                <FileCode2 size={15} color={CT.accent} /> Reference
              </div>
              <div style={{ display: "flex", border: `1px solid ${CT.border}`, borderRadius: 7, overflow: "hidden" }}>
                {(["blueprint", "java"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setCodeTab(tab)}
                    style={{
                      border: 0,
                      background: codeTab === tab ? CT.accentSoft : CT.surface,
                      color: codeTab === tab ? CT.accent : CT.inkMuted,
                      fontSize: 10,
                      fontFamily: CT_MONO,
                      padding: "6px 8px",
                      cursor: "pointer",
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: CT.bgAlt, border: `1px solid ${CT.border}`, color: CT.inkSub, fontFamily: CT_MONO, fontSize: 10.5, lineHeight: 1.6, overflow: "auto", maxHeight: 360 }}>
              {codeTab === "blueprint" ? blueprint : javaReference}
            </pre>
          </div>

          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 12 }}>Build checks</div>
            {["Strict output schema ready", "Unused branch pruned", "Join keys resolved", "Dataset output configured"].map(check => (
              <div key={check} style={{ display: "flex", alignItems: "center", gap: 8, height: 30, color: CT.inkSub, fontSize: 12 }}>
                <CheckCircle2 size={14} color={CT.ok} /> {check}
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function StageLabel({ text, left, top, width }: { text: string; left: number; top: number; width: number }) {
  return (
    <div style={{
      position: "absolute",
      left,
      top,
      width,
      height: text === "Transform" ? 506 : 294,
      border: `2px solid rgba(201,100,66,0.42)`,
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

const toolbarButtonStyle: React.CSSProperties = {
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

const iconButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${CT.borderStrong}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.inkSub,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  background: "#f3f4f6",
  borderBottom: `1px solid ${CT.borderStrong}`,
  borderRight: `1px solid ${CT.border}`,
  color: "#657084",
  fontWeight: 700,
  minWidth: 156,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: `1px solid ${CT.border}`,
  borderRight: `1px solid ${CT.border}`,
  color: CT.ink,
  whiteSpace: "nowrap",
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
