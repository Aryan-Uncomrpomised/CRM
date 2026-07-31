import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { CATEGORIES, TASK_STATUS, fmtDate, relTime } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  User as UserIcon,
  CheckSquare,
  BarChart3,
  Search as SearchIcon,
  FileText,
  AlertCircle,
  ArrowRight,
  Building2,
  Flag,
  Loader2,
  ChevronRight,
} from "lucide-react";

const SUGGESTIONS = [
  {
    label: "Create investor",
    prompt:
      "Create this contact <Akhilesh Pandey, M: 1234567890; email: akpandey@pandey.com> as a potential investor. I have given him 2-3 land deals to choose from and 2 Cr deployment for development; proposals are attached.",
    icon: UserIcon,
  },
  {
    label: "Assign a task",
    prompt:
      "Ask Meera to schedule a call with Akhilesh Pandey by next Wednesday, high priority — walk him through the land deals.",
    icon: CheckSquare,
  },
  {
    label: "Cohort query",
    prompt: "Show me a cohort of all new customers acquired in May 2026",
    icon: BarChart3,
  },
  {
    label: "Snapshot",
    prompt: "Give me a snapshot of the CRM right now.",
    icon: SearchIcon,
  },
];

const ACTION_META = {
  create_contact: { label: "Create contact", icon: UserIcon, color: "#0057FF" },
  create_task: { label: "Create task", icon: CheckSquare, color: "#d4ff2a" },
  query_customers: { label: "Query contacts", icon: SearchIcon, color: "#38bdf8" },
  query_tasks: { label: "Query tasks", icon: SearchIcon, color: "#facc15" },
  query_stats: { label: "Snapshot", icon: BarChart3, color: "#34d399" },
  link_document: { label: "Link document", icon: FileText, color: "#fb923c" },
  unsupported: { label: "Not supported", icon: AlertCircle, color: "#f87171" },
};

export default function Home() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState([]); // most-recent first
  const bottomRef = useRef(null);

  const { data: history = [] } = useQuery({
    queryKey: ["copilot-history"],
    queryFn: async () => (await api.get("/copilot/history?limit=10")).data,
  });

  useEffect(() => {
    if (feed.length && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [feed.length]);

  // Send the last 3 executed exchanges as follow-up context so the model can
  // resolve pronouns like "him", "her", "that deal" across turns.
  const buildContext = () =>
    feed
      .filter((e) => e.status === "done" && e.action && e.action !== "unsupported")
      .slice(0, 3)
      .map((e) => ({
        prompt: e.prompt,
        action: e.action,
        params: e.plan?.params || {},
      }))
      .reverse();

  const run = async (text) => {
    const q = (text ?? prompt).trim();
    if (!q) return;
    setBusy(true);
    const entry = { id: Date.now(), prompt: q, at: new Date().toISOString(), status: "pending" };
    setFeed((f) => [entry, ...f]);
    setPrompt("");
    try {
      const { data } = await api.post("/copilot/execute", { prompt: q, context: buildContext() });
      const status = data.needs_confirmation ? "preview" : "done";
      setFeed((f) => f.map((e) => (e.id === entry.id ? { ...e, ...data, status } : e)));
      if (data.needs_confirmation) {
        toast.message("Confirmation required", {
          description: data.confirm_reason || "Review before running",
        });
      } else {
        // Refresh downstream data
        qc.invalidateQueries({ queryKey: ["customers"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        qc.invalidateQueries({ queryKey: ["documents"] });
        qc.invalidateQueries({ queryKey: ["copilot-history"] });
        toast.success(data.summary || "Done");
      }
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail) || "Copilot failed";
      setFeed((f) =>
        f.map((e) =>
          e.id === entry.id
            ? { ...e, status: "error", result: { ok: false, reason: msg } }
            : e,
        ),
      );
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const confirmEntry = async (entry) => {
    setFeed((f) => f.map((e) => (e.id === entry.id ? { ...e, status: "pending" } : e)));
    try {
      const { data } = await api.post("/copilot/confirm", {
        action: entry.action,
        params: entry.plan?.params || {},
        original_prompt: entry.prompt,
      });
      setFeed((f) =>
        f.map((e) =>
          e.id === entry.id
            ? { ...e, result: data.result, status: "done", needs_confirmation: false }
            : e,
        ),
      );
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["copilot-history"] });
      toast.success(entry.summary || "Confirmed & executed");
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail) || "Failed to confirm";
      setFeed((f) =>
        f.map((e) =>
          e.id === entry.id
            ? { ...e, status: "error", result: { ok: false, reason: msg } }
            : e,
        ),
      );
      toast.error(msg);
    }
  };

  const discardEntry = (entry) => {
    setFeed((f) => f.filter((e) => e.id !== entry.id));
    toast.message("Discarded");
  };

  const onKey = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    }
  };

  const first = feed.length === 0;

  return (
    <div className="min-h-full flex flex-col" data-testid="home-page">
      <div className="p-8 pb-4">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-[color:var(--vc-lime)]">
          <Sparkles className="w-3.5 h-3.5" /> command copilot
        </div>
        <h1 className="font-display font-black text-5xl mt-2 tracking-tight leading-[0.95]">
          Hey <span className="text-[color:var(--vc-lime)]">{user?.name?.split(" ")[0] || "there"}</span>.
          <br />
          <span className="text-white/40">Just tell me what to do.</span>
        </h1>
        <p className="text-white/50 text-sm mt-3 max-w-2xl">
          Describe what you want in plain English — create contacts, delegate
          tasks, or pull cohorts. Voyage figures it out and does it.
        </p>
      </div>

      <div className="px-8">
        <div className="border border-white/[0.10] rounded-xl bg-[color:var(--vc-surface)] p-2 relative">
          <Textarea
            data-testid="copilot-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKey}
            placeholder="e.g. Create Priya Sharma as a B2B contact from Bombay Retail Group, she wants a bulk pricing quote for 200 units — assign to Aisha with due date next Monday."
            rows={3}
            className="bg-transparent border-0 focus-visible:ring-0 text-[15px] resize-none px-3 py-2"
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="text-[10.5px] font-mono text-white/40">
              powered by claude sonnet · ⌘/Ctrl + Enter to send
            </div>
            <Button
              data-testid="copilot-submit"
              onClick={() => run()}
              disabled={busy || !prompt.trim()}
              className="bg-white text-black hover:bg-white/90 h-9"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> thinking…
                </>
              ) : (
                <>
                  Run <Send className="w-3.5 h-3.5 ml-1.5" />
                </>
              )}
            </Button>
          </div>
        </div>

        {first && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                data-testid={`suggest-${s.label.replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => {
                  setPrompt(s.prompt);
                  run(s.prompt);
                }}
                className="text-left border border-white/[0.08] rounded-md p-3 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-widest text-white/50">
                  <s.icon className="w-3 h-3" /> {s.label}
                </div>
                <div className="text-[12px] text-white/75 mt-1.5 line-clamp-3">{s.prompt}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 px-8 pt-6 pb-10 space-y-4">
        <div ref={bottomRef} />
        {feed.map((e) => (
          <FeedEntry
            key={e.id}
            entry={e}
            format={format}
            onConfirm={confirmEntry}
            onDiscard={discardEntry}
          />
        ))}

        {feed.length === 0 && history.length > 0 && (
          <div className="mt-6">
            <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40 mb-2">
              recent
            </div>
            <div className="space-y-2">
              {history.slice(0, 5).map((h) => (
                <button
                  key={h.id}
                  data-testid={`history-${h.id}`}
                  onClick={() => {
                    setPrompt(h.prompt);
                    run(h.prompt);
                  }}
                  className="w-full text-left border border-white/[0.06] rounded p-3 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center justify-between text-[10.5px] font-mono text-white/40">
                    <span>{h.plan?.action || "—"}</span>
                    <span>{relTime(h.at)}</span>
                  </div>
                  <div className="text-[13px] text-white/80 mt-1 line-clamp-2">{h.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedEntry({ entry, format, onConfirm, onDiscard }) {
  const action = entry.action || entry.plan?.action || "unsupported";
  const M = ACTION_META[action] || ACTION_META.unsupported;
  const Icon = M.icon;
  const isError = entry.status === "error" || entry.result?.ok === false;
  const isPreview = entry.status === "preview" && entry.needs_confirmation;

  return (
    <div
      data-testid={`feed-${entry.id}`}
      className="border border-white/[0.08] rounded-lg bg-[color:var(--vc-surface)] overflow-hidden"
    >
      {/* Prompt */}
      <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-widest text-white/40">
          <span>you asked</span>
          <span>·</span>
          <span>{relTime(entry.at)}</span>
        </div>
        <div className="text-[14px] text-white/90 mt-1">{entry.prompt}</div>
      </div>

      {/* Status header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.05]">
        {entry.status === "pending" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white/40" />
            <span className="text-[13px] text-white/60 font-mono">planning…</span>
          </>
        ) : (
          <>
            <div
              className="w-7 h-7 rounded flex items-center justify-center border"
              style={{
                background: `${M.color}20`,
                borderColor: `${M.color}55`,
                color: M.color,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1">
              <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/50">
                {isPreview ? `${M.label} — needs confirmation` : M.label}
              </div>
              <div className="text-[13.5px] text-white/85 mt-0.5">
                {entry.summary || (isError ? entry.result?.reason : "")}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirm banner */}
      {isPreview && (
        <div
          data-testid={`confirm-banner-${entry.id}`}
          className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/[0.06] flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-mono uppercase tracking-widest text-amber-300/80">
              confirm before running
            </div>
            <div className="text-[13px] text-white/85 mt-1">
              {entry.confirm_reason || "This action is high-value — please review the details below and confirm."}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              data-testid={`confirm-run-${entry.id}`}
              onClick={() => onConfirm?.(entry)}
              className="h-8 bg-[color:var(--vc-lime)] text-black hover:bg-[color:var(--vc-lime)]/90"
            >
              Confirm & run
            </Button>
            <Button
              data-testid={`confirm-discard-${entry.id}`}
              variant="ghost"
              onClick={() => onDiscard?.(entry)}
              className="h-8 text-white/60 hover:text-white/90"
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Result body */}
      {entry.status !== "pending" && (
        <div className="px-4 py-4">
          {isPreview ? (
            <PreviewView action={action} params={entry.plan?.params || {}} />
          ) : (
            <ResultView action={action} result={entry.result} plan={entry.plan} format={format} />
          )}
        </div>
      )}
    </div>
  );
}

function PreviewView({ action, params }) {
  const entries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) {
    return <div className="text-[13px] text-white/50 font-mono">No parameters to preview.</div>;
  }
  return (
    <div className="border border-white/[0.06] rounded overflow-hidden">
      <div className="px-3 py-2 text-[10.5px] font-mono uppercase tracking-widest text-white/40 bg-white/[0.02] border-b border-white/[0.06]">
        planned {action.replace(/_/g, " ")}
      </div>
      <div className="divide-y divide-white/[0.05]">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[140px_1fr] px-3 py-2 text-[13px]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-white/40">
              {k.replace(/_/g, " ")}
            </div>
            <div className="text-white/85 break-words">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultView({ action, result, plan, format }) {
  if (!result) return null;
  if (result.ok === false) {
    return (
      <div className="flex items-start gap-2 text-[13px] text-red-300">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        {result.reason || "Nothing to do."}
      </div>
    );
  }

  if (action === "create_contact") {
    const c = result.contact;
    if (!c) return null;
    const cat = CATEGORIES.find((x) => x.value === c.category);
    return (
      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-display font-bold">
              {c.name?.[0] || "?"}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-lg leading-tight">{c.name}</div>
              <div className="text-[12px] font-mono text-white/60 truncate">{c.email}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={`classification-tag tag-${c.classification}`}>
              {c.classification.replace("_", " ")}
            </span>
            <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 rounded">
              {cat?.label || c.category}
            </span>
          </div>
        </div>
        <div className="space-y-2 text-[13px]">
          {c.company && (
            <div>
              <span className="text-white/40 font-mono text-[11px] uppercase tracking-wider mr-2">
                company
              </span>
              {c.company}
            </div>
          )}
          {c.phone && (
            <div>
              <span className="text-white/40 font-mono text-[11px] uppercase tracking-wider mr-2">
                phone
              </span>
              {c.phone}
            </div>
          )}
          {c.notes && (
            <div className="text-white/70 border-l-2 border-white/10 pl-3">{c.notes}</div>
          )}
        </div>
      </div>
    );
  }

  if (action === "create_task") {
    const t = result.task;
    if (!t) return null;
    return (
      <div className="space-y-2">
        <div className="font-display font-bold text-base">{t.title}</div>
        {t.description && <div className="text-[13px] text-white/70">{t.description}</div>}
        <div className="flex flex-wrap items-center gap-3 text-[12px] pt-2">
          <span className="inline-flex items-center gap-1 text-white/70">
            <UserIcon className="w-3 h-3 text-white/40" /> {t.assignee}
          </span>
          <span className="inline-flex items-center gap-1">
            <Flag className="w-3 h-3" style={{ color: "#fb923c" }} />
            <span className="uppercase font-mono text-[10.5px] text-white/70">{t.priority}</span>
          </span>
          {t.due_date && (
            <span className="font-mono text-[11.5px] text-white/60">due {fmtDate(t.due_date)}</span>
          )}
          {t.related_customer_name && (
            <span className="text-[11.5px] text-white/60">
              ↳ {t.related_customer_name}
            </span>
          )}
          {t.tags?.length > 0 &&
            t.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-white/[0.10] bg-white/[0.03] rounded text-white/60"
              >
                {tag}
              </span>
            ))}
        </div>
      </div>
    );
  }

  if (action === "query_customers" || action === "query_tasks") {
    const rows = result.rows || [];
    return (
      <div>
        <div className="text-[12px] font-mono text-white/60 mb-2">
          <span className="text-[color:var(--vc-lime)] font-bold">{result.count}</span>{" "}
          match{result.count === 1 ? "" : "es"}
          {rows.length < (result.count || 0) && (
            <span className="text-white/40"> · showing top {rows.length}</span>
          )}
        </div>
        <div className="border border-white/[0.06] rounded overflow-hidden">
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-3 py-2 border-b border-white/[0.04] last:border-0 text-[13px]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name || r.title}</div>
                <div className="text-[11px] text-white/40 truncate">
                  {r.email || r.description || ""}
                </div>
              </div>
              <div className="text-[11.5px] font-mono text-white/60">
                {r.category || r.status || ""}
              </div>
              <div className="text-[11.5px] font-mono text-white/60">
                {r.classification || r.assignee || ""}
              </div>
              <div className="text-[11.5px] font-mono text-white/50 text-right">
                {r.total_spent
                  ? format(r.total_spent, { digits: 0 })
                  : r.created_at
                    ? fmtDate(r.created_at)
                    : ""}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-6 text-center text-white/40 font-mono text-sm">
              No matching records.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (action === "query_stats") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Total contacts" value={result.total_customers} />
        <StatTile label="Open tasks" value={result.open_tasks} />
        {Object.entries(result.by_category || {}).map(([k, v]) => (
          <StatTile key={k} label={k} value={v} />
        ))}
      </div>
    );
  }

  if (action === "link_document") {
    const d = result.document;
    if (!d) return null;
    return (
      <div className="space-y-1">
        <div className="font-display font-bold text-base">{d.name}</div>
        <div className="text-[12px] text-white/50 font-mono">
          {d.kind} · {d.source} · {d.category}
        </div>
        {d.url && (
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12.5px] text-sky-300 hover:text-sky-200 inline-flex items-center gap-1"
          >
            open <ArrowRight className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  return null;
}

function StatTile({ label, value }) {
  return (
    <div className="border border-white/[0.08] rounded p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-display font-black text-2xl mt-1">{value}</div>
    </div>
  );
}
