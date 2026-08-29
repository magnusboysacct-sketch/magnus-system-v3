// src/layout/AppLayout.tsx — Main shell with sidebar + top bar
// Drop-in replacement for SidebarLayout.tsx

import React, { useState, useEffect, useMemo } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { useTheme } from "../hooks/useTheme";
import {
  LayoutDashboard, Users, FolderOpen, FileText, Ruler,
  ShoppingCart, Wallet, BarChart3, Settings, LogOut,
  ChevronLeft, ChevronRight, Building2, Layers,
  Receipt, Truck, HardHat, Banknote, BookOpen,
  ClipboardList, Package, PieChart, Wrench, Landmark,
  ChevronDown, ChevronUp, Plus, Zap, Menu, X, HelpCircle, MessageSquare, Briefcase
} from "lucide-react";
import { cn, SectionLabel } from "../components/ui";
import { canAccessSecretaryWorkspace, canApproveSecretaryDocuments } from "../lib/permissions";

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
      { label: "Vendors",          icon: <Truck size={14}/>,    to: "/suppliers" },
    ]
  },
  {
    label: "Finance", icon: <Wallet size={15}/>,
    children: [
      { label: "Overview",         icon: <PieChart size={14}/>,    to: "/finance" },
      { label: "Transactions",     icon: <Receipt size={14}/>,     to: "/finance/transactions" },
      { label: "Expenses",         icon: <Banknote size={14}/>,    to: "/expenses" },
      { label: "Cash Flow",        icon: <BarChart3 size={14}/>,   to: "/cash-flow" },
      { label: "Bank Accounts",    icon: <Landmark size={14}/>,    to: "/finance/bank-accounts" },
      { label: "Accounts Recv.",   icon: <FileText size={14}/>,    to: "/accounts-receivable" },
      { label: "Payables",         icon: <FileText size={14}/>,    to: "/accounts-payable" },
      { label: "Field Payments",   icon: <Banknote size={14}/>,    to: "/field-payments" },
      { label: "Payroll",          icon: <Banknote size={14}/>,    to: "/payroll" },
    ]
  },
  {
    label: "People", icon: <HardHat size={15}/>,
    children: [
      { label: "Workers",    icon: <HardHat size={14}/>,   to: "/workers" },
      { label: "Field Ops",  icon: <ClipboardList size={14}/>, to: "/field-ops" },
    ]
  },
  { label: "Secretary Workspace", icon: <Briefcase size={15}/>, to: "/secretary" },
  { label: "Reports",  icon: <BarChart3 size={15}/>, to: "/reports" },
  { label: "Settings", icon: <Settings size={15}/>,  to: "/settings" },
];

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────

function NavGroup({ item, collapsed, defaultOpen, onNavigate }: { item: NavItem; collapsed: boolean; defaultOpen: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const location = useLocation();
  const anyActive = item.children?.some(c => c.to && location.pathname.startsWith(c.to) && c.to !== "/");

  if (!item.children) {
    return (
      <NavLink to={item.to!} end={item.to === "/"} onClick={onNavigate}
        className={({ isActive }) => cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mx-2",
          isActive ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
        )}>
        <span className="flex-shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
        {/* Top-level items had no badge rendering at all before this —
            only nested children (Staff Portal, Clients) did. Needed for
            Secretary Workspace's pending-approvals count, added the same
            visual style as the existing child badge below rather than a
            new one. */}
        {!collapsed && item.badge && (
          <span className="ml-auto flex-shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {item.badge}
          </span>
        )}
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
            <NavLink key={child.to} to={child.to!} onClick={onNavigate}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                isActive ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.03]"
              )}>
              <span className="flex-shrink-0 opacity-70">{child.icon}</span>
              <span className="truncate">{child.label}</span>
              {child.badge && (
                <span className="ml-auto flex-shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {child.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project Picker ───────────────────────────────────────────────────────────

function ProjectPicker({ collapsed }: { collapsed: boolean }) {
  const { projects: allProjects, currentProject, setCurrentProjectId, loadingProjects } = useProjectContext();
  const [open, setOpen] = useState(false);
  const projects = allProjects.filter(p => p.status !== "archived");

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { settings: co } = useCompanySettings();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const { userRole } = useProjectContext();
  const { canAccessFullFinance } = useFinanceAccess();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const [staffPortalUnread, setStaffPortalUnread] = useState(0);
  useEffect(() => {
    if (!co?.company_id) return;
    if (!(userRole === "director" || userRole === "admin")) return;
    supabase.from("worker_portal_messages")
      .select("*", { count: "exact", head: true })
      .eq("company_id", co.company_id)
      .eq("sender_type", "worker")
      .eq("read_by_management", false)
      .then(({ count }) => setStaffPortalUnread(count || 0));
  }, [co?.company_id, userRole]);

  // Client messaging is a separate system from Staff Portal above (different
  // table, different read-tracking field, different destination page) — kept
  // as its own badge on its own nav item rather than merged into one number,
  // matching how Staff Portal's own badge is already scoped. No manual
  // company_id filter needed here: the client_comments SELECT policy for
  // `authenticated` already scopes results to the caller's own company via
  // clients.company_id, so RLS does this for free.
  const [clientMessagesUnread, setClientMessagesUnread] = useState(0);
  useEffect(() => {
    if (!co?.company_id) return;
    supabase.from("client_comments")
      .select("*", { count: "exact", head: true })
      .eq("sender_type", "client")
      .is("read_at", null)
      .then(({ count }) => setClientMessagesUnread(count || 0));
  }, [co?.company_id]);

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

  const isDirector = userRole === "director";
  const canSeeWorkers = isDirector || userRole === "supervisor" || userRole === "site_user";
  const canSeeFieldPayments = isDirector || userRole === "supervisor" || userRole === "site_user";
  const canSeePayroll = isDirector || userRole === "admin";
  const canSeeSecretaryWorkspace = canAccessSecretaryWorkspace(userRole);
  const canApproveSecretaryDocs = canApproveSecretaryDocuments(userRole);

  // Real count from secretary_documents where status='pending_approval',
  // company-scoped — same fetch-into-state pattern as staffPortalUnread
  // above (role-gated, {count:"exact", head:true}). Matches the real query
  // SecretaryWorkspacePage.tsx's own banner now runs; the two will agree.
  const [secretaryPendingApprovals, setSecretaryPendingApprovals] = useState(0);
  useEffect(() => {
    if (!co?.company_id) return;
    if (!canApproveSecretaryDocs) return;
    supabase.from("secretary_documents")
      .select("*", { count: "exact", head: true })
      .eq("company_id", co.company_id)
      .eq("status", "pending_approval")
      .then(({ count }) => setSecretaryPendingApprovals(count || 0));
  }, [co?.company_id, canApproveSecretaryDocs]);

  // Filter the nav by role — hide items the current user can't act on rather
  // than showing a destination that just 403s. Groups left with no visible
  // children are dropped entirely.
  const visibleNav = useMemo(() => {
    return NAV
      .map(item => {
        if (item.label === "CRM") {
          const children = item.children?.map(c =>
            c.to === "/clients"
              ? { ...c, badge: clientMessagesUnread > 0 ? String(clientMessagesUnread) : undefined }
              : c
          );
          return children?.length ? { ...item, children } : null;
        }
        if (item.label === "Finance") {
          const children = item.children?.filter(c => {
            if (c.to === "/field-payments") return canSeeFieldPayments;
            if (c.to === "/payroll") return canSeePayroll;
            return canAccessFullFinance;
          });
          return children?.length ? { ...item, children } : null;
        }
        if (item.label === "People") {
          const children = (item.children?.filter(c =>
            c.to === "/workers" ? canSeeWorkers : true
          ) || []);
          const canManageStaffPortal = isDirector || userRole === "admin";
          const withStaffPortal = canManageStaffPortal
            ? [...children, {
                label: "Staff Portal",
                icon: <MessageSquare size={14}/>,
                to: "/staff-portal",
                badge: staffPortalUnread > 0 ? String(staffPortalUnread) : undefined,
              }]
            : children;
          return withStaffPortal.length ? { ...item, children: withStaffPortal } : null;
        }
        if (item.label === "Secretary Workspace") {
          if (!canSeeSecretaryWorkspace) return null;
          // Badge only for admin/director, who approve — not for the
          // secretary themself, since they're not the one clearing this
          // count (same "who acts on it, not just who can see it" spirit
          // as the Staff Portal/Clients unread badges above, just gated
          // by role instead of by unread-message ownership).
          const badge = canApproveSecretaryDocs && secretaryPendingApprovals > 0
            ? String(secretaryPendingApprovals)
            : undefined;
          return { ...item, badge };
        }
        if (item.label === "Settings") {
          return isDirector ? item : null;
        }
        return item;
      })
      .filter((item): item is NavItem => item !== null);
  }, [canAccessFullFinance, canSeeFieldPayments, canSeePayroll, canSeeWorkers, canSeeSecretaryWorkspace, canApproveSecretaryDocs, secretaryPendingApprovals, isDirector, userRole, staffPortalUnread, clientMessagesUnread]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#080b10] overflow-hidden">

      {/* ── Mobile hamburger ── */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">
        <Menu size={20} className="text-slate-600 dark:text-slate-300"/>
      </button>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)}/>
      )}

      {/* ── Sidebar ── */}
      <aside className={cn(
        "flex flex-col border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0a0d14] transition-all duration-200",
        "fixed inset-y-0 left-0 z-50 w-56",
        "md:static md:z-auto md:flex-shrink-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "md:translate-x-0",
        collapsed ? "md:w-14" : "md:w-56"
      )}>
        {/* Close button — mobile only */}
        <button onClick={() => setSidebarOpen(false)}
          className="md:hidden absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-10">
          <X size={16}/>
        </button>
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
          {visibleNav.map(item => (
            <NavGroup key={item.label} item={item} collapsed={collapsed} defaultOpen={isGroupActive(item)} onNavigate={() => setSidebarOpen(false)} />
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
          <button onClick={() => navigate("/help")}
            className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors", collapsed && "justify-center")}>
            <HelpCircle size={13}/>
            {!collapsed && <span>Help & Training</span>}
          </button>
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
            className={cn("w-full hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 dark:text-slate-700 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors", collapsed && "justify-center")}>
            {collapsed ? <ChevronRight size={13}/> : <><ChevronLeft size={13}/><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#080b10] pt-14 md:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
