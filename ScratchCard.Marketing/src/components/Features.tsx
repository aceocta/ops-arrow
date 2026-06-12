import {
  Ticket,
  Thermometer,
  ShieldX,
  ClipboardCheck,
  Vault,
  Receipt,
  DoorOpen,
  CalendarDays,
  CalendarOff,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import Reveal from "./Reveal";

/** Mini CSS vignette: scratch card pack tracking. */
function ScratchVignette() {
  const packs = [
    { label: "Pack #214 · £2 game", sold: 76 },
    { label: "Pack #198 · £5 game", sold: 48 },
    { label: "Pack #221 · £1 game", sold: 22 },
  ];
  return (
    <div className="mt-5 space-y-2.5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/60" aria-hidden="true">
      {packs.map((p) => (
        <div key={p.label}>
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
            <span>{p.label}</span>
            <span className="text-slate-400">{p.sold}% sold</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-400"
              style={{ width: `${p.sold}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mini CSS vignette: a week of rota bars. */
function RotaVignette() {
  const days = [
    { d: "Mon", bars: [40, 30] },
    { d: "Tue", bars: [55, 25] },
    { d: "Wed", bars: [35, 35] },
    { d: "Thu", bars: [60, 20] },
    { d: "Fri", bars: [50, 38] },
    { d: "Sat", bars: [70, 22] },
    { d: "Sun", bars: [45, 18] },
  ];
  return (
    <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/60" aria-hidden="true">
      <div className="flex items-end justify-between gap-2">
        {days.map(({ d, bars }) => (
          <div key={d} className="flex w-full flex-col items-center gap-1">
            <div className="flex h-16 w-full flex-col items-stretch justify-end gap-0.5">
              <div className="rounded-sm bg-brand-500/85" style={{ height: `${bars[0]}%` }} />
              <div className="rounded-sm bg-brand-300/70" style={{ height: `${bars[1]}%` }} />
            </div>
            <span className="text-[9px] font-semibold text-slate-400">{d}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold">
        <span className="text-slate-500">This week · 2 shifts/day</span>
        <span className="badge bg-emerald-100 text-emerald-700">Rota published</span>
      </div>
    </div>
  );
}

type Module = {
  icon: LucideIcon;
  name: string;
  description: string;
  className: string;
  vignette?: () => JSX.Element;
};

const MODULES: Module[] = [
  {
    icon: Ticket,
    name: "Scratch card management",
    description:
      "Track packs from activation to settlement. Daily counts catch missing tickets before they become missing money.",
    className: "sm:col-span-2 lg:col-span-4",
    vignette: ScratchVignette,
  },
  {
    icon: Thermometer,
    name: "Temperature logs",
    description:
      "Scheduled fridge and freezer checks with target ranges, missed-log alerts and a clean history for inspections.",
    className: "lg:col-span-2",
  },
  {
    icon: ShieldX,
    name: "Refusal register",
    description:
      "Challenge 25 ready. Log No-ID-No-Sale refusals in seconds, with the who, what and when recorded permanently.",
    className: "lg:col-span-2",
  },
  {
    icon: ClipboardCheck,
    name: "Compliance checklists",
    description:
      "Daily, weekly and monthly checklists with photo evidence, so opening and closing routines actually happen.",
    className: "lg:col-span-2",
  },
  {
    icon: Vault,
    name: "Safe drop & cash management",
    description:
      "Record safe drops, floats and cash movements with variance tracking — every pound accounted for, every shift.",
    className: "lg:col-span-2",
  },
  {
    icon: Receipt,
    name: "Store sales",
    description:
      "Snap the Z-read and let OCR plus AI categorisation turn it into a tidy daily sales record — no retyping.",
    className: "lg:col-span-2",
  },
  {
    icon: CalendarDays,
    name: "Staff rota & timesheets",
    description:
      "Build the rota, let staff check in and out on their phones, approve hours and export payroll-ready CSVs.",
    className: "sm:col-span-2 lg:col-span-4",
    vignette: RotaVignette,
  },
  {
    icon: DoorOpen,
    name: "Visitors log",
    description:
      "Sign in contractors with permits to work, and get alerted the moment an inspector walks through the door.",
    className: "lg:col-span-3",
  },
  {
    icon: CalendarOff,
    name: "Leave management",
    description:
      "Holiday and sick leave requests with approvals, balances, and automatic blocking of rota clashes.",
    className: "lg:col-span-3",
  },
];

export default function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="relative overflow-hidden py-16 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(48rem 32rem at 85% 0%, rgba(51,102,255,0.06), transparent 60%), radial-gradient(40rem 28rem at 0% 90%, rgba(14,165,233,0.05), transparent 55%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Features
          </p>
          <h2 id="features-heading" className="section-title">
            Nine modules. <span className="text-gradient">One shop system.</span>
          </h2>
          <p className="section-subtitle">
            Everything your team scribbles on paper today, captured properly and impossible to lose — with
            each module switched on per shop, so you only run what you need.
          </p>
        </Reveal>

        {/* Bento grid: mixed cell sizes, single column on mobile */}
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
          {MODULES.map(({ icon: Icon, name, description, className, vignette: Vignette }, i) => (
            <Reveal key={name} delay={(i % 3) * 80} className={className}>
              <div className="group card card-hover flex h-full flex-col rounded-3xl p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="icon-tile shrink-0 bg-gradient-to-br from-brand-500 to-brand-700 transition-transform duration-300 group-hover:scale-105">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold tracking-tight text-slate-900">{name}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>
                  </div>
                </div>
                {Vignette ? (
                  <div className="mt-auto">
                    <Vignette />
                  </div>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
