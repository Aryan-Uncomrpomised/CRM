import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Settings() {
  const [twilio, setTwilio] = useState({ sid: "", token: "", from: "", waFrom: "" });

  return (
    <div className="p-8 space-y-6 max-w-3xl" data-testid="settings-page">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
          settings
        </div>
        <h1 className="font-display font-black text-4xl mt-1 tracking-tight">Configuration</h1>
      </div>

      <section className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-lg">Email (Resend)</div>
            <div className="text-sm text-white/50 mt-1">
              Managed by Emergent — no API key required.
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-800 bg-emerald-950/40 text-emerald-300">
            connected
          </span>
        </div>
      </section>

      <section className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-lg">Twilio (SMS + WhatsApp)</div>
            <div className="text-sm text-white/50 mt-1">
              Add your Twilio credentials to send real SMS + WhatsApp reminders.
              Until configured, sends are marked as <span className="font-mono">simulated</span>.
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-amber-800 bg-amber-950/40 text-amber-300">
            not configured
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
              Account SID
            </Label>
            <Input
              data-testid="tw-sid"
              placeholder="AC***"
              value={twilio.sid}
              onChange={(e) => setTwilio({ ...twilio, sid: e.target.value })}
              className="mt-1.5 bg-black/40 border-white/10"
            />
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
              Auth Token
            </Label>
            <Input
              data-testid="tw-token"
              type="password"
              value={twilio.token}
              onChange={(e) => setTwilio({ ...twilio, token: e.target.value })}
              className="mt-1.5 bg-black/40 border-white/10"
            />
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
              SMS From (phone)
            </Label>
            <Input
              data-testid="tw-from"
              placeholder="+1234567890"
              value={twilio.from}
              onChange={(e) => setTwilio({ ...twilio, from: e.target.value })}
              className="mt-1.5 bg-black/40 border-white/10"
            />
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-wider text-white/50">
              WhatsApp From
            </Label>
            <Input
              data-testid="tw-wa"
              placeholder="whatsapp:+14155238886"
              value={twilio.waFrom}
              onChange={(e) => setTwilio({ ...twilio, waFrom: e.target.value })}
              className="mt-1.5 bg-black/40 border-white/10"
            />
          </div>
        </div>
        <div className="pt-3">
          <Button
            data-testid="tw-save"
            onClick={() =>
              toast.info(
                "Credentials captured. Live SMS/WhatsApp send activation is coming — for now, sends are logged as 'simulated'.",
              )
            }
            className="bg-white text-black hover:bg-white/90"
          >
            Save credentials
          </Button>
        </div>
      </section>

      <section className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-6">
        <div className="font-display font-bold text-lg">Data sources</div>
        <div className="text-sm text-white/50 mt-1">
          Shopify and Odoo are currently running on sample data. Real
          integration keys can be added on the{" "}
          <span className="text-[color:var(--vc-lime)] font-mono">Connectors</span>{" "}
          page.
        </div>
      </section>
    </div>
  );
}
