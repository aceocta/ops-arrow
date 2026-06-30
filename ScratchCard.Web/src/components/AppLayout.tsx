import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { rotaApi, fmtDate, addDays } from "../lib/rota";
import { leaveApi } from "../lib/leave";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarOff,
  Clock,
  CheckCheck,
  UsersRound,
  Thermometer,
  ClipboardCheck,
  ShieldX,
  DoorOpen,
  Receipt,
  Calculator,
  PoundSterling,
  ArrowLeftRight,
  ListTree,
  Settings,
  CreditCard,
  ChevronDown,
  LogOut,
  Store,
  Sun,
  Moon,
  Menu,
  X,
  Layers,
  BarChart3,
  Ticket,
  SlidersHorizontal,
  AlertTriangle,
  History,
} from "lucide-react";
import clsx from "clsx";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
  role?: string;
  /** Show when the user has ANY of these roles. */
  anyRole?: string[];
};
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    group: "Staff",
    items: [
      { to: "/rota", label: "Rota", icon: CalendarDays, feature: "StaffRota" },
      { to: "/timesheets", label: "Timesheets", icon: Clock, feature: "StaffRota" },
      { to: "/timesheets/rates", label: "Pay Rates", icon: PoundSterling, feature: "staff_rota.labour_cost" },
      { to: "/approvals", label: "Time Approvals", icon: CheckCheck, feature: "staff_rota.manual_approval" },
      { to: "/leave", label: "Leave", icon: CalendarOff, feature: "LeaveManagement" },
      { to: "/shift-swaps", label: "Shift Swaps", icon: ArrowLeftRight, feature: "staff_rota.shift_swap" },
      { to: "/staff", label: "External Staff", icon: UsersRound, feature: "StaffRota" },
    ],
  },
  {
    group: "Compliance",
    items: [
      { to: "/temperature", label: "Temperature", icon: Thermometer, feature: "TemperatureLog" },
      { to: "/compliance", label: "Compliance", icon: ClipboardCheck, feature: "ComplianceChecklist" },
      { to: "/refusals", label: "Refusals", icon: ShieldX, feature: "RefusalNoIdNoSale" },
      { to: "/visitors", label: "Visitors", icon: DoorOpen, feature: "VisitorsLog" },
    ],
  },
  {
    group: "Product Expiry",
    items: [
      { to: "/product-expiry", label: "Expiry Alerts", icon: AlertTriangle, feature: "ProductExpiryManagement" },
      { to: "/product-expiry/history", label: "Product History", icon: History, feature: "ProductExpiryManagement" },
    ],
  },
  {
    group: "Scratch Cards",
    items: [
      { to: "/games", label: "Games", icon: Ticket, feature: "ScratchCardManagement" },
    ],
  },
  {
    group: "Till",
    items: [
      { to: "/till", label: "Reconciliation", icon: Receipt, feature: "store_sales.dashboard" },
      { to: "/till/tills", label: "Tills", icon: Calculator, feature: "store_sales.dashboard" },
      { to: "/till/groups", label: "Groups", icon: Layers, feature: "store_sales.dashboard" },
      { to: "/till/report", label: "Line report", icon: BarChart3, feature: "store_sales.dashboard" },
      { to: "/till/catalogue", label: "Field Catalogue", icon: ListTree, role: "PlatformAdmin" },
    ],
  },
  {
    group: "Setup",
    items: [
      { to: "/shops", label: "Shops", icon: Store },
      { to: "/settings/features", label: "Feature Toggles", icon: SlidersHorizontal, anyRole: ["CompanyOwner", "Manager", "PlatformAdmin"] },
      // No feature gate — billing is universal. Owners/managers only (mobile users are sent here for all billing).
      { to: "/billing", label: "Billing", icon: CreditCard, anyRole: ["CompanyOwner", "Manager", "PlatformAdmin"] },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
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
    <div className="relative min-w-0">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost w-full max-w-xs justify-between px-3 lg:w-auto lg:min-w-[200px] lg:max-w-none lg:px-4">
        <span className="flex min-w-0 items-center gap-2 truncate">
          <Store className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{activeShop?.shopName ?? "Select shop"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-2 max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);
  const roles = profile?.roles ?? [];
  const groups = NAV
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (!i.feature || features.includes(i.feature)) &&
          (!i.role || roles.includes(i.role)) &&
          (!i.anyRole || i.anyRole.some((r) => roles.includes(r))),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const pendingQ = useQuery({
    queryKey: ["rota-pending", activeShopId],
    queryFn: () => rotaApi.pendingApprovals(activeShopId!),
    enabled: !!activeShopId && features.includes("staff_rota.manual_approval"),
    refetchInterval: 60_000,
  });
  const pendingCount = pendingQ.data?.length ?? 0;

  // Pending leave requests — wide window because requests can sit well into the future.
  const leavePendingQ = useQuery({
    queryKey: ["leave-pending", activeShopId],
    queryFn: async () => {
      const today = fmtDate(new Date());
      const rows = await leaveApi.list(activeShopId!, addDays(today, -180), addDays(today, 366));
      return rows.filter((r) => r.status === "Pending").length;
    },
    enabled: !!activeShopId && features.includes("LeaveManagement"),
    refetchInterval: 60_000,
  });
  const leavePendingCount = leavePendingQ.data ?? 0;
  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.email;

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img src="/logo.png" alt="Ops Arrow" className="h-9 w-9 rounded-xl object-contain shadow-sm" />
        <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-lg font-bold tracking-tight text-transparent">Ops Arrow</span>
        <button
          onClick={() => setSidebarOpen(false)}
          className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.group} className="space-y-0.5">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{g.group}</div>
            {g.items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === "/" || i.to === "/till" || i.to === "/product-expiry"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-600"
                      : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-900",
                  )
                }
              >
                <i.icon className="h-[18px] w-[18px]" />
                <span className="flex-1">{i.label}</span>
                {i.to === "/approvals" && pendingCount > 0 ? (
                  <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{pendingCount}</span>
                ) : null}
                {i.to === "/leave" && leavePendingCount > 0 ? (
                  <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{leavePendingCount}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <button onClick={() => { setSidebarOpen(false); logout(); navigate("/login"); }} className="btn-ghost w-full">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-full">
      {/* Sidebar — static on desktop */}
      <aside className="hidden w-64 flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur lg:flex">
        {sidebarContent}
      </aside>

      {/* Sidebar — slide-over drawer on mobile */}
      <div className={clsx("fixed inset-0 z-40 lg:hidden", sidebarOpen ? "" : "pointer-events-none")} aria-hidden={!sidebarOpen}>
        <div
          className={clsx(
            "absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200",
            sidebarOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          className={clsx(
            "absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-slate-200/70 bg-white shadow-xl transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent}
        </aside>
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200/70 bg-white/70 px-3 py-3 backdrop-blur-md sm:gap-3 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <ShopSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-800">{name}</div>
              <div className="text-xs text-slate-400">{profile?.roles?.[0]}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-sm">
              {(name ?? "?").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
