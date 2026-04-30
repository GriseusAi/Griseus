/* Claude.ai-style theme — warm cream bg, near-black ink, muted brand accent.
   Tüm sayfalar bu palette'i kullanmalı. Lokal `C` tanımları yerine import et. */

export const CT = {
  // Surfaces
  bg: "#faf9f5",          // page bg — warm cream
  bgAlt: "#f5f3ec",       // sidebar / subtle section
  surface: "#ffffff",     // cards
  surfaceHover: "#f7f5ee",
  surfaceMuted: "#f0eee6",

  // Borders
  border: "rgba(20,20,19,0.08)",
  borderStrong: "rgba(20,20,19,0.16)",
  borderActive: "rgba(20,20,19,0.28)",

  // Ink
  ink: "#141413",         // primary text
  inkSub: "#605e57",      // secondary text
  inkMuted: "#8c8a82",    // tertiary
  inkFaint: "#b6b3aa",

  // Brand
  accent: "#c96442",      // Anthropic orange
  accentSoft: "rgba(201,100,66,0.12)",
  accentEdge: "rgba(201,100,66,0.32)",

  // Status
  ok: "#3f8f5b",
  okSoft: "rgba(63,143,91,0.12)",
  warn: "#b8761c",
  warnSoft: "rgba(184,118,28,0.12)",
  err: "#b34037",
  errSoft: "rgba(179,64,55,0.12)",
  info: "#3d6fb0",
  infoSoft: "rgba(61,111,176,0.12)",

  // Canvas helpers
  canvasGrid: "rgba(20,20,19,0.05)",
  canvasEdge: "rgba(20,20,19,0.30)",
  canvasHalo: "rgba(250,249,245,0.92)",
} as const;

export const CT_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const CT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
