import { UserPlus, Store, Smartphone } from "lucide-react";
import Reveal from "./Reveal";

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
      className="relative overflow-hidden border-y border-slate-200/60 bg-slate-50/70 py-16 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(42rem 28rem at 50% 0%, rgba(51,102,255,0.08), transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            How it works
          </p>
          <h2 id="how-heading" className="section-title">
            Up and running before the next delivery
          </h2>
          <p className="section-subtitle">
            No installation, no training day, no consultants. If your team can use WhatsApp, they can use
            Ops Arrow — three steps and you're live.
          </p>
        </Reveal>

        <div className="relative mt-16">
          {/* Connecting line across the numbered steps (desktop only) */}
          <div
            className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-5 hidden h-px bg-gradient-to-r from-brand-300/40 via-brand-400/60 to-brand-300/40 sm:block"
            aria-hidden="true"
          />
          <ol className="grid gap-10 sm:grid-cols-3 sm:gap-6">
            {STEPS.map(({ icon: Icon, title, description }, i) => (
              <Reveal as="li" key={title} delay={i * 120} className="relative text-center">
                <span className="relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-sm font-bold text-white shadow-lg shadow-brand-600/30 ring-4 ring-slate-50">
                  {i + 1}
                </span>
                <div className="card card-hover mt-6 rounded-3xl p-7">
                  <span className="icon-tile mx-auto bg-gradient-to-br from-brand-500 to-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
