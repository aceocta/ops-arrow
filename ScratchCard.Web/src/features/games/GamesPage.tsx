import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { gamesApi, type CreateGameInput, type DuplicateGameInfo, type GameAssignScope, type SellingOrder } from "../../lib/games";
import { Plus, X, ShieldCheck, Clock, ChevronRight } from "lucide-react";
import clsx from "clsx";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

const STATUS_BADGE: Record<string, string> = {
  Approved: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Rejected: "bg-red-100 text-red-700",
};

const emptyForm: Omit<CreateGameInput, "shopId"> = {
  gameName: "",
  gameCode: "",
  defaultTicketPrice: 0,
  defaultTicketsPerPack: 0,
  defaultStartSerialNumber: "",
  defaultEndSerialNumber: "",
  defaultSellingOrder: "Ascending",
  isActive: true,
  assignScope: "Shop",
};

export default function GamesPage() {
  const { activeShopId, isOwner, isManager, profile } = useAuth();
  const shopId = activeShopId!;
  const isPlatformAdmin = (profile?.roles ?? []).includes("PlatformAdmin");
  const canManage = isOwner || isManager;
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["games", shopId],
    queryFn: () => gamesApi.list(shopId),
    enabled: !!shopId,
  });
  const games = q.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Scratch card games</h1>
          <p className="page-subtitle">Games assigned to this shop. New games need platform approval before going global.</p>
        </div>
        <div className="flex items-center gap-2">
          {isPlatformAdmin ? (
            <Link to="/games/approvals" className="btn-ghost"><Clock className="h-4 w-4" /> Pending approvals</Link>
          ) : null}
          {canManage ? (
            <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Create game</button>
          ) : null}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2.5 font-medium">Game</th>
              <th className="px-5 py-2.5 font-medium">Code</th>
              <th className="px-5 py-2.5 font-medium">Price</th>
              <th className="px-5 py-2.5 font-medium">Tickets/pack</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {games.map((g) => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{g.gameName}</td>
                <td className="px-5 py-3 text-slate-600">{g.gameCode}</td>
                <td className="px-5 py-3 text-slate-700">{gbp(g.defaultTicketPrice)}</td>
                <td className="px-5 py-3 text-slate-700">{g.defaultTicketsPerPack}</td>
                <td className="px-5 py-3">
                  <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[g.approvalStatus] ?? "bg-slate-100 text-slate-600")}>
                    {g.approvalStatus === "Approved" ? <ShieldCheck className="h-3 w-3" /> : g.approvalStatus === "Pending" ? <Clock className="h-3 w-3" /> : null}
                    {g.approvalStatus}
                  </span>
                </td>
              </tr>
            ))}
            {!q.isLoading && games.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No games assigned to this shop yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? <CreateGameModal shopId={shopId} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function CreateGameModal({ shopId, onClose }: { shopId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [duplicate, setDuplicate] = useState<DuplicateGameInfo | null>(null);
  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const done = (message: string) => {
    qc.invalidateQueries({ queryKey: ["games", shopId] });
    toast(message, "success");
    onClose();
  };

  const createM = useMutation({
    mutationFn: () => gamesApi.create({ ...form, shopId }),
    onSuccess: (result) => {
      if (result.outcome === "DuplicateExists" && result.duplicate) {
        setDuplicate(result.duplicate);
        return;
      }
      done("Game created — pending platform approval.");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const assignM = useMutation({
    mutationFn: (scope: GameAssignScope) =>
      gamesApi.assignExisting({
        masterGameId: duplicate!.masterGameId,
        shopId,
        scope,
        defaultStartSerialNumber: form.defaultStartSerialNumber,
        defaultEndSerialNumber: form.defaultEndSerialNumber,
        defaultSellingOrder: form.defaultSellingOrder,
        isActive: form.isActive,
      }),
    onSuccess: (_g, scope) => done(scope === "Company" ? "Game assigned to all company shops." : "Game assigned to this shop."),
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const valid = form.gameName.trim().length > 0 && form.gameCode.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{duplicate ? "Game already exists" : "Create game"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        {duplicate ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{duplicate.gameName}</span> ({duplicate.gameCode}) is already in Ops Arrow
              {duplicate.approvalStatus === "Pending" ? " and is awaiting platform approval" : ""}.
              {duplicate.alreadyAssignedToShop ? " It's already assigned to this shop." : " Assign the existing game instead of creating a duplicate?"}
            </p>
            {!duplicate.alreadyAssignedToShop ? (
              <div className="flex flex-col gap-2">
                <button className="btn-primary" disabled={assignM.isPending} onClick={() => assignM.mutate("Shop")}>
                  <ChevronRight className="h-4 w-4" /> Assign to this shop
                </button>
                <button className="btn-ghost" disabled={assignM.isPending} onClick={() => assignM.mutate("Company")}>
                  Assign to all company shops
                </button>
              </div>
            ) : null}
            <button className="btn-ghost w-full" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Game name</label>
              <input className="input" value={form.gameName} onChange={(e) => set("gameName", e.target.value)} placeholder="e.g. Lucky 7s" />
            </div>
            <div>
              <label className="label">Game code</label>
              <input className="input" value={form.gameCode} onChange={(e) => set("gameCode", e.target.value.toUpperCase())} placeholder="2–20 letters/numbers" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Ticket price (£)</label>
                <input className="input" inputMode="decimal" value={String(form.defaultTicketPrice)} onChange={(e) => set("defaultTicketPrice", Number(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Tickets / pack</label>
                <input className="input" inputMode="numeric" value={String(form.defaultTicketsPerPack)} onChange={(e) => set("defaultTicketsPerPack", Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start serial</label>
                <input className="input" value={form.defaultStartSerialNumber} onChange={(e) => set("defaultStartSerialNumber", e.target.value)} />
              </div>
              <div>
                <label className="label">End serial</label>
                <input className="input" value={form.defaultEndSerialNumber} onChange={(e) => set("defaultEndSerialNumber", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Selling order</label>
              <select className="input" value={form.defaultSellingOrder} onChange={(e) => set("defaultSellingOrder", e.target.value as SellingOrder)}>
                <option value="Ascending">Ascending</option>
                <option value="Descending">Descending</option>
              </select>
            </div>
            <div>
              <label className="label">Assign to</label>
              <select className="input" value={form.assignScope} onChange={(e) => set("assignScope", e.target.value as GameAssignScope)}>
                <option value="Shop">This shop</option>
                <option value="Company">All company shops</option>
              </select>
            </div>
            <p className="text-xs text-slate-400">New games are submitted for platform approval before they become available to every shop.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={!valid || createM.isPending} onClick={() => createM.mutate()}>
                {createM.isPending ? "Saving…" : "Create game"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
