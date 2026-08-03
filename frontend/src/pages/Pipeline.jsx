import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { CATEGORIES, CLASSIFICATIONS, ODOO_TAGS, fmtDate } from "@/lib/constants";
import { toast } from "sonner";
import { Kanban, Lock, User as UserIcon, Mail, Building2 } from "lucide-react";

// Retail pipeline uses the 5-stage classification directly.
// B2B / Investor / Institutional Clients pipelines re-label the same 5 stages to a sales-flavour vocabulary.
const RETAIL_STAGES = [
  { value: "visitor", label: "Visitor", tone: "#94a3b8" },
  { value: "prospect", label: "Prospect", tone: "#38bdf8" },
  { value: "prime_prospect", label: "Prime Prospect", tone: "#fb923c" },
  { value: "customer", label: "Customer", tone: "#34d399" },
  { value: "subscriber", label: "Subscriber", tone: "#d4ff2a" },
];

const B2B_STAGES = [
  { value: "visitor", label: "Lead", tone: "#94a3b8" },
  { value: "prospect", label: "Contacted", tone: "#38bdf8" },
  { value: "prime_prospect", label: "Qualified", tone: "#fb923c" },
  { value: "customer", label: "Won", tone: "#34d399" },
  { value: "subscriber", label: "Renewed", tone: "#d4ff2a" },
];

const INVESTOR_STAGES = [
  { value: "visitor", label: "Sourced", tone: "#94a3b8" },
  { value: "prospect", label: "Intro", tone: "#38bdf8" },
  { value: "prime_prospect", label: "Diligence", tone: "#fb923c" },
  { value: "customer", label: "Committed", tone: "#34d399" },
  { value: "subscriber", label: "Deployed", tone: "#d4ff2a" },
];

const PIPELINES = {
  b2c:      { label: "B2C",      stages: RETAIL_STAGES },
  b2b:      { label: "B2B",      stages: B2B_STAGES },
  investor: { label: "Investor", stages: INVESTOR_STAGES },
  institutional_clients: { label: "Institutional Clients", stages: INVESTOR_STAGES },
};

export default function Pipeline() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { format } = useCurrency();
  const isAdmin = user?.role === "admin";
  const [category, setCategory] = useState("b2c");
  const [tagFilter, setTagFilter] = useState("all");
  const [dropTarget, setDropTarget] = useState(null);

  const visibleCategories = CATEGORIES;

  const { data: rawCustomers = [] } = useQuery({
    queryKey: ["pipeline-customers", category, tagFilter],
    queryFn: async () =>
      (await api.get("/customers", { params: { category, tag: tagFilter === "all" ? undefined : tagFilter, limit: 500 } })).data,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const customers = Array.isArray(rawCustomers) ? rawCustomers : [];

  const pipeline = PIPELINES[category] || PIPELINES.b2c;

  const grouped = useMemo(() => {
    const g = Object.fromEntries(pipeline.stages.map((s) => [s.value, []]));
    for (const c of customers) {
      const k = pipeline.stages.some((s) => s.value === c.classification)
        ? c.classification
        : "visitor";
      g[k].push(c);
    }
    return g;
  }, [customers, pipeline]);

  const onDragStart = (e, cust) => {
    e.dataTransfer.setData("text/plain", cust.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== stage) setDropTarget(stage);
  };
  const onDragLeave = () => setDropTarget(null);
  const onDrop = async (e, newStage) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData("text/plain");
    const cust = customers.find((c) => c.id === id);
    if (!cust || cust.classification === newStage) return;
    // Optimistic update
    qc.setQueryData(["pipeline-customers", category], (prev) =>
      (prev || []).map((c) => (c.id === id ? { ...c, classification: newStage } : c)),
    );
    try {
      await api.patch(`/customers/${id}`, { classification: newStage });
      const label = pipeline.stages.find((s) => s.value === newStage)?.label || newStage;
      toast.success(`${cust.name} → ${label}`);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to move");
      // Rollback
      qc.invalidateQueries({ queryKey: ["pipeline-customers", category] });
    }
  };

  const isConsumer = category === "b2c";

  return (
    <div className="p-8 space-y-6" data-testid="pipeline-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/40">
            <Kanban className="w-3 h-3" />
            pipeline
            {!isConsumer && (
              <>
                <span className="text-white/20">·</span>
                <span className="inline-flex items-center gap-1 text-[color:var(--vc-lime)]">
                  <Lock className="w-3 h-3" /> restricted
                </span>
              </>
            )}
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            {pipeline.label}{" "}
            <span className="text-white/40">pipeline · {customers.length}</span>
          </h1>
        </div>
      </div>

      {/* Category picker & Tag Filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1">
          {visibleCategories.map((c) => (
            <button
              key={c.value}
              data-testid={`pipeline-cat-${c.value}`}
              onClick={() => setCategory(c.value)}
              className={`text-left px-3.5 py-3 rounded-md border transition-colors ${
                category === c.value
                  ? "border-white/30 bg-white/[0.06]"
                  : "border-white/[0.08] hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-base">{c.label}</span>
                {c.value !== "b2c" && <Lock className="w-3 h-3 text-white/30" />}
              </div>
              <div className="text-[11.5px] text-white/50 mt-0.5">{c.desc}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 shrink-0">
          <span className="text-xs font-mono text-white/50 uppercase">Filter Tag:</span>
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
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {pipeline.stages.map((s) => {
          const rows = grouped[s.value] || [];
          const isTarget = dropTarget === s.value;
          return (
            <div
              key={s.value}
              data-testid={`pipeline-col-${s.value}`}
              onDragOver={(e) => onDragOver(e, s.value)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, s.value)}
              className={`border rounded-md bg-[color:var(--vc-surface)] transition-colors ${
                isTarget
                  ? "border-[color:var(--vc-lime)] shadow-[0_0_0_2px_rgba(212,255,42,0.25)]"
                  : "border-white/[0.08]"
              }`}
            >
              <div
                className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between"
                style={{ borderTop: `2px solid ${s.tone}` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: s.tone }}
                  />
                  <span className="text-[11px] font-mono uppercase tracking-widest text-white/85">
                    {s.label}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-white/50">{rows.length}</span>
              </div>
              <div className="p-2 space-y-1.5 min-h-[240px]">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    data-testid={`pipeline-card-${r.id}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, r)}
                    className="cursor-grab active:cursor-grabbing border border-white/[0.08] rounded p-2.5 bg-white/[0.02] hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-display font-bold text-[11px]">
                          {r.name?.[0] || "?"}
                        </div>
                      )}
                      <div className="text-[12.5px] font-medium truncate flex-1">{r.name}</div>
                    </div>
                    {isConsumer ? (
                      <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-mono text-white/50">
                        <span>{r.total_orders || 0} orders</span>
                        <span>{format(r.total_spent || 0, { digits: 0 })}</span>
                      </div>
                    ) : (
                      <>
                        {r.company && (
                          <div className="mt-1 text-[11px] text-white/60 truncate inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-white/40" />
                            {r.company}
                          </div>
                        )}
                        {r.email && (
                          <div className="mt-0.5 text-[10.5px] font-mono text-white/40 truncate inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {r.email}
                          </div>
                        )}
                      </>
                    )}
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-white/35">
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="w-2.5 h-2.5" />
                        {r.owner || "—"}
                      </span>
                      <span>{fmtDate(r.created_at)}</span>
                    </div>
                  </div>
                ))}
                {rows.length === 0 && (
                  <div className="text-[11px] font-mono text-white/30 text-center py-6">
                    empty — drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
