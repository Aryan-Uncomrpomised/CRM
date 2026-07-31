import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CLASSIFICATIONS } from "@/lib/constants";
import { useCurrency } from "@/lib/currency";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ArrowUpRight, Users, Bell, Zap, TrendingUp } from "lucide-react";

function KPI({ label, value, sub, icon: Icon, testid }) {
  return (
    <div
      data-testid={testid}
      className="border border-white/[0.08] rounded-md p-5 bg-[color:var(--vc-surface)]"
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
          {label}
        </div>
        <Icon className="w-3.5 h-3.5 text-white/30" />
      </div>
      <div className="font-display font-black text-4xl mt-3 tracking-tight">{value}</div>
      {sub && (
        <div className="text-[12px] text-white/50 mt-1 font-mono flex items-center gap-1">
          <ArrowUpRight className="w-3 h-3 text-emerald-400" />
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { format } = useCurrency();
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => (await api.get("/stats/overview")).data,
  });

  const s = data || {
    total_customers: 0,
    by_classification: {},
    reminders_sent: 0,
    active_automations: 0,
    total_revenue: 0,
    revenue_trend: [],
  };

  return (
    <div className="p-8 space-y-8" data-testid="dashboard-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            overview
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Journey engine, at a glance.
          </h1>
        </div>
        <div className="text-[11px] font-mono text-white/40 border border-white/10 rounded px-3 py-1.5">
          last 8 weeks
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI
          testid="kpi-customers"
          label="Total customers"
          value={s.total_customers}
          sub="Shopify + Odoo"
          icon={Users}
        />
        <KPI
          testid="kpi-reminders"
          label="Reminders sent"
          value={s.reminders_sent}
          sub="Across all channels"
          icon={Bell}
        />
        <KPI
          testid="kpi-automations"
          label="Active automations"
          value={s.active_automations}
          sub="Running now"
          icon={Zap}
        />
        <KPI
          testid="kpi-revenue"
          label="Revenue"
          value={format(s.total_revenue || 0, { digits: 0 })}
          sub="Attributed"
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-white/[0.08] rounded-md p-5 bg-[color:var(--vc-surface)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                revenue
              </div>
              <div className="font-display font-bold text-lg mt-0.5">Weekly attribution</div>
            </div>
          </div>
          <div className="h-72 mt-4">
            <ResponsiveContainer>
              <AreaChart data={s.revenue_trend || []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0057FF" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0057FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="week"
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0a0a0a",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v) => [format(v, { digits: 0 }), "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0057FF"
                  strokeWidth={2}
                  fill="url(#rev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-white/[0.08] rounded-md p-5 bg-[color:var(--vc-surface)]">
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            classification
          </div>
          <div className="font-display font-bold text-lg mt-0.5">Journey stages</div>
          <div className="mt-5 space-y-3">
            {CLASSIFICATIONS.map((c) => {
              const val = s.by_classification?.[c.value] || 0;
              const total = Object.values(s.by_classification || {}).reduce(
                (a, b) => a + b,
                0,
              );
              const pct = total ? Math.round((val / total) * 100) : 0;
              return (
                <div key={c.value}>
                  <div className="flex items-center justify-between">
                    <span className={`classification-tag tag-${c.value}`}>
                      {c.value.replace("_", " ")}
                    </span>
                    <span className="font-mono text-xs text-white/70">
                      {val}{" "}
                      <span className="text-white/30">· {pct}%</span>
                    </span>
                  </div>
                  <div className="h-1 mt-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
