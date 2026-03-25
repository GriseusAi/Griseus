import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

/* ── Palette ── */
const C = {
  bg: "#08080c", surface: "rgba(255,255,255,0.02)", card: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.06)", borderActive: "rgba(99,102,241,0.4)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.15)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.12)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.08)",
  white: "#f0f0f5", mid: "#8888a0", dim: "#4a4a60",
};
const mono = "'JetBrains Mono', 'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";

const SUGGESTIONS = [
  "Kaç adet ELT.7-11 üretebiliriz?",
  "100 adet sipariş gelse karşılayabilir miyiz?",
  "En kritik eksik parça ne?",
  "Stok durumu nedir?",
  "Brülör üretmek için ne lazım?",
  "Darboğaz analizi yap",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

export default function EnginePage() {
  const [, navigate] = useLocation();
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
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        tools: data.tools_used,
      }]);
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
            7 TOOL AKTIF
          </span>
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "24px",
        maxWidth: 800, width: "100%", margin: "0 auto",
      }}>
        {/* Welcome state */}
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 80 }}>
            <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, color: C.accent }}>
              Griseus
            </div>
            <div style={{ fontSize: 14, color: C.mid, marginBottom: 40 }}>
              Stok istihbaratı, üretim kapasitesi ve BOM analizi
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 500, margin: "0 auto" }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => sendMessage(s)} style={{
                  padding: "12px 16px", borderRadius: 10, textAlign: "left",
                  background: C.card, border: `1px solid ${C.border}`,
                  color: C.mid, fontSize: 13, cursor: "pointer",
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
            marginBottom: 20,
            display: "flex", flexDirection: "column",
            alignItems: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "85%", padding: "14px 18px", borderRadius: 14,
              background: m.role === "user" ? C.accentDim : C.card,
              border: `1px solid ${m.role === "user" ? C.borderActive : C.border}`,
            }}>
              {m.role === "assistant" ? (
                <div
                  style={{ fontSize: 14, lineHeight: 1.7, color: C.white, whiteSpace: "pre-wrap" }}
                  dangerouslySetInnerHTML={{
                    __html: m.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/## (.*)/g, '<h3 style="margin: 12px 0 6px; font-size: 15px; font-weight: 700;">$1</h3>')
                      .replace(/### (.*)/g, '<h4 style="margin: 8px 0 4px; font-size: 14px; font-weight: 600;">$1</h4>')
                      .replace(/^- (.*)/gm, '<div style="padding-left: 12px;">• $1</div>')
                  }}
                />
              ) : (
                <div style={{ fontSize: 14, color: C.white }}>{m.content}</div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
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

      {/* ── Input Bar ── */}
      <div style={{
        padding: "16px 24px", borderTop: `1px solid ${C.border}`,
        background: "rgba(8,8,12,0.95)", backdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: 800, margin: "0 auto",
          display: "flex", gap: 8, alignItems: "flex-end",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stok hakkında bir soru sor..."
            rows={1}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 12,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.white, fontSize: 14, fontFamily: sans,
              outline: "none", resize: "none", lineHeight: 1.5,
            }}
            onFocus={e => { e.target.style.borderColor = C.accent; }}
            onBlur={e => { e.target.style.borderColor = C.border; }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              padding: "12px 20px", borderRadius: 12, border: "none",
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

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
