import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { visitorsApi, type VisitorEntry } from "../../lib/visitors";
import { fmtDate, shortTime } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import ExportButton from "../../components/ExportButton";
import { toast } from "../../components/feedback";
import { X, LogOut, AlertTriangle } from "lucide-react";
import clsx from "clsx";

function dayLabel(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function VisitorsPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const [onSiteOnly, setOnSiteOnly] = useState(false);
  const [selected, setSelected] = useState<VisitorEntry | null>(null);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: fmtDate(from), to: fmtDate(to) };
  });

  const q = useQuery({
    queryKey: ["visitors", shopId, range.from, range.to],
    queryFn: () => visitorsApi.range(shopId, range.from, range.to),
    enabled: !!shopId,
  });

  const rows = useMemo(() => {
    const all = (q.data ?? []).slice().sort((a, b) =>
      `${b.visitDate}T${b.timeIn}`.localeCompare(`${a.visitDate}T${a.timeIn}`),
    );
    return onSiteOnly ? all.filter((r) => r.isOnSite) : all;
  }, [q.data, onSiteOnly]);

  const onSiteCount = (q.data ?? []).filter((r) => r.isOnSite).length;

  const exportCsv = () =>
    downloadCsv(
      `visitors_${range.from}_${range.to}`,
      ["Date", "Time in", "Time out", "On site", "Visitor", "Organisation", "Type", "Purpose", "Host", "Vehicle", "Inspector", "Notes"],
      rows.map((r) => [
        r.visitDate, shortTime(r.timeIn), r.timeOut ? shortTime(r.timeOut) : "", r.isOnSite ? "Yes" : "", r.visitorName,
        r.organisation ?? "", r.visitType, r.purpose ?? "", r.hostName ?? "", r.vehicleRegistration ?? "", r.isInspector ? "Yes" : "", r.notes ?? "",
      ]),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Visitors</h1>
          <p className="text-sm text-slate-500">Sign-in register · {range.from} → {range.to}{onSiteCount ? ` · ${onSiteCount} on site` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={onSiteOnly} onChange={(e) => setOnSiteOnly(e.target.checked)} />
            On site now
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
              <th className="px-5 py-2 font-medium">Date</th>
              <th className="px-5 py-2 font-medium">Visitor</th>
              <th className="px-5 py-2 font-medium">Type</th>
              <th className="px-5 py-2 font-medium">Host</th>
              <th className="px-5 py-2 font-medium">In / Out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={clsx("cursor-pointer hover:bg-slate-50", r.isInspector && "bg-amber-50/50")} onClick={() => setSelected(r)}>
                <td className="whitespace-nowrap px-5 py-3 text-slate-700">{dayLabel(r.visitDate)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    {r.visitorName}
                    {r.isInspector ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> Inspector
                      </span>
                    ) : null}
                  </div>
                  {r.organisation ? <div className="text-xs text-slate-400">{r.organisation}</div> : null}
                </td>
                <td className="px-5 py-3 text-slate-600">{r.visitType}</td>
                <td className="px-5 py-3 text-slate-600">{r.hostName || "—"}</td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span className="text-slate-700">{shortTime(r.timeIn)}</span>
                  {r.isOnSite ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">On site</span>
                  ) : (
                    <span className="text-slate-400"> → {shortTime(r.timeOut)}</span>
                  )}
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No visitors in this range.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? <VisitorDetail entry={selected} shopId={shopId} range={range} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function VisitorDetail({
  entry,
  shopId,
  range,
  onClose,
}: {
  entry: VisitorEntry;
  shopId: string;
  range: { from: string; to: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const signOutM = useMutation({
    mutationFn: () => visitorsApi.signOut(entry.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitors", shopId, range.from, range.to] });
      onClose();
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{entry.visitorName}</h2>
            {entry.isInspector ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Inspector</span> : null}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <dl className="space-y-3 text-sm">
          <Row label="When" value={`${dayLabel(entry.visitDate)} · ${shortTime(entry.timeIn)}${entry.isOnSite ? " (on site)" : ` → ${shortTime(entry.timeOut)}`}`} />
          {entry.organisation ? <Row label="Organisation" value={entry.organisation} /> : null}
          <Row label="Type" value={entry.visitType} />
          {entry.purpose ? <Row label="Purpose" value={entry.purpose} /> : null}
          {entry.hostName ? <Row label="Host" value={entry.hostName} /> : null}
          {entry.vehicleRegistration ? <Row label="Vehicle" value={entry.vehicleRegistration} /> : null}
          {entry.notes ? <Row label="Notes" value={entry.notes} /> : null}
        </dl>

        {entry.isOnSite ? (
          <button className="btn-primary mt-5 w-full" disabled={signOutM.isPending} onClick={() => signOutM.mutate()}>
            <LogOut className="h-4 w-4" /> {signOutM.isPending ? "Signing out…" : "Sign out visitor"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
