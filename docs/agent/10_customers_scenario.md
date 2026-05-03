# 10 — Customers Scenario (Strategy Canvas)

> Üzerinde aktif çalışılan: `/ontology` (Strategy Canvas) — Customers Senaryosu sahnesi.
> Ana dosya: `client/src/pages/strategy-canvas.tsx` (~7140 satır).
> Snapshot: 2026-05-03 commit `32ae96c`.

## TL;DR

`/ontology` sayfasında bir **canvas/whiteboard** sahnesi. Müşteri (8) → kategori (2) → cihaz (11) → akış (3 stage) → fabrika zinciri. Atomlar **draggable**, edge'ler **bezier**, **slash komutlarla** sipariş/teslim/üretim hattı modellenir. Sağ alt overlay panel YASAK; her şey komut bar'dan yürür.

Default seed sahnesi sadeleştirildi (2026-05-03): müşteriden çıkan default sipariş ok'ları + müşteri-bağlı pill'ler **kaldırıldı**. Üretim hatlarını kullanıcı `/uretim-hatti` (alias `/siparis`) ile baştan kuruyor.

## Aktif Yasaklar (Cross-ref `07_ui_aesthetic.md`)

1. **Sağ alt SelectionPanel** — `/ontology`'de `return null` (commit `82c6055`)
2. **Atom altı meta badge** (#sipariş, ×adet) — render YASAK (commit `8ba9f3c`, migration `griseus_badge_purge_v1` ile DB temizlendi)
3. **Sabit overlay panel** — yeni feature canvas'a fixed-position panel ile gelirse kabul ETME, slash komut'a model et
4. Pill ok'u kategoriye değil **müşteriye** gider (G2/G3 pattern, commit `02cef55` + `bce0ec6`)

## Atom Kind'ları (16)

```ts
type SceneAtomKind =
  | "label" | "customer-chip" | "category" | "product" | "stage"
  | "factory" | "component" | "bom-item" | "subassembly"
  | "lead-pill" | "deadline-pill" | "flask"
  | "supply-bracket" | "timeline-s1" | "timeline-s2"
  | "production-line";
```

Her atom `{ id, kind, label, x, y, w, h, highlight?, sub? }`. Pozisyonlar `scenePositions` state'te kullanıcı drag ettikçe persist (localStorage).

## Default Seed Atomlar (`makeDefaultSceneAtoms`)

### Customers (sol kolon)

- `lbl-customers` (label, x=60, y=380)
- 8 customer-chip x=240'ta, y=100..632, h=40:
  - `c-En`, `c-E3` (highlight green), `c-E2`, `c-E1`
  - `c-G1`, `c-G2` (highlight blue), `c-G3` (highlight blue), `c-Gn`

### Categories (orta kolon — büyük gri daireler 150×150)

- `cat-elektrikli` (x=540, y=220)
- `cat-gazli` (x=540, y=540)

### Products (xls reçetelerinden, x=800)

**Elektrikli (üst yarı):**
- `p-GSA15` (highlight green), `p-GSA20`, `p-GSA30`, `p-GSS20P`, `p-GSS40P`

**Gazlı (alt yarı):**
- `p-ELT.5-7`, `p-ELT.7-11`, `p-BH.50ST.SV`, `p-BH.50UT.SV`
- `p-BH.55ST.SV` (highlight blue), `p-BH.55UT.SV`

### Lead Pills (cihaz lead time)

- `pill-lead-GSA15` (30 gün, green), `pill-lead-GSS20P` (10 gün)

### Stages (akış kolonu, x=1100)

- `stg-uretim` (Üretim, y=200), `stg-depo` (Depo, y=380), `stg-satis` (Satış, y=560)

### Factory & Flask & Timeline

- `fact` (Fabrika, x=1340, y=420, 150×130)
- `flask` (Tepkime · GSA15 GSS20P, x=760, y=880, 280×100)
- `tl-s1` (S1 timeline kartı, x=80, y=1050, 760×380)
- `tl-s2` (S2 timeline kartı, x=920, y=1050, 800×380)

## Default Seed Edges (`SCENE_EDGES`)

**Aktif kalanlar:**
- `lbl-customers` → 8 chip (faint dashed)
- `cat-elektrikli` (e port) → 5 elektrikli cihaz (w port, dashed, GSA15 ve GSS20P primary green, diğerleri faint)
- `cat-gazli` (e port) → 6 gazlı cihaz (BH.55ST.SV primary blue, diğerleri faint)
- `flask` ↔ `p-GSA15` & `p-GSS20P` (görsel bağ, dashed)
- `flask` → `tl-s1`, `tl-s2`

**Kaldırılanlar (2026-05-03):**
- `c-E3 → cat-elektrikli (x200)` — commit `7d830e3`
- `c-G2 → cat-gazli (x50)` — commit `7d830e3`
- Mamul → Stage → Fabrika ok'ları — commit `ed05009`
- Lead pill → stage ok'ları — commit `ed05009`
- Müşteri-bağlı default deadline pill'leri — commit `7d830e3`
- Tüm müşteri custom edge'leri (one-time migration v2) — commit `03b1ce0`

> **Why:** Kullanıcı üretim zincirini `/uretim-hatti` komutu ile baştan kuracak. Default seed sadece "yapısal iskelet" (müşteri/kategori/cihaz/stage/fabrika atom'ları + kategori→cihaz fan edge'leri).

## Slash Komut Sistemi (`COMMAND_DEFS`, satır 2776)

| Komut | Alias | Steps | Aksiyon |
|-------|-------|-------|---------|
| `/teslim` | `deadline`, `tarih` | deadline | Seçili atom(lar)a teslim pill — `ensureDeadlinePill(id, deadline)` |
| `/üretim` | `uretim`, `production` | days (sayı) | Seçili atom(lar)a üretim süresi pill — `ensureProductionPill(id, days)` |
| `/üretim-hattı` | `uretim-hatti`, `hat`, `production-line`, **`siparis`**, **`sipariş`**, **`order`** | deviceType, quantity, deadline | Üretim hattı oluştur — meta yaz + teslim pill (G2/G3 pattern) + manual focus |
| `/sil` | `clear`, `temizle` | — | Seçili atom(lar)ın meta + pill'lerini temizle |
| `/gix` | `ai`, `ai-sor`, `agent` | — | Seçili atomları AI agent'a context yolla (panel açılır) |
| `/diyagram-çiz` | `diyagram-ciz`, `diyagram`, `chart`, `compare` | — | 2+ atom için diyagram modal aç |

`COMMAND_DEFS` dışına çıkma — yeni feature istiyorsan ya yeni komut ekle ya mevcut komutu genişlet. Sabit overlay panel veya buton ekleme.

### `/uretim-hatti` (alias `/siparis`) — G2/G3 Pattern Detayı

**3 step:**
1. Cihaz tipi (örn `BH.55ST.SV`)
2. Kaç adet (sayı)
3. Teslim tarihi (örn `2026-07-20`)

**2026-05-03 güncel davranış:** Komut artık sadece pill/meta çizmez; seçili müşteri/kategori/ürün bağlamından gerçek `Order` kaydı üretir, aynı siparişi `flaskItems` içine ekler ve mevcut `/api/strategy/reaction-equation` read-only backend hattını tetikleyerek S1/S2 timeline atomlarını canlı reaction sonucu ile besler. Tarih girdisi `YYYY-MM-DD`, `15.05.2026` veya `15 Mayıs` formatından ISO tarihe normalize edilir. Customers scene açıkken legacy `OrderBlock`/`StrategyPanel` render edilmez; aksi halde eski workbench kartları sahne atomlarının üstüne biner.

**Görsel üretim hattı:** Kullanıcı sadece müşteri atomunu seçse bile komut `deviceType` üzerinden `DEVICE_REGISTRY` içinden ürün ve kategori atomunu infer eder. Hattı sahneye şu custom edge zinciriyle çizer: hat kartı → müşteri → teslim pill → kategori → mamul (`xadet`) → Üretim → Depo → Satış → Fabrika ve mamul → flask. Manual focus seçili atomlara ek olarak bu inferred hat atomlarını da kapsar; müşteri chip'e tekrar tıklayınca aynı hat focus BFS ile görünür kalır.

**2026-05-03 etkileşim güncellemesi:** `/üretim-hattı` artık ayrıca seçilebilir `production-line` atomu üretir. Bu hat kartı arkada gizlenen edge setinin yüzeye çıkmış kontrol objesidir. Tıklanınca canvas üstünde inspector açılır: adet ve teslim tarihi değiştirilebilir, reaction hesabı yeniden koşar, `xadet` edge label'ı ve teslim pill label'ı güncellenir. "hattı sil" aksiyonu line card + deadline pill + o hatta ait `groupId` edge'leri + order/flask item kaydını temizler. Böylece üretim senaryosu sadece çizgi değil, düzenlenebilir operasyon nesnesidir.

**2026-05-03 analiz dock güncellemesi:** Vertex-style simülasyon dock'u artık açık/küçültülmüş/gizli mod taşır. Sağ üstte `-` küçültür, `x` gizler; gizlenince küçük `Simülasyon` butonu ile geri açılır. Dock beyaz fixed panel gibi davranmaz; koyu, kompakt operasyon konsolu olarak canvas ve komut bar'ı daha az kaplar.

**2026-05-03 zincir bütünlüğü düzeltmesi:** Üretim hattı silme/güncelleme artık sadece inspector butonuna bağlı değildir. `production-line` atomu Delete/Backspace veya sol toolbar üzerinden silinirse aynı merkezi cleanup çalışır: line atom, deadline pill, `groupId === productionLineId` edge'leri, order/flask item ve reaction sonucu birlikte temizlenir. Adet/tarih güncelleme de `managedEdgeIds` boş kalmış eski hatlarda bile `groupId` edge'lerini tarar; `xadet` label'ı, pill label'ı ve S1/S2 beslemesi aynı anda değişir.

**2026-05-03 orphan guard:** Customers scene mount olduğunda canlı `production-line` atom listesi tek gerçek kaynak kabul edilir. `sceneCustomAtoms` içinde karşılığı olmayan eski `order_pline*`, `flask_pline*`, eski `pl_*` order/flask kayıtları otomatik temizlenir; bu, silinmiş GSS20P gibi eski simülasyon girdilerinin dock'ta yaşamaya devam etmesini engeller.

**`apply()` ne yapar (satır 2819):**

```
1) Tüm seçili atomlara meta yaz:
   atomMeta[id] = { orderNumber: deviceType, quantity }
   // Bu meta artık BADGE OLARAK RENDER EDİLMEZ (purge migration var),
   // sadece state corruption tutucu / migration için tutuluyor.

2) Müşteri / kategori / ürün bul:
   customerId = ids.find(kind === "customer-chip")
   categoryId = ids.find(kind === "category")
   productId  = ids.find(kind === "product")

3) Teslim pill konumu + edge:
   positionParent = categoryId ?? customerId ?? productId ?? ids[0]
   edgeTarget     = customerId ?? categoryId ?? productId ?? ids[0]
   ensureDeadlinePill(positionParent, deadline, edgeTarget)
   // Pozisyon kategori altında stack, OK her zaman MÜŞTERİYE gider.

4) setManualFocus(ids)
   // /uretim-hatti'nin seçtiği atomlar belirginleşir, diğerleri dim.
   // ESC ile temizlenir.

5) createProductionLine(...)
   // Order + FlaskItem yaratır, reaction-equation sonucunu timeline atomlarına yansıtır.

6) inferred visual line
   // deviceType'tan kategori+mamul bulunur; hat→müşteri→teslim→kategori→mamul→stage→fabrika hattı çizilir.
   // Edge'ler productionLineId groupId'si taşır; hat kartı üzerinden düzenleme/silme yapılır.
```

Pill ID konvansiyonu: `pill-d-{parentId}-{rand}` — multi-delivery için yeni pill, eski overwrite edilmez.

## Edge Label Tıklanabilir (commit `0289a56`, `ef40409`)

Edge label'a tıklayınca `EdgeCommandPopover` açılır — o edge için komut atayabilirsin (örn `x50`). `edgeCommands: Record<string, string>` state'te tutulur (`griseus_edge_commands_v1` localStorage).

SVG pointer-events cascade fix'lendi (`ef40409`) — label tıklanabilir, edge altındaki atomları bloklar.

## Focus Modes (3 katman, öncelik sırası)

```
manualFocusIds (set)         ← /uretim-hatti komutu set eder
   ↓ daha düşük öncelik
focusedCustomerId (string)   ← müşteri-chip click toggle
   ↓
(focus yok)                  ← her şey full opacity
```

### Customer Focus (chip tap)

Müşteri-chip'e tıkla → o chip'in primary-edge BFS reachable subgraph'ı belirginleşir, geri kalan dim:
- Sadece **primary color** edge'ler izlenir (full hex `#xxxxxx` veya `rgba alpha ≥ 0.7`)
- Faint edge'ler (kategori → ikincil cihaz, alpha 0.55) takip edilmez
- Pill bonus: pill atomlar reachable node'a bağlıysa Set'e eklenir
- `lbl-customers` fan'i hariç

### Manual Focus (`/uretim-hatti`)

`manualFocusIds` set'i varsa BFS yapılmaz — kullanıcının seçtiği set olduğu gibi belirginleşir.

### Temizleme

`Esc` veya boş alan tap → `setFocusedCustomerId(null)` + `setManualFocusIds(null)`.

## Drill-Down (Cihaz BOM Tier 1-2)

Cihaza tıkla → `expandedDeviceIds` Set'te toggle, sahnede yan tarafta o cihazın BOM'u açılır.
- Tier 1 yarı-mamül → DAİRE (`subassembly` kind), tıklanırsa Tier 2 alt bileşenleri açılır
- Tier 1 flat → dikdörtgen (`bom-item` kind)
- Source: `shared/strategy-bom-tree.json` (xls'lerden türetildi)
- Çoklu cihaz aynı anda açılabilir, her biri ayrı kolon

`bomEdges` parent-child dashed edge'leri runtime'da üretir, primary color BFS bunu da takip eder.

## Migration'lar (idempotent, localStorage flag'li)

| Flag | Ne yapar |
|------|----------|
| `griseus_badge_purge_v1` | Tüm `atomMeta`'dan `orderNumber + quantity` field'larını siler (badge sistemi kaldırıldı) |
| `griseus_ankara_bayisi_purge_v1` | "Ankara Bayisi" pairwise edge'leri + matching meta entry'leri siler |
| `griseus_pill_reposition_v1` | Eski deadline pill formula (parent altı 12px) → yeni (parent solu 60px); kullanıcı manuel sürüklemediyse update |

Yeni migration eklerken aynı pattern: `useRef + useEffect + localStorage flag + tek çalıştır`.

## Reaction Flask & Timeline (S1/S2)

- `flask` atom → `ReactionFlask` component (`client/src/components/reaction-flask.tsx`)
- `tl-s1`, `tl-s2` → `ReactionGantt` (`reaction-gantt.tsx`)
- Tepkime hesabı: kullanıcı flask'a cihaz "atar" → S1/S2 senaryolarına gantt çıkar
- 2026-05-03 güncel UI: Customers scene açıkken eski fixed `ReactionGantt` paneli render edilmez. Reaction sonucu canvas içinde alttaki Vertex-style analiz dock'una akar: sol seri listesi, orta S1/S2 zaman eğrisi, sağ önerilen aksiyon/darboğaz özeti. Böylece üretim hattı `müşteri → teslim → kategori → mamul → Üretim → Depo → Satış → Fabrika` graph'ı ile simülasyon sonucu aynı çalışma yüzeyinde okunur.

## State Map (Persist)

| State | localStorage key | İçerik |
|-------|------------------|--------|
| `customers` | `griseus_customers_v1` | Customer chip listesi (default 8 + custom) |
| `customersPanelOpen` | `griseus_customers_panel_open_v1` | Sol panel açık/kapalı |
| `expandedCustomers` | `griseus_customers_expanded_v1` | Customer card expand state |
| `scenePositions` | `griseus_scene_positions_v1` | Atom pozisyon override (drag sonrası) |
| `sceneAtomMeta` | `griseus_scene_atom_meta_v1` | Pill ID, deadline, productionDays |
| `sceneCustomAtoms` | `griseus_scene_custom_atoms_v1` | Komut'la eklenen pill/atom'lar |
| `sceneCustomEdges` | `griseus_scene_custom_edges_v1` | Komut'la eklenen edge'ler |
| `edgeCommands` | `griseus_edge_commands_v1` | Edge label'a atanan komutlar |
| `expandedDeviceIds` | (state, persist edilebilir) | Açık BOM drill-down cihazları |

## Son 15 Commit (Strategy Canvas)

```
ed05009 chore(strategy): mamul → stage ve stage → fabrika default ok'larını sil
03b1ce0 chore(strategy): tüm müşteri custom edge'lerini tek-seferlik temizle (v2)
7d830e3 chore(strategy): müşteriden çıkan/giren default seed ok'larını ve pill'leri sil
fe16daa fix(strategy): MAMUL kutularına canlı maxProducible bağlantısı
82c6055 feat(strategy): /gix ve /diyagram-ciz komutları, sağ alt SelectionPanel gizli
a0800a3 feat(strategy): /uretim-hatti komutu — seçili atomları manuel üretim hattı odağına alır
718d5dc feat(strategy): sol-click ile turuncu seçim, shift+click multi (mevcut tap eylemi korunur)
bce0ec6 fix(strategy): /siparis müşteriden iki ok çıkarsın (G2/G3 pattern)
3c6ec0a feat(strategy): müşteri odağı sadece primary üretim hattını belirginleştirsin
02cef55 fix(strategy): teslim pill OK'u kategoriye değil müşteriye bağlansın
ef40409 fix(strategy): edge label tıklanabilirlik — SVG pointer-events cascade
8ba9f3c feat(strategy): /siparis 2-soru, badge sil, teslim pill kategoriye bağlan
8de11f4 feat(strategy): Customers Senaryosu'nda 2+ atom seçince SelectionPanel açılsın (sonra geri alındı 82c6055)
0289a56 feat(strategy): edge label tıklanabilir + komut atanabilir (x50 vb)
32c0c7e feat(strategy): /uretim komutu — seçili atom(lar)a üretim süresi pill'i ekler
```

## Yeni Feature Eklerken Sıra

1. **atom-preflight skill** çalıştır (10 soruluk domino)
2. Yeni komutsa `COMMAND_DEFS` array'ine ekle (`name, aliases, description, minSelected, steps, apply`)
3. `apply()` içinde `helpers` interface'ini kullan: `applyMeta`, `clearMeta`, `addEdge`, `ensureDeadlinePill`, `ensureProductionPill`, `setManualFocus`, `askAgent`, `openDiagram`
4. Yeni atom kind ekleyeceksen `SceneAtomKind` union'ı + render switch'i + atomToSelectedItem mapping'i
5. State persist gerekiyorsa yeni localStorage key (pattern: `griseus_<name>_v<n>`)
6. Migration gerekiyorsa idempotent useEffect + flag
7. **octopus-chain skill** çalıştır (post-mutation)
8. Auto-deploy (commit + push)

## Bilinen Pending / Açık

- Default seed sadeleştirildi ama **kullanıcı henüz yeni üretim hatlarını kurmadı** — bir sonraki adım: `/uretim-hatti` komutu ile G2 ve G3 üretim zincirleri yeniden çizilecek
- `/diyagram-ciz` modal recharts entegrasyonu mini-bar yerine
- Edge command sistemi şu an sadece label override; gelecekte edge'e attached "x50" hesabı tepkime gantt'ı besleyebilir
