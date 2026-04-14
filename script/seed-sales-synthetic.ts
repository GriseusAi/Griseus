/**
 * seed-sales-synthetic.ts
 *
 * Z simülasyonu: 9 yeni cihaz için 3 yıl (2023-2025) aylık satış üret, import et.
 * Referans: GSS20P'nin gerçek pattern'ı + kategori arketipleri.
 *
 * CLI:
 *   npx tsx script/seed-sales-synthetic.ts [--base=https://griseus.io] [--dry-run]
 */

const BASE = process.argv.find(a => a.startsWith("--base="))?.split("=")[1] || "https://griseus.io";
const DRY_RUN = process.argv.includes("--dry-run");

// ═══════════════════ BASELINE — GSS20P'nin aylık pattern'ı (gerçek data) ═══════════════════
// Ay 1-12: [Oca, Şub, Mar, Nis, May, Haz, Tem, Ağu, Eyl, Eki, Kas, Ara]
const GSS20P_BASELINE = [397, 507, 139, 315, 216, 69, 42, 863, 390, 609, 555, 566];

// ═══════════════════ KATEGORİ ARKETİPLERİ ═══════════════════
// Her cihaz için: (scale çarpanı, faz ofseti, yıllık büyüme %, varyans %)
// scale: GSS20P baseline'ının çarpanı — cihaz ne kadar yoğun satar
// phaseShift: GSS20P pattern'ını kaç ay kaydır (farklı sezon profili)
// growth: yıldan yıla ortalama büyüme
// variance: aylık rastgele gürültü ±%

type Arketype = { scale: number; phaseShift: number; growth: number; variance: number; category: string };

const DEVICES: Record<string, Arketype> = {
  // BH ailesi — büyük borulu radyant, sanayi. Sipariş pik Eyl-Kas (kış öncesi montaj).
  // GSS20P pattern'ı phase +1 ay kaydırıldı → Ağustos peak → Eylül'e taşındı
  "BH.50ST.SV": { scale: 0.55, phaseShift: 1, growth: 0.07, variance: 0.12, category: "BH-büyük-radyant" },
  "BH.50UT.SV": { scale: 0.42, phaseShift: 1, growth: 0.05, variance: 0.14, category: "BH-büyük-radyant" },
  "BH.55ST.SV": { scale: 0.48, phaseShift: 1, growth: 0.08, variance: 0.12, category: "BH-büyük-radyant" },
  "BH.55UT.SV": { scale: 0.38, phaseShift: 1, growth: 0.06, variance: 0.14, category: "BH-büyük-radyant" },

  // ELT ailesi — elite küçük seramik. Ofis/mağaza kış. phaseShift=+2 → Ekim pik.
  "ELT.5-7": { scale: 0.70, phaseShift: 2, growth: 0.04, variance: 0.15, category: "ELT-seramik" },
  // ELT.7-11 — ELT.5-7'nin buyuk kardesi (7-11 kW, daha yuksek guc). Ayni kategori.
  "ELT.7-11": { scale: 0.85, phaseShift: 2, growth: 0.05, variance: 0.14, category: "ELT-seramik-büyük" },

  // GSA ailesi — duvar tipi elektrikli, ev/ofis. Kış pik (Kas-Oca), yaz dip (Haz-Ağu).
  // phaseShift=+3 → Ağustos pik → Kasım pik
  "GSA15":      { scale: 1.20, phaseShift: 3, growth: 0.09, variance: 0.18, category: "GSA-duvar-küçük" },
  "GSA20":      { scale: 0.95, phaseShift: 3, growth: 0.07, variance: 0.16, category: "GSA-duvar-orta" },
  "GSA30":      { scale: 0.60, phaseShift: 3, growth: 0.05, variance: 0.18, category: "GSA-duvar-büyük" },

  // GSS40P — Supra Plus premium (GSS20P'nin big-brother'ı)
  "GSS40P":     { scale: 0.65, phaseShift: 0, growth: 0.06, variance: 0.13, category: "GSS-premium" },
};

// ═══════════════════ ÜRETİM ═══════════════════

function seededRandom(seed: number): () => number {
  // Mulberry32 — deterministik rastgele (her run'da aynı sonuç)
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateSalesForDevice(sku: string, arc: Arketype): Array<{ year: number; month: number; qty: number }> {
  const rand = seededRandom(sku.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const out: Array<{ year: number; month: number; qty: number }> = [];
  const YEARS = [2023, 2024, 2025];

  for (let yi = 0; yi < YEARS.length; yi++) {
    const year = YEARS[yi];
    const yearGrowth = Math.pow(1 + arc.growth, yi);

    for (let m = 1; m <= 12; m++) {
      // Faz kaydırma: pozitif shift = pik ay ILERI kayar (Ağu → Kas için +3)
      const shiftedIdx = ((m - 1 - arc.phaseShift + 24) % 12);
      const base = GSS20P_BASELINE[shiftedIdx];

      // Scale + yıllık büyüme + noise
      const noise = 1 + (rand() * 2 - 1) * arc.variance;
      const qty = Math.max(1, Math.round(base * arc.scale * yearGrowth * noise));

      out.push({ year, month: m, qty });
    }
  }
  return out;
}

// ═══════════════════ APPLY ═══════════════════

async function post(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

async function main() {
  console.log(`━━━ Z-SİMÜLASYON — 9 cihaz × 3 yıl × 12 ay ━━━`);
  console.log(`Baseline: GSS20P'nin aylık pattern'ı`);
  console.log(`Mod: ${DRY_RUN ? "DRY-RUN" : `APPLY → ${BASE}`}\n`);

  const allData: Record<string, Array<{ year: number; month: number; qty: number }>> = {};
  let totalRows = 0;

  // Üret + önizleme
  for (const [sku, arc] of Object.entries(DEVICES)) {
    const data = generateSalesForDevice(sku, arc);
    allData[sku] = data;
    totalRows += data.length;

    // 2025 aylık özet (en son yıl)
    const y2025 = data.filter(d => d.year === 2025).map(d => d.qty);
    const total = y2025.reduce((a, b) => a + b, 0);
    const peak = y2025.indexOf(Math.max(...y2025)) + 1;
    const dip = y2025.indexOf(Math.min(...y2025)) + 1;
    console.log(`  ${sku.padEnd(14)} ${arc.category.padEnd(22)} 2025 toplam: ${String(total).padStart(5)} · pik ay ${peak} · dip ay ${dip}`);
    console.log(`    2025: [${y2025.join(", ")}]`);
  }

  console.log(`\nÜretilen satır: ${totalRows}`);

  if (DRY_RUN) {
    console.log("\n(Dry-run) API'ye yazılmadı.");
    return;
  }

  // Apply — her cihaz için /bulk/sales
  console.log(`\n━━━ APPLY → /api/import/bulk/sales ━━━`);
  for (const [sku, data] of Object.entries(allData)) {
    try {
      const res = await post("/api/import/bulk/sales", { sku, data });
      console.log(`  ✓ ${sku.padEnd(14)} ${JSON.stringify(res)}`);
    } catch (e: any) {
      console.error(`  ✗ ${sku.padEnd(14)} ${e.message}`);
    }
  }

  console.log(`\n━━━ DSE tetikleme ━━━`);
  console.log(`bulk/sales endpoint'i her cihaz için bulkUpdateFromSalesHistory'yi fire-and-forget tetikler.`);
  console.log(`~5-10 sn sonra /api/planning/forecast/:sku ile her cihaza özel sezonsal çarpanlar hazır.\n`);

  console.log(`━━━ TAMAM ━━━ Z aktif. X+Y.1+Y.2+Z hepsi canlı.`);
}

main().catch(e => { console.error("\n❌", e.message || e); process.exit(1); });
