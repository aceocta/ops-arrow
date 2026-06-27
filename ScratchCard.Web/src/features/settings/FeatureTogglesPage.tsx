import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { shopsApi } from "../../lib/shops";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { FeatureModuleRow } from "../shops/ShopFeatureModules";

export default function FeatureTogglesPage() {
  const { activeShopId, activeShop, refreshEntitlements } = useAuth();
  const shopId = activeShopId;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["shop-feature-toggles", shopId],
    queryFn: () => shopsApi.featureToggles(shopId!),
    enabled: !!shopId,
  });

  // Server is the source of truth; seed the local draft when the query lands or the shop changes.
  useEffect(() => {
    if (!q.data) return;
    setDraft(new Set(q.data.modules.filter((m) => m.isDisabledByShop).map((m) => m.key)));
  }, [q.data]);

  const modules = q.data?.modules ?? [];

  const save = useMutation({
    mutationFn: (disabled: string[]) => shopsApi.updateFeatureToggles(shopId!, disabled),
    onSuccess: async (data) => {
      qc.setQueryData(["shop-feature-toggles", shopId], data);
      qc.invalidateQueries({ queryKey: ["shop-summary", shopId] });
      // Re-gate the sidebar / pages to reflect the change immediately.
      await refreshEntitlements();
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const setEnabled = (key: string, on: boolean) => {
    const next = new Set(draft);
    if (on) next.delete(key);
    else next.add(key);
    setDraft(next);
    save.mutate([...next]);
  };

  if (!shopId) return <div className="card p-6 text-sm text-slate-500">Select a shop first.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Feature Toggles</h1>
        <p className="page-subtitle">Turn modules on or off for {activeShop?.shopName ?? "this shop"}.</p>
      </div>

      <div className="card max-w-2xl p-5">
        <div className="mb-2 flex items-start gap-2 text-xs text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Turn off any module your shop doesn't use — it disappears from the menu. Re-enable any
            time. Modules not included in your plan can't be turned on here.
          </span>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-500">Unable to load feature toggles.</p>
        ) : modules.length === 0 ? (
          <p className="text-sm text-slate-400">No toggleable modules.</p>
        ) : (
          modules.map((m) => (
            <FeatureModuleRow
              key={m.key}
              module={m}
              on={m.isAvailableInPlan && !draft.has(m.key)}
              disabled={save.isPending}
              onChange={(on) => setEnabled(m.key, on)}
            />
          ))
        )}
      </div>
    </div>
  );
}
