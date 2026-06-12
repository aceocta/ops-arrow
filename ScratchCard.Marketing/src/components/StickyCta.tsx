import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { SIGNUP_URL } from "../lib/links";

const DISMISS_KEY = "oa-sticky-cta-dismissed";

/**
 * Slim fixed bottom CTA bar, small screens only. Appears once the hero has
 * been scrolled past (IntersectionObserver) and hides again near the final
 * CTA/footer so it never covers them. Dismissal persists per session.
 */
export default function StickyCta() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pastHero, setPastHero] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);

  useEffect(() => {
    if (dismissed || typeof IntersectionObserver === "undefined") return;

    const hero = document.getElementById("top");
    const heroObserver = hero
      ? new IntersectionObserver(
          ([entry]) => setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0),
          { threshold: 0 },
        )
      : null;
    if (hero && heroObserver) heroObserver.observe(hero);

    // Hide while the final CTA / footer is on screen so the bar never covers them.
    const footer = document.querySelector("footer");
    const cta = document.getElementById("cta-heading");
    const endObserver = new IntersectionObserver(
      (entries) => setNearEnd(entries.some((e) => e.isIntersecting)),
      { threshold: 0 },
    );
    if (footer) endObserver.observe(footer);
    if (cta) endObserver.observe(cta);

    return () => {
      heroObserver?.disconnect();
      endObserver.disconnect();
    };
  }, [dismissed]);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Session storage unavailable (e.g. private mode) — dismiss for this render only.
    }
  };

  const visible = !dismissed && pastHero && !nearEnd;

  if (dismissed) return null;

  return (
    <div
      className={clsx(
        "fixed inset-x-0 bottom-0 z-40 px-3 pb-3 motion-safe:transition-all motion-safe:duration-300 md:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-white/90 p-2.5 pl-4 shadow-[0_12px_40px_-12px_rgba(16,24,40,0.35)] ring-1 ring-slate-200/80 backdrop-blur-xl">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-700">
          14-day free trial · no card required
        </p>
        <a href={SIGNUP_URL} className="btn-primary shrink-0 px-4 py-2 text-xs" tabIndex={visible ? 0 : -1}>
          Start free trial
        </a>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          aria-label="Dismiss"
          tabIndex={visible ? 0 : -1}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
