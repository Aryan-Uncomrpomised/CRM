import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import NotificationBell from "@/components/NotificationBell";
import {
  LayoutDashboard,
  Users,
  Filter,
  Zap,
  Bell,
  Megaphone,
  Plug,
  Settings as SettingsIcon,
  LogOut,
  Search,
  CheckSquare,
  UserCog,
  FolderOpen,
  Sparkles,
  Kanban,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Home", icon: Sparkles, end: true, testid: "nav-home" },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/sales", label: "Sales Analytics", icon: TrendingUp, testid: "nav-sales" },
  { to: "/customers", label: "Contacts", icon: Users, testid: "nav-customers" },
  { to: "/pipeline", label: "Pipeline", icon: Kanban, testid: "nav-pipeline" },
  { to: "/segments", label: "Segments", icon: Filter, testid: "nav-segments" },
  { to: "/automations", label: "Automations", icon: Zap, testid: "nav-automations" },
  { to: "/reminders", label: "Reminders", icon: Bell, testid: "nav-reminders" },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, testid: "nav-campaigns" },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, testid: "nav-tasks" },
  { to: "/documents", label: "Documents", icon: FolderOpen, testid: "nav-documents" },
  { to: "/users", label: "Users", icon: UserCog, testid: "nav-users" },
  { to: "/connectors", label: "Connectors", icon: Plug, testid: "nav-connectors" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { currency, toggle } = useCurrency();
  const nav = useNavigate();

  const onLogout = async () => {
    await logout();
    toast.success("Signed out");
    nav("/login");
  };

  return (
    <div className="min-h-screen flex bg-[color:var(--vc-bg)] text-white">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-white/[0.06] bg-[color:var(--vc-bg)] flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-md bg-white text-black flex items-center justify-center font-display font-black">
            V
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-[15px] tracking-tight">Voyage.crm</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">
              journey engine
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-medium transition-colors ${
                  isActive
                    ? "bg-white/[0.06] text-white"
                    : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                }`
              }
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/[0.06]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="user-menu-trigger"
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/[0.05] transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--vc-accent)] to-[color:var(--vc-lime)] flex items-center justify-center font-display font-black text-black text-sm">
                  {(user?.name || "A")[0]}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{user?.name || "Admin"}</div>
                  <div className="text-[10.5px] font-mono text-white/40 truncate">{user?.email}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-[color:var(--vc-surface)] border-white/10">
              <DropdownMenuLabel className="text-white/50 font-mono text-[10.5px] uppercase tracking-wider">
                Signed in
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="menu-logout"
                onClick={onLogout}
                className="text-red-400 focus:text-red-300 focus:bg-red-950/30"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 border-b border-white/[0.06] bg-black/70 backdrop-blur-xl flex items-center gap-4 px-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
            <Input
              data-testid="global-search-input"
              placeholder="Search customers, segments…"
              className="pl-8 h-9 bg-white/[0.03] border-white/[0.08] text-sm"
            />
          </div>
          <div className="text-[11px] font-mono text-white/40 hidden md:flex items-center gap-3">
            <div
              data-testid="currency-toggle"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-white/[0.08] rounded bg-white/[0.03] text-emerald-400 font-bold"
            >
              <span className="font-display">₹</span>
              <span className="text-[10px] uppercase tracking-widest">INR</span>
            </div>
            <NotificationBell />
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Shopify · syncing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Odoo · connected
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
