import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  CreditCard,
  Package,
  Layers,
  Award,
  ArrowUpRight,
  Receipt,
} from "lucide-react";

function KPI({ label, value, sub, icon: Icon, color = "emerald" }) {
  return (
    <div className="border border-white/[0.08] rounded-xl p-5 bg-[color:var(--vc-surface)] hover:border-white/20 transition-all">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
          {label}
        </div>
        <div className={`p-2 rounded-lg bg-white/[0.04] text-${color}-400`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="font-display font-black text-3xl mt-3 tracking-tight">{value}</div>
      {sub && (
        <div className="text-[12px] text-white/50 mt-1 font-mono flex items-center gap-1">
          <ArrowUpRight className="w-3 h-3 text-emerald-400" />
          {sub}
        </div>
      )}
    </div>
  );
}

export default function SalesDashboard() {
  const { format } = useCurrency();
  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales-stats"],
    queryFn: async () => (await api.get("/stats/sales")).data,
  });

  const s = sales || {
    total_sales_revenue: 0,
    total_orders_count: 0,
    avg_order_value: 0,
    top_products: [],
    monthly_trend: [],
    top_customers: [],
    vendor_bills_count: 0,
    stock_quants_count: 0,
  };

  return (
    <div className="p-8 space-y-8" data-testid="sales-dashboard-page">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Store Sales Analytics · Uncompromised</span>
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Sales & Revenue Dashboard
          </h1>
        </div>
        <div className="text-[11px] font-mono text-white/40 border border-white/10 rounded px-3 py-1.5 bg-white/[0.02]">
          Odoo Live Revenue (Account 200110)
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI
          label="Total Sales Revenue"
          value={format(s.total_sales_revenue || 0, { digits: 0 })}
          sub="Verified Odoo Sales"
          icon={TrendingUp}
          color="emerald"
        />
        <KPI
          label="Sales Orders"
          value={s.total_orders_count ? s.total_orders_count.toLocaleString() : "0"}
          sub="Completed Invoices"
          icon={ShoppingBag}
          color="blue"
        />
        <KPI
          label="Average Order Value"
          value={format(s.avg_order_value || 0, { digits: 0 })}
          sub="Per Transaction"
          icon={CreditCard}
          color="purple"
        />
        <KPI
          label="Vendor Bills Processed"
          value={s.vendor_bills_count ? s.vendor_bills_count.toLocaleString() : "0"}
          sub="10k+ Vendor Invoices"
          icon={Receipt}
          color="amber"
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Sales Revenue Area Chart */}
        <div className="lg:col-span-2 border border-white/[0.08] rounded-xl p-6 bg-[color:var(--vc-surface)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                Monthly Performance
              </div>
              <div className="font-display font-bold text-xl mt-0.5">Revenue Trend (INR)</div>
            </div>
            <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
              Account 200110
            </div>
          </div>
          <div className="h-80 mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={s.monthly_trend || []}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="month"
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#09090b",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => [format(v, { digits: 0 }), "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#salesGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products Leaderboard */}
        <div className="border border-white/[0.08] rounded-xl p-6 bg-[color:var(--vc-surface)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                  Products
                </div>
                <div className="font-display font-bold text-xl mt-0.5">Top Selling Items</div>
              </div>
              <Package className="w-4 h-4 text-white/40" />
            </div>

            <div className="mt-5 space-y-3">
              {(s.top_products || []).slice(0, 6).map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium truncate text-white/90">
                      {p.name.replace(/^\[.*?\]\s*/, "")}
                    </div>
                    <div className="text-[10.5px] font-mono text-white/40">
                      {p.quantity ? `${p.quantity.toLocaleString()} kg/units` : "Standard Sale"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-bold text-emerald-400">
                      {format(p.revenue, { digits: 0 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] text-center text-xs text-white/40 font-mono">
            726 Total Catalog Items Managed
          </div>
        </div>
      </div>

      {/* Top Customers & Recent High-Value Accounts */}
      <div className="border border-white/[0.08] rounded-xl p-6 bg-[color:var(--vc-surface)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
              Customer Leaderboard
            </div>
            <div className="font-display font-bold text-xl mt-0.5">
              Top Purchasing Accounts
            </div>
          </div>
          <Award className="w-5 h-5 text-amber-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] font-mono uppercase tracking-wider text-white/40">
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Location / City</th>
                <th className="py-3 px-4">Orders</th>
                <th className="py-3 px-4 text-right">Total Revenue Spent</th>
                <th className="py-3 px-4 text-right">Last Purchase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {(s.top_customers || []).map((c, i) => (
                <tr key={c.id || i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 font-medium flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center justify-center">
                      #{i + 1}
                    </div>
                    <div>
                      <div className="text-white text-sm font-semibold">{c.name}</div>
                      <div className="text-white/40 text-xs font-mono">{c.email}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white/60 font-mono text-xs">
                    {c.city || "India"}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-white/80">
                    {c.total_orders || 0} orders
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-bold text-emerald-400">
                    {format(c.total_spent || 0, { digits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-white/50">
                    {c.last_order_at || "Recent"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
