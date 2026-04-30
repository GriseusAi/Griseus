import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import mermaid from "mermaid";
import { useAgentPanel } from "../App";

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
  { key: "fast", icon: "▸", label: "Hızlı", sublabel: "~10s", color: "#fbbf24", glow: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" },
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
  aksiyon: "Aksiyon",
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
  const { prefillInput, setPrefillInput } = useAgentPanel();
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

  // Floating-panel drag state (Grok-style). Position is the offset in px from
  // the bottom-right corner. {0,0} = anchored bottom-right with default margin.
  const PANEL_W = 400;
  const PANEL_H = 600;
  const DEFAULT_MARGIN = 24;
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    setDragging(true);
  }, [pos.x, pos.y]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Drag right/down increases x/y from start; we anchor bottom-right, so
      // moving the cursor right pulls the panel rightward (negative offset),
      // moving up pulls it up (positive offset).
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const nextX = d.baseX - dx;
      const nextY = d.baseY - dy;
      const maxX = window.innerWidth - PANEL_W - DEFAULT_MARGIN;
      const maxY = window.innerHeight - PANEL_H - DEFAULT_MARGIN;
      setPos({
        x: Math.max(-DEFAULT_MARGIN, Math.min(maxX, nextX)),
        y: Math.max(-DEFAULT_MARGIN, Math.min(maxY, nextY)),
      });
    };
    const onUp = () => { setDragging(false); dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

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
    if (open && prefillInput) {
      setInput(prefillInput);
      setPrefillInput("");
      setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
          el.scrollTop = el.scrollHeight;
        }
      }, 320);
    }
  }, [open, prefillInput, setPrefillInput]);

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
      {/* Floating panel — Grok-style: bottom-right, draggable, no backdrop. */}
      <div style={{
        position: "fixed",
        right: DEFAULT_MARGIN + pos.x,
        bottom: DEFAULT_MARGIN + pos.y,
        width: PANEL_W, maxWidth: "94vw",
        height: PANEL_H, maxHeight: "calc(100vh - 48px)",
        zIndex: 999,
        opacity: open ? 1 : 0,
        transform: open ? "scale(1)" : "scale(0.96) translateY(8px)",
        transformOrigin: "bottom right",
        transition: dragging ? "none" : "opacity 0.18s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1)",
        pointerEvents: open ? "auto" : "none",
        display: "flex", flexDirection: "column",
        background: C.bg,
        border: `1px solid ${C.glassBorder}`,
        borderRadius: 18,
        boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
      }}>
        {/* Header — Grok-style: drag handle on the left, mini icon bar on the right. */}
        <div style={{
          padding: "8px 10px 6px 12px",
          borderBottom: `1px solid ${C.glassBorder}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(8,8,16,0.92)", backdropFilter: "blur(16px)",
          gap: 8,
        }}>
          {/* Drag handle (⋮⋮) */}
          <div
            onMouseDown={onDragStart}
            title="Sürükle"
            style={{
              display: "flex", alignItems: "center", gap: 1,
              padding: "6px 4px",
              cursor: dragging ? "grabbing" : "grab",
              color: C.textDim, fontSize: 12, lineHeight: 1,
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            <span style={{ letterSpacing: -2 }}>⋮⋮</span>
          </div>
          {/* Brand row — compact */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: C.accentGlow, border: `1px solid ${C.accentBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, flexShrink: 0,
            }}>
              🧠
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.white, letterSpacing: -0.2 }}>
                Griseus
              </span>
              <span style={{ fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                @stok-danismani
              </span>
            </div>
          </div>
          {/* Mini icon bar */}
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              title="Geçmiş"
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: showHistory ? C.accentGlow : "transparent",
                border: "none",
                color: showHistory ? C.accent : C.textSecondary,
                fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (!showHistory) e.currentTarget.style.background = C.glassHover; }}
              onMouseLeave={e => { if (!showHistory) e.currentTarget.style.background = "transparent"; }}
            >
              ↺
            </button>
            <button
              onClick={startNewChat}
              title="Yeni sohbet"
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: "transparent", border: "none",
                color: C.textSecondary, fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.glassHover; e.currentTarget.style.color = C.white; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSecondary; }}
            >
              ✎
            </button>
            <button
              onClick={onClose}
              title="Kapat"
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: "transparent", border: "none",
                color: C.textSecondary, fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.glassHover; e.currentTarget.style.color = C.white; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSecondary; }}
            >
              ⌃
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
          flex: 1, overflowY: "auto", padding: "12px 14px",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.08) transparent",
        }}>
          {/* Empty state — suggestions */}
          {messages.length === 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                fontSize: 16, fontWeight: 600, color: C.white,
                marginBottom: 2, letterSpacing: -0.2,
              }}>
                Merhaba 👋
              </div>
              <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12 }}>
                Size nasıl yardımcı olabilirim?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s.text} onClick={() => sendMessage(s.text)} style={{
                    padding: "8px 12px", borderRadius: 10, textAlign: "left",
                    background: C.glass, border: `1px solid ${C.glassBorder}`,
                    color: C.textSecondary, fontSize: 12, cursor: "pointer",
                    transition: "all 0.2s", display: "flex", alignItems: "center", gap: 8,
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
                    <span style={{ fontSize: 14 }}>{s.emoji}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: 12,
              display: "flex", flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: m.role === "user" ? "85%" : "96%",
                padding: m.role === "user" ? "7px 12px" : "10px 14px",
                borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
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
                      fontSize: 12.5, lineHeight: 1.65, color: C.textPrimary,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 12.5, color: C.white, lineHeight: 1.55 }}>{m.content}</div>
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

          {/* Loading — Grok-style "Thinking about your request" status. */}
          {loading && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 4,
              marginBottom: 12, padding: "9px 12px", borderRadius: 10,
              background: C.glass, border: `1px solid ${C.glassBorder}`,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {[0, 1, 2].map(n => (
                    <div key={n} style={{
                      width: 5, height: 5, borderRadius: "50%", background: C.accent,
                      animation: `agent-pulse 1.2s infinite ${n * 0.2}s`,
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: C.textPrimary, fontWeight: 500 }}>
                  Thinking about your request
                </span>
              </div>
              <span style={{ fontSize: 11, color: C.textDim, paddingLeft: 28 }}>
                {mode === "fast" ? "Hızlı yanıt hazırlanıyor…" : mode === "research" ? "Derin analiz, alt-ajanlar çalışıyor…" : mode === "visual" ? "Diyagram render ediliyor…" : "Stok ve BOM verileri çekiliyor…"}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "9px 12px", borderRadius: 10, background: C.errDim,
              border: `1px solid rgba(248,113,113,0.2)`, color: C.err,
              fontSize: 12, marginBottom: 12,
            }}>
              {error}
            </div>
          )}
        </div>
        )}

        {/* Input Bar — Grok-style compact: textarea + Auto pill + send/stop. */}
        <div style={{
          padding: "6px 10px 10px",
          background: "rgba(8,8,16,0.92)", backdropFilter: "blur(16px)",
        }}>
          <div style={{
            display: "flex", flexDirection: "column", gap: 6,
            padding: "8px 10px 8px 12px", borderRadius: 14,
            background: C.glass, border: `1px solid ${C.glassBorder}`,
            transition: "border-color 0.2s",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              rows={1}
              style={{
                width: "100%", padding: "2px 0", border: "none", background: "transparent",
                color: C.white, fontSize: 13, outline: "none", resize: "none",
                lineHeight: 1.5, fontFamily: "inherit",
                maxHeight: 120,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {/* Auto / mode pill — surfaces the active mode label, click cycles. */}
              <button
                onClick={() => {
                  const i = MODES.findIndex(x => x.key === mode);
                  const next = MODES[(i + 1) % MODES.length];
                  setMode(next.key);
                }}
                title="Mod değiştir"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 999,
                  background: "transparent", border: `1px solid ${C.glassBorder}`,
                  color: C.textSecondary, fontSize: 11, cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.glassHover; e.currentTarget.style.color = C.white; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSecondary; }}
              >
                <span>{MODES.find(x => x.key === mode)?.label || "Auto"}</span>
                <span style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
              </button>
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  width: 26, height: 26, borderRadius: "50%", border: "none",
                  background: input.trim() ? C.white : "rgba(255,255,255,0.12)",
                  color: input.trim() ? "#000" : C.textDim,
                  fontSize: 13, cursor: input.trim() ? "pointer" : "default",
                  opacity: loading ? 0.5 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                  flexShrink: 0, fontWeight: 700,
                }}
              >
                ↑
              </button>
            </div>
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
