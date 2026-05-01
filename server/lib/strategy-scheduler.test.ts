/**
 * Standalone scheduler test — mocks DB context, runs E3+G2 scenario,
 * verifies S2 returns both ontime.
 *
 * Run: npx tsx server/lib/strategy-scheduler.test.ts
 */

import { generateScenarios, type SchedulerInput, type SchedulerCtx } from "./strategy-scheduler";

// Kullanıcının senaryosu:
//  E3 → 200 adet sipariş; 50 önceden teslim edildi (off-the-books) → kalan 150
//       depoda 50 fabrika kutusu var → ÜRET 100, deadline 1 Haz (31 gün)
//  G2 → 50× GSS20P, deadline 15 May (14 gün), depo 0 → üret 50
//  Paylaşılan: a, b. Stok a=110, b=120. Her cihaz 1×a + 1×b kullanır.
//  Tedarik: a=300 (15g), b=180 (12g) — max lead 15 gün.
//  GSA15 hız: 0.3 gün/birim · GSS20P: 0.2 gün/birim
const input: SchedulerInput = {
  startDate: "2026-05-01",
  devices: [
    { sku: "GSA15", qty: 150, deadline: "2026-06-01", color: "#3f8f5b" },
    { sku: "GSS20P", qty: 50, deadline: "2026-05-15", color: "#3d6fb0" },
  ],
  supplyOrders: [
    { componentCode: "a", qty: 300, leadDays: 15 },
    { componentCode: "b", qty: 180, leadDays: 12 },
  ],
};

const ctx: SchedulerCtx = {
  devices: [
    {
      sku: "GSA15",
      inWarehouse: 50,
      bom: [
        { code: "a", requiredPerUnit: 1, tier: 1, parentCode: null },
        { code: "b", requiredPerUnit: 1, tier: 1, parentCode: null },
      ],
    },
    {
      sku: "GSS20P",
      inWarehouse: 0,
      bom: [
        { code: "a", requiredPerUnit: 1, tier: 1, parentCode: null },
        { code: "b", requiredPerUnit: 1, tier: 1, parentCode: null },
      ],
    },
  ],
  components: [
    { code: "a", currentStock: 110 },
    { code: "b", currentStock: 120 },
  ],
};

const result = generateScenarios(input, ctx);

console.log("\n===== TEPKIME DENKLEMI TEST =====\n");
console.log(`Başlangıç: ${result.startDate}`);
console.log(`Paylaşılan bileşen: ${result.sharedComponents.join(", ") || "(yok)"}`);
if (result.warnings.length) console.log(`Uyarılar:\n  ${result.warnings.join("\n  ")}`);

for (const sc of result.scenarios) {
  console.log(`\n──────── ${sc.id} · ${sc.label} ────────`);
  console.log(`Rationale: ${sc.rationale}`);
  console.log(`\nGantt:`);
  for (const seg of sc.segments) {
    const blocked = seg.blocked ? " [BLOK]" : "";
    console.log(
      `  ${seg.sku.padEnd(8)} ×${String(seg.qty).padStart(3)} | gün ${String(Math.round(seg.startDay)).padStart(3)} → ${String(Math.round(seg.endDay)).padStart(3)} (${(seg.endDay - seg.startDay).toFixed(1)}g)${blocked}`
    );
  }
  console.log(`\nSonuç:`);
  for (const o of sc.outcomes) {
    const tag = o.ontime ? "✓ ZAMANINDA" : `✗ ${o.daysLate}g GEÇ`;
    console.log(
      `  ${o.sku.padEnd(8)} | depo ${o.fromStock} + üret ${o.toProduce} = ${o.requested} | biter gün ${Math.round(o.finishesDay)}, deadline ${o.deadlineDay} | ${tag}`
    );
  }
  console.log(`\nGenel: ${sc.ontime ? "✅ tüm teslimler zamanında" : `❌ en kötü ${sc.worstLateDays}g geç`}`);
}

// Assertions
const [s1, s2] = result.scenarios;
const fail = (msg: string) => {
  console.error(`\n❌ FAIL — ${msg}`);
  process.exit(1);
};

if (!s2.ontime) fail("S2 ontime=false; AI senaryosu zamanında tamamlamalı");

const s2Gss = s2.outcomes.find((o) => o.sku === "GSS20P");
const s2Gsa = s2.outcomes.find((o) => o.sku === "GSA15");
if (!s2Gss?.ontime) fail(`S2 GSS20P ontime=${s2Gss?.ontime}, gecikme=${s2Gss?.daysLate}`);
if (!s2Gsa?.ontime) fail(`S2 GSA15 ontime=${s2Gsa?.ontime}, gecikme=${s2Gsa?.daysLate}`);

if (s2.worstLateDays !== 0) fail(`S2 worstLateDays=${s2.worstLateDays} (0 olmalı)`);

// S1 should fail or be worse than S2 (naive priority causes G2 delay)
if (s1.ontime && s1.worstLateDays === 0) {
  console.warn("\n⚠ Beklenmedik: S1 de zamanında bitti — kullanıcı senaryosunda S1 8g geç olmalıydı");
}

if (result.sharedComponents.length === 0) fail("a, b paylaşılan bileşen olarak işaretlenmedi");

console.log("\n✅ ALL TESTS PASS — S2 her iki teslimi zamanında tamamlıyor\n");
