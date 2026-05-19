import { Router } from "express";

const router = Router();

const MONTHS = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];

const dealerSemanticLayer = [
  {
    dealerId: "deltaterm-isi",
    openOrders: 42,
    inProduction: 18,
    readyToShip: 9,
    blocked: 4,
    factoryRelation: "Gebze fabrika -> Maltepe servis/perakende hatti",
    bottleneck: "GSA30 on kapak seti",
    seasonalTotalAvg: [15, 14, 16, 18, 20, 22, 24, 27, 31, 36, 39, 35],
  },
  {
    dealerId: "optimum-muhendislik",
    openOrders: 27,
    inProduction: 11,
    readyToShip: 6,
    blocked: 2,
    factoryRelation: "Gebze fabrika -> Kadikoy proje/premium bayi hatti",
    bottleneck: "GSS20P dimmer modul",
    seasonalTotalAvg: [10, 9, 11, 12, 13, 15, 16, 18, 22, 26, 29, 24],
  },
  {
    dealerId: "duz-isitma",
    openOrders: 53,
    inProduction: 24,
    readyToShip: 13,
    blocked: 6,
    factoryRelation: "Gebze fabrika -> Pendik/Tuzla sanayi ve sahil hatti",
    bottleneck: "BH.50ST.SV boru govde",
    seasonalTotalAvg: [18, 17, 19, 21, 23, 26, 28, 32, 38, 43, 47, 40],
  },
  {
    dealerId: "avrupa-isitma",
    openOrders: 34,
    inProduction: 16,
    readyToShip: 7,
    blocked: 5,
    factoryRelation: "Gebze fabrika -> Ikitelli endustriyel bayi hatti",
    bottleneck: "BH.55ST.SV reflektor",
    seasonalTotalAvg: [12, 11, 13, 15, 17, 18, 20, 23, 29, 34, 38, 32],
  },
];

router.get("/semantic", (_req, res) => {
  const totals = dealerSemanticLayer.reduce(
    (acc, item) => ({
      openOrders: acc.openOrders + item.openOrders,
      inProduction: acc.inProduction + item.inProduction,
      readyToShip: acc.readyToShip + item.readyToShip,
      blocked: acc.blocked + item.blocked,
    }),
    { openOrders: 0, inProduction: 0, readyToShip: 0, blocked: 0 },
  );

  res.json({
    source: "dealer_network_semantic_seed_v1",
    confidence: "scenario_seed",
    months: MONTHS,
    factory: {
      id: "gebze-factory",
      name: "CUKUROVA ISI FABRIKA",
      semanticRole: "production_source",
      relation: "factory_fulfills_dealer_orders",
    },
    totals,
    dealers: dealerSemanticLayer,
  });
});

export default router;
