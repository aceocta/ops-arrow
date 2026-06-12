import { ChevronDown } from "lucide-react";
import { CONTACT_EMAIL } from "../lib/links";

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
    <section id="faq" aria-labelledby="faq-heading" className="py-16 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">FAQ</p>
          <h2 id="faq-heading" className="section-title">
            Questions, answered
          </h2>
          <p className="section-subtitle">
            Anything else? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-600 hover:text-brand-700">
              {CONTACT_EMAIL}
            </a>{" "}
            and a real person will reply.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="card group p-0 open:ring-1 open:ring-brand-100">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="border-t border-slate-100 px-6 py-5 text-sm leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
