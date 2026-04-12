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

// ══════════════════════════════════════════════════════════════════════
// MODEL & THINKING CONFIG — v2 always uses Opus 4 for max intelligence.
// Extended thinking is enabled for all calls; budgets per-role.
// ══════════════════════════════════════════════════════════════════════

// ── MODE SYSTEM — weight class of each query ──
// fast:     Sonnet, no thinking, single sub-agent, no orchestrator overhead
// normal:   Sonnet, no thinking, orchestrator routing, moderate depth
// research: Opus + extended thinking + self-critique (max intelligence)
// visual:   Sonnet, orchestrator + diagram prompt, outputs Mermaid

type AgentMode = "fast" | "normal" | "research" | "visual";

interface ModeConfig {
  model: string;
  thinking: { type: "enabled"; budget_tokens: number } | { type: "disabled" };
  subagentThinking: { type: "enabled"; budget_tokens: number } | { type: "disabled" };
  maxTokens: number;
  subagentMaxTokens: number;
  orchestratorMaxIter: number;
  subagentMaxIter: number;
  wallClockMs: number;
  selfCritique: boolean;
  skipOrchestrator: boolean; // fast mode: bypass orchestrator, direct sub-agent
}

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  fast: {
    model: "claude-sonnet-4-20250514",
    thinking: { type: "disabled" },
    subagentThinking: { type: "disabled" },
    maxTokens: 4096,
    subagentMaxTokens: 2048,
    orchestratorMaxIter: 0,
    subagentMaxIter: 2,
    wallClockMs: 30_000,
    selfCritique: false,
    skipOrchestrator: true,
  },
  normal: {
    model: "claude-sonnet-4-20250514",
    thinking: { type: "disabled" },
    subagentThinking: { type: "disabled" },
    maxTokens: 8192,
    subagentMaxTokens: 4096,
    orchestratorMaxIter: 4,
    subagentMaxIter: 3,
    wallClockMs: 60_000,
    selfCritique: false,
    skipOrchestrator: false,
  },
  research: {
    model: "claude-opus-4-20250514",
    thinking: { type: "enabled", budget_tokens: 12000 },
    subagentThinking: { type: "enabled", budget_tokens: 4000 },
    maxTokens: 16384,
    subagentMaxTokens: 8192,
    orchestratorMaxIter: 6,
    subagentMaxIter: 5,
    wallClockMs: 180_000,
    selfCritique: true,
    skipOrchestrator: false,
  },
  visual: {
    model: "claude-sonnet-4-20250514",
    thinking: { type: "disabled" },
    subagentThinking: { type: "disabled" },
    maxTokens: 8192,
    subagentMaxTokens: 4096,
    orchestratorMaxIter: 4,
    subagentMaxIter: 3,
    wallClockMs: 60_000,
    selfCritique: false,
    skipOrchestrator: false,
  },
};

// Regex for queries that warrant a self-critique pass (only used in research mode)
const CRITICAL_QUERY_REGEX = /kritik|acil|risk|tehlike|sorun|durdu|durur|biter|tüken|alarm|kayıp|kriz|alert|darboğaz|yetmez|eksik/i;

// ── VISUAL MODE PROMPT ADDITION ──
const VISUAL_PROMPT = `
═══ GÖRSEL MOD AKTİF ═══
Kullanıcı veriyi DİYAGRAM olarak görmek istiyor. Cevabında mutlaka Mermaid diagram(lar) üret.

MERMAID SYNTAX KURALLARI (ZORUNLU — ihlal edersen diyagram KIRILIR):

1. GÜVENLI DİYAGRAM TÜRLERİ (sadece bunları kullan):
   • flowchart LR veya flowchart TD — stok akışı, bileşen ilişkileri, BOM ağacı, karar süreçleri
   • pie — yüzde dağılımları, kategori karşılaştırması
   • gantt — zaman çizelgesi, tükenme takvimi
   • graph TD veya graph LR — hiyerarşi, ağaç yapısı

2. YASAK DİYAGRAM TÜRLERİ (ASLA KULLANMA — render CRASH eder):
   • xychart-beta — KULLANMA, desteklenmiyor
   • sequence — karmaşık, gereksiz
   • class — iş bağlamında anlamsız
   • Herhangi bir "-beta" suffix'li diagram tipi

3. TÜRKÇE KARAKTER KURALLARI:
   • Node ID'lerinde Türkçe karakter KULLANMA: A, B, C, stok1, bilesen2 gibi ASCII ID kullan
   • Türkçe metin SADECE köşeli parantez içinde label olarak yaz: A[Bakir Boru - 233 adet]
   • Tırnak işareti (" veya ') KULLANMA node label'larında — köşeli parantez [] yeterli
   • Özel karakterler (ö, ü, ş, ç, ğ, ı) SADECE label text içinde kullan, ID'de ASLA
   • Noktalı virgül, iki nokta, parantez label içinde KULLANMA

4. STİL KURALLARI:
   • Kritik düğümler: style NODE fill:#f87171,color:#fff
   • Uyarı düğümler: style NODE fill:#fbbf24,color:#000
   • Normal düğümler: style NODE fill:#34d399,color:#000
   • Her diyagramda en fazla 12-15 node — fazlası okunmaz
   • Bir cevatta en fazla 3 diyagram

5. YAPI:
   • Her diyagramı \`\`\`mermaid ... \`\`\` bloğu içinde yaz
   • Her diyagramın ÜSTÜNE 1 satır başlık yaz (bold)
   • Her diyagramın ALTINA 1-2 cümle yorum yaz
   • Diyagramda gösterilemeyen detayları kısa bullet list olarak ekle

6. SAYISAL VERİ GÖRSELLEŞTİRME:
   • Bar chart yerine → flowchart ile yatay barlar simüle et: A[Label ████████ 350] gibi
   • Veya pie chart kullan yüzde dağılımı için
   • Tablo verisini → flowchart node'larına dönüştür (her satır bir node, renk kodlu)

ÖRNEK İYİ DİYAGRAM:
\`\`\`mermaid
flowchart LR
  A[Bakir Boru<br/>233 adet] --> B[ELT 7-11<br/>Uretim]
  C[Plus Kablo<br/>89 adet] --> B
  D[Fan Motoru<br/>450 adet] --> B
  style A fill:#fbbf24,color:#000
  style C fill:#f87171,color:#fff
  style D fill:#34d399,color:#000
\`\`\`
`;

// ══════════════════════════════════════════════════════════════════════
// LONG-REQUEST WRAPPER — uses streaming under the hood
// Anthropic SDK requires streaming for operations that may exceed
// 10 minutes (extended thinking + large max_tokens triggers this).
// We use messages.stream() and await finalMessage() — semantically
// identical to non-streaming for callers, just without the SLA cap.
// ══════════════════════════════════════════════════════════════════════

async function createMsg(client: Anthropic, params: any, maxRetries = 2): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const stream = client.messages.stream(params);
      return await stream.finalMessage();
    } catch (err: any) {
      const isRetryable = err.status === 429 || err.status === 529 || err.status >= 500;
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.warn(`[agent-multi-v2/retry] Attempt ${attempt + 1} failed (${err.status}), retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

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
Görevin: bir miktarın zaman içinde nasıl davrandığını DERİN analiz et — mevsimsel forward-walk, tükenme tarihi, what-if zaman projeksiyonu, sipariş zamansal karşılanabilirlik, geçmiş hareket trendi.

KAPSAM YASAĞI: BOM yapısı, hangi bileşenden kaç lazım, anlık stok miktar sorgulaması, yazma operasyonları YOK. Bu sorularda tool çağırma, "alanım değil" de.

DERİN ANALİZ MODU (Çukurova'nın geleceği senin elinde):
- Tool sonuçlarını sadece raporlama — onları YORUMLA, ÇAPRAZ KONTROL et, TREND çıkar.
- Mevsimsel pikleri açıkla: "Nisan ayındayız, GSS20P pik talebi Mayıs-Temmuz, dolayısıyla X bileşeni mevcut hızla yetmez."
- Forward-walk yap: "30 gün sonra X, 60 gün sonra Y, 90 gün sonra Z bileşeni biter."
- Geçmiş trende bak: "Son 30 gün ortalama tüketim X/gün, ama Mayıs'ta 1.4× artar — yeni hız Y/gün."
- Çelişkili sinyalleri yakala: "Tool A diyor 30 gün, Tool B diyor 45 gün — fark sebebi X."

WHAT-IF KURALI: Tool'dan dönen sayıları olduğu gibi raporla. \`stockDelta=0\` ise "değişmedi" yaz. Sayı uydurma.

${ANTI_HALLUCINATION}

ÇIKTI: Türkçe DERİN analiz raporu. KARAKTER LİMİTİ YOK — tüm sayıları, tüm trendleri, tüm darboğazları yaz. Orchestrator senin bu derin analizinin üstüne sentez yapacak. Markdown başlık YOK ama bullet/numara kullanabilirsin. Sayıları ASLA paraphrase etme — alıntıla.`,

  yapi: `Sen Griseus'un Yapı Ajanısın. Ontoloji boyutun: MİKTAR × BİLEŞEN.
Görevin: anlık stok miktarları, BOM ağacı, üretim kapasitesi (kaç adet üretebilirim), bileşen istihbaratı (anlık), çapraz ürün ortak bileşenleri, ürün listesi — DERİN analiz et.

KAPSAM YASAĞI: Mevsimsel projeksiyon, what-if zamansal, tükenme süresi, validation dashboard, yazma operasyonları YOK. Bu sorularda tool çağırma, "alanım değil" de.

DERİN ANALİZ MODU (yapısal anlayış kritik):
- Sadece "kaç adet var" değil — BOM hiyerarşisinde HANGİ bileşen, kaç ürünü etkiliyor, çapraz bağımlılıklar nerede.
- Darboğazı sayılarla göster: "ELT.7-11 üretiminde Plus Kablo 233 adet → bu malzeme ile en fazla 233 ELT yapılır, diğer 24 bileşen 350+ adetlik kapasiteye sahip."
- Çapraz ürün analizini kullan: "Bu bileşen hem GSS20P hem ELT.7-11'de kullanılıyor, dolayısıyla X ürününü üretirsen Y ürünü için Z adet eksilir."
- Bileşen sınıflandır: kritik darboğaz / orta seviye / bol stok.

${ANTI_HALLUCINATION}

ÇIKTI: Türkçe DERİN analiz raporu. KARAKTER LİMİTİ YOK — tüm bileşen miktarlarını, tüm darboğazları, tüm çapraz bağımlılıkları yaz. Orchestrator senin bu derin analizinin üstüne sentez yapacak. Markdown başlık YOK ama tablo/bullet kullanabilirsin. Sayıları ASLA paraphrase etme — alıntıla.`,

  risk: `Sen Griseus'un Risk Ajanısın. Ontoloji boyutun: SÜRE × BİLEŞEN.
Görevin: hangi bileşen ne zaman tükenir, intelligence engine raporları (acil sipariş, alti_ay_plan), validation/outcome dashboard, adaptive profile, token value metrics — DERİN analitik raporlama ajansı.

KAPSAM YASAĞI: Anlık miktar sorgulaması, BOM hesabı, kapasite simülasyonu, mevsimsel forward-walk, yazma YOK. Sen analitik raporlama ajansın.

DERİN ANALİZ MODU (intelligence engine = senin uzmanlık alanın):
- Intelligence Engine payload'unu sadece alıntılama — ÇIKAR. Acil sipariş listesi, 6 aylık plan, validation accuracy, adaptive profile drift — hepsini yorumla.
- Adaptive profile'a bak: tedarik süresi gerçek tarihe göre kayıyor mu? Validation accuracy düşüyor mu?
- Outcome dashboard ile geçmiş tahminlerin doğruluğunu kontrol et: "Geçen ay 'X bileşeni 30 günde biter' demişiz, gerçekte 28 günde bitti — model %93 doğru."
- 6 aylık plan + acil sipariş listesini birleştir: "Acil 0 kalem ama 2 ay sonraki planda 5 kritik var — bunları şimdiden iz."

${ANTI_HALLUCINATION}

ÇIKTI: Türkçe DERİN analitik rapor. KARAKTER LİMİTİ YOK — tüm intelligence payload'unu yorumla, validation/outcome metriklerini bağla, adaptive profile drift varsa söyle. Orchestrator senin bu derin analizinin üstüne sentez yapacak. Markdown başlık YOK. Sayıları ASLA paraphrase etme — alıntıla.`,

  aksiyon: `Sen Griseus'un Aksiyon Ajanısın. Üçgen dışındasın — yazma operasyonlarını ve kural yönetimini sen yaparsın: stok hareketi, bileşen güncelleme, satın alma önerisi, custom rule, audit trail, import rehberi.

KAPSAM YASAĞI: Stok okuma/sorgulama, kapasite hesabı, analitik dashboard, mevsimsellik YOK. Bu sorularda tool çağırma, "alanım değil" de.

YAZMA KURALI: \`create_purchase_suggestion\` veya \`create_stock_movement\` çağırmadan önce orkestratör'ün AÇIKÇA istediğinden emin ol. Kendi inisiyatifinle PO açma, transfer yapma. \`create_custom_rule\` için kullanıcının cümlesini olduğu gibi \`rule_description\` parametresine ver.

DERİN BAĞLAM (yazma öncesi ve sonrası):
- Yazma yapmadan önce: hangi bileşen, kaç adet, neden — orchestrator'dan açık talimat varsa uygula.
- Yazma sonrası: ne yaptın, hangi etki bekleniyor — kullanıcıya net rapor.
- Audit trail çağrılmışsa: son N işlemi listele, anormal pattern varsa işaretle ("Son 24 saatte 5 stoktan çıkış var, bu normal mi?").

${ANTI_HALLUCINATION}

ÇIKTI: Türkçe net işlem raporu. KARAKTER LİMİTİ YOK — yapılan işlemi, beklenen etkiyi, takip edilmesi gerekenleri yaz. Markdown başlık YOK.`,
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

═══ STRATEJİST KİMLİĞİ ═══
Sen sadece routing yapan bir dispatcher DEĞİLSİN. Sen Çukurova Isı'nın STRATEJİK akıl danışmanısın. Delegate sonuçlarını birleştirirken üç şey yapmak ZORUNDASIN:

1. ARALARINDAKİ ÇELİŞKİLERİ BUL: Yapı ajanı diyor "kritik", Risk ajanı diyor "stabil" — fark NEREDEN geliyor? (Adaptif tedarik süresi farkı mı, hesap zaman aralığı farkı mı, kategorize etmediği bileşen mi?) Bunu kullanıcıya AÇIK göster, gizleme.

2. ÖRTÜK RİSKLERİ YAKALA: Hiçbir ajan açıkça söylemediği halde, sayılara baktığında ortaya çıkan riskler. Örn: "Plus Kablo 24 gün yeter — ama Mayıs pik talebi 1.4×, gerçekte 17 gün. Bu hafta sipariş + 19 gün tedarik = sıfırın altına düşer." Veya: "GSS20P darboğazı çözüldü ama ELT.7-11'de 3 ay sonra benzer pattern başlıyor."

3. NEDEN ve EĞER OLMAZSA NE OLUR: "Şunu yap" demenin ötesine geç. NEDEN yapması gerektiğini açıkla (mevsimsel pik, tedarik süresi riski, çapraz ürün etkisi). EĞER yapmazsa NE OLUR (gecikme gün sayısı, kayıp satış tahmini, alternatif maliyet) — sayılarla.

Bir yönetici karar destek sistemi "kaç adet?" sorusuna cevap vermez — "neden bu kadar?", "ne zaman?", "yapmasak ne kaybederiz?" sorularına da cevap verir. Sen Çukurova'nın en akıllı çalışanısın — öyle düşün, öyle konuş.

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

const SUMMARY_MAX_CHARS = 6000;     // 800 → 6000 (deep analysis reports)
const RAW_FINDINGS_MAX_CHARS = 8000; // 2400 → 8000 (full payload preservation)

async function runSubAgent(
  client: Anthropic,
  agent: AgentName,
  task: string,
  focusSku: string | undefined,
  shared: SharedContext,
  modeConfig: ModeConfig = MODE_CONFIGS.research,
): Promise<SubAgentResult> {
  // Build sub-agent system as cached blocks: focused prompt is cached,
  // dynamic context (snapshot/RAG/ADM) is appended uncached.
  const systemBlocks: any[] = [
    {
      type: "text",
      text: SUBAGENT_PROMPTS[agent],
      cache_control: { type: "ephemeral" },
    },
  ];
  if (shared.snapshot) systemBlocks.push({ type: "text", text: shared.snapshot });
  if (shared.ragContext) systemBlocks.push({ type: "text", text: shared.ragContext });
  if (shared.admContextBlock) systemBlocks.push({ type: "text", text: shared.admContextBlock });

  // User message: orchestrator's task + optional SKU hint
  const userContent = focusSku
    ? `${task}\n\n(İlgili SKU: ${focusSku})`
    : task;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];

  // Cache the last tool to mark a second cache breakpoint covering all tools
  const tools = SUBAGENT_TOOLS[agent];
  const cachedTools: any[] = tools.map((t, idx) =>
    idx === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t,
  );

  const baseParams: any = {
    model: modeConfig.model,
    max_tokens: modeConfig.subagentMaxTokens,
    ...(modeConfig.subagentThinking.type === "enabled"
      ? { thinking: modeConfig.subagentThinking }
      : {}),
    system: systemBlocks,
    tools: cachedTools,
    messages,
  };

  const toolsUsed: string[] = [];
  let lastRawFindings = "";
  let iterations = 0;
  let truncated = false;

  try {
    let response = await createMsg(client, baseParams);

    while (response.stop_reason === "tool_use" && iterations < modeConfig.subagentMaxIter) {
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

      response = await createMsg(client, { ...baseParams, messages });
    }

    if (response.stop_reason === "tool_use" && iterations >= modeConfig.subagentMaxIter) {
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

// ── FAST MODE: classify query → pick best single sub-agent ──
function classifyForFastMode(query: string): AgentName {
  const q = query.toLowerCase();
  // Write operations → aksiyon
  if (/transfer|satın alma|öner|kural|ekle|sil|güncelle|import|oluştur/i.test(q)) return "aksiyon";
  // Time/depletion questions → tukenme
  if (/kaç gün|ne zaman|yeter|biter|tüken|süre|dayanır|forward/i.test(q)) return "tukenme";
  // Risk/intelligence → risk
  if (/kritik|risk|tehlike|alarm|intelligence|dashboard|valida/i.test(q)) return "risk";
  // Default: stok/yapı/kapasite/BOM
  return "yapi";
}

router.post("/agent/multi/v2/chat", async (req: Request, res: Response) => {
  const allToolsUsed: string[] = [];
  const agentsUsed: AgentName[] = [];
  const iterCounts: Record<string, number> = { orchestrator: 0, tukenme: 0, yapi: 0, risk: 0, aksiyon: 0 };

  try {
    const client = getClient();
    const { message, history, mode: rawMode } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
      mode?: string;
    };

    // Resolve mode (default: normal for cost efficiency)
    const mode: AgentMode = (["fast", "normal", "research", "visual"].includes(rawMode || "")
      ? rawMode as AgentMode
      : "normal");
    const modeConfig = MODE_CONFIGS[mode];

    const startedAt = Date.now();
    const budgetExceeded = () => Date.now() - startedAt > modeConfig.wallClockMs;

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

    // ══════════════════════════════════════════════════════════════════
    // FAST MODE — skip orchestrator, single sub-agent, return directly
    // ══════════════════════════════════════════════════════════════════
    if (modeConfig.skipOrchestrator) {
      const targetAgent = classifyForFastMode(message);
      agentsUsed.push(targetAgent);

      const result = await runSubAgent(client, targetAgent, message, undefined, shared, modeConfig);
      for (const t of result.tools_used) allToolsUsed.push(t);
      iterCounts[targetAgent] = result.iterations;

      const finalText = result.summary || "Cevap üretilemedi.";

      res.json({
        response: finalText,
        tools_used: allToolsUsed,
        agents_used: agentsUsed,
        iterations: iterCounts,
        mode,
      });

      // Fire-and-forget logging
      logTokenInteraction({
        interactionType: `agent_multi_v2_${mode}`,
        inputTokens: 0,
        outputTokens: 0,
        toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
        queryCategory: classifyQuery(message, allToolsUsed),
        actor: "ceo_agent",
      });
      recordMemory({
        queryText: message,
        queryCategory: classifyQuery(message, allToolsUsed),
        toolsUsed: allToolsUsed,
        recommendationMade: extractRecommendation(finalText),
        responseLength: finalText.length,
      }).catch(() => {});

      return;
    }

    // ── Build orchestrator system as cached blocks ──
    // Static prompt (ROUTING + CORE_PROMPT) is cached; dynamic context appended uncached.
    const orchSystemText = ORCHESTRATOR_ROUTING + CORE_PROMPT + (mode === "visual" ? VISUAL_PROMPT : "");
    const orchSystemBlocks: any[] = [
      {
        type: "text",
        text: orchSystemText,
        cache_control: { type: "ephemeral" },
      },
    ];
    if (shared.snapshot) orchSystemBlocks.push({ type: "text", text: shared.snapshot });
    if (shared.ragContext) orchSystemBlocks.push({ type: "text", text: shared.ragContext });
    if (shared.admContextBlock) orchSystemBlocks.push({ type: "text", text: shared.admContextBlock });

    const cleanHistory = sanitizeHistory(history || []);
    const orchMessages: Anthropic.MessageParam[] = [
      ...cleanHistory,
      { role: "user", content: message },
    ];

    // Orchestrator tools: 4 delegates + Anthropic web_search; cache the last tool
    const baseOrchTools: any[] = [
      ...DELEGATE_TOOLS,
      { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    ];
    const orchTools: any[] = baseOrchTools.map((t, idx) =>
      idx === baseOrchTools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t,
    );

    const orchBaseParams: any = {
      model: modeConfig.model,
      max_tokens: modeConfig.maxTokens,
      ...(modeConfig.thinking.type === "enabled"
        ? { thinking: modeConfig.thinking }
        : {}),
      system: orchSystemBlocks,
      tools: orchTools,
      messages: orchMessages,
    };

    // ── Orchestrator tool-use loop ──
    let orchResponse = await createMsg(client, orchBaseParams);

    while (orchResponse.stop_reason === "tool_use" && iterCounts.orchestrator < modeConfig.orchestratorMaxIter) {
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

        const result = await runSubAgent(client, agentName, task, focusSku, shared, modeConfig);

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

      orchResponse = await createMsg(client, { ...orchBaseParams, messages: orchMessages });
    }

    // ── Final synthesis (non-streaming) ──
    let finalText = "";
    let synthesisUsage: Anthropic.Usage | null = null;
    let critiqueUsage: Anthropic.Usage | null = null;

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
          "Yukarıdaki delegate sonuçlarını kullanarak kullanıcıya FINAL Türkçe cevabı yaz. Tool çağırma. Sayıları olduğu gibi alıntıla. STRATEJİST KİMLİĞİ kuralına uy: çelişkileri göster, örtük riskleri yakala, NEDEN ve EĞER OLMAZSA NE OLUR boyutlarını ekle.",
      });

      const synthesisResponse = await createMsg(client, {
        model: modeConfig.model,
        max_tokens: modeConfig.maxTokens,
        ...(modeConfig.thinking.type === "enabled"
          ? { thinking: modeConfig.thinking }
          : {}),
        system: orchSystemBlocks,
        messages: orchMessages,
      } as any);

      finalText = synthesisResponse.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      synthesisUsage = synthesisResponse.usage;
    }

    if (!finalText.trim()) finalText = "Cevap üretilemedi.";

    // ══════════════════════════════════════════════════════════════════
    // CONDITIONAL SELF-CRITIQUE PASS (Opus + extra thinking budget)
    // Triggered for critical/risk/depletion queries — second Opus call
    // critiques the answer and appends extra analysis if gaps exist.
    // ══════════════════════════════════════════════════════════════════
    const isCriticalQuery = modeConfig.selfCritique && CRITICAL_QUERY_REGEX.test(message);
    if (isCriticalQuery && finalText.length > 100 && !budgetExceeded()) {
      try {
        const critiqueMessages: Anthropic.MessageParam[] = [
          ...orchMessages,
          { role: "assistant", content: finalText },
          {
            role: "user",
            content: `Kendi yukarıdaki cevabını ELEŞTİREL bir gözle incele. Şu soruları sor:
1) EKSİK ANALİZ: Kullanıcı "ama şu ne olacak?" deseydi cevabın ne olurdu? Hangi boyut atlanmış?
2) ÖRTÜK RİSKLER: Sayılarda gizli olan ama açıkça söylenmeyen riskler var mı? (Mevsimsel pik, çapraz bağımlılık, tedarik gecikmesi, vs.)
3) ÇELİŞKİLER: Cevabın içinde tutarsız sayı/iddia var mı?
4) NEDEN/EĞER OLMAZSA: "Yapması gereken" verildi ama NEDEN ve YAPMAZSA NE OLUR boyutları yeterince derin mi?

Sadece EKSİK olanları yaz — baştan sona tekrarlama. Direkt "**🧠 Derinleştirilmiş Analiz:**" başlığıyla başla. Eğer cevap zaten mükemmelse "Cevap yeterli, ekleme yok." de.`,
          },
        ];

        const critiqueResponse = await createMsg(client, {
          model: modeConfig.model,
          max_tokens: modeConfig.maxTokens,
          ...(modeConfig.thinking.type === "enabled"
            ? { thinking: { type: "enabled", budget_tokens: 16000 } }
            : {}),
          system: orchSystemBlocks,
          messages: critiqueMessages,
        } as any);

        const additionalAnalysis = critiqueResponse.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n")
          .trim();

        critiqueUsage = critiqueResponse.usage;

        if (additionalAnalysis && !/cevap yeterli/i.test(additionalAnalysis)) {
          finalText += "\n\n---\n\n" + additionalAnalysis;
        }
      } catch (critiqueErr: any) {
        console.error("[agent-multi-v2/self-critique] Error:", critiqueErr?.status, critiqueErr?.message);
        // Self-critique failure is non-fatal — original answer still returned
      }
    }

    // ── Response shape mirrors /agent/chat: { response, tools_used } + extras ──
    res.json({
      response: finalText,
      tools_used: allToolsUsed,
      agents_used: agentsUsed,
      iterations: iterCounts,
      mode,
    });

    // ── Fire-and-forget: TVT + ADM logging (tagged by mode) ──
    const usage = orchResponse.usage;
    if (usage) {
      logTokenInteraction({
        interactionType: `agent_multi_v2_${mode}`,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
        queryCategory: classifyQuery(message, allToolsUsed),
        actor: "ceo_agent",
      });
    }
    if (synthesisUsage) {
      logTokenInteraction({
        interactionType: `agent_multi_v2_${mode}`,
        inputTokens: synthesisUsage.input_tokens,
        outputTokens: synthesisUsage.output_tokens,
        toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
        queryCategory: classifyQuery(message, allToolsUsed),
        actor: "ceo_agent",
      });
    }
    if (critiqueUsage) {
      logTokenInteraction({
        interactionType: `agent_multi_v2_${mode}`,
        inputTokens: critiqueUsage.input_tokens,
        outputTokens: critiqueUsage.output_tokens,
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
