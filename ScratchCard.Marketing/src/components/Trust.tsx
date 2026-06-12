import {
  DatabaseBackup,
  FileDown,
  KeyRound,
  Lock,
  ServerCog,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Reveal from "./Reveal";

type Item = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const ITEMS: Item[] = [
  {
    icon: ServerCog,
    title: "Hosted in the UK",
    description:
      "Your data lives on Microsoft Azure in UK South, with uploaded files stored in AWS London (eu-west-2). It doesn't leave the country.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit",
    description:
      "Every connection between staff phones, the web portal and our servers is encrypted in transit using TLS.",
  },
  {
    icon: KeyRound,
    title: "Per-user, role-based logins",
    description:
      "Every person gets their own login, and roles control what they can see and do — no shared passwords behind the till.",
  },
  {
    icon: ShieldCheck,
    title: "UK GDPR aligned",
    description:
      "Built around UK GDPR from day one. We don't sell personal data, and your shop's records are never used for advertising.",
  },
  {
    icon: FileDown,
    title: "Your data, exportable any time",
    description:
      "Your records belong to you. Export them from the portal whenever you like — including payroll-ready CSVs.",
  },
  {
    icon: DatabaseBackup,
    title: "Automatic backups",
    description:
      "Records are backed up automatically in the cloud, so a lost phone or a flooded back office never means lost history.",
  },
];

export default function Trust() {
  return (
    <section
      id="security"
      aria-labelledby="security-heading"
      className="relative overflow-hidden py-16 sm:py-24"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(44rem 28rem at 10% -10%, rgba(51,102,255,0.06), transparent 60%), radial-gradient(36rem 24rem at 95% 110%, rgba(14,165,233,0.05), transparent 55%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Trust &amp; security
          </p>
          <h2 id="security-heading" className="section-title">
            Your records, <span className="text-gradient">properly looked after</span>
          </h2>
          <p className="section-subtitle">
            Compliance records are only worth keeping if they're safe. Here's exactly where your data lives
            and who can touch it — no small print.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={(i % 3) * 80}>
              <div className="group card card-hover h-full rounded-3xl p-6">
                <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700 transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
