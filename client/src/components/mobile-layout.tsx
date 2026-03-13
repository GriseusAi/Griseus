import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { MapPin, Shield, Users, Sparkles, X, Send, Bot, Zap, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

const tabs = [
  { title: "Jobs", url: "/mobile", icon: MapPin },
  { title: "Passport", url: "/mobile/passport", icon: Shield },
  { title: "Squad", url: "/mobile/squad", icon: Users },
];

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

interface CeoConversation {
  id: string;
  timestamp: number;
  messages: ChatMessage[];
  preview: string;
}

const CEO_HISTORY_KEY = "ceo_chat_history";

function loadCeoHistory(): CeoConversation[] {
  try {
    const raw = localStorage.getItem(CEO_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCeoHistory(conversations: CeoConversation[]) {
  localStorage.setItem(CEO_HISTORY_KEY, JSON.stringify(conversations));
}

const CEO_WELCOME: ChatMessage = {
  role: "assistant",
  content: "Çukurova Isı Sistemleri Yönetici Asistanına hoş geldiniz. Üretim verileri, tedarik süreçleri veya dış ticaret konularında size nasıl yardımcı olabilirim?",
};

function AIChatOverlay({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const [isCeoMode, setIsCeoMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ceoHistory, setCeoHistory] = useState<CeoConversation[]>(loadCeoHistory);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Normal mode welcome
  const userName = user?.name?.split(" ")[0] || "there";
  const suggestion = user?.role === "company"
    ? "project staffing, worker matching, or workforce analytics"
    : "job matches, certifications, or skill development";
  const normalWelcome: ChatMessage = {
    role: "assistant",
    content: `Hello ${userName}. I am your Site AI. Ask me about ${suggestion}.`,
  };

  const [messages, setMessages] = useState<ChatMessage[]>([normalWelcome]);
  const [normalMessages, setNormalMessages] = useState<ChatMessage[]>([normalWelcome]);
  const [ceoMessages, setCeoMessages] = useState<ChatMessage[]>([CEO_WELCOME]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  // Sync messages with mode
  useEffect(() => {
    if (isCeoMode) {
      setMessages(ceoMessages);
    } else {
      setMessages(normalMessages);
    }
  }, [isCeoMode]);

  // Save CEO conversation to history when messages change in CEO mode
  const saveCeoConversation = useCallback((msgs: ChatMessage[]) => {
    if (msgs.length <= 1) return; // Don't save welcome-only
    const userMsgs = msgs.filter(m => m.role === "user");
    if (userMsgs.length === 0) return;

    const id = activeConversationId || `ceo_${Date.now()}`;
    if (!activeConversationId) setActiveConversationId(id);

    const preview = userMsgs[0].content.slice(0, 60) + (userMsgs[0].content.length > 60 ? "..." : "");
    const updated = ceoHistory.filter(c => c.id !== id);
    updated.unshift({ id, timestamp: Date.now(), messages: msgs, preview });
    const trimmed = updated.slice(0, 50); // Keep last 50 conversations
    setCeoHistory(trimmed);
    saveCeoHistory(trimmed);
  }, [activeConversationId, ceoHistory]);

  const handleToggleCeoMode = () => {
    if (isCeoMode) {
      // Switching to normal: save CEO messages
      setCeoMessages(messages);
      setMessages(normalMessages);
    } else {
      // Switching to CEO: save normal messages, start new CEO conversation
      setNormalMessages(messages);
      setActiveConversationId(null);
      setCeoMessages([CEO_WELCOME]);
      setMessages([CEO_WELCOME]);
    }
    setIsCeoMode(!isCeoMode);
    setShowHistory(false);
  };

  const loadConversation = (conv: CeoConversation) => {
    setActiveConversationId(conv.id);
    setCeoMessages(conv.messages);
    setMessages(conv.messages);
    setShowHistory(false);
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = ceoHistory.filter(c => c.id !== id);
    setCeoHistory(updated);
    saveCeoHistory(updated);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setCeoMessages([CEO_WELCOME]);
      setMessages([CEO_WELCOME]);
    }
  };

  const startNewCeoConversation = () => {
    setActiveConversationId(null);
    setCeoMessages([CEO_WELCOME]);
    setMessages([CEO_WELCOME]);
    setShowHistory(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    if (isCeoMode) setCeoMessages(updatedMessages);
    else setNormalMessages(updatedMessages);
    setInput("");
    setIsTyping(true);

    try {
      const res = await apiRequest("POST", "/api/ai/chat", {
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        ...(isCeoMode ? { mode: "ceo" } : {}),
      });
      const data = await res.json();
      const newMessages = [...updatedMessages, { role: "assistant" as const, content: data.response }];
      setMessages(newMessages);
      if (isCeoMode) {
        setCeoMessages(newMessages);
        saveCeoConversation(newMessages);
      } else {
        setNormalMessages(newMessages);
      }
    } catch {
      const errorMsg = isCeoMode
        ? "Bağlantı sorunu yaşanıyor. Lütfen tekrar deneyin."
        : "I'm having trouble connecting right now. Please try again.";
      const newMessages = [...updatedMessages, { role: "assistant" as const, content: errorMsg }];
      setMessages(newMessages);
      if (isCeoMode) setCeoMessages(newMessages);
      else setNormalMessages(newMessages);
    } finally {
      setIsTyping(false);
    }
  };

  const headerTitle = isCeoMode ? "Çukurova Isı — Yönetici Asistanı" : "Site AI";
  const headerSub = isCeoMode ? "● Kişisel Asistan" : "Always available on site";
  const headerIconBg = isCeoMode ? "bg-amber-500/15" : "bg-blue-500/15";
  const headerIconColor = isCeoMode ? "text-amber-400" : "text-blue-400";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background/80 backdrop-blur-sm" data-testid="ai-chat-overlay">
      <Card className="flex flex-col flex-1 m-3 mb-0 overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-card">
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center h-8 w-8 rounded-md ${headerIconBg}`}>
              {isCeoMode ? <Zap className={`h-4 w-4 ${headerIconColor}`} /> : <Bot className={`h-4 w-4 ${headerIconColor}`} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{headerTitle}</p>
              <p className={`text-[11px] ${isCeoMode ? "text-amber-400" : "text-slate-400"}`}>{headerSub}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* CEO Mode Toggle */}
            <button
              onClick={handleToggleCeoMode}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isCeoMode
                  ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
              }`}
              title={isCeoMode ? "Normal moda geç" : "CEO Moduna geç"}
              data-testid="button-toggle-ceo"
            >
              <span>⚡</span>
              <span>{isCeoMode ? "CEO" : "CEO"}</span>
            </button>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-ai-chat">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? `${isCeoMode ? "bg-amber-500" : "bg-blue-500"} text-white rounded-br-sm`
                    : "bg-[#1E293B] text-slate-200 rounded-bl-sm"
                }`}
                data-testid={`ai-message-${i}`}
              >
                {msg.content.split("\n").map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {line}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-[#1E293B] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">
                <span className="inline-flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* CEO History Panel */}
        {isCeoMode && (
          <div className="border-t border-white/10">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full px-4 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/5 transition-colors"
            >
              <span>Geçmiş Konuşmalar ({ceoHistory.length})</span>
              {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
            {showHistory && (
              <div className="max-h-40 overflow-auto px-2 pb-2 space-y-1">
                <button
                  onClick={startNewCeoConversation}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors font-medium"
                >
                  + Yeni Konuşma Başlat
                </button>
                {ceoHistory.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => loadConversation(conv)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      activeConversationId === conv.id
                        ? "bg-amber-500/15 text-amber-200"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{conv.preview}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(conv.timestamp).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="ml-2 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {ceoHistory.length === 0 && (
                  <p className="text-[11px] text-slate-500 text-center py-2">Henüz geçmiş konuşma yok</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-white/10 p-3 bg-card">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isCeoMode ? "Yönetici asistanına sorun..." : "Ask Site AI anything..."}
              className={`flex-1 h-10 rounded-md border border-white/10 bg-[#1E293B] px-3 text-sm text-white outline-none focus:ring-2 ${
                isCeoMode ? "focus:ring-amber-500/40" : "focus:ring-blue-500/40"
              } placeholder:text-slate-500`}
              data-testid="input-ai-chat"
            />
            <Button size="icon" type="submit" disabled={!input.trim()} data-testid="button-send-ai">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>

      <div className="h-3 flex-shrink-0" />
    </div>
  );
}

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-background" data-testid="mobile-layout">
      <main className="flex-1 h-0 overflow-auto">
        {children}
      </main>

      {chatOpen && <AIChatOverlay onClose={() => setChatOpen(false)} />}

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed z-[100] bottom-20 right-4 h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ring-4 ring-blue-500/20"
          style={{
            background: "linear-gradient(135deg, #3B82F6, #10B981)",
            boxShadow: "0 0 18px 4px rgba(59, 130, 246, 0.35), 0 4px 12px rgba(0,0,0,0.1)",
          }}
          data-testid="button-ai-fab"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </button>
      )}

      <nav className="border-t border-white/10 bg-[#0F172A]/90 backdrop-blur-md sticky bottom-0 z-50 safe-area-bottom" data-testid="mobile-tab-bar">
        <div className="flex items-center justify-around gap-1 px-2 py-2">
          {tabs.map((tab) => {
            const isActive = location === tab.url || (tab.url !== "/mobile" && location.startsWith(tab.url));
            const isJobsActive = tab.url === "/mobile" && (location === "/mobile" || location === "/mobile/");
            const active = isActive || isJobsActive;
            return (
              <Link key={tab.title} href={tab.url}>
                <button
                  className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-xl transition-all min-w-[72px] ${
                    active
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-slate-500"
                  }`}
                  data-testid={`mobile-tab-${tab.title.toLowerCase()}`}
                >
                  <tab.icon className={`h-5 w-5 ${active ? "stroke-[2.5px]" : ""}`} />
                  <span className={`text-[10px] font-medium ${active ? "font-semibold" : ""}`}>{tab.title}</span>
                  {active && <div className="h-1 w-1 rounded-full bg-blue-400 mt-0.5" />}
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
