import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import clsx from "clsx";
import { useAuth } from "../../auth/AuthContext";
import { useIsDark } from "../../lib/theme";
import { tillReconApi, type FieldBreakdownRow } from "../../lib/tillReconciliation";
import { tillGroupsApi } from "../../lib/tillGroups";

// A soft, distinct palette so each field's bar is easy to tell apart.
const BAR_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6"];

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtDate(d);
}

export default function TillLineReportPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;

  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => fmtDate(new Date()));
  const [selected, setSelected] = useState<string[]>([]); // specific fields (override group)
  const [groupName, setGroupName] = useState(""); // "" = all groups
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fieldsQ = useQuery({
    queryKey: ["till-fields-flat", shopId],
    queryFn: () => tillGroupsApi.listFields(shopId),
    enabled: !!shopId,
  });

  // Group the field options for the filter panel + the group dropdown.
  const fieldGroups = useMemo(() => {
    const m = new Map<string, { code: string; label: string }[]>();
    for (const f of fieldsQ.data ?? []) {
      const arr = m.get(f.groupName) ?? [];
      arr.push({ code: f.code, label: f.displayName });
      m.set(f.groupName, arr);
    }
    return [...m.entries()];
  }, [fieldsQ.data]);

  const groupCodes = useMemo(
    () => (groupName ? (fieldGroups.find(([g]) => g === groupName)?.[1] ?? []).map((f) => f.code) : []),
    [groupName, fieldGroups],
  );
  // Specific fields win; otherwise the chosen group's fields; otherwise all.
  const effectiveFields = selected.length > 0 ? selected : groupCodes;

  const breakdownQ = useQuery({
    queryKey: ["till-field-breakdown", shopId, from, to, effectiveFields],
    queryFn: () => tillReconApi.fieldBreakdown(shopId, from, to, effectiveFields),
    enabled: !!shopId,
  });

  const rows = breakdownQ.data?.rows ?? [];
  const totalEntries = rows.reduce((s, r) => s + r.lineCount, 0);

  // Top fields by total for the chart (descending, capped so labels stay readable).
  const chartData = useMemo(
    () =>
      [...rows]
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 12)
        .map((r) => ({ name: r.fieldName, total: r.total })),
    [rows],
  );

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

  // Daily totals across the currently-filtered fields (one fetch per field, bucketed by date).
  const byDateQ = useQuery({
    queryKey: ["till-field-by-date", shopId, from, to, rows.map((r) => r.fieldCode).join(",")],
    enabled: !!shopId && rows.length > 0,
    queryFn: async () => {
      const perField = await Promise.all(rows.map((r) => tillReconApi.fieldBreakdownEntries(shopId, from, to, r.fieldCode)));
      const map: Record<string, number> = {};
      for (const entries of perField)
        for (const e of entries) {
          const d = e.businessDate.slice(0, 10);
          map[d] = (map[d] ?? 0) + e.amount;
        }
      return map;
    },
  });

  // Fill every day in the range (missing days = 0) so the line reads continuously.
  const byDateData = useMemo(() => {
    const map = byDateQ.data ?? {};
    const out: { label: string; total: number }[] = [];
    const cur = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    let guard = 0;
    while (cur <= end && guard < 400) {
      const iso = fmtDate(cur);
      out.push({ label: new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), total: map[iso] ?? 0 });
      cur.setDate(cur.getDate() + 1);
      guard += 1;
    }
    return out;
  }, [byDateQ.data, from, to]);

  const toggleField = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const setQuick = (days: number) => {
    setTo(fmtDate(new Date()));
    setFrom(daysAgo(days - 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Line report</h1>
          <p className="text-sm text-slate-500">How much went through each till field over a period — e.g. Void, Discount, Drive-off.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {[{ label: "7 days", days: 7 }, { label: "30 days", days: 30 }].map((q) => (
              <button key={q.days} onClick={() => setQuick(q.days)} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                {q.label}
              </button>
            ))}
          </div>
          <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input w-auto" value={to} max={fmtDate(new Date())} onChange={(e) => setTo(e.target.value)} />
          <select
            className="input w-auto"
            value={groupName}
            onChange={(e) => { setGroupName(e.target.value); setSelected([]); }}
          >
            <option value="">All groups</option>
            {fieldGroups.map(([group]) => <option key={group} value={group}>{group}</option>)}
          </select>
          <button className="btn-ghost" onClick={() => setFilterOpen((v) => !v)}>
            <Filter className="h-4 w-4" /> {selected.length === 0 ? (groupName ? "All in group" : "All fields") : `${selected.length} selected`}
          </button>
        </div>
      </div>

      {/* Field filter panel */}
      {filterOpen ? (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Filter fields</h2>
            <button className="text-sm font-medium text-brand-700" onClick={() => setSelected([])}>All fields</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fieldGroups.filter(([group]) => !groupName || group === groupName).map(([group, fields]) => (
              <div key={group}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</div>
                <div className="space-y-1">
                  {fields.map((f) => (
                    <label key={f.code} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={selected.includes(f.code)} onChange={() => toggleField(f.code)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Summary */}
      {breakdownQ.data ? (
        <div className="card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Total · {dayLabel(from)} → {dayLabel(to)}</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{gbp(breakdownQ.data.grandTotal)}</div>
          </div>
          <div className="text-sm text-slate-500">{totalEntries} {totalEntries === 1 ? "entry" : "entries"} · {rows.length} field{rows.length === 1 ? "" : "s"}</div>
        </div>
      ) : null}

      {/* Chart: total by date */}
      {breakdownQ.data && byDateData.length > 1 ? (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Total by date</h2>
            <span className="text-xs text-slate-400">{dayLabel(from)} → {dayLabel(to)}</span>
          </div>
          {byDateQ.isLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">Loading daily totals…</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={byDateData} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="lineReportArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickFormatter={(v) => gbp(v as number)} tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} width={56} />
                <Tooltip formatter={(v: number) => gbp(v)} cursor={{ stroke: chart.axis, strokeDasharray: "3 3" }} contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
                <Area type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2.5} fill="url(#lineReportArea)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : null}

      {/* Chart: total by field */}
      {breakdownQ.data && chartData.length > 0 ? (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Total by field</h2>
            <span className="text-xs text-slate-400">Top {chartData.length} · {dayLabel(from)} → {dayLabel(to)}</span>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} />
              <XAxis type="number" tickFormatter={(v) => gbp(v as number)} tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => gbp(v)} cursor={{ fill: chart.cursor }} contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
              <Bar dataKey="total" name="Total" radius={[0, 6, 6, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Field</th>
              <th className="px-5 py-2 font-medium">Group</th>
              <th className="px-5 py-2 font-medium">Entries</th>
              <th className="px-5 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {breakdownQ.isLoading ? (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">No matching lines in this period.</td></tr>
            ) : (
              rows.map((row) => (
                <FieldRows key={row.fieldCode} shopId={shopId} from={from} to={to} row={row} expanded={expanded === row.fieldCode} onToggle={() => setExpanded((c) => (c === row.fieldCode ? null : row.fieldCode))} />
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <td className="px-5 py-3">Total</td>
                <td></td>
                <td className="px-5 py-3">{totalEntries}</td>
                <td className="px-5 py-3 text-right">{gbp(breakdownQ.data?.grandTotal ?? 0)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function FieldRows({ shopId, from, to, row, expanded, onToggle }: {
  shopId: string; from: string; to: string; row: FieldBreakdownRow; expanded: boolean; onToggle: () => void;
}) {
  const entriesQ = useQuery({
    queryKey: ["till-field-entries", shopId, from, to, row.fieldCode],
    queryFn: () => tillReconApi.fieldBreakdownEntries(shopId, from, to, row.fieldCode),
    enabled: expanded,
  });

  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        <td className="px-5 py-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            {row.fieldName}
          </span>
        </td>
        <td className="px-5 py-3 text-slate-600">{row.groupName}</td>
        <td className="px-5 py-3 text-slate-700">{row.lineCount}{row.quantityTotal > 0 ? ` · ×${row.quantityTotal}` : ""}</td>
        <td className="px-5 py-3 text-right font-medium text-slate-800">{gbp(row.total)}</td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={4} className="bg-slate-50/60 px-5 py-2">
            {entriesQ.isLoading ? (
              <div className="py-2 text-center text-xs text-slate-400">Loading…</div>
            ) : (entriesQ.data ?? []).length === 0 ? (
              <div className="py-2 text-center text-xs text-slate-400">No entries.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(entriesQ.data ?? []).map((e, i) => (
                  <div key={`${e.reconciliationId}-${i}`} className={clsx("flex items-center justify-between py-1.5 text-sm")}>
                    <span className="text-slate-600">{dayLabel(e.businessDate)}</span>
                    <span className="font-medium text-slate-800">{e.quantity != null && row.quantityTotal > 0 ? `×${e.quantity}  ` : ""}{gbp(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
