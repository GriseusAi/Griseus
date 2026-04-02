import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/* ── Palette ── */
const C = {
  bg: "#0a0a0f", surface: "rgba(255,255,255,0.03)", card: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.08)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.06)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.05)",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60",
};
const mono = "'Outfit', sans-serif";
const sans = "'Outfit', sans-serif";

const SUGGESTIONS = [
  "Kaç adet ELT.7-11 üretebiliriz?",
  "100 adet sipariş gelse karşılayabilir miyiz?",
  "Hangi bileşenlerin stoku ne zaman bitecek?",
  "Stok durumu nedir?",
  "Kritik bileşenler için satın alma önerisi oluştur",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const WRITE_TOOLS = new Set([
  "create_stock_movement", "update_component_stock", "create_purchase_suggestion",
]);

export default function AgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Close on Escape
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
      const res = await fetch("/api/v1/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent hatası");
      const usedTools: string[] = data.tools_used || [];
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        tools: usedTools,
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
  }, [messages, loading, qc]);

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
          background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 440, maxWidth: "90vw", zIndex: 999,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex", flexDirection: "column",
        background: C.bg, borderLeft: `1px solid ${C.border}`,
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.5)" : "none",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(8,8,12,0.95)", backdropFilter: "blur(12px)",
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
              CEO AGENT
            </div>
            <div style={{ fontSize: 13, fontWeight: 400, color: C.white }}>
              Stok İstihbarat Danışmanı
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 8, fontFamily: mono, padding: "2px 8px", borderRadius: 10,
              background: C.accentDim, color: C.accent, fontWeight: 400,
            }}>
              12 TOOL
            </span>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: C.surface, border: `1px solid ${C.border}`,
                color: C.mid, fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {messages.length === 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, letterSpacing: 1, marginBottom: 12 }}>
                HIZLI SORULAR
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)} style={{
                    padding: "8px 12px", borderRadius: 8, textAlign: "left",
                    background: C.card, border: `1px solid ${C.border}`,
                    color: C.mid, fontSize: 11, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.white; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: 12,
              display: "flex", flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "92%", padding: "10px 14px", borderRadius: 12,
                background: m.role === "user" ? C.accentDim : C.card,
                border: `1px solid ${m.role === "user" ? C.borderActive : C.border}`,
              }}>
                {m.role === "assistant" ? (
                  <div
                    style={{ fontSize: 12, lineHeight: 1.7, color: C.white, whiteSpace: "pre-wrap" }}
                    dangerouslySetInnerHTML={{
                      __html: m.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/## (.*)/g, '<h3 style="margin: 8px 0 4px; font-size: 13px; font-weight: 700;">$1</h3>')
                        .replace(/### (.*)/g, '<h4 style="margin: 6px 0 3px; font-size: 12px; font-weight: 600;">$1</h4>')
                        .replace(/^- (.*)/gm, '<div style="padding-left: 10px;">• $1</div>')
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: C.white }}>{m.content}</div>
                )}
              </div>
              {m.tools && m.tools.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                  {m.tools.map((t, j) => (
                    <span key={j} style={{
                      fontSize: 8, fontFamily: mono, padding: "2px 6px", borderRadius: 3,
                      background: C.okDim, color: C.ok,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", background: C.accent,
                animation: "agent-pulse 1s infinite",
              }} />
              <span style={{ fontSize: 11, fontFamily: mono, color: C.dim }}>Düşünüyor...</span>
            </div>
          )}

          {error && (
            <div style={{
              padding: "8px 12px", borderRadius: 6, background: C.errDim,
              border: `1px solid rgba(239,68,68,0.2)`, color: C.err,
              fontSize: 11, fontFamily: mono, marginBottom: 12,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{
          padding: "10px 12px", borderTop: `1px solid ${C.border}`,
          background: "rgba(8,8,12,0.95)", backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sor..."
              rows={1}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                background: C.surface, border: `1px solid ${C.border}`,
                color: C.white, fontSize: 12, fontFamily: sans,
                outline: "none", resize: "none", lineHeight: 1.5,
              }}
              onFocus={e => { e.target.style.borderColor = C.accent; }}
              onBlur={e => { e.target.style.borderColor = C.border; }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                padding: "9px 14px", borderRadius: 8, border: "none",
                background: input.trim() ? C.accent : C.dim,
                color: "#fff", fontFamily: mono, fontSize: 11, fontWeight: 400,
                cursor: input.trim() ? "pointer" : "default",
                opacity: loading ? 0.5 : 1,
              }}
            >
              Gönder
            </button>
          </div>
        </div>

        <style>{`@keyframes agent-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    </>
  );
}
