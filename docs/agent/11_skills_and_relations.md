# 11 — Skills Protocols & Cross-Atom Relations

> **Anlatılan kalp:** Griseus'taki HİÇBİR karar izole değil. Bir bileşen değişti = N cihaz etkilendi. Bir cihaz aileye ait = aileyle birlikte düşünülür. Bir mutasyon yapıldı = 10 katmanın hepsi yeniden tutarlı olmalı. Bu dosya o ilişkilerin haritasıdır.

---

## Bölüm A — Skill Protokolleri (Claude Code skill'lerinin inline özeti)

`~/.claude/skills/` altında Claude Code'a özel skill'ler var. Codex bu skill'leri `Skill` tool ile çağıramaz **AMA aynı protokolü inline uygulayabilir**. Aşağıdaki her skill bir disiplinin somutlaşmış halidir — Codex bu disiplini kendi tool'larıyla (read/grep/bash) yürütür.

### A.1 — Atom Preflight (KOD YAZMADAN ÖNCE)

`~/.claude/skills/atom-preflight/SKILL.md` (Claude Code'da `/atom-preflight`)

**Tetikleyici:** Eylem sinyali (ekle/düzelt/yaz/yap/implement/fix/feature/refactor) + atom sinyali (stok/BOM/bileşen/tier/agent/WS/lineage/ontology vb.) → BLOCKING.

**10 soru — kod yazmadan ÖNCE cevaplanır:**

1. Hangi atom (stok / BOM / satış / tier / ontology) okunuyor / yazılıyor?
2. Bu atom hangi diğer atomları besliyor / hangilerinden besleniyor?
3. Hangi endpoint'ler (`GET/POST/PATCH/DELETE`) bu atomu okur/yazar?
4. Hangi UI sayfa/component bu endpoint'leri çağırır?
5. WS broadcast (`broadcastEntityChanged`) gerekiyor mu?
6. Lineage (`recordLineage`) gerekiyor mu?
7. Hangi agent tool bu atomu görür? Yeni tool gerekli mi?
8. Ontology object_type / link_type ekleme/güncelleme gerekiyor mu?
9. Cross-product etkisi var mı? (Y.2 — paylaşılan bileşen)
10. Mevsimsel/zaman boyutu (Z) etkileniyor mu?

**Kırmızı çizgi:** "UI ekledim X otomatik çalışıyor" demeden önce X'in kod yolunu **satır-satır Grep ile doğrula**.

### A.2 — Octopus Chain (POST-MUTATION, COMMIT ÖNCESİ)

`~/.claude/skills/octopus-chain/SKILL.md` (115 satır, prod skill).
Numeric config: `shared/octopus-chain-config.ts` (single source of truth).

**Tetikleyici:** Her veri mutasyonundan SONRA otomatik. Bypass yok.

#### 10 Katman (skill'in tam dökümanından)

| # | Katman | Kontrol |
|---|--------|---------|
| 1 | **Mutasyon Kaydı** | Snapshot + lineage var mı? Rollback hazır mı? |
| 2 | **Self Intelligence** | Etkilenen SKU'nun istihbaratı tutarlı mı? BUG: `stock>0 && days=0` olmamalı. Artifact: 2042 gibi sahte tarihler. `neverDepletes` flag tutarlılığı. |
| 3 | **Cross-Product Propagation (Y.2)** | 86+ ortak kod üzerinden çapraz etki + 16 aile köprüsü. Bir SKU stok değişikliği diğer SKU'ları nasıl etkiliyor? Shared component coverage. |
| 4 | **Downstream Derived** | Rules engine + Impact engine + DSE + ATE tutarlı mı? Snapshot var mı? |
| 5 | **UI Coherence — 6 sayfa cross-page atom match** | stok-durum, urun-istihbarat, planlama, ontology, palantir/sihir, engine — aynı atom kaynağından mı geliyor? |
| 6 | **WS Broadcast** | 4 broadcaster aktif mi? Mutasyon sonrası event'ler gönderildi mi? |
| 7 | **Agent Visibility** | CEO Agent tool çıktıları güncel mi? Agent'ın gördüğü = gerçek veri? |
| 8 | **Ontology Integrity** | Schema (object_types + link_types count). Live data freshness. Drill-down parent-child tutarlılığı. component_stock urgency/renk attribute (BİLİNEN EKSİK). |
| 9 | **System-wide Validation** | Urgency classification (5/5 SKU). Tier-agnostic filter çalışıyor mu? `isSubAssembly` + `children[]`. `perProductQty` (parent.qty × child.qty). |
| 10 | **Seasonal Multiplier Integrity** | **Matematiksel kalp** — peak ayı doğru mu? Amplitude ≥ 2.0? Aile spread ≤ 0.5? Normalize mean tolerance ±0.1? Current month alignment ±0.02? Winter stress (Kas/Ara/Oca/Sub) doğru kapsanmış mı? Forward-walk 200 ay cap? |

#### Rapor Formatı

Her katman: **YEŞİL** (geçti) / **SARI** (potansiyel) / **KIRMIZI** (kritik).
Sonunda: özet + (kırmızı varsa) root cause + fix önerisi.

#### Yasaklar

- Placeholder/vibe rapor YASAK
- "%muhtemelen OK" YASAK
- 1/10 kapsam YASAK
- Tek sayfa inceleme YASAK

#### Özel kural

Katman 3 (Cross-Product) **KIRMIZI** ise commit'i durdur, etkilenen SKU listesini önce göster. "En önemli nokta" dediği yer.

### A.3 — BH Yarımamül Check

`/bh-yarimamul-check` skill: BH ailesi için xls (Excel) vs DB BOM yarı-mamül sınıflandırma karşılaştırması yapar. Yanlış tier → kapasite hesabı bozulur.

**Tetikleyici:** BH ailesi onboard veya yarı-mamül değişikliği sonrası.

**Protokol özeti (Codex inline uygulayabilir):**
1. xls dosyasını oku, indent seviyelerinden tier çıkar (lvl=tier, lvl+1 değil!)
2. DB'den `/api/bom/<sku>/stock` çağır, tier dağılımını al
3. Karşılaştır: hangi bileşen xls'te yarı-mamül (children var) ama DB'de flat? Tersi?
4. `effectiveStock` hesabı tier 2 için doğru mu?
5. Türkçe lowercase tuzağı: `.toLocaleLowerCase('tr')` kullan, yoksa `İ` bozulur.

---

## Bölüm B — Cross-Atom Relations (İlişki Katmanı)

**Bu dosyanın kalbi.** Codex bir feature implement ederken sürekli sormalı: "Bu değişiklik HANGİ DİĞER atomları etkiliyor?"

### B.1 — Aile (Family) Bağları

Çukurova ürünleri 4 aileye bölünür. **Aile = ortak fuel/teknoloji + ortak sezonsal pattern + (büyük ölçüde) ortak bileşen havuzu**.

| Aile | Cihazlar | Sayı | Fuel | Aile Default Peak |
|------|----------|------|------|-------------------|
| **BH** | BH.50ST.SV, BH.50UT.SV, BH.55ST.SV, BH.55UT.SV | 4 | Gazlı | Eyl (sanayi montaj baseline) |
| **ELT** | ELT.5-7, ELT.7-11 | 2 | Gazlı | Eki (seramik ofis baseline) |
| **GSA** | GSA15, GSA20, GSA30 | 3 | Elektrikli | Kas (duvar ev baseline) |
| **GSS** | GSS20P, GSS40P | 2 | Elektrikli | Agu (portatif baseline) |

#### SKU-Level Peak Overrides (2026-04-17, gerçek 2025 verisi)

Aile default'u **fallback** — gerçek satış verisi gelince SKU bazında override edilir.

| SKU | Override Peak | Not |
|-----|---------------|-----|
| `ELT.5-7` | Eyl | 2025 Eyl=45, Eki=20 (ELT.7-11 aile defaultundan farklı) |
| `GSA15` | Eki | 2025 Eki=24 sparse (yıllık 40) |
| `GSA20` | Eki | 2025 Eki=109, Kas=79 (Kasım'dan Ekim'e kaymış) |
| `GSS40P` | Ara | 2025 Ara=85, Agu=69 (büyük model kışa doğru pik) |
| `BH.55ST.SV` | Eki | 2025 Eki=87 (yıllık 218 — en yüksek BH hacmi, ihale pattern) |
| `BH.50ST.SV` | Ara | 2025 Ara=24 (küçük model kışa doğru) |
| `BH.55UT.SV` | Ara | 2025 Ara=31 (U-tip kış pikli) |
| `BH.50UT.SV` | Eki | 2025 sparse yıllık=2 (güvenilirlik çok düşük) |

> **How to apply:** Layer 10 amplitude alarmı SKU-level data sparse'sa "normal" olabilir — yıl yıl veri gelmesi şart. Aile default ile SKU override arasında çelişki varsa SKU override geçerli.

### B.2 — Paylaşılan Bileşen Havuzu (Y.2 Cross-Binding)

Çukurova'da kodlama disiplini var: **aynı bileşen kaç cihazda olursa olsun aynı kodla geçer**. Bu Y.2'nin teknik şartı; Octopus mimarisinin **kalbi**.

**11 cihaz × 13-43 bileşen × paylaşımlar:**
- 175 component_stock kayıt
- 158 unique Excel bileşeni
- **133 paylaşılan bileşen** havuzda
- **16 aile-arası köprü** (örn GSA↔GSS)
- 86+ ortak kod (Layer 3 referansı)

#### Köprülerin Anlamı

```
Plus Kablo  ─── kullanan cihaz set:
  ├─ GSA15   (Kas peak, elektrikli)
  ├─ GSA20   (Eki peak)
  ├─ GSA30   (Kas peak)
  ├─ GSS20P  (Agu peak, portatif)
  └─ GSS40P  (Ara peak)

Plus Kablo'nun tükenme tarihi =
  GSA15(Kas talep) + GSA20(Eki talep) + GSA30(Kas talep) +
  GSS20P(Agu talep) + GSS40P(Ara talep)
  = 5 cihazın AYLIK ÇARPAN TOPLAMI

Tek cihazın sezonsallığı DEĞİL — havuzun toplam yükü.
```

> **Why bu Griseus'un moat'ı:** Geleneksel ERP (Netsis, SAP) bileşen→cihaz ters yönünü tutmuyor. Statik lookup tabloları runtime'da 5-cihaz çarpan toplamı hesaplayamaz. Griseus bu hesabı her sorguda canlı yapıyor.

#### `bom_items` Constraint

```sql
-- ESKİ (siloed):
UNIQUE (component_code)

-- YENİ (Octopus için ŞART, commit 0735123):
UNIQUE (parent_product_sku, component_code)
```

Aynı `component_code` farklı `parent_product_sku` altında gözükebilir → cross-product JOIN otomatik çalışır.

### B.3 — Cross-Product Audit Tetikleyicileri

Bir feature implementasyonu sırasında **bu sorulardan biri "evet" ise Layer 3 (Cross-Product) konusunda** **DİKKAT**:

- Tek SKU'nun stoku/BOM'u değişiyor mu? → Hangi diğer SKU'lar bu bileşeni paylaşıyor?
- Yeni cihaz eklenir mi? → Bileşenlerin kaçı havuzda zaten var? (Cold-start: %80 transfer = onboarding süresi düşer)
- Yeni motor/algoritma? → 11 SKU'nun hepsi için çalışıyor mu? Ürün-spesifik kod yolu YASAK
- Mevsimsel parametre değişiyor mu? → Aileye yayılır mı? SKU override'ları override eder mi?

### B.4 — BH Ailesi On-Demand Bileşenler

BH ailesinin bazı `stok=0` bileşenleri gerçekten "bitmiş" değil — **on-demand** olarak üretim sırasında talep üzerine yapılır. Darboğaz sayılmaz (commit `7ac1e1a`).

**Bunlar production blocker DEĞİL.** `bottleneckComponents` listesinden çıkarılır, intelligence engine bunları "fluctuating but on-demand" işaretler.

> **Yeni aile/SKU eklerken:** O ailenin stok=0 bileşenleri arasında on-demand olanları belirle (3-kategori kuralından "GERÇEK STOKSUZ" değil, "on-demand" yeni bir varyantı). Bu liste aile-spesifik kod yolu olur — SKU-spesifik OLMAZ. Aile bazında yönetilir.

### B.5 — Variable Components (Opsiyonel Bileşenler)

Bazı bileşenler reçetede yer alır ama her üretimde kullanılmaz (varyant farkı). Pattern (`^VA\d+H\d+[A-Z]$`) sadece **aday** önerir, onay kullanıcıdan SPESIFIK soruyla alınır.

**Bilinen kararlar:**

| Kod | Karar | Neden |
|-----|-------|-------|
| `VA4H50R` | Normal bileşen | Kullanıcı: "değişken değilmiş" |
| `VA5H70R` | Normal bileşen | Kullanıcı: "zorunlu fan" |
| `03051101` | **Variable** | Manuel onay (pattern dışı) |

Tek geçerli variable: `03051101`. Pattern eşleşmesini otomatik `bhVariableComponents`'a EKLEME.

### B.6 — Yarı-Mamül (Sub-Assembly) İlişki Yapısı

Tier hiyerarşisi:

```
Cihaz (mamul, tier 0)
  ├─ Direkt bileşen (tier 1, raftan)         → stock=N, dikdörtgen
  ├─ Yarı-mamül (tier 1, alt bileşeni var)   → stock=0 doğru, DAİRE
  │   └─ Alt bileşen (tier 2)                → stock=N
  │       └─ Alt-alt (tier 2C, opsiyonel)    → stock=N
  └─ ...
```

`tier=2` için endpoint:

```
effectiveStock = currentStock + (alt bileşenden üretilebilecek)
```

**Yarı-mamül stok=0 normaldir** çünkü raftan değil sacdan kesilir/monte edilir. `bom.ts:197` bu hesabı yapıyor.

> Excel parse'da `tier = lvl` (NOT `lvl + 1`). Aksi takdirde direkt bileşenler tier=2 olur, UI "YARI MAMUL alt bileşeni yok" diyerek bozulur.

---

## Bölüm C — Codex İçin Disiplin

Bir görev geldiğinde içinden geçirilecek 3 sıralı kontrol:

```
[1] ATOM MAPPING
    Hangi atom değişiyor? → 10 soruyu kafanda gez (A.1)

[2] CROSS-PRODUCT MAPPING
    Bu atom kaç SKU'da paylaşılıyor?
    Aile-spesifik mi, SKU-spesifik mi, global mi?
    → B.2 ve B.3'e bak

[3] POST-MUTATION VALIDATION
    Mutasyon yapıldıktan sonra 10 katmanı zihinden geçir (A.2)
    Özellikle Layer 3 (Cross-Product) — paylaşılan bileşenler
    Özellikle Layer 10 (Seasonal) — aile vs SKU override
```

**Tek sentence:** Griseus'ta hiçbir kod izole değil. Yeni bir feature = 11 SKU × 4 aile × 158 bileşen × 12 ay × 10 katman matrisinde bir nokta. Her noktada zincir kontrolü.

## Bölüm D — Hızlı Referans Tablosu

| Soru | Cevap nereden |
|------|---------------|
| Hangi cihaz hangi ailede? | `B.1` aile tablosu |
| SKU peak ayı? | `B.1` SKU override (yoksa aile default) |
| Yeni mutasyon sonrası ne kontrol? | `A.2` 10 katman |
| Kod yazmadan önce ne sor? | `A.1` 10 soru |
| Bileşen kaç SKU'da paylaşılıyor? | `bom_items` JOIN on `component_code` |
| Octopus config sayısal değerler? | `shared/octopus-chain-config.ts` |
| BH on-demand bileşenler? | `B.4` (commit `7ac1e1a`) |
| Variable bileşenler? | `B.5` — sadece `03051101` onaylı |
| Tier hiyerarşi? | `B.6` |
