# AGENTS.md — Griseus

> Bu dosya Griseus üzerinde çalışacak HER otonom AI agent (Codex, Claude Code, vb.) için ortak brief.
> İlk açılışta tamamını oku. Detaylar `docs/agent/` altında — gerektiğinde oradan derinleş.

## TL;DR

- **Griseus** = Çukurova Isı (Türk HVAC üreticisi) için Palantir-tarzı ontoloji-tabanlı zeka platformu. Domain: `griseus.io`.
- **Mimari kalbi:** Octopus — 1 merkezi beyin (DB + Ontology) + bağımsız ama koordineli kollar (motorlar). Her atom diğer her atomdan haberdar.
- **Felsefe:** Yeni özellik = ÇOĞUNLUKLA sadece veri ekleme (sıfır kod değişikliği). Hardcoded SKU/ürün YASAK.
- **Stack:** React 18 + TS + Wouter + TanStack Query | Express + Drizzle + PostgreSQL + pgvector | Anthropic Claude API.
- **Deploy:** GitHub `GriseusAi/Griseus` main branch → Vercel auto-deploy. Repo path: `/Users/gurkanduruak/Griseus`.

## En Kritik 5 Kural (atlama, hepsi BLOCKING)

1. **Atom-preflight zorunlu** — Mutation/feature/fix komutu geldiğinde kod yazmadan ÖNCE 10-soruluk atom domino haritası çıkarılır. Yarım implementasyon yasak. → `docs/agent/04_blocking_rules.md`
2. **Octopus-chain post-audit** — Her veri mutasyonundan sonra (commit ÖNCESİ) 9-katman zincir kontrol otomatik çalışır. RED varsa commit ATILMAZ. → `docs/agent/04_blocking_rules.md`
3. **4-nokta atom denetimi** — Her write endpoint için commit öncesi: WS broadcast + lineage + agent görünürlüğü + ontology tutarlılığı. Biri eksikse commit yok. → `docs/agent/04_blocking_rules.md`
4. **Tasarıma dokunma** — UI/renk/layout/font değişikliği YASAK (kullanıcı izni hariç). claude.ai aesthetic kilitli (`client/src/lib/claude-theme.ts`). → `docs/agent/07_ui_aesthetic.md`
5. **Emoji yasak** — UI/commit/chat/kod hiçbir yerde HİÇBİR emoji. (Yıldırım, robot, ✅ ❌ vs. dahil — hepsi yasak.) → `docs/agent/05_coding_style.md`

## İzin/Onay/Deploy Davranışı

- **İzin sorma:** Komut net (ekle/düzelt/yap/yaz/implement/refactor) ise direkt uygula. "Onaylar mısın?" / "şu mu bu mu?" YOK. → `docs/agent/05_coding_style.md`
- **Auto-deploy:** İş bittiğinde `git add <touched files>` + commit (Co-Authored trailer) + `git push origin main` otomatik. Vercel auto-deploy. İstisnalar (build hatası, RED audit, scope dışı, WIP) için dur. → `docs/agent/08_deploy_safety.md`
- **Full scope execution:** Komut çok boyutluysa (backend + frontend + WS + ontology + lineage + UI) HEPSİ uygulanır. 1/10 yasak. → `docs/agent/05_coding_style.md`

## İndeks (sırayla oku)

| # | Dosya | Konu |
|---|-------|------|
| 01 | [user_and_mission.md](docs/agent/01_user_and_mission.md) | Gurkan kim, Çukurova Isı, gerçek iş problemi, vizyon |
| 02 | [architecture.md](docs/agent/02_architecture.md) | Octopus mimarisi, 3-layer stack (AIP/Ontology/Foundry), motorlar, API'ler, dosya yolları |
| 03 | [ontology_and_agents.md](docs/agent/03_ontology_and_agents.md) | Bileşen×Miktar×Süre üçgeni, multi-agent v2 (Tükenme/Yapı/Risk/Aksiyon), tool dağılımı |
| 04 | [blocking_rules.md](docs/agent/04_blocking_rules.md) | atom-preflight + octopus-chain + 4-nokta audit (BLOCKING) |
| 05 | [coding_style.md](docs/agent/05_coding_style.md) | İzin sormama, full scope, accuracy, no-emoji, tasarıma dokunma, agent depth, RAG no-cap |
| 06 | [data_handling.md](docs/agent/06_data_handling.md) | Excel BOM 3 kategori, Çukurova format, variable pattern, Türkçe lowercase |
| 07 | [ui_aesthetic.md](docs/agent/07_ui_aesthetic.md) | claude.ai theme, drill-down daire, no overlay panel, no badges, strategy canvas |
| 08 | [deploy_safety.md](docs/agent/08_deploy_safety.md) | Auto-deploy, auth-write-only, namespacing (griseus_ prefix), global state |
| 09 | [palantir_principles.md](docs/agent/09_palantir_principles.md) | Octopus, OAG > RAG, OODA, Action Layer, Vertex blueprint |
| 10 | [customers_scenario.md](docs/agent/10_customers_scenario.md) | AKTİF: Strategy Canvas Customers Senaryosu — atom kind'ları, slash komutlar, focus modes, son commit'ler |

## Tipik İş Akışı

```
Kullanıcı komutu (ekle/düzelt/feature)
       │
       ▼
[1] atom-preflight  ─── 10 soru, domino haritası, scope netleşir
       │
       ▼
[2] Implementation  ─── tamamı (backend + frontend + WS + ontology + lineage + agent tool)
       │
       ▼
[3] octopus-chain   ─── 9-katman post-audit, RED varsa düzelt
       │
       ▼
[4] git add + commit (Co-Authored trailer) + push origin main  ─── otomatik
       │
       ▼
Vercel deploy ~1-2 dk
```

## Hızlı Referans

- **Üretim:** https://griseus.io · GitHub: https://github.com/GriseusAi/Griseus.git · Branch: `main`
- **Lokal repo:** `/Users/gurkanduruak/Griseus`
- **DB seed:** `server/seed.ts` (server boot'ta otomatik)
- **Tema:** `client/src/lib/claude-theme.ts` (CT, CT_FONT, CT_MONO)
- **Atom registry:** `client/src/lib/palantir-atoms-schema.ts`
- **Migration runner:** `script/run-faz0-migration.ts` (drizzle-kit interactive bypass)
- **Onboard yeni cihaz:** `script/onboard-batch.ts --dir=<path> --base=https://griseus.io`

## Bu Dosyaya Eklenmesi Gereken Şey Ortaya Çıkarsa

`docs/agent/` altındaki ilgili dosyayı güncelle. AGENTS.md sadece index — uzun yorum buraya yazılmaz.
