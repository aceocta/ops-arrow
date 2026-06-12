import { CheckCircle2, Thermometer, ShieldX, Clock, Receipt, BellRing } from "lucide-react";
import { SIGNUP_URL } from "../lib/links";
import Reveal from "./Reveal";

/** Stylised product mock built entirely in CSS/SVG — a web dashboard with floating glass cards and a phone overlay. */
function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      {/* Glow behind the mock */}
      <div className="pointer-events-none absolute -inset-10 -z-10 animate-glow-pulse rounded-full bg-[radial-gradient(closest-side,rgba(51,102,255,0.18),transparent)] blur-2xl" />

      {/* Dashboard window — slight perspective tilt */}
      <div className="card overflow-hidden rounded-3xl shadow-[0_24px_70px_-24px_rgba(28,46,143,0.35)] lg:[transform:perspective(1400px)_rotateX(3deg)_rotateY(-5deg)]">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 hidden rounded-md bg-white px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200 sm:block">
            app.opsarrow.co.uk
          </span>
        </div>
        <div className="flex">
          {/* Mini sidebar */}
          <div className="hidden w-24 shrink-0 space-y-2 border-r border-slate-100 p-3 sm:block">
            <div className="h-2 w-14 rounded-full bg-brand-200" />
            <div className="h-2 w-16 rounded-full bg-slate-100" />
            <div className="h-2 w-12 rounded-full bg-slate-100" />
            <div className="h-2 w-16 rounded-full bg-slate-100" />
            <div className="h-2 w-10 rounded-full bg-slate-100" />
          </div>
          {/* Main panel */}
          <div className="flex-1 space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <Thermometer className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">Fridge checks</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">12/12</div>
              </div>
              <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
                <div className="flex items-center gap-1.5 text-brand-600">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">On shift</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">4 staff</div>
              </div>
              <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Receipt className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">Till variance</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">£0.40</div>
              </div>
            </div>
            {/* Temperature sparkline — draws itself in */}
            <div className="rounded-xl p-3 ring-1 ring-slate-100">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Chiller 1 — last 24 h
                </span>
                <span className="badge bg-emerald-100 text-emerald-700">In range</span>
              </div>
              <svg viewBox="0 0 280 60" className="h-14 w-full" role="presentation">
                <polyline
                  points="0,38 25,34 50,40 75,30 100,36 125,28 150,34 175,26 200,32 225,24 250,30 280,26"
                  fill="none"
                  stroke="#3366ff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1"
                  className="animate-draw-line"
                />
                <line x1="0" y1="14" x2="280" y2="14" stroke="#fda4af" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="52" x2="280" y2="52" stroke="#fda4af" strokeWidth="1" strokeDasharray="4 4" />
              </svg>
            </div>
            <div className="space-y-2">
              {["Daily open checklist complete", "Refusal logged — Challenge 25", "Safe drop recorded · £250.00"].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span className="text-[11px] font-medium text-slate-600">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating alert card — glass, top-left */}
      <div className="absolute -left-3 -top-6 hidden w-44 animate-float rounded-2xl bg-white/80 p-3 shadow-glow-sm ring-1 ring-slate-200/80 backdrop-blur-md sm:-left-8 sm:block">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
            <BellRing className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[10px] font-bold text-slate-900">Check due in 10 min</p>
            <p className="text-[9px] font-medium text-slate-500">Freezer 2 · evening log</p>
          </div>
        </div>
      </div>

      {/* Phone overlay — floats gently */}
      <div className="absolute -bottom-8 -right-3 w-36 animate-float-delayed rounded-[1.6rem] border border-slate-200 bg-white/90 p-2 shadow-[0_18px_50px_-16px_rgba(28,46,143,0.4)] backdrop-blur [transform:rotate(3deg)] sm:-right-8 sm:w-40">
        <div className="rounded-[1.2rem] bg-slate-50 p-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
          <div className="flex items-center gap-1.5 text-brand-600">
            <ShieldX className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold">Refusal register</span>
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-slate-200" />
            <div className="h-2 w-4/5 rounded-full bg-slate-200" />
            <div className="h-2 w-3/5 rounded-full bg-slate-200" />
          </div>
          <div className="mt-3 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 py-1.5 text-center text-[10px] font-semibold text-white shadow">
            Log refusal
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Layered depth: grid pattern + radial brand glows */}
      <div className="pointer-events-none absolute inset-0 bg-grid" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(55rem 55rem at 112% -12%, rgba(51,102,255,0.14), transparent 60%), radial-gradient(45rem 45rem at -12% -5%, rgba(14,165,233,0.10), transparent 55%), radial-gradient(36rem 22rem at 50% 118%, rgba(51,102,255,0.07), transparent 60%)",
        }}
        aria-hidden="true"
      />

      <div className="container-page relative grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-2 lg:gap-10 lg:py-28">
        <Reveal>
          <span className="badge-pill">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            The operations platform for UK independent retail
          </span>
          <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-tighter text-slate-900 sm:text-6xl lg:text-7xl">
            Run your shop like clockwork —{" "}
            <span className="text-gradient">without the paperwork</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-500 sm:text-xl">
            Ops Arrow turns the daily grind of a convenience store, off-licence or forecourt — temperature
            logs, refusal registers, checklists, rotas and till reports — into quick taps on your staff's
            phones. Every check done on time, every record inspection-ready, and you can see it all from
            anywhere.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a href={SIGNUP_URL} className="btn-primary px-7 py-3.5 text-base">
              Start free trial
            </a>
            <a href="#pricing" className="btn-ghost px-7 py-3.5 text-base">
              See pricing
            </a>
          </div>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> 14-day free trial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> No card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Cancel anytime
            </span>
          </p>
        </Reveal>
        <Reveal delay={150} className="pb-10 lg:pb-0">
          <ProductMock />
        </Reveal>
      </div>
    </section>
  );
}
