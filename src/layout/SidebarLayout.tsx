import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  FileSpreadsheet,
  Layers,
  Ruler,
  ShoppingCart,
  Landmark,
  ChartBar as BarChart3,
  Settings,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../hooks/useTheme";
import ProjectSelector from "../components/ProjectSelector";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { to: "/estimates", label: "Estimates", icon: FileSpreadsheet },
  { to: "/boq", label: "BOQ Builder", icon: Layers },
  { to: "/assemblies", label: "Assemblies", icon: Layers },
  { to: "/rates", label: "Rate Library", icon: Layers },
  { to: "/takeoff", label: "Takeoff", icon: Ruler },
  { to: "/procurement", label: "Procurement", icon: ShoppingCart },
  { to: "/finance", label: "Finance", icon: Landmark },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/settings/users", label: "User Manager", icon: Users },
];

export default function SidebarLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const v = localStorage.getItem("mb_sidebar_collapsed");
    if (v === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("mb_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    let alive = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!alive) return;

      setUserEmail(user?.email || "");

      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!alive) return;

      if (profile) {
        setUserRole(profile.role || null);
      }
    }

    async function loadCompany() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!alive || !profile?.company_id) return;

      const { data } = await supabase
        .from("company_settings")
        .select("company_name,logo_url")
        .eq("company_id", profile.company_id)
        .maybeSingle();

      if (!alive) return;

      if (data) {
        setCompanyName(data.company_name || "");
        setLogoUrl(data.logo_url || null);
      }
    }

    loadUser();
    loadCompany();

    const { data: userSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUserEmail(session?.user?.email || "");
    });

    return () => {
      alive = false;
      userSub.subscription.unsubscribe();
    };
  }, []);

  async function doLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const visibleNav = nav.filter((item) => {
    if (item.to === "/settings/users" && userRole !== "director") {
      return false;
    }
    return true;
  });

  return (
    <div className="h-full w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="flex h-full">
        <aside
          className={[
            "relative border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 transition-all duration-200",
            collapsed ? "w-20" : "w-72",
          ].join(" ")}
        >
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="absolute top-3 right-3 z-20 shrink-0 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-200/40 dark:bg-slate-900/40 hover:bg-slate-300/50 dark:hover:bg-slate-800/50 p-2"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div className="flex items-center gap-3 px-3 pt-14 pb-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company logo"
                className={`${collapsed ? "w-8 h-8" : "w-10 h-10"} rounded-lg object-cover border border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 flex-shrink-0`}
              />
            ) : (
              <div
                className={`${collapsed ? "w-8 h-8" : "w-10 h-10"} rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center text-xs opacity-60 flex-shrink-0`}
              >
                LOGO
              </div>
            )}

            {!collapsed && (
              <div className="min-w-0">
                <div className="text-lg font-semibold tracking-wide truncate text-slate-900 dark:text-slate-100">
                  {companyName || "Magnus Boys System"}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Fresh build • future-ready
                </div>
              </div>
            )}
          </div>

          <nav className="p-3 space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                      isActive
                        ? "bg-slate-300/60 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/30 dark:hover:bg-slate-800/30 hover:text-slate-900 dark:hover:text-white",
                      collapsed ? "justify-center" : "",
                    ].join(" ")
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-slate-200 dark:border-slate-800 p-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
              {userEmail || "Signed in"}
            </div>
            <button
              type="button"
              onClick={doLogout}
              className="mt-2 w-full bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300/50 dark:hover:bg-slate-700/50 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm transition"
            >
              Logout
            </button>
          </div>

          {!collapsed && (
            <div className="p-4 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-800">
              Tip: keep commits small + push often.
            </div>
          )}
        </aside>

              <main className="flex-1 bg-white dark:bg-slate-950">
          <div className="h-full overflow-auto relative">
            <div className="sticky top-0 z-40 flex items-center justify-end gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 px-4 py-3 backdrop-blur-sm">
              <ProjectSelector />

              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/80 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 transition-colors text-slate-900 dark:text-slate-100"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>

            <Outlet />
          </div>
        </main>
        </div>
    </div>
  );
}