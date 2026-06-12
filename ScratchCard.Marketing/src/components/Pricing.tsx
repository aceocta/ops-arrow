import { useEffect, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import clsx from "clsx";
import { fetchPublicPlans, gbp, cycleSuffix, type PublicPlan } from "../lib/plans";
import { CONTACT_EMAIL, SIGNUP_URL } from "../lib/links";
import Reveal from "./Reveal";

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; plans: PublicPlan[] };

function SkeletonCard() {
  return (
    <div className="card animate-pulse rounded-3xl p-7" aria-hidden="true">
      <div className="h-5 w-24 rounded-full bg-slate-200" />
      <div className="mt-4 h-9 w-32 rounded-lg bg-slate-200" />
      <div className="mt-2 h-3 w-40 rounded-full bg-slate-100" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-3 w-full rounded-full bg-slate-100" />
        ))}
      </div>
      <div className="mt-7 h-11 w-full rounded-xl bg-slate-200" />
    </div>
  );
}

function PlanCard({ plan, popular }: { plan: PublicPlan; popular: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const modules = plan.featureCategories.find((c) => c.category === "Modules");
  const otherCategories = plan.featureCategories.filter((c) => c.category !== "Modules");
  const detailsId = `plan-details-${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const card = (
    <div
      className={clsx(
        "relative flex h-full flex-col bg-white p-7",
        popular
          ? "rounded-[calc(1.5rem-1px)]"
          : "card card-hover rounded-3xl",
      )}
    >
      {popular ? (
        <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-3.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-brand-600/30 ring-1 ring-inset ring-white/25">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Most popular
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold tracking-tight text-slate-900">{plan.name}</h3>
        {plan.trialDays ? (
          <span className="badge gap-1.5 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {plan.trialDays}-day free trial
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <span className="text-5xl font-black tracking-tighter text-slate-900">{gbp(plan.pricePerShop)}</span>
        <span className="ml-1.5 text-sm font-medium text-slate-500">{cycleSuffix(plan.billingCycle)}</span>
      </div>

      {plan.description ? <p className="mt-3 text-sm leading-relaxed text-slate-500">{plan.description}</p> : null}
      {plan.maxUsers != null ? (
        <p className="mt-1.5 text-xs font-medium text-slate-400">Up to {plan.maxUsers} users per shop</p>
      ) : null}

      {modules && modules.features.length > 0 ? (
        <ul className="mt-6 space-y-2.5">
          {modules.features.map((f) => (
            <li key={f.name} className="flex items-start gap-2.5 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                {f.name}
                {f.description ? <span className="block text-xs text-slate-400">{f.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {otherCategories.length > 0 ? (
        <div className="mt-5">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            See everything included
            <ChevronDown
              className={clsx("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {expanded ? (
            <div id={detailsId} className="mt-3 space-y-4 border-t border-slate-100 pt-4">
              {otherCategories.map((cat) => (
                <div key={cat.category}>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{cat.category}</h4>
                  <ul className="mt-2 space-y-2">
                    {cat.features.map((f) => (
                      <li key={f.name} className="flex items-start gap-2.5 text-sm text-slate-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                        <span>
                          {f.name}
                          {f.description ? <span className="block text-xs text-slate-400">{f.description}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-7">
        <a href={SIGNUP_URL} className={clsx("w-full", popular ? "btn-primary" : "btn-ghost")}>
          Start free trial
        </a>
      </div>
    </div>
  );

  if (!popular) return card;

  // Premium gradient hairline border around the popular plan.
  return (
    <div className="relative h-full rounded-3xl bg-gradient-to-b from-brand-400 via-brand-500 to-sky-400 p-[1px] shadow-[0_24px_60px_-20px_rgba(31,71,245,0.4)] transition-transform duration-300 hover:-translate-y-1">
      {card}
    </div>
  );
}

export default function Pricing() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchPublicPlans(controller.signal)
      .then((plans) => setState({ status: "ready", plans }))
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  // "Growth" is the popular pick; fall back to the middle card if it isn't present.
  const popularIndex = (plans: PublicPlan[]) => {
    const byName = plans.findIndex((p) => p.name.toLowerCase() === "growth");
    if (byName >= 0) return byName;
    return plans.length >= 3 ? Math.floor(plans.length / 2) : -1;
  };

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="relative overflow-hidden border-y border-slate-200/60 bg-slate-50/70 py-16 sm:py-28"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(50rem 32rem at 50% -8%, rgba(51,102,255,0.09), transparent 60%), radial-gradient(36rem 24rem at 95% 100%, rgba(14,165,233,0.06), transparent 55%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Pricing
          </p>
          <h2 id="pricing-heading" className="section-title">
            Simple <span className="text-gradient">per-shop</span> pricing
          </h2>
          <p className="section-subtitle">
            Pick a plan per shop, try it free for two weeks, and only pay if it earns its keep.
          </p>
        </Reveal>

        <div className="mt-14">
          {state.status === "loading" ? (
            <div className="grid gap-6 md:grid-cols-3" aria-busy="true" aria-label="Loading plans">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : state.status === "error" ? (
            <div className="card mx-auto max-w-xl rounded-3xl p-10 text-center" role="alert">
              <h3 className="text-lg font-bold text-slate-900">We couldn't load pricing just now</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Please try refreshing the page in a moment — or drop us a line and we'll send the latest plans
                and prices straight over.
              </p>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Ops%20Arrow%20pricing`} className="btn-primary mt-6">
                Contact us
              </a>
            </div>
          ) : (
            <div
              className={clsx(
                "grid items-stretch gap-6",
                state.plans.length >= 3
                  ? "md:grid-cols-3"
                  : state.plans.length === 2
                    ? "mx-auto max-w-3xl md:grid-cols-2"
                    : "mx-auto max-w-md",
              )}
            >
              {state.plans.map((plan, i) => (
                <Reveal key={plan.name} delay={i * 100} className="h-full">
                  <PlanCard plan={plan} popular={i === popularIndex(state.plans)} />
                </Reveal>
              ))}
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          Prices per shop. Subscriptions are managed online — visit your account portal to subscribe or make changes.
        </p>
      </div>
    </section>
  );
}
