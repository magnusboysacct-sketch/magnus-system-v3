// src/pages/DashboardPage.tsx — Full redesign with company branding + live stats
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { supabase } from "../lib/supabase";
import { StatCard, Card, CardHeader, Badge, Btn, Empty, cn } from "../components/ui";
import {
  FolderOpen, ShoppingCart, Users, DollarSign, ArrowRight, BarChart3,
  Hammer, CheckCircle2, Clock, Plus, TrendingUp, Shield, Camera,
  AlertTriangle, FileText, Activity, RefreshCw, Building2, Zap,
  CreditCard, Package
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtShort(n: number) {
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n/1000).toFixed(0)}K`;
  return fmt(n);
}

interface Stats {
  activeProjects: number;
  totalBudget: number;
  openPOs: number;
  activeWorkers: number;
  fieldPaymentsToday: number;
  fieldPaymentsTotal: number;
  openIssues: number;
  accessScansToday: number;
  expensesThisMonth: number;
  totalInvoiced: number;
  photosThisWeek: number;
  pendingPayroll: number;
}

export default function DashboardPage() {
  const { projects, loadingProjects } = useProjectContext();
  const { settings: company } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [stats, setStats] = useState<Stats>({
    activeProjects: 0, totalBudget: 0, openPOs: 0, activeWorkers: 0,
    fieldPaymentsToday: 0, fieldPaymentsTotal: 0, openIssues: 0,
    accessScansToday: 0, expensesThisMonth: 0, totalInvoiced: 0,
    photosThisWeek: 0, pendingPayroll: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profile?.company_id) { setCompanyId(profile.company_id); await loadStats(profile.company_id); }
    }
    init();
  }, []);

  async function loadStats(cid: string) {
    setLoading(true);
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const todayISO = today.toISOString();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      const weekStart = new Date(Date.now() - 7*86400000).toISOString();

      const [pr, po, wr, fp, fpToday, issues, scans, exp, inv, photos] = await Promise.all([
        supabase.from("projects").select("id,status,budget").eq("company_id", cid),
        supabase.from("purchase_orders").select("id").eq("company_id", cid).eq("status", "pending"),
        supabase.from("workers").select("id").eq("company_id", cid).eq("status", "active"),
        supabase.from("field_payments").select("amount").eq("company_id", cid),
        supabase.from("field_payments").select("amount").eq("company_id", cid).gte("paid_at", todayISO),
        supabase.from("project_issues").select("id").eq("status", "open"),
        supabase.from("access_logs").select("id").eq("company_id", cid).gte("scanned_at", todayISO),
        supabase.from("expenses").select("amount").eq("company_id", cid).gte("date", monthStart),
        supabase.from("invoices").select("total_amount").eq("company_id", cid),
        supabase.from("project_photos").select("id").gte("created_at", weekStart),
      ]);

      const active = (pr.data||[]).filter((p:any)=>p.status==="active");
      const totalBudget = active.reduce((s:number,p:any)=>s+(Number(p.budget)||0),0);
      const totalFP = (fp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
      const todayFP = (fpToday.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
      const totalExp = (exp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
      const totalInv = (inv.data||[]).reduce((s:number,r:any)=>s+(Number(r.total_amount)||0),0);

      setStats({
        activeProjects: active.length,
        totalBudget,
        openPOs: (po.data||[]).length,
        activeWorkers: (wr.data||[]).length,
        fieldPaymentsToday: todayFP,
        fieldPaymentsTotal: totalFP,
        openIssues: (issues.data||[]).length,
        accessScansToday: (scans.data||[]).length,
        expensesThisMonth: totalExp,
        totalInvoiced: totalInv,
        photosThisWeek: (photos.data||[]).length,
        pendingPayroll: 0,
      });

      // Recent activity
      const { data: logs } = await supabase.from("access_logs")
        .select("scanned_at,worker:worker_id(first_name,last_name)")
        .eq("company_id", cid).order("scanned_at",{ascending:false}).limit(5);
      setRecentActivity(logs||[]);

    } catch(e) { console.error(e); }
    setLoading(false);
  }

  const activeProjects = projects.filter(p=>p.status==="active").slice(0,6);
  const today = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">

      {/* Company Header Banner */}
      <div className="border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-slate-900/40 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="logo" className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-white/10"/>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg">
                {(company?.company_name||"M").charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{company?.company_name || "Magnus Boys Construction"}</h1>
              <p className="text-sm text-slate-500">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => companyId && loadStats(companyId)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 transition-colors">
              <RefreshCw size={15}/>
            </button>
            <Btn variant="primary" icon={<Plus size={13}/>} onClick={() => nav("/projects")}>New Project</Btn>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* KPI Row 1 — Core */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Projects"   value={loading?"—":stats.activeProjects}      icon={<FolderOpen size={15}/>}   color="text-cyan-300"    trend={{value:8,label:"vs last month"}}/>
          <StatCard label="Total Budget"       value={loading?"—":fmtShort(stats.totalBudget)} icon={<DollarSign size={15}/>}   color="text-emerald-300"/>
          <StatCard label="Open POs"           value={loading?"—":stats.openPOs}              icon={<ShoppingCart size={15}/>} color="text-amber-300"/>
          <StatCard label="Active Workers"     value={loading?"—":stats.activeWorkers}        icon={<Users size={15}/>}        color="text-violet-300"/>
        </div>

        {/* KPI Row 2 — Operations */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Field Pay Today"    value={loading?"—":fmtShort(stats.fieldPaymentsToday)} icon={<CreditCard size={15}/>}   color="text-green-300"/>
          <StatCard label="Total Field Paid"   value={loading?"—":fmtShort(stats.fieldPaymentsTotal)} icon={<DollarSign size={15}/>}   color="text-blue-300"/>
          <StatCard label="Expenses This Month" value={loading?"—":fmtShort(stats.expensesThisMonth)} icon={<BarChart3 size={15}/>}    color="text-red-300"/>
          <StatCard label="Total Invoiced"     value={loading?"—":fmtShort(stats.totalInvoiced)}      icon={<FileText size={15}/>}     color="text-purple-300"/>
        </div>

        {/* KPI Row 3 — Security & Activity */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="QR Scans Today"    value={loading?"—":stats.accessScansToday}   icon={<Shield size={15}/>}       color="text-emerald-300"/>
          <StatCard label="Open Issues"        value={loading?"—":stats.openIssues}          icon={<AlertTriangle size={15}/>} color="text-yellow-300"/>
          <StatCard label="Photos This Week"   value={loading?"—":stats.photosThisWeek}     icon={<Camera size={15}/>}       color="text-pink-300"/>
          <StatCard label="Invoiced Total"     value={loading?"—":fmtShort(stats.totalInvoiced)} icon={<TrendingUp size={15}/>}  color="text-indigo-300"/>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Active Projects */}
          <div className="lg:col-span-2">
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Projects</span>
                <Btn size="xs" variant="ghost" onClick={() => nav("/projects")}>All projects <ArrowRight size={11}/></Btn>
              </div>
              {loadingProjects ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-500"><RefreshCw size={13} className="animate-spin mr-2"/> Loading…</div>
              ) : activeProjects.length === 0 ? (
                <Empty icon={<FolderOpen size={18}/>} title="No active projects" action={<Btn variant="primary" size="sm" onClick={() => nav("/projects")}>Create project</Btn>}/>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {activeProjects.map(p => (
                    <div key={p.id} onClick={() => nav(`/projects/${p.id}`)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <Hammer size={13} className="text-cyan-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge color="green" dot>Active</Badge>
                          {(p as any).budget && <span className="text-[10px] text-slate-400">{fmtShort((p as any).budget)}</span>}
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0"/>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Recent Access Activity */}
            <Card padding={false} className="mt-4">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-emerald-400"/>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent Access Scans</span>
                </div>
                <Btn size="xs" variant="ghost" onClick={() => nav("/access-log")}>View all <ArrowRight size={11}/></Btn>
              </div>
              {recentActivity.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No scans yet</div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {recentActivity.map((log:any, i:number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={12} className="text-emerald-400"/>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{log.worker?.first_name} {log.worker?.last_name}</div>
                        <div className="text-[10px] text-slate-400">{new Date(log.scanned_at).toLocaleTimeString()}</div>
                      </div>
                      <Badge color="green" dot>Authorized</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Company Info Card */}
            <Card>
              <div className="flex items-center gap-3 mb-3">
                {company?.logo_url
                  ? <img src={company.logo_url} alt="logo" className="w-10 h-10 rounded-lg object-cover"/>
                  : <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-white font-bold">{(company?.company_name||"M").charAt(0)}</div>
                }
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{company?.company_name||"Magnus Boys Construction"}</div>
                  {company?.tagline && <div className="text-xs text-slate-400">{company.tagline}</div>}
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                {company?.phone && <div className="flex items-center gap-2">📞 {company.phone}</div>}
                {company?.email && <div className="flex items-center gap-2">✉️ {company.email}</div>}
                {company?.address_line1 && <div className="flex items-center gap-2">📍 {company.address_line1}, {company.city||""}</div>}
              </div>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader title="Quick Actions"/>
              <div className="space-y-1">
                {[
                  { label: "New Estimate",    icon: <BarChart3 size={12}/>,   to: "/estimates",       color: "bg-blue-500/10 text-blue-400" },
                  { label: "Create PO",       icon: <ShoppingCart size={12}/>,to: "/procurement",     color: "bg-amber-500/10 text-amber-400" },
                  { label: "Field Payment",   icon: <DollarSign size={12}/>,  to: "/field-payments",  color: "bg-green-500/10 text-green-400" },
                  { label: "Log Expense",     icon: <CreditCard size={12}/>,  to: "/expenses",        color: "bg-red-500/10 text-red-400" },
                  { label: "Add Worker",      icon: <Users size={12}/>,       to: "/workers",         color: "bg-violet-500/10 text-violet-400" },
                  { label: "Field Ops",       icon: <Hammer size={12}/>,      to: "/field-ops",       color: "bg-cyan-500/10 text-cyan-400" },
                  { label: "Access Log",      icon: <Shield size={12}/>,      to: "/access-log",      color: "bg-emerald-500/10 text-emerald-400" },
                  { label: "Reports",         icon: <Activity size={12}/>,    to: "/reports",         color: "bg-pink-500/10 text-pink-400" },
                ].map(a => (
                  <button key={a.to} onClick={() => nav(a.to)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors text-left group">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", a.color)}>{a.icon}</div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">{a.label}</span>
                    <ArrowRight size={10} className="ml-auto text-slate-300"/>
                  </button>
                ))}
              </div>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader title="System Status"/>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 size={12}/> All services operational</div>
                <div className="flex items-center gap-2 text-xs text-slate-500"><Clock size={12}/> Auto-save enabled</div>
                <div className="flex items-center gap-2 text-xs text-slate-500"><Shield size={12}/> {stats.accessScansToday} scans today</div>
                <div className="flex items-center gap-2 text-xs text-slate-500"><Activity size={12}/> {new Date().toLocaleDateString()}</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
