import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { complianceApi } from "../../lib/compliance";
import { fmtDate } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import ExportButton from "../../components/ExportButton";
import clsx from "clsx";

export default function CompliancePage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const [openOnly, setOpenOnly] = useState(true);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: fmtDate(from), to: fmtDate(to) };
  });

  const q = useQuery({
    queryKey: ["compliance-actions", shopId, range.from, range.to, openOnly],
    queryFn: () => complianceApi.actions(shopId, range.from, range.to, openOnly),
    enabled: !!shopId,
  });
  const rows = q.data ?? [];

  const exportCsv = () =>
    downloadCsv(
      `compliance-actions_${range.from}_${range.to}`,
      ["Period", "Frequency", "Group", "Check", "Action required", "Status", "Closed notes"],
      rows.map((r) => [r.periodLabel, r.frequency, r.groupName, r.itemName, r.actionRequired ?? "", r.isActionClosedOut ? "Closed" : "Open", r.closedOutNotes ?? ""]),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Compliance actions</h1>
          <p className="text-sm text-slate-500">Non-compliant checks &amp; their actions · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            Open only
          </label>
          <input type="date" className="input w-auto" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input w-auto" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <ExportButton onClick={exportCsv} disabled={q.isLoading || rows.length === 0} />
        </div>
      </div>

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Check</th>
              <th className="px-5 py-2 font-medium">Group</th>
              <th className="px-5 py-2 font-medium">Period</th>
              <th className="px-5 py-2 font-medium">Action required</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.entryId} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{r.itemName}</td>
                <td className="px-5 py-3 text-slate-600">{r.groupName}</td>
                <td className="px-5 py-3 text-slate-600">
                  <div>{r.periodLabel}</div>
                  <div className="text-xs text-slate-400">{r.frequency}</div>
                </td>
                <td className="max-w-xs px-5 py-3 text-slate-600">
                  {r.actionRequired || "—"}
                  {r.closedOutNotes ? <div className="mt-0.5 text-xs italic text-slate-400">Closed: {r.closedOutNotes}</div> : null}
                </td>
                <td className="px-5 py-3">
                  <span className={clsx(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    r.isActionClosedOut ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                  )}>
                    {r.isActionClosedOut ? "Closed" : "Open"}
                  </span>
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No actions in this range.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
