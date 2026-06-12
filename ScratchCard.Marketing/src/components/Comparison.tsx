import { CheckCircle2, ClipboardCheck, ClipboardX, XCircle } from "lucide-react";
import Reveal from "./Reveal";

type Row = {
  area: string;
  oldWay: string;
  newWay: string;
};

const ROWS: Row[] = [
  {
    area: "Temperature records",
    oldWay: "Paper sheets taped to the fridge door — smudged, skipped and binned at month end.",
    newWay: "Scheduled checks, timestamped against the person who did them, with alerts when one is missed.",
  },
  {
    area: "Refusal register",
    oldWay: "A tatty book under the till that may or may not get filled in on a busy Friday night.",
    newWay: "Challenge 25 refusals logged in seconds on the shop floor — a permanent, legible record.",
  },
  {
    area: "Rotas & hours",
    oldWay: "A notebook rota, crossed-out shifts and end-of-week arguments over who worked what.",
    newWay: "Published rotas, phone check-in and check-out, and payroll-ready CSV exports.",
  },
  {
    area: "Till variance",
    oldWay: "An unexplained gap at cash-up and a shrug at the end of the shift.",
    newWay: "Safe drops, floats and cash movements tracked, so every pound is accounted for.",
  },
  {
    area: "EHO & licensing inspection prep",
    oldWay: "A frantic dig through binders the night before, hoping nothing is missing.",
    newWay: "Months of complete records pulled up — and exported — in seconds.",
  },
  {
    area: "Multi-shop oversight",
    oldWay: "Phoning each shop in turn and trusting that the folder is up to date.",
    newWay: "Every site live in one dashboard, each with its own modules, staff and records.",
  },
];

export default function Comparison() {
  return (
    <section
      id="comparison"
      aria-labelledby="comparison-heading"
      className="relative overflow-hidden border-y border-slate-200/60 bg-slate-50/70 py-16 sm:py-24"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(44rem 28rem at 85% -10%, rgba(51,102,255,0.07), transparent 60%), radial-gradient(36rem 24rem at 5% 110%, rgba(14,165,233,0.05), transparent 55%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Before and after
          </p>
          <h2 id="comparison-heading" className="section-title">
            Paper vs <span className="text-gradient">Ops Arrow</span>
          </h2>
          <p className="section-subtitle">
            The same daily jobs, side by side. Nothing extra to do — just a better place to do it.
          </p>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-2">
          {/* The old way — muted */}
          <Reveal className="h-full">
            <div className="card h-full rounded-3xl p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-400 to-slate-500 text-white ring-1 ring-inset ring-white/25">
                  <ClipboardX className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-bold tracking-tight text-slate-700">The old way</h3>
              </div>
              <ul className="mt-6 divide-y divide-slate-100">
                {ROWS.map(({ area, oldWay }) => (
                  <li key={area} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <XCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-slate-300" aria-hidden="true" />
                    <div>
                      <h4 className="text-sm font-semibold tracking-tight text-slate-500">{area}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">{oldWay}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* With Ops Arrow — gradient hairline border, emerald checks */}
          <Reveal delay={120} className="h-full">
            <div className="h-full rounded-3xl bg-gradient-to-b from-brand-400 via-brand-500 to-sky-400 p-[1px] shadow-[0_24px_60px_-20px_rgba(31,71,245,0.35)]">
              <div className="h-full rounded-[calc(1.5rem-1px)] bg-white p-6 sm:p-8">
                <div className="flex items-center gap-4">
                  <span className="icon-tile shrink-0 bg-gradient-to-br from-brand-500 to-brand-700">
                    <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">With Ops Arrow</h3>
                </div>
                <ul className="mt-6 divide-y divide-slate-100">
                  {ROWS.map(({ area, newWay }) => (
                    <li key={area} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                      <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-500" aria-hidden="true" />
                      <div>
                        <h4 className="text-sm font-semibold tracking-tight text-slate-900">{area}</h4>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">{newWay}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
