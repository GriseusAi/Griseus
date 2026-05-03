# 06 — Data Handling

## Excel BOM Parse — 3 Kategori Kuralı

Çukurova Excel reçetelerinde **stok=0 satırlarını körü körüne Griseus'a atma**. 3 farklı kategori vardır, her biri farklı işlenir.

### 1. İŞÇİLİK (Labor) — Fiziksel Bileşen DEĞİL

- İsimde `işcilik` veya `işçilik` geçer (eski-yeni Türkçe yazım)
- Örnekler: `20.068 BH Reflektör Büküm İşçiliği`, `26.098 BH 4" yanma borusu flanş ve kaynak işciliği`
- Sadece Excel'de maliyet muhasebesi için var

**Yapılacak:** BOM'a ve stok havuzuna **HİÇ EKLEME**. İçeri alırsan stok=0 olarak girer ve CEO Agent "alarm: bileşen bitti" halüsinasyonu üretir.

### 2. YARI MAMÜL (Sub-assembly) — Alt bileşenleri var, stok=0 doğru

- Genelde stok=0 görünür çünkü raftan değil, alt bileşenden kesilir/monte edilir
- Excel'de altında çocuk satırlar var (daha büyük indent)
- Örnekler:
  - `25.147 Soğutma Profili (Galmak)` — KG birimi, sacdan kesilir
  - `25.123 Reflektör` — alt bileşen `25.106 Reflektör Sacı`

**Yapılacak:** BOM'a olduğu gibi gir, `stock=0` gönder. Griseus tier=2 için zaten `effectiveStock = currentStock + altBileşendenÜretilebilecek` hesaplar (`server/routes/bom.ts`'de). Ham 0 DB'de doğru duruyor; endpoint business-level hesaplamayı yapıyor.

### 3. GERÇEK STOKSUZ — Bileşen var ama gerçekten bitmiş

- İşçilik DEĞİL, alt bileşeni yok, fiziksel parça
- Örnek: `28.005 Flex Contası` — stok=0, sipariş bekliyor

**Yapılacak:** BOM'a ve havuza gir, `stock=0` doğru. Kritik alarm tetiklenir — doğru davranış.

## Implementation Notları (DİKKAT)

### Labor Filter

`script/onboard-batch.ts` ve benzeri parser'larda:

```ts
const LABOR_KEYWORDS = ["işçili", "işcili"]; // ROOT formu, k suffix'siz!
```

`"işçilik"` yazarsan `"İşçiliği"`nin `ğ+i` suffix'ini KAÇIRIRSIN.

### Türkçe Lowercase

Default `.toLowerCase()` Turkish `İ`'yi `i̇` (combining dot above) yapar, substring match boşa çıkar.

```ts
str.toLocaleLowerCase('tr')  // ZORUNLU
```

### Tier Convention

| Excel indent | Griseus tier |
|--------------|--------------|
| 1 (5 boşluk, direkt material) | tier=1 |
| 2 (alt bileşen) | tier=2 |
| 3 (alt-alt) | tier=3 |

```ts
tier = lvl       // DOĞRU
tier = lvl + 1   // YANLIŞ — direkt bileşenler tier=2 oluyor, UI "YARI MAMUL alt bileşen yok" diyor
```

`server/routes/bom.ts`'deki `if (tier === 2)` ile gerçek yarı-mamul hesaplanır.

## Tekrarlanan Hatalar (geçmişe ders)

1. Labor keyword `işçilik` → `İşçiliği` suffix yakalanmadı → 20.068 labor prod'a girdi
2. Default `.toLowerCase()` → Türkçe `İ` bozuldu → filter çalışmadı
3. `tier = lvl + 1` → direkt bileşenler tier=2 oldu → UI yanlış render

**Çözüm:** Her Excel batch apply sonrası `/api/bom/:sku/stock` çıktısını manuel oku, tier dağılımını ve labor temizliğini doğrula.

## Çukurova Format — Adapter Bizim Tarafımızda

> Çukurova'ya "şu Excel template'i doldurun" demek YANLIŞ.

Çukurova kendi sistemlerinden (Netsis export, PDF reçete, mevcut Excel formatları) export atar. Format dayatma yetkimiz yok — dayatırsak iş yavaşlar veya çalışmaz.

### Akış

1. Çukurova "veri atacağız" derse "ne formatta?" diye sor, beklemeye geç
2. Dosya geldiğinde format incele (sheet'ler, kolonlar, kodlama)
3. O formattan Griseus endpoint'lerinin beklediği JSON'a çeviren küçük adapter yaz (her batch tipi için ayrı olabilir)
4. Genel onboarding script (`script/onboard-batch.ts`) endpoint transport + validation + audit yapar; format-spesifik parse adapter'ın işidir
5. **ASLA** "şu template'i doldurun" mesajı gönderme

## BH Ailesi On-Demand Bileşenler

BH ailesinin bazı stok=0 bileşenleri **on-demand** olarak yapılır (üretim sırasında talep üzerine), darboğaz sayılmaz (commit `7ac1e1a`).

Bu mantık `server/routes/bom.ts` ve ilgili intelligence engine'lere işlenmiş — yeni ürün/family eklerken bu pattern'i koru.

## Yarı-Mamül Doğrulaması (BH ailesi özel skill)

`/bh-yarimamul-check` skill: Excel xls vs DB BOM yarı-mamül sınıflandırma karşılaştırması yapar. BH ailesi onboard veya yarı-mamül değişikliği sonrası bu skill'i çağır.

## Mamul Stok (Inventory)

`stock_levels` tablosu mamul (finished goods) stoğu tutar:
- ELT.7-11 inventory_count: 333 (warehouse)
- GSS20P inventory_count: 203 (warehouse)
- production_count: 0 (henüz üretimde olmayan)

Bunlar Excel stok bakiye import'undan gelir. Excel'deki kodlar `Stok Kodu` sütununda numeric okunabilir → `dtype={'Stok Kodu':str}` + BOM prefix-match ile fix gerekti (commit `07d7cb3` öncesi). Yeni import path eklerken aynı tuzağı yaşa.

## Sentetik Sales Data

Çukurova gerçek 3 yıl satış verisi geldikten sonra sentetik Z replace edilecek:

```
DELETE /api/planning/history/:sku
POST   /api/import/bulk/sales
```

Sentetik üretmek için: `script/seed-sales-synthetic.ts` (kategori arketipi ekle).
