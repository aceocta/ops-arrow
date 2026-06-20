import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  tillReconApi, tillSettlementApi,
  type VarianceStatus, type ReconStatus,
  type ProviderSettlement, type SettlementProvider, type SettlementStatus,
} from "../../lib/tillReconciliation";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { PoundSterling, AlertTriangle, CheckCircle2, Receipt, Landmark, Download, X, RotateCcw, Trash2 } from "lucide-react";
import clsx from "clsx";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const varianceColor = (s: VarianceStatus) =>
  s === "Ok" ? "text-emerald-600" : s === "Warning" ? "text-amber-600" : "text-red-600";
const statusBadge: Record<ReconStatus, string> = {
  Draft: "bg-slate-100 text-slate-500",
  NeedsVerification: "bg-amber-100 text-amber-700",
  Reconciled: "bg-sky-100 text-sky-700",
  Approved: "bg-emerald-100 text-emerald-700",
};

export default function TillReconciliationPage() {
  const { activeShopId, features } = useAuth();
  const shopId = activeShopId!;
  const has = (f: string) => features.includes(f);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [date, setDate] = useState(fmtDate(new Date()));

  const rollupQ = useQuery({
    queryKey: ["till-rollup", shopId, date],
    queryFn: () => tillReconApi.rollup(shopId, date),
    enabled: !!shopId,
  });
  const r = rollupQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Till Reconciliation</h1>
          <p className="page-subtitle">Daily cash reconciliation across tills</p>
        </div>
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {rollupQ.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {r ? (
        <>
          {/* Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon={CheckCircle2} tone={r.allReconciled ? "emerald" : "amber"} label="Tills reconciled"
              value={`${r.reconciledCount}/${r.tillCount}`} sub={r.allReconciled ? "All done" : "Outstanding"} />
            <Tile icon={PoundSterling} tone={r.worstVarianceStatus === "Ok" ? "emerald" : r.worstVarianceStatus === "Warning" ? "amber" : "red"}
              label="Net over/short" value={`${r.totalCashVariance >= 0 ? "+" : "−"}${gbp(Math.abs(r.totalCashVariance))}`}
              sub={`Expected ${gbp(r.totalExpectedCash)}`} />
            <Tile icon={Receipt} tone="brand" label="Commission income" value={gbp(r.totalCommission)} sub="Across counters" />
            <Tile icon={AlertTriangle} tone="amber" label="Exceptions"
              value={`${r.totalNoSale} no-sale`} sub={`Voids ${gbp(r.totalVoids)} · Refunds ${gbp(r.totalRefunds)}`} />
          </div>

          {/* Per-till */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Tills · {date}</div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-medium">Till</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Expected</th>
                  <th className="px-5 py-2 font-medium">Counted</th>
                  <th className="px-5 py-2 font-medium">Over / Short</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.tills.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailId(t.id)}>
                    <td className="px-5 py-3 font-medium text-slate-800">{t.tillName}</td>
                    <td className="px-5 py-3">
                      <span className={clsx("badge", statusBadge[t.status])}>{t.status}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{gbp(t.expectedCash)}</td>
                    <td className="px-5 py-3 text-slate-700">{t.countedCash != null ? gbp(t.countedCash) : "—"}</td>
                    <td className={clsx("px-5 py-3 font-semibold", varianceColor(t.varianceStatus))}>
                      {t.cashVariance >= 0 ? "+" : "−"}{gbp(Math.abs(t.cashVariance))}
                    </td>
                  </tr>
                ))}
                {r.tills.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No reconciliations for this date.</td></tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </>
      ) : null}

      {/* Provider settlements — Pro */}
      {has("store_sales.settlement") ? <SettlementsCard shopId={shopId} /> : null}

      {detailId ? <ReconciliationDetail id={detailId} onClose={() => setDetailId(null)} /> : null}
    </div>
  );
}

function ReconciliationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { isOwner, isManager } = useAuth();
  const canManage = isOwner || isManager;
  const q = useQuery({ queryKey: ["recon-detail", id], queryFn: () => tillReconApi.get(id) });
  const [viewImg, setViewImg] = useState<string | null>(null);
  const r = q.data;
  const p = r?.summary.proofOfCash;
  const locked = r?.status === "Approved";

  const refresh = () => { qc.invalidateQueries({ queryKey: ["recon-detail", id] }); qc.invalidateQueries({ queryKey: ["till-rollup"] }); };

  const removePhoto = useMutation({
    mutationFn: (attachmentId: string) => tillReconApi.deleteAttachment(attachmentId),
    onSuccess: () => { refresh(); toast("Photo removed.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const reopen = useMutation({
    mutationFn: () => tillReconApi.reopen(id),
    onSuccess: () => { refresh(); toast("Reopened for editing.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const erase = useMutation({
    mutationFn: () => tillReconApi.erase(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["till-rollup"] }); toast("Reconciliation erased.", "success"); onClose(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const confirmErase = () => {
    if (confirm("Permanently erase this reconciliation — its lines, photos and cash count? This cannot be undone.")) erase.mutate();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div className="card my-6 w-full max-w-2xl p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Reconciliation · {r ? r.businessDate : ""}</h2>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        {!r ? <div className="py-10 text-center text-sm text-slate-500">Loading…</div> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Stat k="Opening float" v={gbp(r.openingFloat)} />
              <Stat k="Expected" v={gbp(r.expectedCash)} />
              <Stat k="Counted" v={r.countedCash != null ? gbp(r.countedCash) : "—"} />
              <Stat k="Over / Short" v={`${r.cashVariance >= 0 ? "+" : "−"}${gbp(Math.abs(r.cashVariance))}`} tone={r.varianceStatus === "Ok" ? "emerald" : r.varianceStatus === "Warning" ? "amber" : "red"} />
            </div>

            {/* Captured images */}
            {r.attachments.length > 0 ? (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Captured images ({r.attachments.length})</div>
                <div className="flex flex-wrap gap-2">
                  {r.attachments.map((a) => (
                    <AttachmentThumb
                      key={a.id}
                      id={a.id}
                      onView={setViewImg}
                      onRemove={!locked ? () => { if (confirm("Remove this photo and the lines its scan added?")) removePhoto.mutate(a.id); } : undefined}
                      removing={removePhoto.isPending}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Proof of cash */}
            {p ? (
              <div className="rounded-xl border border-slate-100 p-4 text-sm">
                <div className="mb-2 font-semibold text-slate-700">Proof of cash</div>
                <Row k="Cash in (float + takings)" v={gbp(p.cashIn)} />
                {p.paidOut ? <Row k="Paid out" v={`− ${gbp(p.paidOut)}`} muted /> : null}
                {p.safeDrop ? <Row k="Safe drop" v={`− ${gbp(p.safeDrop)}`} muted /> : null}
                {p.prizesPaid ? <Row k="Prizes paid" v={`− ${gbp(p.prizesPaid)}`} muted /> : null}
                <Row k="Expected in drawer" v={gbp(p.expectedDrawer)} />
                <Row k="Counted in drawer" v={gbp(p.countedDrawer)} />
                <div className={clsx("mt-2 text-sm font-semibold", p.accountedFor ? "text-emerald-600" : "text-red-600")}>
                  {p.accountedFor ? "✓ All cash accounted for" : `✗ Unaccounted ${gbp(Math.abs(p.variance))}`}
                </div>
                {r.summary.safeDropCrossCheck && !r.summary.safeDropCrossCheck.matches ? (
                  <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    ✗ Safe-drop off by {gbp(Math.abs(r.summary.safeDropCrossCheck.difference))} — declared {gbp(r.summary.safeDropCrossCheck.declaredOnReport)} vs safe {gbp(r.summary.safeDropCrossCheck.recordedInSafeModule)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Lines */}
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Lines ({r.lines.length})</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {r.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 text-slate-700">{l.canonicalField === "Unmapped" ? (l.rawLabel || "Unmapped") : l.fieldName}{l.status !== "Verified" ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">unverified</span> : null}</td>
                      <td className="py-2 text-right font-medium text-slate-800">{l.canonicalField === "NoSale" ? `× ${l.quantity ?? 0}` : gbp(l.verifiedAmount)}</td>
                    </tr>
                  ))}
                  {r.lines.length === 0 ? <tr><td className="py-4 text-center text-slate-400">No lines.</td></tr> : null}
                </tbody>
              </table>
            </div>

            {/* Manager actions */}
            {canManage ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                {locked ? (
                  <button className="btn-ghost" onClick={() => reopen.mutate()} disabled={reopen.isPending}>
                    <RotateCcw className="h-4 w-4" /> {reopen.isPending ? "Reopening…" : "Reopen to edit"}
                  </button>
                ) : null}
                <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={confirmErase} disabled={erase.isPending}>
                  <Trash2 className="h-4 w-4" /> {erase.isPending ? "Erasing…" : "Erase reconciliation"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {viewImg ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/90" onClick={() => setViewImg(null)}>
          <div className="flex justify-end gap-3 p-4">
            <a href={viewImg} download className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => e.stopPropagation()}><Download className="h-5 w-5" /></a>
            <button className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setViewImg(null)}><X className="h-5 w-5" /></button>
          </div>
          <img src={viewImg} alt="" className="mx-auto max-h-[85vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}

function AttachmentThumb({ id, onView, onRemove, removing }: { id: string; onView: (dataUrl: string) => void; onRemove?: () => void; removing?: boolean }) {
  const q = useQuery({ queryKey: ["recon-att", id], queryFn: () => tillReconApi.attachment(id), staleTime: 300000 });
  if (!q.data) return <div className="h-20 w-20 animate-pulse rounded-lg bg-slate-100" />;
  return (
    <div className="group relative h-20 w-20">
      <img src={q.data} alt="" className="h-20 w-20 cursor-pointer rounded-lg border border-slate-200 object-cover" onClick={() => onView(q.data!)} />
      {onRemove ? (
        <button
          className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-700 disabled:opacity-50"
          title="Remove photo"
          disabled={removing}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

const PROVIDERS: SettlementProvider[] = ["PayPoint", "Payzone", "Lottery", "Parcels"];
const settlementBadge: Record<SettlementStatus, string> = {
  Open: "bg-slate-100 text-slate-500",
  Matched: "bg-emerald-100 text-emerald-700",
  Discrepancy: "bg-red-100 text-red-700",
  Settled: "bg-sky-100 text-sky-700",
};

function SettlementsCard({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: fmtDate(from), to: fmtDate(to) };
  });
  const { from, to } = range;
  const key = ["settlements", shopId, from, to];
  const q = useQuery({ queryKey: key, queryFn: () => tillSettlementApi.listSettlements(shopId, from, to), enabled: !!shopId });
  const [provider, setProvider] = useState<SettlementProvider>("PayPoint");

  const createM = useMutation({
    mutationFn: () => tillSettlementApi.createSettlement({ shopId, provider, periodStart: from, periodEnd: to }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast("Settlement period created.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const ddM = useMutation({
    mutationFn: (p: { id: string; ddAmount: number }) => tillSettlementApi.setStatement({ id: p.id, ddAmount: p.ddAmount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Landmark className="h-4 w-4 text-slate-400" /> Provider settlements · {from} → {to}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input w-auto" value={from} onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))} />
          <input type="date" className="input w-auto" value={to} onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))} />
          <select className="input w-auto" value={provider} onChange={(e) => setProvider(e.target.value as SettlementProvider)}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn-soft" onClick={() => createM.mutate()} disabled={createM.isPending}>Add period</button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-5 py-2 font-medium">Provider</th>
            <th className="px-5 py-2 font-medium">Captured owed</th>
            <th className="px-5 py-2 font-medium">DD amount</th>
            <th className="px-5 py-2 font-medium">Variance</th>
            <th className="px-5 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(q.data ?? []).map((s) => <SettlementRow key={s.id} s={s} onDd={(amt) => ddM.mutate({ id: s.id, ddAmount: amt })} />)}
          {!q.isLoading && (q.data?.length ?? 0) === 0 ? (
            <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No settlement periods — add one above.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function SettlementRow({ s, onDd }: { s: ProviderSettlement; onDd: (amount: number) => void }) {
  const [dd, setDd] = useState(s.ddAmount != null ? String(s.ddAmount) : "");
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-5 py-3 font-medium text-slate-800">{s.provider}</td>
      <td className="px-5 py-3 text-slate-700">{gbp(s.capturedOwed)}</td>
      <td className="px-5 py-3">
        <input className="input w-28" placeholder="£" value={dd} onChange={(e) => setDd(e.target.value)} onBlur={() => { if (dd.trim()) onDd(Number(dd) || 0); }} />
      </td>
      <td className={clsx("px-5 py-3 font-semibold", s.status === "Matched" ? "text-emerald-600" : s.status === "Discrepancy" ? "text-red-600" : "text-slate-500")}>
        {s.ddAmount != null ? `${s.variance >= 0 ? "+" : "−"}${gbp(Math.abs(s.variance))}` : "—"}
      </td>
      <td className="px-5 py-3"><span className={clsx("badge", settlementBadge[s.status])}>{s.status}</span></td>
    </tr>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "emerald" | "amber" | "red" }) {
  const c = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "text-slate-900";
  return (
    <div>
      <div className="text-xs text-slate-400">{k}</div>
      <div className={clsx("text-base font-bold", c)}>{v}</div>
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={muted ? "text-slate-400" : "text-slate-600"}>{k}</span>
      <span className={clsx("font-medium", muted ? "text-slate-500" : "text-slate-800")}>{v}</span>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string;
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
        <span className={`icon-tile ${tones[tone]}`}><Icon className="h-[18px] w-[18px]" /></span>
      </div>
      <div className="mt-3 text-[26px] font-bold tracking-tight text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}
