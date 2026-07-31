import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { TASK_STATUS, TASK_PRIORITY, fmtDate, fmtDateTime, relTime } from "@/lib/constants";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Clock,
  Pause,
  MessageSquarePlus,
  User,
  Flag,
  CalendarDays,
  LayoutList,
  LayoutGrid,
} from "lucide-react";

const STATUS_META = {
  open: { label: "Open", icon: CheckSquare, cls: "border-white/20 text-white/80" },
  in_progress: {
    label: "In progress",
    icon: Clock,
    cls: "border-sky-800 bg-sky-950/40 text-sky-300",
  },
  waiting: {
    label: "Waiting",
    icon: Pause,
    cls: "border-amber-800 bg-amber-950/40 text-amber-300",
  },
  done: { label: "Done", icon: Check, cls: "border-emerald-800 bg-emerald-950/40 text-emerald-300" },
};

const PRIORITY_META = {
  low: { color: "#a1a1aa" },
  medium: { color: "#38bdf8" },
  high: { color: "#fb923c" },
  urgent: { color: "#f87171" },
};

export default function Tasks() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [tagFilter, setTagFilter] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem("voyage.tasks.view") || "list");
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const setViewPersist = (v) => {
    setView(v);
    localStorage.setItem("voyage.tasks.view", v);
  };

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", status, assignee, view],
    queryFn: async () =>
      (
        await api.get("/tasks", {
          params: {
            status: view === "kanban" || status === "all" ? undefined : status,
            assignee: assignee === "all" ? undefined : assignee,
          },
        })
      ).data,
  });

  const tasks = tagFilter
    ? allTasks.filter((t) => (t.tags || []).includes(tagFilter))
    : allTasks;

  // Drag handlers
  const onDragStart = (e, task) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e, colStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== colStatus) setDragOverCol(colStatus);
  };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain");
    const task = allTasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Moved to ${STATUS_META[newStatus]?.label || newStatus}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const { data: team = [] } = useQuery({
    queryKey: ["team"],
    queryFn: async () => (await api.get("/team")).data,
  });

  const counts = {
    open: tasks.filter((t) => t.status === "open").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    waiting: tasks.filter((t) => t.status === "waiting").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="p-8 space-y-6" data-testid="tasks-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            internal
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Team <span className="text-white/40">tasks</span>
          </h1>
          <p className="text-white/50 text-sm mt-2 max-w-xl">
            Every internal task treated like a customer — assign, update, follow
            up, close.
          </p>
        </div>
        <Button
          data-testid="new-task-button"
          onClick={() => setShowNew(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New task
        </Button>
      </div>

      {/* Status KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TASK_STATUS.map((s) => {
          const M = STATUS_META[s.value];
          const Icon = M.icon;
          return (
            <button
              key={s.value}
              data-testid={`status-tile-${s.value}`}
              onClick={() => setStatus(s.value === status ? "all" : s.value)}
              className={`border rounded-md p-4 text-left transition-colors ${
                status === s.value
                  ? "border-white/30 bg-white/[0.05]"
                  : "border-white/[0.08] hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                  {s.label}
                </span>
                <Icon className="w-3.5 h-3.5 text-white/40" />
              </div>
              <div className="font-display font-black text-3xl mt-2 tracking-tight">
                {counts[s.value]}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {view === "list" && (
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList className="bg-white/[0.03] border border-white/10">
              <TabsTrigger value="all" data-testid="tab-all-status">All</TabsTrigger>
              {TASK_STATUS.map((s) => (
                <TabsTrigger key={s.value} value={s.value} data-testid={`tab-${s.value}`}>
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger
            data-testid="assignee-filter"
            className="w-52 bg-white/[0.03] border-white/10 h-9 text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {team.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto inline-flex border border-white/[0.08] rounded overflow-hidden">
          <button
            data-testid="view-list"
            onClick={() => setViewPersist("list")}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium ${
              view === "list" ? "bg-white/[0.08] text-white" : "text-white/50 hover:bg-white/[0.03]"
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" /> List
          </button>
          <button
            data-testid="view-kanban"
            onClick={() => setViewPersist("kanban")}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium border-l border-white/[0.08] ${
              view === "kanban" ? "bg-white/[0.08] text-white" : "text-white/50 hover:bg-white/[0.03]"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Kanban
          </button>
        </div>
      </div>

      {tagFilter && (
        <div
          data-testid="tag-filter-active"
          className="inline-flex items-center gap-2 border border-[color:var(--vc-lime)]/40 bg-[color:var(--vc-lime)]/10 rounded px-3 py-1.5"
        >
          <span className="text-[10.5px] font-mono uppercase tracking-widest text-white/50">
            filtering by tag
          </span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--vc-lime)] font-bold">
            #{tagFilter}
          </span>
          <button
            onClick={() => setTagFilter(null)}
            data-testid="tag-filter-clear"
            className="text-white/60 hover:text-white text-[11px] font-mono ml-1"
          >
            × clear
          </button>
        </div>
      )}

      {view === "list" ? (
        <div className="border border-white/[0.08] rounded-md overflow-hidden bg-[color:var(--vc-surface)]">
          <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr] text-[10.5px] font-mono uppercase tracking-widest text-white/40 px-4 py-2.5 border-b border-white/[0.06]">
            <div>Task</div>
            <div>Assignee</div>
            <div>Priority</div>
            <div>Due</div>
            <div>Status</div>
          </div>
          {tasks.map((t) => {
            const SM = STATUS_META[t.status] || STATUS_META.open;
            const SIcon = SM.icon;
            return (
              <button
                key={t.id}
                onClick={() => setOpenId(t.id)}
                data-testid={`row-task-${t.id}`}
                className="w-full grid grid-cols-[3fr_1fr_1fr_1fr_1fr] items-center px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] text-left"
              >
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate">{t.title}</div>
                  <div className="text-[11.5px] text-white/40 truncate">
                    {t.related_customer_name
                      ? `↳ linked to ${t.related_customer_name}`
                      : t.description || "—"}
                  </div>
                  {t.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.tags.slice(0, 4).map((tag) => (
                        <button
                          key={tag}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTagFilter(tag);
                          }}
                          data-testid={`row-tag-${t.id}-${tag}`}
                          className={`text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors ${
                            tagFilter === tag
                              ? "border-[color:var(--vc-lime)] bg-[color:var(--vc-lime)]/15 text-[color:var(--vc-lime)]"
                              : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/30 hover:text-white"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px]">
                  <User className="w-3 h-3 text-white/40" /> {t.assignee}
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px]">
                  <Flag
                    className="w-3 h-3"
                    style={{ color: PRIORITY_META[t.priority]?.color }}
                  />
                  <span className="uppercase font-mono text-[11px]">{t.priority}</span>
                </div>
                <div className="font-mono text-[12px] text-white/60">{fmtDate(t.due_date)}</div>
                <div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${SM.cls}`}
                  >
                    <SIcon className="w-3 h-3" /> {SM.label}
                  </span>
                </div>
              </button>
            );
          })}
          {tasks.length === 0 && (
            <div className="p-16 text-center text-white/40 font-mono text-sm">
              No tasks match. Create one to get started.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {TASK_STATUS.map((s) => {
            const SM = STATUS_META[s.value];
            const SIcon = SM.icon;
            const colTasks = tasks.filter((t) => t.status === s.value);
            const isOver = dragOverCol === s.value;
            return (
              <div
                key={s.value}
                data-testid={`kanban-col-${s.value}`}
                onDragOver={(e) => onDragOver(e, s.value)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, s.value)}
                className={`border rounded-md flex flex-col min-h-[400px] transition-colors ${
                  isOver
                    ? "border-[color:var(--vc-lime)] bg-[color:var(--vc-lime)]/[0.04]"
                    : "border-white/[0.08] bg-[color:var(--vc-surface)]"
                }`}
              >
                <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SIcon className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-[11px] font-mono uppercase tracking-widest text-white/60">
                      {s.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-white/40">{colTasks.length}</span>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, t)}
                      onClick={() => setOpenId(t.id)}
                      data-testid={`kanban-task-${t.id}`}
                      className="w-full text-left border border-white/[0.08] bg-black/30 rounded p-3 hover:bg-white/[0.03] transition-colors cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[13px] font-medium leading-snug flex-1">{t.title}</div>
                        <Flag
                          className="w-3 h-3 shrink-0 mt-0.5"
                          style={{ color: PRIORITY_META[t.priority]?.color }}
                        />
                      </div>
                      {t.related_customer_name && (
                        <div className="text-[10.5px] text-white/50 mt-1 truncate">
                          ↳ {t.related_customer_name}
                        </div>
                      )}
                      {t.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {t.tags.slice(0, 3).map((tag) => (
                            <button
                              key={tag}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTagFilter(tag);
                              }}
                              data-testid={`kanban-tag-${t.id}-${tag}`}
                              className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border transition-colors ${
                                tagFilter === tag
                                  ? "border-[color:var(--vc-lime)] bg-[color:var(--vc-lime)]/15 text-[color:var(--vc-lime)]"
                                  : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white"
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.04]">
                        <div className="text-[10.5px] font-mono text-white/50 truncate">
                          {t.assignee}
                        </div>
                        <div className="text-[10px] font-mono text-white/40">
                          {t.due_date ? fmtDate(t.due_date) : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-[11px] font-mono text-white/30 py-8 text-center">
                      {isOver ? "drop here" : "—"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewTaskDialog
        open={showNew}
        onOpenChange={setShowNew}
        team={team}
        onCreated={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
      />
      <TaskDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        team={team}
        onChanged={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
        setTagFilter={setTagFilter}
      />
    </div>
  );
}

function NewTaskDialog({ open, onOpenChange, team, onCreated }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee: "Admin",
    priority: "medium",
    due_date: "",
    tags: [],
  });
  const submit = async () => {
    if (!form.title) return toast.error("Title is required");
    try {
      await api.post("/tasks", {
        ...form,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      });
      toast.success("Task created");
      onCreated();
      onOpenChange(false);
      setForm({ ...form, title: "", description: "", due_date: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            New task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-testid="nt-title"
            placeholder="Task title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Textarea
            data-testid="nt-desc"
            placeholder="What needs to happen?"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
              <SelectTrigger data-testid="nt-assignee" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {team.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger data-testid="nt-priority" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
              Due date
            </Label>
            <Input
              data-testid="nt-due"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="mt-1.5 bg-black/40 border-white/10"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="nt-submit"
            onClick={submit}
            className="bg-white text-black hover:bg-white/90"
          >
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDrawer({ id, onClose, team, onChanged, setTagFilter }) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const { data: task, refetch } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const all = (await api.get("/tasks")).data;
      return all.find((t) => t.id === id);
    },
    enabled: !!id,
  });

  const patch = async (p) => {
    await api.patch(`/tasks/${id}`, p);
    toast.success("Task updated");
    refetch();
    onChanged();
  };

  const addFollowup = async () => {
    if (!note.trim()) return;
    await api.post(`/tasks/${id}/followup`, { note, author: "Admin" });
    setNote("");
    toast.success("Follow-up added");
    refetch();
    onChanged();
  };

  const close = async () => {
    await api.post(`/tasks/${id}/close`);
    toast.success("Task closed");
    refetch();
    onChanged();
  };

  const del = async () => {
    if (!window.confirm("Delete this task?")) return;
    await api.delete(`/tasks/${id}`);
    toast.success("Task deleted");
    onChanged();
    onClose();
  };

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-[color:var(--vc-surface)] border-l border-white/10 overflow-y-auto"
        data-testid="task-drawer"
      >
        {task && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/40">
                <CheckSquare className="w-3.5 h-3.5" /> task
              </div>
              <SheetTitle className="font-display font-black text-2xl tracking-tight text-left">
                {task.title}
              </SheetTitle>
              {task.related_customer_name && (
                <SheetDescription className="text-left text-sm text-white/60">
                  Linked to <span className="text-white">{task.related_customer_name}</span>
                </SheetDescription>
              )}
              {task.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {task.tags.map((tag) => (
                    <button
                      key={tag}
                      data-testid={`drawer-tag-${tag}`}
                      onClick={() => {
                        setTagFilter(tag);
                        onClose();
                      }}
                      className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-white/[0.10] bg-white/[0.04] rounded text-white/70 hover:text-white hover:border-white/30 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </SheetHeader>

            {task.description && (
              <div className="mt-4 border border-white/10 rounded p-3 text-[13.5px] text-white/80">
                {task.description}
              </div>
            )}

            {task.owner && (
              <div className="mt-3 text-[11px] font-mono text-white/50">
                <span className="uppercase tracking-widest text-white/40">owner</span>{" "}
                <span className="text-white">{task.owner}</span>
                {task.owner !== task.assignee && (
                  <span className="text-white/40"> · delegated to {task.assignee}</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <Label className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                  Assignee
                </Label>
                <Select
                  value={task.assignee}
                  onValueChange={(v) => patch({ assignee: v })}
                >
                  <SelectTrigger data-testid="td-assignee" className="mt-1.5 bg-black/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {team.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                  Priority
                </Label>
                <Select value={task.priority} onValueChange={(v) => patch({ priority: v })}>
                  <SelectTrigger data-testid="td-priority" className="mt-1.5 bg-black/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITY.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                  Status
                </Label>
                <Select value={task.status} onValueChange={(v) => patch({ status: v })}>
                  <SelectTrigger data-testid="td-status" className="mt-1.5 bg-black/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                  Due
                </Label>
                <div className="mt-1.5 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white/80">
                  <CalendarDays className="w-3.5 h-3.5 inline mr-1.5 text-white/40" />
                  {fmtDate(task.due_date)}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                Follow-ups ({task.followups?.length || 0})
              </div>
              <div className="mt-3 space-y-2">
                {(task.followups || []).map((f) => (
                  <div key={f.id} className="border border-white/10 rounded p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-mono text-white/50">
                        {f.author}
                      </span>
                      <span className="text-[10.5px] font-mono text-white/40">
                        {relTime(f.at)}
                      </span>
                    </div>
                    <div className="text-[13px] text-white/80 mt-1">{f.note}</div>
                  </div>
                ))}
                {(task.followups || []).length === 0 && (
                  <div className="text-[13px] text-white/40 font-mono">
                    No follow-ups yet.
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Textarea
                  data-testid="td-followup-input"
                  placeholder="Add a follow-up note…"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="bg-black/40 border-white/10"
                />
                <Button
                  data-testid="td-followup-add"
                  onClick={addFollowup}
                  className="bg-[color:var(--vc-accent)] hover:bg-[color:var(--vc-accent-hover)] text-white shrink-0"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2">
              {task.status !== "done" && (
                <Button
                  data-testid="td-close"
                  onClick={close}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Check className="w-4 h-4 mr-1.5" /> Close task
                </Button>
              )}
              <Button
                data-testid="td-delete"
                onClick={del}
                variant="ghost"
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
              <div className="ml-auto text-[10.5px] font-mono text-white/40">
                updated {relTime(task.updated_at)}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
