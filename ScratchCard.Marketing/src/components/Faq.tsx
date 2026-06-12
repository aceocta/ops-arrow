import { Plus } from "lucide-react";
import { CONTACT_EMAIL } from "../lib/links";
import Reveal from "./Reveal";

const FAQS = [
  {
    q: "Do staff need their own logins?",
    a: "Yes — and that's the point. Every temperature check, refusal and check-in is recorded against the person who did it, so records stand up to scrutiny. Invite staff by email and they're set up in minutes; there's no per-record cost for adding people.",
  },
  {
    q: "Does it work on any phone?",
    a: "The companion app runs on both iOS and Android, including older and budget handsets — staff can use their own phones or a shared shop device. Owners and managers get the full web portal in any modern browser.",
  },
  {
    q: "What happens after the 14-day trial?",
    a: "If you'd like to keep going, choose a plan in your account portal and subscribe online. If not, your account simply pauses — we don't take card details up front, so there's nothing to cancel and no surprise charge.",
  },
  {
    q: "Can I turn modules off?",
    a: "Yes. Modules are enabled per shop, so a forecourt can run temperature logs and safe drops while an off-licence focuses on refusals and scratch cards. Staff only see the modules their shop uses.",
  },
  {
    q: "Is my data backed up?",
    a: "Yes. Your records are stored securely in the cloud with automatic backups, so a lost notebook — or a lost phone — never means lost compliance history. You can export your data, including payroll-ready CSVs, at any time.",
  },
  {
    q: "Are you UK-based?",
    a: "Yes. Ops Arrow is built in the UK for UK independent retail, around UK practice — Challenge 25 refusals, EHO-friendly temperature records and payroll exports that suit UK payroll software.",
  },
];

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="relative overflow-hidden py-16 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(36rem 24rem at 10% 10%, rgba(51,102,255,0.05), transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            FAQ
          </p>
          <h2 id="faq-heading" className="section-title">
            Questions, answered
          </h2>
          <p className="section-subtitle">
            Anything else? Email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and a real person will reply.
          </p>
        </Reveal>

        <Reveal delay={100} className="mx-auto mt-14 max-w-3xl">
          <div className="divide-y divide-slate-200/70">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-xl px-2 py-6 text-left text-base font-semibold tracking-tight text-slate-900 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 sm:px-4 sm:text-lg [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all duration-300 group-open:rotate-45 group-open:bg-brand-50 group-open:text-brand-600"
                    aria-hidden="true"
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </summary>
                <p className="px-2 pb-7 text-[15px] leading-relaxed text-slate-500 sm:px-4">{a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
