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
} from "lucide-react";

const MODULES = [
  {
    icon: Ticket,
    name: "Scratch card management",
    description:
      "Track packs from activation to settlement. Daily counts catch missing tickets before they become missing money.",
  },
  {
    icon: Thermometer,
    name: "Temperature logs",
    description:
      "Scheduled fridge and freezer checks with target ranges, missed-log alerts and a clean history for inspections.",
  },
  {
    icon: ShieldX,
    name: "Refusal register",
    description:
      "Challenge 25 ready. Log No-ID-No-Sale refusals in seconds, with the who, what and when recorded permanently.",
  },
  {
    icon: ClipboardCheck,
    name: "Compliance checklists",
    description:
      "Daily, weekly and monthly checklists with photo evidence, so opening and closing routines actually happen.",
  },
  {
    icon: Vault,
    name: "Safe drop & cash management",
    description:
      "Record safe drops, floats and cash movements with variance tracking — every pound accounted for, every shift.",
  },
  {
    icon: Receipt,
    name: "Store sales",
    description:
      "Snap the Z-read and let OCR plus AI categorisation turn it into a tidy daily sales record — no retyping.",
  },
  {
    icon: DoorOpen,
    name: "Visitors log",
    description:
      "Sign in contractors with permits to work, and get alerted the moment an inspector walks through the door.",
  },
  {
    icon: CalendarDays,
    name: "Staff rota & timesheets",
    description:
      "Build the rota, let staff check in and out on their phones, approve hours and export payroll-ready CSVs.",
  },
  {
    icon: CalendarOff,
    name: "Leave management",
    description:
      "Holiday and sick leave requests with approvals, balances, and automatic blocking of rota clashes.",
  },
];

export default function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="py-16 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Features</p>
          <h2 id="features-heading" className="section-title">
            Nine modules. One shop system.
          </h2>
          <p className="section-subtitle">
            Everything your team writes down today, captured digitally — and only the modules you need, turned on per shop.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ icon: Icon, name, description }) => (
            <div key={name} className="card card-hover p-6">
              <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold text-slate-900">{name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
