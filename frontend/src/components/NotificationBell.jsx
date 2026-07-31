import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { relTime } from "@/lib/constants";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Check, UserPlus, ClipboardCheck, MessageSquarePlus, Zap } from "lucide-react";

const KIND_META = {
  task_assigned: { icon: ClipboardCheck, color: "#0057FF" },
  task_updated: { icon: Zap, color: "#facc15" },
  task_followup: { icon: MessageSquarePlus, color: "#38bdf8" },
  task_closed: { icon: Check, color: "#34d399" },
  user_created: { icon: UserPlus, color: "#d4ff2a" },
};

export default function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 15000,
  });

  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    await api.post("/notifications/read-all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const markOne = async (id) => {
    await api.post(`/notifications/${id}/read`);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="notification-bell"
          className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span
              data-testid="notification-badge"
              className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[color:var(--vc-lime)] text-black text-[10px] font-bold flex items-center justify-center font-mono"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-0 bg-[color:var(--vc-surface)] border-white/10"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div>
            <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
              notifications
            </div>
            <div className="font-display font-bold text-lg">Inbox</div>
          </div>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={markAll}
              data-testid="mark-all-read"
              className="text-white/60 hover:text-white text-xs"
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.map((n) => {
            const M = KIND_META[n.kind] || KIND_META.task_updated;
            const Icon = M.icon;
            return (
              <button
                key={n.id}
                data-testid={`notif-${n.id}`}
                onClick={() => markOne(n.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${
                  !n.read ? "bg-white/[0.02]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center border shrink-0"
                    style={{
                      background: `${M.color}20`,
                      borderColor: `${M.color}55`,
                      color: M.color,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium flex items-start justify-between gap-2">
                      <span className="truncate">{n.title}</span>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--vc-lime)] shrink-0 mt-1.5" />
                      )}
                    </div>
                    {n.body && (
                      <div className="text-[11.5px] text-white/50 mt-0.5">{n.body}</div>
                    )}
                    <div className="text-[10.5px] font-mono text-white/40 mt-1">
                      → {n.recipient} · {relTime(n.at)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="p-8 text-center text-white/40 font-mono text-sm">
              You're all caught up.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
