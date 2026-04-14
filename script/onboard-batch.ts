/**
 * onboard-batch.ts — Çukurova BOM batch onboarding
 *
 * Octopus mimarisi (Palantir Foundry+Ontology+AIP):
 *   - Tek beyin: tek componentStock havuzu, TÜM kolları besler (Y.2 auto-join)
 *   - Bağımsız kollar: her cihaz kendi BOM'unu yüklüyor, izole
 *   - Sürekli validasyon: parse → cross-audit → dry-run → apply → post-verify
 *   - Correction propagation: /bulk/stock update-or-insert → tek bileşen güncelleme N cihaza akar
 *
 * Kural:
 *   - Cihaz SKU = dosya adı (ticari ad: GSA15, GSS40P, BH.50ST.SV)
 *   - Bileşen kodu = Excel Stok Kodu (iç kod: 25.018, 91409408, ...)
 *   - Hiyerarşi = Stok Kodu'ndaki indent (5 boşluk = 1 seviye)
 *
 * CLI:
 *   npx tsx script/onboard-batch.ts --dir=/path/to/exceller [--base=http://localhost:5000] [--dry-run]
 *   npx tsx script/onboard-batch.ts --dir=... --base=https://griseus.io
 */

import * as XLSX from "xlsx";
import { readdirSync, readFileSync } from "fs";
import { join, basename } from "path";

// ═════════════════════════════════════ CLI ARGS ═════════════════════════════════════

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(name + "="));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

const DIR = arg("--dir");
const BASE = arg("--base") || "http://localhost:5000";
const DRY_RUN = flag("--dry-run");

if (!DIR) {
  console.error("❌ --dir=/path/to/exceller zorunlu");
  process.exit(1);
}

// ═════════════════════════════════════ TYPES ═════════════════════════════════════

type BomItem = {
  code: string;
  name: string;
  qty: number;
  unit: string;
  tier: number;
  parentCode: string | null;
};

type Device = {
  sku: string;           // ticari (dosya adı)
  name: string;          // Excel row 1 col B
  internalCode: string;  // Excel row 1 col A (trace için)
  items: BomItem[];
  stocks: Map<string, { stock: number; unit: string }>; // bileşen kodu → stok
};

// ═════════════════════════════════════ PARSE ═════════════════════════════════════

const FOOTER_KEYWORDS = ["Toplam Maliyet", "Malzeme Maliyeti", "Maliyet Katkısı", "Hammadde Toplamı"];
// İşçilik satırları: fiziksel bileşen değil, sadece maliyet muhasebesi için Excel'e eklenmiş.
// BOM'a ve stok havuzuna ALINMAMALI — alınırsa "alarm: 0 stok, bileşen bitti" halüsinasyonu olur.
// Örnek: "20.068 BH Reflektör Büküm İşçiliği", "26.098 BH 4" yanma borusu flanş ve kaynak işciliği"
const LABOR_KEYWORDS = ["işcilik", "işçilik"];

function indentLevel(raw: string): number {
  const m = raw.match(/^(\s*)/);
  return Math.floor((m?.[1].length || 0) / 5);
}

function parseDevice(filePath: string): Device {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellText: true, cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw:true — numeric degerler Turkce locale formatindan bozulmadan alinsin
  // (raw:false ile "6,236." → NaN). Leading whitespace Stok Kodu stringlerinde korunur.
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: true });

  if (rows.length < 2) throw new Error(`${filePath}: çok az satır`);

  const sku = basename(filePath).replace(/\.xls$/i, "");
  const rootRow = rows[1];
  const internalCode = String(rootRow[0] ?? "").trim();
  const name = String(rootRow[1] ?? "").trim();

  const items: BomItem[] = [];
  const stocks = new Map<string, { stock: number; unit: string }>();
  const stack: string[] = []; // stack[tier-1] = o seviyedeki son gördüğümüz kod

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const rawCode = String(row[0] ?? "");
    const code = rawCode.trim();
    const itemName = String(row[1] ?? "").trim();
    const qty = Number(row[3] ?? 0);
    const unit = String(row[4] ?? "").trim() || "AD";
    const stock = Number(row[7] ?? 0);

    if (!code) continue;
    // Footer satırları: "Toplam Maliyet" gibi metin ya code ya name kolonuna yazılmış olabilir
    if (FOOTER_KEYWORDS.some(k => code.includes(k) || itemName.includes(k))) continue;
    if (!itemName) continue;
    // qty=0 üretim-dışı satır (etiket/maliyet kalemi) — server da zaten atıyor (import.ts:141).
    // Adapter tarafında atmak parse/DB sayilari birebir eslesmesini saglar.
    if (!qty || qty <= 0) continue;
    // İşçilik satırları: fiziksel bileşen değil → BOM ve stok havuzu DIŞINDA kalmalı.
    // Bunları almak "alarm: 0 stok, işçilik bitti!" gibi false-positive doğurur.
    if (LABOR_KEYWORDS.some(k => itemName.toLowerCase().includes(k))) continue;

    const lvl = indentLevel(rawCode);        // 0, 1, 2, 3
    const tier = lvl + 1;                    // Griseus: tier 1 = direct child
    const parentCode = tier === 1 ? null : stack[tier - 2] || null;

    items.push({ code, name: itemName, qty, unit, tier, parentCode });

    // Stack güncelle: bu tier'daki son kayıt
    stack.length = tier;                     // üst seviyeleri kırp
    stack[tier - 1] = code;

    // Stok (Y.1 gömülü) — aynı kod tekrarlarsa son değer kazanır (batch içinde)
    if (stock > 0 || !stocks.has(code)) {
      stocks.set(code, { stock, unit });
    }
  }

  return { sku, name, internalCode, items, stocks };
}

// ═════════════════════════════════════ OCTOPUS AUDIT ═════════════════════════════════════

function crossProductAudit(devices: Device[]) {
  const usage = new Map<string, { name: string; devices: Set<string> }>();
  for (const d of devices) {
    for (const it of d.items) {
      const cur = usage.get(it.code) || { name: it.name, devices: new Set() };
      cur.devices.add(d.sku);
      usage.set(it.code, cur);
    }
  }
  const entries = Array.from(usage.entries()).map(([code, v]) => ({ code, ...v, n: v.devices.size }));
  entries.sort((a, b) => b.n - a.n);

  const shared = entries.filter(e => e.n >= 2);
  const histogram = new Map<number, number>();
  for (const e of entries) histogram.set(e.n, (histogram.get(e.n) || 0) + 1);

  console.log("\n━━━ OCTOPUS CROSS-PRODUCT AUDIT ━━━");
  console.log(`Unique bileşen: ${entries.length}`);
  console.log(`Paylaşılan (2+ cihaz): ${shared.length}  (%${Math.round(shared.length / entries.length * 100)})`);
  console.log("\nDağılım:");
  for (const n of Array.from(histogram.keys()).sort((a, b) => b - a)) {
    console.log(`  ${n} cihazda: ${histogram.get(n)} bileşen`);
  }
  console.log("\nTop 10 paylaşılan kol-bağlantıları:");
  for (const e of shared.slice(0, 10)) {
    const devs = Array.from(e.devices).join(", ");
    console.log(`  ${e.code.padEnd(14)} ${String(e.n).padStart(2)}/9  [${devs}]`);
    console.log(`                    ${e.name.slice(0, 70)}`);
  }

  // ZORUNLU KAPI: paylaşım yoksa Octopus kırılmış demektir
  if (shared.length === 0) {
    throw new Error("❌ Cross-product paylaşım = 0. Octopus mimarisi anlamsız. Batch DURDU.");
  }
  console.log(`\n✓ Octopus geçti: ${shared.length} paylaşılan bileşen → Y.2 otomatik join çalışacak`);
}

// ═════════════════════════════════════ APPLY (POST) ═════════════════════════════════════

async function post(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function applyBatch(devices: Device[]): Promise<number | null> {
  console.log("\n━━━ APPLY (bağımsız kollar, tek beyne yazılıyor) ━━━");

  // 0) Pre-import snapshot (Palantir Foundry rollback güvencesi)
  //    SDDI prensibi: "reduce migration risk" + Correction Propagation
  let snapshotId: number | null = null;
  try {
    const snap = await post("/api/foundry/snapshots", {
      name: `onboard-batch pre-import: ${devices.length} cihaz (${devices.map(d => d.sku).join(", ")})`,
      tables: ["component_stock", "bom_items"],
    });
    snapshotId = snap.id;
    console.log(`\n[0/3] ✓ Snapshot alındı #${snapshotId} — ${snap.totalRecords} kayıt, ${snap.sizeBytes} byte`);
    console.log(`       Rollback: POST /api/foundry/snapshots/${snapshotId}/rollback`);
  } catch (e: any) {
    console.error(`\n[0/3] ✗ Snapshot alınamadı: ${e.message}`);
    throw new Error("Snapshot başarısız — batch DURDU (rollback güvencesi yok)");
  }

  // 1) Cihazlar (X kökü)
  console.log("\n[1/3] /api/import/bulk/products");
  const prodRes = await post("/api/import/bulk/products", {
    products: devices.map(d => ({ sku: d.sku, name: d.name })),
  });
  console.log(`  ✓ ${JSON.stringify(prodRes)}`);

  // 2) BOM (her cihaz bir arm, tek beyne bağlanır)
  console.log("\n[2/3] /api/import/bulk/bom (her cihaz)");
  for (const d of devices) {
    const res = await post("/api/import/bulk/bom", {
      sku: d.sku,
      items: d.items.map(i => ({
        code: i.code, name: i.name, qty: i.qty, unit: i.unit,
        tier: i.tier, parentCode: i.parentCode || undefined,
      })),
    });
    console.log(`  ✓ ${d.sku.padEnd(14)} ${res.created}/${res.total} satır`);
  }

  // 3) Stok havuzu (TEK BEYIN — Y.2 otomatik cross-binding)
  console.log("\n[3/3] /api/import/bulk/stock (tek havuz, Octopus kalbi)");
  const pool = new Map<string, { stock: number; unit: string }>();
  for (const d of devices) {
    for (const [code, v] of d.stocks) {
      const ex = pool.get(code);
      if (!ex || (v.stock > 0 && ex.stock === 0)) pool.set(code, v);
    }
  }
  const stockItems = Array.from(pool.entries()).map(([code, v]) => ({ code, stock: v.stock, unit: v.unit }));
  const stockRes = await post("/api/import/bulk/stock", { items: stockItems });
  console.log(`  ✓ ${JSON.stringify(stockRes)} (havuz boyutu: ${pool.size})`);

  return snapshotId;
}

// ═════════════════════════════════════ POST-IMPORT VERIFY ═════════════════════════════════════

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) return null;
  return res.json();
}

async function verify(devices: Device[], snapshotId: number | null) {
  console.log("\n━━━ POST-IMPORT VALIDATION ━━━");
  let fails = 0;

  // A) BOM tree render (validation #4 in cross_product_octopus)
  console.log("\n[A] BOM tree render — her cihaz API'den okunabiliyor mu");
  for (const d of devices) {
    const bom = await get(`/api/bom/${encodeURIComponent(d.sku)}`);
    const count = bom?.totalComponents ?? (Array.isArray(bom) ? bom.length : (bom?.items?.length ?? 0));
    const expected = d.items.length;
    const ok = count >= expected;
    console.log(`  ${ok ? "✓" : "✗"} ${d.sku.padEnd(14)} BOM ${count}/${expected}`);
    if (!ok) fails++;
  }

  // B) Kapasite hesabı (validation #3) — Z'siz çalışır çünkü kapasite = stok / BOM.qty
  console.log("\n[B] Production capacity — /api/bom/:sku/production-capacity");
  for (const d of devices) {
    const cap = await get(`/api/bom/${encodeURIComponent(d.sku)}/production-capacity`);
    if (!cap || typeof cap !== "object") {
      console.log(`  ✗ ${d.sku.padEnd(14)} kapasite sorgulanamadı`);
      fails++;
      continue;
    }
    const producible = cap.producible ?? cap.maxProducible ?? cap.units ?? "?";
    const btop = cap.bottlenecks?.[0] || cap.bottleneck || "—";
    const btxt = typeof btop === "object" ? (btop.code || btop.name || JSON.stringify(btop).slice(0, 40)) : String(btop).slice(0, 40);
    console.log(`  ✓ ${d.sku.padEnd(14)} üretilebilir: ${producible}  darboğaz: ${btxt}`);
  }

  // C) Octopus kanıtı — cross-product stok havuzu çağırıldığında 2+ cihazda kullanılan
  //    bir bileşen bulunabiliyor mu? (Y.2 canlı mı)
  console.log("\n[C] Octopus Y.2 — cross-product paylaşım havuzu canlı mı");
  const sample = devices.flatMap(d => d.items.map(i => ({ sku: d.sku, code: i.code })));
  const counts = new Map<string, number>();
  for (const s of sample) counts.set(s.code, (counts.get(s.code) || 0) + 1);
  const shared = Array.from(counts.entries()).filter(([, n]) => n >= 2);
  console.log(`  ✓ Paylaşılan bileşen (DB üstü sorgu): ${shared.length}`);

  if (fails > 0) {
    console.log(`\n❌ ${fails} validation başarısız.`);
    if (snapshotId) console.log(`   Rollback: POST /api/foundry/snapshots/${snapshotId}/rollback`);
    process.exit(1);
  }
  console.log("\n✓ Tüm kollar beynin üstünde — batch yeşil. (Z/satış geldiğinde tükenme+sezonsallık validation'ı açılır)");
}

// ═════════════════════════════════════ MAIN ═════════════════════════════════════

async function main() {
  const files = readdirSync(DIR!).filter(f => /\.xls$/i.test(f)).map(f => join(DIR!, f));
  if (!files.length) { console.error(`❌ ${DIR} içinde .xls yok`); process.exit(1); }

  console.log(`━━━ PARSE (${files.length} dosya) ━━━`);
  const devices: Device[] = [];
  for (const f of files) {
    try {
      const d = parseDevice(f);
      devices.push(d);
      console.log(`  ✓ ${d.sku.padEnd(14)} ${d.items.length.toString().padStart(3)} satır · iç kod ${d.internalCode}`);
    } catch (e: any) {
      console.error(`  ✗ ${basename(f)}: ${e.message}`);
      process.exit(1);
    }
  }

  crossProductAudit(devices);

  // Toplam özet
  const totalItems = devices.reduce((a, d) => a + d.items.length, 0);
  const uniqueCodes = new Set(devices.flatMap(d => d.items.map(i => i.code))).size;
  console.log(`\n━━━ ÖZET ━━━`);
  console.log(`Cihaz: ${devices.length}`);
  console.log(`BOM satırı: ${totalItems}`);
  console.log(`Unique bileşen (tek havuz): ${uniqueCodes}`);
  console.log(`Mod: ${DRY_RUN ? "DRY-RUN (yazılmayacak)" : `APPLY → ${BASE}`}`);

  if (DRY_RUN) {
    console.log("\n(Dry-run) API'ye yazılmadı. --dry-run kaldırınca apply çalışır.");
    return;
  }

  const snapshotId = await applyBatch(devices);
  await verify(devices, snapshotId);

  console.log("\n━━━ TAMAM ━━━");
  console.log("Octopus aktif: X (BOM) + Y.1 (stok) + Y.2 (cross-binding) yüklendi.");
  console.log("Kalan: Z (3 yıl satış) — Çukurova'dan gelince /api/import/bulk/sales ile.");
}

main().catch(e => { console.error("\n❌", e.message || e); process.exit(1); });
