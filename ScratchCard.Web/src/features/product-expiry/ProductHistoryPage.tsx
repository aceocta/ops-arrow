import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import ExportButton from "../../components/ExportButton";
import { downloadCsv } from "../../lib/csv";
import {
  productExpiryApi,
  ACTION_META,
  actionLabel,
  type ProductActionHistory,
  type ProductExpiryActionType,
} from "../../lib/productExpiry";

// ─── Date helpers ─────────────────────────────────────────────────────────
const fmtIso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtIso(d);
};
const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

function ActionBadge({ action }: { action: ProductExpiryActionType }) {
  const m = ACTION_META[action];
  return <span className={clsx("badge", m.badge)}>{m.label}</span>;
}

// "All" plus the disposition words the request called out.
type ActionTab = "all" | ProductExpiryActionType;
const ACTION_TABS: { value: ActionTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Discount", label: "Discounted" },
  { value: "Dispose", label: "Binned" },
  { value: "MarkSold", label: "Sold" },
  { value: "Donate", label: "Donated" },
  { value: "ReturnToSupplier", label: "Returned" },
  { value: "MoveToFront", label: "Moved to front" },
];

export default function ProductHistoryPage() {
  const { activeShopId } = useAuth();
  if (!activeShopId) {
    return <div className="card p-8 text-center text-sm text-slate-500">Select a shop to view product history.</div>;
  }
  return <ProductHistory shopId={activeShopId} />;
}

function ProductHistory({ shopId }: { shopId: string }) {
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => fmtIso(new Date()));
  const [tab, setTab] = useState<ActionTab>("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const q = useQuery({
    queryKey: ["product-expiry-history", shopId, from, to],
    queryFn: () => productExpiryApi.history(shopId, from, to),
    enabled: !!shopId,
  });

  const history = q.data ?? [];

  const counts = useMemo(() => {
    const c = { all: history.length } as Record<ActionTab, number>;
    for (const t of ACTION_TABS) if (t.value !== "all") c[t.value] = 0;
    for (const h of history) c[h.actionType] = (c[h.actionType] ?? 0) + 1;
    return c;
  }, [history]);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of history) if (!m.has(h.productCategoryId)) m.set(h.productCategoryId, h.categoryName);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [history]);

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      history.filter(
        (h) =>
          (tab === "all" || h.actionType === tab) &&
          (categoryId === "" || h.productCategoryId === categoryId) &&
          (term === "" || h.productName.toLowerCase().includes(term)),
      ),
    [history, tab, categoryId, term],
  );

  // Headline tallies over the (date-filtered) feed: saved vs binned units.
  const totals = useMemo(() => {
    let savedUnits = 0, binnedUnits = 0, savedValue = 0, binnedValue = 0;
    for (const h of history) {
      if (h.isSave) { savedUnits += h.quantity; savedValue += h.value; }
      else { binnedUnits += h.quantity; binnedValue += h.value; }
    }
    return { savedUnits, binnedUnits, savedValue, binnedValue };
  }, [history]);

  const setQuick = (days: number) => {
    setTo(fmtIso(new Date()));
    setFrom(daysAgo(days - 1));
  };

  const exportCsv = () =>
    downloadCsv(
      "product-history",
      ["When", "Product", "Category", "Action", "Quantity", "Outcome", "Value (GBP)", "Expiry date", "Comment"],
      rows.map((h: ProductActionHistory) => [
        new Date(h.performedOn).toISOString(),
        h.productName,
        h.categoryName,
        actionLabel(h.actionType),
        h.quantity,
        h.isSave ? "Saved" : "Binned",
        h.value ? h.value.toFixed(2) : "",
        h.expiryDate,
        h.comment ?? "",
      ]),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Product History</h1>
          <p className="page-subtitle">Discounted, binned, sold, donated &amp; returned — including cleared stock.</p>
        </div>
        <ExportButton onClick={exportCsv} disabled={rows.length === 0} />
      </div>

      {/* Saved vs binned summary over the selected range */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card flex items-center justify-between p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Saved from the bin</div>
            <div className="mt-0.5 text-2xl font-semibold text-emerald-600">{totals.savedUnits} <span className="text-sm font-normal text-slate-400">units</span></div>
          </div>
          <div className="text-right text-sm text-slate-500">{gbp(totals.savedValue)}<div className="text-xs text-slate-400">est. value</div></div>
        </div>
        <div className="card flex items-center justify-between p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Binned</div>
            <div className="mt-0.5 text-2xl font-semibold text-red-600">{totals.binnedUnits} <span className="text-sm font-normal text-slate-400">units</span></div>
          </div>
          <div className="text-right text-sm text-slate-500">{gbp(totals.binnedValue)}<div className="text-xs text-slate-400">est. loss</div></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {[{ label: "7 days", days: 7 }, { label: "30 days", days: 30 }, { label: "90 days", days: 90 }].map((qk) => (
            <button key={qk.days} onClick={() => setQuick(qk.days)} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {qk.label}
            </button>
          ))}
        </div>
        <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input w-auto" value={to} max={fmtIso(new Date())} onChange={(e) => setTo(e.target.value)} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-auto pl-9" placeholder="Search product name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {categories.length > 0 ? (
          <select className="input w-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Action-type chips */}
      <div className="flex flex-wrap gap-2">
        {ACTION_TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={clsx(
                "rounded-full border px-3 py-1 text-sm font-medium transition",
                active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {t.label}
              <span className={clsx("ml-1.5 text-xs", active ? "opacity-80" : "opacity-60")}>{counts[t.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">When</th>
              <th className="px-5 py-2 font-medium">Product</th>
              <th className="px-5 py-2 font-medium">Category</th>
              <th className="px-5 py-2 font-medium">Action</th>
              <th className="px-5 py-2 text-right font-medium">Qty</th>
              <th className="px-5 py-2 text-right font-medium">Value</th>
              <th className="px-5 py-2 font-medium">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {q.isLoading ? (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : q.isError ? (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-red-500">{apiErrorMessage(q.error)}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-slate-400">
                {history.length === 0 ? "No actions recorded in this period." : "No actions match your filters."}
              </td></tr>
            ) : (
              rows.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">{whenLabel(h.performedOn)}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{h.productName}</td>
                  <td className="px-5 py-3 text-slate-600">{h.categoryName}</td>
                  <td className="px-5 py-3"><ActionBadge action={h.actionType} /></td>
                  <td className="px-5 py-3 text-right text-slate-700">{h.quantity}</td>
                  <td className={clsx("px-5 py-3 text-right font-medium", h.value === 0 ? "text-slate-400" : h.isSave ? "text-emerald-600" : "text-red-600")}>
                    {h.value === 0 ? "—" : `${h.isSave ? "" : "−"}${gbp(h.value)}`}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{h.comment ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
