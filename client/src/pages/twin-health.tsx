/**
 * Digital Twin Health Dashboard (FAZ 2)
 * Planned (engineering model) vs Actual (sensor) divergence — Vertex pattern.
 *
 * - Heatmap: entity × day, color = variance% magnitude (green/yellow/red)
 * - Drift alerts: 3+ consecutive days >%15 sapma
 * - Trigger: manual variance compute for any day
 *
 * Mevcut tasarım dili korundu (feedback_design_no_touch).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";

const METRICS = ["throughput", "scrap", "cycle_time", "energy", "stock_burn"] as const;
type Metric = typeof METRICS[number];

const METRIC_LABELS: Record<string, string> = {
  throughput: "Çıktı Hacmi",
  scrap: "Hurda",
  cycle_time: "Cycle Time",
  energy: "Enerji",
  stock_burn: "Stok Tüketim",
};

function variancColor(v: number | null, status?: string): string {
  if (v == null) return "bg-muted";
  const abs = Math.abs(v);
  if (status === "critical" || abs > 15) return "bg-red-600 text-white";
  if (status === "warning" || abs > 5) return "bg-yellow-500 text-white";
  return "bg-green-600 text-white";
}

export default function TwinHealthPage() {
  const [metric, setMetric] = useState<Metric>("throughput");
  const [days, setDays] = useState(14);

  const heatmapQuery = useQuery<{
    metric: string; days: string[]; entities: string[];
    matrix: Array<{ entity: string; cells: Array<{ variance: number; status: string } | null> }>;
  }>({
    queryKey: ["/api/twin-health/heatmap", metric, days],
    queryFn: async () => {
      const r = await fetch(`/api/twin-health/heatmap?metric=${metric}&days=${days}`);
      return r.json();
    },
  });

  const dashboardQuery = useQuery<{
    summary: { totalRows: number; okCount: number; warningCount: number; criticalCount: number };
    rows: any[];
  }>({
    queryKey: ["/api/twin-health/dashboard", metric, days],
    queryFn: async () => {
      const r = await fetch(`/api/twin-health/dashboard?metric=${metric}&days=${days}`);
      return r.json();
    },
  });

  const alertsQuery = useQuery<{ alerts: any[]; count: number }>({
    queryKey: ["/api/twin-health/drift-alerts"],
    queryFn: async () => (await fetch("/api/twin-health/drift-alerts")).json(),
  });

  const computeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/twin-health/compute", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twin-health/heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/twin-health/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/twin-health/drift-alerts"] });
    },
  });

  const ackMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/twin-health/drift-alerts/${id}/acknowledge`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "user" }),
      });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/twin-health/drift-alerts"] }),
  });

  const heat = heatmapQuery.data;
  const summary = dashboardQuery.data?.summary;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">Digital Twin Health</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vertex pattern: planlanan (mühendislik modeli) vs gerçek (sensor) divergence. 3+ gün üst üste &gt;%15 sapma = drift alarmı.
      </p>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select value={metric} onChange={e => setMetric(e.target.value as Metric)} className="border rounded px-2 py-1 text-sm">
          {METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
          <option value={7}>Son 7 gün</option>
          <option value={14}>Son 14 gün</option>
          <option value={30}>Son 30 gün</option>
          <option value={60}>Son 60 gün</option>
        </select>
        <Button onClick={() => computeMutation.mutate()} disabled={computeMutation.isPending} variant="outline">
          {computeMutation.isPending ? "Hesaplıyor..." : "Dünün Variance'ını Hesapla"}
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Toplam Ölçüm</div><div className="text-2xl font-bold">{summary.totalRows}</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">OK</div><div className="text-2xl font-bold text-green-600">{summary.okCount}</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Warning</div><div className="text-2xl font-bold text-yellow-600">{summary.warningCount}</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Critical</div><div className="text-2xl font-bold text-red-600">{summary.criticalCount}</div></CardContent></Card>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Heatmap — {METRIC_LABELS[metric]}</CardTitle></CardHeader>
        <CardContent>
          {heat && heat.entities.length === 0 && <div className="text-sm text-muted-foreground">Bu metric için veri yok. "Dünün Variance'ını Hesapla" ile başla.</div>}
          {heat && heat.entities.length > 0 && (
            <div className="overflow-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 sticky left-0 bg-background">Entity</th>
                    {heat.days.map(d => <th key={d} className="px-2 py-1 text-center">{d.slice(5)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {heat.matrix.map(row => (
                    <tr key={row.entity}>
                      <td className="px-2 py-1 sticky left-0 bg-background font-mono">{row.entity}</td>
                      {row.cells.map((c, i) => (
                        <td key={i} className={`px-2 py-1 text-center ${c ? variancColor(c.variance, c.status) : "bg-muted"}`}>
                          {c ? `${c.variance > 0 ? "+" : ""}${c.variance.toFixed(0)}%` : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Drift Alerts ({alertsQuery.data?.count ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {!alertsQuery.data?.alerts.length && <div className="text-sm text-muted-foreground">Aktif drift alarmı yok.</div>}
          {alertsQuery.data?.alerts.map(a => (
            <div key={a.id} className="border rounded p-3 mb-2 flex justify-between items-start">
              <div className="text-sm">
                <div className="flex gap-2 items-center mb-1">
                  <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>{a.severity}</Badge>
                  <span className="font-mono text-xs">{a.entityType}:{a.entityId}</span>
                  <span className="text-muted-foreground">{a.metric}</span>
                </div>
                <div>{a.message}</div>
                <div className="text-xs text-muted-foreground mt-1">{a.recommendedAction}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(a.raisedAt).toLocaleString("tr-TR")} · {a.consecutiveDriftDays} gün
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => ackMutation.mutate(a.id)}>Onayla</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
