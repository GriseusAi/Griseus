import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

const CHART_SYSTEM_PROMPT = `Sen Griseus Çukurova Isı'nın HVAC üretim verilerinden chart spec üreten bir asistansın. Kullanıcı bir prompt yazar (örn "önümüzdeki 6 ay forecast", "mevsimsel üretim hedefi"). Sen 4 BH cihazı ve seçili bileşenler hakkında bilgi alırsın. Sadece JSON döndür — başka hiçbir text üretme.

JSON şeması (TAM uyum, fazla key ekleme):
{
  "chartSpec": {
    "type": "line" | "bar" | "area" | "pie",
    "title": "kısa başlık",
    "xKey": "kategori veya zaman alanı (örn 'month', 'sku')",
    "yLabel": "Y ekseni etiketi",
    "series": [
      { "key": "veri_anahtarı", "label": "Görünen ad", "color": "#hex" }
    ],
    "data": [
      { "<xKey>": "Oca", "seri1_key": 120, "seri2_key": 80 }
    ]
  },
  "plan": {
    "title": "Aksiyon başlığı",
    "bullets": [
      "Adım 1: ...",
      "Adım 2: ..."
    ]
  }
}

Kurallar:
- Renkler: Anthropic clay paletinden seç → primary "#D97757", secondary "#2D72D2", tertiary "#238551", danger "#CD4246", warn "#C87619"
- Sayılar realistik olsun: gerçek HVAC üretim değerleri (10-2000 adet aralığı)
- Forecast için: mevsimsel pik sıcak aylarda (Ara-Şub), düşük yaz aylarında (Tem-Ağu)
- 6 ay forecast → 6 data point; yıllık → 12; 4 cihaz → 4 series veya 4 bar
- Pie chart için: type="pie", series: [{ key: "value", label: "...", color: "..." }], data: [{name: "X", value: 30}]
- Plan: 3-5 madde, kısa ve aksiyon-odaklı

Stil: net, profesyonel, Palantir/Foundry vibe`;

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { prompt, items, context } = req.body ?? {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt zorunlu" });
    }

    const itemsBrief = Array.isArray(items)
      ? items.slice(0, 12).map((i: any) => ({
          code: i.code,
          kind: i.kind,
          label: i.label,
          status: i.status,
          stock: i.currentStock,
          burn: i.dailyBurnRate,
          daysLeft: i.daysLeft,
          shared: i.isShared,
          bottleneck: i.isBottleneck,
        }))
      : [];

    const client = getClient();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: CHART_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Seçili öğeler:
${JSON.stringify(itemsBrief, null, 2)}

${context ? `Bağlam: ${JSON.stringify(context)}` : ""}

Kullanıcı isteği: ${prompt}

Sadece geçerli JSON döndür.`,
        },
      ],
    });

    const text =
      response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim() ?? "";

    let parsed: any;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch (e) {
      return res.status(502).json({ error: "AI çıktısı parse edilemedi", raw: text });
    }

    if (!parsed?.chartSpec || !parsed.chartSpec.type) {
      return res.status(502).json({ error: "Eksik chartSpec", raw: text });
    }

    return res.json(parsed);
  } catch (err: any) {
    console.error("[chart/generate] error:", err);
    return res.status(500).json({ error: err?.message ?? "internal error" });
  }
});

export default router;
