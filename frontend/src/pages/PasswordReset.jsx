import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Mail, KeyRound, CheckCircle2 } from "lucide-react";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen stripe-bg flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md border border-white/10 bg-[color:var(--vc-surface)] rounded-lg p-8 relative noise">
        {sent ? (
          <>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> check your inbox
            </div>
            <h2 className="font-display font-black text-3xl mt-3 tracking-tight">
              Reset link sent
            </h2>
            <p className="text-white/60 text-sm mt-2">
              If <span className="font-mono text-white">{email}</span> matches a
              Voyage CRM account, you'll receive a password reset link within a
              minute. The link expires in 1 hour.
            </p>
            <Link
              to="/login"
              data-testid="back-to-login"
              className="mt-6 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit} data-testid="forgot-form">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/50">
              <Mail className="w-3.5 h-3.5" /> forgot password
            </div>
            <h2 className="font-display font-black text-3xl mt-3 tracking-tight">
              Reset by email
            </h2>
            <p className="text-white/50 text-sm mt-1">
              We'll email you a secure link to set a new password.
            </p>
            <div className="mt-6 space-y-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Email
                </Label>
                <Input
                  data-testid="forgot-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 bg-black/40 border-white/10 h-11"
                  placeholder="you@company.com"
                  required
                />
              </div>
              <Button
                data-testid="forgot-submit"
                disabled={busy}
                className="w-full h-11 bg-white text-black hover:bg-white/90"
              >
                {busy ? "sending…" : "Send reset link"}
              </Button>
              <Link
                to="/login"
                className="block text-center text-xs font-mono text-white/40 hover:text-white/70 pt-2"
              >
                ← back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const isInvite = params.get("invite") === "1";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) toast.error("Missing reset token");
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return toast.error("Passwords don't match");
    if (pw.length < 8) return toast.error("Password must be 8+ characters");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password: pw });
      setDone(true);
      toast.success("Password updated");
      setTimeout(() => nav("/login"), 1500);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen stripe-bg flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md border border-white/10 bg-[color:var(--vc-surface)] rounded-lg p-8 relative noise">
        {done ? (
          <>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> password updated
            </div>
            <h2 className="font-display font-black text-3xl mt-3 tracking-tight">
              You're all set.
            </h2>
            <p className="text-white/60 text-sm mt-2">
              Redirecting to sign in…
            </p>
          </>
        ) : (
          <form onSubmit={submit} data-testid="reset-form">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/50">
              <KeyRound className="w-3.5 h-3.5" /> {isInvite ? "welcome" : "reset password"}
            </div>
            <h2 className="font-display font-black text-3xl mt-3 tracking-tight">
              {isInvite ? "Set your password" : "Pick a new password"}
            </h2>
            {isInvite && (
              <p className="text-white/60 text-sm mt-2">
                Your Voyage CRM account is active. Choose a password to sign in.
              </p>
            )}
            <div className="mt-6 space-y-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  New password
                </Label>
                <Input
                  data-testid="reset-pw"
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="mt-1.5 bg-black/40 border-white/10 h-11"
                  placeholder="Min 8 characters"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Confirm
                </Label>
                <Input
                  data-testid="reset-pw2"
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="mt-1.5 bg-black/40 border-white/10 h-11"
                  required
                />
              </div>
              <Button
                data-testid="reset-submit"
                disabled={busy || !token}
                className="w-full h-11 bg-white text-black hover:bg-white/90"
              >
                {busy ? "updating…" : "Update password"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
