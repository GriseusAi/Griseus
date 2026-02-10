import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { MapPin, Shield, Users, Sparkles, X, Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const tabs = [
  { title: "Jobs", url: "/mobile", icon: MapPin },
  { title: "Passport", url: "/mobile/passport", icon: Shield },
  { title: "Squad", url: "/mobile/squad", icon: Users },
];

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Hello Marcus. I am your Site AI. Ask me about safety protocols or translation.",
};

const DEMO_RESPONSES: Record<string, string> = {
  safety: "Always wear your PPE including hard hat, safety glasses, and high-visibility vest on site. Check in with your foreman before entering any active electrical zone.",
  translation: "I can help translate safety signs and instructions between English, Spanish, and Mandarin. Just share the text you need translated.",
  default: "I'm currently in demo mode. In the full version, I'll be able to help with safety protocols, translate documents, check certification requirements, and more.",
};

function getResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("safety") || lower.includes("ppe") || lower.includes("protocol") || lower.includes("hazard")) {
    return DEMO_RESPONSES.safety;
  }
  if (lower.includes("translat") || lower.includes("spanish") || lower.includes("language")) {
    return DEMO_RESPONSES.translation;
  }
  return DEMO_RESPONSES.default;
}

function AIChatOverlay({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: getResponse(text) }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background/80 backdrop-blur-sm" data-testid="ai-chat-overlay">
      <Card className="flex flex-col flex-1 m-3 mb-0 overflow-hidden border">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-md bg-violet-500/15">
              <Bot className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Site AI</p>
              <p className="text-[11px] text-muted-foreground">Always available on site</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-ai-chat">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
                data-testid={`ai-message-${i}`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2.5 text-sm">
                <span className="inline-flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 bg-card">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Site AI anything..."
              className="flex-1 h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {chatOpen && <AIChatOverlay onClose={() => setChatOpen(false)} />}

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed z-[100] bottom-20 right-4 h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, hsl(270 80% 60%), hsl(290 85% 55%))",
            boxShadow: "0 0 18px 4px hsla(280, 80%, 60%, 0.45), 0 4px 12px rgba(0,0,0,0.2)",
          }}
          data-testid="button-ai-fab"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </button>
      )}

      <nav className="border-t bg-card sticky bottom-0 z-50 safe-area-bottom" data-testid="mobile-tab-bar">
        <div className="flex items-center justify-around gap-1 px-2 py-2">
          {tabs.map((tab) => {
            const isActive = location === tab.url || (tab.url !== "/mobile" && location.startsWith(tab.url));
            const isJobsActive = tab.url === "/mobile" && (location === "/mobile" || location === "/mobile/");
            const active = isActive || isJobsActive;
            return (
              <Link key={tab.title} href={tab.url}>
                <button
                  className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-md transition-colors min-w-[72px] ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`mobile-tab-${tab.title.toLowerCase()}`}
                >
                  <tab.icon className={`h-6 w-6 ${active ? "stroke-[2.5px]" : ""}`} />
                  <span className={`text-xs font-medium ${active ? "font-semibold" : ""}`}>{tab.title}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
