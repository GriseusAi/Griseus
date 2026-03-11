import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  facilities,
  productionLines,
  products,
  operations,
  schedules,
  capacityMetrics,
  geWorkers,
  workerCapabilities,
} from "../shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

async function seed() {
  console.log("Seeding Cukurova data...");

  // 1. Facility
  const [facility] = await db
    .insert(facilities)
    .values({
      tenantId: "cukurova",
      name: "Çukurova Isı Fabrikası",
      type: "factory",
      location: "Gebze, Kocaeli",
      status: "active",
    })
    .returning();
  console.log(`Facility created: id=${facility.id}`);

  // 2. Production Lines
  const [elektrikli] = await db
    .insert(productionLines)
    .values({
      facilityId: facility.id,
      name: "Elektrikli Hat",
      type: "elektrikli",
      workerCount: 7,
      capacityUnitTimeMin: "8.3",
      currentUnitTimeMin: "13",
      dailyHours: "9",
      monthlyDays: 22,
      productionMonths: 10,
      status: "active",
    })
    .returning();

  const [gazli] = await db
    .insert(productionLines)
    .values({
      facilityId: facility.id,
      name: "Gazlı Hat",
      type: "gazli",
      workerCount: 9,
      capacityUnitTimeMin: "19",
      currentUnitTimeMin: "21",
      dailyHours: "9",
      monthlyDays: 22,
      productionMonths: 10,
      status: "active",
    })
    .returning();
  console.log(`Lines created: elektrikli=${elektrikli.id}, gazli=${gazli.id}`);

  // 3. Products
  const elektrikliProducts = [
    "GSS20P", "GSS40P", "GSN20", "GSN40", "GSA20",
    "GSU15", "GSU20", "6TD120", "9TD180", "3TY60", "4TY80",
  ];
  const gazliProducts = [
    "ELT.7-11", "CC.7-11", "CC.5-7", "CPH.22", "CPH.33",
    "CPH.44", "BH55", "SSP40/60", "SSE20/30", "MELT.7-11",
  ];

  await db.insert(products).values(
    elektrikliProducts.map((sku) => ({
      tenantId: "cukurova" as const,
      sku,
      name: sku,
      category: "elektrikli",
    }))
  );
  await db.insert(products).values(
    gazliProducts.map((sku) => ({
      tenantId: "cukurova" as const,
      sku,
      name: sku,
      category: "gazli",
    }))
  );
  console.log(`Products created: ${elektrikliProducts.length + gazliProducts.length}`);

  // 4. Operations - monthly production data 2025
  const elektrikliMonthly = [
    1104, 1343, 979, 733, 1179, 817, 813, 1811, 1415, 2144, 1350, 717,
  ];
  const gazliMonthly = [
    528, 390, 617, 215, 351, 602, 319, 545, 445, 662, 296, 121,
  ];

  await db.insert(operations).values(
    elektrikliMonthly.map((qty, i) => ({
      lineId: elektrikli.id,
      workOrderNo: `ELK-2025-${String(i + 1).padStart(2, "0")}`,
      plannedDate: `2025-${String(i + 1).padStart(2, "0")}-01`,
      actualQty: qty,
      status: "completed",
    }))
  );

  await db.insert(operations).values(
    gazliMonthly.map((qty, i) => ({
      lineId: gazli.id,
      workOrderNo: `GAZ-2025-${String(i + 1).padStart(2, "0")}`,
      plannedDate: `2025-${String(i + 1).padStart(2, "0")}-01`,
      actualQty: qty,
      status: "completed",
    }))
  );
  console.log(`Operations created: ${elektrikliMonthly.length + gazliMonthly.length}`);

  // 5. Schedules - weekly plan vs actual
  const elektrikliWeekly: [string, number, number][] = [
    ["H40", 539, 539], ["H41", 550, 550], ["H42", 598, 598],
    ["H43", 635, 572], ["H44", 275, 237], ["H45", 530, 476],
    ["H46", 457, 357], ["H47", 436, 156], ["H48", 510, 220],
    ["H49", 440, 403], ["H50", 437, 67], ["H51", 140, 140],
  ];
  const gazliWeekly: [string, number, number][] = [
    ["H40", 189, 189], ["H41", 165, 134], ["H42", 168, 168],
    ["H43", 177, 132], ["H44", 178, 118], ["H45", 130, 102],
    ["H46", 146, 134], ["H47", 155, 135], ["H48", 100, 80],
    ["H49", 120, 90], ["H50", 111, 1],
  ];

  const devPct = (p: number, a: number) =>
    p === 0 ? "0" : String(Math.round(((a - p) / p) * 100));

  await db.insert(schedules).values(
    elektrikliWeekly.map(([week, planned, actual]) => ({
      lineId: elektrikli.id,
      periodType: "weekly",
      periodValue: week,
      plannedQty: planned,
      actualQty: actual,
      deviationPct: devPct(planned, actual),
    }))
  );

  await db.insert(schedules).values(
    gazliWeekly.map(([week, planned, actual]) => ({
      lineId: gazli.id,
      periodType: "weekly",
      periodValue: week,
      plannedQty: planned,
      actualQty: actual,
      deviationPct: devPct(planned, actual),
    }))
  );
  console.log(`Schedules created: ${elektrikliWeekly.length + gazliWeekly.length}`);

  // 6. Capacity Metrics
  await db.insert(capacityMetrics).values([
    {
      lineId: elektrikli.id,
      period: "yearly",
      periodValue: "2025",
      theoreticalMax: 17107,
      actualOutput: 14405,
      utilizationPct: "64",
    },
    {
      lineId: gazli.id,
      period: "yearly",
      periodValue: "2025",
      theoreticalMax: 7484,
      actualOutput: 5091,
      utilizationPct: "87",
    },
  ]);
  console.log("Capacity metrics created: 2");

  // 7. Workers (ge_workers) - Netsis listesi
  const workerData: { name: string; department: string }[] = [
    { name: "İrem Büyük", department: "Üretim" },
    { name: "Resul Altunzencir", department: "Üretim" },
    { name: "Seyhan Korkmaz", department: "Üretim" },
    { name: "Gökhan Erdem", department: "Satınalma" },
    { name: "Kemal Aktaş", department: "Satınalma" },
    { name: "Harun Akpınar", department: "Servis" },
    { name: "Sezer Sarıçayır", department: "Servis" },
    { name: "Merve Kamil Çelebi", department: "Satış" },
    { name: "Fikri Dibet", department: "Satış" },
    { name: "Yasin İlkiz", department: "Satış" },
    { name: "Hüseyin", department: "Satış" },
    { name: "Deniz Gezer", department: "Satış" },
    { name: "Süleyman Kılıç", department: "Depo" },
    { name: "Volkan Karaaslan", department: "Depo" },
    { name: "Hüseyin Pestil", department: "Muhasebe" },
    { name: "Seda Coşkun", department: "Muhasebe" },
  ];

  const insertedWorkers = await db
    .insert(geWorkers)
    .values(
      workerData.map((w) => ({
        tenantId: "cukurova" as const,
        name: w.name,
        department: w.department,
        status: "active",
      }))
    )
    .returning();
  console.log(`Workers created: ${insertedWorkers.length}`);

  // Build a name->id map
  const wMap = new Map(insertedWorkers.map((w) => [w.name, w.id]));

  // 8. Worker Capabilities - yetki matrisi
  const fullPerms = [
    "İş Emri Açma", "Serbest Üretim", "Etiket Basımı",
    "Depolar Arası Transfer", "Anlık Üretim Planlama", "Stok Kartı Kaydı",
    "Ürün Ağacı Yapımı", "Müşteri Siparişleri", "Cari Hesap",
    "Satış Raporu", "Lokal Depo Stok", "Ürün Ağacı Listesi",
  ];

  const volkanPerms = [
    "İş Emri Açma", "Serbest Üretim", "Depolar Arası Transfer",
    "Stok Kartı Kaydı", "Müşteri Siparişleri", "Lokal Depo Stok",
    "Ürün Ağacı Listesi", "İrsaliyeden Ambara Giriş", "Satınalma Siparişleri",
    "Netsis-Likrus", "Satış İrsaliye", "Depo Sayım", "e-İrsaliye",
  ];

  const capabilityMap: Record<string, string[]> = {
    "İrem Büyük": fullPerms,
    "Resul Altunzencir": fullPerms,
    "Seyhan Korkmaz": ["İş Emri Açma", "Serbest Üretim", "Etiket Basımı", "Depolar Arası Transfer", "Anlık Üretim Planlama"],
    "Gökhan Erdem": ["Satınalma Siparişleri", "Stok Kartı Kaydı", "Cari Hesap", "Depolar Arası Transfer", "e-İrsaliye"],
    "Kemal Aktaş": ["Satınalma Siparişleri", "Stok Kartı Kaydı", "Cari Hesap", "İrsaliyeden Ambara Giriş"],
    "Harun Akpınar": ["Servis Takibi", "Müşteri Siparişleri", "Cari Hesap", "Satış İrsaliye", "e-İrsaliye"],
    "Sezer Sarıçayır": ["Servis Takibi", "Müşteri Siparişleri", "Cari Hesap", "Lokal Depo Stok"],
    "Merve Kamil Çelebi": ["Müşteri Siparişleri", "Cari Hesap", "Satış Raporu", "Satış İrsaliye", "e-İrsaliye"],
    "Fikri Dibet": ["Müşteri Siparişleri", "Cari Hesap", "Satış Raporu", "Satış İrsaliye"],
    "Yasin İlkiz": ["Müşteri Siparişleri", "Cari Hesap", "Satış Raporu", "Lokal Depo Stok"],
    "Hüseyin": ["Müşteri Siparişleri", "Cari Hesap", "Satış Raporu"],
    "Deniz Gezer": ["Müşteri Siparişleri", "Cari Hesap", "Satış Raporu", "e-İrsaliye"],
    "Süleyman Kılıç": ["Depolar Arası Transfer", "Lokal Depo Stok", "Depo Sayım", "İrsaliyeden Ambara Giriş", "Stok Kartı Kaydı"],
    "Volkan Karaaslan": volkanPerms,
    "Hüseyin Pestil": ["Cari Hesap", "Muhasebe Fişleri", "Satış Raporu", "e-Fatura", "e-İrsaliye"],
    "Seda Coşkun": ["Cari Hesap", "Muhasebe Fişleri", "Satış Raporu", "e-Fatura"],
  };

  const capRows: { workerId: number; capabilityName: string; capabilityType: string; level: number }[] = [];
  for (const [name, caps] of Object.entries(capabilityMap)) {
    const wId = wMap.get(name);
    if (!wId) continue;
    for (const cap of caps) {
      capRows.push({
        workerId: wId,
        capabilityName: cap,
        capabilityType: "authorization",
        level: 1,
      });
    }
  }

  await db.insert(workerCapabilities).values(capRows);
  console.log(`Worker capabilities created: ${capRows.length}`);

  console.log("\nSeed complete!");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
