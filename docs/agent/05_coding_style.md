# 05 — Coding Style & Behavior

## İzin / Onay Sormadan Direkt Uygula

Komut net bir aksiyon içeriyorsa (ekle/düzelt/yap/yaz/implement/refactor) → **direkt implementasyona geç**.

- "Evet mi yapayım?" / "Şu mu bu mu?" / "Onaylar mısın?" — YOK
- "a/b/c menüsü" sunma — kararı kendin ver, sonradan revize lazımsa kullanıcı söyler
- atom-preflight'ın 10 sorusu **kendi haritan**, kullanıcıya danışma değil — çıkarıp HEMEN implement et

### İstisnalar (yine de doğrula/sor)

- Yıkıcı/geri alınamaz: force push, hard reset, branch silme, prod deploy, mass delete
- Gerçek belirsizlik: kod hangi dosyada hiç bilinmiyorsa kısa netleştirme sor
- Exploratory soru tarzı kullanıcıdan gelirse ("ne dersin?", "nasıl yapsak?") → 2-3 cümle öneri + tradeoff. Ama "şunu yap" komutu geldiğinde değil

## Full Scope Execution — 1/10 YASAK

Komut çok boyutlu olabilir: backend + frontend + WS broadcast + ontology + lineage + validation + agent tool. **Hepsi uygulanır.**

- Komut geldiğinde önce scope'un tüm boyutlarını listele (hangi dosya, endpoint, tablo, UI, WS event, ontology kaydı, test)
- Sonra hepsini sırayla uygula — "minimal değişiklik" default'u Griseus'ta YANLIŞ
- CLAUDE.md/AGENTS.md'deki "don't add features beyond what the task requires" kuralı Griseus'ta GEÇERLİ DEĞİL — komutlar zaten çok boyutlu
- Şüphe varsa sor ("şunları da kapsasın mı?"), ama varsayılan tam kapsam
- Atom-preflight'ta GAP çıkarsa (örn "sadece sanity yapıyor, atom izlemiyor") → gap da scope'a alınır, user'a sormadan genişlet

## Veri Doğruluğu — Basit Hata Toleransı YOK

- Tool/API'den dönen sayıları **olduğu gibi** kullan, yorum ekleme
- Agent system prompt'larına veri doğruluk kuralları ekle
- Sayısal çıktılarda explicit alanlar kullan (örn `stockDelta: 0`), agent'ın çıkarım yapmasını engelle
- Hata bulunursa hemen düzelt, "küçük hata" diye geçiştirme
- Deploy öncesi mümkünse curl ile API test et

## System Coherence — Tek Organizma

Sistemi parça parça değil, **tek bir organizma** olarak tasarla ve kodla.

- Yeni ürün eklemek = sadece VERİ. Kod değişikliği SIFIR olmalı
- ELT.7-11 nasıl kuruluysa, aynı pipeline GSS20P için de otomatik çalışmalı
- Yeni özellik eklerken sor: "Bu tüm ürünler için çalışıyor mu?"
- ASLA hardcoded SKU, ASLA ürüne özel kod yolu
- İnsan vücudu metaforu: kalp ve beyin birbirinden habersiz çalışamaz

## CEO Agent Sığ Cevap Yasağı

Düz "stokta X var, Y üretilebilir" raporu YASAK. Her stok sorusunda en az 4-5 tool kullanılmalı:

1. Mevsimsel bağlam (hangi ay, pik ne zaman)
2. Darboğaz derinliği (tükenme tarihi, tedarik süresi)
3. Zamanlama stratejisi (tarih + miktar bazlı üretim planı)
4. Finansal etki
5. Karşılaştırmalı analiz (diğer ürünlerle)

**Doğru:** "Mayıs'ta 15 adet/gün üret, Haziran'da 12'ye düşür, Ağustos pikine 450 adetle gir."

## RAG / ADM Context — ASLA Kapsanmaz

Domain knowledge injection (RAG, ADM) agent'ın zeka kaynağı. Karakter limiti koyma.

- System prompt zaten kısa olmalı (~800 token), RAG'a yer kalır
- Context window optimizasyonu **prompt tarafında** yapılır, bilgi tarafında DEĞİL
- RAG kısıtlandığında agent aptallaşır

## Emoji Yasak (Her Yerde)

UI / kod / commit mesajı / chat / tool result — **HİÇBİR EMOJI YOK**. Ne prefix, ne dekoratif, ne ikon.

- 2026-04-22'de ⚡ özelinde başladı, 2026-05-01'de tüm emojilere genişledi
- Mevcut kodda emoji görürsen sessizce temizle
- Replacement:
  - Symbols: `◇ ◈ ● ▸ ↔ ↻ ⊘ ⊡ ⟲ ⎘ ✕ ▾ ▸` — dekoratif/yapısal işaretler için kabul (minimum)
  - Category icons: 3-harfli text tag (örn `ELK`/`GAZ`) veya 10×10 renkli kare
  - Action buttons: kelimeyle yaz ("tepkime", "FABRİKA")
  - Vurgu: renk veya font-weight, emoji DEĞİL
- Slack/PR/commit/tool result hiçbirinde — bu dokümanı güncellerken bile

## Pattern-Match ≠ Onaylı Variable

`^VA\d+H\d+[A-Z]$` gibi pattern kuralları SADECE aday önerir. Final karar user'dan SPESIFIK soruyla alınır.

- Pattern eşleşen kodu otomatik `bhVariableComponents`'a EKLEME
- User'a sor: "X kodu opsiyonel mi, bazen kullanmadığınız bir bileşen mi?"
- "Evet opsiyonel" → ekle. "Hayır zorunlu" → `decline_list`'e yaz, tekrar sorma
- Her variable onay kararına tarih + user'ın sözünü skill MD'ye yaz

**Bilinen kararlar:**
- `VA4H50R` → normal bileşen ("değişken değilmiş")
- `VA5H70R` → normal bileşen ("zorunlu fan")
- `03051101` → variable (manuel onay, pattern dışı)

Tek geçerli variable: `03051101`.

## Yorum Yazma Default'u

- Default: yorum yazma. Yalnızca WHY non-obvious ise kısa yorum
- WHAT'i açıklayan yorumlar (kod ne yapıyor) YASAK — kod kendisi söyler
- "Used by X / added for Y / handles case from issue #123" gibi referanslar YASAK — PR description'a yazılır, kodda rot eder
- Multi-paragraph docstring / multi-line block YASAK — bir satır max
