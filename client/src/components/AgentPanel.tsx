import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import mermaid from "mermaid";

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    darkMode: true,
    background: "transparent",
    primaryColor: "#818cf8",
    primaryTextColor: "#f0f0f5",
    primaryBorderColor: "rgba(129,140,248,0.4)",
    lineColor: "rgba(240,240,245,0.3)",
    secondaryColor: "rgba(52,211,153,0.15)",
    tertiaryColor: "rgba(251,191,36,0.15)",
  },
  fontFamily: "inherit",
  fontSize: 13,
});

/* ── Glassmorphic Palette ── */
const C = {
  bg: "rgba(8, 8, 16, 0.97)",
  glass: "rgba(255,255,255,0.04)",
  glassHover: "rgba(255,255,255,0.07)",
  glassBorder: "rgba(255,255,255,0.08)",
  glassStrong: "rgba(255,255,255,0.06)",
  accent: "#818cf8",
  accentGlow: "rgba(129, 140, 248, 0.12)",
  accentBorder: "rgba(129, 140, 248, 0.25)",
  ok: "#34d399",
  okDim: "rgba(52,211,153,0.10)",
  err: "#f87171",
  errDim: "rgba(248,113,113,0.08)",
  warn: "#fbbf24",
  warnDim: "rgba(251,191,36,0.08)",
  white: "#f0f0f5",
  textPrimary: "rgba(240,240,245,0.95)",
  textSecondary: "rgba(240,240,245,0.55)",
  textDim: "rgba(240,240,245,0.35)",
};

const SUGGESTIONS = [
  { emoji: "🏭", text: "Kaç adet ELT.7-11 üretebiliriz?" },
  { emoji: "📦", text: "100 adet sipariş gelse karşılayabilir miyiz?" },
  { emoji: "⚠️", text: "Hangi bileşenlerin stoku kritik?" },
  { emoji: "📊", text: "Genel stok durumu nedir?" },
  { emoji: "🛒", text: "Satın alma önerisi oluştur" },
];

type AgentMode = "fast" | "normal" | "research" | "visual";

interface ModeOption {
  key: AgentMode;
  icon: string;
  label: string;
  sublabel: string;
  color: string;
  glow: string;
  border: string;
}

const MODES: ModeOption[] = [
  { key: "fast", icon: "⚡", label: "Hızlı", sublabel: "~10s", color: "#fbbf24", glow: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" },
  { key: "normal", icon: "💬", label: "Normal", sublabel: "~25s", color: "#818cf8", glow: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.25)" },
  { key: "research", icon: "🧠", label: "Araştırma", sublabel: "~2dk", color: "#f472b6", glow: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.25)" },
  { key: "visual", icon: "📊", label: "Görsel", sublabel: "~25s", color: "#34d399", glow: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" },
];

interface Message {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  agents?: string[];
  mode?: AgentMode;
}

// Ontology v2 sub-agent display names (Türkçe)
const AGENT_LABELS: Record<string, string> = {
  tukenme: "🔺 Tükenme",
  yapi: "🔺 Yapı",
  risk: "🔺 Risk",
  aksiyon: "⚡ Aksiyon",
};

const WRITE_TOOLS = new Set([
  "create_stock_movement", "update_component_stock", "create_purchase_suggestion",
]);

/** Markdown → clean HTML (no # headers, semantic styling) */
function renderMarkdown(raw: string): string {
  return raw
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff;font-weight:600">$1</strong>')
    // Headers (## → styled div, no #)
    .replace(/^#{1,4}\s+(.*)/gm, '<div style="font-size:15px;font-weight:600;color:#fff;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06)">$1</div>')
    // Numbered lists
    .replace(/^(\d+)\.\s+(.*)/gm, '<div style="display:flex;gap:8px;padding:4px 0"><span style="color:rgba(129,140,248,0.8);font-weight:600;min-width:20px">$1.</span><span>$2</span></div>')
    // Bullet lists (- or •)
    .replace(/^[-•]\s+(.*)/gm, '<div style="display:flex;gap:8px;padding:3px 0;padding-left:4px"><span style="color:rgba(129,140,248,0.5)">&#9679;</span><span>$1</span></div>')
    // Emoji status lines (lines starting with common status emoji)
    .replace(/^([✅⚠️🔴📦🏭📅📊🛒🔄🧠💡📋🎯])\s+(.*)/gm, '<div style="display:flex;gap:8px;padding:4px 0;align-items:baseline"><span style="font-size:16px">$1</span><span>$2</span></div>')
    // Tables (| row |) — simplified
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean);
      const isHeader = cells.some((c: string) => /^-+$/.test(c));
      if (isHeader) return '';
      return '<div style="display:flex;gap:12px;padding:4px 8px;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04)">' +
        cells.map((c: string) => `<span style="flex:1">${c}</span>`).join('') + '</div>';
    })
    // Clean up empty lines
    .replace(/\n{3,}/g, '\n\n');
}

/** Renders a single mermaid code block into SVG */
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    mermaid.render(id, code.trim())
      .then(({ svg: rendered }) => setSvg(rendered))
      .catch(() => setError("Diyagram render edilemedi"));
  }, [code]);

  if (error) {
    return (
      <div style={{
        padding: "12px 16px", borderRadius: 10, margin: "8px 0",
        background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
        color: "#f87171", fontSize: 12,
      }}>
        {error}
        <pre style={{ marginTop: 8, fontSize: 11, opacity: 0.7, whiteSpace: "pre-wrap" }}>{code}</pre>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "12px 0", padding: "16px", borderRadius: 12,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        overflow: "auto",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Split markdown content into text and mermaid blocks for rendering */
function MessageContent({ content, style }: { content: string; style: React.CSSProperties }) {
  // Split on ```mermaid ... ``` blocks
  const parts = content.split(/(```mermaid[\s\S]*?```)/g);

  if (parts.length === 1) {
    // No mermaid blocks — render as plain markdown
    return (
      <div style={style} dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
    );
  }

  return (
    <div style={style}>
      {parts.map((part, i) => {
        const mermaidMatch = part.match(/^```mermaid\s*\n([\s\S]*?)```$/);
        if (mermaidMatch) {
          return <MermaidBlock key={i} code={mermaidMatch[1]} />;
        }
        if (!part.trim()) return null;
        return (
          <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
        );
      })}
    </div>
  );
}

export default function AgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AgentMode>("normal");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && open) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/v1/agent/multi/v2/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent hatası");
      const usedTools: string[] = data.tools_used || [];
      const usedAgents: string[] = data.agents_used || [];
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        tools: usedTools,
        agents: usedAgents,
        mode: data.mode || mode,
      }]);
      if (usedTools.some(t => WRITE_TOOLS.has(t))) {
        qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
        qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
        qc.invalidateQueries({ queryKey: ["/api/stock/movements"] });
        qc.invalidateQueries({ queryKey: ["/api/bom"] });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, loading, qc, mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 998,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 480, maxWidth: "92vw", zIndex: 999,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex", flexDirection: "column",
        background: C.bg, borderLeft: `1px solid ${C.glassBorder}`,
        boxShadow: open ? "-12px 0 48px rgba(0,0,0,0.6)" : "none",
        backdropFilter: "blur(20px)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${C.glassBorder}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(8,8,16,0.9)", backdropFilter: "blur(16px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: C.accentGlow, border: `1px solid ${C.accentBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              🧠
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.white, letterSpacing: -0.3 }}>
                Griseus
              </div>
              <div style={{ fontSize: 12, color: C.textSecondary }}>
                Stok Danışmanı
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: C.glass, border: `1px solid ${C.glassBorder}`,
              color: C.textSecondary, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.glassHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.glass; }}
          >
            ✕
          </button>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "20px",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.08) transparent",
        }}>
          {/* Empty state — suggestions */}
          {messages.length === 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{
                fontSize: 20, fontWeight: 600, color: C.white,
                marginBottom: 4, letterSpacing: -0.3,
              }}>
                Merhaba 👋
              </div>
              <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 20 }}>
                Size nasıl yardımcı olabilirim?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s.text} onClick={() => sendMessage(s.text)} style={{
                    padding: "12px 16px", borderRadius: 12, textAlign: "left",
                    background: C.glass, border: `1px solid ${C.glassBorder}`,
                    color: C.textSecondary, fontSize: 14, cursor: "pointer",
                    transition: "all 0.2s", display: "flex", alignItems: "center", gap: 10,
                    backdropFilter: "blur(8px)",
                  }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = C.accentBorder;
                      e.currentTarget.style.color = C.white;
                      e.currentTarget.style.background = C.glassHover;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = C.glassBorder;
                      e.currentTarget.style.color = C.textSecondary;
                      e.currentTarget.style.background = C.glass;
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{s.emoji}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: 16,
              display: "flex", flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: m.role === "user" ? "85%" : "95%",
                padding: m.role === "user" ? "10px 16px" : "16px 20px",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: m.role === "user" ? C.accentGlow : C.glassStrong,
                border: `1px solid ${m.role === "user" ? C.accentBorder : C.glassBorder}`,
                backdropFilter: "blur(12px)",
                boxShadow: m.role === "assistant"
                  ? "0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)"
                  : "none",
              }}>
                {m.role === "assistant" ? (
                  <MessageContent
                    content={m.content}
                    style={{
                      fontSize: 14, lineHeight: 1.75, color: C.textPrimary,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 14, color: C.white, lineHeight: 1.6 }}>{m.content}</div>
                )}
              </div>

              {/* Mode badge */}
              {m.mode && m.role === "assistant" && (() => {
                const modeInfo = MODES.find(md => md.key === m.mode);
                return modeInfo ? (
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 6,
                      background: modeInfo.glow, color: modeInfo.color, fontWeight: 600,
                      border: `1px solid ${modeInfo.border}`,
                    }}>
                      {modeInfo.icon} {modeInfo.label}
                    </span>
                  </div>
                ) : null;
              })()}

              {/* Sub-agent badges (Ontology v2) */}
              {m.agents && m.agents.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {m.agents.map((a, j) => (
                    <span key={j} style={{
                      fontSize: 11, padding: "3px 9px", borderRadius: 6,
                      background: C.accentGlow, color: C.accent, fontWeight: 600,
                      border: `1px solid ${C.accentBorder}`,
                    }}>
                      {AGENT_LABELS[a] || a}
                    </span>
                  ))}
                </div>
              )}

              {/* Tool badges */}
              {m.tools && m.tools.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {m.tools.map((t, j) => (
                    <span key={j} style={{
                      fontSize: 10, padding: "3px 8px", borderRadius: 6,
                      background: C.okDim, color: C.ok, fontWeight: 500,
                      border: `1px solid rgba(52,211,153,0.15)`,
                    }}>
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              marginBottom: 16, padding: "12px 16px", borderRadius: 12,
              background: C.glass, border: `1px solid ${C.glassBorder}`,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map(n => (
                  <div key={n} style={{
                    width: 6, height: 6, borderRadius: "50%", background: C.accent,
                    animation: `agent-pulse 1.2s infinite ${n * 0.2}s`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 13, color: C.textSecondary }}>
                {mode === "fast" ? "Yanıtlanıyor..." : mode === "research" ? "Derin analiz yapılıyor..." : mode === "visual" ? "Diyagram hazırlanıyor..." : "Analiz ediliyor..."}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "12px 16px", borderRadius: 12, background: C.errDim,
              border: `1px solid rgba(248,113,113,0.2)`, color: C.err,
              fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Mode Selector */}
        <div style={{
          padding: "8px 16px 0", borderTop: `1px solid ${C.glassBorder}`,
          background: "rgba(8,8,16,0.9)", backdropFilter: "blur(16px)",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {MODES.map(m => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  style={{
                    flex: 1, padding: "8px 4px", borderRadius: 10,
                    background: active ? m.glow : "transparent",
                    border: `1px solid ${active ? m.border : "transparent"}`,
                    color: active ? m.color : C.textDim,
                    cursor: "pointer", transition: "all 0.2s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.color = m.color;
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.color = C.textDim;
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span style={{ fontSize: 16 }}>{m.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{m.label}</span>
                  <span style={{ fontSize: 9, opacity: 0.6 }}>{m.sublabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input Bar */}
        <div style={{
          padding: "8px 16px 14px",
          background: "rgba(8,8,16,0.9)", backdropFilter: "blur(16px)",
        }}>
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-end",
            padding: "6px 6px 6px 14px", borderRadius: 14,
            background: C.glass, border: `1px solid ${C.glassBorder}`,
            transition: "border-color 0.2s",
          }}
            onFocus={() => {}}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Bir soru sor..."
              rows={1}
              style={{
                flex: 1, padding: "8px 0", border: "none", background: "transparent",
                color: C.white, fontSize: 14, outline: "none", resize: "none",
                lineHeight: 1.5, fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: input.trim() ? C.accent : "rgba(255,255,255,0.06)",
                color: "#fff", fontSize: 16, cursor: input.trim() ? "pointer" : "default",
                opacity: loading ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
                flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>

        <style>{`
          @keyframes agent-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        `}</style>
      </div>
    </>
  );
}
