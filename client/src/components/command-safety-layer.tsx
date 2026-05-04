import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

type RiskLevel = "confirm" | "critical";

type SafetyPrompt = {
  id: number;
  level: RiskLevel;
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  token?: string;
  resolve: (allowed: boolean) => void;
};

const CONFIRMED_HEADER = "X-Griseus-Command-Confirmed";

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname + input.search;
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method || (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

function hasConfirmation(init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  return headers.get(CONFIRMED_HEADER) === "1";
}

function describeBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return null;
  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const pairs = Object.entries(body)
      .filter(([, value]) => typeof value !== "object")
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${String(value)}`);
    return pairs.length > 0 ? pairs.join(", ") : null;
  } catch {
    return null;
  }
}

function classifyCommand(input: RequestInfo | URL, init?: RequestInit): Omit<SafetyPrompt, "id" | "resolve"> | null {
  const method = getRequestMethod(input, init);
  if (method === "GET" || method === "HEAD" || hasConfirmation(init)) return null;

  const rawUrl = getRequestUrl(input);
  const url = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl.split("?")[0];
  const bodyDetails = describeBody(init);
  const details = [`Endpoint: ${method} ${url}`];
  if (bodyDetails) details.push(bodyDetails);

  if (method === "DELETE") {
    return {
      level: "critical",
      title: "Silme komutu onay bekliyor",
      description: "Bu işlem kayıt silebilir. Yanlış tıklama ile çalışmasına izin verilmiyor.",
      details,
      confirmLabel: "Sil",
      token: "SIL",
    };
  }

  if (url === "/api/stock/reset") {
    return {
      level: "critical",
      title: "Stok sıfırlama kilitlendi",
      description: "Bu komut stok verisini baştan kurar. Bilerek çalıştırmak için kilidi açmanız gerekir.",
      details,
      confirmLabel: "Sıfırla",
      token: "SIFIRLA",
    };
  }

  if (url === "/api/import/execute" || url.startsWith("/api/import/bulk/")) {
    return {
      level: "critical",
      title: "Veri import komutu onay bekliyor",
      description: "Import ve bulk güncelleme mevcut veriyi değiştirebilir. Önce neyin çalışacağını kontrol edin.",
      details,
      confirmLabel: "Import Et",
      token: "IMPORT",
    };
  }

  if (url === "/api/planning/point") {
    return {
      level: "critical",
      title: "Planlama verisi güncelleme komutu",
      description: "Bu işlem satış/planlama atomunu değiştirir ve zincir hesaplarını etkileyebilir.",
      details,
      confirmLabel: "Güncelle",
      token: "PLAN",
    };
  }

  if (url === "/api/stock/movements" || /^\/api\/stock\/movements\/\d+\/undo$/.test(url)) {
    return {
      level: "confirm",
      title: url.endsWith("/undo") ? "Geri alma komutu" : "Stok hareketi komutu",
      description: "Bu işlem stok zincirini değiştirir ve ilgili sayfaları yeniden hesaplatır.",
      details,
      confirmLabel: "Çalıştır",
    };
  }

  if (url.startsWith("/api/ontology/action/") || (url.startsWith("/api/foundry/scenarios/") && url.endsWith("/apply"))) {
    return {
      level: "confirm",
      title: "Operasyon komutu",
      description: "Bu işlem senaryo veya ontoloji aksiyonunu canlı veriye uygulayabilir.",
      details,
      confirmLabel: "Uygula",
    };
  }

  return null;
}

export default function CommandSafetyLayer() {
  const [prompt, setPrompt] = useState<SafetyPrompt | null>(null);
  const [tokenValue, setTokenValue] = useState("");
  const queueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const nextIdRef = useRef(1);

  const requestConfirmation = useCallback((promptData: Omit<SafetyPrompt, "id" | "resolve">) => {
    const run = () => new Promise<boolean>((resolve) => {
      setTokenValue("");
      setPrompt({ ...promptData, id: nextIdRef.current++, resolve });
    });

    const next = queueRef.current.then(run, run);
    queueRef.current = next.then(() => true, () => true);
    return next;
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const command = classifyCommand(input, init);
      if (command) {
        const allowed = await requestConfirmation(command);
        if (!allowed) {
          throw new DOMException("Komut kullanıcı tarafından iptal edildi.", "AbortError");
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [requestConfirmation]);

  const canConfirm = useMemo(() => {
    if (!prompt?.token) return true;
    return tokenValue.trim().toLocaleUpperCase("tr-TR") === prompt.token;
  }, [prompt, tokenValue]);

  if (!prompt) return null;

  const close = (allowed: boolean) => {
    const resolver = prompt.resolve;
    setPrompt(null);
    setTokenValue("");
    resolver(allowed);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="command-safety-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 px-4"
    >
      <div className="w-full max-w-[520px] rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className={prompt.level === "critical" ? "mt-0.5 text-red-600" : "mt-0.5 text-amber-600"}>
            {prompt.level === "critical" ? <ShieldAlert size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div>
            <h2 id="command-safety-title" className="text-base font-semibold text-slate-950">
              {prompt.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{prompt.description}</p>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          {prompt.details.map((detail) => (
            <div key={detail} className="break-words font-mono text-xs leading-6 text-slate-700">
              {detail}
            </div>
          ))}
        </div>

        {prompt.token && (
          <label className="mt-4 block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Devam etmek için {prompt.token} yazın
            </span>
            <input
              autoFocus
              value={tokenValue}
              onChange={(event) => setTokenValue(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 font-mono text-sm outline-none focus:border-slate-900"
            />
          </label>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => close(true)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 size={16} />
            {prompt.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
