/**
 * Normalizes messy Çukurova product codes (stok kodu) into canonical forms.
 *
 * Known patterns:
 * - "ELT. 7-11", "ELT.7-11", "ELT7-11" → "ELT.7-11"
 * - "CC. 7-11", "CC.7-11" → "CC.7-11"
 * - "BH 20 ", "BH 20" → "BH 20"
 * - "SSP 40/60" → "SSP 40/60"
 */

// Known alias mappings: normalized form → all known variants
const ALIASES: Record<string, string[]> = {
  "ELT.7-11":  ["ELT. 7-11", "ELT.7-11", "ELT7-11", "ELT .7-11"],
  "ELT.5-7":   ["ELT. 5-7", "ELT.5-7", "ELT5-7", "ELT .5-7"],
  "CC.7-11":   ["CC. 7-11", "CC.7-11", "CC7-11", "CC .7-11"],
  "CC.5-7":    ["CC. 5-7", "CC.5-7", "CC5-7", "CC .5-7"],
  "MELT.7-11": ["MELT. 7-11", "MELT.7-11", "MELT7-11"],
  "BH 55":     ["BH55", "BH  55"],
  "BH 20":     ["BH20", "BH  20"],
  "BH 15":     ["BH15", "BH  15"],
  "CPH.33":    ["CPH. 33", "CPH.33", "CPH33", "CPH 33"],
  "CPH.22":    ["CPH. 22", "CPH.22", "CPH22", "CPH 22"],
  "CPH.44":    ["CPH. 44", "CPH.44", "CPH44", "CPH 44"],
  "SSP 40/60": ["SSP40/60", "SSP  40/60"],
  "SSP 47/70": ["SSP47/70", "SSP  47/70"],
  "SSE 27/40": ["SSE27/40", "SSE  27/40"],
  "SSE 20/30": ["SSE20/30", "SSE  20/30"],
};

// Build reverse lookup
const REVERSE_ALIAS = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) {
    REVERSE_ALIAS.set(alias.toUpperCase().replace(/\s+/g, ""), canonical);
  }
  REVERSE_ALIAS.set(canonical.toUpperCase().replace(/\s+/g, ""), canonical);
}

export function normalizeProductCode(code: string): string {
  // Basic cleanup
  let normalized = code.toUpperCase().trim();

  // Check reverse alias lookup (stripping spaces for matching)
  const stripped = normalized.replace(/\s+/g, "");
  const alias = REVERSE_ALIAS.get(stripped);
  if (alias) return alias;

  // General normalization rules
  normalized = normalized
    .replace(/\s+/g, " ")       // collapse multiple spaces
    .replace(/\.{2,}/g, ".")    // collapse dots: "CC..7-11" → "CC.7-11"
    .replace(/\.\s+/g, ".")     // remove space after dot: "ELT. 7-11" → "ELT.7-11"
    .replace(/\s+\./g, ".")     // remove space before dot
    .trim();

  return normalized;
}

/**
 * Detect whether a production record is STOK (speculative) or SİPARİŞ (customer order)
 * by examining the AÇIKLAMALAR (description) field.
 */
export function detectOrderType(description: string | null | undefined): "stock" | "order" {
  if (!description) return "stock";
  const upper = description.toUpperCase();
  // If it contains "STOK" or "stok imalat" → speculative stock production
  if (upper.includes("STOK")) return "stock";
  // If it contains a customer name, order number, or "SİPARİŞ" → customer order
  if (upper.includes("SİPARİŞ") || upper.includes("SIPARIŞ") || upper.includes("SIPARIS")) return "order";
  // Default: if description exists and doesn't say STOK, it's likely a customer order
  return description.trim().length > 0 ? "order" : "stock";
}
