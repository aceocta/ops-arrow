import clsx from "clsx";

/** Ops Arrow logomark: the brand logo (circular arrow around a shop front), served from /logo.png. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      className={clsx("select-none object-contain", className ?? "h-9 w-9")}
      draggable={false}
    />
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
