import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const SYSTEM_PROMPT = `Sen Griseus AI Assistant'sın. Çukurova Isı Sistemleri'nin operasyonel verilerine erişimin var.
Gerçek veritabanı verisiyle cevap ver, tahmin yapma. Türkçe cevap ver.
Kullanıcı sana üretim, kapasite, personel, darboğaz, planlama hakkında sorular soracak.
Her cevabında veriyi kaynak göster.
Markdown formatı kullanma. Düz Türkçe yaz, kısa ve net cevap ver. Başlık yerine doğal dil kullan.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_dashboard_summary",
    description: "Toplam üretim, hat bilgileri, aylık veriler, kapasite metrikleri",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "simulate_capacity",
    description: "What-if kapasite simülasyonu. Parametre değiştir, etkiyi gör",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
        worker_count: { type: "number", description: "Çalışan sayısı" },
        unit_time_min: { type: "number", description: "Birim üretim süresi (dk)" },
        daily_hours: { type: "number", description: "Günlük çalışma saati" },
      },
      required: ["line_id"],
    },
  },
  {
    name: "analyze_bottleneck",
    description: "Hat bazlı darboğaz analizi. Plan vs gerçek sapma, kritik haftalar, trend",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
      },
      required: ["line_id"],
    },
  },
  {
    name: "analyze_workforce_risk",
    description: "Personel bağımlılık riski. Tek kişiye bağlı yetkiler, kritik çalışanlar",
    input_schema: {
      type: "object" as const,
      properties: {
        facility_id: { type: "number", description: "Tesis ID" },
      },
      required: ["facility_id"],
    },
  },
  {
    name: "get_trust_score",
    description: "Çalışan güvenilirlik skoru",
    input_schema: {
      type: "object" as const,
      properties: {
        worker_id: { type: "number", description: "Çalışan ID" },
      },
      required: ["worker_id"],
    },
  },
  {
    name: "forecast_weekly",
    description: "Haftalık üretim tahmini. Plan gir, motor tahmin yap",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
        planned_qty: { type: "number", description: "Planlanan miktar" },
      },
      required: ["line_id", "planned_qty"],
    },
  },
  {
    name: "get_workers",
    description: "Çalışan listesi, departmanlar, yetkiler",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_schedules",
    description: "Haftalık plan vs gerçek çizelgeler",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
      },
      required: ["line_id"],
    },
  },
];

// Internal API base — calls back to our own server
function getBaseUrl(req: Request): string {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}`;
}

async function callTool(toolName: string, input: Record<string, any>, baseUrl: string): Promise<any> {
  let url: string;
  let method = "GET";
  let body: string | undefined;

  switch (toolName) {
    case "get_dashboard_summary":
      url = `${baseUrl}/api/v1/dashboard/summary`;
      break;
    case "simulate_capacity":
      url = `${baseUrl}/api/v1/simulate/capacity`;
      method = "POST";
      body = JSON.stringify(input);
      break;
    case "analyze_bottleneck":
      url = `${baseUrl}/api/v1/analyze/bottleneck/${input.line_id}`;
      break;
    case "analyze_workforce_risk":
      url = `${baseUrl}/api/v1/analyze/workforce-risk/${input.facility_id}`;
      break;
    case "get_trust_score":
      url = `${baseUrl}/api/v1/score/trust/${input.worker_id}`;
      break;
    case "forecast_weekly":
      url = `${baseUrl}/api/v1/forecast/weekly`;
      method = "POST";
      body = JSON.stringify(input);
      break;
    case "get_workers":
      url = `${baseUrl}/api/v1/workers`;
      break;
    case "get_schedules":
      url = `${baseUrl}/api/v1/schedules?line_id=${input.line_id}`;
      break;
    default:
      return { error: `Unknown tool: ${toolName}` };
  }

  const resp = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : {},
    body,
  });
  return resp.json();
}

router.post("/agent/chat", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "API key eksik. ANTHROPIC_API_KEY ortam değişkenini yapılandırın." });
    }

    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message alanı gereklidir." });
    }

    const client = new Anthropic({ apiKey });
    const baseUrl = getBaseUrl(req);

    // Build messages from history + new message
    const messages: Anthropic.MessageParam[] = [
      ...(history || []).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const toolsUsed: string[] = [];

    // Initial Claude call
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Tool-use loop: keep going while Claude wants to call tools
    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter(
        (b): b is Anthropic.ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        toolsUsed.push(toolBlock.name);
        try {
          const result = await callTool(toolBlock.name, toolBlock.input as Record<string, any>, baseUrl);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: err.message || "Tool execution failed" }),
            is_error: true,
          });
        }
      }

      // Continue conversation with tool results
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    }

    // Extract final text response
    const textBlock = response.content.find((b) => b.type === "text");
    const responseText = textBlock && "text" in textBlock ? textBlock.text : "Cevap üretilemedi.";

    res.json({
      response: responseText,
      tools_used: toolsUsed,
    });
  } catch (err: any) {
    console.error("[agent/chat] Error:", err.message || err);
    res.status(500).json({ error: err.message || "AI Agent hatası" });
  }
});

export default router;
