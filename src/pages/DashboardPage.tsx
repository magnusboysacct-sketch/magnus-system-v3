// src/pages/DashboardPage.tsx — v2 Rebuild: dark theme, JMD, AI morning briefing
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { magnusAI } from "../lib/magnusAI";
import { supabase } from "../lib/supabase";
import {
  FolderOpen, ShoppingCart, Users, DollarSign, ArrowRight, BarChart3,
  Hammer, CheckCircle2, Clock, Plus, TrendingUp, Shield, Camera,
  AlertTriangle, FileText, Activity, RefreshCw, Zap,
  CreditCard, Package, Bot, Sparkles, Loader, X, Star
} from "lucide-react";

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"JMD", maximumFractionDigits:0 }).format(n);
}
function fmtShort(n: number) {
  if (n >= 1000000) return `J$${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `J$${(n/1000).toFixed(0)}K`;
  return fmtJMD(n);
}

interface Stats {
  activeProjects: number; totalBudget: number; openPOs: number;
  activeWorkers: number; fieldPaymentsToday: number; fieldPaymentsTotal: number;
  openIssues: number; accessScansToday: number; expensesThisMonth: number;
  totalInvoiced: number; photosThisWeek: number;
}

export default function DashboardPage() {
  const { projects, loadingProjects } = useProjectContext();
  const { settings: company } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [stats, setStats] = useState<Stats>({
    activeProjects:0, totalBudget:0, openPOs:0, activeWorkers:0,
    fieldPaymentsToday:0, fieldPaymentsTotal:0, openIssues:0,
    accessScansToday:0, expensesThisMonth:0, totalInvoiced:0, photosThisWeek:0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [aiBriefing, setAiBriefing] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showBriefing, setShowBriefing] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    async function init() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data:profile } = await supabase.from("user_profiles").select("company_id").eq("id",user.id).maybeSingle();
      if (profile?.company_id) { setCompanyId(profile.company_id); await loadStats(profile.company_id); }
    }
    init();
  }, []);

  async function loadStats(cid: string) {
    setLoading(true);
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const todayISO = today.toISOString();
      const monthStart = new Date(today.getFullYear(),today.getMonth(),1).toISOString();
      const weekStart = new Date(Date.now()-7*86400000).toISOString();

      const [pr,po,wr,fp,fpToday,issues,scans,exp,inv,photos] = await Promise.all([
        supabase.from("projects").select("id,status,budget").eq("company_id",cid),
        supabase.from("purchase_orders").select("id").eq("company_id",cid).eq("status","pending"),
        supabase.from("workers").select("id").eq("company_id",cid).eq("status","active"),
        supabase.from("field_payments").select("amount").eq("company_id",cid),
        supabase.from("field_payments").select("amount").eq("company_id",cid).gte("paid_at",todayISO),
        supabase.from("project_issues").select("id").eq("status","open"),
        supabase.from("access_logs").select("id").eq("company_id",cid).gte("scanned_at",todayISO),
        supabase.from("expenses").select("amount").eq("company_id",cid).gte("date",monthStart),
        supabase.from("invoices").select("total_amount").eq("company_id",cid),
        supabase.from("project_photos").select("id").gte("created_at",weekStart),
      ]);

      const active=(pr.data||[]).filter((p:any)=>p.status==="active");
      const s: Stats = {
        activeProjects: active.length,
        totalBudget: active.reduce((s:number,p:any)=>s+(Number(p.budget)||0),0),
        openPOs: (po.data||[]).length,
        activeWorkers: (wr.data||[]).length,
        fieldPaymentsTotal: (fp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0),
        fieldPaymentsToday: (fpToday.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0),
        openIssues: (issues.data||[]).length,
        accessScansToday: (scans.data||[]).length,
        expensesThisMonth: (exp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0),
        totalInvoiced: (inv.data||[]).reduce((s:number,r:any)=>s+(Number(r.total_amount)||0),0),
        photosThisWeek: (photos.data||[]).length,
      };
      setStats(s);

      const { data:logs } = await supabase.from("access_logs")
        .select("scanned_at,worker:worker_id(first_name,last_name)")
        .eq("company_id",cid).order("scanned_at",{ascending:false}).limit(5);
      setRecentActivity(logs||[]);
    } catch(e){ console.error(e); }
    setLoading(false);
  }

  async function getAIBriefing() {
    setAiLoading(true); setAiBriefing("");
    try {
      const text = await magnusAI.chat(
        `You are a construction business assistant for ${company?.company_name||"Magnus Boys Construction"} in Jamaica.
Give a brief morning briefing based on this data:
- Active projects: ${stats.activeProjects}
- Active workers: ${stats.activeWorkers}
- Field payments today: ${fmtJMD(stats.fieldPaymentsToday)}
- Open issues: ${stats.openIssues}
- Open purchase orders: ${stats.openPOs}
- Expenses this month: ${fmtJMD(stats.expensesThisMonth)}
- Total invoiced: ${fmtJMD(stats.totalInvoiced)}

Give 3 brief points: what looks good, what needs attention, and one action item for today.
Keep it under 80 words. Be direct and practical for a Jamaica construction company.`
      );
      setAiBriefing(String(text).trim());
    } catch { setAiBriefing("Could not load briefing right now."); }
    setAiLoading(false);
  }

  const activeProjects = projects.filter(p=>p.status==="active").slice(0,6);
  const today = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

  const KPI_ROWS = [
    [
      { label:"Active Projects",    value:stats.activeProjects,                    icon:<FolderOpen size={14}/>,    color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20" },
      { label:"Total Budget",       value:fmtShort(stats.totalBudget),             icon:<DollarSign size={14}/>,    color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20" },
      { label:"Open POs",           value:stats.openPOs,                           icon:<ShoppingCart size={14}/>,  color:"text-amber-400",   bg:"bg-amber-500/10",   border:"border-amber-500/20" },
      { label:"Active Workers",     value:stats.activeWorkers,                     icon:<Users size={14}/>,         color:"text-violet-400",  bg:"bg-violet-500/10",  border:"border-violet-500/20" },
    ],
    [
      { label:"Field Pay Today",    value:fmtShort(stats.fieldPaymentsToday),      icon:<CreditCard size={14}/>,    color:"text-green-400",   bg:"bg-green-500/10",   border:"border-green-500/20" },
      { label:"Total Field Paid",   value:fmtShort(stats.fieldPaymentsTotal),      icon:<DollarSign size={14}/>,    color:"text-blue-400",    bg:"bg-blue-500/10",    border:"border-blue-500/20" },
      { label:"Expenses / Month",   value:fmtShort(stats.expensesThisMonth),       icon:<BarChart3 size={14}/>,     color:"text-red-400",     bg:"bg-red-500/10",     border:"border-red-500/20" },
      { label:"Total Invoiced",     value:fmtShort(stats.totalInvoiced),           icon:<FileText size={14}/>,      color:"text-purple-400",  bg:"bg-purple-500/10",  border:"border-purple-500/20" },
    ],
    [
      { label:"QR Scans Today",     value:stats.accessScansToday,                  icon:<Shield size={14}/>,        color:"text-teal-400",    bg:"bg-teal-500/10",    border:"border-teal-500/20" },
      { label:"Open Issues",        value:stats.openIssues,                        icon:<AlertTriangle size={14}/>, color:"text-yellow-400",  bg:"bg-yellow-500/10",  border:"border-yellow-500/20" },
      { label:"Photos / Week",      value:stats.photosThisWeek,                    icon:<Camera size={14}/>,        color:"text-pink-400",    bg:"bg-pink-500/10",    border:"border-pink-500/20" },
      { label:"Projects Running",   value:stats.activeProjects,                    icon:<TrendingUp size={14}/>,    color:"text-indigo-400",  bg:"bg-indigo-500/10",  border:"border-indigo-500/20" },
    ],
  ];

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="logo" className="w-12 h-12 rounded-xl object-cover border border-white/10"/>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-cyan-900/30">
                {(company?.company_name||"M").charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-100">{company?.company_name||"Magnus Boys Construction"}</h1>
              <p className="text-xs text-slate-500">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => companyId && loadStats(companyId)}
              className="p-2 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition">
              <RefreshCw size={14} className={loading?"animate-spin":""}/>
            </button>
            <button onClick={getAIBriefing} disabled={aiLoading||loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-xs text-white font-bold transition disabled:opacity-40">
              {aiLoading ? <Loader size={12} className="animate-spin"/> : <Bot size={12}/>}
              {aiLoading?"Briefing…":"AI Briefing"}
            </button>
            <button onClick={() => nav("/projects")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-bold transition">
              <Plus size={12}/> New Project
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* AI Briefing */}
        {(aiBriefing||aiLoading) && showBriefing && (
          <div className="rounded-xl border border-purple-500/25 bg-purple-500/[0.06] px-5 py-4 flex gap-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-white"/>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">AI Morning Briefing</span>
                <span className="text-[9px] text-slate-600">· {new Date().toLocaleDateString()}</span>
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader size={11} className="animate-spin"/> Analyzing your business data…
                </div>
              ) : (
                <p className="text-sm text-slate-300 leading-relaxed">{aiBriefing}</p>
              )}
            </div>
            <button onClick={() => setShowBriefing(false)} className="text-slate-700 hover:text-slate-400 flex-shrink-0">
              <X size={14}/>
            </button>
          </div>
        )}

        {/* KPI Rows */}
        {KPI_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {row.map(card => (
              <div key={card.label} className={`rounded-xl border ${card.border} ${card.bg} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={card.color}>{card.icon}</span>
                </div>
                <div className={`text-xl font-bold ${card.color}`}>
                  {loading ? <span className="text-slate-700">—</span> : card.value}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider font-semibold">{card.label}</div>
              </div>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Active Projects + Recent Access */}
          <div className="lg:col-span-2 space-y-4">

            {/* Active Projects */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <FolderOpen size={14} className="text-cyan-400"/>
                  <span className="text-sm font-bold text-slate-200">Active Projects</span>
                </div>
                <button onClick={() => nav("/projects")}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition">
                  All projects <ArrowRight size={11}/>
                </button>
              </div>
              {loadingProjects ? (
                <div className="flex items-center justify-center py-10 text-xs text-slate-600 gap-2">
                  <RefreshCw size={12} className="animate-spin"/> Loading…
                </div>
              ) : activeProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <FolderOpen size={20} className="text-slate-700"/>
                  <p className="text-xs text-slate-600">No active projects</p>
                  <button onClick={() => nav("/projects")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition">
                    <Plus size={11}/> Create project
                  </button>
                </div>
              ) : activeProjects.map(p => (
                <div key={p.id} onClick={() => nav(`/projects/${p.id}`)}
                  className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer transition group">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Hammer size={12} className="text-cyan-400"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">Active</span>
                      {(p as any).budget && <span className="text-[10px] text-slate-600">{fmtShort((p as any).budget)}</span>}
                    </div>
                  </div>
                  <ArrowRight size={12} className="text-slate-700 group-hover:text-slate-400 transition flex-shrink-0"/>
                </div>
              ))}
            </div>

            {/* Recent Access Scans */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-emerald-400"/>
                  <span className="text-sm font-bold text-slate-200">Recent Access Scans</span>
                </div>
                <button onClick={() => nav("/access-log")}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition">
                  View all <ArrowRight size={11}/>
                </button>
              </div>
              {recentActivity.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-600">No scans yet today</div>
              ) : recentActivity.map((log:any, i:number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={12} className="text-emerald-400"/>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-300">{log.worker?.first_name} {log.worker?.last_name}</div>
                    <div className="text-[10px] text-slate-600">{new Date(log.scanned_at).toLocaleTimeString()}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">Authorized</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">

            {/* Company Card */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-4">
              <div className="flex items-center gap-3 mb-3">
                {company?.logo_url
                  ? <img src={company.logo_url} alt="logo" className="w-10 h-10 rounded-lg object-cover border border-white/10"/>
                  : <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm">
                      {(company?.company_name||"M").charAt(0)}
                    </div>
                }
                <div>
                  <div className="text-sm font-bold text-slate-100">{company?.company_name||"Magnus Boys Construction"}</div>
                  {company?.tagline && <div className="text-[10px] text-slate-500">{company.tagline}</div>}
                </div>
              </div>
              <div className="space-y-1.5">
                {company?.phone && <div className="flex items-center gap-2 text-[11px] text-slate-500">📞 {company.phone}</div>}
                {company?.email && <div className="flex items-center gap-2 text-[11px] text-slate-500">✉️ {company.email}</div>}
                {company?.address_line1 && <div className="flex items-center gap-2 text-[11px] text-slate-500">📍 {company.address_line1}{company.city?`, ${company.city}`:""}</div>}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Quick Actions</span>
              </div>
              <div className="p-2">
                {[
                  { label:"New Estimate",  icon:<BarChart3 size={12}/>,    to:"/estimates",      color:"text-blue-400 bg-blue-500/10" },
                  { label:"Create PO",     icon:<ShoppingCart size={12}/>, to:"/procurement",    color:"text-amber-400 bg-amber-500/10" },
                  { label:"Field Payment", icon:<DollarSign size={12}/>,   to:"/field-payments", color:"text-green-400 bg-green-500/10" },
                  { label:"Log Expense",   icon:<CreditCard size={12}/>,   to:"/expenses",       color:"text-red-400 bg-red-500/10" },
                  { label:"Add Worker",    icon:<Users size={12}/>,        to:"/workers",        color:"text-violet-400 bg-violet-500/10" },
                  { label:"Field Ops",     icon:<Hammer size={12}/>,       to:"/field-ops",      color:"text-cyan-400 bg-cyan-500/10" },
                  { label:"Access Log",    icon:<Shield size={12}/>,       to:"/access-log",     color:"text-emerald-400 bg-emerald-500/10" },
                  { label:"Reports",       icon:<Activity size={12}/>,     to:"/reports",        color:"text-pink-400 bg-pink-500/10" },
                ].map(a => (
                  <button key={a.to} onClick={() => nav(a.to)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition text-left group">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${a.color}`}>{a.icon}</div>
                    <span className="text-xs text-slate-500 group-hover:text-slate-300 transition">{a.label}</span>
                    <ArrowRight size={10} className="ml-auto text-slate-700 group-hover:text-slate-500"/>
                  </button>
                ))}
              </div>
            </div>

            {/* System Status */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">System Status</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 size={11}/> All services operational</div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Clock size={11}/> Auto-save enabled</div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Shield size={11}/> {stats.accessScansToday} scans today</div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Activity size={11}/> {new Date().toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
