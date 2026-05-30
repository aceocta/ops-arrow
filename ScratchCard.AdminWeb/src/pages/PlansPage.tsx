import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "../api/client";
import { listAdminPlans, listFeatures, listPlanFeatures, setPlanFeatures } from "../api/plans";
import type { Feature, SubscriptionPlan, SubscriptionPlanFeature, UpsertPlanFeatureRequest } from "../types";

export function PlansPage() {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const plansQuery = useQuery({ queryKey: ["admin-plans"], queryFn: listAdminPlans });
  const featuresQuery = useQuery({ queryKey: ["admin-features"], queryFn: () => listFeatures(false) });

  const plans = plansQuery.data ?? [];

  // Default to the first plan once the list arrives.
  useEffect(() => {
    if (!selectedPlanId && plans.length > 0) setSelectedPlanId(plans[0].id);
  }, [plans, selectedPlanId]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Subscription Plans</h1>
      </div>

      {plansQuery.isError ? (
        <div className="error-banner">{getApiErrorMessage(plansQuery.error, "Failed to load plans.")}</div>
      ) : null}
      {featuresQuery.isError ? (
        <div className="error-banner">{getApiErrorMessage(featuresQuery.error, "Failed to load features.")}</div>
      ) : null}

      <div className="plans-layout">
        <div className="card plans-list">
          {plansQuery.isLoading ? (
            <div className="empty-cell">Loading plans…</div>
          ) : plans.length === 0 ? (
            <div className="empty-cell">No plans found.</div>
          ) : (
            plans.map((p) => (
              <button
                key={p.id}
                className={`plan-item${p.id === selectedPlanId ? " active" : ""}`}
                onClick={() => setSelectedPlanId(p.id)}
              >
                <span className="plan-item-main">
                  <span className="identity-name">{p.name}</span>
                  {!p.isActive ? <span className="badge badge-warn">Inactive</span> : null}
                </span>
                <span className="muted plan-item-sub">
                  {p.billingCycle} · {p.includedFeatures.length} feature{p.includedFeatures.length === 1 ? "" : "s"}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="plans-detail">
          {selectedPlan && featuresQuery.data ? (
            <PlanFeatureEditor plan={selectedPlan} features={featuresQuery.data} />
          ) : (
            <div className="card empty-cell">Select a plan to edit its features.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanFeatureEditor({ plan, features }: { plan: SubscriptionPlan; features: Feature[] }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, SubscriptionPlanFeature>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const planFeaturesQuery = useQuery({
    queryKey: ["plan-features", plan.id],
    queryFn: () => listPlanFeatures(plan.id),
  });

  // Seed local toggle state from the server whenever the plan's feature rows (re)load.
  useEffect(() => {
    if (!planFeaturesQuery.data) return;
    const enabledIds = new Set<string>();
    const overrideMap = new Map<string, SubscriptionPlanFeature>();
    for (const pf of planFeaturesQuery.data) {
      overrideMap.set(pf.featureId, pf);
      if (pf.isEnabled) enabledIds.add(pf.featureId);
    }
    setEnabled(enabledIds);
    setOverrides(overrideMap);
    setSavedAt(null);
  }, [planFeaturesQuery.data]);

  const initialEnabled = useMemo(() => {
    const s = new Set<string>();
    for (const pf of planFeaturesQuery.data ?? []) if (pf.isEnabled) s.add(pf.featureId);
    return s;
  }, [planFeaturesQuery.data]);

  const dirty = useMemo(() => {
    if (enabled.size !== initialEnabled.size) return true;
    for (const id of enabled) if (!initialEnabled.has(id)) return true;
    return false;
  }, [enabled, initialEnabled]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // Send only enabled features (full replacement). Preserve any existing limit/notes overrides.
      const payload: UpsertPlanFeatureRequest[] = [...enabled].map((featureId) => {
        const prev = overrides.get(featureId);
        return {
          featureId,
          isEnabled: true,
          limitValue: prev?.limitValue ?? null,
          notes: prev?.notes ?? null,
        };
      });
      return setPlanFeatures(plan.id, payload);
    },
    onSuccess: () => {
      setError(null);
      setSavedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["plan-features", plan.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e) => setError(getApiErrorMessage(e, "Failed to save features.")),
  });

  const toggle = (featureId: string) => {
    setSavedAt(null);
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  };

  const reset = () => {
    setEnabled(new Set(initialEnabled));
    setSavedAt(null);
  };

  // Group the catalogue by category for display.
  const grouped = useMemo(() => {
    const map = new Map<string, Feature[]>();
    for (const f of features) {
      const cat = f.category?.trim() || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [features]);

  const busy = saveMutation.isPending;

  return (
    <div className="card plan-editor">
      <div className="plan-editor-head">
        <div>
          <h2>{plan.name}</h2>
          <p className="muted">{enabled.size} of {features.length} features enabled</p>
        </div>
        <div className="row-actions">
          {dirty ? <span className="badge badge-warn">Unsaved changes</span> : null}
          {savedAt && !dirty ? <span className="badge badge-ok">Saved</span> : null}
          <button className="btn btn-sm" disabled={!dirty || busy} onClick={reset}>Reset</button>
          <button
            className="btn btn-sm btn-primary"
            disabled={!dirty || busy}
            onClick={() => saveMutation.mutate()}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {planFeaturesQuery.isLoading ? (
        <div className="empty-cell">Loading features…</div>
      ) : (
        <div className="feature-groups">
          {grouped.map(([category, items]) => (
            <div key={category} className="feature-group">
              <h3 className="feature-group-title">{category}</h3>
              {items.map((f) => (
                <label key={f.id} className="feature-row">
                  <input
                    type="checkbox"
                    checked={enabled.has(f.id)}
                    onChange={() => toggle(f.id)}
                    disabled={busy}
                  />
                  <span className="feature-row-text">
                    <span className="feature-row-name">{f.name}</span>
                    {f.description ? <span className="muted feature-row-desc">{f.description}</span> : null}
                    <span className="muted feature-row-key">{f.key}</span>
                  </span>
                  {f.isSystem ? <span className="badge feature-tag">system</span> : null}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
