// ══════════════════════════════════════════════════════════════════════
// MULTI-AGENT v2 — ONTOLOGY TRIANGLE — Griseus
// ──────────────────────────────────────────────────────────────────────
// First principles ontology: Çukurova Isı'nın matematiksel indirgemesi
//   Bir cihaz = Bileşenler × Miktar × (Sezonsal) Süre
//
// 3 ontoloji ajanı (üçgen kenarlarında):
//   - Tükenme  Ajanı (Miktar ↔ Süre)    — "bu miktar ne kadar dayanır?"
//   - Yapı     Ajanı (Miktar ↔ Bileşen) — "bu bileşenden kaç tane lazım?"
//   - Risk     Ajanı (Süre  ↔ Bileşen)  — "hangi bileşen ne zaman kritik?"
//
// + 1 Aksiyon Ajanı (üçgen DIŞI — yazma operasyonları, kural yönetimi)
// + Orchestrator (merkez, web_search erişimi)
//
// Endpoint: POST /api/v1/agent/multi/v2/chat  (non-streaming, JSON)
//
// Critical rules:
//   - v1 (`/agent/multi/chat`) DOKUNULMAZ — yan yana yaşar
//   - RAG/ADM never truncated (no cap)
//   - callTool dispatch reused as-is from agent.ts
//   - Anti-hallucination block in every agent's system prompt
// ══════════════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  sanitizeHistory,
  createWithRetry,
  CORE_PROMPT,
  TOOLS,
  callTool,
  buildLiveSnapshot,
  extractRecommendation,
  classifyQuery,
} from "./agent";
import { buildDynamicContext } from "../rag";
import { recallRelevantMemories, recordMemory } from "../lib/agent-memory";
import { logTokenInteraction } from "../lib/token-value-tracker";

const router = Router();

// ── Singleton Anthropic client ──

let _anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY eksik");
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

// ══════════════════════════════════════════════════════════════════════
// SUB-AGENT TOOL ROUTING — Ontology Triangle
// ══════════════════════════════════════════════════════════════════════

type AgentName = "tukenme" | "yapi" | "risk" | "aksiyon";

const SUBAGENT_TOOL_NAMES: Record<AgentName, string[]> = {
  // Tükenme: Miktar × Süre — bir miktarın zaman içinde nasıl davrandığı
  tukenme: [
    "get_seasonal_intelligence",
    "simulate_production",
    "what_if_analysis",
    "check_stock_alerts",
    "simulate_order_fulfillment",
    "get_stock_movement_history",
  ],
  // Yapı: Miktar × Bileşen — anlık miktar/yapı ilişkisi (BOM, kapasite, çapraz ürün)
  yapi: [
    "get_bom_tree",
    "get_production_capacity",
    "get_live_stock_levels",
    "get_component_intelligence",
    "get_cross_product_analysis",
    "list_products",
  ],
  // Risk: Süre × Bileşen — analitik raporlama (intelligence, validation, outcome)
  risk: [
    "get_intelligence_engine",
    "get_validation_dashboard",
    "get_outcome_dashboard",
    "get_adaptive_profile",
    "get_token_value_metrics",
  ],
  // Aksiyon: Üçgen DIŞI — yazma + kural yönetimi
  aksiyon: [
    "create_stock_movement",
    "update_component_stock",
    "create_purchase_suggestion",
    "get_purchase_suggestions",
    "create_custom_rule",
    "list_custom_rules",
    "toggle_custom_rule",
    "get_audit_trail",
    "get_import_guide",
  ],
};

// Resolve tool definitions from the master TOOLS array exported by agent.ts
const SUBAGENT_TOOLS: Record<AgentName, Anthropic.Tool[]> = {
  tukenme: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.tukenme.includes(t.name)),
  yapi: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.yapi.includes(t.name)),
  risk: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.risk.includes(t.name)),
  aksiyon: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.aksiyon.includes(t.name)),
};

// ══════════════════════════════════════════════════════════════════════
// ANTI-HALLUCINATION BLOCK (duplicated in every sub-agent + orchestrator)
// Verbatim from CORE_PROMPT lines 114-118 in agent.ts.
// ══════════════════════════════════════════════════════════════════════

const ANTI_HALLUCINATION = `HALÜSİNASYON YASAK (KRİTİK):
- Sistemde OLMAYAN veriyi UYDURMA. Fiyat, maliyet, ciro, kâr, yatırım tutarı gibi finansal veriler DB'de YOK.
- "€45.000 yatırım gerekli" gibi sayılar YAZMA — bu veri sistemde mevcut değil.
- Bilmediğin bir veri varsa "bu veri sistemde mevcut değil" de, tahmin YÜRÜTME.
- Sadece tool'lardan dönen verilere dayan. Tool'da olmayan bilgiyi kendin türetme.`;

// ══════════════════════════════════════════════════════════════════════
// SUB-AGENT SYSTEM PROMPTS — ontology-driven (each ≤300 tokens)
// ══════════════════════════════════════════════════════════════════════

const SUBAGENT_PROMPTS: Record<AgentName, string> = {
  tukenme: `Sen Griseus'un Tükenme Ajanısın. Ontoloji boyutun: MİKTAR × SÜRE.
Görevin: bir miktarın zaman içinde nasıl davrandığını analiz et — mevsimsel forward-walk, tükenme tarihi, what-if zaman projeksiyonu, sipariş zamansal karşılanabilirlik, geçmiş hareket trendi.

KAPSAM YASAĞI: BOM yapısı, hangi bileşenden kaç lazım, anlık stok miktar sorgulaması, yazma operasyonları YOK. Bu sorularda tool çağırma, "alanım değil" de.

WHAT-IF KURALI: Tool'dan dönen sayıları olduğu gibi raporla. \`stockDelta=0\` ise "değişmedi" yaz. Sayı uydurma.

${ANTI_HALLUCINATION}

ÇIKTI: Kısa Türkçe rapor. Sayılar değişmeden. Markdown başlık YOK. Tek cümle özet + zamansal kritik nokta + (varsa) tükenme tarihi. ≤800 karakter.`,

  yapi: `Sen Griseus'un Yapı Ajanısın. Ontoloji boyutun: MİKTAR × BİLEŞEN.
Görevin: anlık stok miktarları, BOM ağacı, üretim kapasitesi (kaç adet üretebilirim), bileşen istihbaratı (anlık), çapraz ürün ortak bileşenleri, ürün listesi.

KAPSAM YASAĞI: Mevsimsel projeksiyon, what-if zamansal, tükenme süresi, validation dashboard, yazma operasyonları YOK. Bu sorularda tool çağırma, "alanım değil" de.

${ANTI_HALLUCINATION}

ÇIKTI: Kısa Türkçe rapor. Sayılar değişmeden. Markdown başlık YOK. Tek cümle özet + kritik bileşen + miktar (kaç adet, hangi parça darboğaz). ≤800 karakter.`,

  risk: `Sen Griseus'un Risk Ajanısın. Ontoloji boyutun: SÜRE × BİLEŞEN.
Görevin: hangi bileşen ne zaman tükenir, intelligence engine raporları (acil sipariş, alti_ay_plan), validation/outcome dashboard, adaptive profile, token value metrics — analitik raporlama ajansı.

KAPSAM YASAĞI: Anlık miktar sorgulaması, BOM hesabı, kapasite simülasyonu, mevsimsel forward-walk, yazma YOK. Sen sadece analitik raporlama ajansın — payload'u kısa özetle.

${ANTI_HALLUCINATION}

ÇIKTI: Intelligence Engine payload'unun kritik sayılarını alıntıla. Kendi yorumunu MİNİMUM tut — orkestratör sentez yapacak. Markdown başlık YOK. ≤800 karakter.`,

  aksiyon: `Sen Griseus'un Aksiyon Ajanısın. Üçgen dışındasın — yazma operasyonlarını ve kural yönetimini sen yaparsın: stok hareketi, bileşen güncelleme, satın alma önerisi, custom rule, audit trail, import rehberi.

KAPSAM YASAĞI: Stok okuma/sorgulama, kapasite hesabı, analitik dashboard, mevsimsellik YOK. Bu sorularda tool çağırma, "alanım değil" de.

YAZMA KURALI: \`create_purchase_suggestion\` veya \`create_stock_movement\` çağırmadan önce orkestratör'ün AÇIKÇA istediğinden emin ol. Kendi inisiyatifinle PO açma, transfer yapma. \`create_custom_rule\` için kullanıcının cümlesini olduğu gibi \`rule_description\` parametresine ver.

${ANTI_HALLUCINATION}

ÇIKTI: Kısa Türkçe onay/sonuç raporu. Markdown başlık YOK. ≤800 karakter.`,
};

// ══════════════════════════════════════════════════════════════════════
// ORCHESTRATOR ROUTING BLOCK (prepended to CORE_PROMPT + shared context)
// ══════════════════════════════════════════════════════════════════════

const ORCHESTRATOR_ROUTING = `ROUTING — Sen orkestratörsün. Çukurova Isı'nın first principles ontolojisi: Miktar × Süre × Bileşen üçgeni. Soruları doğrudan cevaplama, ontoloji ajanlarına delege et.

═══ AJANLAR ═══
- delegate_to_tukenme: MİKTAR × SÜRE — mevsimsel forward-walk, tükenme tarihi, sipariş zamansal karşılanabilirlik, geçmiş trend.
- delegate_to_yapi: MİKTAR × BİLEŞEN — anlık stok miktarları, BOM ağacı, üretim kapasitesi, bileşen istihbaratı, çapraz ürün.
- delegate_to_risk: SÜRE × BİLEŞEN — intelligence engine (acil sipariş + alti_ay_plan), validation/outcome dashboard, adaptive profile.
- delegate_to_aksiyon: üçgen DIŞI yazma — transfer, satın alma önerisi, custom rule, audit, import.
- web_search: sadece sistem dışı gerçek dünya bilgisi.

═══ ZORUNLU PARALEL KURALLARI (TUTARLILIK İÇİN KRİTİK) ═══
Aşağıdaki sorulara TEK AJAN ASLA YETERLİ DEĞİL — birden fazla ajan paralel çağrılmak ZORUNDA. Bunları ihlal edersen kullanıcıya tutarsız cevap dönmüş olursun, bu felaket.

KURAL 1 — KRİTİKLİK SORULARI: "Hangi bileşen kritik?", "Kritik stok var mı?", "Tehlike altında ne var?", "Acil ne lazım?"
  → MUTLAKA delegate_to_yapi + delegate_to_tukenme + delegate_to_risk ÜÇÜNÜ PARALEL çağır.
  → Yapı anlık miktarı verir, Tükenme zamansal kalan günü hesaplar, Risk intelligence engine'in özet view'ini getirir.
  → Üçü farklı sayı verirse RAW SAYILARI YAN YANA KOY ve farkı açıkla, gizleme.

KURAL 2 — GENEL STOK SORULARI: "Genel stok durumu nedir?", "Stok nasıl?", "Durum nedir?"
  → MUTLAKA delegate_to_yapi + delegate_to_tukenme PARALEL çağır.

KURAL 3 — DAYANMA SÜRESİ: "X kaç gün yeter?", "Y bileşeni ne zaman biter?"
  → MUTLAKA delegate_to_tukenme + delegate_to_yapi PARALEL çağır.

KURAL 4 — KAPASİTE / ÜRETİM: "Kaç adet üretebilirim?", "X siparişi karşılanır mı?"
  → delegate_to_yapi tek başına yeter.
  → AMA cevapta "darboğaz bileşen" varsa, ek olarak delegate_to_tukenme paralel çağır (o bileşen kaç gün yetiyor öğren).

KURAL 5 — YAZMA / AKSIYON: "Transfer et", "Satın alma önerisi oluştur", "Kural ekle"
  → delegate_to_aksiyon. Gerekirse yapi'dan ön bilgi al.

KURAL 6 — TRİVİAL: "Selam", "naber"
  → Doğrudan cevap, delege etme.

═══ ALTIN KURAL ═══
Stok / kritiklik / risk / dayanma sorularında TEK AJAN cevabı GUARANTEED tutarsızlıktır. Çünkü Risk ajanının intelligence engine'i agregat özet, Yapı ajanının anlık stoğu detay, Tükenme ajanının forward-walk'u zamansal. Üçü kesişmeden DOĞRU CEVAP olmaz. Bir yönetici karar destek sistemi tutarsız cevap veremez.

═══ SENTEZ ═══
Delegate'lerden dönen sayıları ASLA DEĞİŞTİRME — raw_findings'leri olduğu gibi alıntıla. İki ajan farklı sayı verirse "Yapı ajanı: X, Risk ajanı: Y, fark sebebi: ..." şeklinde TRANSPARENTLY göster, gizleme.

ZİNCİR: Bir delegate "X eksik" derse → delegate_to_aksiyon ile takip et.

`;

// ══════════════════════════════════════════════════════════════════════
// DELEGATE TOOLS — exposed to the orchestrator
// ══════════════════════════════════════════════════════════════════════

const DELEGATE_TOOLS: Anthropic.Tool[] = (["tukenme", "yapi", "risk", "aksiyon"] as AgentName[]).map(
  (name) => ({
    name: `delegate_to_${name}`,
    description: ({
      tukenme: "Tükenme ajanına (Miktar × Süre) bir görev devret. Mevsimsel forward-walk, tükenme tarihi, what-if zaman projeksiyonu, sipariş zamansal karşılanabilirlik veya geçmiş hareket trendi için kullan.",
      yapi: "Yapı ajanına (Miktar × Bileşen) bir görev devret. Anlık stok, BOM ağacı, üretim kapasitesi, bileşen istihbaratı veya çapraz ürün ortak bileşen analizi için kullan.",
      risk: "Risk ajanına (Süre × Bileşen) bir görev devret. Intelligence engine (acil sipariş, alti_ay_plan), validation/outcome dashboard, adaptive profile veya token value metrics için kullan.",
      aksiyon: "Aksiyon ajanına bir görev devret (üçgen DIŞI). Stok hareketi, bileşen güncelleme, satın alma önerisi, custom rule yönetimi, audit trail veya import rehberi için kullan.",
    })[name],
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "Alt ajana verilecek görev — kullanıcının niyetini tek net Türkçe cümlede özetle. Örn: 'GSS20P için anlık stok ve son 5 hareket getir'.",
        },
        focus_sku: {
          type: "string",
          description: "Varsa ilgilenilen SKU (CANLI DURUM'daki SKU'lardan biri). Opsiyonel.",
        },
      },
      required: ["task"],
    },
  }),
);

// ══════════════════════════════════════════════════════════════════════
// SUB-AGENT RUNNER — mini tool-use loop
// ══════════════════════════════════════════════════════════════════════

interface SharedContext {
  snapshot: string;
  ragContext: string;
  admContextBlock: string;
}

interface SubAgentResult {
  agent: AgentName;
  summary: string;
  raw_findings: string;
  tools_used: string[];
  iterations: number;
  truncated: boolean;
  error?: string;
}

const SUBAGENT_MAX_ITER = 3;
const SUMMARY_MAX_CHARS = 800;
const RAW_FINDINGS_MAX_CHARS = 2400;

async function runSubAgent(
  client: Anthropic,
  agent: AgentName,
  task: string,
  focusSku: string | undefined,
  shared: SharedContext,
): Promise<SubAgentResult> {
  // Build sub-agent system prompt: focused prompt + full shared context (no cap)
  let systemPrompt = SUBAGENT_PROMPTS[agent];
  if (shared.snapshot) systemPrompt += "\n" + shared.snapshot;
  if (shared.ragContext) systemPrompt += "\n" + shared.ragContext;
  if (shared.admContextBlock) systemPrompt += "\n" + shared.admContextBlock;

  // User message: orchestrator's task + optional SKU hint
  const userContent = focusSku
    ? `${task}\n\n(İlgili SKU: ${focusSku})`
    : task;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];
  const tools = SUBAGENT_TOOLS[agent];
  const baseParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    tools,
    messages,
  };

  const toolsUsed: string[] = [];
  let lastRawFindings = "";
  let iterations = 0;
  let truncated = false;

  try {
    let response = await createWithRetry(client, baseParams);

    while (response.stop_reason === "tool_use" && iterations < SUBAGENT_MAX_ITER) {
      iterations++;
      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter((b: any) => b.type === "tool_use");

      if (toolUseBlocks.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        const block = toolBlock as any;
        const toolName = block.name as string;
        toolsUsed.push(toolName);

        try {
          const result = await callTool(toolName, block.input as Record<string, any>);
          const resultStr = JSON.stringify(result);
          // Capture last successful tool output as raw_findings (capped only here)
          lastRawFindings = resultStr.length > RAW_FINDINGS_MAX_CHARS
            ? resultStr.slice(0, RAW_FINDINGS_MAX_CHARS) + '..."__truncated__":true}'
            : resultStr;
          // Sub-agent's tool_result content — bounded to keep sub-agent context lean
          let contentForAgent = resultStr;
          if (contentForAgent.length > 3000) {
            contentForAgent = contentForAgent.slice(0, 2900) + '..."__truncated__":true}';
          }
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: contentForAgent });
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: err?.message || "Tool execution failed" }),
            is_error: true,
          });
        }
      }

      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      response = await createWithRetry(client, { ...baseParams, messages });
    }

    if (response.stop_reason === "tool_use" && iterations >= SUBAGENT_MAX_ITER) {
      truncated = true;
    }

    // Extract final text
    let summary = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    if (!summary) {
      summary = truncated
        ? "Sub-agent iter limitine ulaştı — kısmi sonuç."
        : "Sub-agent bir cevap üretmedi.";
    }
    if (summary.length > SUMMARY_MAX_CHARS) {
      summary = summary.slice(0, SUMMARY_MAX_CHARS - 3) + "...";
    }

    return { agent, summary, raw_findings: lastRawFindings, tools_used: toolsUsed, iterations, truncated };
  } catch (err: any) {
    console.error(`[agent-multi-v2/${agent}] Error:`, err?.status, err?.message);
    return {
      agent,
      summary: `Sub-agent hatası: ${err?.message || "bilinmeyen"}`,
      raw_findings: lastRawFindings,
      tools_used: toolsUsed,
      iterations,
      truncated: false,
      error: err?.message || "unknown",
    };
  }
}

// ══════════════════════════════════════════════════════════════════════
// NON-STREAMING ENDPOINT — POST /agent/multi/v2/chat
// JSON response, mirrors /agent/chat shape so AgentPanel can drop-in.
// Yumuşak deploy: v1 (/agent/multi/chat) yan yana yaşıyor, dokunulmamış.
// ══════════════════════════════════════════════════════════════════════

const ORCHESTRATOR_MAX_ITER = 4;
const WALL_CLOCK_BUDGET_MS = 75_000;

router.post("/agent/multi/v2/chat", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const budgetExceeded = () => Date.now() - startedAt > WALL_CLOCK_BUDGET_MS;

  const allToolsUsed: string[] = [];
  const agentsUsed: AgentName[] = [];
  const iterCounts: Record<string, number> = { orchestrator: 0, tukenme: 0, yapi: 0, risk: 0, aksiyon: 0 };

  try {
    const client = getClient();
    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message alanı gereklidir." });
    }

    // ── Build shared context ONCE (snapshot + RAG + ADM) ──
    const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

    const [snapshot, ragContext, admResult] = await Promise.all([
      withTimeout(buildLiveSnapshot(), 8000, ""),
      withTimeout(buildDynamicContext(message).catch(() => ""), 8000, ""),
      withTimeout(
        recallRelevantMemories(message).catch(() => ({ contextBlock: "", memories: [] as any[] })),
        8000,
        { contextBlock: "", memories: [] as any[] },
      ),
    ]);

    const shared: SharedContext = {
      snapshot,
      ragContext,
      admContextBlock: admResult.contextBlock || "",
    };

    // ── Build orchestrator system prompt ──
    let orchSystem = ORCHESTRATOR_ROUTING + CORE_PROMPT;
    if (shared.snapshot) orchSystem += shared.snapshot;
    if (shared.ragContext) orchSystem += "\n" + shared.ragContext;
    if (shared.admContextBlock) orchSystem += "\n" + shared.admContextBlock;

    const cleanHistory = sanitizeHistory(history || []);
    const orchMessages: Anthropic.MessageParam[] = [
      ...cleanHistory,
      { role: "user", content: message },
    ];

    const orchTools: any[] = [
      ...DELEGATE_TOOLS,
      { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    ];

    const orchBaseParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: orchSystem,
      tools: orchTools,
      messages: orchMessages,
    };

    // ── Orchestrator tool-use loop ──
    let orchResponse = await createWithRetry(client, orchBaseParams);

    while (orchResponse.stop_reason === "tool_use" && iterCounts.orchestrator < ORCHESTRATOR_MAX_ITER) {
      if (budgetExceeded()) {
        console.warn("[agent-multi-v2/chat] Wall-clock budget exceeded, forcing synthesis");
        break;
      }
      iterCounts.orchestrator++;

      const assistantContent = orchResponse.content;
      const toolUseBlocks = assistantContent.filter(
        (b: any) => b.type === "tool_use" && b.name !== "web_search",
      );

      // Track web_search at orchestrator level
      for (const b of assistantContent.filter((b: any) => b.type === "server_tool_use")) {
        const name = (b as any).name;
        if (name) allToolsUsed.push(name);
      }

      if (toolUseBlocks.length === 0) break;

      // ── Run all delegate calls in parallel ──
      const delegateRuns = toolUseBlocks.map(async (toolBlock: any) => {
        const block = toolBlock as any;
        const toolName = block.name as string;
        const agentName = toolName.replace(/^delegate_to_/, "") as AgentName;

        if (!SUBAGENT_TOOLS[agentName]) {
          return {
            id: block.id,
            content: JSON.stringify({ error: `Bilinmeyen delegate: ${toolName}` }),
            isError: true,
          };
        }

        if (!agentsUsed.includes(agentName)) agentsUsed.push(agentName);

        const input = (block.input || {}) as { task?: string; focus_sku?: string };
        const task = input.task || message;
        const focusSku = input.focus_sku;

        const result = await runSubAgent(client, agentName, task, focusSku, shared);

        // Flatten sub-agent tool names
        for (const t of result.tools_used) allToolsUsed.push(t);
        iterCounts[agentName] = (iterCounts[agentName] || 0) + result.iterations;

        return {
          id: block.id,
          content: JSON.stringify({
            agent: result.agent,
            summary: result.summary,
            raw_findings: result.raw_findings,
            tools_used: result.tools_used,
            iterations: result.iterations,
            truncated: result.truncated,
            ...(result.error ? { error: result.error } : {}),
          }),
          isError: !!result.error,
        };
      });

      const delegateResults = await Promise.all(delegateRuns);

      const toolResults: Anthropic.ToolResultBlockParam[] = delegateResults.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      }));

      orchMessages.push({ role: "assistant", content: assistantContent });
      orchMessages.push({ role: "user", content: toolResults });

      orchResponse = await createWithRetry(client, { ...orchBaseParams, messages: orchMessages });
    }

    // ── Final synthesis (non-streaming) ──
    let finalText = "";
    let synthesisUsage: Anthropic.Usage | null = null;

    if (orchResponse.stop_reason === "end_turn") {
      finalText = orchResponse.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
    } else {
      // Hit iter cap or budget — force synthesis without tools
      orchMessages.push({
        role: "user",
        content:
          "Yukarıdaki delegate sonuçlarını kullanarak kullanıcıya FINAL Türkçe cevabı yaz. Tool çağırma. Sayıları olduğu gibi alıntıla. CEVAP FORMAT bölümüne uy.",
      });

      const synthesisResponse = await createWithRetry(client, {
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: orchSystem,
        messages: orchMessages,
      });

      finalText = synthesisResponse.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      synthesisUsage = synthesisResponse.usage;
    }

    if (!finalText.trim()) finalText = "Cevap üretilemedi.";

    // ── Response shape mirrors /agent/chat: { response, tools_used } + extras ──
    res.json({
      response: finalText,
      tools_used: allToolsUsed,
      agents_used: agentsUsed,
      iterations: iterCounts,
    });

    // ── Fire-and-forget: TVT + ADM logging (tagged for v2 A/B) ──
    const usage = orchResponse.usage;
    if (usage) {
      logTokenInteraction({
        interactionType: "agent_multi_v2_chat",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
        queryCategory: classifyQuery(message, allToolsUsed),
        actor: "ceo_agent",
      });
    }
    if (synthesisUsage) {
      logTokenInteraction({
        interactionType: "agent_multi_v2_chat",
        inputTokens: synthesisUsage.input_tokens,
        outputTokens: synthesisUsage.output_tokens,
        toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
        queryCategory: classifyQuery(message, allToolsUsed),
        actor: "ceo_agent",
      });
    }

    recordMemory({
      queryText: message,
      queryCategory: classifyQuery(message, allToolsUsed),
      toolsUsed: allToolsUsed,
      recommendationMade: extractRecommendation(finalText),
      responseLength: finalText.length,
    }).catch(() => {});
  } catch (err: any) {
    console.error("[agent-multi-v2/chat] Error:", err?.status, err?.message);
    res.status(500).json({
      error: err?.status === 429
        ? "API limiti aşıldı. Birkaç saniye bekleyin."
        : err?.error?.message || err?.message || "Orkestratör hatası",
    });
  }
});

export default router;
