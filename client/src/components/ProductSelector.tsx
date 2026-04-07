import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const C = {
  bg: "rgba(5,5,5,0.4)",
  surface: "rgba(255,255,255,0.03)",
  surfaceHover: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8",
  accentDim: "rgba(99,102,241,0.10)",
  white: "#f0f0f5",
  mid: "#7a7a90",
  dim: "#4a4a60",
};

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  component_count: string;
}

interface Props {
  value: string;
  onChange: (sku: string) => void;
}

export default function ProductSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: products } = useQuery<ProductOption[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then(r => r.json()),
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = products?.find(p => p.sku === value);

  if (!products || products.length <= 1) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 400,
          background: open ? C.accentDim : C.surface,
          border: `1px solid ${open ? C.borderActive : C.border}`,
          color: C.white, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
          display: "flex", alignItems: "center", gap: 8,
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12 }}>&#x25CB;</span>
        <span style={{ color: C.accent, fontWeight: 500 }}>{value}</span>
        <span style={{ color: C.dim, fontSize: 10 }}>&#9662;</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          minWidth: 280, background: "rgba(12,12,16,0.96)",
          backdropFilter: "blur(20px)", border: `1px solid ${C.border}`,
          borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          zIndex: 999, overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
            fontSize: 9, fontFamily: "'Outfit', sans-serif", color: C.dim,
            letterSpacing: 1, fontWeight: 400,
          }}>
            URUN SEC
          </div>
          {products.map(p => (
            <button
              key={p.sku}
              onClick={() => { onChange(p.sku); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "10px 14px",
                background: p.sku === value ? C.accentDim : "transparent",
                border: "none", borderBottom: `1px solid ${C.border}`,
                cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (p.sku !== value) (e.target as HTMLElement).style.background = C.surfaceHover; }}
              onMouseLeave={e => { if (p.sku !== value) (e.target as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: p.sku === value ? C.accent : C.dim,
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: p.sku === value ? C.accent : C.white, fontFamily: "'Outfit', sans-serif" }}>
                  {p.sku}
                </div>
                <div style={{ fontSize: 10, color: C.mid, fontFamily: "'Outfit', sans-serif" }}>
                  {p.name} — {p.component_count} bilesen
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
