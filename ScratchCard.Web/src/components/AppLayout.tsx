import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { rotaApi } from "../lib/rota";
import {
  LayoutDashboard,
  CalendarDays,
  Clock,
  CheckCheck,
  UsersRound,
  Thermometer,
  ClipboardCheck,
  ShieldX,
  DoorOpen,
  Settings,
  ChevronDown,
  LogOut,
  Store,
  Sun,
  Moon,
} from "lucide-react";
import clsx from "clsx";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; feature?: string };

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rota", label: "Rota", icon: CalendarDays, feature: "StaffRota" },
  { to: "/timesheets", label: "Timesheets", icon: Clock, feature: "StaffRota" },
  { to: "/approvals", label: "Time Approvals", icon: CheckCheck, feature: "staff_rota.manual_approval" },
  { to: "/staff", label: "External Staff", icon: UsersRound, feature: "StaffRota" },
  { to: "/temperature", label: "Temperature", icon: Thermometer, feature: "TemperatureLog" },
  { to: "/compliance", label: "Compliance", icon: ClipboardCheck, feature: "ComplianceChecklist" },
  { to: "/refusals", label: "Refusals", icon: ShieldX, feature: "RefusalNoIdNoSale" },
  { to: "/visitors", label: "Visitors", icon: DoorOpen, feature: "VisitorsLog" },
  { to: "/shops", label: "Shops", icon: Store },
  { to: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("oa.web.theme", dark ? "dark" : "light"); } catch { /* ignore */ }
  }, [dark]);
  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function ShopSwitcher() {
  const { profile, activeShop, activeShopId, setActiveShopId } = useAuth();
  const [open, setOpen] = useState(false);
  const shops = profile?.shops ?? [];
  if (shops.length === 0) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost min-w-[200px] justify-between">
        <span className="flex items-center gap-2 truncate">
          <Store className="h-4 w-4 text-slate-400" />
          <span className="truncate">{activeShop?.shopName ?? "Select shop"}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-2 max-h-80 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {shops.map((s) => (
              <button
                key={s.shopId}
                onClick={() => {
                  setActiveShopId(s.shopId);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50",
                  s.shopId === activeShopId && "bg-brand-50",
                )}
              >
                <span className="font-medium text-slate-800">{s.shopName}</span>
                {s.companyName ? <span className="text-xs text-slate-400">{s.companyName}</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AppLayout() {
  const { profile, features, activeShopId, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((i) => !i.feature || features.includes(i.feature));

  const pendingQ = useQuery({
    queryKey: ["rota-pending", activeShopId],
    queryFn: () => rotaApi.pendingApprovals(activeShopId!),
    enabled: !!activeShopId && features.includes("staff_rota.manual_approval"),
    refetchInterval: 60_000,
  });
  const pendingCount = pendingQ.data?.length ?? 0;
  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.email;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src="/logo.png" alt="Ops Arrow" className="h-9 w-9 rounded-lg object-contain" />
          <span className="text-lg font-semibold text-slate-900">Ops Arrow</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100"
                    : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-900",
                )
              }
            >
              <i.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{i.label}</span>
              {i.to === "/approvals" && pendingCount > 0 ? (
                <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{pendingCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button onClick={() => { logout(); navigate("/login"); }} className="btn-ghost w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-6 py-3 backdrop-blur-md">
          <ShopSwitcher />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="text-right">
              <div className="text-sm font-medium text-slate-800">{name}</div>
              <div className="text-xs text-slate-400">{profile?.roles?.[0]}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-sm">
              {(name ?? "?").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
