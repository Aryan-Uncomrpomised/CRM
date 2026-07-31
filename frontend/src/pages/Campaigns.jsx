import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { fmtDate } from "@/lib/constants";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Trash2, Instagram, Facebook, Twitter, Video, Search, Linkedin } from "lucide-react";

const CHANNEL_META = {
  instagram: { label: "Instagram", icon: Instagram, hue: "#ec4899" },
  facebook: { label: "Facebook", icon: Facebook, hue: "#3b82f6" },
  linkedin: { label: "LinkedIn", icon: Linkedin, hue: "#0a66c2" },
  tiktok: { label: "TikTok", icon: Video, hue: "#f472b6" },
  twitter: { label: "Twitter/X", icon: Twitter, hue: "#38bdf8" },
  google_ads: { label: "Google Ads", icon: Search, hue: "#facc15" },
};

export default function Campaigns() {
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await api.get("/campaigns")).data,
  });

  const del = async (id) => {
    if (!window.confirm("Delete campaign?")) return;
    await api.delete(`/campaigns/${id}`);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    toast.success("Deleted");
  };

  return (
    <div className="p-8 space-y-6" data-testid="campaigns-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            marketing
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Social <span className="text-white/40">campaigns</span>
          </h1>
        </div>
        <Button
          data-testid="new-campaign-button"
          onClick={() => setOpen(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New campaign
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((c) => {
          const meta = CHANNEL_META[c.channel] || {};
          const Icon = meta.icon || Instagram;
          return (
            <div
              key={c.id}
              data-testid={`campaign-card-${c.id}`}
              className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-5 relative"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center border"
                    style={{
                      background: `${meta.hue}20`,
                      borderColor: `${meta.hue}55`,
                      color: meta.hue,
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                      {meta.label}
                    </div>
                    <div className="font-display font-bold text-base">{c.name}</div>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    c.status === "live"
                      ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                      : c.status === "scheduled"
                        ? "border-amber-800 bg-amber-950/40 text-amber-300"
                        : "border-white/10 text-white/50"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <div className="text-[13px] text-white/70 mt-3">{c.content}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="border border-white/[0.06] rounded px-2.5 py-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                    budget
                  </div>
                  <div className="font-display font-bold text-sm">{format(c.budget || 0, { digits: 0 })}</div>
                </div>
                <div className="border border-white/[0.06] rounded px-2.5 py-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                    objective
                  </div>
                  <div className="text-[12px]">{c.objective}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10.5px] font-mono text-white/40">
                <span>created {fmtDate(c.created_at)}</span>
                <button
                  onClick={() => del(c.id)}
                  className="text-red-400 hover:text-red-300"
                  data-testid={`delete-camp-${c.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="col-span-3 border border-dashed border-white/10 rounded-md p-16 text-center text-white/40 font-mono text-sm">
            No campaigns yet.
          </div>
        )}
      </div>

      <NewCampaignDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["campaigns"] })}
      />
    </div>
  );
}

function NewCampaignDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    channel: "instagram",
    objective: "Awareness",
    content: "",
    budget: 0,
    status: "draft",
  });
  const submit = async () => {
    if (!form.name) return toast.error("Name is required");
    try {
      await api.post("/campaigns", { ...form, budget: Number(form.budget) || 0 });
      toast.success("Campaign created");
      onCreated();
      onOpenChange(false);
      setForm({ ...form, name: "", content: "", budget: 0 });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            New campaign
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-testid="nc-name"
            placeholder="Campaign name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger data-testid="nc-channel" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Objective (e.g. Awareness, Conversion)"
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Input
            type="number"
            placeholder="Budget ($)"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Textarea
            placeholder="Content brief / creative notes"
            rows={4}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            className="bg-black/40 border-white/10"
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="nc-submit"
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
