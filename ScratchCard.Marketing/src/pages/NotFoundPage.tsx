import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { LogoMark, Wordmark } from "../components/Logo";
import Footer from "../components/Footer";

export default function NotFoundPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Page not found — Ops Arrow";
    return () => {
      document.title = "Ops Arrow — Run your shop without the paperwork";
    };
  }, []);

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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-grid" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(44rem 28rem at 50% -10%, rgba(51,102,255,0.12), transparent 60%), radial-gradient(32rem 22rem at 90% 100%, rgba(14,165,233,0.07), transparent 55%)",
          }}
          aria-hidden="true"
        />
        <div className="container-page relative flex flex-col items-center py-24 text-center sm:py-36">
          <span className="badge-pill">
            <Compass className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
            Lost in the stockroom
          </span>
          <p className="mt-6 text-[6rem] font-black leading-none tracking-tighter sm:text-[9rem]">
            <span className="text-gradient">404</span>
          </p>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            This page doesn't exist
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-500">
            The link may be out of date, or the page has moved. Everything you're after is back on the home
            page.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/" className="btn-primary px-7 py-3.5 text-base">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
            <a href="/#pricing" className="btn-ghost px-7 py-3.5 text-base">
              See pricing
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
