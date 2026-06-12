import { Fuel, Store, Wine, Wind, ShoppingBag, Building2, type LucideIcon } from "lucide-react";
import Reveal from "./Reveal";

type Industry = {
  icon: LucideIcon;
  name: string;
  description: string;
};

const INDUSTRIES: Industry[] = [
  {
    icon: Fuel,
    name: "Petrol stations",
    description:
      "Forecourt-ready: contractor permits to work, visitor sign-in, fuel-site compliance checks and temperature logs in one place.",
  },
  {
    icon: Store,
    name: "Convenience stores",
    description:
      "The full daily routine — fridge checks, opening and closing checklists, rotas, scratch cards and till reports, all off paper.",
  },
  {
    icon: Wine,
    name: "Off-licences",
    description:
      "Challenge 25 refusal register with a permanent record of every No-ID-No-Sale — exactly what licensing visits want to see.",
  },
  {
    icon: Wind,
    name: "Vape shops",
    description:
      "Age-verification refusals logged in seconds, with the audit trail that keeps you on the right side of Trading Standards.",
  },
  {
    icon: ShoppingBag,
    name: "Small retail shops",
    description:
      "Rotas, timesheets, safe drops and cash management without a back office — run it all from your phone and browser.",
  },
  {
    icon: Building2,
    name: "Multi-branch retailers",
    description:
      "Every site in one dashboard. Each shop gets its own modules, staff and subscription — switch between branches in a click.",
  },
];

export default function WhoItsFor() {
  return (
    <section id="who-its-for" aria-labelledby="who-heading" className="relative overflow-hidden py-16 sm:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(44rem 28rem at 15% 0%, rgba(14,165,233,0.06), transparent 55%), radial-gradient(40rem 26rem at 95% 100%, rgba(51,102,255,0.06), transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Who it's for
          </p>
          <h2 id="who-heading" className="section-title">
            Built for the counter, <span className="text-gradient">not the boardroom</span>
          </h2>
          <p className="section-subtitle">
            If your day runs on fridge checks, age checks and till counts, Ops Arrow was built for you.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map(({ icon: Icon, name, description }, i) => (
            <Reveal key={name} delay={(i % 3) * 80}>
              <div className="group card card-hover h-full rounded-3xl p-6">
                <div className="flex items-center gap-4">
                  <span className="icon-tile shrink-0 bg-gradient-to-br from-brand-500 to-brand-700 transition-transform duration-300 group-hover:scale-105">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-base font-bold tracking-tight text-slate-900">{name}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
