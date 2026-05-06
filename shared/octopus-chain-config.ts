/**
 * Octopus-Chain Config — SINGLE SOURCE OF TRUTH
 *
 * Bu dosya orchestrator (TS) ve /octopus-chain skill (markdown) arasındaki
 * numeric configuration'ı senkron tutar. Skill md referans amaçlı narrative;
 * burada tanımlanan değerler orchestrator tarafından runtime'da okunuyor.
 *
 * Skill dosyası: ~/.claude/skills/octopus-chain/SKILL.md
 * Değiştirirken: bu dosya + SKILL.md (narrative kısmı) ikisinde de güncelle.
 * Test: orchestrator audit'i manuel çağır (POST /api/orchestrator/run-audit)
 * — değişiklik amplitude/tolerance'ı etkiliyorsa yellow/red dağılımı değişir.
 */

export const OCTOPUS_CHAIN_CONFIG = {
  /** Aktif 11 SKU — yeni ürün eklenirken bu listeye de eklenmeli */
  skus: [
    "ELT.7-11", "GSS20P",
    "BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV",
    "ELT.5-7",
    "GSA15", "GSA20", "GSA30",
    "GSS40P",
  ] as const,

  /** Kategori arketipi peak ayları — aile DEFAULT'u (fallback)
   *  Tek SKU'lu veya placeholder/baseline referansında kullanılır.
   *  MONTH_LABELS ASCII: "Oca Sub Mar Nis May Haz Tem Agu Eyl Eki Kas Ara" */
  familyArchetypes: {
    BH: { peakMonth: "Eyl", description: "sanayi montaj — Eylül pik (baseline)" },
    ELT: { peakMonth: "Eki", description: "seramik ofis — Ekim pik (baseline)" },
    GSA: { peakMonth: "Kas", description: "duvar ev — Kasım pik (baseline)" },
    GSS: { peakMonth: "Agu", description: "portatif — Ağustos pik (baseline)" },
  } as Record<string, { peakMonth: string; description: string }>,

  /** SKU-level peak overrides — gerçek Çukurova 2025 satış verisinden
   *  türetilmiş. Aile default'u yerine bu kullanılır (expectedPeakMonth).
   *  Yeni satış verisi geldikçe DSE yeniden hesaplar; periyodik olarak
   *  intel.ontology.seasonalIndices peak'iyle karşılaştırılıp güncellenmeli.
   *  Son güncelleme: 2026-04-17 (5 SKU 2025 import sonrası).
   *
   *  Burada olmayan SKU (ör BH.*, ELT.7-11, GSS20P, GSA30) familyArchetypes
   *  default'una düşer.
   */
  skuPeakOverrides: {
    "ELT.5-7": { peakMonth: "Eyl", note: "2025 Eyl=45, Eki=20 — ELT ofis projesi Eylül pik (ELT.7-11 Ekim aile default'u farklı)" },
    "GSA15":   { peakMonth: "Eki", note: "2025 Eki=24 peak, sparse (yıllık 40) — güvenilirlik düşük, çok yıl data gelene dek dikkat" },
    "GSA20":   { peakMonth: "Eki", note: "2025 Eki=109, Kas=79 ikincil — GSA aile Kasım'dan Ekim'e kaymış" },
    "GSS40P":  { peakMonth: "Ara", note: "2025 Ara=85, Agu=69 — portatif büyük model kışa doğru pik (GSS20P Ağustos aile default)" },
    // BH ailesi — 2026-04-20 import 2025 Çukurova verisi (yıllık 218/89/82/2)
    // Aile default "Eyl" sanayi montaj baseline; gerçek veri SKU bazında farklı pik gösteriyor
    "BH.55ST.SV": { peakMonth: "Eki", note: "2025 Eki=87, Tem=36, Kas=23 — büyük sanayi 55kW, Ekim ihale pattern (yıllık 218 = en yüksek BH hacmi)" },
    "BH.50ST.SV": { peakMonth: "Ara", note: "2025 Ara=24, Tem=20, Kas=17 — küçük model, kışa doğru pik (yıllık 89)" },
    "BH.55UT.SV": { peakMonth: "Ara", note: "2025 Ara=31, Kas=10, Eki=9 — U-tip kış pikli (yıllık 82)" },
    "BH.50UT.SV": { peakMonth: "Eki", note: "2025 sparse yıllık=2 (Eki=2), güvenilirlik çok düşük — çok yıl veri gelene dek aile Eyl default'una yakın, Layer 10 amplitude alarmı normal" },
  } as Record<string, { peakMonth: string; note: string }>,

  /** winterStress semantic kontrolü için kış ayları (ASCII) */
  winterMonths: ["Kas", "Ara", "Oca", "Sub"] as const,

  /** Layer 10 Seasonal threshold'lar */
  seasonalThresholds: {
    /** Minimum amplitude (peak/trough oranı) — altı DSE regress sinyali */
    minAmplitude: 2.0,

    /** Aile içi amplitude dağılım toleransı (relative spread / mean)
     *  Çukurova portföyünde aynı aile içinde farklı kapasite/hacim segmentleri var
     *  (örn. GSS20P vs GSS40P, ELT.5-7 vs ELT.7-11). Bu yüzden aile spread'i
     *  doğal olarak yüksek olabilir. 2.0 üstü hâlâ gerçek SKU-specific drift sinyali. */
    familyAmplitudeSpreadRatio: 2.0,

    /** Indeks toplamı / 12 ≈ 1.0 olmalı (normalize). Tolerans ±0.1 */
    normalizedMeanTolerance: 0.1,

    /** currentSeasonalIndex == dynIndices[currentMonth] olmalı. Tolerans ±0.02
     *  (float rounding için) */
    currentMonthAlignmentTolerance: 0.02,
  },

  /** Forward-walk cap + artifact detection */
  depletionHorizon: {
    /** seasonalDays > bu değer ise "Uzak vadeli" etiketle (Aralık 2042 fix) */
    farHorizonDays: 1095, // 3 yıl

    /** depletionYear > currentYear + bu ise artifact şüphesi */
    artifactYearOffset: 5,
  },

  /** Layer 1 Mutation freshness */
  mutation: {
    /** Son kaç saat içinde lineage kaydı bekleniyor (iş saati için) */
    recencyHours: 1,
  },

  /** Layer 8 Ontology minimum counts */
  ontology: {
    minObjectTypes: 8,
    minLinkTypes: 7,
  },

  /** BH ailesi DEĞİŞKEN bileşen listesi — bazen kullanılan opsiyonel parçalar.
   *  Stok>0 olsa bile üretim kapasitesini sınırlamaz (user: "bu parçaları
   *  bazen kullanıyoruz bazen kullanmıyoruz"). UI'da turuncu "DEĞİŞKEN"
   *  etiketi ile gösterilir — kritik (kırmızı) yerine.
   *
   *  On-demand ile fark:
   *    - on-demand = stok=0, siparişle tedarik
   *    - variable  = stok>0 ama opsiyonel kullanım
   *
   *  User'ın işaretlediği yeni değişken kodlar buraya eklenir.
   */
  bhVariableComponents: [
    // Pattern eşleşmesi = aday (otomatik DEĞİL). Final karar user'da.
    // VA4H50R pattern eşleşti + user 2026-04-20 REVİZE: normal bileşen (zorunlu fan)
    //   → variable DEĞİL, bottleneck olabilir (stok=10 → BH.50UT maxProducible=10)
    // VA5H70R pattern eşleşti + user REDDETTI → variable DEĞİL (zorunlu, BH.55'te)
    // Manuel override (pattern dışı, explicit user işareti):
    "03051101", // BH Alüminize Yanma Borusu Transition Tube — BH.50UT/55UT (opsiyonel)
  ] as string[],
} as const;

/** Yardımcı: SKU → family key ("BH", "ELT", "GSA", "GSS") */
export function familyOfSku(sku: string): string | null {
  for (const key of Object.keys(OCTOPUS_CHAIN_CONFIG.familyArchetypes)) {
    if (sku.startsWith(key)) return key;
  }
  return null;
}

/** Yardımcı: SKU → beklenen peak ay etiketi
 *  Öncelik: skuPeakOverrides > familyArchetypes default */
export function expectedPeakMonth(sku: string): string | null {
  const override = OCTOPUS_CHAIN_CONFIG.skuPeakOverrides[sku];
  if (override) return override.peakMonth;
  const fam = familyOfSku(sku);
  return fam ? OCTOPUS_CHAIN_CONFIG.familyArchetypes[fam].peakMonth : null;
}

/** Yardımcı: BH ailesi için bileşen değişken mi (opsiyonel kullanım) */
export function isBHVariableComponent(sku: string, componentCode: string): boolean {
  if (!sku.startsWith("BH.")) return false;
  return (OCTOPUS_CHAIN_CONFIG.bhVariableComponents as readonly string[]).includes(componentCode);
}

/** Yardımcı: peak beklentisinin kaynağı nedir (ui/log için) */
export function peakExpectationSource(sku: string): { peakMonth: string; source: "sku_override" | "family_default"; note: string } | null {
  const override = OCTOPUS_CHAIN_CONFIG.skuPeakOverrides[sku];
  if (override) return { peakMonth: override.peakMonth, source: "sku_override", note: override.note };
  const fam = familyOfSku(sku);
  if (!fam) return null;
  const arc = OCTOPUS_CHAIN_CONFIG.familyArchetypes[fam];
  return { peakMonth: arc.peakMonth, source: "family_default", note: arc.description };
}
