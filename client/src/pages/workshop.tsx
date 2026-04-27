/**
 * Workshop — No-code Dashboard Builder (FAZ 5)
 * Foundry pattern: drag-drop widgets bound to ontology.
 *
 * Mevcut tasarım dili korundu (feedback_design_no_touch).
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { queryClient } from "@/lib/queryClient";

function WidgetRenderer({ widget }: { widget: any }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/workshop/widgets", widget.id, "data"],
    queryFn: async () => (await fetch(`/api/workshop/widgets/${widget.id}/data`)).json(),
  });
  if (widget.type === "text") {
    return <div className="prose prose-sm">{widget.config?.content ?? ""}</div>;
  }
  if (isLoading) return <div className="text-xs text-muted-foreground">Yükleniyor...</div>;

  if (widget.type === "kpi") {
    const rows = data?.rows ?? [];
    const agg = widget.config?.aggregation ?? "count";
    const field = widget.config?.field;
    let val: any = "—";
    if (agg === "count") val = rows.length;
    else if (agg === "sum" && field) val = rows.reduce((a: number, r: any) => a + Number(r[field] ?? 0), 0);
    else if (agg === "avg" && field) val = rows.length > 0 ? (rows.reduce((a: number, r: any) => a + Number(r[field] ?? 0), 0) / rows.length).toFixed(2) : 0;
    return (
      <div>
        <div className="text-xs text-muted-foreground">{widget.config?.label ?? widget.config?.table}</div>
        <div className="text-3xl font-bold">{typeof val === "number" ? val.toLocaleString("tr-TR") : val}</div>
      </div>
    );
  }

  if (widget.type === "table") {
    const rows = data?.rows ?? [];
    if (rows.length === 0) return <div className="text-xs text-muted-foreground">Veri yok</div>;
    const cols = Object.keys(rows[0]).slice(0, 6);
    return (
      <div className="overflow-auto max-h-64">
        <table className="text-xs w-full">
          <thead><tr>{cols.map(c => <th key={c} className="text-left px-1 py-0.5">{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 20).map((r: any, i: number) => (
              <tr key={i}>{cols.map(c => <td key={c} className="px-1 py-0.5 font-mono">{String(r[c] ?? "—").slice(0, 20)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === "chart") {
    const rows = data?.rows ?? [];
    const xField = widget.config?.xField, yField = widget.config?.yField;
    if (!xField || !yField || rows.length === 0) return <div className="text-xs text-muted-foreground">Chart config eksik</div>;
    const max = Math.max(...rows.map((r: any) => Number(r[yField] ?? 0)), 1);
    return (
      <div className="space-y-1 text-xs">
        {rows.slice(0, 15).map((r: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-24 truncate font-mono">{String(r[xField])}</div>
            <div className="flex-1 bg-muted h-3 rounded overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${(Number(r[yField] ?? 0) / max) * 100}%` }} />
            </div>
            <div className="w-16 text-right">{Number(r[yField] ?? 0).toLocaleString("tr-TR")}</div>
          </div>
        ))}
      </div>
    );
  }

  if (widget.type === "pipeline_runner") {
    return <PipelineRunnerWidget config={widget.config} />;
  }

  return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
}

function PipelineRunnerWidget({ config }: { config: any }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">SKU: {config?.sku ?? "—"} · Ufuk: {config?.horizonMonths ?? 6}ay · Mode: {config?.mode ?? "simulation"}</div>
      <Button size="sm" disabled={running} onClick={async () => {
        setRunning(true);
        try {
          const r = await fetch("/api/pipeline/run", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sku: config?.sku ?? "GSS20P",
              horizonMonths: config?.horizonMonths ?? 6,
              mode: config?.mode ?? "simulation",
            }),
          });
          setResult(await r.json());
        } finally { setRunning(false); }
      }}>{running ? "Çalışıyor..." : "Pipeline çalıştır"}</Button>
      {result?.runId && (
        <div className="text-xs mt-2">
          Run #{result.runId} · {result.run?.status} · {result.run?.durationMs}ms
        </div>
      )}
    </div>
  );
}

export default function WorkshopPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [widgetType, setWidgetType] = useState("kpi");
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetTable, setWidgetTable] = useState("decisions");
  const [widgetField, setWidgetField] = useState("");

  const { data: list } = useQuery<{ workspaces: any[] }>({
    queryKey: ["/api/workshop/workspaces"],
    queryFn: async () => (await fetch("/api/workshop/workspaces")).json(),
  });

  const { data: ws, refetch: refetchWs } = useQuery<any>({
    queryKey: ["/api/workshop/workspaces", selectedId],
    enabled: !!selectedId,
    queryFn: async () => (await fetch(`/api/workshop/workspaces/${selectedId}`)).json(),
  });

  const { data: catalog } = useQuery<{ widgetTypes: any[] }>({
    queryKey: ["/api/workshop/catalog"],
    queryFn: async () => (await fetch("/api/workshop/catalog")).json(),
  });

  const createWs = useMutation({
    mutationFn: async () => (await fetch("/api/workshop/workspaces", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })).json(),
    onSuccess: (data) => {
      setName(""); setSelectedId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/workspaces"] });
    },
  });

  const addWidget = useMutation({
    mutationFn: async () => {
      const config: any = { table: widgetTable };
      if (widgetType === "kpi") { config.aggregation = "count"; if (widgetField) config.field = widgetField; }
      if (widgetType === "table") { config.limit = 20; }
      if (widgetType === "chart") { config.xField = widgetField; config.yField = "id"; }
      if (widgetType === "pipeline_runner") { config.sku = "GSS20P"; config.horizonMonths = 6; config.mode = "simulation"; }
      if (widgetType === "text") { config.content = widgetTitle; }
      return (await fetch("/api/workshop/widgets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedId, type: widgetType, title: widgetTitle, config,
          dataSource: { kind: widgetType === "text" ? "static" : "ontology_query" },
        }),
      })).json();
    },
    onSuccess: () => {
      setShowAddWidget(false); setWidgetTitle("");
      refetchWs();
    },
  });

  const deleteWidget = useMutation({
    mutationFn: async (id: number) => (await fetch(`/api/workshop/widgets/${id}`, { method: "DELETE" })).json(),
    onSuccess: () => refetchWs(),
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">Workshop</h1>
      <p className="text-sm text-muted-foreground mb-6">
        No-code dashboard builder. Ontology'ye bağlı 5 widget tipi: KPI, Tablo, Chart, Pipeline Runner, Text.
      </p>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1">
          <Card className="mb-3">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Yeni Workspace</CardTitle></CardHeader>
            <CardContent>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Pano adı" className="mb-2" />
              <Button size="sm" onClick={() => createWs.mutate()} disabled={!name || createWs.isPending}>Yarat</Button>
            </CardContent>
          </Card>
          <h2 className="text-sm font-semibold mb-2">Workspace'ler</h2>
          {list?.workspaces.map(w => (
            <Card key={w.id} className={`mb-1 cursor-pointer ${selectedId === w.id ? "ring-1 ring-primary" : ""}`}
                  onClick={() => setSelectedId(w.id)}>
              <CardContent className="py-2 text-sm">
                <div>{w.name}</div>
                <div className="text-xs text-muted-foreground">{w.visibility}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="col-span-3">
          {!selectedId && <div className="text-sm text-muted-foreground">Bir workspace seç veya yeni yarat.</div>}
          {selectedId && ws && (
            <>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h2 className="text-lg font-semibold">{ws.name}</h2>
                  <div className="text-xs text-muted-foreground">{ws.widgets?.length ?? 0} widget</div>
                </div>
                <Button size="sm" onClick={() => setShowAddWidget(!showAddWidget)}>
                  {showAddWidget ? "İptal" : "+ Widget Ekle"}
                </Button>
              </div>

              {showAddWidget && (
                <Card className="mb-4">
                  <CardContent className="py-3">
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="text-xs">Tip</label>
                        <select value={widgetType} onChange={e => setWidgetType(e.target.value)} className="block border rounded px-2 py-1 text-sm w-full">
                          {catalog?.widgetTypes.map(w => <option key={w.type} value={w.type}>{w.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs">Başlık</label>
                        <Input value={widgetTitle} onChange={e => setWidgetTitle(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs">Tablo</label>
                        <Input value={widgetTable} onChange={e => setWidgetTable(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs">Field</label>
                        <Input value={widgetField} onChange={e => setWidgetField(e.target.value)} placeholder="opsiyonel" />
                      </div>
                    </div>
                    <Button size="sm" onClick={() => addWidget.mutate()} disabled={!widgetTitle || addWidget.isPending} className="mt-2">
                      {addWidget.isPending ? "Ekleniyor..." : "Ekle"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-3 gap-3">
                {ws.widgets?.map((w: any) => (
                  <Card key={w.id}>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm">{w.title}</CardTitle>
                      <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => deleteWidget.mutate(w.id)}>×</button>
                    </CardHeader>
                    <CardContent>
                      <WidgetRenderer widget={w} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
