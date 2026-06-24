import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { confirmDialog, toast } from "../../components/feedback";
import { gamesApi } from "../../lib/games";
import { ShieldCheck, X, CheckCircle2, ArrowLeft } from "lucide-react";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

export default function GameApprovalsPage() {
  const { profile } = useAuth();
  const isPlatformAdmin = (profile?.roles ?? []).includes("PlatformAdmin");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["games-pending"],
    queryFn: () => gamesApi.pending(),
    enabled: isPlatformAdmin,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["games-pending"] });

  const approveM = useMutation({
    mutationFn: (id: string) => gamesApi.approve(id),
    onSuccess: () => { toast("Game approved — now available to all shops.", "success"); refresh(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const rejectM = useMutation({
    mutationFn: (p: { id: string; reason?: string }) => gamesApi.reject(p.id, p.reason),
    onSuccess: () => { toast("Game rejected.", "success"); refresh(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  if (!isPlatformAdmin) {
    return <div className="card p-6 text-sm text-slate-400">Only the platform owner can review game approvals.</div>;
  }

  const rows = q.data ?? [];
  const busy = approveM.isPending || rejectM.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Game approvals</h1>
          <p className="page-subtitle">Games submitted by shops, awaiting platform approval to become global.</p>
        </div>
        <Link to="/games" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back to games</Link>
      </div>

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {!q.isLoading && rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-sm font-medium text-slate-700">All caught up — no games waiting for approval.</div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5 font-medium">Game</th>
                <th className="px-5 py-2.5 font-medium">Code</th>
                <th className="px-5 py-2.5 font-medium">Price</th>
                <th className="px-5 py-2.5 font-medium">Tickets</th>
                <th className="px-5 py-2.5 font-medium">Submitted by</th>
                <th className="px-5 py-2.5 font-medium">Shops</th>
                <th className="px-5 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((g) => (
                <tr key={g.masterGameId} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{g.gameName}</td>
                  <td className="px-5 py-3 text-slate-600">{g.gameCode}</td>
                  <td className="px-5 py-3 text-slate-700">{gbp(g.ticketPrice)}</td>
                  <td className="px-5 py-3 text-slate-700">{g.ticketsPerPack}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {g.originShopName ?? "—"}
                    {g.originCompanyName ? <span className="text-slate-400"> · {g.originCompanyName}</span> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{g.assignedShopCount}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Reject"
                        disabled={busy}
                        onClick={async () => {
                          if (await confirmDialog({ title: "Reject game?", message: `Reject "${g.gameName}" (${g.gameCode})?`, confirmLabel: "Reject", tone: "danger" })) {
                            rejectM.mutate({ id: g.masterGameId });
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => approveM.mutate(g.masterGameId)}
                      >
                        <ShieldCheck className="h-4 w-4" /> Approve
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
