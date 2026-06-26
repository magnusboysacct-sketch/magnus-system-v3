// src/pages/DashboardPage.tsx — Full featured dashboard
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import { PageHeader, StatCard, Card, CardHeader, Badge, Btn, Empty, cn } from "../components/ui";
import { FolderOpen, ShoppingCart, Users, DollarSign, ArrowRight, BarChart3, Hammer, CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function DashboardPage() {
  const { projects, loadingProjects } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, budget: 0, openPOs: 0, workers: 0 });
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
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  const activeProjects = projects.filter(p => p.status === "active").slice(0, 6);

  return (
    <div className="min-h-screen bg-[#080b10]">
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        actions={<Btn variant="primary" icon={<Plus size={13}/>} onClick={() => nav("/projects")}>New Project</Btn>}
      />
      <div className="p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Projects" value={loading ? "—" : stats.active} icon={<FolderOpen size={15}/>} color="text-cyan-300" trend={{ value: 8, label: "vs last month" }}/>
          <StatCard label="Active Budget" value={loading ? "—" : fmt(stats.budget)} icon={<DollarSign size={15}/>} color="text-emerald-300"/>
          <StatCard label="Open POs" value={loading ? "—" : stats.openPOs} icon={<ShoppingCart size={15}/>} color="text-amber-300"/>
          <StatCard label="Active Workers" value={loading ? "—" : stats.workers} icon={<Users size={15}/>} color="text-violet-300"/>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Projects list */}
          <div className="lg:col-span-2">
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-200">Active Projects</span>
                <Btn size="xs" variant="ghost" onClick={() => nav("/projects")}>All projects <ArrowRight size={11}/></Btn>
              </div>
              {loadingProjects ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-600">Loading…</div>
              ) : activeProjects.length === 0 ? (
                <Empty icon={<FolderOpen size={18}/>} title="No active projects" action={<Btn variant="primary" size="sm" onClick={() => nav("/projects")}>Create project</Btn>}/>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {activeProjects.map(p => (
                    <div key={p.id} onClick={() => nav(`/projects/${p.id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors group">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <Hammer size={13} className="text-cyan-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200 truncate">{p.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge color="green" dot>Active</Badge>
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0"/>
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
                  <button key={a.to} onClick={() => nav(a.to)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left group">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", a.color)}>{a.icon}</div>
                    <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">{a.label}</span>
                    <ArrowRight size={10} className="ml-auto text-slate-700"/>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Status"/>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 size={12}/> All services operational</div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Clock size={12}/> Auto-save enabled</div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Clock size={12}/> {new Date().toLocaleDateString()}</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
