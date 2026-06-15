import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import {
  subscriptionApi,
  type BillingCycle,
  type ShopSubscriptionSummary,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "../../lib/subscription";
import { confirmDialog, toast } from "../../components/feedback";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Store,
  XCircle,
} from "lucide-react";
import clsx from "clsx";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const cycleSuffix = (c: BillingCycle) => (c === "Monthly" ? "/mo" : c === "Annual" ? "/yr" : "");

const STATUS_META: Record<SubscriptionStatus, { label: string; cls: string }> = {
  TrialActive: { label: "Trial", cls: "bg-sky-100 text-sky-700" },
  TrialExpired: { label: "Trial expired", cls: "bg-amber-100 text-amber-700" },
  Active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  PastDue: { label: "Past due", cls: "bg-amber-100 text-amber-700" },
  PaymentFailed: { label: "Payment failed", cls: "bg-red-100 text-red-700" },
  Cancelled: { label: "Cancelled", cls: "bg-slate-200 text-slate-600" },
  Expired: { label: "Expired", cls: "bg-slate-200 text-slate-600" },
  Suspended: { label: "Paused", cls: "bg-amber-100 text-amber-700" },
};

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.cls)}>
      {meta.label}
    </span>
  );
}

export default function BillingPage() {
  const { profile, activeShopId, isOwner, isManager } = useAuth();
  const canManage = isOwner || isManager;
  const shops = profile?.shops ?? [];
  // Deep link support: a `?shopId=` query param (e.g. from the "Email me my account info" link sent
  // by the mobile app) opens this page focused on that shop. Falls back to the active/first shop.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedShopId = searchParams.get("shopId");
  const [shopId, setShopId] = useState<string | null>(
    () =>
      shops.find((s) => s.shopId === linkedShopId)?.shopId ??
      shops.find((s) => s.shopId === activeShopId)?.shopId ??
      shops[0]?.shopId ??
      null,
  );
  const shop = shops.find((s) => s.shopId === shopId) ?? null;

  // The profile's shops may load after first render; once they do, honour the linked shop and then
  // drop the param from the URL so a later manual shop switch isn't overridden on refresh.
  useEffect(() => {
    if (!linkedShopId) return;
    const match = shops.find((s) => s.shopId === linkedShopId);
    if (match) setShopId(match.shopId);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedShopId, shops.length]);

  if (!canManage) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        Billing is managed by company owners and managers. Ask an owner if you need a plan change.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="text-sm text-slate-500">
          Subscriptions are per shop. Choose a plan, manage payment details and pause or cancel — all billing for your
          company is handled here.
        </p>
      </div>

      {shops.length === 0 ? <div className="card p-6 text-sm text-slate-400">No shops yet — create a shop first.</div> : null}

      {shops.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {shops.map((s) => (
            <button
              key={s.shopId}
              onClick={() => setShopId(s.shopId)}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                s.shopId === shopId
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <Store className="h-4 w-4" />
              <span>{s.shopName}</span>
            </button>
          ))}
        </div>
      ) : null}

      {shopId ? <ShopBilling key={shopId} shopId={shopId} shopName={shop?.shopName ?? ""} /> : null}
    </div>
  );
}

function ShopBilling({ shopId, shopName }: { shopId: string; shopName: string }) {
  const qc = useQueryClient();
  // A cancel-at-period-end isn't visible in the summary (status stays Active until the webhook
  // fires), so remember it locally for this session to surface the Reactivate action.
  const [cancelScheduled, setCancelScheduled] = useState(false);

  const summaryQ = useQuery({
    queryKey: ["shop-summary", shopId],
    queryFn: () => subscriptionApi.shopSummary(shopId),
  });
  const plansQ = useQuery({ queryKey: ["subscription-plans"], queryFn: subscriptionApi.plans });

  const summary = summaryQ.data ?? null;
  const plans = useMemo(
    () => (plansQ.data ?? []).filter((p) => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [plansQ.data],
  );
  const hasMonthly = plans.some((p) => p.billingCycle === "Monthly");
  const hasAnnual = plans.some((p) => p.billingCycle === "Annual");
  const [cycle, setCycle] = useState<"Monthly" | "Annual">("Monthly");
  const visiblePlans = plans.filter((p) => p.billingCycle === "Trial" || p.billingCycle === cycle || !(hasMonthly && hasAnnual));

  const invalidate = (data?: ShopSubscriptionSummary) => {
    if (data) qc.setQueryData(["shop-summary", shopId], data);
    else qc.invalidateQueries({ queryKey: ["shop-summary", shopId] });
    qc.invalidateQueries({ queryKey: ["entitlements"] });
  };

  // ── Plan selection ──────────────────────────────────────────────────────
  const selectPlanM = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      const res = await subscriptionApi.selectPlan(shopId, plan.id);
      if (plan.billingCycle !== "Trial") {
        // Paid plans go through Stripe Checkout; select-plan only records the choice.
        const url = res?.checkoutUrl ?? (await subscriptionApi.checkoutSession(shopId, plan.id)).url;
        return { url };
      }
      return { url: null as string | null };
    },
    onSuccess: ({ url }) => {
      if (url) {
        window.location.href = url;
        return;
      }
      toast("Plan updated.", "success");
      invalidate();
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const choosePlan = async (plan: SubscriptionPlan) => {
    const paid = plan.billingCycle !== "Trial";
    const alreadyActive = summary?.status === "Active";
    const ok = await confirmDialog({
      title: `Switch ${shopName} to ${plan.name}?`,
      message: paid
        ? `${gbp(plan.pricePerShop)}${cycleSuffix(plan.billingCycle)} per shop. You'll be taken to Stripe to complete payment — the plan activates once payment succeeds.${
            alreadyActive
              ? " This shop already has an active subscription: completing checkout starts a new Stripe subscription, so check the billing portal afterwards to make sure you aren't billed twice."
              : ""
          }`
        : `This selects the ${plan.name} plan${plan.trialDays ? ` with a ${plan.trialDays}-day trial` : ""}. No payment is taken.`,
      confirmLabel: paid ? "Continue to checkout" : "Select plan",
      tone: "primary",
    });
    if (ok) selectPlanM.mutate(plan);
  };

  // ── Manage actions ──────────────────────────────────────────────────────
  const portalM = useMutation({
    mutationFn: () => subscriptionApi.portalSession(shopId),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const refreshM = useMutation({
    mutationFn: () => subscriptionApi.refreshFromProvider(shopId),
    onSuccess: (data) => {
      invalidate(data);
      toast("Subscription status refreshed.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const pauseM = useMutation({
    mutationFn: () => subscriptionApi.pause(shopId),
    onSuccess: (data) => {
      invalidate(data);
      toast("Subscription paused.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const resumeM = useMutation({
    mutationFn: () => subscriptionApi.resume(shopId),
    onSuccess: (data) => {
      invalidate(data);
      toast("Subscription resumed.", "success");
    },
    onError: (e: any) => {
      const code = e?.response?.data?.code ?? e?.response?.data?.error;
      if (e?.response?.status === 409 || code === "subscription_expired") {
        toast("The paused subscription has expired and can't be resumed. Choose a plan below to re-subscribe.", "error");
      } else {
        toast(apiErrorMessage(e), "error");
      }
    },
  });

  const cancelM = useMutation({
    mutationFn: () => subscriptionApi.cancel(shopId, true),
    onSuccess: (data) => {
      setCancelScheduled(true);
      invalidate(data);
      toast("Cancellation scheduled — access continues until the end of the current period.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const reactivateM = useMutation({
    mutationFn: () => subscriptionApi.reactivate(shopId),
    onSuccess: (data) => {
      setCancelScheduled(false);
      invalidate(data);
      toast("Subscription reactivated.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const onPause = async () => {
    const ok = await confirmDialog({
      title: `Pause ${shopName}?`,
      message:
        "Billing stops immediately and the shop becomes read-only until you resume. Remaining trial days are not extended. Paused shops are automatically cancelled after 1 year.",
      confirmLabel: "Pause subscription",
    });
    if (ok) pauseM.mutate();
  };

  const onResume = async () => {
    const ok = await confirmDialog({
      title: `Resume ${shopName}?`,
      message: "The shop becomes fully usable again and billing picks back up on the next renewal date.",
      confirmLabel: "Resume",
      tone: "primary",
    });
    if (ok) resumeM.mutate();
  };

  const onCancel = async () => {
    const ok = await confirmDialog({
      title: `Cancel the subscription for ${shopName}?`,
      message: `The subscription is cancelled at the end of the current billing period${
        summary?.currentPeriodEndsOn ? ` (${fmtDate(summary.currentPeriodEndsOn)})` : ""
      }. You keep full access until then; afterwards the shop is locked until you re-subscribe. You can reactivate before the period ends.`,
      confirmLabel: "Cancel subscription",
    });
    if (ok) cancelM.mutate();
  };

  const onReactivate = async () => {
    const ok = await confirmDialog({
      title: `Reactivate ${shopName}?`,
      message:
        "Removes the scheduled cancellation and billing continues as normal. If the paid period has already ended you may need to choose a plan again.",
      confirmLabel: "Reactivate",
      tone: "primary",
    });
    if (ok) reactivateM.mutate();
  };

  const status = summary?.status;
  const isPaused = status === "Suspended";
  const isCancelled = status === "Cancelled" || status === "Expired";
  const canPause = !!summary && !isPaused && !isCancelled;
  const canCancel = !!summary && !isCancelled;
  const showReactivate = !!summary && (status === "Cancelled" || cancelScheduled);
  const busy =
    selectPlanM.isPending || portalM.isPending || pauseM.isPending || resumeM.isPending || cancelM.isPending || reactivateM.isPending;

  return (
    <div className="space-y-6">
      {/* ── Status ── */}
      <div className="card p-5">
        {summaryQ.isLoading ? (
          <div className="text-sm text-slate-500">Loading subscription…</div>
        ) : summaryQ.isError ? (
          <div className="text-sm text-red-600">{apiErrorMessage(summaryQ.error, "Could not load the subscription.")}</div>
        ) : summary ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{summary.planName || "No plan"}</h2>
                  <StatusBadge status={summary.status} />
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {summary.price > 0 ? (
                    <span className="font-medium text-slate-700">
                      {gbp(summary.price)}
                      {cycleSuffix(summary.billingCycle)}
                    </span>
                  ) : (
                    "Free trial"
                  )}
                  <span className="text-slate-400"> · {shopName}</span>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => refreshM.mutate()} disabled={refreshM.isPending}>
                <RefreshCw className={clsx("h-4 w-4", refreshM.isPending && "animate-spin")} />
                {refreshM.isPending ? "Refreshing…" : "Refresh status"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {summary.trialEndsOn && (summary.status === "TrialActive" || summary.status === "TrialExpired") ? (
                <div className="flex items-center gap-2 text-slate-600">
                  <CalendarClock className="h-4 w-4 text-slate-400" />
                  Trial {summary.status === "TrialExpired" ? "ended" : "ends"} {fmtDate(summary.trialEndsOn)}
                  {summary.trialDaysRemaining != null && summary.status === "TrialActive"
                    ? ` (${summary.trialDaysRemaining} day${summary.trialDaysRemaining === 1 ? "" : "s"} left)`
                    : ""}
                </div>
              ) : null}
              {summary.currentPeriodEndsOn && summary.status !== "TrialActive" && summary.status !== "TrialExpired" ? (
                <div className="flex items-center gap-2 text-slate-600">
                  <CalendarClock className="h-4 w-4 text-slate-400" />
                  {summary.status === "Active" ? "Renews" : "Period ends"} {fmtDate(summary.currentPeriodEndsOn)}
                </div>
              ) : null}
              {summary.maxUsers != null ? (
                <div className="flex items-center gap-2 text-slate-600">
                  <BadgeCheck className="h-4 w-4 text-slate-400" />
                  Up to {summary.maxUsers} users
                </div>
              ) : null}
            </div>

            {isPaused ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Paused {summary.pausedOn ? `since ${fmtDate(summary.pausedOn)}` : ""}. The shop is read-only.
                  {summary.pauseDaysRemaining != null
                    ? ` It will be cancelled automatically in ${summary.pauseDaysRemaining} day${summary.pauseDaysRemaining === 1 ? "" : "s"} unless resumed.`
                    : ""}
                </span>
              </div>
            ) : null}

            {summary.requiresBillingAction ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This shop needs billing attention — payment is required to keep full access.{" "}
                  {summary.hasBillingAccount
                    ? "Choose a plan below, or open the Stripe billing portal to update your payment details."
                    : "Choose a plan below to get started."}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No subscription found for this shop — choose a plan below.</div>
        )}
      </div>

      {/* ── Plans ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Plans</h2>
          {hasMonthly && hasAnnual ? (
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              {(["Monthly", "Annual"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    cycle === c ? "bg-brand-600 text-white" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {plansQ.isLoading ? <div className="card p-5 text-sm text-slate-500">Loading plans…</div> : null}
        {plansQ.isError ? (
          <div className="card p-5 text-sm text-red-600">{apiErrorMessage(plansQ.error, "Could not load plans.")}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiblePlans.map((p) => {
            const isCurrent = !!summary?.subscriptionPlanId && summary.subscriptionPlanId === p.id;
            return (
              <div key={p.id} className={clsx("card flex flex-col p-5", isCurrent && "ring-2 ring-brand-500")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  {isCurrent ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Current plan</span>
                  ) : null}
                </div>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold text-slate-900">{gbp(p.pricePerShop)}</span>
                  <span className="text-sm text-slate-400">
                    {cycleSuffix(p.billingCycle)} per shop
                    {p.trialDays ? ` · ${p.trialDays}-day trial` : ""}
                  </span>
                </div>
                {p.description ? <p className="mt-2 text-sm text-slate-500">{p.description}</p> : null}
                <div className="flex-1" />
                <button
                  className={clsx("mt-4", isCurrent ? "btn-ghost" : "btn-primary")}
                  disabled={isCurrent || busy}
                  onClick={() => choosePlan(p)}
                >
                  {isCurrent ? "Selected" : selectPlanM.isPending ? "Working…" : p.billingCycle === "Trial" ? "Select plan" : "Choose & pay"}
                </button>
              </div>
            );
          })}
        </div>
        {!plansQ.isLoading && visiblePlans.length === 0 ? (
          <div className="card p-5 text-sm text-slate-400">No plans available.</div>
        ) : null}
      </div>

      {/* ── Manage ── */}
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Manage subscription</h2>
          <p className="text-sm text-slate-500">
            Payment cards, invoices and receipts are handled securely by Stripe in the billing portal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary?.hasBillingAccount ? (
            <button className="btn-primary" onClick={() => portalM.mutate()} disabled={busy}>
              <ExternalLink className="h-4 w-4" />
              {portalM.isPending ? "Opening…" : "Open Stripe billing portal"}
            </button>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <CreditCard className="h-4 w-4 shrink-0" />
              The billing portal becomes available after your first checkout — choose a plan above to get started.
            </p>
          )}
          {canPause ? (
            <button className="btn-ghost" onClick={onPause} disabled={busy}>
              <PauseCircle className="h-4 w-4" /> {pauseM.isPending ? "Pausing…" : "Pause"}
            </button>
          ) : null}
          {isPaused ? (
            <button className="btn-ghost" onClick={onResume} disabled={busy}>
              <PlayCircle className="h-4 w-4" /> {resumeM.isPending ? "Resuming…" : "Resume"}
            </button>
          ) : null}
          {showReactivate ? (
            <button className="btn-ghost" onClick={onReactivate} disabled={busy}>
              <RotateCcw className="h-4 w-4" /> {reactivateM.isPending ? "Reactivating…" : "Reactivate"}
            </button>
          ) : null}
          {canCancel ? (
            <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={onCancel} disabled={busy}>
              <XCircle className="h-4 w-4" /> {cancelM.isPending ? "Cancelling…" : "Cancel subscription"}
            </button>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <CreditCard className="h-3.5 w-3.5" />
          Cancelling stops billing at the end of the current period — you keep access until then.
        </p>
      </div>
    </div>
  );
}
