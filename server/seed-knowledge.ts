import { upsertChunks } from "./rag";

// ══════════════════════════════════════════════════════════════════════
// Knowledge Base Seed — Çukurova Isı domain bilgisi
// Kategoriler: company, bom, production, supplier, competitor, sales, operator
// ══════════════════════════════════════════════════════════════════════

const KNOWLEDGE_CHUNKS = [
  // ── ŞİRKET BİLGİSİ ──
  {
    content: `Çukurova Isı Sistemleri, 30+ yıllık HVAC üreticisi, Adana merkezli. Türkiye'nin önde gelen endüstriyel ısıtıcı üreticilerinden. Ana uzmanlık alanı: Seramik plakalı radyant ısıtıcılar ve endüstriyel ısıtma çözümleri. Fabrika Adana'da, üretim kapasitesi aylık ~1000 adet. Yıllık üretim sezonu 10 ay (Haziran-Temmuz bakım dönemi).`,
    category: "company",
    metadata: { priority: "high" },
  },
  {
    content: `Çukurova Isı'nın hedef pazarı: Büyük fabrikalar, depolar, spor salonları, camiler, seralar ve endüstriyel alanlar. Müşteri profili B2B ağırlıklı — bayiler, tesisat firmaları ve doğrudan kurumsal satışlar. İhracat potansiyeli: Orta Doğu, Kuzey Afrika ve Türki Cumhuriyetler.`,
    category: "company",
    metadata: { priority: "medium" },
  },

  // ── ÜRÜN BİLGİSİ ──
  {
    content: `Ana ürün: ELT.7-11 (Goldsun Elite Seramik Plakalı Camlı Radyant Isıtıcı). Endüstriyel radyant ısıtıcı, doğalgaz veya LPG ile çalışır. Yüksek verimli seramik plaka teknolojisi, camlı gövde ile ışıma ile ısıtma sağlar. Büyük hacimleri verimli ısıtmak için tasarlanmış.`,
    category: "bom",
    metadata: { product: "ELT.7-11", priority: "high" },
  },
  {
    content: `ELT.7-11 Ürün Ağacı: 43 bileşen, 3 tier yapısı. Tier 1: 37 direkt malzeme (ana gövde, cam, seramik plakalar, reflektörler, borular, kablo takımları, vidalar, contalar vb.). Tier 2: 1 yarı mamül — Brülör (27.125). Tier 3: 5 brülör alt bileşeni (brülör gövdesi, memesi, elektrotu, ateşleme kablosu, sensör). Üretim yapıldığında TÜM bileşenler reçeteden otomatik düşer — bu Griseus'un en kritik özelliği.`,
    category: "bom",
    metadata: { product: "ELT.7-11", priority: "high" },
  },
  {
    content: `Brülör (27.125) yarı mamüldür — stokta 0 olabilir, bu kriz değildir. 5 alt bileşenden (brülör gövde, meme, elektrot, ateşleme kablosu, sensör) montajlanır. Brülör montajı ayrı iş emri gerektirir. Brülör alt parçaları yeterliyse üretim devam edebilir. Kapasite hesabında brülör stoku + monte edilebilir brülör sayısı birlikte değerlendirilmeli.`,
    category: "bom",
    metadata: { component: "27.125", type: "sub_assembly", priority: "high" },
  },

  // ── KRİTİK BİLEŞENLER ──
  {
    content: `KRİTİK DARBOĞAZ: Paslanmaz Reflektör Tutucu (27.031) — her ürün için 2 adet gerekli, EN KRİTİK darboğaz bileşen. Tedarik süresi uzun, özel üretim. Stok 500'ün altına düştüğünde ALARM. Bu bileşen tükendiğinde tüm üretim durur. Minimum sipariş miktarı: 1000 adet.`,
    category: "bom",
    metadata: { component: "27.031", priority: "critical", required_per_unit: 2 },
  },
  {
    content: `Düşük stok izlenmesi gereken bileşenler: Elektrot Tutucu (27.061) — hassas bileşen, kırılgan, fire oranı yüksek. Kablo Takımı H Tipi (27.116) — elektrik bağlantısı için kritik, tedarikçi tek kaynak. İç Koli Boru Seperatör (27.026) — ambalaj bileşeni ama yoksa sevkiyat yapılamaz.`,
    category: "bom",
    metadata: { priority: "high" },
  },

  // ── ÜRETİM KURALLARI ──
  {
    content: `Üretim akışı: Hammadde girişi → Bileşen stok güncelleme → Brülör montajı (gerekirse) → Ana ürün montajı → Kalite kontrol → Depoya transfer → Satış/Sevkiyat. Her adım Griseus'ta kayıt altına alınır. Üretim girişi yapıldığında 43 bileşen otomatik düşer.`,
    category: "production",
    metadata: { priority: "high" },
  },
  {
    content: `Üretim kapasitesi hesaplama mantığı: Her bileşenin mevcut stoku / birim başı gerekli miktar = o bileşenle üretilebilecek adet. Minimum olan bileşen = darboğaz = maksimum üretilebilir adet. Brülör yarı mamül olduğu için brülör stoku + alt parçalardan monte edilebilir brülör = efektif brülör kapasitesi.`,
    category: "production",
    metadata: { priority: "high" },
  },
  {
    content: `Günlük üretim hızı tahmini: Son 30 günlük hareket geçmişinden günlük ortalama üretim adedi hesaplanır. Mevcut bileşen stokları / günlük tüketim hızı = stokların kaç gün yeteceği. 15 günden az kalan bileşenler "kritik" olarak işaretlenir ve satın alma önerisi oluşturulur.`,
    category: "production",
    metadata: { priority: "high" },
  },
  {
    content: `Stok hareket tipleri: 'produced' = üretim girişi (in_production artar, bileşenler düşer), 'to_warehouse' = depoya transfer (in_production azalır, in_warehouse artar), 'to_sales' = satış çıkışı (in_warehouse azalır, total_sold artar), 'raw_material_in' = hammadde girişi, 'undo' = geri alma, 'inventory_count' = sayım.`,
    category: "production",
    metadata: { priority: "medium" },
  },
  {
    content: `Üretim sezonu: Eylül-Haziran (10 ay aktif üretim). Temmuz-Ağustos bakım ve revizyon dönemi. Sezon başında (Eylül) en yoğun sipariş dönemi — kış öncesi stok biriktirme. Ocak-Şubat soğuk pik — acil siparişler artar. Sezon planlama bu döngüye göre yapılmalı.`,
    category: "production",
    metadata: { priority: "medium" },
  },

  // ── TEDARİKÇİ BİLGİLERİ ──
  {
    content: `Tedarik zinciri yapısı: Çoğu bileşen yerli tedarikçilerden. Seramik plakalar ve bazı özel parçalar ithal (Çin, İtalya). Ortalama tedarik süresi: Yerli 3-7 gün, ithal 30-45 gün. Reflektör tutucu (27.031) özel üretim — minimum sipariş 1000 adet, tedarik süresi 15-20 gün. Kablo takımı tek tedarikçiden geliyor (risk!).`,
    category: "supplier",
    metadata: { priority: "high" },
  },
  {
    content: `Satın alma kararları: Stok günü < 15 gün olan bileşenler için otomatik satın alma önerisi. Aciliyet seviyesi: Kritik (< 5 gün), Yüksek (5-10 gün), Orta (10-15 gün). Siparişler onay akışından geçer: AI önerisi → Satın alma müdürü onayı → Sipariş. Toplu sipariş indirimi için birden fazla bileşeni aynı tedarikçiden almayı tercih et.`,
    category: "supplier",
    metadata: { priority: "medium" },
  },

  // ── RAKİP İSTİHBARAT ──
  {
    content: `Ana rakipler: Panera (İstanbul) — pazar lideri, geniş ürün yelpazesi, güçlü bayi ağı. Daygas (İzmir) — fiyat odaklı, agresif fiyatlandırma. DemirDöküm — büyük marka, endüstriyel segment'te az aktif ama marka gücü yüksek. Çukurova'nın avantajı: 30 yıllık uzmanlık, yüksek kalite, Adana'dan lojistik avantaj (Güney ve Güneydoğu pazarı).`,
    category: "competitor",
    metadata: { priority: "medium" },
  },
  {
    content: `Rekabet stratejisi: Çukurova Isı, Panera'dan daha yüksek kaliteli ürün sunuyor ancak marka bilinirliği ve bayi ağı daha zayıf. Fiyatlandırma Daygas'a göre premium segment. Hedef: Griseus ile operasyonel verimlilik farkı oluşturmak — rakiplerin hiçbirinin dijital stok yönetimi ve AI destekli üretim planlama sistemi yok. Bu 10X avantaj olacak.`,
    category: "competitor",
    metadata: { priority: "high" },
  },

  // ── OPERATÖR BİLGİLERİ ──
  {
    content: `Üretim şefi günlük sayım yapmalı ama pratikte yapılamıyor — asıl sorun bu. Bileşen stokları gerçek zamanlı girilemiyor. Sonuç: Yönetim gerçek stok durumunu bilemiyor, fazla sipariş veriliyor, bazı bileşenler birikip sermaye bağlıyor, bazıları tükeniyor üretim duruyor. Griseus'un çözdüğü #1 problem: Üretim girişi yapıldığında otomatik bileşen düşümü.`,
    category: "operator",
    metadata: { priority: "critical" },
  },
  {
    content: `Yaygın operatör hataları: 1) Brülör stoku 0 görünce panik — aslında alt parçalardan monte edilebilir. 2) Depoya transfer yapmayı unutma — üretimde birikim olur. 3) Sayım sonrası stok düzeltmesi yapmama. 4) Fire/hurda kaydı tutmama. Agent bu durumları tespit edip uyarmalı ve düzeltme önerisi sunmalı.`,
    category: "operator",
    metadata: { priority: "high" },
  },

  // ── SATIŞ BİLGİLERİ ──
  {
    content: `Satış kanalları: Doğrudan kurumsal satış (%60), bayi ağı (%30), ihracat (%10). Ortalama sipariş: 10-50 adet. Büyük kurumsal siparişler: 100-500 adet (fabrika, sera projeleri). Teslimat süresi taahhüdü: Stokta varsa 3 gün, üretim gerekirse 10-15 iş günü. Sevkiyat öncesi depoda olması şart — üretimdekiler sevk edilemez.`,
    category: "sales",
    metadata: { priority: "medium" },
  },
  {
    content: `Sipariş karşılama stratejisi: Önce depodaki stoktan karşıla. Yetersizse üretimden depoya transfer et. Hâlâ yetersizse yeni üretim planla ve eksik bileşenleri tespit et. Kritik: Müşteriye taahhüt vermeden önce bileşen stoku kontrol edilmeli — aksi halde yarım üretim riski. Agent her sipariş sorusunda otomatik kapasite analizi yapmalı.`,
    category: "sales",
    metadata: { priority: "high" },
  },

  // ── GRISEUS SİSTEM BİLGİSİ ──
  {
    content: `Griseus, Çukurova Isı için Palantir Foundry benzeri bir istihbarat platformu. Ontology-Augmented Generation (OAG) yaklaşımı kullanır — saf RAG'den farklı olarak gerçek veritabanı ontolojisi üzerinden çalışır. Agent gerçek stok verisiyle çalışır, hallücinasyon yapmaz. Yazma tool'ları ile aksiyonlar alabilir (üretim girişi, stok güncelleme, satın alma önerisi).`,
    category: "company",
    metadata: { priority: "high" },
  },
  {
    content: `Griseus proaktif uyarı sistemi: Rules engine sürekli çalışır ve stok seviyelerini izler. Depoda 0 olan ürünler, kritik düşük bileşenler, darboğazlar için otomatik WebSocket uyarıları gönderir. Agent her cevabında proaktif uyarıları kontrol eder ve raporlar. Uyarı seviyeleri: critical (acil), high (yüksek), medium (orta).`,
    category: "company",
    metadata: { priority: "medium" },
  },
];

async function seed() {
  console.log(`[seed-knowledge] Starting — ${KNOWLEDGE_CHUNKS.length} chunks to embed and insert...`);
  const start = Date.now();

  try {
    const count = await upsertChunks(KNOWLEDGE_CHUNKS);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[seed-knowledge] Done! ${count} chunks inserted in ${elapsed}s`);
  } catch (err) {
    console.error("[seed-knowledge] Error:", err);
    process.exit(1);
  }

  process.exit(0);
}

seed();
