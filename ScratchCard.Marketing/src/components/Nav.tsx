import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LogoMark, Wordmark } from "./Logo";
import { APP_URL, SIGNUP_URL } from "../lib/links";

const ANCHORS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <a
          href="#top"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          aria-label="Ops Arrow — back to top"
        >
          <LogoMark />
          <Wordmark />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {ANCHORS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-100/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              {a.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={APP_URL}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition-colors duration-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            Sign in
          </a>
          <a href={SIGNUP_URL} className="btn-primary">
            Start free trial
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="border-t border-slate-200/60 bg-white/95 px-4 pb-5 pt-2 shadow-lg backdrop-blur-xl md:hidden"
        >
          {ANCHORS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              {a.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-4">
            <a href={APP_URL} className="btn-ghost w-full">
              Sign in
            </a>
            <a href={SIGNUP_URL} className="btn-primary w-full">
              Start free trial
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
