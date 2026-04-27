/**
 * FAZ 3 — End-to-end smoke test of the closed decision loop:
 *   create_decision → approve → promote_opportunity → promote_work_order → complete → verify outcome → loop report
 */
import {
  createDecision, approveDecision,
  createOpportunityFromSource, createWorkOrderFromOpportunity, completeWorkOrder,
  getLoopReport, listDecisions,
} from "../server/lib/decision-loop";

(async () => {
  console.log("[1] create_decision ...");
  const decisionId = await createDecision({
    decisionType: "purchase",
    title: "Acil 25.230 sipariş — kablo geçiş profili darboğaz",
    rationale: "Pipeline run #1 GSS20P 6-ay simülasyonunda 25.230 -1023 capacity delta darboğaz olarak çıktı. 2000 adet siparişi planı feasible yapar.",
    alternativesConsidered: [
      { title: "Hiçbir şey yapma", predictedValue: 0, predictedCost: 1023 * 2500, reason_rejected: "1023 birim üretim kaybı = ~2.5M TL ciro kaybı" },
      { title: "Yarı sipariş (1000 adet)", predictedValue: 500 * 2500, reason_rejected: "Capacity yarısını kapatır, hala 500 birim eksik" },
    ],
    predictedValue: 1023 * 2500,
    confidence: 0.85,
    sourceEngine: "simulation_pipeline",
    sourcePipelineRunId: 1,
    proposedBy: "agent",
  });
  console.log(`    decisionId=${decisionId}`);

  console.log("[2] approve_decision ...");
  await approveDecision(decisionId, "user");

  console.log("[3] promote_to_opportunity ...");
  const opportunityId = await createOpportunityFromSource({
    decisionId,
    title: "25.230 acil tedarik fırsatı",
    description: "GSS20P 6-aylık plan için darboğaz çözümü",
    category: "inventory",
    projectedValue: 1023 * 2500,
    priority: "high",
  });
  console.log(`    opportunityId=${opportunityId}`);

  console.log("[4] promote_to_work_order ...");
  const workOrderId = await createWorkOrderFromOpportunity({
    opportunityId,
    type: "purchase",
    description: "Tedarikçi A'ya 2000 adet 25.230 sipariş — termin 2 hafta",
  });
  console.log(`    workOrderId=${workOrderId}`);

  console.log("[5] complete_work_order (actualValue = predicted * 0.92 = within 10%, verified_correct beklenir) ...");
  const completion = await completeWorkOrder({
    workOrderId,
    actualValue: 1023 * 2500 * 0.92,  // %92 of predicted, ~8% diff → verified_correct
    completionProof: "Fatura #INV-2026-0427-12345",
    notes: "Tedarikçi 14 gün yerine 11 gün'de teslim etti, plan zamanında uygulandı",
  });
  console.log(`    workOrderId=${completion.workOrderId} → opportunityId=${completion.opportunityId}, decisionId=${completion.decisionId}`);

  console.log("\n[6] get_loop_report ...");
  const report = await getLoopReport();
  console.log(JSON.stringify(report, null, 2));

  console.log("\n[7] list_decisions (verified) ...");
  const verified = await listDecisions({ limit: 5 });
  for (const d of verified) {
    console.log(`    #${d.id} [${d.status}] outcome=${d.outcomeStatus} predicted=${d.predictedValue} actual=${d.actualValue}`);
  }

  process.exit(0);
})().catch(e => { console.error("✗", e.message, e.stack); process.exit(1); });
