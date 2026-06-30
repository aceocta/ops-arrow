import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import ExportButton from "../../components/ExportButton";
import { downloadCsv } from "../../lib/csv";
import { productExpiryApi, STATUS_META, type ProductBatch, type ProductExpiryStatus } from "../../lib/productExpiry";

const dayLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const daysToExpiryLabel = (days: number) => {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "today";
  return `${days}d left`;
};

function StatusBadge({ status }: { status: ProductExpiryStatus }) {
  const m = STATUS_META[status];
  return <span className={clsx("badge", m.badge)}>{m.label}</span>;
}

// The expiry-alert table only deals with items that need attention (not Safe stock).
type AlertTab = "all" | "Urgent" | "ExpiringSoon" | "Expired";
const ALERT_TABS: { value: AlertTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Urgent", label: "Urgent" },
  { value: "ExpiringSoon", label: "Soon" },
  { value: "Expired", label: "Expired" },
];

export default function ProductExpiryPage() {
  const { activeShopId } = useAuth();
  if (!activeShopId) {
    return <div className="card p-8 text-center text-sm text-slate-500">Select a shop to view expiry alerts.</div>;
  }
  return <ExpiryAlerts shopId={activeShopId} />;
}

function ExpiryAlerts({ shopId }: { shopId: string }) {
  const [tab, setTab] = useState<AlertTab>("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const q = useQuery({
    queryKey: ["product-expiry-list", shopId],
    queryFn: () => productExpiryApi.list(shopId),
    enabled: !!shopId,
  });

  // Only items that need attention — Safe stock isn't an "alert".
  const alerts = useMemo(() => (q.data ?? []).filter((b) => b.status !== "Safe"), [q.data]);

  const counts = useMemo(() => {
    const c: Record<AlertTab, number> = { all: alerts.length, Urgent: 0, ExpiringSoon: 0, Expired: 0 };
    for (const b of alerts) c[b.status as Exclude<AlertTab, "all">] += 1;
    return c;
  }, [alerts]);

  // Category dropdown only offers bands that actually have alert stock (no dead options).
  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of alerts) if (!m.has(b.productCategoryId)) m.set(b.productCategoryId, b.categoryName);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [alerts]);

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      alerts.filter(
        (b) =>
          (tab === "all" || b.status === tab) &&
          (categoryId === "" || b.productCategoryId === categoryId) &&
          (term === "" || b.productName.toLowerCase().includes(term)),
      ),
    [alerts, tab, categoryId, term],
  );

  const exportCsv = () =>
    downloadCsv(
      "expiry-alerts",
      ["Product", "Category", "Status", "Expiry date", "Days to expiry", "Remaining", "Date type"],
      rows.map((b: ProductBatch) => [
        b.productName,
        b.categoryName,
        STATUS_META[b.status].label,
        b.expiryDate,
        b.daysToExpiry,
        b.remainingQuantity,
        b.dateType,
      ]),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Expiry Alerts</h1>
          <p className="page-subtitle">Stock approaching or past its date — act before it's binned.</p>
        </div>
        <ExportButton onClick={exportCsv} disabled={rows.length === 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="segment">
          {ALERT_TABS.map((t) => (
            <button key={t.value} data-active={tab === t.value} onClick={() => { setTab(t.value); setCategoryId(""); }}>
              {t.label}
              <span className="ml-1.5 text-xs opacity-70">{counts[t.value]}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-auto pl-9"
            placeholder="Search product name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Product</th>
              <th className="px-5 py-2 font-medium">Category</th>
              <th className="px-5 py-2 font-medium">Expiry date</th>
              <th className="px-5 py-2 font-medium">Days</th>
              <th className="px-5 py-2 text-right font-medium">Remaining</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {q.isLoading ? (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : q.isError ? (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-red-500">{apiErrorMessage(q.error)}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">
                {alerts.length === 0 ? "Nothing approaching expiry — all clear." : "No products match your filters."}
              </td></tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {b.productName}
                    {b.dateType === "UseBy" ? <span className="ml-2 text-[11px] font-medium text-slate-400">Use by</span> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{b.categoryName}</td>
                  <td className="px-5 py-3 text-slate-600">{dayLabel(b.expiryDate)}</td>
                  <td className={clsx("px-5 py-3", b.daysToExpiry <= 0 ? "font-medium text-red-600" : "text-slate-600")}>
                    {daysToExpiryLabel(b.daysToExpiry)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700">{b.remainingQuantity}</td>
                  <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
