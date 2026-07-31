import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { fmtDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Play, Mail, Phone, MessageSquare, Zap } from "lucide-react";

const CHANNEL_ICON = { email: Mail, sms: Phone, whatsapp: MessageSquare };

export default function Automations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: autos = [] } = useQuery({
    queryKey: ["autos"],
    queryFn: async () => (await api.get("/automations")).data,
  });
  const { data: segments = [] } = useQuery({
    queryKey: ["segments"],
    queryFn: async () => (await api.get("/segments")).data,
  });

  const toggle = async (a) => {
    await api.patch(`/automations/${a.id}`, { active: !a.active });
    qc.invalidateQueries({ queryKey: ["autos"] });
  };
  const del = async (id) => {
    if (!window.confirm("Delete automation?")) return;
    await api.delete(`/automations/${id}`);
    qc.invalidateQueries({ queryKey: ["autos"] });
    toast.success("Deleted");
  };
  const run = async (id) => {
    try {
      const { data } = await api.post(`/automations/${id}/run`);
      const bits = [`${data.matched} matched`];
      if (data.delivered) bits.push(`${data.delivered} delivered`);
      if (data.simulated) bits.push(`${data.simulated} simulated`);
      if (data.failed) bits.push(`${data.failed} failed`);
      toast.success(bits.join(" · "));
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-8 space-y-6" data-testid="automations-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            automations
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Rule-based{" "}
            <span className="text-white/40">reminders</span>
          </h1>
        </div>
        <Button
          data-testid="new-automation-button"
          onClick={() => setOpen(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New automation
        </Button>
      </div>

      <div className="space-y-3">
        {autos.map((a) => {
          const seg = segments.find((s) => s.id === a.segment_id);
          const Icon = CHANNEL_ICON[a.channel] || Mail;
          return (
            <div
              key={a.id}
              data-testid={`automation-${a.id}`}
              className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-display font-bold text-lg">{a.name}</div>
                      <span className="text-[10px] font-mono uppercase tracking-widest border border-white/10 rounded px-1.5 py-0.5 text-white/50">
                        {a.channel}
                      </span>
                    </div>
                    <div className="font-mono text-[12px] text-white/60 mt-2 space-y-1">
                      <div>
                        <span className="text-white/40">IF</span>{" "}
                        matches segment{" "}
                        <span className="text-[color:var(--vc-lime)]">
                          {seg?.name || "—"}
                        </span>
                      </div>
                      {a.schedule_days > 0 && (
                        <div>
                          <span className="text-white/40">AND</span>{" "}
                          after{" "}
                          <span className="text-sky-300">{a.schedule_days} days</span>
                        </div>
                      )}
                      <div>
                        <span className="text-white/40">THEN</span>{" "}
                        send via <span className="text-orange-300">{a.channel}</span>
                      </div>
                    </div>
                    <div className="text-[13px] text-white/70 mt-3 border-l-2 border-white/10 pl-3">
                      {a.subject && <div className="font-medium">{a.subject}</div>}
                      <div className="mt-0.5" dangerouslySetInnerHTML={{ __html: a.message }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    data-testid={`toggle-${a.id}`}
                    checked={a.active}
                    onCheckedChange={() => toggle(a)}
                  />
                  <Button
                    size="sm"
                    onClick={() => run(a.id)}
                    data-testid={`run-${a.id}`}
                    className="bg-[color:var(--vc-accent)] hover:bg-[color:var(--vc-accent-hover)] text-white"
                  >
                    <Play className="w-3.5 h-3.5 mr-1.5" /> Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => del(a.id)}
                    className="text-red-400"
                    data-testid={`delete-auto-${a.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-white/40">
                <Zap className="w-3 h-3" />
                {a.active ? "active" : "paused"} · created {fmtDate(a.created_at)}
              </div>
            </div>
          );
        })}
        {autos.length === 0 && (
          <div className="border border-dashed border-white/10 rounded-md p-16 text-center text-white/40 font-mono text-sm">
            No automations. Create one to send cohort reminders.
          </div>
        )}
      </div>

      <NewAutomationDialog
        open={open}
        onOpenChange={setOpen}
        segments={segments}
        onCreated={() => qc.invalidateQueries({ queryKey: ["autos"] })}
      />
    </div>
  );
}

function NewAutomationDialog({ open, onOpenChange, segments, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    segment_id: "",
    channel: "email",
    subject: "",
    message: "",
    schedule_days: 0,
    active: true,
    trigger: "manual",
  });

  const submit = async () => {
    if (!form.name || !form.segment_id || !form.message)
      return toast.error("Name, segment and message are required");
    try {
      await api.post("/automations", { ...form, schedule_days: Number(form.schedule_days) || 0 });
      toast.success("Automation created");
      onCreated();
      onOpenChange(false);
      setForm({ ...form, name: "", segment_id: "", subject: "", message: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            New automation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-testid="na-name"
            placeholder="Automation name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Select
            value={form.segment_id}
            onValueChange={(v) => setForm({ ...form, segment_id: v })}
          >
            <SelectTrigger data-testid="na-segment" className="bg-black/40 border-white/10">
              <SelectValue placeholder="Choose segment…" />
            </SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={form.channel}
              onValueChange={(v) => setForm({ ...form, channel: v })}
            >
              <SelectTrigger data-testid="na-channel" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            <Input
              data-testid="na-days"
              type="number"
              placeholder="Schedule (days after event)"
              value={form.schedule_days}
              onChange={(e) => setForm({ ...form, schedule_days: e.target.value })}
              className="bg-black/40 border-white/10"
            />
          </div>
          {form.channel === "email" && (
            <Input
              data-testid="na-subject"
              placeholder="Email subject — use {name} to personalize"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="bg-black/40 border-white/10"
            />
          )}
          <Textarea
            data-testid="na-message"
            placeholder="Message body — {name} will be replaced per customer"
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="bg-black/40 border-white/10"
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="na-submit"
            onClick={submit}
            className="bg-white text-black hover:bg-white/90"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
