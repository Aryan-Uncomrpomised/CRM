import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, Lock, Mail, User } from "lucide-react";

export default function Signup() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      return toast.error("Name, email, and password are required");
    }
    if (form.password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    setBusy(true);
    try {
      await signup(form.name.trim(), form.email.trim(), form.password);
      toast.success("Account created successfully!");
      nav("/", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen stripe-bg flex flex-col">
      <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />

      <header className="relative z-10 px-8 py-6 flex items-center justify-between">
        <Link to="/login" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-white text-black flex items-center justify-center font-display font-black text-lg">
            V
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Voyage<span className="text-white/40">.crm</span>
          </span>
        </Link>
        <div className="text-xs font-mono text-white/40">create account</div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md border border-white/10 bg-[color:var(--vc-surface)] rounded-lg p-8 relative noise">
          <form onSubmit={submit} data-testid="signup-form">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/50">
              <User className="w-3.5 h-3.5" /> create account
            </div>
            <h2 className="font-display font-black text-3xl mt-3 tracking-tight">
              Get Started
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Create your account to start managing customers and journeys instantly.
            </p>

            <div className="mt-6 space-y-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Full name
                </Label>
                <div className="relative mt-1.5">
                  <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <Input
                    data-testid="signup-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="bg-black/40 border-white/10 h-11 pl-8"
                    placeholder="Full name"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Email
                </Label>
                <div className="relative mt-1.5">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <Input
                    data-testid="signup-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="bg-black/40 border-white/10 h-11 pl-8"
                    placeholder="you@domain.com"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Password
                </Label>
                <div className="relative mt-1.5">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <Input
                    data-testid="signup-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="bg-black/40 border-white/10 h-11 pl-8"
                    placeholder="At least 6 characters"
                    required
                  />
                </div>
              </div>
              <Button
                data-testid="signup-submit"
                disabled={busy}
                className="w-full h-11 bg-white text-black hover:bg-white/90 font-medium mt-2"
              >
                {busy ? "creating account…" : "Create Account"}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Link
                to="/login"
                className="block text-center text-xs font-mono text-white/40 hover:text-white/70 pt-1"
              >
                ← already have an account? sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
