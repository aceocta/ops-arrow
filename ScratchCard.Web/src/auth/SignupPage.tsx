import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { api, apiErrorMessage, unwrap } from "../lib/api";
import { toast } from "../components/feedback";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");

  // Email the verification code was sent to. Null = step 1 (details), set = step 2 (enter code).
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const normalizedEmail = email.trim().toLowerCase();
  const busy = sending || creating;

  const validateDetails = (): string | null => {
    if (!firstName.trim() || !lastName.trim()) return "First name and last name are required.";
    if (!normalizedEmail) return "Email address is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  };

  const sendCode = async () => {
    const invalid = validateDetails();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await api.post("/auth/signup/request-verification-code", { email: normalizedEmail });
      const d = unwrap<{ expiresOn?: string }>(res.data);
      setVerificationEmail(normalizedEmail);
      setExpiresOn(d?.expiresOn ?? null);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast(`Verification code sent to ${normalizedEmail}.`, "success");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not send the verification code."));
    } finally {
      setSending(false);
    }
  };

  // Editing the email invalidates a previously requested code (mirrors the mobile flow).
  const onEmailChange = (value: string) => {
    setEmail(value);
    if (verificationEmail && verificationEmail !== value.trim().toLowerCase()) {
      setVerificationEmail(null);
      setExpiresOn(null);
      setCode("");
      setCooldown(0);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationEmail) {
      await sendCode();
      return;
    }
    const invalid = validateDetails();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (verificationEmail !== normalizedEmail) {
      setError("Request a verification code for this email first.");
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit verification code from your email.`);
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await signup({
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        verificationCode: code,
      });
      toast("Account created — welcome to Ops Arrow!", "success");
      // The route guard sends owners without a company to /setup.
      navigate("/", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create your account."));
      setCreating(false);
    }
  };

  const expiresHint = expiresOn
    ? `Code expires at ${new Date(expiresOn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
    : "Check your inbox for the verification code.";

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Ops Arrow" className="mx-auto mb-3 h-16 w-16 rounded-xl object-contain" />
          <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500">Step 1 of 3 — verify your email, then set up your company and first shop</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">First name</label>
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={busy} autoFocus required />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={busy} required />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} disabled={busy} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <p className="mt-1 text-xs text-slate-400">Minimum 8 characters.</p>
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              required
            />
          </div>

          {verificationEmail ? (
            <>
              <div className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  We sent a {CODE_LENGTH}-digit code to <span className="font-medium">{verificationEmail}</span>. {expiresHint}
                </span>
              </div>
              <div>
                <label className="label">Verification code</label>
                <input
                  className="input text-center text-lg tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
                  disabled={busy}
                  required
                />
              </div>
            </>
          ) : null}

          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          {!verificationEmail ? (
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {sending ? "Sending code…" : "Send verification code"}
            </button>
          ) : (
            <>
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {creating ? "Creating account…" : "Verify email & create account"}
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  className="font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-slate-400"
                  onClick={() => void sendCode()}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : sending ? "Resending…" : "Resend code"}
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-600"
                  onClick={() => onEmailChange("")}
                  disabled={busy}
                >
                  Use a different email
                </button>
              </div>
            </>
          )}
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
