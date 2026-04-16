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

  /** Kategori arketipi peak ayları (KİLİTLİ — Cukurova sahası referans)
   *  MONTH_LABELS ASCII: "Oca Sub Mar Nis May Haz Tem Agu Eyl Eki Kas Ara" */
  familyArchetypes: {
    BH: { peakMonth: "Eyl", description: "sanayi montaj — Eylül pik" },
    ELT: { peakMonth: "Eki", description: "seramik ofis — Ekim pik" },
    GSA: { peakMonth: "Kas", description: "duvar ev — Kasım pik" },
    GSS: { peakMonth: "Agu", description: "portatif — Ağustos pik" },
  } as Record<string, { peakMonth: string; description: string }>,

  /** winterStress semantic kontrolü için kış ayları (ASCII) */
  winterMonths: ["Kas", "Ara", "Oca", "Sub"] as const,

  /** Layer 10 Seasonal threshold'lar */
  seasonalThresholds: {
    /** Minimum amplitude (peak/trough oranı) — altı DSE regress sinyali */
    minAmplitude: 2.0,

    /** Aile içi amplitude dağılım toleransı (relative spread / mean)
     *  Cukurova verisi: ELT.7-11 büyük proje vs ELT.5-7 ofis farkı doğal %40-50
     *  Üstü → gerçek DSE SKU-specific drift sinyali */
    familyAmplitudeSpreadRatio: 0.5,

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
} as const;

/** Yardımcı: SKU → family key ("BH", "ELT", "GSA", "GSS") */
export function familyOfSku(sku: string): string | null {
  for (const key of Object.keys(OCTOPUS_CHAIN_CONFIG.familyArchetypes)) {
    if (sku.startsWith(key)) return key;
  }
  return null;
}

/** Yardımcı: SKU → beklenen peak ay etiketi */
export function expectedPeakMonth(sku: string): string | null {
  const fam = familyOfSku(sku);
  return fam ? OCTOPUS_CHAIN_CONFIG.familyArchetypes[fam].peakMonth : null;
}
