/**
 * Decision Loop Workspace (FAZ 3)
 * Closed-loop tracker: scenario → decision → opportunity → work_order → outcome.
 *
 * Tabs: Decisions, Opportunity Board (kanban), Work Orders, Loop Report
 *
 * Mevcut tasarım dili korundu (feedback_design_no_touch).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { queryClient } from "@/lib/queryClient";

type Tab = "decisions" | "opportunities" | "workOrders" | "report";
const TABS: { id: Tab; label: string }[] = [
  { id: "decisions", label: "Decisions" },
  { id: "opportunities", label: "Opportunity Board" },
  { id: "workOrders", label: "Work Orders" },
  { id: "report", label: "Loop Report" },
];

const KANBAN_COLUMNS = ["identified", "approved", "in_progress", "completed", "verified", "rejected"] as const;

const DECISION_STATUS_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  proposed: "secondary", approved: "default", rejected: "destructive",
  expired: "destructive", superseded: "secondary",
};

const OUTCOME_COLOR: Record<string, string> = {
  verified_correct: "text-green-600", verified_partial: "text-yellow-600",
  verified_wrong: "text-red-600", pending: "text-muted-foreground",
};

function DecisionsTab() {
  const { data } = useQuery<{ decisions: any[]; count: number }>({
    queryKey: ["/api/loop/decisions"],
    queryFn: async () => (await fetch("/api/loop/decisions")).json(),
  });
  const approve = useMutation({
    mutationFn: async (id: number) => (await fetch(`/api/loop/decisions/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/loop/decisions"] }),
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await fetch(`/api/loop/decisions/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/loop/decisions"] }),
  });

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">Decisions ({data?.count ?? 0})</h2>
      {!data?.decisions.length && <div className="text-sm text-muted-foreground">Henüz decision yok.</div>}
      {data?.decisions.map(d => (
        <Card key={d.id} className="mb-2">
          <CardContent className="py-3">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex gap-2 items-center mb-1">
                  <Badge variant={DECISION_STATUS_BADGE[d.status] ?? "secondary"}>{d.status}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{d.decisionType}</span>
                  {d.outcomeStatus && (
                    <span className={`text-xs ${OUTCOME_COLOR[d.outcomeStatus] ?? ""}`}>{d.outcomeStatus}</span>
                  )}
                </div>
                <div className="font-medium">{d.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{d.rationale}</div>
                {d.alternativesConsidered?.length > 0 && (
                  <details className="text-xs mt-2">
                    <summary className="cursor-pointer text-muted-foreground">Alternatifler ({d.alternativesConsidered.length})</summary>
                    <ul className="mt-1 ml-4 list-disc">
                      {d.alternativesConsidered.map((a: any, i: number) => (
                        <li key={i}><span className="font-medium">{a.title}</span> {a.predictedValue && `— predicted ${a.predictedValue}`} {a.reason_rejected && `(reddedildi: ${a.reason_rejected})`}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Predicted: {d.predictedValue ?? "—"} TL · Confidence: {d.confidence ? `${Math.round(Number(d.confidence) * 100)}%` : "—"}
                  {d.actualValue && ` · Actual: ${d.actualValue} TL`}
                </div>
              </div>
              {d.status === "proposed" && (
                <div className="flex gap-2 flex-col">
                  <Button size="sm" onClick={() => approve.mutate(d.id)}>Onayla</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const reason = prompt("Reddetme sebebi?") ?? "";
                    if (reason) reject.mutate({ id: d.id, reason });
                  }}>Reddet</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OpportunityBoardTab() {
  const { data } = useQuery<{ opportunities: any[]; count: number }>({
    queryKey: ["/api/loop/opportunities"],
    queryFn: async () => (await fetch("/api/loop/opportunities")).json(),
  });
  const promote = useMutation({
    mutationFn: async (oppId: number) => (await fetch("/api/loop/work-orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: oppId, type: "production" }),
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loop/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loop/work-orders"] });
    },
  });

  const byCol = (status: string) => data?.opportunities.filter(o => o.status === status) ?? [];

  return (
    <div className="overflow-auto">
      <div className="flex gap-3 min-w-max">
        {KANBAN_COLUMNS.map(col => (
          <div key={col} className="w-64 shrink-0">
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
              {col} ({byCol(col).length})
            </div>
            {byCol(col).map(o => (
              <Card key={o.id} className="mb-2">
                <CardContent className="py-2 text-xs">
                  <div className="font-medium">{o.title}</div>
                  <div className="text-muted-foreground mt-1">{o.category} · {o.priority}</div>
                  {o.projectedValue && <div className="text-muted-foreground">{o.projectedValue} TL</div>}
                  {o.status === "approved" && (
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => promote.mutate(o.id)}>
                      → Work Order
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkOrdersTab() {
  const { data } = useQuery<{ workOrders: any[]; count: number }>({
    queryKey: ["/api/loop/work-orders"],
    queryFn: async () => (await fetch("/api/loop/work-orders")).json(),
  });
  const [completing, setCompleting] = useState<number | null>(null);
  const [actualValue, setActualValue] = useState("");
  const [proof, setProof] = useState("");

  const complete = useMutation({
    mutationFn: async ({ id, actualValue, proof }: { id: number; actualValue: number; proof: string }) =>
      (await fetch(`/api/loop/work-orders/${id}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualValue, completionProof: proof }),
      })).json(),
    onSuccess: () => {
      setCompleting(null); setActualValue(""); setProof("");
      queryClient.invalidateQueries({ queryKey: ["/api/loop/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loop/decisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loop/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loop/report"] });
    },
  });

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">Work Orders ({data?.count ?? 0})</h2>
      {!data?.workOrders.length && <div className="text-sm text-muted-foreground">Henüz work order yok.</div>}
      {data?.workOrders.map(w => (
        <Card key={w.id} className="mb-2">
          <CardContent className="py-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 text-sm">
                <div className="flex gap-2 items-center">
                  <Badge variant={w.status === "completed" ? "default" : w.status === "open" ? "secondary" : "outline"}>{w.status}</Badge>
                  <span className="font-mono text-xs">{w.code}</span>
                  <span className="text-muted-foreground text-xs">{w.type}</span>
                </div>
                <div className="mt-1">{w.description ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Due: {w.dueDate ? new Date(w.dueDate).toLocaleDateString("tr-TR") : "—"}
                  {w.actualValue && ` · Actual: ${w.actualValue} TL`}
                </div>
              </div>
              {w.status !== "completed" && (
                completing === w.id ? (
                  <div className="flex flex-col gap-2 w-48">
                    <Input placeholder="Actual value" value={actualValue} onChange={e => setActualValue(e.target.value)} type="number" />
                    <Input placeholder="Proof (text or URL)" value={proof} onChange={e => setProof(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => complete.mutate({ id: w.id, actualValue: Number(actualValue), proof })}>Kaydet</Button>
                      <Button size="sm" variant="outline" onClick={() => setCompleting(null)}>İptal</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setCompleting(w.id)}>Tamamlandı</Button>
                )
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReportTab() {
  const { data } = useQuery<any>({
    queryKey: ["/api/loop/report"],
    queryFn: async () => (await fetch("/api/loop/report")).json(),
  });
  if (!data) return <div className="text-sm text-muted-foreground">Yükleniyor...</div>;
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Toplam Decision</div><div className="text-2xl font-bold">{data.totalDecisions}</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Predicted Value</div><div className="text-xl font-bold">{Number(data.totalPredictedValue).toLocaleString("tr-TR")} TL</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Actual Value</div><div className="text-xl font-bold">{Number(data.totalActualValue).toLocaleString("tr-TR")} TL</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Realization</div><div className="text-2xl font-bold">{Math.round(data.realizationRate * 100)}%</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">By Status</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm">
              {Object.entries(data.byStatus).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="font-bold">{String(v)}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">By Outcome</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm">
              {Object.entries(data.byOutcome).map(([k, v]) => (
                <li key={k} className={`flex justify-between ${OUTCOME_COLOR[k] ?? ""}`}><span>{k}</span><span className="font-bold">{String(v)}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-sm font-semibold mt-6 mb-2">Recent Verified</h3>
      {data.recentVerified?.map((d: any) => (
        <div key={d.id} className="border rounded p-2 mb-1 text-xs">
          <span className={OUTCOME_COLOR[d.outcomeStatus] ?? ""}>{d.outcomeStatus}</span>
          {" · "}<span className="font-medium">{d.title}</span>
          {" · "}predicted={d.predicted} actual={d.actual}
          {d.verifiedAt && ` · ${new Date(d.verifiedAt).toLocaleDateString("tr-TR")}`}
        </div>
      ))}
    </div>
  );
}

export default function DecisionLoopPage() {
  const [tab, setTab] = useState<Tab>("decisions");

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">Decision Loop</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Palantir Foundry decision capture: scenario → decision → opportunity → work order → outcome verification.
      </p>

      <div className="flex gap-2 border-b mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.id ? "border-primary font-semibold" : "border-transparent text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "decisions" && <DecisionsTab />}
      {tab === "opportunities" && <OpportunityBoardTab />}
      {tab === "workOrders" && <WorkOrdersTab />}
      {tab === "report" && <ReportTab />}
    </div>
  );
}
