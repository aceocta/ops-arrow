import { UserPlus, Store, Smartphone } from "lucide-react";

const STEPS = [
  {
    icon: UserPlus,
    title: "Create your account",
    description:
      "Sign up online in a couple of minutes. Your 14-day free trial starts straight away — no card needed.",
  },
  {
    icon: Store,
    title: "Add your shop & staff",
    description:
      "Set up your shop, choose the modules you want, and invite staff by email. Multi-shop owners can add every site.",
  },
  {
    icon: Smartphone,
    title: "Staff log everything on their phones",
    description:
      "Fridge checks, refusals, checklists, check-ins — captured on the shop floor while you watch it all from the web portal.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="border-y border-slate-100 bg-slate-50/60 py-16 sm:py-24"
    >
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">How it works</p>
          <h2 id="how-heading" className="section-title">
            Up and running before the next delivery
          </h2>
          <p className="section-subtitle">No installation, no training day, no consultants. Three steps and you're live.</p>
        </div>
        <ol className="mt-12 grid gap-5 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <li key={title} className="card relative p-6 pt-8">
              <span className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-sm font-bold text-white shadow-lg shadow-brand-600/25">
                {i + 1}
              </span>
              <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
