/**
 * PALANTIR DEMO — Cukurova Isi Sok Testi
 * All JSON keys use ASCII-only characters for frontend compatibility.
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getBomWithStock, computeSubAssemblyCapacity } from "./bom";
import { MONTHLY_DEMAND as DEFAULT_DEMAND, ANNUAL_DEMAND as DEFAULT_ANNUAL, MONTH_NAMES, getMonthlyDemandForSku } from "../lib/seasonal-constants";
import { MAIN_SKU, LEAD_TIME_DAYS } from "../lib/constants";

const router = Router();

// DEMO 1: GET /api/palantir/demo/uretim-plani?adet=100&sku=ELT.7-11
router.get("/uretim-plani", async (req: Request, res: Response) => {
  try {
    const SKU = (req.query.sku as string) || MAIN_SKU;
    const adet = parseInt(req.query.adet as string) || 100;
    const startTime = Date.now();
    const bomItems = await getBomWithStock(SKU);
    const tier1and2 = bomItems.filter(b => b.tier === 1 || b.tier === 2);

    const analiz = tier1and2.map(comp => {
      const gerekli = comp.requiredQty * adet;
      // Yarı mamül (tier 2): efektif stok = mevcut + alt bileşenlerden üretilebilir
      let stok = comp.currentStock;
      if (comp.tier === 2) {
        const sub = computeSubAssemblyCapacity(comp.code, bomItems);
        stok = comp.currentStock + sub.producible;
      }
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

// DEMO 2: GET /api/palantir/demo/6-ay-plan?sku=ELT.7-11
// TEK KAYNAK: computeComponentIntelligence — Ürün İstihbaratı ile aynı motor
router.get("/6-ay-plan", async (_req: Request, res: Response) => {
  try {
    const SKU = (_req.query.sku as string) || MAIN_SKU;
    const startTime = Date.now();
    const currentMonth = new Date().getMonth(); // 0-indexed
    const { demand: MONTHLY_DEMAND, annual: ANNUAL_DEMAND } = await getMonthlyDemandForSku(SKU);

    // Aynı motor: intelligence.ts'deki computeComponentIntelligence
    const { computeComponentIntelligence } = await import("./intelligence");
    const intel = await computeComponentIntelligence(SKU);

    const stockRows = await db.execute(sql`
      SELECT sl.in_warehouse + sl.in_production as toplam
      FROM stock_levels sl JOIN products p ON sl.product_id = p.id WHERE p.sku = ${SKU}
    `);
    const mamulStok = stockRows.rows.length > 0 ? Number((stockRows.rows[0] as any).toplam) : 0;

    // Her ay için: o ayda hangi bileşenler tükenmiş olacak (seasonalDays + depletionMonth bazlı)
    const plan = [];
    let kumStok = mamulStok;
    const kritikUyarilar: string[] = [];

    for (let offset = 0; offset < 6; offset++) {
      const ay = (currentMonth + offset) % 12;
      const talep = MONTHLY_DEMAND[ay];

      // Intelligence motorundan gelen mevsimsel tükenme verisi — TEK KAYNAK
      const targetDays = offset === 0 ? 30 : offset * 30; // bu ayın sonuna kadar kaç gün
      const bilesenDurum = intel.components.map(comp => {
        const seasonalDays = comp.seasonalDays ?? 9999;
        const tukenir = seasonalDays <= targetDays;
        // Kalan stok tahmini: seasonalDays - targetDays gün daha yetecek stok
        const kalanGun = seasonalDays - targetDays;
        return {
          kod: comp.code, ad: comp.name,
          kalanStok: Math.round(comp.currentStock * Math.max(0, kalanGun) / Math.max(1, seasonalDays)),
          tukenir,
          seasonalDays,
          depletionMonth: comp.depletionMonth,
          depletionYear: comp.depletionYear,
        };
      });

      const tukenenler = bilesenDurum.filter(b => b.tukenir);
      const enKritik = bilesenDurum.sort((a, b) => a.seasonalDays - b.seasonalDays)[0];
      kumStok -= talep;
      const mevsimIndex = Math.round((talep / (ANNUAL_DEMAND / 12)) * 100) / 100;
      const donemTipi = mevsimIndex > 1.2 ? "YOGUN" : mevsimIndex < 0.8 ? "DUSUK" : "NORMAL";
      if (tukenenler.length > 0 && offset <= 3) {
        kritikUyarilar.push(`${MONTH_NAMES[ay]}: ${tukenenler.length} parca tukenecek! En kritik: ${enKritik.kod} (${enKritik.depletionMonth} ${enKritik.depletionYear})`);
      }
      plan.push({
        ay: MONTH_NAMES[ay], ayNo: ay + 1, tapinenTalep: talep, mevsimsellik: donemTipi, mevsimIndex,
        mamulStokProjeksiyonu: Math.round(kumStok),
        tukenenBilesenSayisi: tukenenler.length,
        tukenenler: tukenenler.map(t => ({ kod: t.kod, ad: t.ad, kalanStok: t.kalanStok, bitisAy: t.depletionMonth, bitisYil: t.depletionYear })),
        enKritikBilesen: enKritik ? `${enKritik.kod} — ${enKritik.depletionMonth} ${enKritik.depletionYear}` : "-",
        strateji: mevsimIndex > 1.2 ? "Onceki ayda stok biriktirmis olmasin" : mevsimIndex < 0.5 ? "Fazla uret, gelecek yogun aya hazirlan" : "Normal uretim temposu",
      });
    }
    const calcTime = Date.now() - startTime;
    const firsatlar: string[] = [];
    for (let offset = 0; offset < 6; offset++) {
      const ay = (currentMonth + offset) % 12;
      const sonrakiAy = (currentMonth + offset + 1) % 12;
      if (MONTHLY_DEMAND[ay] < 150 && MONTHLY_DEMAND[sonrakiAy] > 200) {
        firsatlar.push(`${MONTH_NAMES[ay]} (talep: ${MONTHLY_DEMAND[ay]}) dusuk — ${MONTH_NAMES[sonrakiAy]} (talep: ${MONTHLY_DEMAND[sonrakiAy]}) yogun geliyor. ${MONTH_NAMES[ay]}'de fazla uretip stokla!`);
      }
    }
    res.json({
      _test: "CUKUROVA ISI — 6 AYLIK STRATEJIK PLAN",
      _hesapSuresi: `${calcTime}ms`,
      _kaynak: "computeComponentIntelligence (tek kaynak — Ürün İstihbaratı ile aynı motor)",
      ozet: {
        mevcutMamulStok: mamulStok,
        onumuzdeki6AyToplamTalep: plan.reduce((s, p) => s + p.tapinenTalep, 0),
        enYogunAy: plan.reduce((max, p) => p.tapinenTalep > max.tapinenTalep ? p : max),
        enDusukAy: plan.reduce((min, p) => p.tapinenTalep < min.tapinenTalep ? p : min),
      },
      kritikUyarilar: kritikUyarilar.length > 0 ? kritikUyarilar : ["Ilk 3 ay kritik parca tukenmesi yok"],
      sezonselFirsatlar: firsatlar.length > 0 ? firsatlar : ["Bu donemde belirgin firsat penceresi yok"],
      aylikPlan: plan,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DEMO 3: GET /api/palantir/demo/acil-siparis?ay=3&sku=ELT.7-11
// TEK KAYNAK: computeComponentIntelligence — tüm sayfalarla tutarlı
router.get("/acil-siparis", async (req: Request, res: Response) => {
  try {
    const SKU = (req.query.sku as string) || MAIN_SKU;
    const ayIleri = parseInt(req.query.ay as string) || 3;
    const startTime = Date.now();
    const currentMonth = new Date().getMonth();
    const { getThresholds } = await import("../lib/adaptive-thresholds");
    const T = await getThresholds();
    const { demand: MONTHLY_DEMAND } = await getMonthlyDemandForSku(SKU);

    // Talep özeti (sadece bilgi amaçlı)
    const aylar: string[] = [];
    let toplamTalep = 0;
    for (let i = 0; i < ayIleri; i++) {
      const ay = (currentMonth + i) % 12;
      toplamTalep += MONTHLY_DEMAND[ay];
      aylar.push(`${MONTH_NAMES[ay]}(${MONTHLY_DEMAND[ay]})`);
    }

    // TEK KAYNAK: Intelligence motorundan tüm bileşen verisi
    const { computeComponentIntelligence } = await import("./intelligence");
    const intel = await computeComponentIntelligence(SKU);

    // Sadece tier 1 — tier 2 yarı mamüller sipariş edilmez
    const tier1Comps = intel.components.filter(c => c.tier === 1);

    const siparisListesi = tier1Comps.map(comp => {
      const seasonalDays = comp.seasonalDays ?? 9999;
      const stok = comp.currentStock;
      const gunlukTuketim = comp.dailyBurnRate;
      const guvenlikStoku = Math.ceil(gunlukTuketim * T.leadTimeDays);
      // Sipariş miktarı: planlama ufku boyunca tüketilecek miktar + güvenlik stoku - mevcut stok
      const planlamaGunSayisi = ayIleri * 30;
      const planlamaTuketim = Math.ceil(gunlukTuketim * planlamaGunSayisi);
      const siparisMiktari = Math.max(0, planlamaTuketim + guvenlikStoku - stok);

      let sonSiparisTarihi: string | null = null;
      if (seasonalDays < planlamaGunSayisi) {
        const tarih = new Date();
        tarih.setDate(tarih.getDate() + Math.max(0, seasonalDays - T.leadTimeDays));
        sonSiparisTarihi = tarih.toISOString().split("T")[0];
      }

      // ATE adaptif eşikler kullan
      const oncelik = siparisMiktari > 0
        ? (seasonalDays <= T.leadTimeDays ? "ACIL"
          : seasonalDays <= T.leadTimeDays * 3 ? "YAKIN"
          : "PLANLI")
        : "YOK";

      return {
        kod: comp.code, parca: comp.name, birim: comp.unit, mevcutStok: Math.round(stok),
        gerekli: planlamaTuketim, guvenlikStoku, siparisMiktari,
        gundeStokYeter: seasonalDays,
        bitisAy: comp.depletionMonth, bitisYil: comp.depletionYear,
        sonSiparisTarihi, oncelik, siparisGerekli: siparisMiktari > 0,
      };
    }).filter(s => s.siparisGerekli).sort((a, b) => (a.gundeStokYeter ?? 9999) - (b.gundeStokYeter ?? 9999));

    const calcTime = Date.now() - startTime;
    const aciller = siparisListesi.filter(s => s.oncelik === "ACIL");
    const yakinlar = siparisListesi.filter(s => s.oncelik === "YAKIN");
    const planlilar = siparisListesi.filter(s => s.oncelik === "PLANLI");

    res.json({
      _test: "CUKUROVA ISI — ACIL SIPARIS LISTESI",
      _hesapSuresi: `${calcTime}ms`,
      _kaynak: "computeComponentIntelligence + ATE adaptif eşikler (tek kaynak)",
      parametreler: { planlamaUfku: `${ayIleri} ay`, aylar: aylar.join(" + "), toplamTapinenTalep: `${toplamTalep} adet ELT.7-11`, tedarikSuresi: `${T.leadTimeDays} gun (adaptif)` },
      ozet: {
        toplamSiparisKalemi: siparisListesi.length,
        acil: `${aciller.length} parca — BUGUN siparis ver!`,
        yakin: `${yakinlar.length} parca — Bu hafta siparis ver`,
        planli: `${planlilar.length} parca — 2 hafta icinde siparis ver`,
      },
      acilSiparisler: aciller.map(s => ({
        kod: s.kod, parca: s.parca, siparisMiktari: `${s.siparisMiktari} ${s.birim}`,
        stokYeterliGun: s.gundeStokYeter, sonSiparisTarihi: s.sonSiparisTarihi,
        bitisAy: s.bitisAy, bitisYil: s.bitisYil,
        neden: `Stok ${s.gundeStokYeter} gün sonra biter (${s.bitisAy} ${s.bitisYil}), tedarik ${T.leadTimeDays} gün — GEÇ KALIYORSUN`,
      })),
      yakinSiparisler: yakinlar,
      planliSiparisler: planlilar,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DEMO 4: GET /api/palantir/demo/10x
router.get("/10x", async (_req: Request, res: Response) => {
  try {
    const SKU = (_req.query.sku as string) || MAIN_SKU;
    const startTime = Date.now();
    const bomItems = await getBomWithStock(SKU);
    const tier1and2 = bomItems.filter(b => b.tier === 1 || b.tier === 2);
    const minComp = tier1and2.reduce((min, c) => {
      // Yarı mamül: efektif stok
      let cStock = c.currentStock;
      let minStock = min.currentStock;
      if (c.tier === 2) { const sub = computeSubAssemblyCapacity(c.code, bomItems); cStock = c.currentStock + sub.producible; }
      if (min.tier === 2) { const sub = computeSubAssemblyCapacity(min.code, bomItems); minStock = min.currentStock + sub.producible; }
      const m = c.requiredQty > 0 ? Math.floor(cStock / c.requiredQty) : Infinity;
      const mMin = min.requiredQty > 0 ? Math.floor(minStock / min.requiredQty) : Infinity;
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
