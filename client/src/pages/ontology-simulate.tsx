import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ═══════════════════════════════════════════════════════════
   COCKPIT — Palantir Simulation Engine pattern
   Zone 1 (sol): Alert Feed (orchestrator findings)
   Zone 2 (orta): Time Series + Object Inspector
   Zone 3 (sağ): Scenario Manager (save / apply / compare)
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#050505",
  surface: "rgba(255,255,255,0.03)",
  surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8",
  accentDim: "rgba(129,140,248,0.10)",
  ok: "#34d399",
  okDim: "rgba(52,211,153,0.08)",
  okBorder: "rgba(52,211,153,0.25)",
  warn: "#fbbf24",
  warnDim: "rgba(251,191,36,0.08)",
  warnBorder: "rgba(251,191,36,0.25)",
  err: "#ef4444",
  errDim: "rgba(239,68,68,0.08)",
  errBorder: "rgba(239,68,68,0.30)",
  variable: "#ea580c",
  variableDim: "rgba(234,88,12,0.10)",
  variableBorder: "rgba(234,88,12,0.35)",
  blue: "#60a5fa",
  blueDim: "rgba(96,165,250,0.08)",
  blueBorder: "rgba(96,165,250,0.25)",
  purple: "#a78bfa",
  white: "#f0f0f5",
  mid: "#7a7a90",
  dim: "#4a4a60",
  dimmer: "#2a2a3a",
};
const mono = "'Outfit', sans-serif";
const fmt = (n: number) => (isFinite(n) ? n.toLocaleString("tr-TR") : "—");

const BH_SKUS = ["BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV"] as const;

/* Types */
interface BomComponent {
  code: string;
  name: string;
  currentStock: number;
  tier: number;
  isSubAssembly?: boolean;
  children?: BomComponent[];
  status: string;
}
interface BomResponse { product: string; components: BomComponent[] }

interface OrchestratorRun {
  id: number;
  timestamp: string;
  trigger: string;
  triggerDetail: string | null;
  durationMs: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  findings: Array<{ layer: string; severity: string; message: string; sku?: string; data?: any }>;
  summary: string | null;
}

interface Scenario {
  id: number;
  name: string;
  description: string | null;
  status: "draft" | "active" | "applied" | "archived";
  createdAt: string;
  updatedAt: string;
  simulationResult: any;
}

interface ScenarioDetail extends Scenario {
  overrides: Array<{
    id: number;
    entity: string;
    entityId: string;
    field: string;
    originalValue: string | null;
    overrideValue: string;
  }>;
}

interface TimeSeries {
  code: string;
  kind: "device" | "component";
  salesMonthly: Array<{ year: number; month: number; units: number; label: string }>;
  stockHistory: Array<{ date: string; stock: number }>;
  current: {
    stock: number | null;
    unit: string | null;
    dailyBurnRate: number | null;
    seasonalDays: number | null;
    daysToStockout: number | null;
    depletionMonth: string | null;
  };
  meta: { snapshotPointCount: number; salesMonthCount: number; usedBySkus: string[] };
}

/* Severity helpers */
function severityColor(sev: string): { fg: string; bg: string; border: string } {
  switch (sev) {
    case "red":    return { fg: C.err, bg: C.errDim, border: C.errBorder };
    case "yellow": return { fg: C.warn, bg: C.warnDim, border: C.warnBorder };
    case "green":  return { fg: C.ok, bg: C.okDim, border: C.okBorder };
    default:       return { fg: C.mid, bg: C.surface, border: C.border };
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function OntologySimulatePage() {
  const qc = useQueryClient();

  /* Selected node (code, optionally with SKU for components shared) */
  const [selectedCode, setSelectedCode] = useState<string>(BH_SKUS[0]);
  const [selectedSku, setSelectedSku] = useState<string>(BH_SKUS[0]);

  /* Node picker: fetch BOMs to build options */
  const bomQueries = BH_SKUS.map(sku =>
    useQuery<BomResponse>({ queryKey: [`/api/bom/${sku}/stock`] })
  );
  const bomsLoaded = bomQueries.every(q => q.data);

  const allNodes = useMemo(() => {
    const list: Array<{ code: string; name: string; kind: "device" | "component" | "subassembly"; parentSku?: string }> = [];
    BH_SKUS.forEach(sku => list.push({ code: sku, name: sku, kind: "device" }));
    if (!bomsLoaded) return list;
    const seen = new Set(BH_SKUS as readonly string[]);
    bomQueries.forEach((q, i) => {
      const sku = BH_SKUS[i];
      for (const c of q.data!.components) {
        if (seen.has(c.code)) continue;
        seen.add(c.code);
        list.push({ code: c.code, name: c.name, kind: c.isSubAssembly ? "subassembly" : "component", parentSku: sku });
      }
    });
    return list;
  }, [bomsLoaded, bomQueries]);

  /* Orchestrator latest findings */
  const orchQuery = useQuery<OrchestratorRun>({
    queryKey: ["/api/orchestrator/latest"],
    refetchInterval: 60_000,
    retry: false,
  });

  /* Scenario list */
  const scenariosQuery = useQuery<Scenario[]>({
    queryKey: ["/api/foundry/scenarios"],
  });

  /* Selected scenario detail */
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  /* Pre-select scenario from ?scenario=<id> (geliş bh-ontology Strateji modal) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("scenario");
    const num = id ? parseInt(id, 10) : NaN;
    if (!isNaN(num) && num > 0) setSelectedScenarioId(num);
  }, []);
  const scenarioDetailQuery = useQuery<ScenarioDetail>({
    queryKey: [`/api/foundry/scenarios/${selectedScenarioId}`],
    enabled: selectedScenarioId != null,
  });

  /* Time series for selected node */
  const timeseriesQuery = useQuery<TimeSeries>({
    queryKey: [`/api/ontology/timeseries/${selectedCode}`, selectedSku],
    queryFn: async () => {
      const url = `/api/ontology/timeseries/${encodeURIComponent(selectedCode)}${selectedSku ? `?sku=${encodeURIComponent(selectedSku)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ts ${res.status}`);
      return res.json();
    },
  });

  /* Create scenario mutation */
  const createScenario = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/foundry/scenarios", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/foundry/scenarios"] });
    },
  });

  /* Apply scenario */
  const applyScenario = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/foundry/scenarios/${id}/apply`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/foundry/scenarios"] });
      qc.invalidateQueries({ queryKey: [`/api/foundry/scenarios/${selectedScenarioId}`] });
      BH_SKUS.forEach(sku => {
        qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      });
    },
  });

  /* Simulate scenario */
  const simulateScenario = useMutation({
    mutationFn: async ({ id, sku }: { id: number; sku: string }) => {
      const res = await apiRequest("POST", `/api/foundry/scenarios/${id}/simulate`, { sku });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/foundry/scenarios/${selectedScenarioId}`] });
    },
  });

  /* WS — keep data fresh */
  const handleStockUpdate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [`/api/ontology/timeseries/${selectedCode}`] });
    qc.invalidateQueries({ queryKey: ["/api/orchestrator/latest"] });
  }, [qc, selectedCode]);
  const { connected } = useStockWebSocket(handleStockUpdate);

  /* Jump to node from alert finding */
  const jumpToNode = useCallback((code: string, sku?: string) => {
    setSelectedCode(code);
    if (sku) setSelectedSku(sku);
    else {
      const node = allNodes.find(n => n.code === code);
      if (node?.parentSku) setSelectedSku(node.parentSku);
    }
  }, [allNodes]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: mono }}>
      <TopNav connected={connected} />

      {/* Header */}
      <div style={{
        padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 9, color: C.variable, letterSpacing: 2.2, fontWeight: 500 }}>SIMULATION ENGINE</div>
          <div style={{ fontSize: 20, color: C.white, marginTop: 4, fontWeight: 600, letterSpacing: 0.3 }}>
            Senaryo Kokpiti
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
            Alert → Zaman Serisi → Senaryo · Palantir Simulation Engine pattern
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NodePicker allNodes={allNodes} selectedCode={selectedCode} onSelect={(code, sku) => { setSelectedCode(code); if (sku) setSelectedSku(sku); }} />
          <Link href="/ontology">
            <a style={{
              padding: "10px 16px", borderRadius: 8, cursor: "pointer",
              background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
              fontSize: 12, fontFamily: mono, textDecoration: "none", letterSpacing: 0.5,
            }}>◈ Canvas'a Dön</a>
          </Link>
        </div>
      </div>

      {/* 3-zone grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr 360px",
        gridTemplateRows: "minmax(0, 1fr)",
        height: "calc(100vh - 132px)",
      }}>
        {/* ZONE 1: Alert Feed */}
        <div style={{
          borderRight: `1px solid ${C.border}`, overflow: "auto",
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12,
        }}>
          <AlertFeed
            run={orchQuery.data}
            loading={orchQuery.isLoading}
            error={orchQuery.error}
            onJump={jumpToNode}
          />
        </div>

        {/* ZONE 2: Time Series + Detail */}
        <div style={{
          overflow: "auto", padding: "14px 18px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <TimeSeriesPanel
            data={timeseriesQuery.data}
            loading={timeseriesQuery.isLoading}
            error={timeseriesQuery.error}
            code={selectedCode}
            allNodes={allNodes}
          />
          {selectedScenarioId != null && scenarioDetailQuery.data && (
            <ScenarioDetailPanel
              detail={scenarioDetailQuery.data}
              selectedSku={selectedSku}
              onSimulate={(id) => simulateScenario.mutate({ id, sku: selectedSku })}
              onApply={(id) => {
                if (!confirm(`"${scenarioDetailQuery.data!.name}" senaryosu GERÇEK stoklara uygulanacak. Emin misin?`)) return;
                applyScenario.mutate(id);
              }}
              simulating={simulateScenario.isPending}
              applying={applyScenario.isPending}
              onClose={() => setSelectedScenarioId(null)}
            />
          )}
        </div>

        {/* ZONE 3: Scenario Manager */}
        <div style={{
          borderLeft: `1px solid ${C.border}`, overflow: "auto",
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12,
        }}>
          <ScenarioManager
            scenarios={scenariosQuery.data ?? []}
            loading={scenariosQuery.isLoading}
            selectedId={selectedScenarioId}
            onSelect={setSelectedScenarioId}
            onCreate={(name, description) => createScenario.mutate({ name, description })}
            creating={createScenario.isPending}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NODE PICKER (dropdown + search)
   ═══════════════════════════════════════════════════════════ */
function NodePicker({
  allNodes, selectedCode, onSelect,
}: {
  allNodes: Array<{ code: string; name: string; kind: string; parentSku?: string }>;
  selectedCode: string;
  onSelect: (code: string, sku?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = allNodes.find(n => n.code === selectedCode);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allNodes.slice(0, 50);
    return allNodes.filter(n =>
      n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [query, allNodes]);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: "10px 14px", borderRadius: 8, cursor: "pointer", minWidth: 320,
        background: C.accentDim, border: `1px solid ${C.accent}60`,
        color: C.white, fontFamily: mono, fontSize: 12, textAlign: "left",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <span>
          <span style={{ color: C.accent, fontSize: 10, letterSpacing: 1.2, marginRight: 6 }}>NODE</span>
          <span style={{ fontWeight: 600 }}>{selected?.code ?? "—"}</span>
          <span style={{ color: C.dim, marginLeft: 8 }}>{selected?.name.slice(0, 30) ?? ""}</span>
        </span>
        <span style={{ color: C.dim, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20,
          width: 460, maxHeight: 440, overflow: "auto",
          background: "rgba(8,8,12,0.98)", backdropFilter: "blur(14px)",
          border: `1px solid ${C.borderActive}`, borderRadius: 10,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="🔍  Ara: kod, isim…"
              style={{
                width: "100%", background: "rgba(0,0,0,0.4)",
                border: `1px solid ${C.border}`, borderRadius: 6,
                padding: "8px 10px", color: C.white, fontFamily: mono, fontSize: 12, outline: "none",
              }}
            />
          </div>
          <div style={{ padding: "4px 0" }}>
            {filtered.map(n => {
              const isSelected = n.code === selectedCode;
              const kindColor = n.kind === "device" ? C.accent : n.kind === "subassembly" ? C.warn : C.blue;
              const kindIcon = n.kind === "device" ? "◉" : n.kind === "subassembly" ? "⚙" : "◆";
              return (
                <div key={n.code}
                  onClick={() => { onSelect(n.code, n.parentSku); setOpen(false); }}
                  style={{
                    padding: "8px 14px", cursor: "pointer",
                    background: isSelected ? C.accentDim : "transparent",
                    borderLeft: `2px solid ${isSelected ? C.accent : "transparent"}`,
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.surface; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ color: kindColor, fontSize: 14 }}>{kindIcon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 12, color: C.white, fontWeight: 500 }}>{n.code}</div>
                    <div style={{ fontSize: 10, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</div>
                  </div>
                  {n.parentSku && (
                    <span style={{ fontSize: 9, color: C.dim, fontFamily: mono }}>
                      {n.parentSku.replace("BH.", "").replace(".SV", "")}
                    </span>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: C.dim, fontSize: 12 }}>Sonuç yok</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ALERT FEED (Zone 1)
   ═══════════════════════════════════════════════════════════ */
function AlertFeed({
  run, loading, error, onJump,
}: {
  run: OrchestratorRun | undefined;
  loading: boolean;
  error: unknown;
  onJump: (code: string, sku?: string) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2, fontWeight: 500 }}>◉ ALERT FEED</div>
        {run && (
          <div style={{ fontSize: 10, color: C.dim, fontFamily: mono }}>
            {new Date(run.timestamp).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }).replace(/[,]/g, "")}
          </div>
        )}
      </div>
      {loading && <div style={{ fontSize: 11, color: C.dim, padding: "20px 0" }}>Orchestrator yanıtı bekleniyor…</div>}
      {!!error && <div style={{ fontSize: 11, color: C.err, padding: "20px 0" }}>Henüz hiç audit çalışmadı. <br /><a href="/ontology" style={{ color: C.accent }}>Canvas'ta bir değişiklik yap</a> veya manuel tetikle.</div>}
      {run && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
            padding: "10px 12px", background: C.surface, borderRadius: 8,
            border: `1px solid ${C.border}`,
          }}>
            <Stat color={C.err} label="KIRMIZI" value={run.redCount} />
            <Stat color={C.warn} label="SARI" value={run.yellowCount} />
            <Stat color={C.ok} label="YEŞİL" value={run.greenCount} />
          </div>
          {run.summary && (
            <div style={{
              padding: "10px 12px", background: C.accentDim,
              border: `1px solid ${C.accent}40`, borderRadius: 8,
              fontSize: 11, color: C.white, lineHeight: 1.5,
            }}>
              {run.summary}
            </div>
          )}
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginTop: 4 }}>
            BULGULAR ({run.findings.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {run.findings.map((f, i) => {
              const col = severityColor(f.severity);
              const codeMatch = f.data?.code || f.data?.componentCode;
              return (
                <div key={i}
                  onClick={() => codeMatch ? onJump(codeMatch, f.sku) : (f.sku && onJump(f.sku))}
                  style={{
                    padding: "9px 10px", borderRadius: 7, cursor: (codeMatch || f.sku) ? "pointer" : "default",
                    background: col.bg, border: `1px solid ${col.border}`,
                    transition: "transform 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "translateX(2px)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = "none"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                    <span style={{ color: col.fg, fontWeight: 600 }}>{f.layer.toUpperCase()}</span>
                    {f.sku && <span style={{ color: C.dim }}>{f.sku}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.white, lineHeight: 1.4 }}>{f.message}</div>
                  {codeMatch && (
                    <div style={{ fontSize: 9, color: C.mid, fontFamily: mono, marginTop: 4 }}>→ {codeMatch}</div>
                  )}
                </div>
              );
            })}
            {run.findings.length === 0 && (
              <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", padding: 12, textAlign: "center" }}>
                Hiçbir bulgu yok — sistem sağlıklı.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 20, color, fontFamily: mono, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TIME SERIES PANEL (Zone 2)
   ═══════════════════════════════════════════════════════════ */
function TimeSeriesPanel({
  data, loading, error, code, allNodes,
}: {
  data: TimeSeries | undefined;
  loading: boolean;
  error: unknown;
  code: string;
  allNodes: Array<{ code: string; name: string; kind: string; parentSku?: string }>;
}) {
  const node = allNodes.find(n => n.code === code);
  const meta = data?.meta;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2, fontWeight: 500 }}>◈ SEÇİLİ NODE</div>
          <div style={{ fontSize: 20, color: C.white, marginTop: 3, fontWeight: 600, letterSpacing: 0.3 }}>
            {code}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{node?.name ?? ""}</div>
        </div>
        <div style={{ fontSize: 10, color: C.dim, textAlign: "right" }}>
          {data?.kind === "device" ? "CİHAZ · satış serisi" : `BİLEŞEN · ${meta?.snapshotPointCount ?? 0} snapshot · ${meta?.salesMonthCount ?? 0} ay`}
        </div>
      </div>

      {loading && <div style={{ fontSize: 11, color: C.dim, marginTop: 14 }}>Zaman serisi yükleniyor…</div>}
      {!!error && <div style={{ fontSize: 11, color: C.err, marginTop: 14 }}>Zaman serisi alınamadı</div>}

      {data && (
        <>
          {/* KPI row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
            marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${C.border}`,
          }}>
            <KPI label="STOK" value={data.current.stock != null ? `${fmt(data.current.stock)} ${data.current.unit ?? ""}` : "—"} color={C.white} />
            <KPI label="BURN" value={data.current.dailyBurnRate != null ? `${data.current.dailyBurnRate.toFixed(1)}/gün` : "—"} color={C.warn} />
            <KPI label="TÜKENME" value={data.current.daysToStockout != null ? `${data.current.daysToStockout}g` : "—"} color={data.current.daysToStockout != null && data.current.daysToStockout < 30 ? C.err : C.blue} />
            <KPI label="SATIŞ AYLARI" value={String(data.salesMonthly.length)} color={C.accent} />
          </div>

          {/* Sales chart */}
          {data.salesMonthly.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>AYLIK SATIŞ (ADET)</div>
              <LineChart series={data.salesMonthly.map(m => ({ label: m.label, value: m.units }))} color={C.accent} height={140} />
            </div>
          )}

          {/* Stock history chart */}
          {data.stockHistory.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>STOK TARİHİ ({data.stockHistory.length} snapshot)</div>
              <LineChart series={data.stockHistory.map(s => ({ label: new Date(s.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }), value: s.stock }))} color={C.blue} height={120} />
            </div>
          )}

          {data.salesMonthly.length === 0 && data.stockHistory.length === 0 && (
            <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", padding: "24px 12px", textAlign: "center", marginTop: 14 }}>
              Bu node için zaman serisi verisi yok. Cihaz seçerek satış serisini göster.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 16, color, fontFamily: mono, fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

/* Simple SVG line chart */
function LineChart({
  series, color, height,
}: {
  series: Array<{ label: string; value: number }>;
  color: string;
  height: number;
}) {
  if (series.length < 2) {
    return (
      <div style={{
        height, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: C.dim, fontStyle: "italic",
      }}>
        Grafik için en az 2 nokta gerekli ({series.length} mevcut)
      </div>
    );
  }

  const W = 900;
  const H = height;
  const padL = 48, padR = 12, padT = 10, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = series.map(s => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const yOf = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const xOf = (i: number) => padL + (i / Math.max(1, series.length - 1)) * innerW;

  const path = series.map((s, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(s.value).toFixed(1)}`).join(" ");
  const areaPath = `${path} L ${xOf(series.length - 1).toFixed(1)} ${padT + innerH} L ${xOf(0).toFixed(1)} ${padT + innerH} Z`;

  const labelStep = Math.max(1, Math.ceil(series.length / 8));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: "rgba(0,0,0,0.3)", borderRadius: 6 }}>
      {/* Y-axis gridlines */}
      {[0, 0.5, 1].map((p, i) => {
        const y = padT + innerH * (1 - p);
        const v = min + range * p;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={C.border} strokeDasharray="2 3" strokeWidth={0.5} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fill={C.dim} fontSize={9} fontFamily={mono}>{fmt(Math.round(v))}</text>
          </g>
        );
      })}
      {/* Area */}
      <path d={areaPath} fill={color} opacity={0.08} />
      {/* Line */}
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} />
      {/* Points */}
      {series.map((s, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(s.value)} r={2.5} fill={color} />
      ))}
      {/* X-axis labels */}
      {series.map((s, i) => {
        if (i % labelStep !== 0 && i !== series.length - 1) return null;
        return (
          <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fill={C.dim} fontSize={9} fontFamily={mono}>
            {s.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   SCENARIO MANAGER (Zone 3)
   ═══════════════════════════════════════════════════════════ */
function ScenarioManager({
  scenarios, loading, selectedId, onSelect, onCreate, creating,
}: {
  scenarios: Scenario[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: (name: string, description: string) => void;
  creating: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating_, setCreating] = useState(false);

  const statusColor = (s: Scenario["status"]) => {
    if (s === "applied") return C.ok;
    if (s === "active") return C.warn;
    if (s === "archived") return C.dim;
    return C.blue;
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 9, color: C.variable, letterSpacing: 2, fontWeight: 500 }}>SENARYOLAR</div>
        <button
          onClick={() => setCreating(c => !c)}
          style={{
            padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 10,
            background: creating_ ? C.surface : C.variableDim,
            border: `1px solid ${creating_ ? C.border : C.variableBorder}`,
            color: creating_ ? C.mid : C.variable, fontFamily: mono, fontWeight: 500,
          }}
        >
          {creating_ ? "✕ İptal" : "+ Yeni"}
        </button>
      </div>

      {creating_ && (
        <div style={{
          padding: 12, background: C.variableDim,
          border: `1px solid ${C.variableBorder}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Senaryo adı (örn: 'Kış 2026 Kriz')"
            style={{
              background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 5,
              padding: "8px 10px", color: C.white, fontFamily: mono, fontSize: 12, outline: "none",
            }}
          />
          <textarea
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
            rows={2}
            style={{
              background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 5,
              padding: "8px 10px", color: C.white, fontFamily: mono, fontSize: 11, outline: "none", resize: "vertical",
            }}
          />
          <button
            disabled={!newName.trim() || creating}
            onClick={() => {
              if (!newName.trim()) return;
              onCreate(newName.trim(), newDesc.trim());
              setNewName(""); setNewDesc(""); setCreating(false);
            }}
            style={{
              padding: "8px 12px", borderRadius: 6, cursor: newName.trim() && !creating ? "pointer" : "not-allowed", fontSize: 11,
              background: newName.trim() && !creating ? C.variable : C.surface,
              border: `1px solid ${newName.trim() && !creating ? C.variable : C.border}`,
              color: newName.trim() && !creating ? C.white : C.dim, fontFamily: mono, fontWeight: 600, letterSpacing: 0.5,
            }}
          >
            {creating ? "Kaydediliyor…" : "OLUŞTUR"}
          </button>
        </div>
      )}

      {loading && <div style={{ fontSize: 11, color: C.dim, padding: 12 }}>Senaryolar yükleniyor…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {scenarios.map(s => {
          const isSelected = s.id === selectedId;
          const col = statusColor(s.status);
          return (
            <div key={s.id}
              onClick={() => onSelect(isSelected ? null : s.id)}
              style={{
                padding: "10px 12px", borderRadius: 7, cursor: "pointer",
                background: isSelected ? C.variableDim : C.surface,
                border: `1px solid ${isSelected ? C.variableBorder : C.border}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{s.name}</div>
                <div style={{
                  fontSize: 8, color: col, letterSpacing: 1.2, fontWeight: 600,
                  padding: "2px 6px", borderRadius: 3, border: `1px solid ${col}40`,
                }}>{s.status.toUpperCase()}</div>
              </div>
              {s.description && (
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4, lineHeight: 1.4 }}>{s.description}</div>
              )}
              <div style={{ fontSize: 9, color: C.dim, marginTop: 6, fontFamily: mono }}>
                {new Date(s.updatedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
        {scenarios.length === 0 && !loading && (
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", padding: 16, textAlign: "center" }}>
            Henüz senaryo yok. "+ Yeni" ile başla.
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SCENARIO DETAIL (when selected)
   ═══════════════════════════════════════════════════════════ */
function ScenarioDetailPanel({
  detail, selectedSku, onSimulate, onApply, simulating, applying, onClose,
}: {
  detail: ScenarioDetail;
  selectedSku: string;
  onSimulate: (id: number) => void;
  onApply: (id: number) => void;
  simulating: boolean;
  applying: boolean;
  onClose: () => void;
}) {
  const sim = detail.simulationResult;

  return (
    <div style={{
      background: C.variableDim, border: `1px solid ${C.variableBorder}`,
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 9, color: C.variable, letterSpacing: 2, fontWeight: 500 }}>SENARYO DETAY</div>
          <div style={{ fontSize: 18, color: C.white, marginTop: 3, fontWeight: 600 }}>{detail.name}</div>
          {detail.description && (
            <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{detail.description}</div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: C.mid,
          cursor: "pointer", fontSize: 16, padding: "4px 8px",
        }}>✕</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          disabled={simulating}
          onClick={() => onSimulate(detail.id)}
          style={{
            padding: "8px 14px", borderRadius: 6, cursor: simulating ? "wait" : "pointer", fontSize: 11,
            background: C.accentDim, border: `1px solid ${C.accent}60`, color: C.accent, fontFamily: mono, fontWeight: 600, letterSpacing: 0.5,
          }}
        >
          {simulating ? "Simüle ediliyor…" : `▶ Simüle et (${selectedSku})`}
        </button>
        <button
          disabled={applying || detail.status === "applied" || detail.overrides.length === 0}
          onClick={() => onApply(detail.id)}
          style={{
            padding: "8px 14px", borderRadius: 6,
            cursor: applying || detail.status === "applied" || detail.overrides.length === 0 ? "not-allowed" : "pointer",
            fontSize: 11, background: detail.status === "applied" ? C.surface : C.errDim,
            border: `1px solid ${detail.status === "applied" ? C.border : C.errBorder}`,
            color: detail.status === "applied" ? C.dim : C.err, fontFamily: mono, fontWeight: 600, letterSpacing: 0.5,
          }}
        >
          {applying ? "Uygulanıyor…" : detail.status === "applied" ? "✓ Uygulandı" : "⚠ GERÇEK VERİYE UYGULA"}
        </button>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 8 }}>OVERRIDE'LAR ({detail.overrides.length})</div>
        {detail.overrides.length === 0 ? (
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>
            Henüz override yok. Canvas'taki what-if panelinden override ekle veya manuel API ile.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {detail.overrides.slice(0, 10).map(o => (
              <div key={o.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10,
                padding: "6px 10px", fontSize: 11, background: C.surface, borderRadius: 5, border: `1px solid ${C.border}`,
              }}>
                <span style={{ color: C.white, fontFamily: mono }}>{o.entityId}</span>
                <span style={{ color: C.dim, fontFamily: mono }}>{o.originalValue ?? "—"}</span>
                <span style={{ color: C.variable, fontFamily: mono, fontWeight: 600 }}>→ {o.overrideValue}</span>
              </div>
            ))}
            {detail.overrides.length > 10 && (
              <div style={{ fontSize: 10, color: C.dim, textAlign: "center", marginTop: 4 }}>… ve {detail.overrides.length - 10} tane daha</div>
            )}
          </div>
        )}
      </div>

      {sim && sim.scenarios && Array.isArray(sim.scenarios) && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 8 }}>SİMÜLASYON SONUCU</div>
          <pre style={{
            fontSize: 10, color: C.white, background: "rgba(0,0,0,0.4)",
            padding: 10, borderRadius: 5, maxHeight: 180, overflow: "auto", fontFamily: mono,
          }}>{JSON.stringify(sim, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
