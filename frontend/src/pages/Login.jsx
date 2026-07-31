import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("admin@voyageCRM.com");
  const [pw, setPw] = useState("Admin@123");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  if (user && user !== false) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(email, pw);
      toast.success("Welcome back");
      nav("/", { replace: true });
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || "Login failed";
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen stripe-bg flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />

      <header className="relative z-10 px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-white text-black flex items-center justify-center font-display font-black text-lg">
            V
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Voyage<span className="text-white/40">.crm</span>
          </span>
        </div>
        <div className="text-xs font-mono text-white/40">
          shopify × odoo · rule-based journeys
        </div>
      </header>

      <div className="relative z-10 flex-1 grid lg:grid-cols-2 gap-0">
        <div className="hidden lg:flex flex-col justify-between px-16 py-14 border-r border-white/5">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-[color:var(--vc-lime)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--vc-lime)]" />
              live · 5-stage journey engine
            </div>
            <h1 className="font-display font-black text-6xl mt-6 leading-[0.95] tracking-tight">
              The CRM that
              <br />
              knows what
              <br />
              <span className="text-[color:var(--vc-lime)]">to send next.</span>
            </h1>
            <p className="mt-6 text-white/60 max-w-md text-[15px] leading-relaxed">
              Cohort-based reminders on WhatsApp, SMS and email. Auto-classify
              every shopper — visitor, prospect, prime prospect, customer,
              subscriber — and act on it.
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2 pt-8">
            {[
              ["visitor", "Visitor"],
              ["prospect", "Prospect"],
              ["prime_prospect", "Prime P."],
              ["customer", "Customer"],
              ["subscriber", "Subscriber"],
            ].map(([k, l]) => (
              <div key={k} className="border border-white/10 rounded-md p-3">
                <span className={`classification-tag tag-${k}`}>{k.replace("_", " ")}</span>
                <div className="mt-2 font-display font-bold text-xl">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center px-6 lg:px-16 py-10">
          <form
            onSubmit={submit}
            className="w-full max-w-md border border-white/10 bg-[color:var(--vc-surface)] rounded-lg p-8 relative noise"
            data-testid="login-form"
          >
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/50">
              <ShieldCheck className="w-3.5 h-3.5" />
              admin sign in
            </div>
            <h2 className="font-display font-black text-3xl mt-3 tracking-tight">
              Access the console
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Only CRM operators can sign in.
            </p>

            <div className="mt-8 space-y-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Email
                </Label>
                <Input
                  data-testid="login-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 bg-black/40 border-white/10 h-11"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Password
                </Label>
                <Input
                  data-testid="login-password-input"
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="mt-1.5 bg-black/40 border-white/10 h-11"
                  placeholder="••••••••"
                />
              </div>
              {err && (
                <div
                  data-testid="login-error"
                  className="text-xs font-mono text-red-400 border border-red-900/50 bg-red-950/30 rounded px-3 py-2"
                >
                  {err}
                </div>
              )}

              <Button
                data-testid="login-submit-button"
                disabled={busy}
                className="w-full h-11 bg-white text-black hover:bg-white/90 font-medium"
              >
                {busy ? "signing in…" : "Continue"}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>

              <div className="text-center pt-1 space-y-1.5">
                <Link
                  to="/forgot-password"
                  data-testid="forgot-password-link"
                  className="block text-xs font-mono text-white/50 hover:text-white/80"
                >
                  Forgot password?
                </Link>
                <Link
                  to="/signup"
                  data-testid="signup-link"
                  className="block text-xs font-mono text-white/50 hover:text-white/80"
                >
                  Don't have an account? <span className="text-white">Request access →</span>
                </Link>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-white/5 text-[11px] font-mono text-white/40">
              demo · admin@voyageCRM.com / Admin@123
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
