// src/pages/DashboardPage.tsx - Full featured dashboard
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import { PageHeader, StatCard, Card, CardHeader, Badge, Btn, Empty, cn } from "../components/ui";
import { FolderOpen, ShoppingCart, Users, DollarSign, ArrowRight, BarChart3, Hammer, CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type RemittanceAlert = { periodLabel: string; dueDate: string; totalDue: number; urgency: "soon" | "week" | "overdue" };

const REMITTANCE_URGENCY_STYLE: Record<string, { icon: string; label: string; cls: string }> = {
  soon: { icon: "🟡", label: "Remittance due soon", cls: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300" },
  week: { icon: "🔴", label: "Pay this week", cls: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300" },
  overdue: { icon: "🚨", label: "OVERDUE — penalties may apply", cls: "bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/30 text-red-900 dark:text-red-200" },
};

export default function DashboardPage() {
  const { projects, loadingProjects, userRole } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, budget: 0, openPOs: 0, workers: 0 });
  const [remittanceAlert, setRemittanceAlert] = useState<RemittanceAlert | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (!profile?.company_id) return;
        const cid = profile.company_id;
        const [pr, po, wr] = await Promise.all([
          supabase.from("projects").select("id,status,budget").eq("company_id", cid),
          supabase.from("purchase_orders").select("id").eq("company_id", cid).eq("status", "pending"),
          supabase.from("workers").select("id").eq("company_id", cid).eq("is_active", true),
        ]);
        const active = (pr.data || []).filter((p: any) => p.status === "active");
        setStats({ active: active.length, budget: active.reduce((s: number, p: any) => s + (p.budget || 0), 0), openPOs: (po.data || []).length, workers: (wr.data || []).length });

        if (["director", "admin", "accounts"].includes(userRole || "")) {
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
  }, [userRole]);

  const activeProjects = projects.filter(p => p.status === "active").slice(0, 6);

  // A single unified gate for both independent loading flags. Previously the
  // KPI row and the project list resolved at different times (one waiting on
  // `loading`, the other on `loadingProjects`), so real content popped in
  // piecemeal instead of all at once — that staggered pop-in was the
  // "flickering/jumping" reported, not a lack of parallel fetching (the stats
  // fetch already uses Promise.all).
  if (loading || loadingProjects) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-64"/>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"/>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"/>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        actions={<Btn variant="primary" icon={<Plus size={13}/>} onClick={() => nav("/projects")}>New Project</Btn>}
      />
      <div className="p-6 space-y-6">
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

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Projects" value={stats.active} icon={<FolderOpen size={15}/>} color="text-cyan-300" trend={{ value: 8, label: "vs last month" }}/>
          <StatCard label="Active Budget" value={fmt(stats.budget)} icon={<DollarSign size={15}/>} color="text-emerald-300"/>
          <StatCard label="Open POs" value={stats.openPOs} icon={<ShoppingCart size={15}/>} color="text-amber-300"/>
          <StatCard label="Active Workers" value={stats.workers} icon={<Users size={15}/>} color="text-violet-300"/>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Projects list */}
          <div className="lg:col-span-2">
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Projects</span>
                <Btn size="xs" variant="ghost" onClick={() => nav("/projects")}>All projects <ArrowRight size={11}/></Btn>
              </div>
              {activeProjects.length === 0 ? (
                <Empty icon={<FolderOpen size={18}/>} title="No active projects" action={<Btn variant="primary" size="sm" onClick={() => nav("/projects")}>Create project</Btn>}/>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {activeProjects.map(p => (
                    <div key={p.id} onClick={() => nav(`/projects/${p.id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <Hammer size={13} className="text-cyan-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge color="green" dot>Active</Badge>
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-slate-400 dark:text-slate-700 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors flex-shrink-0"/>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Card>
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

            <Card>
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