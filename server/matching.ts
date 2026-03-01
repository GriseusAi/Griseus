import type { Worker, Project, Skill, WorkerSkill, WorkerCertification, TradeCertification } from "@shared/schema";
import { storage } from "./storage";

// ── Trade Name Mapping ──────────────────────────────────────────────────
// Maps worker.trade text → ontology trades.name (mirrors seed-ontology.ts)
const WORKER_TRADE_TO_ONTOLOGY: Record<string, string> = {
  "Electrician": "Electrician",
  "HVAC Technician": "HVAC Technician",
  "Pipefitter": "Plumber/Pipefitter",
  "Plumber": "Plumber/Pipefitter",
  "Structural Ironworker": "Structural Ironworker",
  "Concrete Specialist": "Concrete Worker",
  "Fire Protection": "Fire Protection Specialist",
  "Network Technician": "Low Voltage Technician",
  "Controls Technician": "Controls/BMS Technician",
  "Welder": "Welder",
  "General Labor": "General Labor",
};

// Reverse: ontology name → all worker trade strings that map to it
const ONTOLOGY_TO_WORKER_TRADES: Record<string, string[]> = {};
for (const [workerTrade, ontologyName] of Object.entries(WORKER_TRADE_TO_ONTOLOGY)) {
  if (!ONTOLOGY_TO_WORKER_TRADES[ontologyName]) {
    ONTOLOGY_TO_WORKER_TRADES[ontologyName] = [];
  }
  ONTOLOGY_TO_WORKER_TRADES[ontologyName].push(workerTrade);
}

// ── Type Definitions ────────────────────────────────────────────────────

export interface ScoreBreakdown {
  tradeMatch: number;
  skillProficiency: number;
  certCompleteness: number;
  availability: number;
  experience: number;
  assignmentPenalty: number;
  total: number;
}

export interface SkillDetails {
  tradeSkillCount: number;
  workerMatchedSkills: number;
  avgProficiency: number;
}

export interface CertDetails {
  requiredCertCount: number;
  validCerts: number;
  expiredCerts: number;
  missingCerts: number;
}

export interface WorkerMatchResult {
  worker: Worker;
  score: ScoreBreakdown;
  matchedTrade: string;
  alreadyAssigned: boolean;
  skillDetails: SkillDetails;
  certDetails: CertDetails;
}

export interface ProjectMatchResult {
  project: Project;
  score: ScoreBreakdown;
  matchedTrade: string;
  alreadyAssigned: boolean;
  skillDetails: SkillDetails;
  certDetails: CertDetails;
}

// ── Ontology Cache ──────────────────────────────────────────────────────
// Avoids duplicate DB queries for the same trade within a single matching run

interface TradeOntology {
  skills: Skill[];
  certLinks: TradeCertification[];
}

const ontologyCache = new Map<string, TradeOntology>();

async function getTradeOntology(tradeId: string): Promise<TradeOntology> {
  const cached = ontologyCache.get(tradeId);
  if (cached) return cached;

  const [skills, certLinks] = await Promise.all([
    storage.getSkillsByTrade(tradeId),
    storage.getCertificationsByTrade(tradeId),
  ]);

  const entry = { skills, certLinks };
  ontologyCache.set(tradeId, entry);
  return entry;
}

function clearOntologyCache() {
  ontologyCache.clear();
}

// ── Scoring Helpers ─────────────────────────────────────────────────────

function isCertExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate) < new Date();
}

function computeSkillScore(
  tradeSkills: Skill[],
  workerSkills: WorkerSkill[],
): { score: number; details: SkillDetails } {
  const tradeSkillCount = tradeSkills.length;

  if (tradeSkillCount === 0) {
    return {
      score: 12.5, // midpoint default
      details: { tradeSkillCount: 0, workerMatchedSkills: 0, avgProficiency: 0 },
    };
  }

  const tradeSkillIds = new Set(tradeSkills.map((s) => s.id));
  const matched = workerSkills.filter((ws) => tradeSkillIds.has(ws.skillId));
  const proficiencySum = matched.reduce((sum, ws) => sum + ws.proficiencyLevel, 0);
  const avgProficiency = matched.length > 0 ? proficiencySum / matched.length : 0;

  const score = (proficiencySum / (tradeSkillCount * 5)) * 25;

  return {
    score: Math.min(25, score),
    details: {
      tradeSkillCount,
      workerMatchedSkills: matched.length,
      avgProficiency: round(avgProficiency),
    },
  };
}

function computeCertScore(
  requiredCertLinks: TradeCertification[],
  workerCerts: WorkerCertification[],
): { score: number; details: CertDetails } {
  const requiredCertCount = requiredCertLinks.length;

  if (requiredCertCount === 0) {
    return {
      score: 12.5, // midpoint default
      details: { requiredCertCount: 0, validCerts: 0, expiredCerts: 0, missingCerts: 0 },
    };
  }

  const workerCertMap = new Map<string, WorkerCertification>();
  for (const wc of workerCerts) {
    workerCertMap.set(wc.certificationId, wc);
  }

  let credits = 0;
  let validCerts = 0;
  let expiredCerts = 0;
  let missingCerts = 0;

  for (const link of requiredCertLinks) {
    const wc = workerCertMap.get(link.certificationId);
    if (!wc) {
      missingCerts++;
    } else if (isCertExpired(wc.expiryDate)) {
      expiredCerts++;
      credits += 0.5;
    } else {
      validCerts++;
      credits += 1.0;
    }
  }

  const score = (credits / requiredCertCount) * 25;

  return {
    score: Math.min(25, score),
    details: { requiredCertCount, validCerts, expiredCerts, missingCerts },
  };
}

function computeExperienceScore(experience: number): number {
  return (Math.min(experience, 15) / 15) * 10;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildBreakdown(parts: Omit<ScoreBreakdown, "total">): ScoreBreakdown {
  const total = clampScore(
    parts.tradeMatch +
    parts.skillProficiency +
    parts.certCompleteness +
    parts.availability +
    parts.experience +
    parts.assignmentPenalty,
  );
  return {
    tradeMatch: round(parts.tradeMatch),
    skillProficiency: round(parts.skillProficiency),
    certCompleteness: round(parts.certCompleteness),
    availability: round(parts.availability),
    experience: round(parts.experience),
    assignmentPenalty: round(parts.assignmentPenalty),
    total: round(total),
  };
}

// ── Main Matching Functions ─────────────────────────────────────────────

export async function findWorkersForProject(projectId: string): Promise<WorkerMatchResult[]> {
  clearOntologyCache();

  const project = await storage.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const tradesNeeded = project.tradesNeeded ?? [];
  if (tradesNeeded.length === 0) return [];

  // Get existing project assignments
  const assignments = await storage.getProjectAssignmentsByProject(projectId);
  const assignedWorkerIds = new Set(assignments.map((a) => a.workerId));

  // Resolve ontology trade IDs for each needed trade name
  const tradeNameToId = new Map<string, string>();
  for (const tradeName of tradesNeeded) {
    const trade = await storage.getTradeByName(tradeName);
    if (trade) tradeNameToId.set(tradeName, trade.id);
  }

  const results: WorkerMatchResult[] = [];

  for (const tradeName of tradesNeeded) {
    const tradeId = tradeNameToId.get(tradeName);

    // Find all worker trade strings that map to this ontology trade name
    const workerTradeStrings = ONTOLOGY_TO_WORKER_TRADES[tradeName] ?? [tradeName];

    // Collect candidate workers across all matching trade strings
    const candidateWorkers: Worker[] = [];
    const seen = new Set<string>();
    for (const wt of workerTradeStrings) {
      const found = await storage.getWorkersByTrade(wt);
      for (const w of found) {
        if (!seen.has(w.id)) {
          seen.add(w.id);
          candidateWorkers.push(w);
        }
      }
    }

    for (const worker of candidateWorkers) {
      const alreadyAssigned = assignedWorkerIds.has(worker.id);

      // Skill + cert scoring
      let skillResult: { score: number; details: SkillDetails };
      let certResult: { score: number; details: CertDetails };

      if (tradeId) {
        const ontology = await getTradeOntology(tradeId);
        const workerSkills = await storage.getWorkerSkills(worker.id);
        const workerCerts = await storage.getWorkerCertifications(worker.id);

        skillResult = computeSkillScore(ontology.skills, workerSkills);
        certResult = computeCertScore(ontology.certLinks, workerCerts);
      } else {
        // No ontology for this trade → midpoint defaults
        skillResult = { score: 12.5, details: { tradeSkillCount: 0, workerMatchedSkills: 0, avgProficiency: 0 } };
        certResult = { score: 12.5, details: { requiredCertCount: 0, validCerts: 0, expiredCerts: 0, missingCerts: 0 } };
      }

      const score = buildBreakdown({
        tradeMatch: 25,
        skillProficiency: skillResult.score,
        certCompleteness: certResult.score,
        availability: worker.available ? 15 : 0,
        experience: computeExperienceScore(worker.experience),
        assignmentPenalty: alreadyAssigned ? -10 : 0,
      });

      results.push({
        worker,
        score,
        matchedTrade: tradeName,
        alreadyAssigned,
        skillDetails: skillResult.details,
        certDetails: certResult.details,
      });
    }
  }

  // Sort descending by total score, return top 10
  results.sort((a, b) => b.score.total - a.score.total);
  return results.slice(0, 10);
}

export async function findJobsForWorker(workerId: string): Promise<ProjectMatchResult[]> {
  clearOntologyCache();

  const worker = await storage.getWorker(workerId);
  if (!worker) throw new Error(`Worker ${workerId} not found`);

  // Resolve worker's trade to ontology name
  const ontologyTradeName = WORKER_TRADE_TO_ONTOLOGY[worker.trade] ?? worker.trade;
  const trade = await storage.getTradeByName(ontologyTradeName);

  // Pre-fetch worker's skills and certs once
  const workerSkills = await storage.getWorkerSkills(workerId);
  const workerCerts = await storage.getWorkerCertifications(workerId);

  // Pre-fetch worker's existing project assignments
  const workerAssignments = await storage.getProjectAssignmentsByWorker(workerId);
  const assignedProjectIds = new Set(workerAssignments.map((a) => a.projectId));

  // Pre-compute skill/cert scores (same trade ontology applies to all projects)
  let skillResult: { score: number; details: SkillDetails };
  let certResult: { score: number; details: CertDetails };

  if (trade) {
    const ontology = await getTradeOntology(trade.id);
    skillResult = computeSkillScore(ontology.skills, workerSkills);
    certResult = computeCertScore(ontology.certLinks, workerCerts);
  } else {
    skillResult = { score: 12.5, details: { tradeSkillCount: 0, workerMatchedSkills: 0, avgProficiency: 0 } };
    certResult = { score: 12.5, details: { requiredCertCount: 0, validCerts: 0, expiredCerts: 0, missingCerts: 0 } };
  }

  const activeProjects = await storage.getActiveProjects();
  const results: ProjectMatchResult[] = [];

  for (const project of activeProjects) {
    const tradesNeeded = project.tradesNeeded ?? [];
    // Check if this project needs the worker's trade
    if (!tradesNeeded.includes(ontologyTradeName)) continue;

    const alreadyAssigned = assignedProjectIds.has(project.id);

    const score = buildBreakdown({
      tradeMatch: 25,
      skillProficiency: skillResult.score,
      certCompleteness: certResult.score,
      availability: worker.available ? 15 : 0,
      experience: computeExperienceScore(worker.experience),
      assignmentPenalty: alreadyAssigned ? -10 : 0,
    });

    results.push({
      project,
      score,
      matchedTrade: ontologyTradeName,
      alreadyAssigned,
      skillDetails: skillResult.details,
      certDetails: certResult.details,
    });
  }

  // Sort descending by total score, return top 10
  results.sort((a, b) => b.score.total - a.score.total);
  return results.slice(0, 10);
}
