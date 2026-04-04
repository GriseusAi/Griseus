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
