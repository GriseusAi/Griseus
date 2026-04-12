// ══════════════════════════════════════════════════════════════════════
// MULTI-AGENT ORCHESTRATOR — Griseus
// ──────────────────────────────────────────────────────────────────────
// Self-orchestrated multi-agent: 1 orchestrator + 4 specialist sub-agents.
// Pattern: delegation-as-tools. Orchestrator delegates via delegate_to_*
// tools, each delegate runs a sub-agent's mini tool-use loop, returns
// a structured summary. Final synthesis is streamed token-by-token.
//
// Endpoint: POST /api/v1/agent/multi/chat/stream  (SSE)
//
// Critical rules (memory feedback):
//   - RAG/ADM never truncated (no cap)
//   - System coherence (no per-product hardcoding)
//   - Existing /agent/chat/stream is NOT touched
//   - callTool dispatch is reused as-is from agent.ts
//   - Anti-hallucination block in every agent's system prompt
// ══════════════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  sanitizeHistory,
  createWithRetry,
  CORE_PROMPT,
  FALLBACK_TOOLS as TOOLS,
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
// SUB-AGENT TOOL ROUTING
// Each sub-agent only sees its own tools — Anthropic API will refuse
// any tool call outside its allowed set (defense in depth).
// ══════════════════════════════════════════════════════════════════════

type AgentName = "stok" | "planlama" | "istihbarat" | "aksiyon";

const SUBAGENT_TOOL_NAMES: Record<AgentName, string[]> = {
  stok: [
    "list_products",
    "get_live_stock_levels",
    "get_stock_movement_history",
    "simulate_order_fulfillment",
    "check_stock_alerts",
    "create_stock_movement",
    "update_component_stock",
  ],
  planlama: [
    "get_production_capacity",
    "simulate_production",
    "what_if_analysis",
    "get_seasonal_intelligence",
    "get_cross_product_analysis",
  ],
  istihbarat: [
    "get_component_intelligence",
    "get_intelligence_engine",
    "get_bom_tree",
    "get_validation_dashboard",
    "get_outcome_dashboard",
    "get_adaptive_profile",
    "get_token_value_metrics",
  ],
  aksiyon: [
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
  stok: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.stok.includes(t.name)),
  planlama: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.planlama.includes(t.name)),
  istihbarat: TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.istihbarat.includes(t.name)),
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
// SUB-AGENT SYSTEM PROMPTS (each ≤300 tokens)
// ══════════════════════════════════════════════════════════════════════

const SUBAGENT_PROMPTS: Record<AgentName, string> = {
  stok: `Sen Griseus'un Stok Ajanısın. Görevin: anlık stok, hareketler, sipariş simülasyonu, kritik uyarı, transfer/yazma. Sadece sana verilen tool'ları kullan.

KAPSAM YASAĞI: Üretim kapasitesi, mevsimsellik, what-if, satın alma önerisi, analitik dashboard sorularına TOOL ÇAĞIRMA — orkestratör'a "bu benim alanım değil" cevabı dön.

${ANTI_HALLUCINATION}

ÇIKTI: Tool sonuçlarını kısa Türkçe rapor olarak döndür. Sayıları paraphrase ETME — olduğu gibi alıntıla. Markdown başlık (#, ##) KULLANMA. Tek cümle özet + kritik sayılar + (varsa) hangi ürün kritik. ≤800 karakter.`,

  planlama: `Sen Griseus'un Planlama Ajanısın. Görevin: üretim kapasitesi, simülasyon, what-if analizi, mevsimsel istihbarat, çapraz ürün analizi. Sadece sana verilen tool'ları kullan.

KAPSAM YASAĞI: Stok yazma, transfer, satın alma önerisi, audit YOK. Bu sorularda tool çağırma, "alanım değil" de.

WHAT-IF KURALI: Tool'dan dönen sayıları olduğu gibi raporla. \`stockDelta=0\` ise "değişmedi" yaz. Sayı uydurma.

${ANTI_HALLUCINATION}

ÇIKTI: Kısa Türkçe rapor, sayılar değişmeden, markdown başlık YOK. Tek cümle özet + darboğaz + (varsa) eksik bileşen. ≤800 karakter.`,

  istihbarat: `Sen Griseus'un İstihbarat Ajanısın. Görevin: bileşen tüketim hızı, intelligence engine raporları, BOM ağacı, validation/outcome dashboard, adaptive profile, token value metrics. Sadece sana verilen tool'ları kullan.

KAPSAM YASAĞI: Stok yazma, satın alma önerisi, simülasyon, what-if YOK. Sen sadece analitik raporlama ajansın.

${ANTI_HALLUCINATION}

ÇIKTI: Intelligence Engine payload'unun kritik sayılarını alıntıla. Kendi yorumunu MİNİMUM tut — orkestratör sentez yapacak. Markdown başlık YOK. ≤800 karakter.`,

  aksiyon: `Sen Griseus'un Aksiyon Ajanısın. Görevin: satın alma önerisi oluşturma/listeleme, custom rule yönetimi, audit trail, import rehberi. Sadece sana verilen tool'ları kullan.

KAPSAM YASAĞI: Stok okuma/sorgulama, kapasite, analitik dashboard YOK. Bu sorularda tool çağırma, "alanım değil" de.

YAZMA KURALI: \`create_purchase_suggestion\` çağırmadan önce orkestratör'ün açıkça istediğinden emin ol. Kendi inisiyatifinle PO açma. \`create_custom_rule\` için kullanıcının cümlesini olduğu gibi \`rule_description\` parametresine ver.

${ANTI_HALLUCINATION}

ÇIKTI: Kısa Türkçe onay/sonuç raporu. Markdown başlık YOK. ≤800 karakter.`,
};

// ══════════════════════════════════════════════════════════════════════
// ORCHESTRATOR ROUTING BLOCK (prepended to CORE_PROMPT + shared context)
// ══════════════════════════════════════════════════════════════════════

const ORCHESTRATOR_ROUTING = `ROUTING — Sen orkestratörsün. Soruları doğrudan cevaplama, alt ajanlara delege et:

- delegate_to_stok: anlık stok, hareket, sipariş simülasyonu, kritik uyarı, transfer/yazma.
- delegate_to_planlama: üretim kapasitesi, simülasyon, what-if, mevsimsellik, çapraz ürün.
- delegate_to_istihbarat: tüketim hızı, BOM ağacı, validation/outcome, adaptive profile, token metrics.
- delegate_to_aksiyon: satın alma önerisi, custom rule, audit, import.
- web_search: sadece sistem dışı gerçek dünya bilgisi (fiyat trendi, tedarikçi haberi).

PARALEL DELEGE: Soru iki domain'e değiniyorsa iki delegate'i AYNI tool_use turunda çağır.
ZİNCİR: Bir delegate "X eksik" derse → delegate_to_aksiyon ile takip et.
SENTEZ: Delegate'lerden dönen sayıları DEĞİŞTİRME — olduğu gibi alıntıla. raw_findings'i kullan.
TRİVİAL: "Selam", "naber" gibi sorulara doğrudan cevap ver, delege etme.

`;

// ══════════════════════════════════════════════════════════════════════
// DELEGATE TOOLS — exposed to the orchestrator
// ══════════════════════════════════════════════════════════════════════

const DELEGATE_TOOLS: Anthropic.Tool[] = (["stok", "planlama", "istihbarat", "aksiyon"] as AgentName[]).map(
  (name) => ({
    name: `delegate_to_${name}`,
    description: ({
      stok: "Stok ajanına bir görev devret. Anlık stok, hareketler, sipariş simülasyonu, kritik uyarı, transfer veya stok yazma için kullan.",
      planlama: "Planlama ajanına bir görev devret. Üretim kapasitesi, üretim simülasyonu, what-if analizi, mevsimsel tahmin veya çapraz ürün analizi için kullan.",
      istihbarat: "İstihbarat ajanına bir görev devret. Bileşen tüketim hızı, BOM ağacı, validation/outcome dashboard, adaptive profile veya token value metrics için kullan.",
      aksiyon: "Aksiyon ajanına bir görev devret. Satın alma önerisi, custom rule yönetimi, audit trail veya import rehberi için kullan.",
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
  send: (event: string, data: any) => void,
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

  send("agent", { name: agent, phase: "start", task });

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
        send("tool", { name: toolName, agent });

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

    send("agent", { name: agent, phase: "end", tools_used: toolsUsed });

    return { agent, summary, raw_findings: lastRawFindings, tools_used: toolsUsed, iterations, truncated };
  } catch (err: any) {
    console.error(`[agent-multi/${agent}] Error:`, err?.status, err?.message);
    send("agent", { name: agent, phase: "end", tools_used: toolsUsed, error: err?.message });
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
// ORCHESTRATOR ENDPOINT — POST /agent/multi/chat/stream (SSE)
// ══════════════════════════════════════════════════════════════════════

const ORCHESTRATOR_MAX_ITER = 4;
const WALL_CLOCK_BUDGET_MS = 75_000;

router.post("/agent/multi/chat/stream", async (req: Request, res: Response) => {
  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 10000);

  const startedAt = Date.now();
  const budgetExceeded = () => Date.now() - startedAt > WALL_CLOCK_BUDGET_MS;

  // Aggregated tool tracking — flattened sub-agent tool names (frontend WRITE_TOOLS depends on this)
  const allToolsUsed: string[] = [];
  const agentsUsed: AgentName[] = [];
  const iterCounts: Record<string, number> = { orchestrator: 0, stok: 0, planlama: 0, istihbarat: 0, aksiyon: 0 };

  try {
    send("status", { message: "Analiz başlıyor..." });
    const client = getClient();
    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };

    if (!message || typeof message !== "string") {
      send("error", { error: "message alanı gereklidir." });
      res.end();
      clearInterval(heartbeat);
      return;
    }

    // ── Build shared context ONCE (snapshot + RAG + ADM) ──
    send("status", { message: "Bağlam yükleniyor..." });

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

    // Orchestrator tools: 4 delegates + Anthropic web_search
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

    send("status", { message: "Orkestratör çalışıyor..." });

    // ── Orchestrator tool-use loop ──
    let orchResponse = await createWithRetry(client, orchBaseParams);

    while (orchResponse.stop_reason === "tool_use" && iterCounts.orchestrator < ORCHESTRATOR_MAX_ITER) {
      if (budgetExceeded()) {
        console.warn("[agent-multi] Wall-clock budget exceeded, forcing synthesis");
        break;
      }
      iterCounts.orchestrator++;

      const assistantContent = orchResponse.content;
      const toolUseBlocks = assistantContent.filter(
        (b: any) => b.type === "tool_use" && b.name !== "web_search",
      );

      // Track web_search usage at orchestrator level
      for (const b of assistantContent.filter((b: any) => b.type === "server_tool_use")) {
        const name = (b as any).name;
        if (name) {
          allToolsUsed.push(name);
          send("tool", { name, agent: "orchestrator" });
        }
      }

      if (toolUseBlocks.length === 0) break;

      // ── Run all delegate calls in this turn IN PARALLEL ──
      const delegateRuns = toolUseBlocks.map(async (toolBlock: any) => {
        const block = toolBlock as any;
        const toolName = block.name as string;

        // Parse delegate tool name → agent name
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

        const result = await runSubAgent(client, agentName, task, focusSku, shared, send);

        // Flatten sub-agent tool names into top-level tracking
        for (const t of result.tools_used) {
          allToolsUsed.push(t);
        }
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

    // ── Final synthesis: stream response ──
    // If the last orchestrator response already contains text and is end_turn, just stream that.
    // Otherwise, force one more synthesis call without tools.
    let finalText = "";

    if (orchResponse.stop_reason === "end_turn") {
      // Already a final answer — stream it via chunked text events (replay-style)
      finalText = orchResponse.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      send("status", { message: "Sentez yapılıyor..." });
      const chunkSize = 12;
      for (let i = 0; i < finalText.length; i += chunkSize) {
        send("text", { chunk: finalText.slice(i, i + chunkSize) });
      }
    } else {
      // Hit iter limit OR budget exceeded — force synthesis without tools using real streaming
      send("status", { message: "Sentez yapılıyor..." });

      // Append a synthesis instruction
      orchMessages.push({
        role: "user",
        content:
          "Yukarıdaki delegate sonuçlarını kullanarak kullanıcıya FINAL Türkçe cevabı yaz. Tool çağırma. Sayıları olduğu gibi alıntıla. CEVAP FORMAT bölümüne uy.",
      });

      try {
        const stream = await client.messages.stream({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: orchSystem,
          messages: orchMessages,
          // No tools — final synthesis only
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            finalText += chunk;
            send("text", { chunk });
          }
        }

        // Capture usage from final message (await stream completion)
        const finalMsg = await stream.finalMessage();
        if (finalMsg.usage) {
          // Log synthesis tokens too
          logTokenInteraction({
            interactionType: "agent_multi_chat",
            inputTokens: finalMsg.usage.input_tokens,
            outputTokens: finalMsg.usage.output_tokens,
            toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
            queryCategory: classifyQuery(message, allToolsUsed),
            actor: "ceo_agent",
          });
        }
      } catch (streamErr: any) {
        console.error("[agent-multi/synthesis] Stream error:", streamErr?.message);
        send("text", { chunk: "\n\n⚠️ Sentez sırasında hata oluştu." });
      }
    }

    if (!finalText.trim()) {
      send("text", { chunk: "Cevap üretilemedi." });
      finalText = "Cevap üretilemedi.";
    }

    clearInterval(heartbeat);
    send("done", {
      tools_used: allToolsUsed,
      agents_used: agentsUsed,
      iterations: iterCounts,
    });
    res.end();

    // ── Fire-and-forget: TVT + ADM logging (only if not already logged in synthesis branch) ──
    if (orchResponse.stop_reason === "end_turn") {
      const usage = orchResponse.usage;
      if (usage) {
        logTokenInteraction({
          interactionType: "agent_multi_chat",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
          queryCategory: classifyQuery(message, allToolsUsed),
          actor: "ceo_agent",
        });
      }
    }

    recordMemory({
      queryText: message,
      queryCategory: classifyQuery(message, allToolsUsed),
      toolsUsed: allToolsUsed,
      recommendationMade: extractRecommendation(finalText),
      responseLength: finalText.length,
    }).catch(() => {});
  } catch (err: any) {
    clearInterval(heartbeat);
    console.error("[agent-multi/stream] Error:", err?.status, err?.message);
    send("error", {
      error: err?.status === 429
        ? "API limiti aşıldı. Birkaç saniye bekleyin."
        : err?.error?.message || err?.message || "Orkestratör hatası",
    });
    res.end();
  }
});

// ══════════════════════════════════════════════════════════════════════
// NON-STREAMING ENDPOINT — POST /agent/multi/chat
// JSON response, mirrors /agent/chat shape so AgentPanel can drop-in.
// Same orchestrator + sub-agent logic, but no SSE (no-op send callback).
// ══════════════════════════════════════════════════════════════════════

router.post("/agent/multi/chat", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const budgetExceeded = () => Date.now() - startedAt > WALL_CLOCK_BUDGET_MS;

  // No-op send — no SSE here
  const noopSend = (_event: string, _data: any) => {};

  const allToolsUsed: string[] = [];
  const agentsUsed: AgentName[] = [];
  const iterCounts: Record<string, number> = { orchestrator: 0, stok: 0, planlama: 0, istihbarat: 0, aksiyon: 0 };

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
        console.warn("[agent-multi/chat] Wall-clock budget exceeded, forcing synthesis");
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

        const result = await runSubAgent(client, agentName, task, focusSku, shared, noopSend);

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

    // ── Fire-and-forget: TVT + ADM logging ──
    const usage = orchResponse.usage;
    if (usage) {
      logTokenInteraction({
        interactionType: "agent_multi_chat",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
        queryCategory: classifyQuery(message, allToolsUsed),
        actor: "ceo_agent",
      });
    }
    if (synthesisUsage) {
      logTokenInteraction({
        interactionType: "agent_multi_chat",
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
    console.error("[agent-multi/chat] Error:", err?.status, err?.message);
    res.status(500).json({
      error: err?.status === 429
        ? "API limiti aşıldı. Birkaç saniye bekleyin."
        : err?.error?.message || err?.message || "Orkestratör hatası",
    });
  }
});

export default router;
