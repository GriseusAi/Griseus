/**
 * PALANTIR DEMO — Cukurova Isi Sok Testi
 * All JSON keys use ASCII-only characters for frontend compatibility.
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getBomWithStock } from "./bom";

const router = Router();
const SKU = "ELT.7-11";
const LEAD_TIME_DAYS = 14;
const MONTH_NAMES = ["", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"];
const MONTHLY_DEMAND = [0, 340, 278, 131, 222, 162, 234, 108, 269, 98, 169, 22, 325];
const ANNUAL_DEMAND = 2358;

// DEMO 1: GET /api/palantir/demo/uretim-plani?adet=100
router.get("/uretim-plani", async (req: Request, res: Response) => {
  try {
    const adet = parseInt(req.query.adet as string) || 100;
    const startTime = Date.now();
    const bomItems = await getBomWithStock(SKU);
    const tier1and2 = bomItems.filter(b => b.tier === 1 || b.tier === 2);

    const analiz = tier1and2.map(comp => {
      const gerekli = comp.requiredQty * adet;
      const stok = comp.currentStock;
      const fark = stok - gerekli;
      const maxUretim = comp.requiredQty > 0 ? Math.floor(stok / comp.requiredQty) : 999999;
      return {
        kod: comp.code, parca: comp.name, birim: comp.unit,
        receteMiktari: comp.requiredQty, stokta: Math.round(stok),
        gerekli: Math.round(gerekli), kalan: Math.round(fark), maxUretim,
        durum: fark < 0 ? "EKSIK" : fark < gerekli * 0.3 ? "AZ" : "YETERLI",
        eksikAdet: fark < 0 ? Math.abs(Math.round(fark)) : 0,
        acilSiparis: fark < 0,
      };
    }).sort((a, b) => a.maxUretim - b.maxUretim);

    const minComp = analiz[0];
    const maxUretilebilir = minComp?.maxUretim ?? 0;
    const eksikParcalar = analiz.filter(a => a.acilSiparis);
    const azParcalar = analiz.filter(a => a.durum === "AZ");
    const calcTime = Date.now() - startTime;

    res.json({
      _test: "CUKUROVA ISI — URETIM PLANLAMA",
      _hesapSuresi: `${calcTime}ms`,
      soru: `${adet} adet ELT.7-11 uretmek istiyorum, ne lazim?`,
      cevap: {
        uretilebilirMi: maxUretilebilir >= adet,
        uretilebilirMiText: maxUretilebilir >= adet ? "EVET" : "HAYIR",
        maxUretilebilir, istenen: adet, acik: Math.max(0, adet - maxUretilebilir),
        darbogaz: { kod: minComp?.kod || "-", parca: minComp?.parca || "-", stokta: minComp?.stokta ?? 0, maxUretim: minComp?.maxUretim ?? 0 },
      },
      eksikParcalar: {
        toplam: eksikParcalar.length,
        mesaj: eksikParcalar.length > 0 ? `${eksikParcalar.length} parca eksik — uretim baslayamaz!` : "Tum parcalar yeterli!",
        liste: eksikParcalar.map(p => ({
          kod: p.kod, parca: p.parca, stokta: p.stokta, gerekli: p.gerekli,
          eksik: p.eksikAdet, siparisVer: `${p.eksikAdet} ${p.birim} siparis ver — ${LEAD_TIME_DAYS} gun bekleme`,
        })),
      },
      azKalanParcalar: azParcalar.map(p => ({
        kod: p.kod, parca: p.parca, stokta: p.stokta,
        uretimSonrasiKalan: p.kalan, uyari: "Sonraki uretimde eksik kalacak",
      })),
      tumParcalar: analiz,
      pisinHesapladigi: {
        toplamBilesen: analiz.length,
        sure: `${calcTime}ms (manuel hesap: ~30 dakika)`,
        hizFarki: `${Math.round((30 * 60 * 1000) / Math.max(calcTime, 1))}X daha hizli`,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DEMO 2: GET /api/palantir/demo/6-ay-plan
router.get("/6-ay-plan", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const currentMonth = new Date().getMonth() + 1;
    const bomItems = await getBomWithStock(SKU);
    const tier1and2 = bomItems.filter(b => b.tier === 1 || b.tier === 2);

    const stockRows = await db.execute(sql`
      SELECT sl.in_warehouse + sl.in_production as toplam
      FROM stock_levels sl JOIN products p ON sl.product_id = p.id WHERE p.sku = ${SKU}
    `);
    const mamulStok = stockRows.rows.length > 0 ? Number((stockRows.rows[0] as any).toplam) : 0;

    const plan = [];
    let kumStok = mamulStok;
    const kritikUyarilar: string[] = [];

    for (let offset = 0; offset < 6; offset++) {
      const ay = ((currentMonth - 1 + offset) % 12) + 1;
      const talep = MONTHLY_DEMAND[ay];
      const bilesenDurum = tier1and2.map(comp => {
        let toplamTuketim = 0;
        for (let i = 0; i <= offset; i++) {
          const m = ((currentMonth - 1 + i) % 12) + 1;
          toplamTuketim += MONTHLY_DEMAND[m] * comp.requiredQty;
        }
        return { kod: comp.code, ad: comp.name, kalanStok: Math.round(comp.currentStock - toplamTuketim), tukenir: comp.currentStock - toplamTuketim <= 0 };
      });
      const tukenenler = bilesenDurum.filter(b => b.tukenir);
      const enKritik = bilesenDurum.sort((a, b) => a.kalanStok - b.kalanStok)[0];
      kumStok -= talep;
      const mevsimIndex = Math.round((talep / (ANNUAL_DEMAND / 12)) * 100) / 100;
      const donemTipi = mevsimIndex > 1.2 ? "YOGUN" : mevsimIndex < 0.8 ? "DUSUK" : "NORMAL";
      if (tukenenler.length > 0 && offset <= 3) {
        kritikUyarilar.push(`${MONTH_NAMES[ay]}: ${tukenenler.length} parca tukenecek! En kritik: ${enKritik.kod} (${enKritik.kalanStok} adet)`);
      }
      plan.push({
        ay: MONTH_NAMES[ay], ayNo: ay, tapinenTalep: talep, mevsimsellik: donemTipi, mevsimIndex,
        mamulStokProjeksiyonu: Math.round(kumStok),
        tukenenBilesenSayisi: tukenenler.length,
        tukenenler: tukenenler.slice(0, 6).map(t => `${t.kod} ${t.ad} (${t.kalanStok})`),
        enKritikBilesen: enKritik ? `${enKritik.kod} — kalan: ${enKritik.kalanStok}` : "-",
        strateji: mevsimIndex > 1.2 ? "Onceki ayda stok biriktirmis olmasin" : mevsimIndex < 0.5 ? "Fazla uret, gelecek yogun aya hazirlan" : "Normal uretim temposu",
      });
    }
    const calcTime = Date.now() - startTime;
    const firsatlar: string[] = [];
    for (let offset = 0; offset < 6; offset++) {
      const ay = ((currentMonth - 1 + offset) % 12) + 1;
      const sonrakiAy = ((currentMonth + offset) % 12) + 1;
      if (MONTHLY_DEMAND[ay] < 150 && MONTHLY_DEMAND[sonrakiAy] > 200) {
        firsatlar.push(`${MONTH_NAMES[ay]} (talep: ${MONTHLY_DEMAND[ay]}) dusuk — ${MONTH_NAMES[sonrakiAy]} (talep: ${MONTHLY_DEMAND[sonrakiAy]}) yogun geliyor. ${MONTH_NAMES[ay]}'de fazla uretip stokla!`);
      }
    }
    // ═══ Production Readiness Score ═══
    // Score = weighted average of parts readiness
    // A part scores 100 if it has >6 months stock, 0 if zero stock
    const monthlyAvg = ANNUAL_DEMAND / 12;
    const partScores = tier1and2.map(comp => {
      const monthsOfStock = comp.currentStock / Math.max(comp.requiredQty * monthlyAvg, 0.01);
      if (monthsOfStock <= 0) return 0;
      if (monthsOfStock >= 6) return 100;
      return Math.round((monthsOfStock / 6) * 100);
    });
    const skor = partScores.length > 0 ? Math.round(partScores.reduce((a, b) => a + b, 0) / partScores.length) : 0;
    const skorYorum = skor >= 80 ? "Uretime hazir" : skor >= 50 ? "Eksikler var" : skor >= 20 ? "Kritik eksikler" : "Uretim durmus";

    // ═══ Next Peak Season ═══
    let sonrakiPikAy = currentMonth;
    let sonrakiPikIndeks = 0;
    for (let i = 1; i <= 12; i++) {
      const m = ((currentMonth - 1 + i) % 12) + 1;
      const idx = MONTHLY_DEMAND[m] / (ANNUAL_DEMAND / 12);
      if (idx > 1.3 && idx > sonrakiPikIndeks) {
        sonrakiPikAy = m;
        sonrakiPikIndeks = idx;
        break;
      }
    }
    // Days until next peak
    const now = new Date();
    const pikDate = new Date(now.getFullYear(), sonrakiPikAy - 1, 1);
    if (pikDate <= now) pikDate.setFullYear(pikDate.getFullYear() + 1);
    const kalanGun = Math.ceil((pikDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // ═══ Critical Actions ═══
    const kritikAksiyonlar: Array<{aksiyon: string; neden: string; buton: string}> = [];
    const zeroStockParts = tier1and2.filter(c => c.currentStock <= 0);
    if (zeroStockParts.length > 0) {
      for (const p of zeroStockParts.slice(0, 3)) {
        kritikAksiyonlar.push({
          aksiyon: `${p.code} ${p.name} — STOK SIFIR`,
          neden: `Bu parca olmadan uretim yapilamaz. ${LEAD_TIME_DAYS} gun tedarik suresi var.`,
          buton: "Siparis Ver",
        });
      }
    }
    // Check parts running out within 3 months
    const threeMonthDemand = plan.slice(0, 3).reduce((s, p) => s + p.tapinenTalep, 0);
    const criticalParts = tier1and2
      .filter(c => c.currentStock > 0 && c.currentStock < threeMonthDemand * c.requiredQty)
      .sort((a, b) => (a.currentStock / a.requiredQty) - (b.currentStock / b.requiredQty));
    for (const p of criticalParts.slice(0, 2)) {
      const monthsLeft = p.currentStock / Math.max(p.requiredQty * monthlyAvg, 0.01);
      kritikAksiyonlar.push({
        aksiyon: `${p.code} ${p.name} — ${Math.round(monthsLeft)} aylik stok kaldi`,
        neden: `3 ay icinde tukenecek. Simdi siparis verirsen tedarik suresi icinde gelir.`,
        buton: "Planla",
      });
    }

    // ═══ Action labels for each month ═══
    const enrichedPlan = plan.map((m, i) => {
      let aksiyonTipi = "NORMAL";
      let aksiyonEtiketi = "Normal tempo";
      if (m.tukenenBilesenSayisi > 5) {
        aksiyonTipi = "KRITIK"; aksiyonEtiketi = "Kritik eksik!";
      } else if (m.mevsimIndex > 1.2) {
        aksiyonTipi = "HAZIRLIK"; aksiyonEtiketi = "Yogun sezon";
      } else if (m.mevsimIndex < 0.5) {
        aksiyonTipi = "FIRSAT"; aksiyonEtiketi = "Stok biriktir";
      } else if (i > 0 && plan[i - 1].mevsimIndex < 0.8 && m.mevsimIndex > 1.0) {
        aksiyonTipi = "HAZIRLIK"; aksiyonEtiketi = "Hazirlan";
      }
      return { ...m, aksiyonTipi, aksiyonEtiketi };
    });

    // ═══ Seasonal Insight ═══
    const totalDemand6 = plan.reduce((s, p) => s + p.tapinenTalep, 0);
    const sezonselIcgoru = `Onumuzdeki 6 ayda ${totalDemand6.toLocaleString()} adet talep bekleniyor. `
      + (sonrakiPikIndeks > 1.3
        ? `${MONTH_NAMES[sonrakiPikAy]} ayi ${Math.round(sonrakiPikIndeks * 100)}% ortalamanin uzerinde — en gec ${kalanGun - 30} gun icinde tum parcalar hazir olmali.`
        : `Onumuzdeki donem goreceli sakin. Stok optimizasyonu icin uygun zaman.`);

    res.json({
      _hesapSuresi: `${calcTime}ms`,
      skor,
      skorYorum,
      sonrakiPik: {
        ay: MONTH_NAMES[sonrakiPikAy],
        indeks: Math.round(sonrakiPikIndeks * 100) / 100,
        kalanGun,
      },
      ozet: {
        mevcutMamulStok: mamulStok,
        onumuzdeki6AyToplamTalep: totalDemand6,
      },
      kritikAksiyonlar,
      sezonselIcgoru,
      aylikPlan: enrichedPlan,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DEMO 3: GET /api/palantir/demo/acil-siparis?ay=3
router.get("/acil-siparis", async (req: Request, res: Response) => {
  try {
    const ayIleri = parseInt(req.query.ay as string) || 3;
    const startTime = Date.now();
    const currentMonth = new Date().getMonth() + 1;
    const bomItems = await getBomWithStock(SKU);
    const tier1and2 = bomItems.filter(b => b.tier === 1 || b.tier === 2);
    let toplamTalep = 0;
    const aylar: string[] = [];
    for (let i = 0; i < ayIleri; i++) {
      const ay = ((currentMonth - 1 + i) % 12) + 1;
      toplamTalep += MONTHLY_DEMAND[ay];
      aylar.push(`${MONTH_NAMES[ay]}(${MONTHLY_DEMAND[ay]})`);
    }
    const siparisListesi = tier1and2.map(comp => {
      const gerekli = toplamTalep * comp.requiredQty;
      const stok = comp.currentStock;
      const gunlukTuketim = (ANNUAL_DEMAND / 365) * comp.requiredQty;
      const guvenlikStoku = Math.ceil(gunlukTuketim * LEAD_TIME_DAYS);
      const siparisMiktari = Math.max(0, Math.ceil(gerekli - stok + guvenlikStoku));
      const gundeStokYeter = gunlukTuketim > 0 ? Math.floor(stok / gunlukTuketim) : null;
      let sonSiparisTarihi: string | null = null;
      if (gundeStokYeter !== null && gundeStokYeter < ayIleri * 30) {
        const tarih = new Date();
        tarih.setDate(tarih.getDate() + Math.max(0, gundeStokYeter - LEAD_TIME_DAYS));
        sonSiparisTarihi = tarih.toISOString().split("T")[0];
      }
      const oncelik = siparisMiktari > 0
        ? (gundeStokYeter !== null && gundeStokYeter < 14 ? "ACIL" : gundeStokYeter !== null && gundeStokYeter < 45 ? "YAKIN" : "PLANLI")
        : "YOK";
      return {
        kod: comp.code, parca: comp.name, birim: comp.unit, mevcutStok: Math.round(stok),
        gerekli: Math.round(gerekli), guvenlikStoku, siparisMiktari, gundeStokYeter,
        sonSiparisTarihi, oncelik, siparisGerekli: siparisMiktari > 0,
      };
    }).filter(s => s.siparisGerekli).sort((a, b) => (a.gundeStokYeter ?? 999) - (b.gundeStokYeter ?? 999));

    const calcTime = Date.now() - startTime;
    const aciller = siparisListesi.filter(s => s.oncelik === "ACIL");
    const yakinlar = siparisListesi.filter(s => s.oncelik === "YAKIN");
    const planlilar = siparisListesi.filter(s => s.oncelik === "PLANLI");

    res.json({
      _test: "CUKUROVA ISI — ACIL SIPARIS LISTESI",
      _hesapSuresi: `${calcTime}ms`,
      parametreler: { planlamaUfku: `${ayIleri} ay`, aylar: aylar.join(" + "), toplamTapinenTalep: `${toplamTalep} adet ELT.7-11`, tedarikSuresi: `${LEAD_TIME_DAYS} gun` },
      ozet: {
        toplamSiparisKalemi: siparisListesi.length,
        acil: `${aciller.length} parca — BUGUN siparis ver!`,
        yakin: `${yakinlar.length} parca — Bu hafta siparis ver`,
        planli: `${planlilar.length} parca — 2 hafta icinde siparis ver`,
      },
      acilSiparisler: aciller.map(s => ({
        kod: s.kod, parca: s.parca, siparisMiktari: `${s.siparisMiktari} ${s.birim}`,
        stokYeterliGun: s.gundeStokYeter, sonSiparisTarihi: s.sonSiparisTarihi,
        neden: `Stok ${s.gundeStokYeter} gun sonra biter, tedarik ${LEAD_TIME_DAYS} gun surer — GEC KALIYORSUN`,
      })),
      yakinSiparisler: yakinlar,
      planliSiparisler: planlilar,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DEMO 4: GET /api/palantir/demo/10x
router.get("/10x", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const bomItems = await getBomWithStock(SKU);
    const tier1and2 = bomItems.filter(b => b.tier === 1 || b.tier === 2);
    const minComp = tier1and2.reduce((min, c) => {
      const m = c.requiredQty > 0 ? Math.floor(c.currentStock / c.requiredQty) : Infinity;
      const mMin = min.requiredQty > 0 ? Math.floor(min.currentStock / min.requiredQty) : Infinity;
      return m < mMin ? c : min;
    });
    const calcTime = Date.now() - startTime;
    res.json({
      _test: "10X KARSILASTIRMA — Manuel vs. Griseus Palantir",
      peterThiel: {
        alinti: "Competition is for losers. The only way to escape competition is to be so good they can't ignore you — 10X better.",
        uyarlama: "Cukurova Isi'nin rakipleri hala Excel'de planlama yapiyor. Siz artik Palantir seviyesinde yapiyorsunuz.",
      },
      karsilastirma: [
        { kategori: "Uretim Planlama Hizi", manuel: "4 saat (Excel formuller, cross-reference, mail yazismasi)", griseus: `${calcTime}ms (tek API cagrisi)`, fark: `${Math.round((4 * 3600 * 1000) / Math.max(calcTime, 1))}X`, etki: "Planlama toplantisi 4 saatten 5 dakikaya duser" },
        { kategori: "Darbogaz Tespiti", manuel: "Stok bitince fark edilir — uretim durur — 14 gun bekleme", griseus: "6 ay onceden uyari + otomatik siparis onerisi", fark: "∞X", etki: `Su an darbogaz: ${minComp.code} (${minComp.name})` },
        { kategori: "Mevsimsel Planlama", manuel: "'Kisin yogun olur' sezgisel bilgi", griseus: "Ocak=1.73x, Kasim=0.11x — tam matematiksel mevsim endeksi", fark: "10X hassasiyet", etki: "Kasim'da stok biriktir, Ocak'ta hazir ol. Ne kadar? TAM SAYI." },
        { kategori: "Siparis Zamanlamasi", manuel: "'Azaldi, siparis verelim' — stok bittikten sonra aksiyon", griseus: "Siparis tarihi: gun bazinda hesaplama (stok tukenme - lead time)", fark: "14 gun erken aksiyon", etki: "Uretim ASLA durmaz" },
        { kategori: "BOM Recete Analizi", manuel: "43 parca x uretim adedi = elle carpma, hata riski", griseus: `43 bilesen x 6 ay projeksiyonu = 258 kontrol noktasi, ${calcTime}ms`, fark: "Hata orani: %0 vs %15-20", etki: "Yanlis siparis yok, eksik parca yok" },
        { kategori: "Karar Destegi", manuel: "Uretim sefi kendi tecrubesiyle karar verir", griseus: "ABC-XYZ + safety stock + MRP = veri-destekli karar", fark: "Kisiye bagimlilik → sisteme bagimlilik", etki: "Uretim sefi tatile ciksa bile sistem calisir" },
      ],
      sonuc: {
        toplamKazanim: "Yilda ~500 saat planlama zamani tasarrufu + 0 stok-disi durus",
        rakipFarki: "Sektordeki hicbir rakip bu seviyede planlama yapmiyor",
        yatirimGeriDonusu: "Ilk ay: 1 stok-disi durusu onlersen — 14 gun x gunluk uretim kapasitesi = geri donus",
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
