import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { Building2, Loader2 } from "lucide-react";

/**
 * Post-signup onboarding (step 2 of 3): signup creates the owner account only —
 * the company comes from POST /companies, after which the profile's hasCompanySetup
 * flips to true. Step 3 (first shop) happens on the Shops page.
 */
export default function CompanySetupPage() {
  const { profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already set up (e.g. direct navigation) — nothing to do here.
  if (profile?.hasCompanySetup) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post("/companies", {
        companyName: companyName.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
      });
      await refreshProfile();
      toast("Company created. Now add your first shop.", "success");
      navigate("/shops", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create your company."));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Ops Arrow" className="mx-auto mb-3 h-16 w-16 rounded-xl object-contain" />
          <h1 className="text-2xl font-semibold text-slate-900">Set up your company</h1>
          <p className="text-sm text-slate-500">Step 2 of 3 — tell us about your company, then add your first shop</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Your shops, staff and subscriptions all live under your company.</span>
          </div>
          <div>
            <label className="label">Company name</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={busy} autoFocus required />
          </div>
          <div>
            <label className="label">Registration number (optional)</label>
            <input className="input" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} disabled={busy} />
          </div>
          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {busy ? "Creating company…" : "Continue to shop setup"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Signed in as {profile?.email}.{" "}
          <button
            type="button"
            className="font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
