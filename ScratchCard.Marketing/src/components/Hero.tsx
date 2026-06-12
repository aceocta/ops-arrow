import { CheckCircle2, Thermometer, ShieldX, Clock, Receipt } from "lucide-react";
import { SIGNUP_URL } from "../lib/links";

/** Stylised product mock built entirely in CSS/SVG — a web dashboard with a phone overlay. */
function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      {/* Dashboard window */}
      <div className="card overflow-hidden">
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
              <div className="rounded-xl border border-slate-100 bg-white p-2.5">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <Thermometer className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">Fridge checks</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">12/12</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-2.5">
                <div className="flex items-center gap-1.5 text-brand-600">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">On shift</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">4 staff</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-2.5">
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Receipt className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">Till variance</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">£0.40</div>
              </div>
            </div>
            {/* Temperature sparkline */}
            <div className="rounded-xl border border-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500">Chiller 1 — last 24 h</span>
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

      {/* Phone overlay */}
      <div className="absolute -bottom-8 -right-3 w-36 rotate-3 rounded-[1.6rem] border border-slate-200 bg-white p-2 shadow-xl sm:-right-8 sm:w-40">
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
      {/* Faint brand tints matching the portal background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60rem 60rem at 110% -10%, rgba(99,102,241,0.08), transparent 60%), radial-gradient(50rem 50rem at -10% 0%, rgba(6,182,212,0.06), transparent 55%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-2 lg:gap-10 lg:py-24">
        <div>
          <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            Built for UK independent retail
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            Run your shop{" "}
            <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">
              without the paperwork
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Temperature logs, refusal registers, compliance checklists, rotas and till reports — the daily
            paperwork that runs a convenience store, off-licence or forecourt, moved to your staff's phones
            and your web dashboard.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={SIGNUP_URL} className="btn-primary px-6 py-3 text-base">
              Start free trial
            </a>
            <a href="#pricing" className="btn-ghost px-6 py-3 text-base">
              See pricing
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            14-day free trial · No card required · Cancel anytime
          </p>
        </div>
        <div className="pb-10 lg:pb-0">
          <ProductMock />
        </div>
      </div>
    </section>
  );
}
