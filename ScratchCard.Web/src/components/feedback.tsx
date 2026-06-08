import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import clsx from "clsx";

// ── Imperative API (works like window.confirm/alert but renders modern in-app UI) ──
type ConfirmTone = "danger" | "primary";
export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};
type ToastTone = "info" | "success" | "error";
type Toast = { id: number; message: string; tone: ToastTone };

let confirmPresenter: ((opts: ConfirmOptions, resolve: (v: boolean) => void) => void) | null = null;
let toastPresenter: ((t: Omit<Toast, "id">) => void) | null = null;
let nextId = 1;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (confirmPresenter) confirmPresenter(opts, resolve);
    else resolve(window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title));
  });
}

export function toast(message: string, tone: ToastTone = "info") {
  if (toastPresenter) toastPresenter({ message, tone });
  else console.warn("[toast]", message);
}

// ── Host (mount once at the app root) ──
export function FeedbackHost() {
  const [confirmState, setConfirmState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    confirmPresenter = (opts, resolve) => setConfirmState({ opts, resolve });
    toastPresenter = (t) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
    };
    return () => {
      confirmPresenter = null;
      toastPresenter = null;
    };
  }, []);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  const opts = confirmState?.opts;
  const tone = opts?.tone ?? "danger";

  return (
    <>
      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={() => close(false)}>
          <div className="card w-full max-w-sm p-5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span
                className={clsx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  tone === "danger" ? "bg-red-100 text-red-600" : "bg-brand-50 text-brand-600",
                )}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">{opts?.title}</h2>
                {opts?.message ? <p className="mt-1 text-sm text-slate-500">{opts.message}</p> : null}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)}>{opts?.cancelLabel ?? "Cancel"}</button>
              <button
                className={clsx("btn text-white", tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700")}
                onClick={() => close(true)}
                autoFocus
              >
                {opts?.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast stack */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="card pointer-events-auto flex items-start gap-2.5 px-4 py-3 text-sm shadow-lg">
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : t.tone === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            )}
            <span className="flex-1 text-slate-700">{t.message}</span>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
