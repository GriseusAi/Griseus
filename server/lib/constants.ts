/**
 * GRISEUS — Merkezi Sabitler
 *
 * Tüm hardcoded değerler burada. Başka dosyada magic number olmamalı.
 * Değişiklik gerektiğinde tek yer: burası.
 */

// ══════════════════════════════════════════════════════════
// ÜRÜN
// ══════════════════════════════════════════════════════════

/** Ana ürün SKU — tüm hesaplamalar bu ürün için */
export const MAIN_SKU = process.env.MAIN_PRODUCT_SKU || "ELT.7-11";

// ══════════════════════════════════════════════════════════
// TEDARİK
// ══════════════════════════════════════════════════════════

/** Standart tedarik süresi (gün) — sipariş → teslim */
export const LEAD_TIME_DAYS = 14;

/** Güvenlik stok çarpanı (95% hizmet seviyesi, Z=1.65) */
export const SERVICE_LEVEL_Z = 1.65;

// ══════════════════════════════════════════════════════════
// ACİLİYET EŞİKLERİ (gün bazlı)
// ══════════════════════════════════════════════════════════

/** Mevsimsel stok ömrü < bu değer → KRİTİK */
export const URGENCY_CRITICAL_DAYS = 180;

/** Mevsimsel stok ömrü < bu değer → DİKKAT */
export const URGENCY_WARNING_DAYS = 365;

/** Mevsimsel stok ömrü < bu değer → YETERLİ, üstü → BOL */
export const URGENCY_OK_DAYS = 730;

/** Lineer stok ömrü < bu değer → KRİTİK */
export const LINEAR_CRITICAL_DAYS = 7;

/** Lineer stok ömrü < bu değer → DİKKAT */
export const LINEAR_WARNING_DAYS = 21;

/** Lineer stok ömrü < bu değer → YETERLİ */
export const LINEAR_OK_DAYS = 60;

// ══════════════════════════════════════════════════════════
// KURAL EŞİKLERİ
// ══════════════════════════════════════════════════════════

/** Üretim kapasitesi bu değerin altına düşünce kritik uyarı */
export const CAPACITY_CRITICAL_THRESHOLD = 10;

/** Mevsimsel spike oranı — gelecek ay / şu an > bu değer → uyar */
export const SEASONAL_SPIKE_RATIO = 1.3;

/** BOM cascade failure — aynı anda bu kadar bileşen kritikse uyar */
export const CASCADE_FAILURE_THRESHOLD = 3;

/** Talep anomali oranı — trend ratio > bu değer → anormal tüketim */
export const DEMAND_ANOMALY_RATIO = 1.5;

/** Feedback loop — precision bu değerin altına düşen kurallar suppress edilir */
export const FEEDBACK_SUPPRESS_THRESHOLD = 0.4;

/** Feedback loop — suppress kararı için minimum validated sayısı */
export const FEEDBACK_MIN_VALIDATED = 5;

// ══════════════════════════════════════════════════════════
// MEVSİMSEL
// ══════════════════════════════════════════════════════════

/** Kış ayları (0-indexed): Kasım, Aralık, Ocak, Şubat */
export const WINTER_MONTHS = [10, 11, 0, 1] as const;

/** Mevsimsel bileşen risk eşiği — seasonalDays < bu değer ve spike varsa uyar */
export const SEASONAL_RISK_DAYS = 60;

// ══════════════════════════════════════════════════════════
// BUFFER / LIMIT
// ══════════════════════════════════════════════════════════

/** Impact engine ring buffer boyutu */
export const IMPACT_BUFFER_SIZE = 30;

/** Kapasite trend takibi — son N ölçüm */
export const CAPACITY_HISTORY_SIZE = 10;

/** Feedback loop analiz aralığı (ms) */
export const FEEDBACK_ANALYSIS_INTERVAL = 5 * 60 * 1000; // 5 dakika

/** Global alert havuzu max boyutu (frontend) */
export const MAX_ALERTS_IN_MEMORY = 100;

// ══════════════════════════════════════════════════════════
// MALİYET PARAMETRELERİ (Palantir Engine)
// ══════════════════════════════════════════════════════════

/** Aylık çalışma günü */
export const WORKING_DAYS_PER_MONTH = 22;

/** Yıllık stok tutma maliyeti oranı (%20) */
export const HOLDING_COST_RATE = 0.20;

/** Sipariş başına sabit maliyet (TL) */
export const ORDER_COST_PER_ORDER = 500;

/** Stok tükenme maliyet çarpanı (tutma maliyetinin 3x'i) */
export const STOCKOUT_COST_MULTIPLIER = 3;

// ══════════════════════════════════════════════════════════
// OUTCOME LEARNING ENGINE (OLE)
// ══════════════════════════════════════════════════════════

/** Outcome kontrol aralıkları (gün) — tahmin sonrası kaçıncı günlerde kontrol */
export const OUTCOME_CHECK_INTERVALS = [7, 14, 30] as const;

/** Outcome auto-check analiz aralığı (ms) — 15 dakikada bir */
export const OUTCOME_CHECK_FREQUENCY = 15 * 60 * 1000;

/** Başlangıç Bayesian prior güven skoru */
export const OUTCOME_PRIOR_CONFIDENCE = 0.5;

/** Bayesian güncelleme learning rate — α (0=yavaş, 1=agresif) */
export const OUTCOME_LEARNING_RATE = 0.2;

/** Bir kuralın güvenilir sayılması için minimum outcome sayısı */
export const OUTCOME_MIN_SAMPLES = 5;

/** Expired sayılma süresi — deadline + bu kadar gün sonra hâlâ pending ise expired */
export const OUTCOME_EXPIRY_GRACE_DAYS = 7;

// ══════════════════════════════════════════════════════════
// TOKEN VALUE TRACKER (TVT)
// ══════════════════════════════════════════════════════════

/** Stoksuzluk maliyeti — gün başına tahmini TL */
export const STOCKOUT_DAILY_COST_TL = 2500;

/** Üretim durması maliyeti — saat başına TL */
export const PRODUCTION_DOWNTIME_HOURLY_TL = 5000;

/** Karar süresi tasarrufu — saat başına yönetici maliyet TL */
export const DECISION_TIME_HOURLY_TL = 500;

/** Fazla stok holding maliyeti — aylık birim başına TL */
export const OVERSTOCK_MONTHLY_UNIT_TL = 15;

/** Generic model baseline — ontolojik sorulara cevap veremez (V/T = 0) */
export const GENERIC_MODEL_BASELINE_VT = 0;

/** TVT metrik toplama aralığı (ms) — 10 dakikada bir aggregate */
export const TVT_AGGREGATION_INTERVAL = 10 * 60 * 1000;
