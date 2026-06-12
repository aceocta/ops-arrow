import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { shiftSwapsApi, type ShiftSwap, type ShiftSwapStatus } from "../../lib/shiftSwaps";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { ArrowLeftRight, Gift } from "lucide-react";
import clsx from "clsx";

const statusBadge: Record<ShiftSwapStatus, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Declined: "bg-red-100 text-red-700",
  Cancelled: "bg-slate-100 text-slate-500",
};

export default function ShiftSwapsPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const key = ["shift-swaps", shopId];
  const q = useQuery({ queryKey: key, queryFn: () => shiftSwapsApi.list(shopId), enabled: !!shopId });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => shiftSwapsApi.respond(id, accept),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: key }); toast(v.accept ? "Swap approved." : "Declined.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => shiftSwapsApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast("Cancelled.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const swaps = q.data ?? [];
  const pending = swaps.filter((s) => s.status === "Pending");
  const history = swaps.filter((s) => s.status !== "Pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Shift swaps</h1>
        <p className="page-subtitle">Approve swaps & give-aways — external staff are manager-mediated</p>
      </div>

      <SwapTable title={`Pending (${pending.length})`} rows={pending}
        onAccept={(s) => respond.mutate({ id: s.id, accept: true })}
        onDecline={(s) => respond.mutate({ id: s.id, accept: false })}
        onCancel={(s) => { if (confirm("Cancel this request?")) cancel.mutate(s.id); }}
        busy={respond.isPending || cancel.isPending} />

      <SwapTable title="History" rows={history} />
      {!q.isLoading && swaps.length === 0 ? <div className="card p-6 text-center text-slate-400">No swap requests.</div> : null}
    </div>
  );
}

function SwapTable({ title, rows, onAccept, onDecline, onCancel, busy }: {
  title: string; rows: ShiftSwap[];
  onAccept?: (s: ShiftSwap) => void; onDecline?: (s: ShiftSwap) => void; onCancel?: (s: ShiftSwap) => void; busy?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">{title}</div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-5 py-2 font-medium">Type</th>
            <th className="px-5 py-2 font-medium">Who</th>
            <th className="px-5 py-2 font-medium">Shift(s)</th>
            <th className="px-5 py-2 font-medium">Status</th>
            {onAccept ? <th className="px-5 py-2 font-medium text-right">Action</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-5 py-3">
                <span className="flex items-center gap-1.5 font-medium text-slate-800">
                  {s.type === "Swap" ? <ArrowLeftRight className="h-4 w-4 text-slate-400" /> : <Gift className="h-4 w-4 text-slate-400" />}
                  {s.type === "Swap" ? "Swap" : "Give-away"}
                </span>
              </td>
              <td className="px-5 py-3 text-slate-700">
                {s.requesterName} → {s.targetName}
                {s.targetIsExternal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">external</span> : null}
              </td>
              <td className="px-5 py-3 text-slate-600">
                <div>Gives: {s.fromShiftLabel}</div>
                {s.toShiftLabel ? <div>Takes: {s.toShiftLabel}</div> : null}
                {s.note ? <div className="text-xs italic text-slate-400">“{s.note}”</div> : null}
              </td>
              <td className="px-5 py-3"><span className={clsx("badge", statusBadge[s.status])}>{s.status}</span></td>
              {onAccept ? (
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onAccept(s)}>Approve</button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => onDecline?.(s)}>Decline</button>
                    <button className="rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100" disabled={busy} onClick={() => onCancel?.(s)}>Cancel</button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
