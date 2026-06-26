// src/layout/AppLayout.tsx — Main shell with sidebar + top bar
// Drop-in replacement for SidebarLayout.tsx

import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { useTheme } from "../hooks/useTheme";
import {
  LayoutDashboard, Users, FolderOpen, FileText, Ruler,
  ShoppingCart, Wallet, BarChart3, Settings, LogOut,
  ChevronLeft, ChevronRight, Building2, Layers,
  Receipt, Truck, HardHat, Banknote, BookOpen,
  ClipboardList, Package, PieChart, Wrench,
  ChevronDown, ChevronUp, Plus, Zap
} from "lucide-react";
import { cn, SectionLabel } from "../components/ui";

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  icon: React.ReactNode;
  to?: string;
  children?: NavItem[];
  badge?: string;
};

const NAV: NavItem[] = [
  { label: "Dashboard",    icon: <LayoutDashboard size={15}/>, to: "/" },
  {
    label: "CRM", icon: <Users size={15}/>,
    children: [
      { label: "Clients",  icon: <Building2 size={14}/>,   to: "/clients" },
      { label: "Projects", icon: <FolderOpen size={14}/>,  to: "/projects" },
    ]
  },
  {
    label: "Estimating", icon: <FileText size={15}/>,
    children: [
      { label: "Estimates",   icon: <ClipboardList size={14}/>, to: "/estimates" },
      { label: "Contracts",   icon: <FileText size={14}/>, to: "/contracts" },
      { label: "BOQ Builder", icon: <Layers size={14}/>,        to: "/boq" },
      { label: "Takeoff",     icon: <Ruler size={14}/>,         to: "/takeoff" },
      { label: "Assemblies",  icon: <Wrench size={14}/>,        to: "/assemblies" },
      { label: "Rate Library",icon: <BookOpen size={14}/>,      to: "/rates" },
    ]
  },
  {
    label: "Procurement", icon: <ShoppingCart size={15}/>,
    children: [
      { label: "Purchase Orders",  icon: <Package size={14}/>,  to: "/procurement" },
      { label: "Receiving",        icon: <Truck size={14}/>,    to: "/receiving" },
      { label: "Supplier Prices",  icon: <Zap size={14}/>,      to: "/supplier-prices" },
    ]
  },
  {
    label: "Finance", icon: <Wallet size={15}/>,
    children: [
      { label: "Overview",         icon: <PieChart size={14}/>,    to: "/finance" },
      { label: "Transactions",     icon: <Receipt size={14}/>,     to: "/finance/transactions" },
      { label: "Expenses",         icon: <Banknote size={14}/>,    to: "/expenses" },
      { label: "Cash Flow",        icon: <BarChart3 size={14}/>,   to: "/cash-flow" },
      { label: "Accounts Recv.",   icon: <FileText size={14}/>,    to: "/accounts-receivable" },
      { label: "Field Payments",   icon: <Banknote size={14}/>,    to: "/field-payments" },
    ]
  },
  {
    label: "People", icon: <HardHat size={15}/>,
    children: [
      { label: "Workers",    icon: <HardHat size={14}/>,   to: "/workers" },
      { label: "Field Ops",  icon: <ClipboardList size={14}/>, to: "/field-ops" },
    ]
  },
  { label: "Reports",  icon: <BarChart3 size={15}/>, to: "/reports" },
  { label: "Settings", icon: <Settings size={15}/>,  to: "/settings" },
];

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────

function NavGroup({ item, collapsed, defaultOpen }: { item: NavItem; collapsed: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const location = useLocation();
  const anyActive = item.children?.some(c => c.to && location.pathname.startsWith(c.to) && c.to !== "/");

  if (!item.children) {
    return (
      <NavLink to={item.to!} end={item.to === "/"}
        className={({ isActive }) => cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mx-2",
          isActive ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
        )}>
        <span className="flex-shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mx-0 text-left",
          anyActive ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-400",
          "hover:bg-slate-100 dark:hover:bg-white/[0.03]"
        )}
        style={{ width: "calc(100% - 8px)", marginLeft: "4px" }}
      >
        <span className="flex-shrink-0" style={{ color: anyActive ? "#22d3ee" : undefined }}>{item.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {open ? <ChevronUp size={11} className="flex-shrink-0 opacity-40"/> : <ChevronDown size={11} className="flex-shrink-0 opacity-40"/>}
          </>
        )}
      </button>
      {!collapsed && open && (
        <div className="ml-5 mt-0.5 mb-1 border-l border-slate-200 dark:border-white/[0.06] pl-2 space-y-0.5">
          {item.children.map(child => (
            <NavLink key={child.to} to={child.to!}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                isActive ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.03]"
              )}>
              <span className="flex-shrink-0 opacity-70">{child.icon}</span>
              <span className="truncate">{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project Picker ───────────────────────────────────────────────────────────

function ProjectPicker({ collapsed }: { collapsed: boolean }) {
  const { projects, currentProject, setCurrentProjectId, loadingProjects } = useProjectContext();
  const [open, setOpen] = useState(false);

  if (loadingProjects) {
    return <div className="mx-3 h-9 rounded-lg bg-slate-100 dark:bg-white/[0.04] animate-pulse" />;
  }

  return (
    <div className="relative mx-2">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={10} className="text-white"/>
          </div>
          {!collapsed && (
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
              {currentProject?.name || "Select project"}
            </span>
          )}
        </div>
        {!collapsed && <ChevronDown size={11} className="flex-shrink-0 text-slate-400 dark:text-slate-600"/>}
      </button>

      {open && !collapsed && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1520] shadow-2xl overflow-hidden">
          <div className="p-1 max-h-64 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] text-slate-500 dark:text-slate-600">No projects yet</div>
            ) : projects.map(p => (
              <button key={p.id} onClick={() => { setCurrentProjectId(p.id); setOpen(false); }}
                className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-left transition-colors",
                  p.id === currentProject?.id ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]")}>
                <FolderOpen size={12} className="flex-shrink-0 opacity-60"/>
                <span className="truncate">{p.name}</span>
                {p.status && (
                  <span className={cn("ml-auto flex-shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                    p.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
                    p.status === "completed" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" :
                    "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600")}>
                    {p.status}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { settings: co } = useCompanySettings();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  // Determine which groups should default-open
  function isGroupActive(item: NavItem) {
    return item.children?.some(c => c.to && (
      c.to === "/" ? location.pathname === "/" : location.pathname.startsWith(c.to)
    )) ?? false;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#080b10] overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={cn(
        "flex flex-col border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0a0d14] transition-all duration-200 flex-shrink-0",
        collapsed ? "w-14" : "w-56"
      )}>
        {/* Logo */}
        <div className={cn("flex items-center h-12 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0", collapsed ? "justify-center px-0" : "gap-2.5 px-4")}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {co?.logo_url && <img src={co.logo_url} alt="logo" className="w-full h-full object-cover" />}
            <Building2 size={14} className="text-white"/>
          </div>
          {!collapsed && (
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">{co?.company_name || "Magnus"}</div>
              <div className="text-[8px] text-slate-500 dark:text-slate-600 uppercase tracking-widest leading-tight">Construction ERP</div>
            </div>
          )}
        </div>

        {/* Project picker */}
        <div className="py-2 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <ProjectPicker collapsed={collapsed} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-hide">
          {NAV.map(item => (
            <NavGroup key={item.label} item={item} collapsed={collapsed} defaultOpen={isGroupActive(item)} />
          ))}
        </nav>

        {/* Bottom — user + collapse */}
        <div className="border-t border-slate-200 dark:border-white/[0.06] p-2 flex-shrink-0 space-y-1">
          {user && !collapsed && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center text-[9px] font-bold text-white dark:text-slate-300 flex-shrink-0">
                {(user.email?.[0] || "U").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 truncate">{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={toggleTheme}
            className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors", collapsed && "justify-center")}>
            <span style={{fontSize:13}}>{theme === "dark" ? "☀️" : "🌙"}</span>
            {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>
          <button onClick={handleLogout}
            className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-slate-500 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors", collapsed && "justify-center")}>
            <LogOut size={13}/>
            {!collapsed && "Sign out"}
          </button>
          <button onClick={() => setCollapsed(v => !v)}
            className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 dark:text-slate-700 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors", collapsed && "justify-center")}>
            {collapsed ? <ChevronRight size={13}/> : <><ChevronLeft size={13}/><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#080b10]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
