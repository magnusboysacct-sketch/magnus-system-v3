// src/pages/DashboardPage.tsx - Full featured dashboard
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import { PageHeader, Card, CardHeader, Badge, Btn, Empty, cn } from "../components/ui";
import { FolderOpen, ShoppingCart, Users, DollarSign, ArrowRight, BarChart3, Hammer, CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}

type RemittanceAlert = { periodLabel: string; dueDate: string; totalDue: number; urgency: "soon" | "week" | "overdue" };

const REMITTANCE_URGENCY_STYLE: Record<string, { icon: string; label: string; cls: string }> = {
  soon: { icon: "🟡", label: "Remittance due soon", cls: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300" },
  week: { icon: "🔴", label: "Pay this week", cls: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300" },
  overdue: { icon: "🚨", label: "OVERDUE — penalties may apply", cls: "bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/30 text-red-900 dark:text-red-200" },
};

export default function DashboardPage() {
  const { projects, totalProjectsCount, loadingProjects, userRole } = useProjectContext();
  const [loading, setLoading] = useState(true);
  // active/total intentionally NOT tracked here — they're derived directly
  // from `projects` (context) below, the same source the "Active Projects"
  // list already uses. This used to run its own separate
  // supabase.from("projects") query, which could (and did) disagree with
  // the list — two independent fetches of the same underlying data, with
  // no guarantee they'd ever agree. Only budget/openPOs/workers still need
  // their own queries, since `projects` (context) doesn't carry budget and
  // POs/workers aren't projects at all.
  const [stats, setStats] = useState({ budget: 0, openPOs: 0, workers: 0 });
  const [remittanceAlert, setRemittanceAlert] = useState<RemittanceAlert | null>(null);
  // project_id -> { pct: average percent_complete across that project's tasks,
  // taskCount: how many tasks exist } — null taskCount means "not tracked
  // yet" (0 tasks), rendered distinctly from a genuine 0% so a brand-new
  // project doesn't look like a broken/stalled one.
  const [projectProgress, setProjectProgress] = useState<Record<string, { pct: number; taskCount: number }>>({});
  const nav = useNavigate();

  // Single source of truth for "which projects are active" — the KPI count
  // and the list below both read from this, so they can't disagree the way
  // they did when the KPI ran its own separate supabase.from("projects")
  // query with no guarantee of matching what ProjectContext had already
  // loaded.
  const activeProjectsAll = projects.filter(p => p.status === "active");
  const activeProjects = activeProjectsAll.slice(0, 6);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (!profile?.company_id) return;
        const cid = profile.company_id;
        const activeIds = activeProjectsAll.map(p => p.id);
        const [bud, po, wr] = await Promise.all([
          // Budget for the active projects context already resolved — not
          // a fresh company-wide fetch, so it can never disagree with what
          // "active" means here either.
          //
          // projects has no `budget` column at all (confirmed against the
          // schema — that was an unverified guess, unlike the other two
          // queries below, and errored on every load). This app's real
          // "budget" concept is BOQ-derived (sum of boq_items.amount per
          // project), already computed by the v_project_finance_summary
          // view and exposed as budget_total — the same source
          // lib/finance.ts's fetchAllProjectsFinanceSummary() uses.
          activeIds.length
            ? supabase.from("v_project_finance_summary").select("project_id,budget_total").in("project_id", activeIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          // 'pending' isn't a valid purchase_orders.status value (schema
          // only allows draft/issued/part_delivered/delivered/cancelled —
          // confirmed against the migration and ProcurementPage.tsx's own
          // usage) — this always matched zero rows. "Open" = not yet fully
          // delivered and not cancelled.
          supabase.from("purchase_orders").select("id").eq("company_id", cid).in("status", ["draft", "issued", "part_delivered"]),
          // workers has no is_active column at all (confirmed against the
          // table's own migration and WorkersPage.tsx, which uses a
          // three-state status column instead) — this query was erroring
          // every time and failing silently.
          supabase.from("workers").select("id").eq("company_id", cid).eq("status", "active"),
        ]);
        if (bud.error) console.error("Dashboard: budget query failed:", bud.error.message);
        if (po.error) console.error("Dashboard: open POs query failed:", po.error.message);
        if (wr.error) console.error("Dashboard: active workers query failed:", wr.error.message);
        const budgetTotal = (bud.data || []).reduce((s: number, p: any) => s + (p.budget_total || 0), 0);
        setStats({ budget: budgetTotal, openPOs: (po.data || []).length, workers: (wr.data || []).length });

        // Milestone/task completion — one batched query for the active
        // projects actually shown in the list below, not all projects.
        const shownIds = activeIds.slice(0, 6);
        if (shownIds.length) {
          const { data: tasks } = await supabase
            .from("project_tasks")
            .select("project_id,percent_complete")
            .in("project_id", shownIds);
          const grouped: Record<string, { sum: number; count: number }> = {};
          (tasks || []).forEach((t: any) => {
            const g = grouped[t.project_id] || { sum: 0, count: 0 };
            g.sum += Number(t.percent_complete) || 0;
            g.count += 1;
            grouped[t.project_id] = g;
          });
          const progress: Record<string, { pct: number; taskCount: number }> = {};
          shownIds.forEach(id => {
            const g = grouped[id];
            progress[id] = g ? { pct: Math.round(g.sum / g.count), taskCount: g.count } : { pct: 0, taskCount: 0 };
          });
          setProjectProgress(progress);
        }

        // accounts dropped — not a real user_profiles.role value (role-vocabulary
        // audit); office_user was explicitly ruled out for Finance-touching views.
        if (["director", "admin"].includes(userRole || "")) {
          const { data: remittances } = await supabase
            .from("government_remittances")
            .select("period_month, period_year, due_date, total_due")
            .eq("company_id", cid)
            .eq("status", "pending")
            .order("due_date", { ascending: true })
            .limit(1);
          const r = remittances?.[0];
          if (r) {
            const days = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
            const urgency = days < 0 ? "overdue" : days < 7 ? "week" : days <= 14 ? "soon" : null;
            if (urgency) {
              const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
              setRemittanceAlert({
                periodLabel: `${monthNames[r.period_month - 1]} ${r.period_year}`,
                dueDate: r.due_date,
                totalDue: Number(r.total_due) || 0,
                urgency,
              });
            }
          }
        }
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [userRole, projects]);

  // A single unified gate for both independent loading flags. Previously the
  // KPI row and the project list resolved at different times (one waiting on
  // `loading`, the other on `loadingProjects`), so real content popped in
  // piecemeal instead of all at once — that staggered pop-in was the
  // "flickering/jumping" reported, not a lack of parallel fetching (the stats
  // fetch already uses Promise.all).
  if (loading || loadingProjects) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-64"/>
      <div className="h-20 bg-slate-200 dark:bg-slate-800 rounded-2xl"/>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"/>
        ))}
      </div>
    </div>
  );

  const KPIS = [
    { label: "Active Projects", value: String(activeProjectsAll.length), sub: `of ${totalProjectsCount ?? projects.length} total`, icon: <FolderOpen size={14}/>, iconBg: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-300" },
    { label: "Active Budget",   value: fmt(stats.budget),    sub: undefined,                 icon: <DollarSign size={14}/>, iconBg: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-300" },
    { label: "Open POs",        value: String(stats.openPOs),sub: undefined,                 icon: <ShoppingCart size={14}/>, iconBg: "bg-amber-500/10 text-amber-500 dark:text-amber-300" },
    { label: "Active Workers",  value: String(stats.workers),sub: undefined,                 icon: <Users size={14}/>, iconBg: "bg-violet-500/10 text-violet-500 dark:text-violet-300" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      {/* Restrained brand accent — nods to the navy/gold ID card palette
          without re-theming the app's existing cyan/emerald accent scheme
          used everywhere else. */}
      <div className="h-[3px] bg-gradient-to-r from-[#C9A84C] via-[#C9A84C]/40 to-transparent"/>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        actions={<Btn variant="primary" icon={<Plus size={13}/>} onClick={() => nav("/projects")}>New Project</Btn>}
      />
      <div className="p-6 space-y-5">
        {remittanceAlert && (
          <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border flex-wrap", REMITTANCE_URGENCY_STYLE[remittanceAlert.urgency].cls)}>
            <span className="text-lg">{REMITTANCE_URGENCY_STYLE[remittanceAlert.urgency].icon}</span>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-semibold">{REMITTANCE_URGENCY_STYLE[remittanceAlert.urgency].label}</div>
              <div className="text-xs opacity-80 mt-0.5">
                {remittanceAlert.periodLabel} — JMD {remittanceAlert.totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })} due {new Date(remittanceAlert.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
            <Btn variant="secondary" size="sm" onClick={() => nav("/payroll")}>View Remittances</Btn>
          </div>
        )}

        {/* Compact KPI strip — one bordered container with divided columns,
            instead of 4 separate cards. Built directly here rather than
            shrinking the shared StatCard component, since other pages use
            StatCard at its normal size. */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] shadow-sm dark:shadow-none overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100 dark:divide-white/[0.05]">
            {KPIS.map(k => (
              <div key={k.label} className="p-3.5 flex items-center gap-2.5">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", k.iconBg)}>{k.icon}</div>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">{k.label}</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">{k.value}</div>
                  {k.sub && <div className="text-[9px] text-slate-500 dark:text-slate-600 mt-0.5">{k.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Projects list */}
          <div className="lg:col-span-2">
            <Card padding={false} className="shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Projects</span>
                <Btn size="xs" variant="ghost" onClick={() => nav("/projects")}>All projects <ArrowRight size={11}/></Btn>
              </div>
              {activeProjects.length === 0 ? (
                <Empty icon={<FolderOpen size={18}/>} title="No active projects" action={<Btn variant="primary" size="sm" onClick={() => nav("/projects")}>Create project</Btn>}/>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {activeProjects.map(p => {
                    const prog = projectProgress[p.id];
                    return (
                      <div key={p.id} onClick={() => nav(`/projects/${p.id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                          <Hammer size={13} className="text-cyan-500 dark:text-cyan-400"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                            {prog && prog.taskCount > 0 && (
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-500 flex-shrink-0">{prog.pct}%</span>
                            )}
                          </div>
                          {prog && prog.taskCount > 0 ? (
                            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", prog.pct >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-cyan-500 to-emerald-500")}
                                style={{ width: `${Math.min(100, prog.pct)}%` }}
                              />
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 dark:text-slate-700 mt-1">No tasks tracked yet</div>
                          )}
                        </div>
                        <ArrowRight size={13} className="text-slate-400 dark:text-slate-700 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors flex-shrink-0"/>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Card className="shadow-sm dark:shadow-none">
              <CardHeader title="Quick Actions"/>
              <div className="space-y-1.5">
                {[
                  { label: "New Estimate",   icon: <BarChart3 size={12}/>,   to: "/estimates",   color: "bg-blue-500/10 text-blue-400" },
                  { label: "Create PO",      icon: <ShoppingCart size={12}/>,to: "/procurement", color: "bg-amber-500/10 text-amber-400" },
                  { label: "Log Expense",    icon: <DollarSign size={12}/>,  to: "/expenses",    color: "bg-emerald-500/10 text-emerald-400" },
                  { label: "Takeoff",        icon: <Hammer size={12}/>,      to: "/takeoff",     color: "bg-cyan-500/10 text-cyan-400" },
                  { label: "Add Worker",     icon: <Users size={12}/>,       to: "/workers",     color: "bg-violet-500/10 text-violet-400" },
                  { label: "Cash Flow",      icon: <TrendingUp size={12}/>,  to: "/cash-flow",   color: "bg-pink-500/10 text-pink-400" },
                ].map(a => (
                  <button key={a.to} onClick={() => nav(a.to)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors text-left group">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", a.color)}>{a.icon}</div>
                    <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-300 transition-colors">{a.label}</span>
                    <ArrowRight size={10} className="ml-auto text-slate-400 dark:text-slate-700"/>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="shadow-sm dark:shadow-none">
              <CardHeader title="Status"/>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12}/> All services operational</div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-600"><Clock size={12}/> Auto-save enabled</div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-600"><Clock size={12}/> {new Date().toLocaleDateString()}</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
