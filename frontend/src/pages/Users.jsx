import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { fmtDate } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, ShieldAlert, ShieldCheck, User, Mail, KeyRound, UserCheck, Clock } from "lucide-react";

const ROLE_META = {
  admin: { label: "Admin", color: "#f87171" },
  manager: { label: "Manager", color: "#38bdf8" },
  member: { label: "Member", color: "#a1a1aa" },
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [emailUser, setEmailUser] = useState(null);

  const { data: users = [], isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
    retry: false,
  });

  const del = async (id) => {
    if (!window.confirm("Remove this user permanently?")) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("User removed");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const approve = async (id, name) => {
    try {
      await api.post(`/users/${id}/approve`);
      toast.success(`${name} approved — invite email sent`);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const pending = users.filter((u) => u.status === "pending");

  if (isError && error?.response?.status === 403) {
    return (
      <div className="p-8 max-w-xl">
        <div className="border border-red-900/50 bg-red-950/20 rounded-md p-6">
          <ShieldAlert className="w-6 h-6 text-red-400" />
          <div className="font-display font-bold text-xl mt-2">Admin only</div>
          <p className="text-white/60 text-sm mt-1">
            Managing users is restricted to admin accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="users-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            settings · team
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            User <span className="text-white/40">access</span>
          </h1>
          <p className="text-white/50 text-sm mt-2 max-w-xl">
            Create accounts for your team directly — set their name, email, role
            and password. They can log in immediately without needing an invite.
          </p>
        </div>
        <Button
          data-testid="new-user-button"
          onClick={() => setOpen(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Create user
        </Button>
      </div>

      {pending.length > 0 && (
        <div
          data-testid="pending-banner"
          className="border border-amber-800/60 bg-amber-950/20 rounded-md p-4"
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-amber-300">
            <Clock className="w-3.5 h-3.5" /> {pending.length} sign-up
            {pending.length === 1 ? "" : "s"} awaiting approval
          </div>
          <div className="mt-3 space-y-2">
            {pending.map((u) => (
              <div
                key={u.id}
                data-testid={`pending-${u.id}`}
                className="flex items-center justify-between border border-white/10 rounded px-3 py-2"
              >
                <div>
                  <div className="text-[14px] font-medium">{u.name}</div>
                  <div className="text-[11.5px] font-mono text-white/50">{u.email}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => approve(u.id, u.name)}
                    data-testid={`approve-${u.id}`}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                  >
                    <UserCheck className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => del(u.id)}
                    className="text-red-400 h-8"
                    data-testid={`reject-${u.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-white/[0.08] rounded-md overflow-hidden bg-[color:var(--vc-surface)]">
        <div className="grid grid-cols-[2fr_2.5fr_1fr_1fr_1fr_0.6fr] text-[10.5px] font-mono uppercase tracking-widest text-white/40 px-4 py-2.5 border-b border-white/[0.06]">
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Added</div>
          <div></div>
        </div>
        {users.map((u) => {
          const R = ROLE_META[u.role] || ROLE_META.member;
          const isSelf = u.id === currentUser?.id;
          const statusColor =
            u.status === "active"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : u.status === "pending"
                ? "border-amber-800 bg-amber-950/40 text-amber-300"
                : "border-white/10 text-white/50";
          return (
            <div
              key={u.id}
              data-testid={`row-user-${u.id}`}
              className="grid grid-cols-[2fr_2.5fr_1fr_1fr_1fr_0.6fr] items-center px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/20 to-white/[0.06] flex items-center justify-center font-display font-bold">
                  {u.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate flex items-center gap-1.5">
                    {u.name}
                    {isSelf && (
                      <span className="text-[9.5px] font-mono uppercase tracking-wider text-white/40 border border-white/10 rounded px-1">
                        you
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-[12.5px] font-mono text-white/70 truncate">{u.email}</div>
              <div>
                <span
                  className="inline-flex items-center gap-1 text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border"
                  style={{
                    borderColor: `${R.color}55`,
                    background: `${R.color}18`,
                    color: R.color,
                  }}
                >
                  <ShieldCheck className="w-3 h-3" /> {R.label}
                </span>
              </div>
              <div>
                <span
                  className={`inline-flex items-center gap-1 text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${statusColor}`}
                >
                  {u.status || "active"}
                  {!u.has_password && u.status === "active" && (
                    <span className="text-[9px] ml-1 opacity-60">· invited</span>
                  )}
                </span>
              </div>
              <div className="font-mono text-xs text-white/50">{fmtDate(u.created_at)}</div>
              <div className="text-right flex items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEmailUser(u)}
                  data-testid={`email-user-${u.id}`}
                  className="text-white/60 hover:text-white"
                >
                  <Mail className="w-3.5 h-3.5" />
                </Button>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => del(u.id)}
                    data-testid={`delete-user-${u.id}`}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {users.length === 0 && (
          <div className="p-16 text-center text-white/40 font-mono text-sm">
            No users yet. Create the first team account.
          </div>
        )}
      </div>

      <NewUserDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["users"] });
          qc.invalidateQueries({ queryKey: ["team"] });
        }}
      />
      
      <SendEmailDialog
        user={emailUser}
        onClose={() => setEmailUser(null)}
      />
    </div>
  );
}

function NewUserDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "member",
    password: "",
    confirmPassword: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => setForm({ name: "", email: "", role: "member", password: "", confirmPassword: "" });

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!form.password) {
      toast.error("Password is required");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/users", {
        email: form.email.trim(),
        name: form.name.trim(),
        role: form.role,
        password: form.password,
      });
      toast.success(`Account created for ${form.name.trim()} — they can log in now`);
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            Create account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Name */}
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">Full name</Label>
            <div className="relative mt-1.5">
              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <Input
                data-testid="nu-name"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-black/40 border-white/10 pl-8"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">Email</Label>
            <div className="relative mt-1.5">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <Input
                data-testid="nu-email"
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="bg-black/40 border-white/10 pl-8"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="nu-role" className="mt-1.5 bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member — can pick up tasks</SelectItem>
                <SelectItem value="manager">Manager — can assign tasks</SelectItem>
                <SelectItem value="admin">Admin — full access</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06] pt-1">
            <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/30 mb-3">
              <KeyRound className="inline w-3 h-3 mr-1.5 mb-0.5" />Set password
            </div>

            {/* Password */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">Password</Label>
                <div className="relative mt-1.5">
                  <KeyRound className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <Input
                    data-testid="nu-password"
                    type={showPwd ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="bg-black/40 border-white/10 pl-8 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-[10px] font-mono uppercase tracking-wider"
                  >
                    {showPwd ? "hide" : "show"}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-white/50">Confirm password</Label>
                <div className="relative mt-1.5">
                  <KeyRound className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <Input
                    data-testid="nu-confirm-password"
                    type={showPwd ? "text" : "password"}
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className={`bg-black/40 border-white/10 pl-8 ${
                      form.confirmPassword && form.password !== form.confirmPassword
                        ? "border-red-500/60"
                        : form.confirmPassword && form.password === form.confirmPassword
                          ? "border-emerald-500/60"
                          : ""
                    }`}
                  />
                  {form.confirmPassword && (
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono ${
                      form.password === form.confirmPassword ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {form.password === form.confirmPassword ? "✓" : "✗"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            data-testid="nu-submit"
            onClick={submit}
            disabled={busy}
            className="bg-white text-black hover:bg-white/90 w-full"
          >
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendEmailDialog({ user, onClose }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!subject.trim() || !message.trim()) return toast.error("Subject and message are required");
    setSending(true);
    try {
      await api.post(`/users/${user.id}/send_email`, { subject, message });
      toast.success(`Email sent to ${user.name}`);
      onClose();
      setSubject("");
      setMessage("");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md bg-[color:var(--vc-surface)] border-white/10">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
          <div className="text-sm text-white/50 font-mono mt-1">To: {user?.email}</div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder="Meeting at 10?"
              data-testid="email-subject"
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi there..."
              data-testid="email-message"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending} data-testid="email-send-btn" className="bg-[color:var(--vc-lime)] text-black hover:bg-[color:var(--vc-lime)]/90">
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
