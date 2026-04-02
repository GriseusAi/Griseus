/**
 * Shared seasonal demand constants for ELT.7-11
 * Source: 3-year average 2023-2025, PDF-verified
 *
 * All arrays are 0-indexed (Jan = index 0, Dec = index 11).
 */

/** Monthly demand (0-indexed: Jan..Dec) */
export const MONTHLY_DEMAND = [340, 278, 131, 222, 162, 234, 108, 269, 98, 169, 22, 325] as const;

/** Annual total demand */
export const YEARLY_TOTAL = 2358;

/** Same as YEARLY_TOTAL, alias used by palantir-demo */
export const ANNUAL_DEMAND = YEARLY_TOTAL;

/** Monthly average demand */
export const MONTHLY_AVG = YEARLY_TOTAL / 12; // 196.5

/** Seasonal index per month (demand / average) */
export const SEASONAL_INDICES = MONTHLY_DEMAND.map(m => m / MONTHLY_AVG);

/** Days in each month (non-leap year) */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** 3-letter Turkish month labels (0-indexed) */
export const MONTH_LABELS = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"] as const;

/** Full Turkish month names (0-indexed) */
export const MONTH_NAMES = ["Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"] as const;

/**
 * Helper: convert a 0-indexed month number to the 1-indexed demand value.
 * Useful for code migrating from the old 1-indexed MONTHLY_DEMAND arrays.
 */
export function demandForMonth(zeroIndexedMonth: number): number {
  return MONTHLY_DEMAND[zeroIndexedMonth % 12];
}
