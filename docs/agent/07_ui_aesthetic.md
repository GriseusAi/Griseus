# 07 — UI Aesthetic & Patterns

## Tasarıma Dokunma

Mevcut sayfa tasarımları, renkler, layout'lar **DEĞİŞTİRİLMEZ**.

- Backend motorunu güçlendir, kasayı değiştirme
- Yeni UI eklerken mevcut tasarım diline uy
- Sayfaların görünümü, renkleri, layout'u aynı kalacak
- Minimal eklemeler (örn ImpactInsightPanel) OK — küçük, mevcut stile uyumlu paneller

## claude.ai Aesthetic — KİLİTLİ (2026-04-30)

> "Tüm sistem claude.ai stilinin aynısı/klonu olacak."

Light cream bg + dark text + minimal kart kenarı + Anthropic muted-orange accent.

### Palette

```ts
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";

CT.bg            = "#faf9f5"  // ana arka plan
CT.bgAlt         = "#f5f3ec"  // sidebar, cream'den biraz koyu
CT.surface       = "#ffffff"  // kart yüzey
CT.surfaceHover  // hover bg
CT.ink           = "#141413"  // ana metin
CT.inkSub        = "#605e57"  // ikincil metin
CT.accent        = "#c96442"  // muted-orange (Anthropic)
CT.borderStrong  // güçlü kenarlık

// Status (muted)
CT.ok    = "#3f8f5b"
CT.warn  = "#b8761c"
CT.err   = "#b34037"
CT.info  = "#3d6fb0"
```

### Font

- Body: Inter (`CT_FONT`)
- Mono: JetBrains Mono (`CT_MONO`)

### Yasaklar

- ASLA hard-coded `#050505` / `#0e0e14` dark bg yazma
- Local `const C = {...}` tanımı yapma → `CT` import et, gerekirse alias (`const C = { surface: CT.surface, ... }`)
- Eski "siyah kart locked" pattern artık GEÇERSİZ (feedback_canvas_aesthetic deprecated)

### Hover Pattern

```ts
hover: {
  background: CT.surfaceHover,
  border: CT.borderStrong,
  transform: "translateY(-1px)"
}
```

## Yarımamül Drill-Down (TÜM Canvas/Whiteboard'da Standart)

> Defalarca söylendi — bh-ontology pattern her canvas'ta aynısı.

### Şekil

- **Yarımamül** (`isSubAssembly: true` veya `hasChildren: true`) → **DAİRE**
- **Flat** (alt bileşeni olmayan) → dikdörtgen kart

### Drill-Down Davranışı

```
[Daire (yarımamül)]  ── tıkla ──>  daire açılır
                                    │
                                    ▼
                          alt bileşen kartları yan/alt
                          dashed edge ile bağlı
                                    │
                                  tekrar tıkla → kapanır
```

- State: `Record<contextId, Set<componentCode>>` localStorage'da persist
- API: `/api/bom/:sku/stock` zaten `children: BomComponent[]` döner
- Click handler: drag'le çakışmasın → pointer move < 5px = tap
- Recursive: alt bileşenin de altı varsa (Tier 2C) o da daire, tıklanır, açılır

### Referans Implementasyon

`client/src/pages/bh-ontology.tsx` — `expandedSubs`, `toggleExpanded`, `collectChildrenRecursive`. Yeni canvas/whiteboard sayfaları bunu birebir kopyalamalı.

## Strategy Canvas (`/ontology`) — Özel Kurallar

### Overlay Panel YASAK

`/ontology` route'unda sabit-konum overlay panel (sağ alt SelectionPanel vb.) **gösterilmez**. Diğer sayfalarda kalır, sadece `/ontology`'de `return null`.

Aksiyonlar **komut bar'a slash komut olarak** taşınır:

```ts
COMMAND_DEFS = [
  { name: "/siparis", aliases: [...], description, minSelected, steps, apply },
  { name: "/teslim", ... },
  { name: "/uretim", ... },
  { name: "/uretim-hatti", ... },
  { name: "/sil", ... },
  { name: "/gix", ... },          // AI çağrısı
  { name: "/diyagram-ciz", ... }, // Mermaid render
];
```

### Atom Altı Badge YASAK

> "Altlarındaki o iğrenç kutular gidecek, sil hafızandan."

Strateji canvas'ta atom kutularının altına meta badge (#orderNumber, ×quantity overlay) **EKLEME**.

- **Adet** → edge label içinde (`x{qty}` — örn `x300`)
- **Tarih/süre** → ayrı bir pill atom (deadline-pill, lead-pill) + ok ile bağlı
- **Pill konumu:** kategori parent ise altında stack; mamul/müşteri parent ise solunda
- ASLA `atomMeta`'dan render'a meta-overlay span basma. `atomMeta` sadece pill ID/değeri tutmak için var

### `/siparis` Komutu — G2/G3 Pattern

Müşteri kutusundan **İKİ ok** çıkar:

```
[Müşteri]
   │  ── (x{adet} kategori rengi) ──>  [Kategori]
   │
   └──> (teslim, dashed mavi) ──>  [Teslim Pill]  (kategori altında stack)
```

1. **Adet ok'u** → KATEGORİ
   - Label: `x{adet}`
   - Color: kategori rengi (Gazlı=`#38bdf8` mavi, Elektrikli=`#10b981` yeşil)
2. **Teslim ok'u** → TESLİM PILL
   - Stil: mavi, dashed
   - Pill konumu: kategori altında stack (multi-delivery destek)
   - Pill edge: her zaman MÜŞTERİ atomuna gider, kategoriye DEĞİL

### Pill ID Konvansiyonu

```
pill-d-{customerId}-{rand}
```

(edge target identify eder)

### Helpers

```ts
addEdge(customerId, categoryId, "x{qty}", color);
ensureDeadlinePill(categoryId, deadline, customerId);
```

Multi-delivery: kategori altına stack, `atomMeta`'ya overwrite etme.

Müşteri seçili değilse: kategori-fallback (eski davranış), ama default = müşteri-merkezli iki ok.

Aynı kural diğer "siparişle ilgili" pill'ler için (üretim süresi, lead-time, status). Mamul'a özel pill'ler (örn üretim hattı) müşteri kuralından muaf — onlar mamul atomuna bağlanır.

## Global State — Cross-Page Selection

Kullanıcı bir sekmede yaptığı seçim (örn SKU) diğer sekmelerde de geçerli olmalı.

- React Context + localStorage persistence (referans: `client/src/lib/sku-context.tsx`)
- Tüm sayfaları aynı context'e bağla
- Sayfa yenilemede bile hatırlansın

5 sayfa zaten bağlı: stok-durum, palantir, ontology, planlama, urun-istihbarat.

## Pages CT Migration Status (2026-04-30 itibari)

**Done:** home.tsx, ontology.tsx (lineage)

**Pending:** stok-durum, urun-istihbarat, sihir, bh-ontology, strategy-canvas, pipeline-runs, twin-health, decision-loop, operations, sddi, workshop, veri-yukle, login, admin, agent-multi-v2 — sırayla CT'ye taşınacak.

Yeni sayfa açarken zaten CT import et.
