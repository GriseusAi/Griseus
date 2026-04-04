/**
 * Natural Language Rules Parser
 * Türkçe iş kurallarını Claude API ile yapılandırılmış kurallara çevirir.
 *
 * Örnek: "Kış aylarında güvenlik stoku %50 artır"
 * → { type: "seasonal_modifier", months: [11,0,1], field: "safety_stock", modifier: 1.5 }
 */
import Anthropic from "@anthropic-ai/sdk";

export interface ParsedRule {
  type: "threshold" | "seasonal_modifier" | "trigger_action" | "monitor";
  // threshold: stok < X ise uyar
  // seasonal_modifier: mevsimsel ayarlama
  // trigger_action: koşul gerçekleşince aksiyon öner
  // monitor: sürekli izle ve raporla
  condition: {
    field: string; // "stock" | "capacity" | "burn_rate" | "days_to_stockout" | "safety_stock"
    operator: "lt" | "gt" | "eq" | "between"; // <, >, =, aralık
    value: number;
    value2?: number; // "between" için
    componentCode?: string; // belirli bileşen (opsiyonel, boşsa tümü)
    months?: number[]; // 0-indexed ay listesi (mevsimsel kurallar için)
  };
  action: {
    type: "alert" | "purchase_suggestion" | "modify_safety_stock" | "notify";
    severity: "critical" | "warning" | "info";
    message: string; // Türkçe uyarı mesajı
    modifier?: number; // çarpan (ör. 1.5 = %50 artır)
    quantity?: number; // miktar
  };
  explanation: string; // Kuralın Türkçe açıklaması
}

const PARSER_PROMPT = `Sen bir Türkçe iş kuralı ayrıştırıcısısın. Kullanıcının doğal dilde yazdığı stok/üretim kurallarını yapılandırılmış JSON'a çeviriyorsun.

BAĞLAM:
- ELT 7-11 cihazı üretimi, 43 bileşenli BOM reçetesi
- Bileşen kodları: 27.xxx formatında (ör. 27.031 Paslanmaz Reflektör Tutucu)
- Mevsimsel talep: Oca:340, Şub:278, Mar:131, Nis:222, May:162, Haz:234, Tem:108, Ağu:269, Eyl:98, Eki:169, Kas:22, Ara:325
- Kış ayları: Kasım(10), Aralık(11), Ocak(0), Şubat(1) — 0-indexed
- Yaz ayları: Haziran(5), Temmuz(6), Ağustos(7)
- Tedarik süresi: 14 gün

KURAL TİPLERİ:
1. threshold — "X bileşenin stoku Y'nin altına düşerse uyar"
2. seasonal_modifier — "Kış aylarında güvenlik stoku %50 artır"
3. trigger_action — "Kapasite 50'nin altına düşünce sipariş oluştur"
4. monitor — "Her hafta darboğaz bileşeni raporla"

ÇIKTI FORMATI (sadece JSON, açıklama yok):
{
  "type": "threshold|seasonal_modifier|trigger_action|monitor",
  "condition": {
    "field": "stock|capacity|burn_rate|days_to_stockout|safety_stock",
    "operator": "lt|gt|eq|between",
    "value": number,
    "value2": number (opsiyonel),
    "componentCode": "27.xxx" (opsiyonel, yoksa null),
    "months": [0-11 indeksli ay listesi] (opsiyonel, yoksa null)
  },
  "action": {
    "type": "alert|purchase_suggestion|modify_safety_stock|notify",
    "severity": "critical|warning|info",
    "message": "Türkçe uyarı mesajı",
    "modifier": number (opsiyonel, çarpan),
    "quantity": number (opsiyonel)
  },
  "explanation": "Bu kuralın ne yaptığının Türkçe açıklaması"
}

Sadece JSON döndür, başka bir şey yazma.`;

export async function parseNaturalLanguageRule(nlText: string): Promise<{
  success: boolean;
  parsed?: ParsedRule;
  error?: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { success: false, error: "ANTHROPIC_API_KEY tanımlı değil" };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: PARSER_PROMPT,
      messages: [{ role: "user", content: nlText }],
    });

    const text = response.content.find(c => c.type === "text")?.text;
    if (!text) return { success: false, error: "API'den cevap alınamadı" };

    // JSON parse — bazen markdown code block içinde gelebilir
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr) as ParsedRule;

    // Temel validasyon
    if (!parsed.type || !parsed.condition || !parsed.action) {
      return { success: false, error: "Ayrıştırılan kural eksik alanlar içeriyor" };
    }

    return { success: true, parsed };
  } catch (err: any) {
    return { success: false, error: `Kural ayrıştırma hatası: ${err.message}` };
  }
}
