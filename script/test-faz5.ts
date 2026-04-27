/**
 * FAZ 5 — End-to-end smoke test:
 * 1. Create Netsis connector + run + auto-map fake CSV headers
 * 2. Create workspace + 4 widgets (kpi/table/chart/pipeline_runner) + resolve data
 */
import {
  createConnector, runConnector, suggestFieldMappings, listConnectors, listConnectorRuns,
} from "../server/lib/sddi-connector";
import {
  createWorkspace, getWorkspace, createWidget, resolveWidgetData,
} from "../server/lib/workshop";

(async () => {
  console.log("[1] create_connector (netsis bidirectional → products) ...");
  const cId = await createConnector({
    name: "Çukurova Netsis ERP",
    kind: "netsis",
    direction: "bidirectional",
    targetTable: "products",
    schedule: "0 */6 * * *",
  });
  console.log(`    connectorId=${cId}`);

  console.log("[2] run_connector (manual) ...");
  const rId = await runConnector(cId, "manual");
  const runs = await listConnectorRuns(cId);
  console.log(`    runId=${rId} status=${runs[0]?.status} duration=${runs[0]?.durationMs}ms`);

  console.log("[3] auto-map fake Çukurova columns → products schema ...");
  const sourceCols = ["stok_kodu", "urun_adi", "kategori", "satis_tutari", "olusturma_tarihi"];
  const mappings = await suggestFieldMappings(cId, sourceCols, "products");
  for (const m of mappings) {
    console.log(`    ${m.sourceField.padEnd(20)} → ${(m.bestMatch ?? "—").padEnd(20)} ${(m.confidence * 100).toFixed(0)}% (top: ${m.candidates.slice(0,3).map(c => `${c.target}=${(c.score*100).toFixed(0)}%`).join(", ")})`);
  }

  console.log("\n[4] create_workspace + add 4 widgets ...");
  const wsId = await createWorkspace({ name: "Çukurova KPI Pano", description: "Smoke test panosu" });
  console.log(`    workspaceId=${wsId}`);

  const widgets = [
    { type: "kpi", title: "Toplam Decision", config: { table: "decisions", aggregation: "count" } },
    { type: "table", title: "Son Pipeline Run'lar", config: { table: "simulation_pipeline_runs", limit: 5, orderBy: "started_at DESC" } },
    { type: "chart", title: "Drift Status Dağılımı", config: { table: "digital_twin_divergence", xField: "drift_status", yField: "id" } },
    { type: "pipeline_runner", title: "GSS20P Hızlı Pipeline", config: { sku: "GSS20P", horizonMonths: 3, mode: "simulation" } },
  ];
  for (const w of widgets) {
    const wid = await createWidget({
      workspaceId: wsId, type: w.type as any, title: w.title, config: w.config,
      dataSource: { kind: "ontology_query" },
    });
    console.log(`    widget #${wid} (${w.type.padEnd(16)}): ${w.title}`);
  }

  const ws = await getWorkspace(wsId);
  console.log(`\n[5] workspace has ${ws?.widgets?.length ?? 0} widgets`);

  console.log("\n[6] resolve sample widget (kpi)...");
  const firstWidget = ws?.widgets?.[0];
  if (firstWidget) {
    const data = await resolveWidgetData(firstWidget.id);
    console.log(`    rowCount=${data?.rowCount ?? 0} (decisions tablosu)`);
  }

  console.log("\n[7] resolve table widget...");
  const tableW = ws?.widgets?.find((w: any) => w.type === "table");
  if (tableW) {
    const data = await resolveWidgetData(tableW.id);
    console.log(`    pipeline runs: ${data?.rowCount ?? 0} satır`);
    if (data?.rows?.length > 0) {
      console.log(`    örnek: run #${data.rows[0].id} sku=${data.rows[0].sku} status=${data.rows[0].status}`);
    }
  }

  console.log("\n✓ FAZ 5 smoke test complete");
  process.exit(0);
})().catch(e => { console.error("✗", e.message, e.stack); process.exit(1); });
