import type { SelectedItem } from "@/lib/selection-context";

const C = {
  bg: "rgba(10,10,15,0.97)",
  border: "rgba(255,255,255,0.08)",
  borderHover: "rgba(129,140,248,0.35)",
  surface: "rgba(255,255,255,0.02)",
  white: "#f0f0f5",
  mid: "#8888a0",
  dim: "#4a4a60",
  accent: "#818cf8",
  accentDim: "rgba(129,140,248,0.08)",
  ok: "#34d399",
  warn: "#fbbf24",
  err: "#ef4444",
};
const mono = "'Outfit', sans-serif";

const STATUS_LABEL: Record<string, string> = {
  critical: "KRİTİK",
  warning: "DÜŞÜK",
  ok: "YETERLİ",
  abundant: "BOL",
  variable: "DEĞİŞKEN",
};
const STATUS_COLOR: Record<string, string> = {
  critical: C.err,
  warning: C.warn,
  ok: C.ok,
  abundant: C.accent,
  variable: "#f59e0b",
};

const KIND_LABEL: Record<string, string> = {
  device: "Cihaz",
  component: "Bileşen",
  subassembly: "Yarı mamül",
  subcomponent: "Alt parça",
  variable: "Değişken",
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("tr-TR");
}

type Row = {
  key: string;
  label: string;
  render: (item: SelectedItem) => React.ReactNode;
};

const ROWS: Row[] = [
  { key: "kind", label: "Tip", render: (i) => KIND_LABEL[i.kind] ?? i.kind },
  { key: "label", label: "İsim", render: (i) => i.label },
  {
    key: "status",
    label: "Durum",
    render: (i) =>
      i.status ? (
        <span style={{ color: STATUS_COLOR[i.status] ?? C.white, fontWeight: 500 }}>
          {STATUS_LABEL[i.status] ?? i.status.toUpperCase()}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "currentStock",
    label: "Mevcut stok",
    render: (i) => <span style={{ fontFamily: mono, fontWeight: 500 }}>{fmt(i.currentStock)}</span>,
  },
  {
    key: "dailyBurnRate",
    label: "Günlük tüketim",
    render: (i) => <span style={{ fontFamily: mono }}>{fmt(i.dailyBurnRate)}</span>,
  },
  {
    key: "daysLeft",
    label: "Kalan gün",
    render: (i) => {
      if (i.daysLeft === null || i.daysLeft === undefined) return "—";
      const color = i.daysLeft < 15 ? C.err : i.daysLeft < 60 ? C.warn : C.white;
      return (
        <span style={{ color, fontFamily: mono, fontWeight: 500 }}>
          {fmt(i.daysLeft)} <span style={{ color: C.dim, fontSize: 10 }}>gün</span>
        </span>
      );
    },
  },
  {
    key: "usedBy",
    label: "Geçtiği cihaz",
    render: (i) => (
      <div>
        <span style={{ fontFamily: mono, color: C.white, fontWeight: 500 }}>{i.usedBy.length}</span>
        {i.usedBy.length > 0 && (
          <div style={{ color: C.mid, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
            {i.usedBy.slice(0, 3).join(", ")}
            {i.usedBy.length > 3 && ` +${i.usedBy.length - 3}`}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "isShared",
    label: "Paylaşımlı",
    render: (i) =>
      i.isShared ? (
        <span style={{ color: C.accent, fontSize: 11, fontWeight: 500 }}>⇄ Evet</span>
      ) : (
        <span style={{ color: C.dim }}>—</span>
      ),
  },
  {
    key: "isBottleneck",
    label: "Darboğaz",
    render: (i) =>
      i.isBottleneck ? (
        <span style={{ color: C.err, fontSize: 11, fontWeight: 500 }}>▲ Evet</span>
      ) : (
        <span style={{ color: C.dim }}>—</span>
      ),
  },
];

export default function CompareModal({
  items,
  onClose,
}: {
  items: SelectedItem[];
  onClose: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(6px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          maxWidth: "min(1400px, 96vw)",
          width: "100%",
          maxHeight: "88vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, fontWeight: 500 }}>
              KARŞILAŞTIRMA
            </div>
            <div style={{ fontSize: 18, color: C.white, marginTop: 4 }}>
              {items.length} bileşen · {ROWS.length} boyut
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.mid,
              cursor: "pointer",
              fontSize: 16,
              width: 34,
              height: 34,
              borderRadius: 8,
            }}
          >
            ✕
          </button>
        </div>

        {/* Matrix */}
        <div style={{ overflow: "auto", flex: 1 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 13,
              color: C.white,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    top: 0,
                    background: C.bg,
                    zIndex: 2,
                    padding: "14px 16px",
                    textAlign: "left",
                    fontSize: 10,
                    color: C.dim,
                    letterSpacing: 1.4,
                    borderBottom: `1px solid ${C.border}`,
                    borderRight: `1px solid ${C.border}`,
                    minWidth: 130,
                  }}
                >
                  BOYUT
                </th>
                {items.map((it, idx) => (
                  <th
                    key={it.code}
                    style={{
                      position: "sticky",
                      top: 0,
                      background: C.bg,
                      zIndex: 1,
                      padding: "14px 16px",
                      textAlign: "left",
                      borderBottom: `1px solid ${C.border}`,
                      borderLeft: idx === 0 ? "none" : `1px solid ${C.border}`,
                      minWidth: 160,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: C.accentDim,
                          border: `1px solid ${C.accent}`,
                          color: C.accent,
                          fontSize: 11,
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 12, color: C.white, fontWeight: 500 }}>
                        {it.code}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, ri) => (
                <tr key={row.key}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      background: ri % 2 === 0 ? "rgba(255,255,255,0.015)" : C.bg,
                      padding: "12px 16px",
                      fontSize: 11,
                      color: C.mid,
                      letterSpacing: 0.6,
                      borderBottom: `1px solid ${C.border}`,
                      borderRight: `1px solid ${C.border}`,
                    }}
                  >
                    {row.label}
                  </td>
                  {items.map((it, ci) => (
                    <td
                      key={it.code + row.key}
                      style={{
                        padding: "12px 16px",
                        background: ri % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                        borderBottom: `1px solid ${C.border}`,
                        borderLeft: ci === 0 ? "none" : `1px solid ${C.border}`,
                        fontSize: 13,
                      }}
                    >
                      {row.render(it)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: `1px solid ${C.border}`,
            fontSize: 10,
            color: C.dim,
            letterSpacing: 0.5,
          }}
        >
          Canlı veri · bileşen detayı için canvas'ta tıkla
        </div>
      </div>
    </div>
  );
}
