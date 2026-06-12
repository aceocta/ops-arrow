import { Smartphone, Monitor, Store, CheckCircle2 } from "lucide-react";

export default function MobileWeb() {
  return (
    <section aria-labelledby="platforms-heading" className="py-16 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Mobile + web</p>
          <h2 id="platforms-heading" className="section-title">
            Phones for the shop floor, a portal for the office
          </h2>
          <p className="section-subtitle">
            One account, two views — each built for the job in hand.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <div className="card card-hover p-8">
            <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Companion app for staff</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              iOS and Android. Staff log temperatures, refusals, checklists and safe drops right where they
              happen, and check in and out of shifts — no shared clipboard, no end-of-day catch-up.
            </p>
            <ul className="mt-4 space-y-2">
              {["Works on staff's own phones", "Each person has their own login", "Reminders for due checks"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="card card-hover p-8">
            <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
              <Monitor className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Web portal for owners & managers</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The full picture in your browser: live compliance status, rota planning, timesheet approvals,
              till reconciliation and exports — for one shop or your whole estate.
            </p>
            <ul className="mt-4 space-y-2">
              {["Dashboards across every module", "Payroll-ready CSV exports", "Approvals and audit history"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-6 py-4">
          <Store className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Run more than one shop?</span> Switch between sites in a
            click — each shop has its own subscription, modules, staff and records.
          </p>
        </div>
      </div>
    </section>
  );
}
