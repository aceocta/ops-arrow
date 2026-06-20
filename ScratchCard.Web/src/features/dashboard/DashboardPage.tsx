import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";
import type { OwnerOverview } from "../../lib/types";
import { downloadCsv } from "../../lib/csv";
import { useIsDark } from "../../lib/theme";
import ExportButton from "../../components/ExportButton";
import {
  PoundSterling,
  AlertTriangle,
  Thermometer,
  Users,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Store,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n || 0);
}
function pct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

const RANGES = [
  { key: "7", label: "7 days", days: 6 },
  { key: "30", label: "30 days", days: 29 },
] as const;

export default function DashboardPage() {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("7");
  const range = useMemo(() => {
    const days = RANGES.find((r) => r.key === rangeKey)!.days;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { from: fmtDate(from), to: fmtDate(to) };
  }, [rangeKey]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["owner-overview", range.from, range.to],
    queryFn: async () => {
      const res = await api.get("/reports/owner-overview", { params: { from: range.from, to: range.to } });
      return unwrap<OwnerOverview>(res.data);
    },
  });

  const salesDelta = useMemo(() => (data ? pct(data.totalSalesAmount, data.previousTotalSalesAmount) : null), [data]);

  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const chartData = (data?.salesByDay ?? []).map((p) => ({ label: dayLabel(p.date), amount: p.amount }));
  const tempData = (data?.temperatureByDay ?? []).map((p) => ({ label: dayLabel(p.date), inRange: p.inRange, outOfRange: p.outOfRange }));
  const hasTempData = tempData.some((p) => p.inRange + p.outOfRange > 0);
  const tempOutTotal = tempData.reduce((a, p) => a + p.outOfRange, 0);

  const dark = useIsDark();
  const chart = dark
    ? {
        grid: "#1e293b",
        axis: "#64748b",
        cursor: "rgba(255,255,255,0.05)",
        tooltip: { background: "#121829", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#e2e8f0", boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6)" },
        tooltipLabel: { color: "#e2e8f0" },
      }
    : {
        grid: "#eef2f7",
        axis: "#94a3b8",
        cursor: "#f1f5f9",
        tooltip: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#0f172a", boxShadow: "0 10px 30px -12px rgba(16,24,40,0.18)" },
        tooltipLabel: { color: "#0f172a" },
      };

  const exportShops = () => {
    if (!data) return;
    downloadCsv(
      `shops-overview_${data.from}_${data.to}`,
      ["Shop", "Sales", "Previous sales", "Cash variance", "Temp issues", "Open actions", "Compliance score", "On shift", "Pending approvals", "Needs attention"],
      data.shops.map((s) => [
        s.shopName, s.salesAmount.toFixed(2), s.previousSalesAmount.toFixed(2), s.cashVariance.toFixed(2),
        s.temperatureIssues, s.openComplianceActions, s.complianceScore, s.onShiftNow, s.pendingApprovals, s.needsAttention ? "Yes" : "",
      ]),
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Across all your shops · {range.from} → {range.to}</p>
        </div>
        <div className="segment">
          {RANGES.map((r) => (
            <button key={r.key} data-active={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div className="card flex items-center gap-3 p-6 text-sm text-red-600">
          <AlertTriangle className="h-5 w-5" /> Couldn't load the dashboard. Please try again.
        </div>
      ) : null}

      {isLoading && !data ? <DashboardSkeleton /> : null}

      {data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={PoundSterling}
              tone="brand"
              label="Scratch-card sales"
              value={gbp(data.totalSalesAmount)}
              sub={salesDelta != null ? <DeltaPill value={salesDelta} /> : <span className="text-slate-400">No prior period</span>}
            />
            <StatCard
              icon={AlertTriangle}
              tone="amber"
              label="Shops needing attention"
              value={String(data.shopsNeedingAttention)}
              sub={<span className="text-slate-400">of {data.shopCount} shops</span>}
            />
            <StatCard
              icon={Thermometer}
              tone="red"
              label="Temperature issues"
              value={String(data.totalTemperatureIssues)}
              sub={<span className="text-slate-400">{data.totalOpenComplianceActions} open actions</span>}
            />
            <StatCard
              icon={Users}
              tone="emerald"
              label="On shift now"
              value={String(data.totalOnShiftNow)}
              sub={<span className="text-slate-400">{data.totalPendingApprovals} approvals due</span>}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Scratch-card sales</h2>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{gbp(data.totalSalesAmount)}</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip formatter={(v: number) => gbp(v)} cursor={{ stroke: chart.axis, strokeDasharray: "3 3" }} contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
                    <Area type="monotone" dataKey="amount" name="Sales" stroke="#6366f1" strokeWidth={2.5} fill="url(#salesArea)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700">Temperature readings</h2>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> In range</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Out of range</span>
                </div>
              </div>
              <div className="h-64">
                {hasTempData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tempData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} allowDecimals={false} width={48} />
                      <Tooltip cursor={{ fill: chart.cursor }} contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
                      <Bar dataKey="inRange" stackId="t" fill="#10b981" name="In range" />
                      <Bar dataKey="outOfRange" stackId="t" fill="#ef4444" radius={[5, 5, 0, 0]} name="Out of range" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-400">
                    <Thermometer className="h-7 w-7 text-slate-300" />
                    No temperature readings in this range.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shops table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Store className="h-4 w-4 text-slate-400" /> Shops
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{data.shops.length}</span>
                {tempOutTotal > 0 ? <span className="badge bg-red-100 text-red-700">{tempOutTotal} temp issues</span> : null}
              </span>
              <ExportButton onClick={exportShops} disabled={data.shops.length === 0} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2.5 font-medium">Shop</th>
                    <th className="px-5 py-2.5 font-medium">Sales</th>
                    <th className="px-5 py-2.5 font-medium">Temp issues</th>
                    <th className="px-5 py-2.5 font-medium">Open actions</th>
                    <th className="px-5 py-2.5 font-medium">Compliance</th>
                    <th className="px-5 py-2.5 font-medium">On shift</th>
                    <th className="px-5 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.shops.map((s) => {
                    const d = pct(s.salesAmount, s.previousSalesAmount);
                    return (
                      <tr key={s.shopId} className={`group transition-colors hover:bg-slate-50 ${s.needsAttention ? "bg-amber-50/40" : ""}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
                              {initials(s.shopName)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 font-medium text-slate-800">
                                <span className="truncate">{s.shopName}</span>
                                {s.needsAttention ? <span className="badge bg-amber-100 text-amber-700">Attention</span> : null}
                              </div>
                              {s.pendingApprovals > 0 ? <div className="text-xs text-slate-400">{s.pendingApprovals} approvals due</div> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium tabular-nums text-slate-800">{gbp(s.salesAmount)}</div>
                          {d != null ? <div className="mt-0.5"><DeltaPill value={d} small /></div> : null}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`tabular-nums ${s.temperatureIssues > 0 ? "font-semibold text-red-600" : "text-slate-500"}`}>{s.temperatureIssues}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`tabular-nums ${s.openComplianceActions > 0 ? "font-semibold text-amber-600" : "text-slate-500"}`}>{s.openComplianceActions}</span>
                        </td>
                        <td className="px-5 py-3"><ComplianceBadge score={s.complianceScore} /></td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 tabular-nums text-slate-700">
                            {s.onShiftNow > 0 ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}
                            {s.onShiftNow}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-400" />
                        </td>
                      </tr>
                    );
                  })}
                  {data.shops.length === 0 ? (
                    <tr><td className="px-5 py-10 text-center text-slate-400" colSpan={7}>No shops yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DeltaPill({ value, small }: { value: number; small?: boolean }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"} ${
        up ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function ComplianceBadge({ score }: { score: number }) {
  const tone =
    score >= 90 ? "bg-emerald-100 text-emerald-700" : score >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`badge tabular-nums ${tone}`}>{score}%</span>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone: "brand" | "amber" | "red" | "emerald";
}) {
  const tones: Record<string, string> = {
    brand: "bg-gradient-to-br from-brand-500 to-brand-600",
    amber: "bg-gradient-to-br from-amber-400 to-amber-600",
    red: "bg-gradient-to-br from-rose-400 to-red-600",
    emerald: "bg-gradient-to-br from-emerald-400 to-emerald-600",
  };
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`icon-tile ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 text-[28px] font-bold tracking-tight tabular-nums text-slate-900">{value}</div>
      {sub ? <div className="mt-1.5 text-xs">{sub}</div> : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-200" />
            </div>
            <div className="mt-4 h-7 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="mb-4 h-3.5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        <div className="h-3.5 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
