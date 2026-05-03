# 01 — User & Mission

## Gurkan Duruak (kullanıcı)

- Griseus'un (griseus.io) kurucusu. Türkiye'de yaşıyor, Türkçe iletişim kurar.
- Annesi **Çukurova Isı Sistemleri**'nin CEO'su (Türk HVAC üreticisi). Çalışan prototipi gördü ve etkilendi (Mart 2026).
- Hedefi: Çukurova Isı'ya "order of magnitude" rekabet avantajı vermek — Palantir'in müşterilerine yaptığı gibi.
- Teknik derinliği yüksek: TypeScript, Express, Drizzle ORM, React, PostgreSQL, Vercel/Railway deploy.
- "Sihir" ve "dönüştürücü etki" diliyle düşünür, marjinal feature ile değil.
- Spesifikasyonları extreme detaylı verir, gerçek production datayla. **Tam implementasyon** bekler.

## Gerçek İş Problemi (Çukurova Isı)

Çukurova Isı'nın temel problemi — Griseus'un başlangıç noktası:

> Üretim şefi bir ürün üretildiğinde sisteme giremiyor. Yönetim stoku eş zamanlı göremiyor.
> Sipariş geldiğinde stoktaki "görünen" ürün gerçekte olmayabiliyor → ekstra sipariş → opportunity cost.

**Tasarım kıstası:** Her stok özelliği bu senaryoyu çözmeli — üretim şefi tabletten hızlı giriş, yönetim anında görüyor. UX basit, güvenilir, real-time.

## Mevcut Scope (Çukurova canlı)

11 cihaz aktif (legacy 2 + onboard 9):
- **Legacy:** GSS20P (26 bileşen flat), ELT.7-11 (43 bileşen, 1 yarı-mamül)
- **Onboard:** BH.50ST.SV, BH.50UT.SV, BH.55ST.SV, BH.55UT.SV, ELT.5-7, GSA15, GSA20, GSA30, GSS40P

**Octopus ölçümler (validation geçti):**
- X (Bileşen): 11 cihaz × tier 1-2-3 hiyerarşi, Excel'le birebir
- Y.1 (Stok): 175 component_stock, 158 Excel bileşeni birebir
- Y.2 (Cross-binding): 133 paylaşılan bileşen, 16 aile-arası köprü (GSA↔GSS)
- Z (Sezonsallık): 11/11 dinamik profil

**Kategori sezonsal arketipleri (kilitli):**
- BH (4 cihaz): Eylül pik (sanayi montaj)
- ELT (2 cihaz): Ekim pik (seramik ofis)
- GSA (3 cihaz): Kasım pik (duvar ev)
- GSS (2 cihaz): Ağustos pik (portatif)

**Hedef:** 1000 cihaza scale.

## Vizyon (0-to-1)

**Kısa vade (1-to-n):** Palantir modelini KOBİ'lere indirgemek; Çukurova Isı laboratuvar.

**Uzun vade (0-to-1):** "Soul Layer" — Humanoid robotlara cognitive twin (usta sezgisi + tacit knowledge) aktaran platform. Body=Tesla, Brain=OpenAI, **Soul=Griseus**. Aile şirketlerinin ölen "ortalı bilgi" problemini çözer; ağ etkisiyle monopoly mekanizması.

Bu vizyon arka planda. Şu an Çukurova proof-of-concept'i ve operational atom layer derinleştirmesi.

## Etkili Prompting Pattern (Gurkan'dan en iyi sonuçlar)

1. Screenshot atıyor — soyut "çalışmıyor" değil, hatanın kendisini gösteriyor
2. "Aynı senaryoyu tekrarla" der — debug'a zorlar, tahmin yürütmeye değil
3. Varsayımları yıkar — "infra sorunu" dediğinde "hayır kodda" diyerek doğru yöne iter
4. Ciddiyeti belli eder — "belki deneyelim" modundan kök sebebe odaklanmaya geçirir

**Karşı uygulama:** Gurkan soyut bir istek verirse, agent kendisi somutlaştırmalı — "hangi endpoint?", "screenshot var mı?", "repro adımı ne?". Tahminle düzeltmeye çalışmama.
