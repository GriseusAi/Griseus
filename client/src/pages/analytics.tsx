import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  Users,
  UserCheck,
  FolderKanban,
  Target,
  BarChart3,
  MapPin,
  ShieldCheck,
  Award,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────

interface WorkforceSummary {
  totalWorkers: number;
  availableWorkers: number;
  activeProjects: number;
  avgMatchScore: number;
}

interface SupplyDemandItem {
  trade: string;
  supply: number;
  demand: number;
}

interface RegionalItem {
  location: string;
  totalWorkers: number;
  availableWorkers: number;
  topTrades: string[];
  avgExperience: number;
}

interface CertCoverage {
  name: string;
  holdersCount: number;
  totalWorkers: number;
  percentage: number;
}

interface SkillGapItem {
  trade: string;
  totalWorkers: number;
  certifications: CertCoverage[];
}

// ── Stat Card ────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
        <p className="text-4xl font-extrabold tracking-tight text-[#1A1A1A]">{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltip ───────────────────────────────────────────────────

function SupplyDemandTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3">
      <p className="font-semibold text-sm mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function Analytics() {
  usePageMeta("Workforce Analytics", "Platform-wide workforce intelligence and gap analysis.");

  const { data: summary, isLoading: loadingSummary } = useQuery<WorkforceSummary>({
    queryKey: ["/api/analytics/workforce-summary"],
  });

  const { data: supplyDemand, isLoading: loadingSD } = useQuery<SupplyDemandItem[]>({
    queryKey: ["/api/analytics/supply-demand"],
  });

  const { data: regional, isLoading: loadingRegional } = useQuery<RegionalItem[]>({
    queryKey: ["/api/analytics/regional"],
  });

  const { data: skillGaps, isLoading: loadingGaps } = useQuery<SkillGapItem[]>({
    queryKey: ["/api/analytics/skill-gaps"],
  });

  // Flatten all certifications for the coverage chart
  const allCertCoverage = skillGaps
    ?.flatMap(sg =>
      sg.certifications.map(c => ({
        name: c.name,
        percentage: c.percentage,
        trade: sg.trade,
      }))
    )
    .sort((a, b) => a.percentage - b.percentage) ?? [];

  // Deduplicate by cert name (keep lowest percentage for worst-case view)
  const certCoverageMap = new Map<string, typeof allCertCoverage[0]>();
  for (const c of allCertCoverage) {
    if (!certCoverageMap.has(c.name) || c.percentage < certCoverageMap.get(c.name)!.percentage) {
      certCoverageMap.set(c.name, c);
    }
  }
  const certCoverageData = Array.from(certCoverageMap.values()).sort(
    (a, b) => a.percentage - b.percentage
  );

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
              Workforce Analytics
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg">
            Platform-wide workforce intelligence — supply gaps, certification coverage, and regional distribution.
          </p>
        </div>
      </div>

      {/* 1. Header Stats Row */}
      {loadingSummary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-24 mb-4" />
                <Skeleton className="h-10 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Workers" value={summary.totalWorkers} accent="bg-[#92ABBB]" />
          <StatCard icon={UserCheck} label="Available Workers" value={summary.availableWorkers} accent="bg-emerald-500" />
          <StatCard icon={FolderKanban} label="Active Projects" value={summary.activeProjects} accent="bg-[#9F6C52]" />
          <StatCard icon={Target} label="Avg Match Score" value={`${summary.avgMatchScore}%`} accent="bg-amber-500" />
        </div>
      ) : null}

      {/* 2. Supply vs Demand Chart */}
      <Card className="bg-white shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Supply vs Demand by Trade
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Available workers (supply) vs projects requesting each trade (demand)
          </p>
        </CardHeader>
        <CardContent>
          {loadingSD ? (
            <Skeleton className="h-[350px] w-full" />
          ) : supplyDemand && supplyDemand.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={supplyDemand} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E0DA" />
                <XAxis
                  dataKey="trade"
                  tick={{ fontSize: 11, fill: "#5A5A5A" }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5A5A5A" }}
                  allowDecimals={false}
                />
                <Tooltip content={<SupplyDemandTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="supply" name="Available Workers" fill="#92ABBB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="demand" name="Projects Requesting" fill="#9F6C52" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No trade data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3. Regional Workforce Map (table view) */}
      <Card className="bg-white shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Regional Workforce Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRegional ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : regional && regional.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 font-semibold text-muted-foreground">Location</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Total</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Available</th>
                    <th className="text-left py-3 px-3 font-semibold text-muted-foreground">Top Trades</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Avg Exp</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {regional.map(r => {
                    const ratio = r.totalWorkers > 0 ? r.availableWorkers / r.totalWorkers : 0;
                    const statusColor = ratio < 0.3 ? "bg-red-100 text-red-700" : ratio < 0.6 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
                    const statusLabel = ratio < 0.3 ? "Low Supply" : ratio < 0.6 ? "Moderate" : "High Supply";

                    return (
                      <tr key={r.location} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 font-medium">{r.location}</td>
                        <td className="py-3 px-3 text-center font-semibold">{r.totalWorkers}</td>
                        <td className="py-3 px-3 text-center font-semibold text-emerald-600">{r.availableWorkers}</td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {r.topTrades.map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px] bg-[#92ABBB]/10 text-[#92ABBB]">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">{r.avgExperience} yrs</td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="secondary" className={`text-[10px] font-semibold ${statusColor}`}>
                            {statusLabel}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No regional data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4. Skill Gap Analysis */}
      <Card className="bg-white shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Skill Gap Analysis
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Certification coverage per trade — reveals training priorities
          </p>
        </CardHeader>
        <CardContent>
          {loadingGaps ? (
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : skillGaps && skillGaps.length > 0 ? (
            <div className="space-y-6">
              {skillGaps.map(sg => (
                <div key={sg.trade} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{sg.trade}</h3>
                    <span className="text-xs text-muted-foreground">({sg.totalWorkers} workers)</span>
                  </div>
                  <div className="space-y-2 pl-2">
                    {sg.certifications.map(cert => (
                      <div key={cert.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{cert.name}</span>
                          <span className="font-semibold">
                            {cert.holdersCount}/{cert.totalWorkers}
                            <span className="text-muted-foreground ml-1">({cert.percentage}%)</span>
                          </span>
                        </div>
                        <Progress
                          value={cert.percentage}
                          className="h-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No skill gap data available — link certifications to trades to see coverage
            </p>
          )}
        </CardContent>
      </Card>

      {/* 5. Certification Coverage */}
      <Card className="bg-white shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            Certification Coverage
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sorted lowest to highest — biggest gaps at the top
          </p>
        </CardHeader>
        <CardContent>
          {loadingGaps ? (
            <Skeleton className="h-[300px] w-full" />
          ) : certCoverageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(250, certCoverageData.length * 40)}>
              <BarChart
                data={certCoverageData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E0DA" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "#5A5A5A" }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#5A5A5A" }}
                  width={110}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Coverage"]}
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E5E0DA",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="percentage"
                  name="Coverage"
                  radius={[0, 4, 4, 0]}
                  fill="#92ABBB"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No certification data available
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
