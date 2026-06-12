import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LogoMark, Wordmark } from "../components/Logo";
import Footer from "../components/Footer";
import { CONTACT_EMAIL } from "../lib/links";

type LegalContent = {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
};

const CONTENT: Record<"privacy" | "terms", LegalContent> = {
  privacy: {
    title: "Privacy policy",
    updated: "Last updated: 1 June 2026",
    sections: [
      {
        heading: "Who we are",
        body: "Ops Arrow is operated by Ace Octa Limited, a company registered in the United Kingdom. We provide digital shop-operations software for independent retailers. For anything in this policy, contact us at " + CONTACT_EMAIL + ".",
      },
      {
        heading: "What we collect",
        body: "We collect account details (name, email address, shop name), operational records your team enters (such as temperature logs, refusals, checklists, timesheets and till reports), and standard technical data needed to run the service securely, such as device and log information.",
      },
      {
        heading: "How we use your data",
        body: "Your data is used solely to provide and improve the Ops Arrow service: storing your shop's records, producing reports and exports, sending service notifications, and keeping your account secure. We do not sell personal data, and we do not use your shop's records for advertising.",
      },
      {
        heading: "Storage and security",
        body: "Data is stored securely in the cloud with encryption in transit and automatic backups. Access is restricted to your invited users according to their roles, and to a small number of our staff where strictly needed to operate and support the service.",
      },
      {
        heading: "Your rights",
        body: "Under UK GDPR you have rights of access, rectification, erasure, restriction and portability over your personal data. You can export your records from the portal at any time, and you can ask us to delete your account data by emailing " + CONTACT_EMAIL + ".",
      },
      {
        heading: "Changes to this policy",
        body: "If we make material changes to this policy we will notify account owners by email before the changes take effect. This page always shows the current version.",
      },
    ],
  },
  terms: {
    title: "Terms of service",
    updated: "Last updated: 1 June 2026",
    sections: [
      {
        heading: "The agreement",
        body: "These terms form the agreement between Ace Octa Limited (trading as Ops Arrow) and the business that registers an account. By creating an account you confirm you are authorised to bind that business.",
      },
      {
        heading: "The service",
        body: "Ops Arrow provides a web portal and companion mobile app for recording and managing shop operations, including compliance logs, staffing and cash management. Modules can be enabled or disabled per shop, and availability of specific features may depend on the plan chosen.",
      },
      {
        heading: "Trials and subscriptions",
        body: "New shops receive a free trial; the length is shown at sign-up. After the trial, continued use requires an active per-shop subscription, managed online through your account portal. You can change or cancel your subscription there at any time; cancellation takes effect at the end of the current billing period.",
      },
      {
        heading: "Your responsibilities",
        body: "You are responsible for the accuracy of records entered by your team, for keeping login credentials confidential, and for ensuring your use of the service complies with applicable law. Ops Arrow supports your compliance processes but does not replace your own legal and regulatory obligations.",
      },
      {
        heading: "Data and exports",
        body: "Your shop's records belong to you. You can export them from the portal at any time. If your account is closed, we retain data for a limited wind-down period to allow export, then delete it in line with our privacy policy.",
      },
      {
        heading: "Liability and changes",
        body: "The service is provided with reasonable skill and care. To the extent permitted by law, our liability is limited to the subscription fees paid in the twelve months before a claim. We may update these terms; material changes will be notified to account owners by email in advance.",
      },
    ],
  },
};

export default function LegalPage({ page }: { page: "privacy" | "terms" }) {
  const content = CONTENT[page];

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${content.title} — Ops Arrow`;
    return () => {
      document.title = "Ops Arrow — Run your shop without the paperwork";
    };
  }, [content.title]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="container-page flex h-16 items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            aria-label="Ops Arrow home"
          >
            <LogoMark />
            <Wordmark />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>
      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-grid" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(40rem 24rem at 85% -10%, rgba(51,102,255,0.08), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <p className="section-eyebrow">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Legal
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tighter text-slate-900 sm:text-5xl">{content.title}</h1>
          <p className="mt-3 text-sm font-medium text-slate-400">{content.updated}</p>
          <div className="mt-12 space-y-10">
            {content.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{s.heading}</h2>
                <p className="mt-2.5 max-w-prose text-[15px] leading-relaxed text-slate-500">{s.body}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
