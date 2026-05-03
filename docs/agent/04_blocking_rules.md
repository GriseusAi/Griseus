# 04 — Blocking Rules

> Bu dosyadaki kuralların hepsi BLOCKING. Atlama yok.

## Temel Felsefe

> "Literal olarak Griseus'un atomu bile başka bir atomdan haberdar olmalı. 1 atom bile diğer atomdan habersiz YASAK."

Griseus'un tüm değer önerisi, Palantir Octopus prensibi: 1 atom değiştiğinde diğer atomlar habersiz kalamaz. Bu yüzden mutation yapan her path 3 ayrı denetimden geçer.

## Sıra (DEĞİŞMEZ)

```
1. atom-preflight  → kod yazmadan önce, domino haritası
2. implement       → tamamı, yarım değil
3. octopus-chain   → post-audit, RED varsa blokla
4. commit + push   → otomatik
```

---

## 1. Atom Preflight (KOD YAZMADAN ÖNCE)

### Tetikleyici

Kullanıcı komutu = eylem sinyali (ekle/düzelt/değiştir/yaz/yap/implement/fix/feature/refactor) **+** atom sinyali (stok/BOM/bileşen/yarı-mamül/mamul/satış/tier/cihaz/SKU/kart/buton/endpoint/tablo/bottleneck/maxProducible/intelligence/agent/tool/WS/broadcast/lineage/ontology/renk/status) içeriyorsa → atom-preflight **otomatik tetiklenir**.

### Kural

10 sorunun cevabı masaya konmadan **Edit/Write tool'larına dokunma**. False-positive ucuz, false-negative pahalı.

### Atlama Sinyali (sadece bunlar)

- Salt okuma/soru (implementation yok)
- Non-atom UI (sadece estetik) — yine de skill çalıştır, karar skill'in olsun
- Memory/doküman işi

### Skip Edersen

Skip kararı bile skill çıktısı olarak kayıt altına alınmış olmalı. "Atom-preflight yapmadım" demek zorunda kalırsan zaten hata yapmışsın.

### 10 Soru (özet — tam liste skill MD'sinde)

1. Hangi atom (stok/BOM/satış/tier/...) okunuyor / yazılıyor?
2. Bu atom hangi diğer atomları besliyor / hangilerinden besleniyor?
3. Hangi endpoint'ler (`GET/POST/PATCH/DELETE`) bu atomu okur/yazar?
4. Hangi UI sayfa/component bu endpoint'leri çağırır?
5. WS broadcast (`broadcastEntityChanged`) gerekiyor mu?
6. Lineage (`recordLineage`) gerekiyor mu?
7. Hangi agent tool bu atomu görür? Yeni tool gerekli mi?
8. Ontology object_type / link_type ekleme/güncelleme gerekiyor mu?
9. Cross-product etkisi var mı? (Y.2 — paylaşılan bileşen)
10. Mevsimsel/zaman boyutu (Z) etkileniyor mu?

### Kırmızı Çizgi

> "UI ekledim X otomatik çalışıyor" demeden önce X'in kod yolunu **satır-satır Grep ile doğrula**. "Emin misin?" sorusu geldiğinde iş zaten yanlış gitti.

---

## 2. Octopus Chain (POST-MUTATION, COMMIT ÖNCESİ)

### Tetikleyici

Aşağıdakilerin BİRİ olduğunda **otomatik çalış** (kullanıcı söylemese bile):

- `/api/import/bulk/{stock,bom,sales,products}` çağrısı
- `/api/stock/movements` (her movement_type)
- `/api/component-stock/update`
- Script ile yapılan onboard (`onboard-batch.ts`, `seed*`)
- `bom_items`, `component_stock`, `stock_levels`, `sales_history` tablolarına yazma
- Yeni cihaz eklenmesi
- BOM/tier yapısı değişikliği
- Kod deploy (özellikle intelligence, bom, whatif, impact motorlarını etkileyen)

### Kural

1. Mutation ÖNCESİ: pre-snapshot (`POST /api/foundry/snapshots`) — rollback hazır
2. Mutation: asıl işlem
3. Mutation SONRASI (kullanıcıya rapor vermeden): 9-katman zincir kontrol
4. 9 katman yeşil → kullanıcıya "tamamlandı + octopus audit geçti" diye bildir
5. Katmanda kırmızı → ilk önce onu düzelt, sonra raporla

### 9 Katman (özet)

1. DB integrity — yazılan satır gerçekten orada mı, FK'lar tutuyor mu
2. Cross-product impact — paylaşılan bileşenler etkilenen SKU'lar
3. WS broadcast — `broadcastEntityChanged` çağrıldı mı
4. Lineage — `recordLineage` çağrıldı mı
5. Validation alerts — yeni alarm tetiklenmesi gerekiyor mu
6. Scenario branching — açık senaryo varsa override güncel mi
7. Agent visibility — tool ile sorgulanabiliyor mu, SKU-agnostic mi
8. Ontology consistency — object_type / link_type seeded mi
9. UI sanity — frontend hatasız çağırabiliyor mu

### Yasaklar

- "Skill'i çalıştırayım mı?" diye sorma — otomatik
- "Küçük değişiklik" bahanesi yok
- 9 katman yeşil olmadan commit ASLA
- Placeholder/vibe rapor YASAK, her katman gerçekten sorgulanır

### Proaktif Uyarı

Katman 2 (Cross-Product) KIRMIZI ise commit'i durdur, kullanıcıya etkilenen SKU listesini önce göster. Gurkan'ın "en önemli nokta" dediği kısım.

---

## 3. 4-Nokta Atom Audit (HER WRITE ENDPOINT)

Yeni veya değiştirilmiş HER write endpoint / mutasyon için commit öncesi 4-nokta denetim ZORUNLU. Biri bile eksikse commit ATMA, önce tamamla.

### 4 Nokta

| # | Kontrol | Soru |
|---|---------|------|
| 1 | **WS yayını** | `broadcastEntityChanged` (veya uygun broadcast) çağrıldı mı? Mutasyon yapıp WS'e sessiz kalma = silo. |
| 2 | **Lineage** | `recordLineage` çağrıldı mı? Trace olmadan geriye bakış yok. |
| 3 | **Agent görünürlüğü** | Agent bu değişikliği tool üzerinden sorgulayabiliyor mu? SKU-agnostic mi yoksa hardcode mu? |
| 4 | **Ontology tutarlılığı** | İlgili object_type + link_type seeded mi? Yeni tablo/alan varsa ontology güncellendi mi? |

### Uygulama

- `/bulk/*`, `POST /api/*`, `PATCH`, `DELETE`, `PUT` — her birinde checklist koştur
- Hafızayı "okuma materyali" gibi değil **blocking gate** gibi kullan: commit mesajı yazmadan önce 4 nokta yeşil mi kendinden sor
- Eksikse: kullanıcıya "şu 4 nokta eksik, kapatıp öyle commit atayım" de, hızlı gitme
- Kullanıcı Octopus felsefesini tekrar açıklamak ZORUNDA kalırsa bu hafızanın görevini yapmamışsın demektir

### Özel Tetikleyici

Kullanıcı "Octopus audit" ya da "atom kontrol" derse 4-nokta denetimini açıkça raporla. Ama bunu beklemeden kendin yap.
