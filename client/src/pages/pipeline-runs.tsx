/**
 * Simulation Pipeline Timeline (FAZ 1)
 * Vertex-style chained model run viewer.
 *
 * - Tetikleme: SKU seçili + horizon ay + mode (simulation/live)
 * - Timeline: 7 step (DSE → Forecast → Plan → BOM → Gap → Impact → Outcome)
 * - Step click → input/output JSON expand
 *
 * Mevcut tasarım dili korundu (feedback_design_no_touch).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";

type Step = {
  step: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "ok" | "warning" | "error";
  input: any;
  output: any;
  notes: string[];
};

type Run = {
  id: number;
  tenantId: string;
  sku: string;
  horizonMonths: number;
  mode: "simulation" | "live";
  status: "running" | "success" | "partial" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  steps: Step[];
  summary: any;
  errorMessage: string | null;
};

const STEP_LABELS: Record<string, string> = {
  dse_recalibrate: "DSE Yeniden Kalibrasyon",
  forecast: "Talep Tahmini",
  production_plan: "Üretim Planı",
  bom_explosion: "BOM Patlatma",
  purchase_gap: "Satınalma Açığı",
  impact_propagation: "Etki Yayılımı",
  outcome_prediction: "Sonuç Tahmini",
};

const statusColor = (s: string) => s === "ok" ? "default" : s === "warning" ? "secondary" : "destructive";

function StepCard({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const label = STEP_LABELS[step.step] ?? step.step;
  return (
    <Card className="mb-2">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{label}</span>
          <div className="flex gap-2 items-center text-xs">
            <Badge variant={statusColor(step.status) as any}>{step.status}</Badge>
            <span className="text-muted-foreground">{step.durationMs}ms</span>
          </div>
        </CardTitle>
        {step.notes.length > 0 && (
          <div className="text-xs text-muted-foreground mt-1">{step.notes.join(" • ")}</div>
        )}
      </CardHeader>
      {open && (
        <CardContent className="text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="font-medium mb-1">Girdi</div>
              <pre className="bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(step.input, null, 2)}</pre>
            </div>
            <div>
              <div className="font-medium mb-1">Çıktı</div>
              <pre className="bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(step.output, null, 2)}</pre>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function PipelineRunsPage() {
  const [sku, setSku] = useState("GSS20P");
  const [horizon, setHorizon] = useState(6);
  const [mode, setMode] = useState<"simulation" | "live">("simulation");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const runsQuery = useQuery<{ runs: Run[]; count: number }>({
    queryKey: ["/api/pipeline/runs", sku],
    queryFn: async () => {
      const r = await fetch(`/api/pipeline/runs?sku=${encodeURIComponent(sku)}&limit=20`);
      return r.json();
    },
  });

  const runQuery = useQuery<Run>({
    queryKey: ["/api/pipeline/runs", selectedRunId],
    enabled: !!selectedRunId,
    queryFn: async () => {
      const r = await fetch(`/api/pipeline/runs/${selectedRunId}`);
      return r.json();
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, horizonMonths: horizon, mode }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "pipeline failed");
      return r.json();
    },
    onSuccess: (data) => {
      setSelectedRunId(data.runId);
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline/runs"] });
    },
  });

  const run = runQuery.data;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">Simulation Model Mesh</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vertex pattern: 7-engine chained pipeline (DSE → Forecast → Plan → BOM → Gap → Impact → Outcome).
      </p>

      <Card className="mb-6">
        <CardHeader><CardTitle>Yeni Run</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs">SKU</label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs">Ufuk (ay)</label>
              <Input type="number" min={1} max={12} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="w-24" />
            </div>
            <div>
              <label className="text-xs">Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="block border rounded px-2 py-1 text-sm">
                <option value="simulation">simulation</option>
                <option value="live">live</option>
              </select>
            </div>
            <Button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}>
              {triggerMutation.isPending ? "Çalışıyor..." : "Çalıştır"}
            </Button>
          </div>
          {triggerMutation.error && <div className="text-xs text-red-500 mt-2">{(triggerMutation.error as Error).message}</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1">
          <h2 className="text-sm font-semibold mb-2">Geçmiş Run'lar ({runsQuery.data?.count ?? 0})</h2>
          {runsQuery.data?.runs.map(r => (
            <Card key={r.id}
              className={`mb-2 cursor-pointer hover:bg-accent ${selectedRunId === r.id ? "ring-1 ring-primary" : ""}`}
              onClick={() => setSelectedRunId(r.id)}>
              <CardContent className="py-2 text-xs">
                <div className="flex justify-between">
                  <span>#{r.id} · {r.sku}</span>
                  <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-1">
                  {new Date(r.startedAt).toLocaleString("tr-TR")} · {r.mode} · {r.horizonMonths}ay · {r.durationMs}ms
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="col-span-2">
          {!run && <div className="text-sm text-muted-foreground">Bir run seç veya yeni başlat.</div>}
          {run && (
            <>
              <Card className="mb-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex justify-between">
                    <span>Run #{run.id} · {run.sku}</span>
                    <Badge variant={run.status === "success" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                      {run.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs">
                  {run.summary && (
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(run.summary).map(([k, v]) => (
                        <div key={k}>
                          <div className="text-muted-foreground">{k}</div>
                          <div className="font-medium">{typeof v === "number" ? v.toLocaleString("tr-TR") : String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {run.errorMessage && <div className="text-red-500 mt-2">{run.errorMessage}</div>}
                </CardContent>
              </Card>
              <h3 className="text-sm font-semibold mb-2">Step Timeline</h3>
              {run.steps?.map((s, i) => <StepCard key={i} step={s} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
