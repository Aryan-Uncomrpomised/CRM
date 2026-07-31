import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { CLASSIFICATIONS, fmtDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Play, Filter, Send, CheckSquare, Zap, X } from "lucide-react";
import { BulkSendDialog, BulkTasksDialog } from "@/pages/Customers";

const FIELDS = [
  { v: "classification", l: "Stage" },
  { v: "days_since_last_order", l: "Days since last order" },
  { v: "total_orders", l: "Total orders" },
  { v: "total_spent", l: "Total spent" },
  { v: "country", l: "Country" },
  { v: "subscription_active", l: "Has subscription" },
];
const OPS = [
  { v: "eq", l: "equals" },
  { v: "neq", l: "not equal" },
  { v: "gt", l: ">" },
  { v: "gte", l: "≥" },
  { v: "lt", l: "<" },
  { v: "lte", l: "≤" },
];

export default function Segments() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null); // { id, name, count, sample, matched_ids }
  const [bulkMode, setBulkMode] = useState(null); // "send" | "tasks"

  const { data: segments = [] } = useQuery({
    queryKey: ["segments"],
    queryFn: async () => (await api.get("/segments")).data,
  });

  const runPreview = async (seg) => {
    try {
      const { data } = await api.post(`/segments/${seg.id}/preview`);
      setPreview({ id: seg.id, name: seg.name, ...data });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this segment?")) return;
    await api.delete(`/segments/${id}`);
    qc.invalidateQueries({ queryKey: ["segments"] });
    toast.success("Segment deleted");
  };

  return (
    <div className="p-8 space-y-6" data-testid="segments-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            segments
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Cohort <span className="text-white/40">catalogue</span>
          </h1>
        </div>
        <Button
          data-testid="new-segment-button"
          onClick={() => setOpen(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New segment
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {segments.map((s) => (
          <div
            key={s.id}
            data-testid={`segment-card-${s.id}`}
            className="border border-white/[0.08] rounded-md p-5 bg-[color:var(--vc-surface)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                    match {s.match}
                  </span>
                </div>
                <div className="font-display font-black text-xl mt-2 tracking-tight">{s.name}</div>
                <div className="text-sm text-white/50 mt-1">{s.description}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runPreview(s)}
                  data-testid={`preview-${s.id}`}
                  className="text-white/70 hover:text-white"
                >
                  <Play className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => del(s.id)}
                  data-testid={`delete-segment-${s.id}`}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              {(s.rules || []).map((r, i) => (
                <div
                  key={i}
                  className="font-mono text-[11.5px] text-white/70 border border-white/[0.06] bg-black/30 rounded px-2.5 py-1.5"
                >
                  <span className="text-white/40">IF</span>{" "}
                  <span className="text-[color:var(--vc-lime)]">{r.field}</span>{" "}
                  <span className="text-white/40">{r.op}</span>{" "}
                  <span className="text-sky-300">{String(r.value)}</span>
                </div>
              ))}
              {(s.rules || []).length === 0 && (
                <div className="font-mono text-[11.5px] text-white/40">no rules — matches everyone</div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-mono text-white/40">
              <span>created {fmtDate(s.created_at)}</span>
              {preview?.id === s.id && (
                <span className="text-emerald-400">{preview.count} match</span>
              )}
            </div>
          </div>
        ))}
        {segments.length === 0 && (
          <div className="col-span-2 border border-dashed border-white/10 rounded-md p-16 text-center text-white/40 font-mono text-sm">
            No segments yet. Create one to start targeting cohorts.
          </div>
        )}
      </div>

      <NewSegmentDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["segments"] })}
      />

      {/* Actionable preview panel */}
      {preview && (
        <div
          data-testid="segment-preview-panel"
          className="fixed inset-y-0 right-0 w-full sm:max-w-xl z-40 bg-[color:var(--vc-surface)] border-l border-white/10 overflow-y-auto"
        >
          <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                segment preview
              </div>
              <h2 className="font-display font-black text-2xl tracking-tight mt-1">
                {preview.name}
              </h2>
              <div className="text-[13px] text-white/70 mt-1">
                <span className="text-[color:var(--vc-lime)] font-bold">{preview.count}</span>{" "}
                match{preview.count === 1 ? "" : "es"}
                {preview.count > (preview.sample || []).length && (
                  <span className="text-white/40"> · showing top {preview.sample.length}</span>
                )}
              </div>
            </div>
            <button
              data-testid="preview-close"
              onClick={() => setPreview(null)}
              className="text-white/40 hover:text-white/80"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-2">
            <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40 mb-1">
              matched contacts
            </div>
            {(preview.sample || []).map((c) => (
              <div
                key={c.id}
                data-testid={`preview-row-${c.id}`}
                className="border border-white/[0.06] rounded p-2.5 flex items-center gap-3"
              >
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center font-display font-bold text-xs">
                  {c.name?.[0] || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{c.name}</div>
                  <div className="text-[11px] font-mono text-white/40 truncate">{c.email}</div>
                </div>
                <span className={`classification-tag tag-${c.classification}`}>
                  {c.classification.replace("_", " ")}
                </span>
              </div>
            ))}
            {(preview.sample || []).length === 0 && (
              <div className="text-sm text-white/40 font-mono py-8 text-center">
                No contacts matched this segment.
              </div>
            )}
          </div>

          {preview.count > 0 && (
            <div className="sticky bottom-0 bg-black/60 backdrop-blur border-t border-white/10 p-4">
              <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40 mb-2">
                what next?
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  data-testid="preview-action-send"
                  onClick={() => setBulkMode("send")}
                  className="bg-white text-black hover:bg-white/90 h-9"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Send message
                </Button>
                <Button
                  data-testid="preview-action-tasks"
                  onClick={() => setBulkMode("tasks")}
                  variant="outline"
                  className="h-9 border-white/20 text-white/85 hover:bg-white/10"
                >
                  <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Create tasks
                </Button>
                <Button
                  data-testid="preview-action-automation"
                  onClick={() => nav(`/automations?segment=${preview.id}`)}
                  variant="outline"
                  className="h-9 border-white/20 text-white/85 hover:bg-white/10"
                >
                  <Zap className="w-3.5 h-3.5 mr-1.5" /> Automation
                </Button>
              </div>
              <div className="text-[10.5px] font-mono text-white/40 mt-2">
                Actions will run on all {preview.count} matched contacts.
              </div>
            </div>
          )}
        </div>
      )}

      <BulkSendDialog
        open={bulkMode === "send"}
        onOpenChange={(o) => !o && setBulkMode(null)}
        customerIds={preview?.matched_ids || []}
        onDone={() => setBulkMode(null)}
      />
      <BulkTasksDialog
        open={bulkMode === "tasks"}
        onOpenChange={(o) => !o && setBulkMode(null)}
        customerIds={preview?.matched_ids || []}
        onDone={() => {
          setBulkMode(null);
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </div>
  );
}

function NewSegmentDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [match, setMatch] = useState("all");
  const [rules, setRules] = useState([{ field: "classification", op: "eq", value: "customer" }]);

  const setRule = (i, patch) =>
    setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!name) return toast.error("Name is required");
    try {
      await api.post("/segments", { name, description: desc, match, rules });
      toast.success("Segment created");
      onCreated();
      onOpenChange(false);
      setName("");
      setDesc("");
      setRules([{ field: "classification", op: "eq", value: "customer" }]);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            New segment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-testid="ns-name"
            placeholder="Segment name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-black/40 border-white/10"
          />
          <Input
            data-testid="ns-desc"
            placeholder="Short description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="bg-black/40 border-white/10"
          />
          <div className="flex items-center gap-3">
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">Match</Label>
            <Select value={match} onValueChange={setMatch}>
              <SelectTrigger data-testid="ns-match" className="w-36 bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL rules</SelectItem>
                <SelectItem value="any">ANY rule</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border border-white/10 rounded p-3 space-y-2">
            <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
              rules
            </div>
            {rules.map((r, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_1.4fr_auto] gap-2">
                <Select value={r.field} onValueChange={(v) => setRule(i, { field: v })}>
                  <SelectTrigger className="bg-black/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELDS.map((f) => (
                      <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={r.op} onValueChange={(v) => setRule(i, { op: v })}>
                  <SelectTrigger className="bg-black/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPS.map((o) => (
                      <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {r.field === "classification" ? (
                  <Select value={r.value} onValueChange={(v) => setRule(i, { value: v })}>
                    <SelectTrigger className="bg-black/40 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={r.value}
                    onChange={(e) => setRule(i, { value: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
                  className="text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setRules([...rules, { field: "days_since_last_order", op: "gt", value: "14" }])
              }
              data-testid="ns-add-rule"
              className="border-white/10 bg-transparent hover:bg-white/[0.04]"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add rule
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="ns-submit"
            onClick={submit}
            className="bg-white text-black hover:bg-white/90"
          >
            Create segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
