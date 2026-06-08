import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { shopsApi, type Shop, type SaveShopPayload } from "../../lib/shops";
import { subscriptionApi, type SubscriptionPlan } from "../../lib/subscription";
import { Plus, X, Store, Pencil } from "lucide-react";
import clsx from "clsx";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

export default function ShopsPage() {
  const { profile, activeShop, isOwner } = useAuth();
  const companyId = activeShop?.companyId ?? profile?.shops?.find((s) => s.companyId)?.companyId ?? null;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Shop | "new" | null>(null);

  const q = useQuery({ queryKey: ["shops", companyId], queryFn: () => shopsApi.list(companyId) });
  const plansQ = useQuery({ queryKey: ["subscription-plans"], queryFn: subscriptionApi.plans });
  const plans = (plansQ.data ?? []).filter((p) => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  const shops = q.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Shops</h1>
          <p className="text-sm text-slate-500">{isOwner ? "Add and manage the shops in your company" : "Manage your shop's details"}</p>
        </div>
        {isOwner ? (
          <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add shop</button>
        ) : null}
      </div>

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}
      {!q.isLoading && shops.length === 0 ? <div className="card p-6 text-sm text-slate-400">No shops yet.</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shops.map((s) => (
          <div key={s.id} className="card flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Store className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-800">{s.shopName}</span>
                {!s.isActive ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Inactive</span> : null}
              </div>
              <div className="text-xs text-slate-400">
                {[s.addressLine1, s.city, s.postCode].filter(Boolean).join(", ")}
              </div>
              {s.companyName ? <div className="mt-0.5 text-xs text-slate-400">{s.companyName}</div> : null}
              <PlanBadge shopId={s.id} />
            </div>
            <button className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50" onClick={() => setEditing(s)}>
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {editing ? (
        <ShopModal
          shop={editing === "new" ? null : editing}
          companyId={companyId}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["shops", companyId] });
            qc.invalidateQueries({ queryKey: ["entitlements"] });
          }}
        />
      ) : null}
    </div>
  );
}

function PlanBadge({ shopId }: { shopId: string }) {
  const q = useQuery({ queryKey: ["shop-summary", shopId], queryFn: () => subscriptionApi.shopSummary(shopId) });
  const name = q.data?.planName;
  if (!name) return null;
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
      {name}
    </span>
  );
}

function ShopModal({
  shop,
  companyId,
  plans,
  onClose,
  onSaved,
}: {
  shop: Shop | null;
  companyId: string | null;
  plans: SubscriptionPlan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [shopName, setShopName] = useState(shop?.shopName ?? "");
  const [addressLine1, setAddressLine1] = useState(shop?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(shop?.addressLine2 ?? "");
  const [city, setCity] = useState(shop?.city ?? "");
  const [postCode, setPostCode] = useState(shop?.postCode ?? "");
  const [country, setCountry] = useState(shop?.country ?? "United Kingdom");
  const [isActive, setIsActive] = useState(shop?.isActive ?? true);
  const [planId, setPlanId] = useState("");
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);

  // For an existing shop, load its current plan so the dropdown reflects reality.
  const summaryQ = useQuery({
    queryKey: ["shop-summary", shop?.id],
    queryFn: () => subscriptionApi.shopSummary(shop!.id),
    enabled: !!shop,
  });
  useEffect(() => {
    const pid = summaryQ.data?.subscriptionPlanId ?? null;
    if (shop && pid) { setCurrentPlanId(pid); setPlanId(pid); }
  }, [summaryQ.data, shop]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload: SaveShopPayload = {
        companyId: shop?.companyId ?? companyId,
        shopName: shopName.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        postCode: postCode.trim(),
        country: country.trim(),
        isActive,
      };
      if (shop) {
        await shopsApi.update(shop.id, payload);
        // Apply a plan change via the subscription flow (may return a billing checkout URL).
        if (planId && planId !== currentPlanId) {
          const res = await subscriptionApi.selectPlan(shop.id, planId);
          if (res?.checkoutUrl) window.open(res.checkoutUrl as string, "_blank");
        }
        return;
      }
      await shopsApi.create({ ...payload, subscriptionPlanId: planId || undefined });
    },
    onSuccess: onSaved,
    onError: (e) => alert(apiErrorMessage(e)),
  });

  const valid = shopName.trim() && addressLine1.trim() && city.trim() && postCode.trim() && country.trim() && planId;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{shop ? "Edit shop" : "Add shop"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div><label className="label">Shop name</label><input className="input" value={shopName} onChange={(e) => setShopName(e.target.value)} /></div>
          <div><label className="label">Address line 1</label><input className="input" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} /></div>
          <div><label className="label">Address line 2 (optional)</label><input className="input" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><label className="label">Post code</label><input className="input" value={postCode} onChange={(e) => setPostCode(e.target.value)} /></div>
          </div>
          <div><label className="label">Country</label><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
          <div>
            <label className="label">Subscription package</label>
            <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={!!shop && summaryQ.isLoading}>
              <option value="">Select a package…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {gbp(p.pricePerShop)}/shop{p.trialDays ? ` · ${p.trialDays}-day trial` : ""}
                </option>
              ))}
            </select>
            {shop && planId && planId !== currentPlanId ? (
              <p className="mt-1 text-xs text-amber-600">Changing the package may start a billing checkout.</p>
            ) : null}
          </div>
          {shop ? (
            <label className="flex items-center gap-2 pt-1 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className={clsx("btn-primary")} disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Saving…" : shop ? "Save changes" : "Create shop"}
          </button>
        </div>
      </div>
    </div>
  );
}
