import clsx from "clsx";

/** Ops Arrow logomark: an upward arrow on a brand-gradient tile, drawn inline so no image assets are needed. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm",
        className ?? "h-9 w-9",
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]" role="presentation">
        <path
          d="M12 19V6M12 6l-5.5 5.5M12 6l5.5 5.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text font-bold tracking-tight text-transparent",
        className ?? "text-lg",
      )}
    >
      Ops Arrow
    </span>
  );
}
