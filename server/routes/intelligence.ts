import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  productionLines,
  schedules,
  capacityMetrics,
  geWorkers,
  workerCapabilities,
  facilities,
} from "../../shared/schema";

const router = Router();

// ══════════════════════════════════════════════════════════════════════
// POST /simulate/capacity — What-if kapasite simülasyonu
// ══════════════════════════════════════════════════════════════════════

router.post("/simulate/capacity", async (req, res) => {
  try {
    const { line_id, worker_count, unit_time_min, daily_hours, monthly_days, production_months } = req.body;
    if (!line_id) return res.status(400).json({ message: "line_id is required" });

    const [line] = await db.select().from(productionLines).where(eq(productionLines.id, line_id));
    if (!line) return res.status(404).json({ message: "Line not found" });

    // Current actual output for utilization calc
    const caps = await db.select().from(capacityMetrics).where(eq(capacityMetrics.lineId, line_id));
    const currentActualOutput = caps.reduce((s, c) => s + (c.actualOutput || 0), 0);

    // Baseline values from DB
    const baseWorkers = line.workerCount || 1;
    const baseUnitTime = Number(line.currentUnitTimeMin) || 1;
    const baseDailyHours = Number(line.dailyHours) || 9;
    const baseMonthlyDays = line.monthlyDays || 22;
    const baseProductionMonths = line.productionMonths || 10;
    const theoreticalUnitTime = Number(line.capacityUnitTimeMin) || baseUnitTime;

    // Simulated values (use provided or fallback to current)
    const simWorkers = worker_count ?? baseWorkers;
    const simUnitTime = unit_time_min ?? baseUnitTime;
    const simDailyHours = daily_hours ?? baseDailyHours;
    const simMonthlyDays = monthly_days ?? baseMonthlyDays;
    const simProductionMonths = production_months ?? baseProductionMonths;

    // Calculation helper
    const calc = (unitTime: number, dh: number, md: number, pm: number) => {
      const daily = (dh * 60) / unitTime;
      const monthly = daily * md;
      const yearly = monthly * pm;
      return { daily_capacity: Math.round(daily), monthly_capacity: Math.round(monthly), yearly_capacity: Math.round(yearly) };
    };

    const baseline = calc(baseUnitTime, baseDailyHours, baseMonthlyDays, baseProductionMonths);
    const simulated = calc(simUnitTime, simDailyHours, simMonthlyDays, simProductionMonths);

    const baseUtilization = baseline.yearly_capacity > 0
      ? Math.round((currentActualOutput / baseline.yearly_capacity) * 100)
      : 0;
    const simUtilization = simulated.yearly_capacity > 0
      ? Math.round((currentActualOutput / simulated.yearly_capacity) * 100)
      : 0;

    const deltaUnits = simulated.yearly_capacity - baseline.yearly_capacity;
    const deltaPct = baseline.yearly_capacity > 0
      ? Math.round((deltaUnits / baseline.yearly_capacity) * 100)
      : 0;

    // Dynamic insights
    const insights: string[] = [];
    if (simUtilization > 90) {
      insights.push("Hat kapasitesine yaklaşıyor, darboğaz riski mevcut.");
    }
    if (simWorkers > baseWorkers * 1.3) {
      insights.push(`Personel sayısı %${Math.round(((simWorkers - baseWorkers) / baseWorkers) * 100)} artıyor — yeni personel eğitim süresi hesaba katılmalı.`);
    }
    if (simUnitTime < theoreticalUnitTime) {
      insights.push(`Birim süre (${simUnitTime}dk) teorik kapasitenin (${theoreticalUnitTime}dk) altında — gerçekçi olmayabilir.`);
    }
    if (deltaUnits > 0) {
      insights.push(`Bu senaryo yıllık +${deltaUnits.toLocaleString("tr-TR")} birim ek üretim sağlar.`);
    }
    if (deltaUnits < 0) {
      insights.push(`Bu senaryo yıllık ${Math.abs(deltaUnits).toLocaleString("tr-TR")} birim üretim kaybına yol açar.`);
    }

    res.json({
      baseline: { ...baseline, utilization_pct: baseUtilization },
      simulated: { ...simulated, utilization_pct: simUtilization },
      delta: { units: deltaUnits, percent: deltaPct },
      parameters_used: {
        worker_count: simWorkers,
        unit_time_min: simUnitTime,
        daily_hours: simDailyHours,
        monthly_days: simMonthlyDays,
        production_months: simProductionMonths,
      },
      insights,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /analyze/bottleneck/:line_id — Darboğaz tespiti
// ══════════════════════════════════════════════════════════════════════

router.get("/analyze/bottleneck/:line_id", async (req, res) => {
  try {
    const lineId = Number(req.params.line_id);
    const [line] = await db.select().from(productionLines).where(eq(productionLines.id, lineId));
    if (!line) return res.status(404).json({ message: "Line not found" });

    const scheds = await db.select().from(schedules).where(eq(schedules.lineId, lineId));
    if (scheds.length === 0) return res.json({ line_id: lineId, line_name: line.name, total_weeks: 0, insights: ["Bu hat için schedule verisi bulunamadı."] });

    // Calculate deviation for each week
    const weeks = scheds.map((s) => {
      const planned = s.plannedQty || 0;
      const actual = s.actualQty || 0;
      const deviation_pct = planned > 0 ? Math.round(((actual - planned) / planned) * 100) : 0;
      return { period_value: s.periodValue, planned, actual, deviation_pct };
    });

    const deviations = weeks.map((w) => w.deviation_pct);
    const avgDeviation = Math.round(deviations.reduce((s, d) => s + d, 0) / deviations.length);

    const onTrackWeeks = weeks.filter((w) => w.deviation_pct > -10).length;
    const criticalWeeks = weeks.filter((w) => w.deviation_pct < -30).length;

    const worstWeek = weeks.reduce((worst, w) => w.deviation_pct < worst.deviation_pct ? w : worst, weeks[0]);
    const bestWeek = weeks.reduce((best, w) => w.deviation_pct > best.deviation_pct ? w : best, weeks[0]);

    // Trend: last 4 weeks
    const last4 = weeks.slice(-4);
    let trend: "improving" | "declining" | "stable" = "stable";
    if (last4.length >= 2) {
      const firstHalf = last4.slice(0, 2).reduce((s, w) => s + w.deviation_pct, 0) / 2;
      const secondHalf = last4.slice(2).reduce((s, w) => s + w.deviation_pct, 0) / Math.max(last4.slice(2).length, 1);
      if (secondHalf - firstHalf > 5) trend = "improving";
      else if (firstHalf - secondHalf > 5) trend = "declining";
    }

    // Severity
    let bottleneck_severity: "low" | "medium" | "high" | "critical" = "low";
    if (avgDeviation < -30) bottleneck_severity = "critical";
    else if (avgDeviation < -20) bottleneck_severity = "high";
    else if (avgDeviation < -10) bottleneck_severity = "medium";

    // Insights
    const insights: string[] = [];

    // Find consecutive critical stretch
    const criticalStretch: string[] = [];
    for (const w of weeks) {
      if (w.deviation_pct < -30) criticalStretch.push(w.period_value || "");
      else if (criticalStretch.length >= 2) break;
    }
    if (criticalStretch.length >= 2) {
      const stretchAvg = weeks
        .filter((w) => criticalStretch.includes(w.period_value || ""))
        .reduce((s, w) => s + w.deviation_pct, 0) / criticalStretch.length;
      insights.push(`${criticalStretch[0]}–${criticalStretch[criticalStretch.length - 1]} arası kritik düşüş: ortalama sapma %${Math.round(stretchAvg)}.`);
    }

    const trendLabel = trend === "improving" ? "iyileşiyor" : trend === "declining" ? "kötüleşiyor" : "stabil";
    insights.push(`Son 4 haftada trend ${trendLabel}.`);
    insights.push(`En kötü hafta ${worstWeek.period_value}: %${worstWeek.deviation_pct} sapma.`);

    if (criticalWeeks > weeks.length * 0.3) {
      insights.push(`Haftaların %${Math.round((criticalWeeks / weeks.length) * 100)}'i kritik seviyede — yapısal bir sorun olabilir.`);
    }

    res.json({
      line_id: lineId,
      line_name: line.name,
      total_weeks: weeks.length,
      on_track_weeks: onTrackWeeks,
      critical_weeks: criticalWeeks,
      average_deviation_pct: avgDeviation,
      worst_week: worstWeek,
      best_week: bestWeek,
      trend,
      bottleneck_severity,
      insights,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /analyze/workforce-risk/:facility_id — Personel bağımlılık riski
// ══════════════════════════════════════════════════════════════════════

router.get("/analyze/workforce-risk/:facility_id", async (req, res) => {
  try {
    const facilityId = Number(req.params.facility_id);
    const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
    if (!facility) return res.status(404).json({ message: "Facility not found" });

    // Get all workers for tenant
    const workers = await db.select().from(geWorkers).where(eq(geWorkers.tenantId, facility.tenantId || "cukurova"));
    const workerIds = workers.map((w) => w.id);
    const allCaps = await db.select().from(workerCapabilities);
    const caps = allCaps.filter((c) => workerIds.includes(c.workerId!));

    // Count workers per capability
    const capWorkerMap = new Map<string, number[]>(); // capability_name -> worker_ids
    for (const c of caps) {
      const name = c.capabilityName;
      if (!capWorkerMap.has(name)) capWorkerMap.set(name, []);
      capWorkerMap.get(name)!.push(c.workerId!);
    }

    const uniqueCapabilities = capWorkerMap.size;

    // Single point of failures: only 1 worker has this capability
    const singlePointFailures: { capability_name: string; sole_worker_name: string }[] = [];
    for (const [capName, wIds] of capWorkerMap) {
      if (wIds.length === 1) {
        const worker = workers.find((w) => w.id === wIds[0]);
        singlePointFailures.push({ capability_name: capName, sole_worker_name: worker?.name || "Unknown" });
      }
    }

    // Critical workers: most unique capabilities
    const workerUniqueMap = new Map<number, string[]>(); // worker_id -> unique capabilities
    for (const [capName, wIds] of capWorkerMap) {
      if (wIds.length === 1) {
        const wId = wIds[0];
        if (!workerUniqueMap.has(wId)) workerUniqueMap.set(wId, []);
        workerUniqueMap.get(wId)!.push(capName);
      }
    }

    const criticalWorkers = workers
      .map((w) => {
        const workerCaps = caps.filter((c) => c.workerId === w.id);
        const uniqueCaps = workerUniqueMap.get(w.id) || [];
        return {
          name: w.name,
          department: w.department,
          capability_count: workerCaps.length,
          unique_capabilities: uniqueCaps,
        };
      })
      .filter((w) => w.unique_capabilities.length > 0)
      .sort((a, b) => b.unique_capabilities.length - a.unique_capabilities.length);

    // Risk score
    const riskScore = uniqueCapabilities > 0
      ? Math.round((singlePointFailures.length / uniqueCapabilities) * 100)
      : 0;

    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (riskScore > 40) riskLevel = "critical";
    else if (riskScore > 25) riskLevel = "high";
    else if (riskScore > 10) riskLevel = "medium";

    // Insights
    const insights: string[] = [];
    if (singlePointFailures.length > 0) {
      insights.push(`${singlePointFailures.length} yetki sadece tek kişiye bağlı — bu kişiler ayrılırsa operasyon durur.`);
    }
    if (criticalWorkers.length > 0) {
      insights.push(`En kritik çalışan: ${criticalWorkers[0].name} — ${criticalWorkers[0].unique_capabilities.length} benzersiz yetkiye sahip.`);
    }

    // Department fragility
    const deptCapCount = new Map<string, number>();
    for (const w of criticalWorkers) {
      const dept = w.department || "Bilinmiyor";
      deptCapCount.set(dept, (deptCapCount.get(dept) || 0) + w.unique_capabilities.length);
    }
    let fragilesDept = "";
    let fragilesCount = 0;
    for (const [dept, count] of deptCapCount) {
      if (count > fragilesCount) { fragilesDept = dept; fragilesCount = count; }
    }
    if (fragilesDept) {
      insights.push(`Departman bazlı en kırılgan: ${fragilesDept} (${fragilesCount} benzersiz yetki riski).`);
    }

    res.json({
      facility_id: facilityId,
      total_workers: workers.length,
      total_capabilities: caps.length,
      unique_capabilities: uniqueCapabilities,
      single_point_failures: singlePointFailures,
      critical_workers: criticalWorkers,
      risk_score: riskScore,
      risk_level: riskLevel,
      insights,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /score/trust/:worker_id — Trust Score hesaplama (v0.1)
// ══════════════════════════════════════════════════════════════════════

router.get("/score/trust/:worker_id", async (req, res) => {
  try {
    const workerId = Number(req.params.worker_id);
    const [worker] = await db.select().from(geWorkers).where(eq(geWorkers.id, workerId));
    if (!worker) return res.status(404).json({ message: "Worker not found" });

    // All workers and their capabilities for ranking
    const allWorkers = await db.select().from(geWorkers);
    const allCaps = await db.select().from(workerCapabilities);

    // Per-worker cap counts
    const workerCapCounts = new Map<number, number>();
    const workerCapTypes = new Map<number, Set<string>>();
    for (const c of allCaps) {
      const wId = c.workerId!;
      workerCapCounts.set(wId, (workerCapCounts.get(wId) || 0) + 1);
      if (!workerCapTypes.has(wId)) workerCapTypes.set(wId, new Set());
      workerCapTypes.get(wId)!.add(c.capabilityType || "authorization");
    }

    const maxCapCount = Math.max(...Array.from(workerCapCounts.values()), 1);
    const thisCapCount = workerCapCounts.get(workerId) || 0;
    const thisCapTypes = workerCapTypes.get(workerId) || new Set();

    // Scoring
    const capabilityScore = Math.round((thisCapCount / maxCapCount) * 40);
    const diversityScore = Math.round((thisCapTypes.size / 3) * 30);
    const experienceScore = 30; // placeholder until hire_date is utilized
    const trustScore = Math.min(capabilityScore + diversityScore + experienceScore, 100);

    // Rank all workers
    const scores = allWorkers.map((w) => {
      const cc = workerCapCounts.get(w.id) || 0;
      const ct = workerCapTypes.get(w.id) || new Set();
      return {
        id: w.id,
        score: Math.min(Math.round((cc / maxCapCount) * 40) + Math.round((ct.size / 3) * 30) + 30, 100),
      };
    }).sort((a, b) => b.score - a.score);

    const rank = scores.findIndex((s) => s.id === workerId) + 1;
    const percentile = Math.round(((allWorkers.length - rank) / allWorkers.length) * 100);

    // Insights
    const insights: string[] = [];
    if (trustScore >= 80) insights.push("Yüksek güvenilirlik skoru — kritik görevler için uygun.");
    else if (trustScore >= 60) insights.push("Orta düzey güvenilirlik — yetki genişletme potansiyeli var.");
    else insights.push("Düşük skor — ek eğitim ve yetki kazanımı önerilir.");

    if (thisCapCount >= maxCapCount * 0.8) insights.push(`En çok yetkiye sahip çalışanlardan biri (${thisCapCount} yetki).`);
    if (rank <= 3) insights.push(`Tüm çalışanlar arasında ${rank}. sırada.`);

    res.json({
      worker_id: workerId,
      worker_name: worker.name,
      trust_score: trustScore,
      breakdown: {
        capability_score: capabilityScore,
        diversity_score: diversityScore,
        experience_score: experienceScore,
      },
      rank,
      percentile,
      total_workers: allWorkers.length,
      insights,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
