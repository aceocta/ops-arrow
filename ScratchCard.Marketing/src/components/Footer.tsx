import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { LogoMark, Wordmark } from "./Logo";
import { APP_URL, CONTACT_EMAIL, SIGNUP_URL } from "../lib/links";
import Reveal from "./Reveal";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="container-page pb-16 sm:pb-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-ink-950 px-6 py-16 text-center shadow-[0_30px_80px_-30px_rgba(28,46,143,0.55)] ring-1 ring-white/10 sm:px-12 sm:py-20">
          {/* Layered glows + grid on near-black */}
          <div className="pointer-events-none absolute inset-0 bg-grid-dark" aria-hidden="true" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(42rem 24rem at 50% -30%, rgba(51,102,255,0.35), transparent 65%), radial-gradient(30rem 18rem at 8% 120%, rgba(14,165,233,0.18), transparent 55%), conic-gradient(from 200deg at 50% -10%, rgba(51,102,255,0.10), transparent 35%, rgba(14,165,233,0.08) 65%, transparent 85%)",
            }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-brand-400/60 to-transparent" aria-hidden="true" />

          <h2
            id="cta-heading"
            className="relative text-4xl font-black tracking-tighter text-white sm:text-5xl"
          >
            Put the clipboard <span className="bg-gradient-to-r from-brand-300 to-sky-300 bg-clip-text text-transparent">down</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
            The binders, the clipboards, the end-of-day guesswork — replaced in an evening. Set your shop up
            tonight and your team will be logging checks on their phones before the morning delivery lands.
          </p>
          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
            <a
              href={SIGNUP_URL}
              className="btn bg-white px-7 py-3.5 text-base text-brand-700 shadow-lg shadow-brand-900/40 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
            >
              Start free trial
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="btn border border-white/20 bg-white/5 px-7 py-3.5 text-base text-white backdrop-blur hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
            >
              Talk to us
            </a>
          </div>
          <p className="relative mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-medium text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> 14-day free trial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> No card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> Cancel anytime
            </span>
          </p>
        </div>
      </Reveal>
    </section>
  );
}

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/70 bg-slate-50/70">
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
            className="mt-3 inline-flex items-center gap-2 rounded text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Product</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/#who-its-for" className="text-slate-600 transition-colors hover:text-slate-900">Who it's for</a></li>
              <li><a href="/#features" className="text-slate-600 transition-colors hover:text-slate-900">Features</a></li>
              <li><a href="/#how-it-works" className="text-slate-600 transition-colors hover:text-slate-900">How it works</a></li>
              <li><a href="/#security" className="text-slate-600 transition-colors hover:text-slate-900">Trust &amp; security</a></li>
              <li><a href="/#pricing" className="text-slate-600 transition-colors hover:text-slate-900">Pricing</a></li>
              <li><a href="/#faq" className="text-slate-600 transition-colors hover:text-slate-900">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Account</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href={APP_URL} className="text-slate-600 transition-colors hover:text-slate-900">Sign in</a></li>
              <li><a href={SIGNUP_URL} className="text-slate-600 transition-colors hover:text-slate-900">Start free trial</a></li>
              <li><a href="/#contact" className="text-slate-600 transition-colors hover:text-slate-900">Contact</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/privacy" className="text-slate-600 transition-colors hover:text-slate-900">Privacy policy</Link></li>
              <li><Link to="/terms" className="text-slate-600 transition-colors hover:text-slate-900">Terms of service</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-slate-200/70">
        <div className="container-page flex flex-col items-center gap-2 py-5 text-xs text-slate-400 md:flex-row md:justify-between">
          <span>© 2026 Ops Arrow · Ace Octa Limited. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Made in the UK, for UK retailers
          </span>
        </div>
      </div>
    </footer>
  );
}
