import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { relTime, CHANNEL_META } from "@/lib/constants";
import { Mail, Phone, MessageSquare, Check, Clock, X } from "lucide-react";

const ICON = { email: Mail, sms: Phone, whatsapp: MessageSquare };
const STATUS_ICON = {
  sent: Check,
  simulated: Clock,
  queued: Clock,
  failed: X,
};

export default function Reminders() {
  const { data: rawRows = [] } = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => (await api.get("/reminders")).data,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const rows = Array.isArray(rawRows) ? rawRows : [];

  return (
    <div className="p-8 space-y-6" data-testid="reminders-page">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
          activity
        </div>
        <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
          Reminder <span className="text-white/40">log</span>
        </h1>
        <p className="text-white/50 mt-2 text-sm">
          Every reminder sent from the CRM — via email, SMS, or WhatsApp.
        </p>
      </div>

      <div className="border border-white/[0.08] rounded-md overflow-hidden bg-[color:var(--vc-surface)]">
        <div className="grid grid-cols-[1fr_2.5fr_1fr_1fr] text-[10.5px] font-mono uppercase tracking-widest text-white/40 px-4 py-2.5 border-b border-white/[0.06]">
          <div>Customer</div>
          <div>Message</div>
          <div>Channel</div>
          <div>Sent</div>
        </div>
        {rows.map((r) => {
          const Icon = ICON[r.channel] || Mail;
          const SIcon = STATUS_ICON[r.status] || Check;
          return (
            <div
              key={r.id}
              data-testid={`reminder-row-${r.id}`}
              className="grid grid-cols-[1fr_2.5fr_1fr_1fr] items-start px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <div className="text-[13.5px] font-medium truncate">{r.customer_name}</div>
              <div className="min-w-0">
                {r.subject && (
                  <div className="text-[13px] font-medium truncate">{r.subject}</div>
                )}
                <div className="text-[12px] text-white/50 truncate">{r.message}</div>
              </div>
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5" style={{ color: CHANNEL_META[r.channel]?.color }} />
                <span className="font-mono text-xs uppercase text-white/70">{r.channel}</span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider ml-1 ${
                    r.status === "failed" ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  <SIcon className="w-3 h-3" />
                  {r.status}
                </span>
              </div>
              <div className="font-mono text-xs text-white/50">{relTime(r.at)}</div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="p-16 text-center text-white/40 font-mono text-sm">
            No reminders yet. Run an automation.
          </div>
        )}
      </div>
    </div>
  );
}
