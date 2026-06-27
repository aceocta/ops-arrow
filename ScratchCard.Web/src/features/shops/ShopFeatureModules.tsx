import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import clsx from "clsx";
import { shopsApi, type ShopFeatureModule } from "../../lib/shops";

/** A small on/off switch. Disabled (locked) when the module isn't in the chosen plan. */
export function FeatureToggleSwitch({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-brand-600" : "bg-slate-300",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** One module row: name, "Not in plan" lock badge, description, and the toggle. */
export function FeatureModuleRow({
  module,
  on,
  disabled,
  onChange,
}: {
  module: ShopFeatureModule;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const lockedByPlan = !module.isAvailableInPlan;
  return (
    <div className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{module.name}</span>
          {lockedByPlan ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <Lock className="h-3 w-3" /> Not in plan
            </span>
          ) : null}
        </div>
        {module.description ? <p className="mt-0.5 text-xs text-slate-400">{module.description}</p> : null}
      </div>
      <FeatureToggleSwitch on={on} disabled={lockedByPlan || disabled} onChange={onChange} />
    </div>
  );
}

/**
 * Feature-selection step for shop creation. Lets the owner choose which modules the new shop will
 * use and reports the inverse (the disabled module keys) up to the parent so it can be posted with
 * the create request. Modules the chosen plan doesn't include are locked; the initial on/off state
 * matches what a brand-new shop would get by default.
 */
export function ShopFeatureSelect({
  planId,
  disabledKeys,
  onChange,
  disabled,
}: {
  planId: string | null;
  disabledKeys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const q = useQuery({
    queryKey: ["shop-feature-modules", planId],
    queryFn: () => shopsApi.featureModulesForPlan(planId ?? undefined),
    enabled: !!planId,
    staleTime: 10 * 60 * 1000,
  });

  const modules = q.data?.modules ?? [];

  // Seed defaults (server's OFF state) whenever the plan's module set loads/changes — not on every
  // user toggle, so the parent-owned selection is preserved while editing.
  useEffect(() => {
    if (!q.data) return;
    onChange(q.data.modules.filter((m) => m.isDisabledByShop).map((m) => m.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const draft = new Set(disabledKeys);
  const setEnabled = (key: string, on: boolean) => {
    const next = new Set(draft);
    if (on) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  return (
    <div>
      <label className="label">Features</label>
      <p className="mb-1 text-xs text-slate-400">
        Turn on the modules this shop will use. You can change these later in Feature Toggles.
      </p>
      {!planId ? (
        <p className="py-2 text-xs text-slate-400">Choose a package above to pick features.</p>
      ) : q.isLoading ? (
        <p className="py-2 text-xs text-slate-400">Loading features…</p>
      ) : q.isError ? (
        <p className="py-2 text-xs text-red-500">Couldn't load features — you can set these up later.</p>
      ) : (
        <div className="rounded-xl border border-slate-200 px-3">
          {modules.map((m) => (
            <FeatureModuleRow
              key={m.key}
              module={m}
              on={m.isAvailableInPlan && !draft.has(m.key)}
              disabled={disabled}
              onChange={(on) => setEnabled(m.key, on)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
