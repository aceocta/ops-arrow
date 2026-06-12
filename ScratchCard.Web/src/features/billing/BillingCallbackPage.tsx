import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, XCircle } from "lucide-react";

type Variant = "success" | "cancel" | "portal";

const COPY: Record<Variant, { title: string; message: string; icon: React.ReactNode }> = {
  success: {
    title: "Payment complete",
    message: "Your subscription is updating — Stripe is confirming the payment. This usually takes a few seconds.",
    icon: <CheckCircle2 className="h-10 w-10 text-emerald-500" />,
  },
  cancel: {
    title: "Checkout cancelled",
    message: "No payment was taken and nothing changed on your subscription.",
    icon: <XCircle className="h-10 w-10 text-slate-400" />,
  },
  portal: {
    title: "Back from the billing portal",
    message: "Any changes you made in Stripe will be reflected here shortly.",
    icon: <Info className="h-10 w-10 text-brand-500" />,
  },
};

/**
 * Landing page for Stripe redirects (/billing/success, /billing/cancel, /billing/portal-return).
 * Invalidates subscription state and sends the user back to /billing after a moment.
 */
export default function BillingCallbackPage({ variant }: { variant: Variant }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    // Webhooks may have changed the subscription while we were on stripe.com — refetch everything.
    qc.invalidateQueries({ queryKey: ["shop-summary"] });
    qc.invalidateQueries({ queryKey: ["entitlements"] });
    const t = setTimeout(() => navigate("/billing", { replace: true }), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = COPY[variant];
  return (
    <div className="flex justify-center pt-16">
      <div className="card flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
        {copy.icon}
        <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>
        <p className="text-sm text-slate-500">{copy.message}</p>
        <p className="text-xs text-slate-400">Taking you back to billing…</p>
        <button className="btn-primary mt-2" onClick={() => navigate("/billing", { replace: true })}>
          Go to billing now
        </button>
      </div>
    </div>
  );
}
