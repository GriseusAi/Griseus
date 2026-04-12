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

/** Sanitize mermaid code — fix common AI-generated syntax issues */
function sanitizeMermaid(raw: string): string {
  let code = raw.trim();
  // Remove surrounding quotes that AI sometimes adds
  code = code.replace(/^["']|["']$/g, "");
  // Fix common Türkçe character issues in node IDs (not labels)
  // Replace lines like: şık --> B  with  sik --> B
  // But preserve labels inside [] or ()
  // Remove any "```" that leaked into the code
  code = code.replace(/```/g, "");
  // Remove title lines with quotes that break xychart (fallback from bad prompts)
  code = code.replace(/^\s*title\s+"[^"]*"\s*$/gm, (match) => {
    // Strip quotes from title
    return match.replace(/"/g, "");
  });
  return code;
}

/** Renders a single mermaid code block into SVG — clickable for fullscreen */
function MermaidBlock({ code, onExpand }: { code: string; onExpand: (svg: string) => void }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const sanitized = sanitizeMermaid(code);
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    mermaid.render(id, sanitized)
      .then(({ svg: rendered }) => setSvg(rendered))
      .catch(() => {
        const fallbackId = `mermaid-fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const lines = sanitized.split("\n");
        const firstLine = lines[0]?.trim().toLowerCase() || "";
        const isKnownType = /^(flowchart|graph|pie|gantt|sequenceDiagram|classDiagram)/.test(firstLine);

        if (!isKnownType && lines.length > 1) {
          const fallbackCode = "flowchart TD\n" + lines.slice(1).join("\n");
          mermaid.render(fallbackId, fallbackCode)
            .then(({ svg: rendered }) => setSvg(rendered))
            .catch(() => setError("render-failed"));
        } else {
          setError("render-failed");
        }
      });
  }, [code]);

  if (error) {
    return (
      <div style={{
        padding: "12px 16px", borderRadius: 10, margin: "8px 0",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        color: C.textSecondary, fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ color: C.textDim, fontSize: 11 }}>Diyagram render edilemedi — ham veri:</span>
        </div>
        <pre style={{
          fontSize: 11, lineHeight: 1.6, opacity: 0.8, whiteSpace: "pre-wrap",
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)",
          overflowX: "auto",
        }}>{code.trim()}</pre>
      </div>
    );
  }

  return (
    <div
      onClick={() => svg && onExpand(svg)}
      style={{
        margin: "12px 0", padding: "16px", borderRadius: 12,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        overflow: "auto", cursor: svg ? "pointer" : "default",
        transition: "border-color 0.2s",
        position: "relative",
      }}
      onMouseEnter={e => { if (svg) e.currentTarget.style.borderColor = "rgba(129,140,248,0.3)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {svg && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          fontSize: 10, color: C.textDim, padding: "2px 6px",
          background: "rgba(0,0,0,0.4)", borderRadius: 4,
          opacity: 0.6,
        }}>
          Buyutmek icin tikla
        </div>
      )}
    </div>
  );
}

/** Fullscreen diagram modal */
function DiagramModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 40, cursor: "pointer",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "90vw", maxHeight: "90vh", overflow: "auto",
          background: "rgba(15,15,30,0.95)", borderRadius: 16,
          border: `1px solid ${C.glassBorder}`, padding: 32,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          cursor: "default",
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: svg }} style={{ minWidth: 400 }} />
      </div>
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 20, right: 20,
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff", fontSize: 20, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** Split markdown content into text and mermaid blocks for rendering */
function MessageContent({ content, style, onExpandDiagram }: {
  content: string;
  style: React.CSSProperties;
  onExpandDiagram: (svg: string) => void;
}) {
  const parts = content.split(/(```mermaid[\s\S]*?```)/g);

  if (parts.length === 1) {
    return (
      <div style={style} dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
    );
  }

  return (
    <div style={style}>
      {parts.map((part, i) => {
        const mermaidMatch = part.match(/^```mermaid\s*\n([\s\S]*?)```$/);
        if (mermaidMatch) {
          return <MermaidBlock key={i} code={mermaidMatch[1]} onExpand={onExpandDiagram} />;
        }
        if (!part.trim()) return null;
        return (
          <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
        );
      })}
    </div>
  );
}

interface ChatSession {
  id: string;
  title: string;
  mode: string | null;
  createdAt: string;
  updatedAt: string;
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

  // Diagram modal
  const [expandedSvg, setExpandedSvg] = useState<string | null>(null);

  // Chat history
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch sessions when history panel opens
  useEffect(() => {
    if (showHistory) {
      fetch("/api/v1/chat/sessions").then(r => r.json()).then(setSessions).catch(() => {});
    }
  }, [showHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && open) { if (expandedSvg) setExpandedSvg(null); else if (showHistory) setShowHistory(false); else onClose(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, expandedSvg, showHistory]);

  // Save message to DB
  const persistMessage = useCallback(async (sessionId: string, msg: Message) => {
    try {
      await fetch(`/api/v1/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: msg.role,
          content: msg.content,
          mode: msg.mode,
          toolsUsed: msg.tools,
          agentsUsed: msg.agents,
        }),
      });
    } catch {}
  }, []);

  // Start new chat
  const startNewChat = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    setShowHistory(false);
    setError("");
  }, []);

  // Load a past session
  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/v1/chat/sessions/${sessionId}/messages`);
      const msgs = await res.json();
      setMessages(msgs.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        tools: m.toolsUsed || [],
        agents: m.agentsUsed || [],
        mode: m.mode || undefined,
      })));
      setActiveSessionId(sessionId);
      setShowHistory(false);
    } catch {
      setError("Gecmis yuklenemedi");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Rename session
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      await fetch(`/api/v1/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle.trim() } : s));
    } catch {}
    setEditingSessionId(null);
  }, []);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/v1/chat/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setMessages([]);
        setActiveSessionId(null);
      }
    } catch {}
  }, [activeSessionId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError("");

    // Create session if needed
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const sRes = await fetch("/api/v1/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const session = await sRes.json();
        sessionId = session.id;
        setActiveSessionId(sessionId);
      } catch {}
    }

    // Persist user message
    if (sessionId) persistMessage(sessionId, userMsg);

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
      const assistantMsg: Message = {
        role: "assistant",
        content: data.response,
        tools: usedTools,
        agents: usedAgents,
        mode: data.mode || mode,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Persist assistant message
      if (sessionId) persistMessage(sessionId, assistantMsg);

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
  }, [messages, loading, qc, mode, activeSessionId, persistMessage]);

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
          <div style={{ display: "flex", gap: 6 }}>
            {/* New chat */}
            <button
              onClick={startNewChat}
              title="Yeni sohbet"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: C.glass, border: `1px solid ${C.glassBorder}`,
                color: C.textSecondary, fontSize: 15, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.glassHover; e.currentTarget.style.color = C.white; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.glass; e.currentTarget.style.color = C.textSecondary; }}
            >
              +
            </button>
            {/* History */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              title="Gecmis"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: showHistory ? C.accentGlow : C.glass,
                border: `1px solid ${showHistory ? C.accentBorder : C.glassBorder}`,
                color: showHistory ? C.accent : C.textSecondary, fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (!showHistory) { e.currentTarget.style.background = C.glassHover; e.currentTarget.style.color = C.white; } }}
              onMouseLeave={e => { if (!showHistory) { e.currentTarget.style.background = C.glass; e.currentTarget.style.color = C.textSecondary; } }}
            >
              ☰
            </button>
            {/* Close */}
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
        </div>

        {/* History Panel OR Chat Area — only one visible at a time */}
        {showHistory ? (
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 20px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.08) transparent",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 12 }}>
              Gecmis Sohbetler
            </div>
            {sessions.length === 0 && (
              <div style={{ fontSize: 13, color: C.textDim, padding: "20px 0", textAlign: "center" }}>
                Henuz kayitli sohbet yok
              </div>
            )}
            {loadingHistory && (
              <div style={{ textAlign: "center", padding: 20, color: C.textDim, fontSize: 13 }}>
                Yukleniyor...
              </div>
            )}
            {sessions.map(s => (
              <div
                key={s.id}
                style={{
                  padding: "12px 14px", marginBottom: 6,
                  borderRadius: 10,
                  background: activeSessionId === s.id ? C.accentGlow : C.glass,
                  border: `1px solid ${activeSessionId === s.id ? C.accentBorder : C.glassBorder}`,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (activeSessionId !== s.id) e.currentTarget.style.background = C.glassHover; }}
                onMouseLeave={e => { if (activeSessionId !== s.id) e.currentTarget.style.background = C.glass; }}
              >
                {editingSessionId === s.id ? (
                  /* Rename input */
                  <form onSubmit={e => { e.preventDefault(); renameSession(s.id, editTitle); }}
                    style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => renameSession(s.id, editTitle)}
                      onKeyDown={e => { if (e.key === "Escape") setEditingSessionId(null); }}
                      style={{
                        flex: 1, padding: "4px 8px", borderRadius: 6,
                        background: "rgba(0,0,0,0.3)", border: `1px solid ${C.accentBorder}`,
                        color: C.white, fontSize: 13, outline: "none", fontFamily: "inherit",
                      }}
                    />
                  </form>
                ) : (
                  /* Normal display */
                  <>
                    <div
                      onClick={() => loadSession(s.id)}
                      style={{ cursor: "pointer", marginBottom: 4 }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.white }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, display: "flex", gap: 8, marginTop: 4 }}>
                        <span>{new Date(s.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        {s.mode && <span style={{ opacity: 0.7 }}>{MODES.find(m => m.key === s.mode)?.icon} {s.mode}</span>}
                      </div>
                    </div>
                    {/* Edit / Delete buttons */}
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <button
                        onClick={() => { setEditingSessionId(s.id); setEditTitle(s.title); }}
                        style={{
                          padding: "3px 8px", borderRadius: 5, fontSize: 10,
                          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.glassBorder}`,
                          color: C.textDim, cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.white; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.textDim; }}
                      >
                        Yeniden adlandir
                      </button>
                      <button
                        onClick={() => deleteSession(s.id)}
                        style={{
                          padding: "3px 8px", borderRadius: 5, fontSize: 10,
                          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.glassBorder}`,
                          color: C.textDim, cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.err; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.textDim; }}
                      >
                        Sil
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
        /* Chat Area */
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
                    onExpandDiagram={setExpandedSvg}
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
        )}

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

      {/* Fullscreen diagram modal */}
      {expandedSvg && <DiagramModal svg={expandedSvg} onClose={() => setExpandedSvg(null)} />}
    </>
  );
}
