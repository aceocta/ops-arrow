import { FileX2, Search, Users, Scale } from "lucide-react";
import Reveal from "./Reveal";

const ITEMS = [
  {
    icon: FileX2,
    pain: "Paper logs go missing",
    solution:
      "Fridge sheets and checklists get smudged, lost or skipped. Ops Arrow timestamps every entry and alerts you when a check is missed.",
  },
  {
    icon: Search,
    pain: "EHO inspections are stressful",
    solution:
      "When the inspector asks for six months of temperature records, pull them up in seconds — complete, legible and exportable.",
  },
  {
    icon: Users,
    pain: "Staff hours get disputed",
    solution:
      "No more guessing from a notebook rota. Phone check-in and check-out gives you accurate, payroll-ready timesheets.",
  },
  {
    icon: Scale,
    pain: "Till variance goes unexplained",
    solution:
      "Snap the Z-read, record safe drops and cash movements, and see exactly where the till stands at the end of every shift.",
  },
];

export default function PainSolution() {
  return (
    <section aria-labelledby="pain-heading" className="relative overflow-hidden border-y border-slate-200/60 bg-slate-50/70 py-16 sm:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40rem 26rem at 50% -10%, rgba(51,102,255,0.07), transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Sound familiar?
          </p>
          <h2 id="pain-heading" className="section-title">
            Paper worked — until it didn't
          </h2>
          <p className="section-subtitle">
            Every shop runs on the same daily routines. Ops Arrow keeps them all in one place, done properly.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, pain, solution }, i) => (
            <Reveal key={pain} delay={i * 80}>
              <div className="card card-hover h-full rounded-3xl p-6">
                <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">{pain}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{solution}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
