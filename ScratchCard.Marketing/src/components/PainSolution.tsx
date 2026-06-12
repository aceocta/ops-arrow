import { FileX2, Search, Users, Scale } from "lucide-react";

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
    <section aria-labelledby="pain-heading" className="border-y border-slate-100 bg-slate-50/60 py-16 sm:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Sound familiar?</p>
          <h2 id="pain-heading" className="section-title">
            Paper worked — until it didn't
          </h2>
          <p className="section-subtitle">
            Every shop runs on the same daily routines. Ops Arrow keeps them all in one place, done properly.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, pain, solution }) => (
            <div key={pain} className="card card-hover p-6">
              <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold text-slate-900">{pain}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{solution}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
