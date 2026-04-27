/**
 * SDDI Connectors (FAZ 5)
 * Software-Defined Data Integration: connector registry + auto-mapping + sync runs.
 *
 * Mevcut tasarım dili korundu (feedback_design_no_touch).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { queryClient } from "@/lib/queryClient";

const KINDS = ["netsis", "mes", "iot_mqtt", "excel", "csv", "rest_api"] as const;
const DIRECTIONS = ["read_only", "write_only", "bidirectional"] as const;

export default function SddiPage() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("netsis");
  const [direction, setDirection] = useState<string>("read_only");
  const [targetTable, setTargetTable] = useState("products");
  const [csvHeaders, setCsvHeaders] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [mappings, setMappings] = useState<any[] | null>(null);

  const { data: connectors } = useQuery<{ connectors: any[] }>({
    queryKey: ["/api/sddi/connectors"],
    queryFn: async () => (await fetch("/api/sddi/connectors")).json(),
  });

  const { data: runs } = useQuery<{ runs: any[] }>({
    queryKey: ["/api/sddi/connectors", selected, "runs"],
    enabled: !!selected,
    queryFn: async () => (await fetch(`/api/sddi/connectors/${selected}/runs`)).json(),
  });

  const create = useMutation({
    mutationFn: async () => (await fetch("/api/sddi/connectors", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, direction, targetTable }),
    })).json(),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["/api/sddi/connectors"] });
    },
  });

  const run = useMutation({
    mutationFn: async (id: number) => (await fetch(`/api/sddi/connectors/${id}/run`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sddi/connectors"] }),
  });

  const suggest = useMutation({
    mutationFn: async ({ id, fields, table }: { id: number; fields: string[]; table: string }) =>
      (await fetch(`/api/sddi/connectors/${id}/suggest-mappings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFields: fields, targetTable: table }),
      })).json(),
    onSuccess: (data) => setMappings(data.mappings),
  });

  const approveMapping = useMutation({
    mutationFn: async ({ id, sourceField, targetField, confidence }: any) =>
      (await fetch(`/api/sddi/connectors/${id}/approve-mapping`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceField, targetField, confidence, actor: "user" }),
      })).json(),
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">SDDI Connectors</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Foundry SDDI: external sources → ontology, schema-aware auto-mapping, sync run tarihi.
      </p>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Yeni Connector</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs">Ad</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Çukurova Netsis" />
            </div>
            <div>
              <label className="text-xs">Kaynak tipi</label>
              <select value={kind} onChange={e => setKind(e.target.value)} className="block border rounded px-2 py-1 text-sm w-full">
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs">Yön</label>
              <select value={direction} onChange={e => setDirection(e.target.value)} className="block border rounded px-2 py-1 text-sm w-full">
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs">Hedef tablo</label>
              <Input value={targetTable} onChange={e => setTargetTable(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending} className="mt-3">
            {create.isPending ? "Yaratılıyor..." : "Yarat"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold mb-2">Connector'lar ({connectors?.connectors.length ?? 0})</h2>
          {connectors?.connectors.map(c => (
            <Card key={c.id} className={`mb-2 cursor-pointer ${selected === c.id ? "ring-1 ring-primary" : ""}`}
                  onClick={() => setSelected(c.id)}>
              <CardContent className="py-2">
                <div className="flex justify-between text-sm">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.kind} · {c.direction} → {c.targetTable ?? "—"}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); run.mutate(c.id); }}>Çalıştır</Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {selected && (
            <>
              <h2 className="text-sm font-semibold mt-6 mb-2">Run'lar</h2>
              {runs?.runs.map(r => (
                <Card key={r.id} className="mb-2">
                  <CardContent className="py-2 text-xs">
                    <div className="flex justify-between">
                      <span>#{r.id} · {r.trigger}</span>
                      <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-1">
                      {r.startedAt ? new Date(r.startedAt).toLocaleString("tr-TR") : "—"} · read={r.rowsRead} write={r.rowsWritten} reject={r.rowsRejected}
                    </div>
                    {r.summary?.note && <div className="text-muted-foreground mt-1 italic">{r.summary.note}</div>}
                    {r.errorMessage && <div className="text-red-500 mt-1">{r.errorMessage}</div>}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>

        <div>
          <Card>
            <CardHeader><CardTitle className="text-base">Auto-Mapping</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                Source kolon header'larını yapıştır (virgül veya satır ayırıcı). Hedef tablonun şemasıyla otomatik eşleşme önerisi.
              </p>
              <Textarea rows={4} value={csvHeaders} onChange={e => setCsvHeaders(e.target.value)}
                        placeholder="örn: kod, ad, miktar, tarih, ciro" className="mb-2" />
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <label className="text-xs">Hedef tablo</label>
                  <Input value={targetTable} onChange={e => setTargetTable(e.target.value)} />
                </div>
                <Button disabled={!selected || !csvHeaders.trim()} onClick={() => {
                  const fields = csvHeaders.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                  suggest.mutate({ id: selected!, fields, table: targetTable });
                }}>Eşleştir</Button>
              </div>
              {!selected && <div className="text-xs text-muted-foreground">Önce bir connector seç.</div>}

              {mappings && (
                <div className="space-y-2">
                  {mappings.map((m, i) => (
                    <div key={i} className="border rounded p-2">
                      <div className="text-sm flex justify-between items-center">
                        <div>
                          <span className="font-mono">{m.sourceField}</span>
                          {" → "}
                          <span className="font-mono text-primary">{m.bestMatch ?? "(eşleşmedi)"}</span>
                        </div>
                        <Badge variant={m.confidence > 0.8 ? "default" : m.confidence > 0.6 ? "secondary" : "outline"}>
                          {Math.round(m.confidence * 100)}%
                        </Badge>
                      </div>
                      <details className="text-xs mt-1">
                        <summary className="cursor-pointer text-muted-foreground">Top 5 aday</summary>
                        <ul className="mt-1 ml-2">
                          {m.candidates.map((c: any, j: number) => (
                            <li key={j} className="font-mono">{c.target} · {Math.round(c.score * 100)}%</li>
                          ))}
                        </ul>
                      </details>
                      {m.bestMatch && (
                        <Button size="sm" variant="outline" className="mt-1" onClick={() =>
                          approveMapping.mutate({ id: selected, sourceField: m.sourceField, targetField: m.bestMatch, confidence: m.confidence })
                        }>Onayla</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
