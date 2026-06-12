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
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Ops Arrow home">
            <LogoMark />
            <Wordmark />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{content.title}</h1>
        <p className="mt-2 text-sm text-slate-400">{content.updated}</p>
        <div className="mt-10 space-y-8">
          {content.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-bold text-slate-900">{s.heading}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.body}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
