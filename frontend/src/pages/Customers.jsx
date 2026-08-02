import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { CLASSIFICATIONS, CATEGORIES, EVENT_LABELS, fmtDate, fmtDateTime, relTime } from "@/lib/constants";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Send, Mail, MessageSquare, Phone, Linkedin, Building2, Lock, FileText, Trash2, ExternalLink } from "lucide-react";

function classTag(v) {
  return <span className={`classification-tag tag-${v}`}>{v.replace("_", " ")}</span>;
}

export default function Customers() {
  const qc = useQueryClient();
  const { format } = useCurrency();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [category, setCategory] = useState("b2c");
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkMode, setBulkMode] = useState(null); // "send" | "tasks" | null

  const visibleCategories = CATEGORIES;

  const { data: rawCustomers = [] } = useQuery({
    queryKey: ["customers", q, cls, category, tagFilter],
    queryFn: async () =>
      (
        await api.get("/customers", {
          params: {
            q: q || undefined,
            classification: cls === "all" ? undefined : cls,
            category: category === "all" ? undefined : category,
            tag: tagFilter === "all" ? undefined : tagFilter,
          },
        })
      ).data,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const customers = Array.isArray(rawCustomers) ? rawCustomers : [];

  const isConsumer = category !== "b2b";
  const catMeta = CATEGORIES.find((c) => c.value === category);

  // Reset selection whenever the filter set changes
  useEffect(() => {
    setSelected(new Set());
  }, [q, cls, category]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === customers.length && customers.length > 0) return new Set();
      return new Set(customers.map((c) => c.id));
    });
  };

  return (
    <div className="p-8 space-y-6" data-testid="customers-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/40">
            <span>contacts</span>
            {!isConsumer && (
              <>
                <span className="text-white/20">/</span>
                <span className="inline-flex items-center gap-1 text-[color:var(--vc-lime)]">
                  <Lock className="w-3 h-3" /> restricted
                </span>
              </>
            )}
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            {customers.length}{" "}
            <span className="text-white/40">
              {catMeta?.label || "contacts"}
              {cls !== "all" ? ` · ${cls.replace("_", " ")}` : ""}
            </span>
          </h1>
        </div>
        <Button
          data-testid="new-customer-button"
          onClick={() => setShowNew(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New contact
        </Button>
      </div>

      {/* Category tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {visibleCategories.map((c) => (
          <button
            key={c.value}
            data-testid={`cat-${c.value}`}
            onClick={() => {
              setCategory(c.value);
              setCls("all");
            }}
            className={`text-left px-3.5 py-3 rounded-md border transition-colors ${
              category === c.value
                ? "border-white/30 bg-white/[0.06]"
                : "border-white/[0.08] hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-base">{c.label}</span>
              {c.value !== "consumer" && <Lock className="w-3 h-3 text-white/30" />}
            </div>
            <div className="text-[11.5px] text-white/50 mt-0.5">{c.desc}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          data-testid="customers-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, phone, or company"
          className="max-w-xs h-9 bg-white/[0.03] border-white/10 text-sm"
        />
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-md px-3 py-1.5 h-9">
          <span className="text-xs font-mono text-white/50 uppercase">Tag:</span>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-transparent text-xs font-mono text-white/90 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-neutral-900">All Tags</option>
            {ODOO_TAGS.map((t) => (
              <option key={t} value={t} className="bg-neutral-900">{t}</option>
            ))}
          </select>
        </div>
        <Tabs value={cls} onValueChange={setCls}>
          <TabsList className="bg-white/[0.03] border border-white/10">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            {CLASSIFICATIONS.map((c) => (
              <TabsTrigger
                key={c.value}
                value={c.value}
                data-testid={`tab-${c.value}`}
              >
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="border border-white/[0.08] rounded-md overflow-hidden bg-[color:var(--vc-surface)]">
        <div className="grid grid-cols-[36px_2.2fr_1.4fr_1.8fr_1.2fr_0.9fr_1fr_1fr_1fr_1.4fr] text-[10.5px] font-mono uppercase tracking-widest text-white/40 px-4 py-2.5 border-b border-white/[0.06] items-center">
          <div>
            <input
              type="checkbox"
              data-testid="select-all"
              checked={selected.size > 0 && selected.size === customers.length}
              onChange={toggleAll}
              aria-label="Select all"
            />
          </div>
          <div>Customer</div>
          <div>Contact No</div>
          <div>Email</div>
          <div>Stage</div>
          <div>Orders</div>
          <div>Spent</div>
          <div>Last order</div>
          <div>Source</div>
          <div>Tag</div>
        </div>
        {customers.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setOpenId(c.id)}
            onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.id); }}
            data-testid={`row-customer-${c.id}`}
            className="w-full grid grid-cols-[36px_2.2fr_1.4fr_1.8fr_1.2fr_0.9fr_1fr_1fr_1fr_1.4fr] items-center px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] text-left cursor-pointer"
          >
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                data-testid={`select-${c.id}`}
                checked={selected.has(c.id)}
                onChange={() => toggleSelect(c.id)}
                aria-label={`Select ${c.name}`}
              />
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center font-display font-bold text-xs shrink-0">
                  {c.name ? c.name[0] : "C"}
                </div>
              )}
              <span className="text-[13.5px] font-medium truncate text-white">{c.name}</span>
            </div>
            <div className="font-mono text-xs text-emerald-400 font-semibold truncate">{c.phone || "—"}</div>
            <div className="font-mono text-xs text-white/50 truncate">{c.email || "—"}</div>
            <div>{classTag(c.classification)}</div>
            <div className="font-mono text-sm text-white">{c.total_orders || 0}</div>
            <div className="font-mono text-sm font-bold text-emerald-400">{format(c.total_spent || 0, { digits: 0 })}</div>
            <div className="font-mono text-xs text-white/60">{fmtDate(c.last_order_at)}</div>
            <div className="text-[11px] font-mono"><span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold uppercase">{c.source === 'odoo_live' || c.odoo_partner_id ? 'Odoo Live' : c.source}</span></div>
            <div className="flex flex-wrap gap-1">
              {(c.tags && c.tags.length > 0) ? (
                c.tags.slice(0, 2).map((t, idx) => (
                  <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold">
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-white/30 font-mono">—</span>
              )}
            </div>
          </div>
        ))}
        {customers.length === 0 && (
          <div className="p-8 text-center text-white/40 font-mono text-sm">
            No contacts match. Adjust filters or add one.
          </div>
        )}
      </div>

      <CustomerDrawer id={openId} onClose={() => setOpenId(null)} />
      <NewCustomerDialog
        open={showNew}
        onOpenChange={setShowNew}
        defaultCategory={category}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["customers"] });
          qc.invalidateQueries({ queryKey: ["stats"] });
        }}
      />

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div
          data-testid="bulk-bar"
          className="fixed left-1/2 -translate-x-1/2 bottom-6 z-40 border border-white/20 bg-black/90 backdrop-blur px-4 py-2.5 rounded-full shadow-xl flex items-center gap-3"
        >
          <span className="text-[12px] font-mono text-white/70">
            <span className="text-[color:var(--vc-lime)] font-bold">{selected.size}</span> selected
          </span>
          <Button
            data-testid="bulk-send-open"
            size="sm"
            onClick={() => setBulkMode("send")}
            className="bg-white text-black hover:bg-white/90 h-8"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Send message
          </Button>
          <Button
            data-testid="bulk-task-open"
            size="sm"
            variant="outline"
            onClick={() => setBulkMode("tasks")}
            className="h-8 border-white/20 text-white/85 hover:bg-white/10"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create tasks
          </Button>
          <button
            data-testid="bulk-clear"
            onClick={() => setSelected(new Set())}
            className="text-[11px] font-mono text-white/40 hover:text-white/80 px-1"
          >
            clear
          </button>
        </div>
      )}

      <BulkSendDialog
        open={bulkMode === "send"}
        onOpenChange={(o) => !o && setBulkMode(null)}
        customerIds={Array.from(selected)}
        onDone={() => {
          setBulkMode(null);
          setSelected(new Set());
        }}
      />
      <BulkTasksDialog
        open={bulkMode === "tasks"}
        onOpenChange={(o) => !o && setBulkMode(null)}
        customerIds={Array.from(selected)}
        onDone={() => {
          setBulkMode(null);
          setSelected(new Set());
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </div>
  );
}

function NewCustomerDialog({ open, onOpenChange, onCreated, defaultCategory = "consumer" }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    category: defaultCategory,
    company: "",
    title: "",
    linkedin_url: "",
    notes: "",
    classification: "visitor",
    source: "manual",
  });
  useEffect(() => {
    setForm((f) => ({ ...f, category: defaultCategory }));
  }, [defaultCategory, open]);

  const isConsumer = form.category === "consumer";
  const submit = async () => {
    try {
      await api.post("/customers", form);
      toast.success("Contact added");
      onCreated();
      onOpenChange(false);
      setForm({ ...form, name: "", email: "", phone: "", company: "", title: "", linkedin_url: "", notes: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            New contact
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v })}
          >
            <SelectTrigger data-testid="nc-category" className="bg-black/40 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label} · {c.desc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            data-testid="nc-name"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Input
            data-testid="nc-email"
            placeholder="email@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Input
            data-testid="nc-phone"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          {!isConsumer && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  data-testid="nc-company"
                  placeholder="Company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
                <Input
                  data-testid="nc-title"
                  placeholder="Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <Input
                data-testid="nc-linkedin"
                placeholder="LinkedIn URL"
                value={form.linkedin_url}
                onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                className="bg-black/40 border-white/10"
              />
              <Textarea
                data-testid="nc-notes"
                placeholder="Notes / context"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-black/40 border-white/10"
              />
            </>
          )}
          {isConsumer && (
            <Select
              value={form.classification}
              onValueChange={(v) => setForm({ ...form, classification: v })}
            >
              <SelectTrigger data-testid="nc-classification" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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

function CustomerDrawer({ id, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("timeline");
  const [msg, setMsg] = useState("");
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState("email");
  const { format } = useCurrency();

  const { data, refetch } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data,
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) setTab("timeline");
  }, [id]);

  const send = async () => {
    if (!msg.trim()) return toast.error("Message can't be empty");
    try {
      const { data: r } = await api.post(`/customers/${id}/send`, { channel, subject, message: msg });
      if (r.status === "failed") {
        toast.error(`${channel.toUpperCase()} send failed`);
      } else if (r.status === "simulated") {
        toast.info(`${channel.toUpperCase()} simulated — add Twilio in Settings to send live`);
      } else {
        toast.success(`${channel.toUpperCase()} sent to ${data?.customer?.name}`);
      }
      setMsg("");
      setSubject("");
      refetch();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const c = data?.customer;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-[color:var(--vc-surface)] border-l border-white/10 overflow-y-auto"
        data-testid="customer-drawer"
      >
        {/* Always render a SheetTitle to satisfy Radix a11y requirements, even before
            the customer data has loaded. When the contact loads, we override the
            visual title inside the header below. */}
        <SheetTitle className="sr-only">{c?.name || "Contact"}</SheetTitle>
        <SheetDescription className="sr-only">Contact details, activity, and quick actions</SheetDescription>
        {c && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center font-display font-bold">
                    {c.name[0]}
                  </div>
                )}
                <div>
                  <div className="font-display font-black text-2xl tracking-tight text-left">
                    {c.name}
                  </div>
                  <SheetDescription className="text-left font-mono text-xs text-white/50">
                    {c.email} · {c.country || "—"}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-3">
                {classTag(c.classification)}
                <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 rounded">
                  {c.category || "consumer"}
                </span>
                <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 rounded">
                  {c.source}
                </span>
                {c.subscription_active && (
                  <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border border-emerald-800 bg-emerald-950/40 text-emerald-300 rounded">
                    subscription
                  </span>
                )}
                {c.linkedin_url && (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border border-sky-800 bg-sky-950/40 text-sky-300 rounded inline-flex items-center gap-1"
                  >
                    <Linkedin className="w-3 h-3" /> linkedin
                  </a>
                )}
                {c.owner && (
                  <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 rounded text-white/60">
                    owner · {c.owner}
                  </span>
                )}
              </div>

              {(c.company || c.title || c.notes) && (
                <div className="mt-3 border border-white/10 rounded p-3 space-y-1">
                  {c.company && (
                    <div className="text-[13px]">
                      <span className="text-white/40 text-[11px] font-mono uppercase tracking-wider mr-2">company</span>
                      {c.company}
                    </div>
                  )}
                  {c.title && (
                    <div className="text-[13px]">
                      <span className="text-white/40 text-[11px] font-mono uppercase tracking-wider mr-2">title</span>
                      {c.title}
                    </div>
                  )}
                  {c.notes && (
                    <div className="text-[13px] text-white/70 mt-1">{c.notes}</div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="border border-white/10 rounded p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">orders</div>
                  <div className="font-display font-black text-xl">{c.total_orders}</div>
                </div>
                <div className="border border-white/10 rounded p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">spent</div>
                  <div className="font-display font-black text-xl">{format(c.total_spent || 0, { digits: 0 })}</div>
                </div>
                <div className="border border-white/10 rounded p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">last order</div>
                  <div className="font-display font-black text-sm mt-1">{fmtDate(c.last_order_at)}</div>
                </div>
              </div>

              <StageSelector
                customer={c}
                onMoved={() => {
                  refetch();
                  qc.invalidateQueries({ queryKey: ["customers"] });
                  qc.invalidateQueries({ queryKey: ["stats"] });
                  qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
                }}
              />
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="mt-6">
              <TabsList className="bg-white/[0.03] border border-white/10 flex-wrap h-auto">
                <TabsTrigger data-testid="tab-timeline" value="timeline">Journey</TabsTrigger>
                <TabsTrigger data-testid="tab-edit" value="edit">Edit</TabsTrigger>
                <TabsTrigger data-testid="tab-notes" value="notes">Notes</TabsTrigger>
                <TabsTrigger data-testid="tab-task" value="task">Task</TabsTrigger>
                <TabsTrigger data-testid="tab-documents" value="documents">Docs</TabsTrigger>
                <TabsTrigger data-testid="tab-message" value="message">Send now</TabsTrigger>
                <TabsTrigger data-testid="tab-schedule" value="schedule">Schedule</TabsTrigger>
                <TabsTrigger data-testid="tab-reminders" value="reminders">History</TabsTrigger>
              </TabsList>

              {tab === "timeline" && (
                <div className="mt-5 pl-6 border-l border-white/10 space-y-4">
                  {(data.events || []).map((e) => (
                    <div key={e.id} className="timeline-node" data-type={e.type}>
                      <div className="text-[13.5px] font-medium">
                        {EVENT_LABELS[e.type] || e.type}
                        {e.amount ? (
                          <span className="ml-2 text-white/50 font-mono text-xs">
                            {format(e.amount)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11.5px] font-mono text-white/40">
                        {e.detail} · {fmtDateTime(e.at)}
                      </div>
                    </div>
                  ))}
                  {(data.events || []).length === 0 && (
                    <div className="text-sm text-white/40 font-mono">No journey events yet.</div>
                  )}
                </div>
              )}

              {tab === "message" && (
                <div className="mt-5 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {["email", "sms", "whatsapp"].map((ch) => (
                      <button
                        key={ch}
                        data-testid={`channel-${ch}`}
                        onClick={() => setChannel(ch)}
                        className={`px-3 py-2 rounded border text-sm font-medium capitalize ${
                          channel === ch
                            ? "border-white/40 bg-white/[0.06]"
                            : "border-white/10 hover:bg-white/[0.03]"
                        }`}
                      >
                        {ch === "email" && <Mail className="inline w-3.5 h-3.5 mr-1.5" />}
                        {ch === "sms" && <Phone className="inline w-3.5 h-3.5 mr-1.5" />}
                        {ch === "whatsapp" && <MessageSquare className="inline w-3.5 h-3.5 mr-1.5" />}
                        {ch}
                      </button>
                    ))}
                  </div>
                  {channel === "email" && (
                    <Input
                      data-testid="msg-subject"
                      placeholder="Subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="bg-black/40 border-white/10"
                    />
                  )}
                  <Textarea
                    data-testid="msg-body"
                    placeholder={`Hi ${c.name.split(" ")[0]}, we miss you…`}
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    rows={6}
                    className="bg-black/40 border-white/10"
                  />
                  <Button
                    data-testid="msg-send"
                    onClick={send}
                    className="bg-white text-black hover:bg-white/90"
                  >
                    <Send className="w-4 h-4 mr-1.5" /> Send {channel}
                  </Button>
                </div>
              )}

              {tab === "edit" && (
                <EditPanel
                  customer={c}
                  isAdmin={isAdmin}
                  onSaved={() => {
                    refetch();
                    qc.invalidateQueries({ queryKey: ["customers"] });
                    qc.invalidateQueries({ queryKey: ["stats"] });
                  }}
                />
              )}

              {tab === "notes" && (
                <NotesPanel
                  customerId={c.id}
                  notes={data.notes || []}
                  onChanged={refetch}
                  currentUserName={user?.name}
                />
              )}

              {tab === "task" && (
                <TaskPanel
                  customer={c}
                  onCreated={() => {
                    qc.invalidateQueries({ queryKey: ["tasks"] });
                    toast.success("Task created");
                  }}
                />
              )}

              {tab === "documents" && (
                <DocumentsPanel
                  customer={c}
                  documents={data.documents || []}
                  isAdmin={isAdmin}
                  currentUserName={user?.name}
                  onChanged={() => {
                    refetch();
                    qc.invalidateQueries({ queryKey: ["documents"] });
                  }}
                />
              )}

              {tab === "schedule" && (
                <SchedulePanel
                  customerId={c.id}
                  scheduled={data.scheduled || []}
                  onChanged={refetch}
                />
              )}

              {tab === "reminders" && (
                <HistoryPanel data={data} format={format} />
              )}
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}


// -----------------------------------------------------------------------------
// Drawer sub-panels
// -----------------------------------------------------------------------------
function EditPanel({ customer, isAdmin, onSaved }) {
  const [form, setForm] = useState({
    name: customer.name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    country: customer.country || "",
    company: customer.company || "",
    title: customer.title || "",
    linkedin_url: customer.linkedin_url || "",
    notes: customer.notes || "",
    classification: customer.classification || "prospect",
    category: customer.category || "consumer",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/customers/${customer.id}`, form);
      toast.success("Contact updated");
      onSaved?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 space-y-3" data-testid="edit-panel">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input data-testid="edit-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input data-testid="edit-email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input data-testid="edit-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Country">
          <Input data-testid="edit-country" value={form.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Company">
          <Input data-testid="edit-company" value={form.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Title">
          <Input data-testid="edit-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="LinkedIn URL">
          <Input data-testid="edit-linkedin" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} />
        </Field>
        <Field label="Classification">
          <Select value={form.classification} onValueChange={(v) => set("classification", v)}>
            <SelectTrigger data-testid="edit-classification" className="bg-black/40 border-white/10 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASSIFICATIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {isAdmin && (
          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger data-testid="edit-category" className="bg-black/40 border-white/10 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      <Field label="Notes">
        <Textarea
          data-testid="edit-notes"
          rows={4}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="bg-black/40 border-white/10"
        />
      </Field>
      <Button
        data-testid="edit-save"
        onClick={save}
        disabled={saving}
        className="bg-[color:var(--vc-lime)] text-black hover:bg-[color:var(--vc-lime)]/90"
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function NotesPanel({ customerId, notes, onChanged, currentUserName }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim()) return toast.error("Type something first");
    setBusy(true);
    try {
      await api.post(`/customers/${customerId}/notes`, { note: text.trim() });
      setText("");
      onChanged?.();
      toast.success("Note added");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (nid) => {
    try {
      await api.delete(`/customers/${customerId}/notes/${nid}`);
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="mt-5 space-y-4" data-testid="notes-panel">
      <div className="border border-white/10 rounded p-3 space-y-2">
        <Textarea
          data-testid="note-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Log a follow-up — a call summary, an objection, next step…"
          className="bg-black/40 border-white/10"
        />
        <Button
          data-testid="note-add"
          onClick={add}
          disabled={busy}
          size="sm"
          className="bg-white text-black hover:bg-white/90"
        >
          {busy ? "Saving…" : "Add follow-up"}
        </Button>
      </div>
      <div className="space-y-2">
        {(notes || []).map((n) => (
          <div
            key={n.id}
            data-testid={`note-${n.id}`}
            className="border border-white/10 rounded p-3 group"
          >
            <div className="flex items-center justify-between text-[11px] font-mono text-white/50">
              <span>{n.author}</span>
              <span>{relTime(n.at)}</span>
            </div>
            <div className="text-[13px] text-white/85 mt-1 whitespace-pre-wrap">{n.note}</div>
            {n.author === currentUserName && (
              <button
                data-testid={`note-delete-${n.id}`}
                onClick={() => remove(n.id)}
                className="text-[10.5px] font-mono uppercase tracking-wider text-white/30 hover:text-red-300 mt-2 opacity-0 group-hover:opacity-100 transition"
              >
                delete
              </button>
            )}
          </div>
        ))}
        {(notes || []).length === 0 && (
          <div className="text-sm text-white/40 font-mono">No follow-up notes yet.</div>
        )}
      </div>
    </div>
  );
}

function TaskPanel({ customer, onCreated }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    due_date: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.title.trim()) return toast.error("Task needs a title");
    setBusy(true);
    try {
      await api.post("/tasks", {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        assignee: form.assignee || undefined,
        due_date: form.due_date || undefined,
        related_customer_id: customer.id,
      });
      onCreated?.();
      setForm({ title: "", description: "", priority: "medium", assignee: "", due_date: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-3" data-testid="task-panel">
      <div className="text-[12px] text-white/50">
        Creates a task linked to <span className="text-white/80">{customer.name}</span>.
      </div>
      <Field label="Title">
        <Input
          data-testid="task-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Follow up on the ₹2 Cr proposal"
        />
      </Field>
      <Field label="Description">
        <Textarea
          data-testid="task-description"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="bg-black/40 border-white/10"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Priority">
          <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
            <SelectTrigger data-testid="task-priority" className="bg-black/40 border-white/10 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Assignee">
          <Input
            data-testid="task-assignee"
            value={form.assignee}
            onChange={(e) => set("assignee", e.target.value)}
            placeholder="You"
          />
        </Field>
        <Field label="Due date">
          <Input
            data-testid="task-due"
            type="date"
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
          />
        </Field>
      </div>
      <Button
        data-testid="task-create"
        onClick={create}
        disabled={busy}
        className="bg-[color:var(--vc-lime)] text-black hover:bg-[color:var(--vc-lime)]/90"
      >
        {busy ? "Creating…" : "Create task"}
      </Button>
    </div>
  );
}

function SchedulePanel({ customerId, scheduled, onChanged }) {
  const [form, setForm] = useState({
    scheduled_at: "",
    channel: "email",
    subject: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.scheduled_at) return toast.error("Pick a date & time");
    if (!form.message.trim()) return toast.error("Message can't be empty");
    setBusy(true);
    try {
      // Convert local datetime-local value to ISO UTC
      const iso = new Date(form.scheduled_at).toISOString();
      await api.post(`/customers/${customerId}/schedule`, {
        scheduled_at: iso,
        channel: form.channel,
        subject: form.subject,
        message: form.message.trim(),
      });
      toast.success("Reminder scheduled");
      setForm({ scheduled_at: "", channel: "email", subject: "", message: "" });
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (sid) => {
    try {
      await api.delete(`/scheduled/${sid}`);
      onChanged?.();
      toast.message("Cancelled");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="mt-5 space-y-4" data-testid="schedule-panel">
      <div className="border border-white/10 rounded p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fire at (your local time)">
            <Input
              data-testid="schedule-at"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => set("scheduled_at", e.target.value)}
              className="bg-black/40 border-white/10"
            />
          </Field>
          <Field label="Channel">
            <Select value={form.channel} onValueChange={(v) => set("channel", v)}>
              <SelectTrigger data-testid="schedule-channel" className="bg-black/40 border-white/10 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {form.channel === "email" && (
          <Field label="Subject">
            <Input
              data-testid="schedule-subject"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="Following up on our conversation"
            />
          </Field>
        )}
        <Field label="Message">
          <Textarea
            data-testid="schedule-message"
            rows={4}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            className="bg-black/40 border-white/10"
          />
        </Field>
        <Button
          data-testid="schedule-submit"
          onClick={submit}
          disabled={busy}
          className="bg-white text-black hover:bg-white/90"
        >
          {busy ? "Scheduling…" : "Schedule reminder"}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
          upcoming ({(scheduled || []).filter((s) => s.status === "pending").length})
        </div>
        {(scheduled || []).map((s) => (
          <div
            key={s.id}
            data-testid={`scheduled-${s.id}`}
            className="border border-white/10 rounded p-3"
          >
            <div className="flex items-center justify-between text-[11px] font-mono text-white/50">
              <span>
                {s.channel} · <span className={s.status === "pending" ? "text-amber-300" : s.status === "sent" ? "text-emerald-300" : "text-white/50"}>{s.status}</span>
              </span>
              <span>{fmtDateTime(s.scheduled_at)}</span>
            </div>
            {s.subject && <div className="text-sm mt-1 font-medium">{s.subject}</div>}
            <div className="text-[12.5px] text-white/60 mt-1">{s.message}</div>
            {s.status === "pending" && (
              <button
                data-testid={`schedule-cancel-${s.id}`}
                onClick={() => cancel(s.id)}
                className="text-[10.5px] font-mono uppercase tracking-wider text-white/30 hover:text-red-300 mt-2"
              >
                cancel
              </button>
            )}
          </div>
        ))}
        {(scheduled || []).length === 0 && (
          <div className="text-sm text-white/40 font-mono">Nothing scheduled.</div>
        )}
      </div>
    </div>
  );
}

function DocumentsPanel({ customer, documents, isAdmin, currentUserName, onChanged }) {
  const [form, setForm] = useState({
    name: "",
    url: "",
    kind: "other",
    source: "link",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const KINDS = [
    { value: "proposal", label: "Proposal" },
    { value: "contract", label: "Contract" },
    { value: "pitch_deck", label: "Pitch deck" },
    { value: "spreadsheet", label: "Spreadsheet" },
    { value: "other", label: "Other" },
  ];
  const SOURCES = [
    { value: "google_drive", label: "Google Drive" },
    { value: "onedrive", label: "OneDrive" },
    { value: "link", label: "Direct link" },
  ];

  const attach = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.url.trim()) return toast.error("URL is required");
    setBusy(true);
    try {
      await api.post("/documents", {
        name: form.name.trim(),
        url: form.url.trim(),
        kind: form.kind,
        source: form.source,
        category: customer.category || "consumer",
        related_customer_id: customer.id,
        description: form.description,
      });
      toast.success("Document attached");
      setForm({ name: "", url: "", kind: "other", source: "link", description: "" });
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (did) => {
    try {
      await api.delete(`/documents/${did}`);
      onChanged?.();
      toast.message("Document removed");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  // Which kinds are admin-only for the current category
  const restrictedForRow = (d) =>
    !isAdmin && (d.kind === "pitch_deck" || d.kind === "contract"
      || ["b2b", "investor", "fund"].includes(d.category));

  return (
    <div className="mt-5 space-y-4" data-testid="documents-panel">
      <div className="border border-white/10 rounded p-3 space-y-3">
        <Field label="Document name">
          <Input
            data-testid="doc-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Q3 Proposal — Bombay Retail Group"
            className="bg-black/40 border-white/10"
          />
        </Field>
        <Field label="Share URL">
          <Input
            data-testid="doc-url"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://drive.google.com/… or any share link"
            className="bg-black/40 border-white/10"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
              <SelectTrigger data-testid="doc-kind" className="bg-black/40 border-white/10 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Source">
            <Select value={form.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger data-testid="doc-source" className="bg-black/40 border-white/10 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Description (optional)">
          <Textarea
            data-testid="doc-description"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="bg-black/40 border-white/10"
          />
        </Field>
        <Button
          data-testid="doc-attach"
          onClick={attach}
          disabled={busy}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> {busy ? "Attaching…" : "Attach document"}
        </Button>
        {!isAdmin && (customer.category === "b2b" || customer.category === "investor" || customer.category === "fund") && (
          <div className="text-[11px] font-mono text-white/40">
            Note: pitch decks and contracts are admin-only for this contact category.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
          attached ({documents.length})
        </div>
        {documents.map((d) => (
          <div
            key={d.id}
            data-testid={`doc-${d.id}`}
            className="border border-white/10 rounded p-3 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-white/60" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{d.name}</div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-white/40 mt-0.5">
                    {d.kind.replace("_", " ")} · {d.source.replace("_", " ")}
                    {restrictedForRow(d) && <span className="text-amber-300"> · restricted</span>}
                  </div>
                  {d.description && (
                    <div className="text-[12px] text-white/60 mt-1 line-clamp-2">{d.description}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`doc-open-${d.id}`}
                    className="text-[10.5px] font-mono uppercase tracking-wider text-sky-300 hover:text-sky-200 inline-flex items-center gap-1 px-2 py-1"
                  >
                    open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {(d.owner === currentUserName || isAdmin) && (
                  <button
                    data-testid={`doc-delete-${d.id}`}
                    onClick={() => remove(d.id)}
                    className="text-white/40 hover:text-red-300 p-1"
                    aria-label="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="text-sm text-white/40 font-mono">No documents attached yet.</div>
        )}
      </div>
    </div>
  );
}

// Pipeline stages per category — same values (classification) with re-labeled UI.
const STAGE_MAP = {
  b2c: [
    { value: "visitor", label: "Visitor", tone: "#94a3b8" },
    { value: "prospect", label: "Prospect", tone: "#38bdf8" },
    { value: "prime_prospect", label: "Prime P.", tone: "#fb923c" },
    { value: "customer", label: "Customer", tone: "#34d399" },
    { value: "subscriber", label: "Subscriber", tone: "#d4ff2a" },
  ],
  b2b: [
    { value: "visitor", label: "Lead", tone: "#94a3b8" },
    { value: "prospect", label: "Contacted", tone: "#38bdf8" },
    { value: "prime_prospect", label: "Qualified", tone: "#fb923c" },
    { value: "customer", label: "Won", tone: "#34d399" },
    { value: "subscriber", label: "Renewed", tone: "#d4ff2a" },
  ],
  investor: [
    { value: "visitor", label: "Sourced", tone: "#94a3b8" },
    { value: "prospect", label: "Intro", tone: "#38bdf8" },
    { value: "prime_prospect", label: "Diligence", tone: "#fb923c" },
    { value: "customer", label: "Committed", tone: "#34d399" },
    { value: "subscriber", label: "Deployed", tone: "#d4ff2a" },
  ],
  fund: [
    { value: "visitor", label: "Sourced", tone: "#94a3b8" },
    { value: "prospect", label: "Intro", tone: "#38bdf8" },
    { value: "prime_prospect", label: "Diligence", tone: "#fb923c" },
    { value: "customer", label: "Committed", tone: "#34d399" },
    { value: "subscriber", label: "Deployed", tone: "#d4ff2a" },
  ],
};

function StageSelector({ customer, onMoved }) {
  const [busy, setBusy] = useState(false);
  const stages = STAGE_MAP[customer.category] || STAGE_MAP.b2c;
  const currentIdx = stages.findIndex((s) => s.value === customer.classification);

  const move = async (stageValue) => {
    if (stageValue === customer.classification || busy) return;
    setBusy(true);
    try {
      await api.patch(`/customers/${customer.id}`, { classification: stageValue });
      const label = stages.find((s) => s.value === stageValue)?.label || stageValue;
      toast.success(`Moved to ${label}`);
      onMoved?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to move");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border border-white/10 rounded-md p-3" data-testid="stage-selector">
      <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40 mb-2">
        pipeline stage
      </div>
      <div className="grid grid-cols-5 gap-1">
        {stages.map((s, i) => {
          const active = s.value === customer.classification;
          const past = i < currentIdx;
          return (
            <button
              key={s.value}
              data-testid={`stage-${s.value}`}
              onClick={() => move(s.value)}
              disabled={busy}
              className={`text-left px-2 py-1.5 rounded border transition ${
                active
                  ? "border-white/50 bg-white/[0.08]"
                  : past
                  ? "border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-100 hover:bg-white/[0.05]"
                  : "border-white/[0.06] hover:bg-white/[0.05]"
              }`}
              style={active ? { borderTopWidth: 2, borderTopColor: s.tone } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: s.tone, opacity: active ? 1 : 0.5 }}
                />
                <span className={`text-[10.5px] font-mono uppercase tracking-wider truncate ${active ? "text-white/95 font-bold" : "text-white/60"}`}>
                  {s.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ACTIVITY_META = {
  stage_changed: { label: "Stage changed", tone: "#d4ff2a" },
  edit: { label: "Edited", tone: "#94a3b8" },
  note_added: { label: "Note added", tone: "#38bdf8" },
  task_created: { label: "Task created", tone: "#fb923c" },
  document_attached: { label: "Document attached", tone: "#8b5cf6" },
  reminder_scheduled: { label: "Reminder scheduled", tone: "#f472b6" },
  reminder_sent: { label: "Reminder sent", tone: "#34d399" },
  reminder_failed: { label: "Reminder failed", tone: "#ef4444" },
  reminder_cancelled: { label: "Reminder cancelled", tone: "#94a3b8" },
  message_sent: { label: "Message sent", tone: "#34d399" },
};

function HistoryPanel({ data }) {
  // Merge every kind of activity with a single sortable timestamp.
  const rows = [];
  for (const a of data.activity || []) {
    rows.push({
      key: `a-${a.id}`,
      at: a.at,
      kind: a.kind,
      title: ACTIVITY_META[a.kind]?.label || a.kind,
      detail: a.detail,
      actor: a.actor,
      tone: ACTIVITY_META[a.kind]?.tone || "#94a3b8",
    });
  }
  // Include journey events (visits, orders, etc.) too — they don't hit activity_log.
  for (const e of data.events || []) {
    rows.push({
      key: `e-${e.id}`,
      at: e.at,
      kind: "journey",
      title: e.type.replace(/_/g, " "),
      detail: e.detail || "",
      actor: "system",
      tone: "#64748b",
    });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  if (!rows.length) {
    return (
      <div className="mt-5 text-sm text-white/40 font-mono">
        Nothing recorded yet. Every note, task, edit, reminder and message will show up here.
      </div>
    );
  }

  return (
    <div className="mt-5" data-testid="history-panel">
      <div className="pl-6 border-l border-white/10 space-y-4">
        {rows.map((r) => (
          <div key={r.key} className="relative">
            <span
              className="absolute -left-[26px] top-1.5 w-2 h-2 rounded-full"
              style={{ background: r.tone, boxShadow: `0 0 0 3px rgba(0,0,0,1), 0 0 0 5px ${r.tone}22` }}
            />
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[13px] font-medium capitalize">{r.title}</div>
              <div className="text-[10.5px] font-mono text-white/40 shrink-0">
                {fmtDateTime(r.at)}
              </div>
            </div>
            {r.detail && (
              <div className="text-[12px] text-white/60 mt-0.5">{r.detail}</div>
            )}
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/35 mt-0.5">
              by {r.actor}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-[10.5px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function BulkSendDialog({ open, onOpenChange, customerIds, onDone }) {
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!message.trim()) return toast.error("Message can't be empty");
    setBusy(true);
    try {
      const { data } = await api.post("/customers/bulk_send", {
        customer_ids: customerIds,
        channel,
        subject,
        message: message.trim(),
      });
      const t = data.totals || {};
      toast.success(
        `Sent ${t.sent || 0} · simulated ${t.simulated || 0} · failed ${t.failed || 0}` +
          (t.skipped ? ` · skipped ${t.skipped}` : ""),
      );
      setMessage("");
      setSubject("");
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="bulk-send-dialog"
        className="bg-[color:var(--vc-surface)] border-white/10 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="font-display font-black">
            Send to {customerIds.length} {customerIds.length === 1 ? "contact" : "contacts"}
          </DialogTitle>
          <DialogDescription className="text-white/60 text-sm">
            One message, delivered to every selected contact via the chosen channel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-3 gap-2">
            {["email", "sms", "whatsapp"].map((ch) => (
              <button
                key={ch}
                data-testid={`bulk-channel-${ch}`}
                onClick={() => setChannel(ch)}
                className={`px-3 py-2 rounded border text-sm capitalize ${
                  channel === ch
                    ? "border-white/40 bg-white/[0.06]"
                    : "border-white/10 hover:bg-white/[0.03]"
                }`}
              >
                {ch === "email" && <Mail className="inline w-3.5 h-3.5 mr-1.5" />}
                {ch === "sms" && <Phone className="inline w-3.5 h-3.5 mr-1.5" />}
                {ch === "whatsapp" && <MessageSquare className="inline w-3.5 h-3.5 mr-1.5" />}
                {ch}
              </button>
            ))}
          </div>
          {channel === "email" && (
            <Input
              data-testid="bulk-subject"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-black/40 border-white/10"
            />
          )}
          <Textarea
            data-testid="bulk-message"
            rows={6}
            placeholder="Type the message once — it goes to every selected contact."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-black/40 border-white/10"
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="bulk-send-submit"
            onClick={send}
            disabled={busy}
            className="bg-white text-black hover:bg-white/90"
          >
            {busy ? "Sending…" : `Send to ${customerIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkTasksDialog({ open, onOpenChange, customerIds, onDone }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      const { data } = await api.post("/customers/bulk_tasks", {
        customer_ids: customerIds,
        title: title.trim(),
        description,
        priority,
        assignee: assignee || undefined,
        due_date: dueDate || undefined,
      });
      toast.success(`Created ${data.created} task${data.created === 1 ? "" : "s"}`);
      setTitle("");
      setDescription("");
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="bulk-tasks-dialog"
        className="bg-[color:var(--vc-surface)] border-white/10 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="font-display font-black">
            Create tasks for {customerIds.length} contact{customerIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="text-white/60 text-sm">
            One task per contact — each is auto-linked to its customer record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input
            data-testid="bulk-task-title"
            placeholder="Task title (same for all)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-black/40 border-white/10"
          />
          <Textarea
            data-testid="bulk-task-description"
            rows={3}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-black/40 border-white/10"
          />
          <div className="grid grid-cols-3 gap-2">
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger data-testid="bulk-task-priority" className="bg-black/40 border-white/10 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Input
              data-testid="bulk-task-assignee"
              placeholder="Assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="bg-black/40 border-white/10"
            />
            <Input
              data-testid="bulk-task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-black/40 border-white/10"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="bulk-tasks-submit"
            onClick={create}
            disabled={busy}
            className="bg-[color:var(--vc-lime)] text-black hover:bg-[color:var(--vc-lime)]/90"
          >
            {busy ? "Creating…" : `Create ${customerIds.length} task${customerIds.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

