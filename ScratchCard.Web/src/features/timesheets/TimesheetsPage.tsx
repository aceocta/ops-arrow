import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { rotaApi, fmtDate, shortTime, type TimesheetRow } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import ExportButton from "../../components/ExportButton";
import { X, ChevronRight } from "lucide-react";
import clsx from "clsx";

function clock(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
}
function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function longDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "long" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}
function hm(hours: number) {
  const m = Math.round(hours * 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function TimesheetsPage() {
  const { activeShopId, features } = useAuth();
  const shopId = activeShopId!;
  const showCost = features.includes("staff_rota.labour_cost");
  const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
  const [view, setView] = useState<"staff" | "shift">("staff");
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: fmtDate(from), to: fmtDate(to) };
  });
  const [selected, setSelected] = useState<{ row: TimesheetRow } | null>(null);

  const setQuick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setRange({ from: fmtDate(from), to: fmtDate(to) });
  };

  const staffQ = useQuery({
    queryKey: ["ts-staff", shopId, range.from, range.to],
    queryFn: () => rotaApi.timesheet(shopId, range.from, range.to),
    enabled: !!shopId && view === "staff",
  });
  const shiftQ = useQuery({
    queryKey: ["ts-shift", shopId, range.from, range.to],
    queryFn: () => rotaApi.shiftTimesheet(shopId, range.from, range.to),
    enabled: !!shopId && view === "shift",
  });

  const total = useMemo(() => {
    const rows = view === "staff" ? staffQ.data ?? [] : shiftQ.data ?? [];
    return rows.reduce((s: number, r: { totalHours: number }) => s + r.totalHours, 0);
  }, [view, staffQ.data, shiftQ.data]);

  // Wage split: approved vs pending (awaiting approval), so the total is never inflated silently.
  const wage = useMemo(() => {
    const rows = (view === "staff" ? staffQ.data ?? [] : shiftQ.data ?? []) as {
      labourCost?: number | null; pendingLabourCost?: number | null; pendingHours?: number;
    }[];
    const totalCost = rows.reduce((s, r) => s + (r.labourCost ?? 0), 0);
    const pendingCost = rows.reduce((s, r) => s + (r.pendingLabourCost ?? 0), 0);
    const pendingHours = rows.reduce((s, r) => s + (r.pendingHours ?? 0), 0);
    return { total: totalCost, pending: pendingCost, approved: totalCost - pendingCost, pendingHours };
  }, [view, staffQ.data, shiftQ.data]);

  const loading = view === "staff" ? staffQ.isLoading : shiftQ.isLoading;

  const exportCsv = () => {
    if (view === "staff") {
      downloadCsv(
        `timesheet-by-staff_${range.from}_${range.to}`,
        ["Staff", "External", "Shifts worked", "Open sessions", "Total hours", ...(showCost ? ["Wage", "Pending wage"] : [])],
        (staffQ.data ?? []).map((r) => [
          r.userName, r.isExternal ? "Yes" : "", r.shiftsWorked, r.openSessions, r.totalHours.toFixed(2),
          ...(showCost ? [r.labourCost != null ? r.labourCost.toFixed(2) : "", (r.pendingLabourCost ?? 0).toFixed(2)] : []),
        ]),
      );
    } else {
      downloadCsv(
        `timesheet-by-shift_${range.from}_${range.to}`,
        ["Date", "Shift", "Start", "End", "Employees", "Total hours", ...(showCost ? ["Wage", "Pending wage"] : [])],
        (shiftQ.data ?? []).map((r) => [
          r.date, r.shiftName, shortTime(r.startTime), shortTime(r.endTime), r.staffCount, r.totalHours.toFixed(2),
          ...(showCost ? [r.labourCost != null ? r.labourCost.toFixed(2) : "", (r.pendingLabourCost ?? 0).toFixed(2)] : []),
        ]),
      );
    }
  };

  // Group the by-shift rows under their date (backend returns them date-ordered, so insertion order holds).
  const shiftGroups = useMemo(() => {
    const m = new Map<string, typeof shiftQ.data>();
    for (const r of shiftQ.data ?? []) {
      const list = (m.get(r.date) ?? []) as NonNullable<typeof shiftQ.data>;
      list.push(r);
      m.set(r.date, list);
    }
    return [...m.entries()] as [string, NonNullable<typeof shiftQ.data>][];
  }, [shiftQ.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Timesheets</h1>
          <p className="text-sm text-slate-500">Worked hours · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {[
              { label: "7 days", days: 7 },
              { label: "30 days", days: 30 },
            ].map((q) => (
              <button key={q.days} onClick={() => setQuick(q.days)} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                {q.label}
              </button>
            ))}
          </div>
          <input type="date" className="input w-auto" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input w-auto" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <ExportButton onClick={exportCsv} disabled={loading} />
        </div>
      </div>

      {/* View toggle */}
      <div className="flex w-fit rounded-lg border border-slate-200 bg-white p-1">
        {(["staff", "shift"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={clsx("rounded-md px-4 py-1.5 text-sm font-medium", view === v ? "bg-brand-600 text-white" : "text-slate-600")}
          >
            {v === "staff" ? "By staff" : "By shift"}
          </button>
        ))}
      </div>

      {/* Wage split — approved vs awaiting approval */}
      {showCost && !loading && wage.total > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Approved wage</div>
            <div className="mt-1 text-xl font-semibold text-emerald-600">{gbp(wage.approved)}</div>
          </div>
          <div className={clsx("card p-4", wage.pending > 0 && "ring-1 ring-amber-200")}>
            <div className="text-xs uppercase tracking-wide text-slate-400">Pending approval</div>
            <div className="mt-1 text-xl font-semibold text-amber-600">{gbp(wage.pending)}</div>
            {wage.pendingHours > 0 ? <div className="text-xs text-slate-400">{hm(wage.pendingHours)} awaiting approval</div> : null}
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total if all approved</div>
            <div className="mt-1 text-xl font-semibold text-slate-800">{gbp(wage.total)}</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {view === "staff" ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 font-medium">Shifts</th>
                <th className="px-5 py-2 font-medium">Hours</th>
                {showCost ? <th className="px-5 py-2 font-medium">Rate</th> : null}
                {showCost ? <th className="px-5 py-2 font-medium">Cost</th> : null}
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(staffQ.data ?? []).map((r) => (
                <tr key={r.userId ?? r.rotaStaffMemberId} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected({ row: r })}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-800">{r.userName}</span>
                    {r.isExternal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">External</span> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{r.shiftsWorked}{r.openSessions > 0 ? ` (+${r.openSessions})` : ""}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{hm(r.totalHours)}</td>
                  {showCost ? <td className="px-5 py-3 text-slate-700">{r.hourlyRate != null ? gbp(r.hourlyRate) : <span className="text-amber-600">— set</span>}</td> : null}
                  {showCost ? (
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {r.labourCost != null ? gbp(r.labourCost) : "—"}
                      {r.pendingLabourCost ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{gbp(r.pendingLabourCost)} pending</span> : null}
                    </td>
                  ) : null}
                  <td className="px-5 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-300" /></td>
                </tr>
              ))}
              {!loading && (staffQ.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={showCost ? 6 : 4} className="px-5 py-6 text-center text-slate-400">No hours in this range.</td></tr>
              ) : null}
            </tbody>
            {(staffQ.data?.length ?? 0) > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td></td>
                  <td className="px-5 py-3">{hm(total)}</td>
                  {showCost ? <td></td> : null}
                  {showCost ? <td className="px-5 py-3">{gbp((staffQ.data ?? []).reduce((s, r) => s + (r.labourCost ?? 0), 0))}</td> : null}
                  <td></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-5 py-2 font-medium">Shift</th>
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 font-medium">Hours</th>
                {showCost ? <th className="px-5 py-2 font-medium">Wage</th> : null}
              </tr>
            </thead>
            <tbody>
              {shiftGroups.map(([date, rows]) =>
                rows.map((r, i) => (
                  <tr
                    key={`${r.date}-${r.shiftName}`}
                    className={clsx("hover:bg-slate-50", i === 0 ? "border-t-2 border-slate-200" : "border-t border-slate-100")}
                  >
                    <td className="whitespace-nowrap px-5 py-3 align-top">
                      {i === 0 ? <span className="font-semibold text-slate-800">{dayLabel(date)}</span> : null}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      <span className="font-medium text-slate-800">{r.shiftName}</span>
                      {r.startTime ? <span className="ml-1 text-xs text-slate-400">{shortTime(r.startTime)}–{shortTime(r.endTime)}</span> : null}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{r.staffCount}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{hm(r.totalHours)}</td>
                    {showCost ? (
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {r.labourCost != null ? gbp(r.labourCost) : "—"}
                        {r.pendingLabourCost ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{gbp(r.pendingLabourCost)} pending</span> : null}
                      </td>
                    ) : null}
                  </tr>
                )),
              )}
              {!loading && shiftGroups.length === 0 ? (
                <tr><td colSpan={showCost ? 5 : 4} className="px-5 py-6 text-center text-slate-400">No hours in this range.</td></tr>
              ) : null}
            </tbody>
            {shiftGroups.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td></td>
                  <td></td>
                  <td className="px-5 py-3">{hm(total)}</td>
                  {showCost ? <td className="px-5 py-3">{gbp((shiftQ.data ?? []).reduce((s, r) => s + (r.labourCost ?? 0), 0))}</td> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {selected ? (
        <StaffSessions shopId={shopId} row={selected.row} from={range.from} to={range.to} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function StaffSessions({
  shopId,
  row,
  from,
  to,
  onClose,
}: {
  shopId: string;
  row: TimesheetRow;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["ts-sessions", shopId, row.userId, row.rotaStaffMemberId, from, to],
    queryFn: () => rotaApi.staffSessions(shopId, { userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId }, from, to),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{row.userName}</h2>
            <p className="text-sm text-slate-500">{from} → {to}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
          {q.isLoading ? <div className="py-6 text-center text-sm text-slate-500">Loading…</div> : null}
          {!q.isLoading && (q.data?.length ?? 0) === 0 ? <div className="py-6 text-center text-sm text-slate-400">No sessions.</div> : null}
          {(q.data ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{dayLabel(s.date)}</div>
                <div className="text-xs text-slate-500">
                  {s.shiftName ? `${s.shiftName} · ` : ""}{clock(s.checkInAt)} → {clock(s.checkOutAt)}
                  {s.entryMethod === "Manual" ? (s.isApproved ? "  · manual" : "  · pending") : ""}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-800">{s.checkOutAt ? hm(s.hours) : "open"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
