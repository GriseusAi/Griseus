/**
 * Tiered Operations Monitoring + Process Flow (FAZ 4)
 * Vertex pattern: 3-tier dashboard + escalation + P&ID-equivalent flow diagram.
 *
 * Tier rolleri:
 *   - Operator: vardiya/hat real-time, 30 dk içinde resolve etmeli
 *   - Supervisor: gün/fabrika hourly, 2 saat içinde resolve etmeli
 *   - Plant Manager: hafta/ay trend, escalated her şeyi görür
 *
 * Mevcut tasarım dili korundu (feedback_design_no_touch).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";

type Tier = "operator" | "supervisor" | "plant_manager";

const TIER_LABELS: Record<Tier, string> = {
  operator: "Operatör (vardiya/hat)",
  supervisor: "Supervisor (gün/fabrika)",
  plant_manager: "Yönetim (hafta/ay)",
};

const SEVERITY_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  info: "secondary", warning: "default", critical: "destructive",
};

function StatusDot({ status }: { status: string }) {
  const color = status === "running" || status === "active" ? "bg-green-500"
              : status === "down" ? "bg-red-500"
              : status === "maintenance" ? "bg-yellow-500"
              : "bg-gray-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-2`} />;
}

function ProcessFlowDiagram({ lineId }: { lineId: number }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/ops/process-flow", lineId],
    queryFn: async () => (await fetch(`/api/ops/process-flow?lineId=${lineId}`)).json(),
  });
  const line = data?.line;
  if (!line) return <div className="text-sm text-muted-foreground">Hat verisi yok.</div>;

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center text-sm">
          <StatusDot status={line.status} />
          <span className="font-semibold">{line.label}</span>
          {line.alertCount > 0 && (
            <Badge variant="destructive" className="ml-2">{line.alertCount} açık alarm</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground ml-4">
          Cycle: {line.metrics?.currentCycleMin} dk · Worker: {line.metrics?.workerCount}
        </div>
      </div>

      <div className="overflow-auto pb-3">
        <div className="flex gap-2 items-stretch min-w-max">
          {line.children?.length === 0 && <div className="text-sm text-muted-foreground">Bu hatta tanımlı work center yok.</div>}
          {line.children?.map((wc: any, i: number) => (
            <div key={wc.id} className="flex items-center">
              <Card className="w-48">
                <CardContent className="py-2">
                  <div className="flex items-center text-xs font-semibold">
                    <StatusDot status={wc.status} />
                    {wc.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Sıra: {wc.metrics?.stationOrder} · {wc.metrics?.capacityPerHour} ad/h
                  </div>
                  {wc.children?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {wc.children.map((m: any) => (
                        <div key={m.id} className="text-xs flex items-center bg-muted rounded px-2 py-1">
                          <StatusDot status={m.status} />
                          <span className="font-mono">{m.label}</span>
                          <span className="text-muted-foreground ml-auto">{m.metrics?.cycleTimeSec}sn</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {i < (line.children?.length ?? 0) - 1 && <div className="text-2xl mx-1 text-muted-foreground">→</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertList({ tier }: { tier: Tier }) {
  const { data } = useQuery<{ alerts: any[]; count: number }>({
    queryKey: ["/api/ops/alerts", tier, "open"],
    queryFn: async () => (await fetch(`/api/ops/alerts?tier=${tier}&status=open`)).json(),
  });
  const ackMutation = useMutation({
    mutationFn: async (id: number) => (await fetch(`/api/ops/alerts/${id}/acknowledge`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "user" }),
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ops"] }),
  });
  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => (await fetch(`/api/ops/alerts/${id}/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "user", notes }),
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ops"] }),
  });

  if (!data) return <div className="text-sm text-muted-foreground">Yükleniyor...</div>;
  if (data.count === 0) return <div className="text-sm text-muted-foreground">Bu tier'da açık alarm yok.</div>;

  return (
    <div className="space-y-2">
      {data.alerts.map(a => {
        const minutesOpen = Math.floor((Date.now() - new Date(a.raisedAt).getTime()) / 60000);
        return (
          <Card key={a.id}>
            <CardContent className="py-3">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 text-sm">
                  <div className="flex gap-2 items-center mb-1">
                    <Badge variant={SEVERITY_BADGE[a.severity]}>{a.severity}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">{a.source}</span>
                    {a.entityType && <span className="text-xs font-mono">{a.entityType}:{a.entityId}</span>}
                    {a.metric && <span className="text-xs text-muted-foreground">{a.metric}</span>}
                    {a.escalationCount > 0 && <Badge variant="outline">↑{a.escalationCount}</Badge>}
                  </div>
                  <div className="font-medium">{a.title}</div>
                  {a.message && <div className="text-sm text-muted-foreground mt-1">{a.message}</div>}
                  {a.recommendedAction && <div className="text-xs text-muted-foreground mt-1">→ {a.recommendedAction}</div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    {minutesOpen} dk açık · {new Date(a.raisedAt).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-32">
                  <Button size="sm" variant="outline" onClick={() => ackMutation.mutate(a.id)}>Onayla</Button>
                  <Button size="sm" onClick={() => {
                    const notes = prompt("Çözüm notu?") ?? "";
                    resolveMutation.mutate({ id: a.id, notes });
                  }}>Çöz</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TierDashboard({ tier }: { tier: Tier }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/ops/dashboard", tier],
    queryFn: async () => (await fetch(`/api/ops/dashboard?tier=${tier}`)).json(),
  });
  if (!data) return null;
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Açık</div><div className="text-2xl font-bold">{data.openCount}</div></CardContent></Card>
      <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Onaylanmış</div><div className="text-2xl font-bold">{data.acknowledgedCount}</div></CardContent></Card>
      <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Bugün Çözülen</div><div className="text-2xl font-bold text-green-600">{data.resolvedToday}</div></CardContent></Card>
    </div>
  );
}

function PlantSummary() {
  const { data } = useQuery<any>({
    queryKey: ["/api/ops/plant-summary"],
    queryFn: async () => (await fetch("/api/ops/plant-summary")).json(),
  });
  if (!data) return null;
  return (
    <Card className="mb-4">
      <CardHeader><CardTitle className="text-base">Fabrika Özeti</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {(["operator", "supervisor", "plant_manager"] as Tier[]).map(t => (
            <div key={t}>
              <div className="text-xs text-muted-foreground">{TIER_LABELS[t]}</div>
              <div className="font-bold">Açık {data.byTier[t].open} · Onaylı {data.byTier[t].acknowledged}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OperationsPage() {
  const [tier, setTier] = useState<Tier>("operator");
  const [lineId, setLineId] = useState<number>(1);

  const escalateMutation = useMutation({
    mutationFn: async () => (await fetch("/api/ops/auto-escalate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ops"] }),
  });
  const syncMutation = useMutation({
    mutationFn: async () => (await fetch("/api/ops/sync-drift-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ops"] }),
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">Operations Monitoring</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vertex tier pattern: Operatör (30dk SLA) → Supervisor (2sa SLA) → Yönetim (escalated all).
      </p>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select value={tier} onChange={e => setTier(e.target.value as Tier)} className="border rounded px-2 py-1 text-sm">
          {(["operator", "supervisor", "plant_manager"] as Tier[]).map(t => (
            <option key={t} value={t}>{TIER_LABELS[t]}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          Twin Drift'leri Sync
        </Button>
        <Button variant="outline" size="sm" onClick={() => escalateMutation.mutate()} disabled={escalateMutation.isPending}>
          Auto-Escalate Çalıştır
        </Button>
        {escalateMutation.data && (
          <span className="text-xs text-muted-foreground">
            {escalateMutation.data.escalated} alarm escalate edildi
          </span>
        )}
      </div>

      {tier === "plant_manager" && <PlantSummary />}

      <h2 className="text-base font-semibold mb-2">{TIER_LABELS[tier]} Panosu</h2>
      <TierDashboard tier={tier} />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Process Flow — Hat {lineId}</CardTitle></CardHeader>
        <CardContent>
          <ProcessFlowDiagram lineId={lineId} />
        </CardContent>
      </Card>

      <h3 className="text-base font-semibold mb-2">Açık Alarmlar</h3>
      <AlertList tier={tier} />
    </div>
  );
}
