import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShoppingBag, Store, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const ICONS = {
  shopify: ShoppingBag,
  odoo: Store,
  resend: Mail,
  twilio: MessageSquare,
};

export default function Connectors() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => (await api.get("/connectors")).data,
  });

  const sync = async (id) => {
    try {
      await api.post(`/connectors/${id}/sync`);
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast.success(`${id} synced`);
    } catch (e) {
      toast.error("Sync failed");
    }
  };

  return (
    <div className="p-8 space-y-6" data-testid="connectors-page">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
          data sources
        </div>
        <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
          Connectors
        </h1>
        <p className="text-white/50 mt-2 text-sm max-w-xl">
          Shopify and Odoo POS feed customer + order data into Voyage. Messaging
          providers (Resend, Twilio) send reminders on your behalf.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((c) => {
          const Icon = ICONS[c.id] || ShoppingBag;
          return (
            <div
              key={c.id}
              data-testid={`connector-${c.id}`}
              className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-white/[0.06] border border-white/10 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-lg">{c.name}</div>
                    <div className="text-[11px] font-mono text-white/40">
                      last sync · {fmtDateTime(c.last_sync)}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${
                    c.status === "connected"
                      ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                      : "border-amber-800 bg-amber-950/40 text-amber-300"
                  }`}
                >
                  {c.status.replace("_", " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="border border-white/[0.06] rounded px-3 py-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                    records
                  </div>
                  <div className="font-display font-bold text-xl">{c.records}</div>
                </div>
                <Button
                  variant="outline"
                  data-testid={`sync-${c.id}`}
                  onClick={() => sync(c.id)}
                  className="border-white/10 bg-transparent hover:bg-white/[0.05]"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync now
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
