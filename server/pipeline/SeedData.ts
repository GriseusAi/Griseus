import { ontologyService } from "../ontology/OntologyService";
import { computeEngine } from "../ontology/ComputeEngine";
import { db } from "../db";
import { objectTypes } from "@shared/schema";

/**
 * Seeds the Griseus Ontology Engine with real Çukurova Isı Sistemleri data.
 * Idempotent — uses upserts throughout.
 */
export async function seedOntologyEngine() {
  console.log("[griseus] Seeding ontology engine...");

  // ═══════════════════════════════════════════════════════════════════
  // 1. Object Types
  // ═══════════════════════════════════════════════════════════════════

  await ontologyService.createObjectType("product", "Ürün (Product)", {
    category: "string",
    line: "string",
    total_production: "number",
    stock_percent: "number",
    order_percent: "number",
    unit_cost: "number",
    lead_time_days: "number",
    monthly_production: "number[]",
    current_stock: "number",
  }, "Finished goods — gas heaters, electric heaters, panels");

  await ontologyService.createObjectType("production_order", "Üretim Emri (Production Order)", {
    stok_kodu: "string",
    seri_no: "string",
    is_emri_no: "string",
    adet: "number",
    order_type: "string",
    imalat_tarihi: "string",
  }, "Individual production batches from manufacturing lines");

  await ontologyService.createObjectType("inventory_level", "Stok Seviyesi (Inventory Level)", {
    product_sku: "string",
    quantity: "number",
    warehouse: "string",
    last_counted: "string",
  }, "Current stock levels per product");

  await ontologyService.createObjectType("customer", "Müşteri (Customer)", {
    contact_name: "string",
    city: "string",
    type: "string",
  }, "Buyer entities — dealers, contractors, end-customers");

  await ontologyService.createObjectType("supplier", "Tedarikçi (Supplier)", {
    contact_name: "string",
    material_types: "string[]",
    lead_time_days: "number",
  }, "Raw material and component suppliers");

  await ontologyService.createObjectType("production_line", "Üretim Hattı (Production Line)", {
    type: "string",
    worker_count: "number",
    annual_capacity: "number",
    utilization_percent: "number",
  }, "Manufacturing production lines — Gazlı and Elektrikli");

  await ontologyService.createObjectType("personnel", "Personel", {
    department: "string",
    role: "string",
  }, "Çukurova staff from Netsis HR data");

  await ontologyService.createObjectType("semi_finished_product", "Yarı Mamül (Semi-Finished)", {
    category: "string",
    stage: "string",
    unit_cost: "number",
    current_stock: "number",
    monthly_production: "number[]",
    requires_new_facility: "boolean",
  }, "Semi-finished goods — steel casings, panels before assembly. Produced at new rented facility.");

  await ontologyService.createObjectType("raw_material", "Ham Madde (Raw Material)", {
    category: "string",
    supplier: "string",
    unit_cost: "number",
    current_stock: "number",
    lead_time_days: "number",
    reorder_point: "number",
  }, "Raw materials from external suppliers — steel, copper, components");

  // ═══════════════════════════════════════════════════════════════════
  // 2. Products (Gazlı İmalat line — real data)
  // ═══════════════════════════════════════════════════════════════════

  // Monthly production totals (Jan-Dec) for the overall gas line
  const gasMonthly = [528, 390, 617, 215, 351, 602, 324, 540, 445, 662, 376, 121];
  const elecMonthly = [1104, 1343, 979, 733, 1179, 817, 813, 1811, 1415, 2144, 1350, 717];
  const totalGas = gasMonthly.reduce((a, b) => a + b, 0); // 5171

  // Per-product data from actual production reports
  const productsData = [
    { sku: "ELT.7-11",   name: "Panel Radyatör ELT 7-11",       total: 2161, stockPct: 79, orderPct: 21, unitCost: 180 },
    { sku: "CC.7-11",    name: "Panel Radyatör CC 7-11",        total: 845,  stockPct: 89, orderPct: 11, unitCost: 170 },
    { sku: "BH 55",      name: "Banyo Havlu Radyatör BH 55",   total: 591,  stockPct: 43, orderPct: 57, unitCost: 140 },
    { sku: "SSP 40/60",  name: "Sac Panel Radyatör SSP 40/60", total: 525,  stockPct: 99, orderPct: 1,  unitCost: 200 },
    { sku: "CPH.33",     name: "Compact Panel CPH 33",          total: 275,  stockPct: 69, orderPct: 31, unitCost: 160 },
    { sku: "ELT.5-7",    name: "Panel Radyatör ELT 5-7",       total: 169,  stockPct: 53, orderPct: 47, unitCost: 150 },
    { sku: "SSE 27/40",  name: "Sac Eleman Radyatör SSE 27/40",total: 119,  stockPct: 100,orderPct: 0,  unitCost: 190 },
    { sku: "CC.5-7",     name: "Panel Radyatör CC 5-7",         total: 90,   stockPct: 67, orderPct: 33, unitCost: 145 },
    { sku: "SSE 20/30",  name: "Sac Eleman Radyatör SSE 20/30",total: 86,   stockPct: 100,orderPct: 0,  unitCost: 185 },
    { sku: "CPH.22",     name: "Compact Panel CPH 22",          total: 77,   stockPct: 40, orderPct: 60, unitCost: 155 },
    { sku: "CPH.44",     name: "Compact Panel CPH 44",          total: 66,   stockPct: 61, orderPct: 39, unitCost: 175 },
    { sku: "MELT.7-11",  name: "Mini ELT Panel 7-11",           total: 31,   stockPct: 0,  orderPct: 100,unitCost: 165 },
    { sku: "SSP 47/70",  name: "Sac Panel Radyatör SSP 47/70", total: 22,   stockPct: 100,orderPct: 0,  unitCost: 210 },
    { sku: "BH 15",      name: "Banyo Havlu Radyatör BH 15",   total: 20,   stockPct: 20, orderPct: 80, unitCost: 120 },
    { sku: "BH 20",      name: "Banyo Havlu Radyatör BH 20",   total: 15,   stockPct: 33, orderPct: 67, unitCost: 125 },
  ];

  for (const p of productsData) {
    // Distribute monthly production proportionally to overall gas line monthly pattern
    const share = p.total / totalGas;
    const monthly = gasMonthly.map(m => Math.round(m * share));
    // Adjust last month to match total exactly
    const monthlySum = monthly.reduce((a, b) => a + b, 0);
    monthly[11] += p.total - monthlySum;

    // Estimate current stock as stock_percent of a few months' production
    const currentStock = Math.round(p.total * (p.stockPct / 100) * 0.3);

    await ontologyService.createObject("product", p.sku, p.name, {
      category: "gazli_imalat",
      line: "gazli",
      total_production: p.total,
      stock_percent: p.stockPct,
      order_percent: p.orderPct,
      unit_cost: p.unitCost,
      lead_time_days: 14,
      lead_time_variance_days: 3,
      monthly_production: monthly,
      current_stock: currentStock,
      annual_revenue: p.total * p.unitCost,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. Production Lines
  // ═══════════════════════════════════════════════════════════════════

  const gazliLine = await ontologyService.createObject("production_line", "gazli_imalat", "Gazlı İmalat Hattı", {
    type: "gazli",
    worker_count: 9,
    annual_capacity: 7484,
    actual_output: totalGas,
    utilization_percent: 69,
    monthly_production: gasMonthly,
  });

  const totalElec = elecMonthly.reduce((a, b) => a + b, 0);
  const elektrikliLine = await ontologyService.createObject("production_line", "elektrikli_imalat", "Elektrikli İmalat Hattı", {
    type: "elektrikli",
    worker_count: 7,
    annual_capacity: 17107,
    actual_output: totalElec,
    utilization_percent: 64,
    monthly_production: elecMonthly,
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. Personnel (from Netsis)
  // ═══════════════════════════════════════════════════════════════════

  const personnel = [
    { id: "irem_buyuk",       name: "İrem Büyük",            dept: "Üretim",     role: "Üretim Sorumlusu" },
    { id: "resul_altunzencir",name: "Resul Altunzencir",     dept: "Üretim",     role: "Üretim Operatörü" },
    { id: "seyhan_korkmaz",   name: "Seyhan Korkmaz",        dept: "Üretim",     role: "Üretim Operatörü" },
    { id: "gokhan_erdem",     name: "Gökhan Erdem",          dept: "Satınalma",  role: "Satınalma Uzmanı" },
    { id: "kemal_aktas",      name: "Kemal Aktaş",           dept: "Satınalma",  role: "Satınalma Müdürü" },
    { id: "harun_akpinar",    name: "Harun Akpınar",         dept: "Servis",     role: "Servis Teknisyeni" },
    { id: "sezer_saricayir",  name: "Sezer Sarıçayır",       dept: "Servis",     role: "Servis Teknisyeni" },
    { id: "meve_celebi",      name: "Meve Kamil Çelebi",     dept: "Satış",      role: "Satış Müdürü" },
    { id: "fikri_dibet",      name: "Fikri Dibet",           dept: "Satış",      role: "Satış Temsilcisi" },
    { id: "yasin_ilkiz",      name: "Yasin İlkiz",           dept: "Satış",      role: "Satış Temsilcisi" },
    { id: "huseyin_satis",    name: "Hüseyin",               dept: "Satış",      role: "Satış Temsilcisi" },
    { id: "deniz_gezer",      name: "Deniz Gezer",           dept: "Satış",      role: "Satış Temsilcisi" },
    { id: "suleyman_kilic",   name: "Süleyman Kılıç",        dept: "Depo",       role: "Depo Sorumlusu" },
    { id: "volkan_karaaslan",  name: "Volkan Karaaslan",      dept: "Depo",       role: "Depo Görevlisi" },
    { id: "huseyin_pestil",   name: "Hüseyin Pestil",        dept: "Muhasebe",   role: "Muhasebe Müdürü" },
    { id: "seda_coskun",      name: "Seda Coşkun",           dept: "Muhasebe",   role: "Muhasebeci" },
  ];

  for (const p of personnel) {
    await ontologyService.createObject("personnel", p.id, p.name, {
      department: p.dept,
      role: p.role,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. Link Types
  // ═══════════════════════════════════════════════════════════════════

  await ontologyService.createLinkType("produces", "Üretir", "production_line", "product", "one_to_many");
  await ontologyService.createLinkType("bom_contains", "BOM İçerir", "product", "product", "many_to_many", {
    quantity: "number",
  });
  await ontologyService.createLinkType("ordered_by", "Sipariş Veren", "production_order", "customer", "many_to_one");
  await ontologyService.createLinkType("tracks_inventory", "Stok Takibi", "inventory_level", "product", "one_to_one");
  await ontologyService.createLinkType("supplied_by", "Tedarik Eden", "product", "supplier", "many_to_many");
  await ontologyService.createLinkType("assembles_into", "Montajlanır", "semi_finished_product", "product", "many_to_many", {
    quantity: "number",
  });
  await ontologyService.createLinkType("composed_of", "İçerir", "product", "raw_material", "many_to_many", {
    quantity: "number",
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5b. Semi-finished products (Yarı Mamül) — new facility
  // ═══════════════════════════════════════════════════════════════════

  const semiFinishedData = [
    { sku: "KASA-ELT-7",    name: "Kasa ELT 7-11 (Çelik Gövde)",      unitCost: 65,  stock: 180, monthly: [40, 35, 50, 20, 30, 48, 28, 44, 38, 52, 32, 12] },
    { sku: "KASA-CC-7",     name: "Kasa CC 7-11 (Çelik Gövde)",       unitCost: 60,  stock: 95,  monthly: [18, 14, 20, 8, 12, 20, 10, 18, 14, 22, 12, 4] },
    { sku: "KASA-BH-55",    name: "Kasa BH 55 (Havlu Kasa)",          unitCost: 45,  stock: 55,  monthly: [12, 8, 14, 5, 8, 14, 7, 12, 10, 16, 8, 3] },
    { sku: "PANEL-SSP-40",  name: "Panel SSP 40/60 (Sac Panel Yarı)", unitCost: 70,  stock: 120, monthly: [10, 8, 12, 4, 7, 12, 6, 10, 8, 14, 8, 2] },
    { sku: "KASA-CPH-33",   name: "Kasa CPH 33 (Compact Gövde)",      unitCost: 55,  stock: 40,  monthly: [6, 4, 7, 2, 4, 7, 3, 6, 4, 8, 4, 1] },
    { sku: "ELEMAN-SSE-27", name: "Eleman SSE 27/40 (Sac Eleman)",    unitCost: 75,  stock: 30,  monthly: [3, 2, 4, 1, 2, 4, 2, 3, 2, 4, 2, 1] },
  ];

  for (const sf of semiFinishedData) {
    await ontologyService.createObject("semi_finished_product", sf.sku, sf.name, {
      category: "yari_mamul",
      stage: "uretim",
      unit_cost: sf.unitCost,
      current_stock: sf.stock,
      monthly_production: sf.monthly,
      requires_new_facility: true,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5c. Raw materials (Ham Madde)
  // ═══════════════════════════════════════════════════════════════════

  const rawMaterialData = [
    { sku: "HM-CELIK-DKP",   name: "DKP Çelik Sac (0.8mm)",      unitCost: 28, stock: 4500, leadTime: 10, reorder: 1500, supplier: "Erdemir" },
    { sku: "HM-CELIK-GAL",   name: "Galvaniz Sac (0.6mm)",        unitCost: 32, stock: 3200, leadTime: 10, reorder: 1200, supplier: "Erdemir" },
    { sku: "HM-BAKIR-BORU",  name: "Bakır Boru (8mm)",            unitCost: 85, stock: 800,  leadTime: 14, reorder: 300,  supplier: "Sarkuysan" },
    { sku: "HM-BRULOR",      name: "Brülör Seti (Gazlı)",         unitCost: 120,stock: 350,  leadTime: 21, reorder: 150,  supplier: "Honeywell TR" },
    { sku: "HM-REZISTANS",   name: "Rezistans Elemanı (Elektrik)",unitCost: 45, stock: 1200, leadTime: 7,  reorder: 500,  supplier: "EAE Elektrik" },
    { sku: "HM-TERMOSTAT",   name: "Termostat (Dijital)",         unitCost: 35, stock: 900,  leadTime: 14, reorder: 400,  supplier: "Danfoss TR" },
    { sku: "HM-BOYA-RAL",    name: "Elektrostatik Boya (RAL 9016)",unitCost: 18,stock: 600,  leadTime: 5,  reorder: 200,  supplier: "Pulver Boya" },
    { sku: "HM-IZOLASYON",   name: "Cam Yünü İzolasyon",          unitCost: 22, stock: 1500, leadTime: 7,  reorder: 500,  supplier: "İzocam" },
  ];

  for (const rm of rawMaterialData) {
    await ontologyService.createObject("raw_material", rm.sku, rm.name, {
      category: "ham_madde",
      supplier: rm.supplier,
      unit_cost: rm.unitCost,
      current_stock: rm.stock,
      lead_time_days: rm.leadTime,
      reorder_point: rm.reorder,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5d. Links: semi_finished → product, product → raw_material
  // ═══════════════════════════════════════════════════════════════════

  const allProducts = await ontologyService.getObjectsByType("product");
  const allSemiFinished = await ontologyService.getObjectsByType("semi_finished_product");
  const allRawMaterials = await ontologyService.getObjectsByType("raw_material");

  // Semi-finished → Product links (casings assemble into finished goods)
  const sfToProductMap: Record<string, string[]> = {
    "KASA-ELT-7":    ["ELT.7-11", "ELT.5-7"],
    "KASA-CC-7":     ["CC.7-11", "CC.5-7"],
    "KASA-BH-55":    ["BH 55", "BH 20", "BH 15"],
    "PANEL-SSP-40":  ["SSP 40/60", "SSP 47/70"],
    "KASA-CPH-33":   ["CPH.33", "CPH.22", "CPH.44"],
    "ELEMAN-SSE-27": ["SSE 27/40", "SSE 20/30"],
  };

  for (const [sfSku, productSkus] of Object.entries(sfToProductMap)) {
    const sfObj = allSemiFinished.find(o => o.externalId === sfSku);
    if (!sfObj) continue;
    for (const pSku of productSkus) {
      const pObj = allProducts.find(o => o.externalId === pSku);
      if (pObj) {
        await ontologyService.createLink("assembles_into", sfObj.id, pObj.id, { quantity: 1 });
      }
    }
  }

  // Product → Raw Material links (products need raw materials)
  const productToRmMap: Record<string, string[]> = {
    "ELT.7-11":  ["HM-CELIK-DKP", "HM-BAKIR-BORU", "HM-BRULOR", "HM-TERMOSTAT", "HM-BOYA-RAL", "HM-IZOLASYON"],
    "CC.7-11":   ["HM-CELIK-DKP", "HM-BAKIR-BORU", "HM-BRULOR", "HM-TERMOSTAT", "HM-BOYA-RAL"],
    "BH 55":     ["HM-CELIK-GAL", "HM-BAKIR-BORU", "HM-REZISTANS", "HM-BOYA-RAL"],
    "SSP 40/60": ["HM-CELIK-DKP", "HM-CELIK-GAL", "HM-BOYA-RAL", "HM-IZOLASYON"],
    "SSE 27/40": ["HM-CELIK-DKP", "HM-CELIK-GAL", "HM-REZISTANS", "HM-BOYA-RAL"],
  };

  for (const [pSku, rmSkus] of Object.entries(productToRmMap)) {
    const pObj = allProducts.find(o => o.externalId === pSku);
    if (!pObj) continue;
    for (const rmSku of rmSkus) {
      const rmObj = allRawMaterials.find(o => o.externalId === rmSku);
      if (rmObj) {
        await ontologyService.createLink("composed_of", pObj.id, rmObj.id, { quantity: 1 });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. Create links: production_line → products
  // ═══════════════════════════════════════════════════════════════════

  for (const p of productsData) {
    const productObjects = await ontologyService.getObjectsByType("product");
    const productObj = productObjects.find(o => o.externalId === p.sku);
    if (productObj) {
      await ontologyService.createLink("produces", gazliLine.id, productObj.id, {
        annual_volume: p.total,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 7. Run Compute Engine
  // ═══════════════════════════════════════════════════════════════════

  console.log("[griseus] Running compute engine...");
  const computeResult = await computeEngine.refreshAll();
  console.log(`[griseus] Computed properties for ${computeResult.updated} products`);
  if (computeResult.errors.length > 0) {
    console.warn("[griseus] Compute errors:", computeResult.errors);
  }

  // Run ABC classification
  await computeEngine.computeAbcClassification();
  console.log("[griseus] ABC classification complete");

  console.log("[griseus] Ontology engine seeded successfully!");
}
