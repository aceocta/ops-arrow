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
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n || 0);
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

  const salesDelta = useMemo(() => {
    if (!data || !data.previousTotalSalesAmount) return null;
    return ((data.totalSalesAmount - data.previousTotalSalesAmount) / data.previousTotalSalesAmount) * 100;
  }, [data]);

  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const chartData = (data?.salesByDay ?? []).map((p) => ({ label: dayLabel(p.date), amount: p.amount }));
  const tempData = (data?.temperatureByDay ?? []).map((p) => ({ label: dayLabel(p.date), inRange: p.inRange, outOfRange: p.outOfRange }));
  const hasTempData = tempData.some((p) => p.inRange + p.outOfRange > 0);

  const dark = useIsDark();
  const chart = dark
    ? {
        grid: "#1e293b",
        axis: "#64748b",
        cursor: "rgba(255,255,255,0.05)",
        tooltip: { background: "#121829", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#e2e8f0" },
        tooltipLabel: { color: "#e2e8f0" },
      }
    : {
        grid: "#eef2f7",
        axis: "#94a3b8",
        cursor: "#f1f5f9",
        tooltip: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, color: "#0f172a" },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Across all your shops · {range.from} → {range.to}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${rangeKey === r.key ? "bg-brand-600 text-white" : "text-slate-600"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? <div className="card p-6 text-sm text-red-600">Couldn't load the dashboard.</div> : null}
      {isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {data ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={PoundSterling}
              tone="brand"
              label="Scratch-card sales"
              value={gbp(data.totalSalesAmount)}
              sub={
                salesDelta != null ? (
                  <span className={`inline-flex items-center gap-1 ${salesDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {salesDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {Math.abs(salesDelta).toFixed(0)}% vs previous
                  </span>
                ) : null
              }
            />
            <StatCard
              icon={AlertTriangle}
              tone="amber"
              label="Shops needing attention"
              value={String(data.shopsNeedingAttention)}
              sub={<span className="text-slate-400">{data.shopCount} shops total</span>}
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
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Scratch-card sales</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => gbp(v)} cursor={{ fill: chart.cursor }} contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
                    <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Temperature readings</h2>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> In range</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Out of range</span>
                </div>
              </div>
              <div className="h-64">
                {hasTempData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tempData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: chart.cursor }} contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
                      <Bar dataKey="inRange" stackId="t" fill="#10b981" radius={[0, 0, 0, 0]} name="In range" />
                      <Bar dataKey="outOfRange" stackId="t" fill="#ef4444" radius={[4, 4, 0, 0]} name="Out of range" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No temperature readings in this range.</div>
                )}
              </div>
            </div>
          </div>

          {/* Shops table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-semibold text-slate-700">Shops</span>
              <ExportButton onClick={exportShops} disabled={data.shops.length === 0} />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-medium">Shop</th>
                  <th className="px-5 py-2 font-medium">Sales</th>
                  <th className="px-5 py-2 font-medium">Temp issues</th>
                  <th className="px-5 py-2 font-medium">Open actions</th>
                  <th className="px-5 py-2 font-medium">On shift</th>
                  <th className="px-5 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.shops.map((s) => (
                  <tr key={s.shopId} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-800">
                        {s.shopName}
                        {s.needsAttention ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Attention</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{gbp(s.salesAmount)}</td>
                    <td className="px-5 py-3 text-slate-700">{s.temperatureIssues}</td>
                    <td className="px-5 py-3 text-slate-700">{s.openComplianceActions}</td>
                    <td className="px-5 py-3 text-slate-700">{s.onShiftNow}</td>
                    <td className="px-5 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-300" /></td>
                  </tr>
                ))}
                {data.shops.length === 0 ? (
                  <tr><td className="px-5 py-6 text-center text-slate-400" colSpan={6}>No shops.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
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
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs">{sub}</div> : null}
    </div>
  );
}
