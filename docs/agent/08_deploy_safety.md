# 08 — Deploy & Safety

## Auto-Deploy

> "Her seferinde benim söylememi bekleme." — Gurkan, 2026-04-30

Repo'da kod/içerik değişikliği bittiğinde commit + push **otomatik**.

### Akış

```
Görev tamamlandı
       │
       ▼
git status (-uall ASLA)
       │
       ▼
git add <touched files only>     # asla -A, asla .
       │
       ▼
git commit -m "...
                                    Co-Authored-By: ..."
       │
       ▼
git push origin main
       │
       ▼
Vercel auto-deploy ~1-2 dk
       │
       ▼
Kısa onay: commit SHA + ne deploy edildi
```

### Push Sonrası

- Sadece kısa onay mesajı: commit SHA + ne deploy edildi
- Vercel preview/prod URL'sine bakmak için bekleme

### Sadece Şunlarda Dur ve Sor

- Build/type check'te **YENİ** hata var (önceden var olanlar geçer)
- octopus-chain veya atom-preflight kırmızı işaret veriyor
- Commit edilecek değişiklik kullanıcının tarif ettiği scope dışına taşmış
- Açıkça WIP/yarım

### Devre Dışı Olduğu Durumlar

- "Commit etme" / "push'lama" gibi açık talimat var
- Konuşma açıkça araştırma/keşif modunda

## Auth Middleware — SADECE WRITE

Tüm API endpoint'lere `requireAuth` ekleme production'ı KIRDI (2026-04-02):

- Frontend login olmadan API çağrıları yapıyor (çoğu sayfa unauthenticated çalışıyor)
- 401 dönünce tüm sayfalar boş geldi
- Revert edildi

### Kural

```ts
// GET   → açık (no auth)
// POST  → requireAuth
// PUT   → requireAuth
// PATCH → requireAuth
// DELETE → requireAuth
```

### Deploy Öncesi Kontrol

1. `npm run build` + production mode test
2. `SESSION_SECRET` gibi env var'ları deploy hedefinde kontrol
3. Büyük altyapı değişikliklerini tek commit yerine **küçük adımlarla** deploy et

### Yeni Endpoint Eklerken

Frontend integration noktası **kullanıcı tarafından erişilen komponent** olmalı, dosya adına göre tahmin yapma.

Örnek tuzak: `engine.tsx` 2026-04-10'da orphan çıktı (App.tsx router'ından silinmiş, comment kaldı). Gerçek agent UI = `client/src/components/AgentPanel.tsx` (slide-out panel) ve `/api/v1/agent/chat` (non-streaming) çağırıyor.

**Doğrulama:**
1. App.tsx router'ında route var mı?
2. Hangi component endpoint'i çağırıyor? (Grep)
3. O component nerede mount oluyor?

## Palantir-Style Namespacing (Schema Conflict)

Çakışan backing table adı çıkınca:

- **Legacy tablo dokunulmaz** — farklı domain olabilir, prod data taşıyor olabilir
- **Yeni tablo namespace prefix alır** — `griseus_<original_name>`
- Foundry analoğu: `ri.ontology.main.<name>`

### Drizzle Pattern

```ts
export const workOrders = pgTable("griseus_work_orders", {  // backing isim
  // ...
});
// export ismi (workOrders) ve canvas apiName ("WorkOrder") DEĞİŞMEZ
```

### Migration Pattern

```sql
CREATE TABLE IF NOT EXISTS griseus_work_orders (...);
UPDATE ontology_object_types
   SET backing_table = 'griseus_work_orders'
 WHERE id = '<ontology_id>';
```

### Audit

Çakışma tespiti için: `script/audit-table-conflicts.ts` (referans)

### Migration Runner

drizzle-kit interactive bypass için: `script/run-faz0-migration.ts` — pg client ile direkt CREATE TABLE IF NOT EXISTS koşturur.

## Octopus Chain Trigger Listesi (BLOCKING)

Aşağıdaki path'lerden HERHANGİ BİRİ → octopus-chain otomatik post-audit:

- `/api/import/bulk/{stock,bom,sales,products}`
- `/api/stock/movements` (her movement_type)
- `/api/component-stock/update`
- Script onboard (`onboard-batch.ts`, `seed*`)
- `bom_items`, `component_stock`, `stock_levels`, `sales_history` yazma
- Yeni cihaz ekleme
- BOM/tier yapısı değişikliği
- Intelligence/bom/whatif/impact motorlarını etkileyen kod deploy

## Pre-Mutation Snapshot

Her büyük mutation öncesi:

```
POST /api/foundry/snapshots
```

Rollback hazır olur. octopus-chain RED bulursa direkt geri dönülebilir.

## Test Data Reset

Çukurova gerçek satış verisi geldiğinde sentetik Z silinecek:

```
DELETE /api/planning/history/:sku
POST   /api/import/bulk/sales
```
