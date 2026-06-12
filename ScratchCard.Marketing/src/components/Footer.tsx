import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { LogoMark, Wordmark } from "./Logo";
import { APP_URL, CONTACT_EMAIL, SIGNUP_URL } from "../lib/links";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="container-page pb-16 sm:pb-24">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-14 text-center shadow-xl shadow-brand-600/20 sm:px-12 sm:py-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(40rem 20rem at 80% -20%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(30rem 18rem at 10% 120%, rgba(255,255,255,0.10), transparent 55%)",
          }}
          aria-hidden="true"
        />
        <h2 id="cta-heading" className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Put the clipboard down
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-base leading-relaxed text-brand-100">
          Set your shop up tonight and your team can be logging checks on their phones tomorrow morning.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={SIGNUP_URL}
            className="btn bg-white px-6 py-3 text-base text-brand-700 shadow-lg hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Start free trial
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="btn border border-white/30 px-6 py-3 text-base text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Talk to us
          </a>
        </div>
        <p className="relative mt-4 text-sm text-brand-200">14-day free trial · No card required · Cancel anytime</p>
      </div>
    </section>
  );
}

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50/60">
      <div className="container-page flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <Wordmark />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Digital shop operations for UK convenience stores, off-licences and forecourts.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Product</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/#features" className="text-slate-600 hover:text-slate-900">Features</a></li>
              <li><a href="/#how-it-works" className="text-slate-600 hover:text-slate-900">How it works</a></li>
              <li><a href="/#pricing" className="text-slate-600 hover:text-slate-900">Pricing</a></li>
              <li><a href="/#faq" className="text-slate-600 hover:text-slate-900">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Account</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href={APP_URL} className="text-slate-600 hover:text-slate-900">Sign in</a></li>
              <li><a href={SIGNUP_URL} className="text-slate-600 hover:text-slate-900">Start free trial</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/privacy" className="text-slate-600 hover:text-slate-900">Privacy policy</Link></li>
              <li><Link to="/terms" className="text-slate-600 hover:text-slate-900">Terms of service</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-slate-200/70">
        <div className="container-page py-5 text-center text-xs text-slate-400 md:text-left">
          © 2026 Ops Arrow · Ace Octa Limited. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
