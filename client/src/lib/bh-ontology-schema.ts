/**
 * BH Ontoloji Şeması — Palantir Foundry algoritmasına uyarlanmış
 *
 * Palantir'in ObjectType + LinkTypeSideV2 + ActionTypeV2 yapısını
 * bizim BH üretim verimize (4 cihaz + bileşen + yarı mamül + alt parça)
 * uyarlanmış formdur. Veri kendimizin, mantık Palantir'in.
 *
 * Canvas runtime'da her node bu şemadaki tipe göre render ediliyor:
 *   - icon + color displayMetadata'dan
 *   - properties inspector drawer'da gösterilir
 *   - links cardinality'ye göre etiketlenir
 *   - actions aksiyon menüsünü besler
 */

export type PropertyType =
  | "String" | "Integer" | "Double" | "Boolean"
  | "LocalDate" | "Timestamp" | "Enum"
  | "Stock" | "Percentage" | "DaysCount" | "Money";

export type Cardinality = "ONE_ONE" | "ONE_MANY" | "MANY_MANY";
export type ObjectStatus = "ACTIVE" | "EXPERIMENTAL" | "DEPRECATED" | "EXAMPLE";

export interface PropertySpec {
  apiName: string;
  displayName: string;
  type: PropertyType;
  unit?: string;
  enumValues?: string[];
  description?: string;
  /** UI'da property sheet'te gösterilecek mi */
  visibility: "PROMINENT" | "NORMAL" | "HIDDEN";
}

export interface DisplayMetadata {
  /** Unicode glyph — canvas'ta node başlığında kullanılır */
  icon: string;
  /** Ana renk (Palantir Blueprint palet karşılığı) */
  color: string;
  /** Kısa açıklama (hover + inspector header'ı) */
  description: string;
}

export interface ObjectTypeSpec {
  /** rid — Palantir'de ri.ontology... formatında, biz namespaced id kullanırız */
  rid: string;
  /** Canvas'ta ve API'de kullanılan stabil ad */
  apiName: string;
  displayName: string;
  pluralDisplayName: string;
  primaryKey: string; // property apiName'i
  titleProperty: string; // kart başlığında gösterilen property
  properties: PropertySpec[];
  displayMetadata: DisplayMetadata;
  status: ObjectStatus;
  /** Bu object type hangi BOM tier'larında görünür (bizim veri modeline bağ) */
  tierBinding?: "device" | "tier1-component" | "subassembly" | "subcomponent";
}

export interface LinkTypeSide {
  apiName: string;
  displayName: string;
  objectTypeApiName: string;
  cardinality: Cardinality;
  /** ForeignKey tarafı var mı (N tarafında) */
  foreignKeyPropertyApiName?: string;
}

export interface LinkTypeSpec {
  rid: string;
  apiName: string;
  displayName: string;
  /** Bir çift kenar — side A → side B */
  sideA: LinkTypeSide;
  sideB: LinkTypeSide;
  /** Kısa semantic cümle — inspector'da gösterilir */
  sentence: string;
}

export interface ActionParameter {
  apiName: string;
  displayName: string;
  type: PropertyType;
  required: boolean;
  description?: string;
}

export interface ActionTypeSpec {
  rid: string;
  apiName: string;
  displayName: string;
  /** Bu aksiyon hangi ObjectType üzerinde çalışır */
  targetObjectTypes: string[];
  parameters: ActionParameter[];
  /** Kısa açıklama — menüde gösterilir */
  description: string;
  /** Şimdilik placeholder — server implementasyonu sonra */
  status: "ACTIVE" | "PLANNED";
}

/* ═══════════════════════════════════════════════════════════
   BİZİM ONTOLOJİMİZ — 4 ObjectType, 3 LinkType, 4 ActionType
   ═══════════════════════════════════════════════════════════ */

export const BH_OBJECT_TYPES: Record<string, ObjectTypeSpec> = {
  BHDevice: {
    rid: "griseus.ontology.object-type.BHDevice",
    apiName: "BHDevice",
    displayName: "BH Isıtıcı",
    pluralDisplayName: "BH Isıtıcılar",
    primaryKey: "sku",
    titleProperty: "sku",
    status: "ACTIVE",
    tierBinding: "device",
    displayMetadata: {
      icon: "◉",
      color: "#818cf8",
      description: "Siemens/Blackheat serisi son-ürün ısıtıcı cihaz",
    },
    properties: [
      { apiName: "sku", displayName: "SKU", type: "String", visibility: "PROMINENT" },
      { apiName: "modelName", displayName: "Model", type: "String", visibility: "PROMINENT" },
      { apiName: "powerKW", displayName: "Güç", type: "Double", unit: "kW", visibility: "PROMINENT" },
      { apiName: "chamberType", displayName: "Kamara tipi", type: "Enum",
        enumValues: ["ST (Standart)", "UT (U-tip)"], visibility: "NORMAL" },
      { apiName: "maxProducible", displayName: "Max üretilebilirlik", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "historicalPeakMonth", displayName: "Tarihsel pik ay", type: "String", visibility: "NORMAL" },
    ],
  },

  StockComponent: {
    rid: "griseus.ontology.object-type.StockComponent",
    apiName: "StockComponent",
    displayName: "Stok Bileşeni",
    pluralDisplayName: "Stok Bileşenleri",
    primaryKey: "code",
    titleProperty: "code",
    status: "ACTIVE",
    tierBinding: "tier1-component",
    displayMetadata: {
      icon: "◆",
      color: "#60a5fa",
      description: "Zorunlu bir veya daha fazla BH cihazında kullanılan bileşen",
    },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "currentStock", displayName: "Mevcut stok", type: "Stock", unit: "AD", visibility: "PROMINENT" },
      { apiName: "dailyBurnRate", displayName: "Günlük tüketim", type: "Double", unit: "AD/gün", visibility: "PROMINENT" },
      { apiName: "seasonalDays", displayName: "Mevsim-ağırlıklı tükenme", type: "DaysCount", unit: "gün", visibility: "PROMINENT" },
      { apiName: "trend", displayName: "Trend", type: "Enum",
        enumValues: ["accelerating", "increasing", "stable", "decreasing"], visibility: "NORMAL" },
      { apiName: "depletionMonth", displayName: "Tükenme ayı", type: "String", visibility: "NORMAL" },
      { apiName: "status", displayName: "Durum", type: "Enum",
        enumValues: ["critical", "warning", "ok", "abundant", "variable"], visibility: "PROMINENT" },
      { apiName: "isShared", displayName: "Paylaşımlı", type: "Boolean", visibility: "NORMAL" },
      { apiName: "isBottleneck", displayName: "Darboğaz", type: "Boolean", visibility: "PROMINENT" },
    ],
  },

  Subassembly: {
    rid: "griseus.ontology.object-type.Subassembly",
    apiName: "Subassembly",
    displayName: "Yarı Mamül",
    pluralDisplayName: "Yarı Mamüller",
    primaryKey: "code",
    titleProperty: "code",
    status: "ACTIVE",
    tierBinding: "subassembly",
    displayMetadata: {
      icon: "⚙",
      color: "#fbbf24",
      description: "Monte edilmiş, alt parçalardan oluşan bileşen grubu",
    },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "currentStock", displayName: "Efektif stok (hazır+monte)", type: "Stock", unit: "AD", visibility: "PROMINENT" },
      { apiName: "rawStock", displayName: "Ham stok (sadece hazır)", type: "Stock", unit: "AD", visibility: "NORMAL" },
      { apiName: "childrenCount", displayName: "Alt parça sayısı", type: "Integer", visibility: "PROMINENT" },
      { apiName: "assembleCapacity", displayName: "Monte edilebilirlik", type: "Integer", unit: "AD", visibility: "NORMAL" },
    ],
  },

  SubComponent: {
    rid: "griseus.ontology.object-type.SubComponent",
    apiName: "SubComponent",
    displayName: "Alt Parça",
    pluralDisplayName: "Alt Parçalar",
    primaryKey: "nodeId", // parentCode::code
    titleProperty: "code",
    status: "ACTIVE",
    tierBinding: "subcomponent",
    displayMetadata: {
      icon: "↳",
      color: "#a78bfa",
      description: "Yarı mamülü oluşturan alt seviye parça",
    },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "parentSubassembly", displayName: "Üst yarı mamül", type: "String", visibility: "PROMINENT" },
      { apiName: "currentStock", displayName: "Stok", type: "Stock", unit: "AD", visibility: "PROMINENT" },
      { apiName: "tier", displayName: "BOM Tier", type: "Integer", visibility: "NORMAL" },
      { apiName: "requiredPerUnit", displayName: "Yarı mamül başına", type: "Double", visibility: "NORMAL" },
    ],
  },
};

export const BH_LINK_TYPES: Record<string, LinkTypeSpec> = {
  consumes: {
    rid: "griseus.ontology.link-type.consumes",
    apiName: "consumes",
    displayName: "Tüketir",
    sentence: "BH cihazı, bu bileşeni N adet tüketir",
    sideA: {
      apiName: "consumed-components",
      displayName: "Tükettiği bileşenler",
      objectTypeApiName: "BHDevice",
      cardinality: "ONE_MANY",
    },
    sideB: {
      apiName: "consumed-by-devices",
      displayName: "Kullanıldığı cihazlar",
      objectTypeApiName: "StockComponent",
      cardinality: "MANY_MANY",
      foreignKeyPropertyApiName: "usedBy",
    },
  },

  assembles: {
    rid: "griseus.ontology.link-type.assembles",
    apiName: "assembles",
    displayName: "Monte Eder",
    sentence: "Yarı mamül, alt parçalardan monte edilir",
    sideA: {
      apiName: "sub-parts",
      displayName: "Alt parçalar",
      objectTypeApiName: "Subassembly",
      cardinality: "ONE_MANY",
    },
    sideB: {
      apiName: "parent-subassembly",
      displayName: "Üst yarı mamül",
      objectTypeApiName: "SubComponent",
      cardinality: "ONE_ONE",
      foreignKeyPropertyApiName: "parentSubassembly",
    },
  },

  sharedAcross: {
    rid: "griseus.ontology.link-type.sharedAcross",
    apiName: "sharedAcross",
    displayName: "Paylaşılır",
    sentence: "Bileşen, 2+ BH cihazında ortak kullanılır — octopus pattern",
    sideA: {
      apiName: "sharing-devices",
      displayName: "Paylaşan cihazlar",
      objectTypeApiName: "StockComponent",
      cardinality: "MANY_MANY",
    },
    sideB: {
      apiName: "shared-components",
      displayName: "Paylaştığı bileşenler",
      objectTypeApiName: "BHDevice",
      cardinality: "MANY_MANY",
    },
  },
};

export const BH_ACTION_TYPES: Record<string, ActionTypeSpec> = {
  updateStock: {
    rid: "griseus.ontology.action-type.updateStock",
    apiName: "updateStock",
    displayName: "Stok Güncelle",
    description: "Bir bileşenin mevcut stoğunu yeni değere ayarlar (audit log ile)",
    targetObjectTypes: ["StockComponent", "Subassembly", "SubComponent"],
    status: "ACTIVE",
    parameters: [
      { apiName: "code", displayName: "Bileşen kodu", type: "String", required: true },
      { apiName: "newStock", displayName: "Yeni stok", type: "Stock", required: true, description: "Hedef adet" },
      { apiName: "reason", displayName: "Sebep", type: "String", required: false, description: "Sayım / düzeltme / giriş / çıkış" },
    ],
  },

  simulateStock: {
    rid: "griseus.ontology.action-type.simulateStock",
    apiName: "simulateStock",
    displayName: "What-If Simülasyonu",
    description: "Stok değişiminin 4 BH maxProducible'a etkisini DB'ye yazmadan hesaplar",
    targetObjectTypes: ["StockComponent", "Subassembly", "SubComponent"],
    status: "ACTIVE",
    parameters: [
      { apiName: "code", displayName: "Bileşen kodu", type: "String", required: true },
      { apiName: "simulatedStock", displayName: "Simüle stok", type: "Stock", required: true },
    ],
  },

  placeOrder: {
    rid: "griseus.ontology.action-type.placeOrder",
    apiName: "placeOrder",
    displayName: "Sipariş Ver",
    description: "Kritik/darboğaz bileşen için tedarikçiye sipariş talebi oluşturur",
    targetObjectTypes: ["StockComponent", "Subassembly", "SubComponent"],
    status: "PLANNED",
    parameters: [
      { apiName: "code", displayName: "Bileşen kodu", type: "String", required: true },
      { apiName: "quantity", displayName: "Miktar", type: "Integer", required: true },
      { apiName: "deadline", displayName: "Termin", type: "LocalDate", required: false },
    ],
  },

  transferStock: {
    rid: "griseus.ontology.action-type.transferStock",
    apiName: "transferStock",
    displayName: "Stok Transferi",
    description: "İki depo arasında stok hareketi kaydı (ileride tier depolaması)",
    targetObjectTypes: ["StockComponent", "Subassembly"],
    status: "PLANNED",
    parameters: [
      { apiName: "code", displayName: "Bileşen kodu", type: "String", required: true },
      { apiName: "fromLocation", displayName: "Kaynak", type: "String", required: true },
      { apiName: "toLocation", displayName: "Hedef", type: "String", required: true },
      { apiName: "quantity", displayName: "Miktar", type: "Integer", required: true },
    ],
  },
};

/** Yardımcı: GraphNode kind → ObjectTypeSpec */
export function objectTypeForKind(kind: "device" | "component" | "subassembly" | "subcomponent"): ObjectTypeSpec {
  switch (kind) {
    case "device":       return BH_OBJECT_TYPES.BHDevice;
    case "subassembly":  return BH_OBJECT_TYPES.Subassembly;
    case "subcomponent": return BH_OBJECT_TYPES.SubComponent;
    default:             return BH_OBJECT_TYPES.StockComponent;
  }
}

/** Yardımcı: Object type'a çalışabilen action'ları döndür */
export function actionsForObjectType(apiName: string): ActionTypeSpec[] {
  return Object.values(BH_ACTION_TYPES).filter(a => a.targetObjectTypes.includes(apiName));
}

/** Yardımcı: Object type → onu hangi link türleri bağlar */
export function linksForObjectType(apiName: string): Array<{ link: LinkTypeSpec; side: "A" | "B"; role: LinkTypeSide }> {
  const out: Array<{ link: LinkTypeSpec; side: "A" | "B"; role: LinkTypeSide }> = [];
  for (const link of Object.values(BH_LINK_TYPES)) {
    if (link.sideA.objectTypeApiName === apiName) out.push({ link, side: "A", role: link.sideA });
    if (link.sideB.objectTypeApiName === apiName) out.push({ link, side: "B", role: link.sideB });
  }
  return out;
}

/** Cardinality display label */
export function cardinalityLabel(c: Cardinality): string {
  switch (c) {
    case "ONE_ONE":  return "1↔1";
    case "ONE_MANY": return "1→N";
    case "MANY_MANY":return "N↔N";
  }
}

/** Ontology meta özeti — header'da gösterilir */
export function ontologyMeta() {
  return {
    objectTypes: Object.keys(BH_OBJECT_TYPES).length,
    linkTypes: Object.keys(BH_LINK_TYPES).length,
    actionTypes: Object.keys(BH_ACTION_TYPES).length,
    activeActions: Object.values(BH_ACTION_TYPES).filter(a => a.status === "ACTIVE").length,
  };
}
