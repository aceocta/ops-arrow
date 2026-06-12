import { Smartphone, Monitor, Store, CheckCircle2 } from "lucide-react";
import Reveal from "./Reveal";

export default function MobileWeb() {
  return (
    <section
      aria-labelledby="platforms-heading"
      className="relative overflow-hidden bg-ink-950 py-16 text-white sm:py-28"
    >
      {/* Dark depth: grid + glowing brand accents */}
      <div className="pointer-events-none absolute inset-0 bg-grid-dark" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(50rem 34rem at 80% -10%, rgba(51,102,255,0.22), transparent 60%), radial-gradient(40rem 30rem at 5% 110%, rgba(14,165,233,0.14), transparent 55%), conic-gradient(from 220deg at 50% -20%, rgba(51,102,255,0.08), transparent 30%, rgba(14,165,233,0.06) 60%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center text-brand-300">
            <span className="h-1 w-1 rounded-full bg-brand-400" aria-hidden="true" />
            Mobile + web
          </p>
          <h2
            id="platforms-heading"
            className="mt-3 text-3xl font-extrabold leading-[1.08] tracking-tighter text-white sm:text-4xl md:text-[2.75rem]"
          >
            Phones for the shop floor,{" "}
            <span className="bg-gradient-to-r from-brand-300 to-sky-300 bg-clip-text text-transparent">
              a portal for the office
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            One account, two views — each built for the job in hand.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <Reveal>
            <div className="card-dark group h-full p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.06] hover:ring-white/20">
              <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow-sm">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-white">Companion app for staff</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                iOS and Android. Staff log temperatures, refusals, checklists and safe drops right where they
                happen, and check in and out of shifts — no shared clipboard, no end-of-day catch-up.
              </p>
              <ul className="mt-5 space-y-2.5">
                {["Works on staff's own phones", "Each person has their own login", "Reminders for due checks"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="card-dark group h-full p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.06] hover:ring-white/20">
              <span className="icon-tile bg-gradient-to-br from-sky-500 to-brand-700 shadow-glow-sm">
                <Monitor className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-white">Web portal for owners & managers</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                The full picture in your browser: live compliance status, rota planning, timesheet approvals,
                till reconciliation and exports — for one shop or your whole estate.
              </p>
              <ul className="mt-5 space-y-2.5">
                {["Dashboards across every module", "Payroll-ready CSV exports", "Approvals and audit history"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-brand-500/10 px-6 py-4 ring-1 ring-brand-400/20 backdrop-blur-sm">
            <Store className="h-5 w-5 shrink-0 text-brand-300" aria-hidden="true" />
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-white">Run more than one shop?</span> Switch between sites in a
              click — each shop has its own subscription, modules, staff and records.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
