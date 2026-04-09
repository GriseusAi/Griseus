import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import IsometricLayers from "../components/IsometricLayers";
import { useQueryClient } from "@tanstack/react-query";
import { useStockWebSocket } from "../lib/useStockWebSocket";

/* ── Glassmorphic Palette ── */
const C = {
  bg: "#050508",
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
  { emoji: "🔄", text: "Üretimden depoya 5 adet transfer et" },
  { emoji: "🛒", text: "Satın alma önerisi oluştur" },
];

interface Message {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const WRITE_TOOLS = new Set([
  "create_stock_movement", "update_component_stock", "create_purchase_suggestion",
]);

/** Markdown → clean HTML */
function renderMarkdown(raw: string): string {
  return raw
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff;font-weight:600">$1</strong>')
    .replace(/^#{1,4}\s+(.*)/gm, '<div style="font-size:16px;font-weight:600;color:#fff;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06)">$1</div>')
    .replace(/^(\d+)\.\s+(.*)/gm, '<div style="display:flex;gap:8px;padding:4px 0"><span style="color:rgba(129,140,248,0.8);font-weight:600;min-width:22px">$1.</span><span>$2</span></div>')
    .replace(/^[-•]\s+(.*)/gm, '<div style="display:flex;gap:8px;padding:3px 0;padding-left:4px"><span style="color:rgba(129,140,248,0.5)">&#9679;</span><span>$1</span></div>')
    .replace(/^([✅⚠️🔴📦🏭📅📊🛒🔄🧠💡📋🎯])\s+(.*)/gm, '<div style="display:flex;gap:10px;padding:5px 0;align-items:baseline"><span style="font-size:18px">$1</span><span>$2</span></div>')
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean);
      if (cells.some((c: string) => /^-+$/.test(c))) return '';
      return '<div style="display:flex;gap:12px;padding:5px 10px;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.04)">' +
        cells.map((c: string) => `<span style="flex:1">${c}</span>`).join('') + '</div>';
    })
    .replace(/\n{3,}/g, '\n\n');
}

export default function EnginePage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useStockWebSocket(() => {
    qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
    qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
    qc.invalidateQueries({ queryKey: ["/api/stock/movements"] });
    qc.invalidateQueries({ queryKey: ["/api/bom"] });
  });

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

      // Streaming SSE endpoint
      const res = await fetch("/api/v1/agent/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Agent hatası" }));
        throw new Error(data.error || "Agent hatası");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream okunamadı");

      const decoder = new TextDecoder();
      let streamedText = "";
      let usedTools: string[] = [];
      let buffer = "";
      let currentEvent = "";

      // Add placeholder assistant message
      setMessages(prev => [...prev, { role: "assistant", content: "🔍 Analiz başlıyor...", tools: [] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "status") {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") last.content = `🔍 ${data.message}`;
                  return [...updated];
                });
              } else if (currentEvent === "tool") {
                usedTools.push(data.name);
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    last.tools = [...usedTools];
                    last.content = `🔍 *${data.name}* analiz ediliyor...`;
                  }
                  return [...updated];
                });
              } else if (currentEvent === "text") {
                streamedText += data.chunk;
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") last.content = streamedText;
                  return [...updated];
                });
              } else if (currentEvent === "done") {
                usedTools = data.tools_used || usedTools;
              } else if (currentEvent === "error") {
                throw new Error(data.error);
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            }
            currentEvent = "";
          }
        }
      }

      // Final update with all tools
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          last.tools = usedTools;
          if (!last.content || last.content.includes("analiz ediliyor")) {
            last.content = streamedText || "Cevap üretilemedi.";
          }
        }
        return [...updated];
      });

      if (usedTools.some(t => WRITE_TOOLS.has(t))) {
        qc.invalidateQueries({ queryKey: ["/api/stock/levels"] });
        qc.invalidateQueries({ queryKey: ["/api/stock/summary"] });
        qc.invalidateQueries({ queryKey: ["/api/stock/movements"] });
        qc.invalidateQueries({ queryKey: ["/api/bom"] });
      }
    } catch (e: any) {
      setError(e.message);
      // Remove empty assistant message on error
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
        return prev;
      });
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
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "'Outfit', sans-serif", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div className="glass-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Top Bar */}
      <div style={{
        padding: "14px 24px", borderBottom: `1px solid ${C.glassBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(5,5,8,0.8)", backdropFilter: "blur(16px)", zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => navigate("/")} style={{
            background: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 10,
            padding: "8px 16px", color: C.textSecondary, fontSize: 13,
            cursor: "pointer", transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accentBorder; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.glassBorder; }}
          >
            ← Geri
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧠</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.white, letterSpacing: -0.3 }}>
                Griseus
              </div>
              <div style={{ fontSize: 12, color: C.textSecondary }}>
                Stok Danışmanı
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN: Layers + Chat */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 560px", overflow: "hidden" }}>

        {/* LEFT: Isometric Layers */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRight: `1px solid ${C.glassBorder}` }}>
          <IsometricLayers style={{ width: "100%", height: "100%", borderRadius: 0 }} />
        </div>

        {/* RIGHT: Chat */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "rgba(5,5,8,0.5)" }}>
          <div ref={scrollRef} style={{
            flex: 1, overflowY: "auto", padding: "24px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.08) transparent",
          }}>
            {/* Welcome */}
            {messages.length === 0 && (
              <div style={{ marginTop: 48 }}>
                <div style={{
                  fontSize: 28, fontWeight: 700, color: C.white,
                  marginBottom: 6, letterSpacing: -0.5,
                }}>
                  Merhaba 👋
                </div>
                <div style={{ fontSize: 15, color: C.textSecondary, marginBottom: 28 }}>
                  Stok, üretim ve tedarik hakkında her şeyi sorabilirsiniz.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s.text} onClick={() => sendMessage(s.text)} style={{
                      padding: "14px 16px", borderRadius: 14, textAlign: "left",
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
                      <span style={{ fontSize: 20 }}>{s.emoji}</span>
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div key={i} style={{
                marginBottom: 18,
                display: "flex", flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: m.role === "user" ? "80%" : "95%",
                  padding: m.role === "user" ? "12px 18px" : "18px 22px",
                  borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: m.role === "user" ? C.accentGlow : C.glassStrong,
                  border: `1px solid ${m.role === "user" ? C.accentBorder : C.glassBorder}`,
                  backdropFilter: "blur(12px)",
                  boxShadow: m.role === "assistant"
                    ? "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)"
                    : "none",
                }}>
                  {m.role === "assistant" ? (
                    <div
                      style={{
                        fontSize: 15, lineHeight: 1.8, color: C.textPrimary,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  ) : (
                    <div style={{ fontSize: 15, color: C.white, lineHeight: 1.6 }}>{m.content}</div>
                  )}
                </div>

                {m.tools && m.tools.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {m.tools.map((t, j) => (
                      <span key={j} style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 6,
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

            {loading && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginBottom: 18, padding: "14px 18px", borderRadius: 14,
                background: C.glass, border: `1px solid ${C.glassBorder}`,
                backdropFilter: "blur(8px)",
              }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {[0, 1, 2].map(n => (
                    <div key={n} style={{
                      width: 7, height: 7, borderRadius: "50%", background: C.accent,
                      animation: `engine-pulse 1.2s infinite ${n * 0.2}s`,
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 14, color: C.textSecondary }}>Analiz ediliyor...</span>
              </div>
            )}

            {error && (
              <div style={{
                padding: "14px 18px", borderRadius: 14, background: C.errDim,
                border: `1px solid rgba(248,113,113,0.2)`, color: C.err,
                fontSize: 14, marginBottom: 18,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div style={{
            padding: "16px 20px", borderTop: `1px solid ${C.glassBorder}`,
            background: "rgba(5,5,8,0.9)", backdropFilter: "blur(16px)",
          }}>
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-end",
              padding: "8px 8px 8px 18px", borderRadius: 16,
              background: C.glass, border: `1px solid ${C.glassBorder}`,
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Bir soru sor..."
                rows={1}
                style={{
                  flex: 1, padding: "8px 0", border: "none", background: "transparent",
                  color: C.white, fontSize: 15, outline: "none", resize: "none",
                  lineHeight: 1.5, fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  width: 40, height: 40, borderRadius: 12, border: "none",
                  background: input.trim() ? C.accent : "rgba(255,255,255,0.06)",
                  color: "#fff", fontSize: 18, cursor: input.trim() ? "pointer" : "default",
                  opacity: loading ? 0.5 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s", flexShrink: 0,
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes engine-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </div>
  );
}
