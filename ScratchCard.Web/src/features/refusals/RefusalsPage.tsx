import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { refusalsApi, type RefusalEntry } from "../../lib/refusals";
import { fmtDate, shortTime } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import ExportButton from "../../components/ExportButton";
import { toast } from "../../components/feedback";
import { X, ShieldCheck, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

function dayLabel(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function RefusalsPage() {
  const { activeShopId, isOwner, isManager } = useAuth();
  const shopId = activeShopId!;
  const canReview = isOwner || isManager;
  const [needsReview, setNeedsReview] = useState(false);
  const [selected, setSelected] = useState<RefusalEntry | null>(null);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: fmtDate(from), to: fmtDate(to) };
  });

  const q = useQuery({
    queryKey: ["refusals", shopId, range.from, range.to],
    queryFn: () => refusalsApi.range(shopId, range.from, range.to),
    enabled: !!shopId,
  });

  const rows = useMemo(() => {
    const all = (q.data ?? []).slice().sort((a, b) =>
      `${b.refusalDate}T${b.refusalTime}`.localeCompare(`${a.refusalDate}T${a.refusalTime}`),
    );
    return needsReview ? all.filter((r) => !r.reviewedOn) : all;
  }, [q.data, needsReview]);

  const pending = (q.data ?? []).filter((r) => !r.reviewedOn).length;

  const exportCsv = () =>
    downloadCsv(
      `refusals_${range.from}_${range.to}`,
      ["#", "Date", "Time", "Product", "Person", "Observations", "Recorded by", "Reviewed by", "Reviewed on", "Review notes"],
      rows.map((r) => [
        r.sequenceNo, r.refusalDate, shortTime(r.refusalTime), r.product, r.personDescription, r.observations ?? "",
        r.staffMemberInitials || r.recordedByName || "", r.reviewedByName ?? "", r.reviewedOn ?? "", r.reviewNotes ?? "",
      ]),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Refusals</h1>
          <p className="text-sm text-slate-500">No-ID-no-sale register · {range.from} → {range.to}{pending ? ` · ${pending} to review` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
            Needs review
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
              <th className="px-5 py-2 font-medium">Date / time</th>
              <th className="px-5 py-2 font-medium">Product</th>
              <th className="px-5 py-2 font-medium">Person</th>
              <th className="px-5 py-2 font-medium">By</th>
              <th className="px-5 py-2 font-medium">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(r)}>
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-medium text-slate-800">{dayLabel(r.refusalDate)}</div>
                  <div className="text-xs text-slate-400">{shortTime(r.refusalTime)}</div>
                </td>
                <td className="px-5 py-3 text-slate-700">{r.product}</td>
                <td className="max-w-xs truncate px-5 py-3 text-slate-600">{r.personDescription}</td>
                <td className="px-5 py-3 text-slate-600">{r.staffMemberInitials || r.recordedByName || "—"}</td>
                <td className="px-5 py-3">
                  {r.reviewedOn ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> {r.reviewedByName ?? "Reviewed"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Pending</span>
                  )}
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No refusals in this range.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <RefusalDetail
          entry={selected}
          canReview={canReview}
          onClose={() => setSelected(null)}
          onReviewed={() => setSelected(null)}
          shopId={shopId}
          range={range}
        />
      ) : null}
    </div>
  );
}

function RefusalDetail({
  entry,
  canReview,
  shopId,
  range,
  onClose,
  onReviewed,
}: {
  entry: RefusalEntry;
  canReview: boolean;
  shopId: string;
  range: { from: string; to: string };
  onClose: () => void;
  onReviewed: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");

  const reviewM = useMutation({
    mutationFn: () => refusalsApi.review(entry.id, notes.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refusals", shopId, range.from, range.to] });
      onReviewed();
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Refusal #{entry.sequenceNo}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <dl className="space-y-3 text-sm">
          <Row label="When" value={`${dayLabel(entry.refusalDate)} · ${shortTime(entry.refusalTime)}`} />
          <Row label="Product" value={entry.product} />
          <Row label="Person" value={entry.personDescription} />
          {entry.observations ? <Row label="Observations" value={entry.observations} /> : null}
          <Row label="Recorded by" value={`${entry.staffMemberInitials}${entry.recordedByName ? ` (${entry.recordedByName})` : ""}`} />
        </dl>

        <div className={clsx("mt-4 rounded-lg border p-3", entry.reviewedOn ? "border-emerald-200 bg-emerald-50" : "border-slate-200")}>
          {entry.reviewedOn ? (
            <div className="flex items-start gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Reviewed by {entry.reviewedByName ?? "manager"}</div>
                <div className="text-xs">{new Date(entry.reviewedOn).toLocaleString("en-GB")}</div>
                {entry.reviewNotes ? <div className="mt-1 italic">“{entry.reviewNotes}”</div> : null}
              </div>
            </div>
          ) : canReview ? (
            <>
              <label className="label">Manager review note (optional)</label>
              <textarea className="input h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to record about this refusal…" />
              <button className="btn-primary mt-2 w-full bg-emerald-600 hover:bg-emerald-700" disabled={reviewM.isPending} onClick={() => reviewM.mutate()}>
                <ShieldCheck className="h-4 w-4" /> {reviewM.isPending ? "Saving…" : "Mark as reviewed"}
              </button>
            </>
          ) : (
            <div className="text-sm text-slate-500">Awaiting manager review.</div>
          )}
        </div>
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
