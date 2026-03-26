import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import IsometricLayers from "../components/IsometricLayers";
import { useQueryClient } from "@tanstack/react-query";

/* ── Palette ── */
const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.008)", card: "rgba(255,255,255,0.01)",
  border: "rgba(255,255,255,0.04)", borderActive: "rgba(255,255,255,0.12)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.08)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.06)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.05)",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60",
};
const mono = "'JetBrains Mono', 'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";

const SUGGESTIONS = [
  "Kaç adet ELT.7-11 üretebiliriz?",
  "100 adet sipariş gelse karşılayabilir miyiz?",
  "Hangi bileşenlerin stoku ne zaman bitecek?",
  "Stok durumu nedir?",
  "Üretimden depoya 5 adet transfer et",
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

export default function EnginePage() {
  const [, navigate] = useLocation();
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
      // Invalidate caches if write tools were used
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
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans, display: "flex", flexDirection: "column" }}>
      {/* ── Top Bar ── */}
      <div style={{
        padding: "12px 24px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => navigate("/")} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "6px 14px", color: C.mid, fontFamily: mono, fontSize: 11,
            cursor: "pointer",
          }}>
            ← Komuta Merkezi
          </button>
          <div>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 600, letterSpacing: 1 }}>
              GRISEUS CEO AGENT
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>
              Stok İstihbarat Danışmanı
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
            background: C.accentDim, color: C.accent, fontWeight: 600,
          }}>
            12 TOOL AKTİF
          </span>
        </div>
      </div>

      {/* ── MAIN: Layers + Chat ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 520px", overflow: "hidden" }}>

        {/* ── LEFT: Isometric Layers ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRight: `1px solid ${C.border}` }}>
          <IsometricLayers style={{ width: "100%", height: "100%", borderRadius: 0 }} />
        </div>

        {/* ── RIGHT: Chat ── */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Chat Area */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            {/* Welcome state */}
            {messages.length === 0 && (
              <div style={{ textAlign: "center", marginTop: 60 }}>
                <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: C.accent }}>
                  Griseus
                </div>
                <div style={{ fontSize: 13, color: C.mid, marginBottom: 32 }}>
                  Stok istihbaratı, üretim kapasitesi ve BOM analizi
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => sendMessage(s)} style={{
                      padding: "10px 14px", borderRadius: 10, textAlign: "left",
                      background: C.card, border: `1px solid ${C.border}`,
                      color: C.mid, fontSize: 12, cursor: "pointer",
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

            {/* Messages */}
            {messages.map((m, i) => (
              <div key={i} style={{
                marginBottom: 16,
                display: "flex", flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "90%", padding: "12px 16px", borderRadius: 14,
                  background: m.role === "user" ? C.accentDim : C.card,
                  border: `1px solid ${m.role === "user" ? C.borderActive : C.border}`,
                }}>
                  {m.role === "assistant" ? (
                    <div
                      style={{ fontSize: 13, lineHeight: 1.7, color: C.white, whiteSpace: "pre-wrap" }}
                      dangerouslySetInnerHTML={{
                        __html: m.content
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/## (.*)/g, '<h3 style="margin: 12px 0 6px; font-size: 14px; font-weight: 700;">$1</h3>')
                          .replace(/### (.*)/g, '<h4 style="margin: 8px 0 4px; font-size: 13px; font-weight: 600;">$1</h4>')
                          .replace(/^- (.*)/gm, '<div style="padding-left: 12px;">• $1</div>')
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 13, color: C.white }}>{m.content}</div>
                  )}
                </div>
                {m.tools && m.tools.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {m.tools.map((t, j) => (
                      <span key={j} style={{
                        fontSize: 9, fontFamily: mono, padding: "2px 8px", borderRadius: 4,
                        background: C.okDim, color: C.ok,
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: C.accent,
                  animation: "pulse 1s infinite",
                }} />
                <span style={{ fontSize: 12, fontFamily: mono, color: C.dim }}>Düşünüyor...</span>
              </div>
            )}

            {error && (
              <div style={{
                padding: "10px 16px", borderRadius: 8, background: C.errDim,
                border: `1px solid rgba(239,68,68,0.2)`, color: C.err,
                fontSize: 12, fontFamily: mono, marginBottom: 16,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div style={{
            padding: "12px 16px", borderTop: `1px solid ${C.border}`,
            background: "rgba(8,8,12,0.95)", backdropFilter: "blur(12px)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Stok hakkında bir soru sor..."
                rows={1}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10,
                  background: C.surface, border: `1px solid ${C.border}`,
                  color: C.white, fontSize: 13, fontFamily: sans,
                  outline: "none", resize: "none", lineHeight: 1.5,
                }}
                onFocus={e => { e.target.style.borderColor = C.accent; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  padding: "10px 18px", borderRadius: 10, border: "none",
                  background: input.trim() ? C.accent : C.dim,
                  color: "#fff", fontFamily: mono, fontSize: 12, fontWeight: 700,
                  cursor: input.trim() ? "pointer" : "default",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
