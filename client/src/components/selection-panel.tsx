import { useState } from "react";
import { useLocation } from "wouter";
import { useSelection, type SelectedItem } from "@/lib/selection-context";
import { useAgentPanel } from "../App";
import ChartPromptModal from "./chart-prompt-modal";

const C = {
  bg: "rgba(10,10,15,0.96)",
  border: "rgba(255,255,255,0.08)",
  accent: "#818cf8",
  accentDim: "rgba(129,140,248,0.12)",
  white: "#f0f0f5",
  mid: "#8888a0",
  dim: "#4a4a60",
  ok: "#34d399",
  err: "#ef4444",
};
const mono = "'Outfit', sans-serif";

export function buildAgentContext(items: SelectedItem[]): string {
  const lines = items.map((i, idx) => {
    const parts = [
      `[${idx + 1}] ${i.code}`,
      i.label && i.label !== i.code ? `"${i.label}"` : null,
      `tip=${i.kind}`,
      i.currentStock !== undefined ? `stok=${i.currentStock}` : null,
      i.dailyBurnRate !== undefined ? `burn=${i.dailyBurnRate}/gün` : null,
      i.daysLeft !== null && i.daysLeft !== undefined ? `kalan=${i.daysLeft}g` : null,
      `geçtiği_cihaz=${i.usedBy.length}`,
      i.isShared ? "paylaşımlı" : null,
      i.isBottleneck ? "darboğaz" : null,
      i.status ? `durum=${i.status}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  });
  return (
    `Seçilen ${items.length} bileşen (çoklu seçim context'i):\n` +
    lines.join("\n") +
    `\n\nBu bileşenleri değerlendir. Soru:\n`
  );
}

export default function SelectionPanel() {
  const { selected, remove, clear, max } = useSelection();
  const { toggleAgent, setPrefillInput } = useAgentPanel();
  const [compareOpen, setCompareOpen] = useState(false);
  const [location] = useLocation();

  // Strategy canvas (/ontology): panel gizli — fonksiyonalite /gix ve /diyagram
  // komutları ile komut bar'dan tetiklenir.
  if (location === "/ontology" || location.startsWith("/ontology/")) return null;

  if (selected.length === 0 && !compareOpen) return null;

  const askAgent = () => {
    const context = buildAgentContext(selected);
    setPrefillInput(context);
    toggleAgent();
  };

  return (
    <>
      {selected.length > 0 && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 60,
            width: 360,
            background: C.bg,
            backdropFilter: "blur(18px)",
            border: `1px solid ${C.accent}40`,
            borderRadius: 14,
            padding: "14px 16px",
            fontFamily: mono,
            boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: C.accent,
                letterSpacing: 1.6,
                fontWeight: 500,
              }}
            >
              SEÇİM · {selected.length}/{max}
            </div>
            <button
              onClick={clear}
              title="Seçimi temizle"
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.mid,
                cursor: "pointer",
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 5,
                letterSpacing: 0.5,
              }}
            >
              TEMİZLE
            </button>
          </div>

          {/* Rozetler */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginBottom: 12,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {selected.map((it, idx) => (
              <div
                key={it.code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${C.border}`,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: C.accentDim,
                    border: `1px solid ${C.accent}`,
                    color: C.accent,
                    fontSize: 10,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.white,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.code}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: C.mid,
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.label !== it.code ? it.label : it.kind}
                    {it.currentStock !== undefined && ` · stok ${it.currentStock}`}
                  </div>
                </div>
                <button
                  onClick={() => remove(it.code)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.dim,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 2,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Aksiyonlar */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={askAgent}
              disabled={selected.length === 0}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                background: C.accentDim,
                border: `1px solid ${C.accent}50`,
                color: C.accent,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: mono,
                cursor: selected.length ? "pointer" : "default",
                letterSpacing: 0.3,
              }}
            >
              ◆ AI'ya Sor
            </button>
            <button
              onClick={() => setCompareOpen(true)}
              disabled={selected.length < 2}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                background: selected.length < 2 ? "transparent" : "rgba(52,211,153,0.1)",
                border: `1px solid ${selected.length < 2 ? C.border : "rgba(52,211,153,0.35)"}`,
                color: selected.length < 2 ? C.dim : C.ok,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: mono,
                cursor: selected.length < 2 ? "default" : "pointer",
                letterSpacing: 0.3,
              }}
            >
              ▸ Diyagram
            </button>
          </div>

          {/* İpucu */}
          <div
            style={{
              fontSize: 9,
              color: C.dim,
              marginTop: 10,
              lineHeight: 1.5,
              letterSpacing: 0.3,
            }}
          >
            Cmd/Shift + tıklama ile seçim ekle/çıkar. Max {max} bileşen.
          </div>
        </div>
      )}

      {compareOpen && (
        <ChartPromptModal items={selected} onClose={() => setCompareOpen(false)} />
      )}
    </>
  );
}
