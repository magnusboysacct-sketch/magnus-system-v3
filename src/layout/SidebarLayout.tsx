import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, BriefcaseBusiness, FileSpreadsheet, Layers, Ruler, ShoppingCart, Landmark, ChartBar as BarChart3, Settings, CreditCard, ChevronLeft, ChevronRight, Sun, Moon, PackageCheck, DollarSign, TrendingUp, FileText, Receipt, CircleUser as UserCircle, ChevronDown, ChevronUp, Wallet, ChartBar as BarChart, Package, Library, ClipboardList, Truck, Calculator, Building2, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../hooks/useTheme";
import ProjectSelector from "../components/ProjectSelector";
import { useProjectContext } from "../context/ProjectContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useFinanceAccess } from "../hooks/useFinanceAccess";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  icon?: React.ElementType;
  collapsible?: boolean;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/field-ops", label: "Field Ops", icon: Smartphone },
    ],
  },
  {
    title: "CRM",
    icon: Building2,
    collapsible: true,
    items: [
      { to: "/clients", label: "Clients", icon: Users },
      { to: "/projects", label: "Projects", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "Estimating",
    icon: Calculator,
    collapsible: true,
    items: [
      { to: "/estimates", label: "Estimates", icon: FileSpreadsheet },
      { to: "/takeoff", label: "Takeoff", icon: Ruler },
      { to: "/boq", label: "BOQ Builder", icon: ClipboardList },
      { to: "/rates", label: "Smart Library", icon: Library },
      { to: "/assemblies", label: "Assemblies", icon: Layers },
    ],
  },
  {
    title: "Procurement",
    icon: Package,
    collapsible: true,
    items: [
      { to: "/procurement", label: "Purchase Orders", icon: ShoppingCart },
      { to: "/receiving", label: "Receiving", icon: PackageCheck },
    ],
  },
  {
    title: "Finance",
    icon: Wallet,
    collapsible: true,
    items: [
      { to: "/finance", label: "Finance Hub", icon: Landmark },
      { to: "/finance/transactions", label: "Finance Transactions", icon: CreditCard },
      { to: "/expenses", label: "Expenses", icon: Receipt },
      { to: "/cash-flow", label: "Cash Flow", icon: TrendingUp },
      { to: "/accounts-receivable", label: "Receivables", icon: FileText },
      { to: "/billing", label: "Billing", icon: CreditCard },
      { to: "/workers", label: "Payroll", icon: UserCircle },
    ],
  },
  {
    title: "Reports",
    icon: BarChart,
    collapsible: true,
    items: [
      { to: "/reports", label: "Analytics", icon: BarChart3 }
    ],
  },
  {
    title: "Admin",
    icon: ShieldCheck,
    collapsible: true,
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/settings/users", label: "User Manager", icon: Users },
    ],
  },
];

export default function SidebarLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("mb_sidebar_collapsed") === "1";
  });
  const [userEmail, setUserEmail] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { currentProjectId } = useProjectContext();
  const navigate = useNavigate();
  const location = useLocation();
  const financeAccess = useFinanceAccess();

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("mb_expanded_sections");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {
      "CRM": true,
      "Estimating": true,
      "Procurement": true,
      "Finance": true,
      "Reports": true,
      "Admin": true,
    };
  });

  useEffect(() => {
    localStorage.setItem("mb_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("mb_expanded_sections", JSON.stringify(expandedSections));
  }, [expandedSections]);

  useEffect(() => {
    const allowedWithoutProject = [
      "/projects",
      "/clients",
      "/settings",
      "/settings/users",
      "/settings/master-categories",
      "/settings/master-lists",
      "/billing",
      "/workers",
      "/cash-flow",
      "/accounts-receivable",
      "/expenses",
      "/finance",
    ];

    const pathAllowed = allowedWithoutProject.some((p) =>
      location.pathname.startsWith(p)
    );

    if (!currentProjectId && !pathAllowed) {
      navigate("/projects");
    }
  }, [currentProjectId, location.pathname, navigate]);

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

  function toggleSection(sectionTitle: string) {
    setExpandedSections(prev => ({
      ...prev,
      [sectionTitle]: !prev[sectionTitle]
    }));
  }

  const visibleSections = navSections
    .map((section) => {
      // Update Finance Transactions route based on current project
      if (section.title === "Finance") {
        return {
          ...section,
          items: section.items.map((item) => {
            if (item.label === "Finance Transactions") {
              return {
                ...item,
                to: currentProjectId ? `/projects/${currentProjectId}/finance/transactions` : "/finance/transactions"
              };
            }
            return item;
          })
        };
      }
      return section;
    })
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.to === "/settings/users" && userRole !== "director") {
          return false;
        }

        if (financeAccess.loading) {
          return true;
        }

        if (item.to === "/cash-flow" && !financeAccess.canViewCashFlow) {
          return false;
        }
        if (item.to === "/accounts-receivable" && !financeAccess.canViewCompanyReports) {
          return false;
        }
        if (item.to === "/expenses" && !financeAccess.canViewExpenses) {
          return false;
        }
        if (item.to === "/finance" && !financeAccess.canViewCompanyReports) {
          return false;
        }
        if (item.to === "/billing" && !financeAccess.canViewBilling) {
          return false;
        }

        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

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
                  {companyName || "Magnus System"}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  v3 • Construction ERP
                </div>
              </div>
            )}
          </div>

          <nav className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            {visibleSections.map((section) => {
              const isExpanded = expandedSections[section.title] !== false;
              const SectionIcon = section.icon;
              const isCollapsible = section.collapsible && !collapsed;

              return (
                <div key={section.title} className="space-y-1">
                  {section.title === "Main" ? (
                    section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            [
                              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                              isActive
                                ? "bg-slate-300/60 dark:bg-slate-800/60 text-slate-900 dark:text-white font-medium"
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
                    })
                  ) : (
                    <>
                      {isCollapsible ? (
                        <button
                          onClick={() => toggleSection(section.title)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 hover:bg-slate-200/30 dark:hover:bg-slate-800/30 transition"
                        >
                          {SectionIcon && <SectionIcon size={14} />}
                          <span className="flex-1 text-left">{section.title}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2">
                          {collapsed && SectionIcon ? (
                            <div className="w-full flex justify-center opacity-40">
                              <SectionIcon size={16} />
                            </div>
                          ) : (
                            <>
                              {SectionIcon && <SectionIcon size={14} className="text-slate-500 dark:text-slate-500" />}
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                                {section.title}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {(isExpanded || !isCollapsible) && (
                        <div className="space-y-1">
                          {section.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                  [
                                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                                    isActive
                                      ? "bg-slate-300/60 dark:bg-slate-800/60 text-slate-900 dark:text-white font-medium"
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
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 bg-slate-50 dark:bg-slate-950">
            <div className="border-t border-slate-200 dark:border-slate-800 p-3">
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
                Magnus System v3
              </div>
            )}
          </div>
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
