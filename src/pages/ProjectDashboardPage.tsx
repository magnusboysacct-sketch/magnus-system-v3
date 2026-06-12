// src/pages/ProjectDashboardPage.tsx — v2 Rebuild: dark theme, JMD, no old UI components
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Ruler, ShoppingCart, Wallet, FileText, BarChart3,
  ArrowRight, DollarSign, Users, Package, Receipt,
  Clock, CheckCircle2, AlertCircle, Hammer,
  TrendingUp, TrendingDown, Building2, RefreshCw,
  ChevronLeft, Activity, Calendar
} from "lucide-react";

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}
function fmtShort(n: number) {
  if (n >= 1000000) return `J$${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `J$${(n/1000).toFixed(0)}K`;
  return fmtJMD(n);
}
function fmtTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff/60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}

type Tab = "overview" | "financials" | "team" | "activity";

const STATUS_CFG: Record<string, { color: string; bg: string; border: string }> = {
  active:    { color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20" },
  planning:  { color:"text-blue-400",    bg:"bg-blue-500/10",    border:"border-blue-500/20" },
  on_hold:   { color:"text-amber-400",   bg:"bg-amber-500/10",   border:"border-amber-500/20" },
  completed: { color:"text-purple-400",  bg:"bg-purple-500/10",  border:"border-purple-500/20" },
  cancelled: { color:"text-red-400",     bg:"bg-red-500/10",     border:"border-red-500/20" },
};

export default function ProjectDashboardPage() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [stats, setStats] = useState({
    totalExpenses:0, openPOs:0, totalPOValue:0,
    activeWorkers:0, boqTotal:0, boqItems:0,
  });
  const [activity, setActivity] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string|null>(null);

  useEffect(() => { if (projectId) loadAll(); }, [projectId]);

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const { data:proj, error:pe } = await supabase.from("projects")
        .select("id,name,status,client_id,start_date,end_date,description,company_id")
        .eq("id", projectId!).maybeSingle();
      if (pe) throw pe;
      if (!proj) throw new Error("Project not found");
      setProject(proj);

      if (proj.client_id) {
        const { data:cl } = await supabase.from("clients")
          .select("id,name,email,phone,address").eq("id",proj.client_id).maybeSingle();
        setClient(cl);
      }

      const [expRes, poRes, workerRes] = await Promise.allSettled([
        supabase.from("expenses").select("amount,description,created_at").eq("project_id",projectId!),
        supabase.from("purchase_orders").select("id,status,total_amount,created_at,supplier_name").eq("project_id",projectId!),
        supabase.from("workers").select("id,first_name,last_name,worker_type,status").eq("company_id", proj.company_id || "").eq("status","active").limit(30),
      ]);

      const expenses = expRes.status==="fulfilled" ? expRes.value.data||[] : [];
      const pos = poRes.status==="fulfilled" ? poRes.value.data||[] : [];
      const workerList = workerRes.status==="fulfilled" ? workerRes.value.data||[] : [];
      setWorkers(workerList);

      setStats({
        totalExpenses: expenses.reduce((s:number,e:any)=>s+(Number(e.amount)||0),0),
        openPOs: pos.filter((p:any)=>["pending","submitted","approved"].includes(p.status)).length,
        totalPOValue: pos.reduce((s:number,p:any)=>s+(Number(p.total_amount)||0),0),
        activeWorkers: workerList.length,
        boqTotal: 0, boqItems: 0,
      });

      const acts: any[] = [];
      pos.slice(0,5).forEach((p:any) => acts.push({ id:p.id, type:"po", label:`PO to ${p.supplier_name||"Supplier"}`, amount:p.total_amount, time:p.created_at, status:p.status }));
      expenses.slice(0,5).forEach((e:any,i:number) => acts.push({ id:`exp-${i}`, type:"expense", label:e.description||"Expense", amount:e.amount, time:e.created_at||new Date().toISOString() }));
      acts.sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime());
      setActivity(acts.slice(0,8));
    } catch(e:any) { setError(e.message||"Failed to load project"); }
    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#080b10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-xs text-slate-600">
        <RefreshCw size={14} className="animate-spin text-cyan-500"/> Loading project…
      </div>
    </div>
  );

  if (error || !project) return (
    <div className="min-h-screen bg-[#080b10] flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <AlertCircle size={32} className="text-red-400 mx-auto"/>
        <div className="text-sm text-slate-300">{error||"Project not found"}</div>
        <button onClick={() => nav("/projects")} className="text-xs text-cyan-400 hover:text-cyan-300">← Back to Projects</button>
      </div>
    </div>
  );

  const budget = 0; // budget column not in projects table
  const spent = stats.totalExpenses;
  const budgetPct = budget > 0 ? Math.min(100, (spent/budget)*100) : 0;
  const remaining = budget - spent;
  const statusCfg = STATUS_CFG[project.status] || STATUS_CFG.planning;

  const MODULES = [
    { label:"BOQ Builder",  icon:<FileText size={15}/>,    to:`/projects/${projectId}/boq`,        color:"text-blue-400",    bg:"bg-blue-500/10",    border:"border-blue-500/20",   desc:"Bills of quantities" },
    { label:"Takeoff",      icon:<Ruler size={15}/>,       to:`/projects/${projectId}/takeoff`,     color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20",   desc:"PDF measurements" },
    { label:"Procurement",  icon:<ShoppingCart size={15}/>,to:`/projects/${projectId}/procurement`, color:"text-amber-400",   bg:"bg-amber-500/10",   border:"border-amber-500/20",  desc:"Purchase orders" },
    { label:"Finance",      icon:<Wallet size={15}/>,      to:`/projects/${projectId}/finance`,     color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20",desc:"Project finances" },
    { label:"Reports",      icon:<BarChart3 size={15}/>,   to:`/projects/${projectId}/reports`,     color:"text-violet-400",  bg:"bg-violet-500/10",  border:"border-violet-500/20", desc:"Analytics" },
  ];

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key:"overview",   label:"Overview" },
    { key:"financials", label:"Financials" },
    { key:"team",       label:"Team", count:stats.activeWorkers },
    { key:"activity",   label:"Activity", count:activity.length },
  ];

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => nav("/projects")}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-600 hover:text-slate-300 transition flex-shrink-0">
              <ChevronLeft size={16}/>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 truncate">{project.name}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                  {project.status?.replace("_"," ")}
                </span>
              </div>
              <p className="text-xs text-slate-500">{client?.name || "No client assigned"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={loadAll} className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-500 hover:text-slate-300 transition">
              <RefreshCw size={13}/>
            </button>
            <button onClick={() => nav(`/projects/${projectId}/takeoff`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 font-semibold transition">
              <Ruler size={12}/> Takeoff
            </button>
            <button onClick={() => nav(`/projects/${projectId}/boq`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition">
              <FileText size={12}/> BOQ
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-6">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition ${tab===t.key ? "border-cyan-500 text-cyan-300" : "border-transparent text-slate-700 hover:text-slate-500"}`}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab===t.key ? "bg-cyan-500/20 text-cyan-400" : "bg-white/[0.06] text-slate-600"}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* ── Overview ── */}
        {tab === "overview" && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label:"Budget",       value:budget ? fmtShort(budget) : "Not set", sub:budget ? `${fmtShort(remaining)} remaining` : undefined, color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20", icon:<DollarSign size={14}/> },
                { label:"Spent",        value:fmtShort(spent), sub:budget?`${budgetPct.toFixed(0)}% of budget`:undefined, color:spent>budget*0.9?"text-red-400":"text-amber-400", bg:spent>budget*0.9?"bg-red-500/10":"bg-amber-500/10", border:spent>budget*0.9?"border-red-500/20":"border-amber-500/20", icon:<Receipt size={14}/> },
                { label:"Open POs",     value:stats.openPOs, sub:`${fmtShort(stats.totalPOValue)} total`, color:"text-blue-400", bg:"bg-blue-500/10", border:"border-blue-500/20", icon:<ShoppingCart size={14}/> },
                { label:"Team Size",    value:stats.activeWorkers, sub:"active workers", color:"text-violet-400", bg:"bg-violet-500/10", border:"border-violet-500/20", icon:<Users size={14}/> },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border ${card.border} ${card.bg} p-4`}>
                  <div className={`${card.color} mb-2`}>{card.icon}</div>
                  <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{card.label}</div>
                  {card.sub && <div className="text-[10px] text-slate-700 mt-0.5">{card.sub}</div>}
                </div>
              ))}
            </div>

            {/* Budget bar */}
            {budget > 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold text-slate-200">Budget Utilization</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">{fmtJMD(spent)} spent of {fmtJMD(budget)}</div>
                  </div>
                  <div className={`text-xl font-bold ${budgetPct > 90 ? "text-red-400" : budgetPct > 70 ? "text-amber-400" : "text-cyan-400"}`}>
                    {budgetPct.toFixed(1)}%
                  </div>
                </div>
                <div className="w-full bg-white/[0.06] rounded-full h-2.5">
                  <div className={`h-2.5 rounded-full transition-all ${budgetPct>90?"bg-red-500":budgetPct>70?"bg-amber-500":"bg-cyan-500"}`}
                    style={{width:`${budgetPct}%`}}/>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-slate-700">{fmtJMD(spent)} used</span>
                  <span className={`text-[10px] font-semibold ${remaining<0?"text-red-400":"text-slate-600"}`}>
                    {remaining<0 ? `${fmtJMD(Math.abs(remaining))} over budget` : `${fmtJMD(remaining)} remaining`}
                  </span>
                </div>
              </div>
            )}

            {/* Module links */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Project Modules</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5">
                {MODULES.map((m,i) => (
                  <button key={m.to} onClick={() => nav(m.to)}
                    className={`flex flex-col items-center gap-2 p-5 hover:bg-white/[0.03] transition group ${i < MODULES.length-1 ? "border-r border-white/[0.04]" : ""}`}>
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110 ${m.bg} ${m.border}`}>
                      <span className={m.color}>{m.icon}</span>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-slate-400 group-hover:text-white transition">{m.label}</div>
                      <div className="text-[9px] text-slate-700 mt-0.5">{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Project info + Client */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-4">Project Details</div>
                <div className="space-y-3">
                  {[
                    { label:"Status",    value:<span className={`text-xs font-bold capitalize ${statusCfg.color}`}>{project.status?.replace("_"," ")}</span> },
                    { label:"BOQ Items", value:<span className="text-xs text-slate-300 font-semibold">{stats.boqItems || "—"}</span> },
                    { label:"Open POs",  value:<span className="text-xs text-slate-300 font-semibold">{stats.openPOs}</span> },
                    { label:"PO Value",  value:<span className="text-xs text-slate-300 font-semibold">{stats.totalPOValue ? fmtShort(stats.totalPOValue) : "—"}</span> },
                    { label:"Start",     value:<span className="text-xs text-slate-300 font-semibold">{project.start_date ? new Date(project.start_date).toLocaleDateString() : "—"}</span> },
                    { label:"End",       value:<span className="text-xs text-slate-300 font-semibold">{project.end_date ? new Date(project.end_date).toLocaleDateString() : "—"}</span> },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-600">{row.label}</span>
                      {row.value}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-4">Client</div>
                {client ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <Building2 size={16} className="text-cyan-400"/>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-200">{client.name}</div>
                        {client.email && <div className="text-[10px] text-slate-600">{client.email}</div>}
                      </div>
                    </div>
                    {client.phone && (
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-600">Phone</span>
                        <span className="text-xs text-slate-300 font-semibold">{client.phone}</span>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-600">Address</span>
                        <span className="text-xs text-slate-300 font-semibold truncate max-w-[160px]">{client.address}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <Building2 size={20} className="text-slate-700"/>
                    <p className="text-xs text-slate-600">No client assigned</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Financials ── */}
        {tab === "financials" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label:"Total Budget",    value:budget ? fmtShort(budget) : "—",    color:"text-emerald-400", icon:<DollarSign size={14}/> },
                { label:"Total Spent",     value:fmtShort(spent),                    color:"text-amber-400",   icon:<TrendingDown size={14}/> },
                { label:"Remaining",       value:budget ? fmtShort(Math.abs(remaining)) : "—", color:remaining<0?"text-red-400":"text-cyan-400", icon:<TrendingUp size={14}/> },
                { label:"PO Commitments",  value:fmtShort(stats.totalPOValue),       color:"text-blue-400",    icon:<Package size={14}/> },
              ].map(card => (
                <div key={card.label} className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-4">
                  <div className={`${card.color} mb-2`}>{card.icon}</div>
                  <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{card.label}</div>
                </div>
              ))}
            </div>

            {budget > 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-slate-200">Budget vs Spent</span>
                  <span className={`text-sm font-bold ${budgetPct>90?"text-red-400":budgetPct>70?"text-amber-400":"text-cyan-400"}`}>{budgetPct.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-white/[0.06] rounded-full h-3">
                  <div className={`h-3 rounded-full ${budgetPct>90?"bg-red-500":budgetPct>70?"bg-amber-500":"bg-cyan-500"}`} style={{width:`${budgetPct}%`}}/>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 text-center">
                  {[
                    { label:"Budget", value:fmtJMD(budget), color:"text-slate-200" },
                    { label:"Spent",  value:fmtJMD(spent),  color:"text-amber-400" },
                    { label:remaining<0?"Over Budget":"Remaining", value:fmtJMD(Math.abs(remaining)), color:remaining<0?"text-red-400":"text-emerald-400" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{s.label}</div>
                      <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Quick Links</span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {[
                  { label:"Expenses",        to:"/expenses",           icon:<Receipt size={13}/>,      color:"text-amber-400" },
                  { label:"Purchase Orders", to:`/projects/${projectId}/procurement`, icon:<ShoppingCart size={13}/>, color:"text-blue-400" },
                  { label:"Cash Flow",       to:"/cash-flow",          icon:<TrendingUp size={13}/>,   color:"text-cyan-400" },
                  { label:"Accounts Recv.",  to:"/accounts-receivable",icon:<FileText size={13}/>,     color:"text-violet-400" },
                ].map(l => (
                  <button key={l.to} onClick={() => nav(l.to)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] transition text-left">
                    <span className={l.color}>{l.icon}</span>
                    <span className="text-xs text-slate-400">{l.label}</span>
                    <ArrowRight size={11} className="ml-auto text-slate-700"/>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Team ── */}
        {tab === "team" && (
          <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-slate-200">Active Workers</span>
              <button onClick={() => nav("/workers")}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition">
                Manage <ArrowRight size={11}/>
              </button>
            </div>
            {workers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Users size={20} className="text-slate-700"/>
                <p className="text-xs text-slate-600">No active workers found</p>
                <button onClick={() => nav("/workers")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition">
                  <Users size={11}/> Go to Workers
                </button>
              </div>
            ) : workers.map((w:any) => (
              <div key={w.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Users size={12} className="text-violet-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200">{w.first_name} {w.last_name}</div>
                  <div className="text-[10px] text-slate-600">{w.worker_type || "General"}</div>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">{w.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Activity ── */}
        {tab === "activity" && (
          <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-slate-200">Recent Activity</span>
            </div>
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Clock size={20} className="text-slate-700"/>
                <p className="text-xs text-slate-600">No activity yet</p>
              </div>
            ) : activity.map((a:any) => {
              const typeMap: Record<string,{color:string;bg:string;icon:React.ReactNode}> = {
                expense: { color:"text-amber-400", bg:"bg-amber-500/10", icon:<Receipt size={11}/> },
                po:      { color:"text-blue-400",  bg:"bg-blue-500/10",  icon:<Package size={11}/> },
              };
              const t = typeMap[a.type] || typeMap.po;
              return (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0">
                  <div className={`w-7 h-7 rounded-lg ${t.bg} flex items-center justify-center flex-shrink-0`}>
                    <span className={t.color}>{t.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-300 truncate">{a.label}</div>
                    <div className="text-[10px] text-slate-700 capitalize">{a.type} · {fmtTime(a.time)}</div>
                  </div>
                  {a.amount !== undefined && (
                    <div className="text-xs font-bold text-slate-300 flex-shrink-0">{fmtShort(Number(a.amount||0))}</div>
                  )}
                  {a.status && (
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${a.status==="approved"?"bg-emerald-500/10 text-emerald-400 border-emerald-500/20":a.status==="pending"?"bg-amber-500/10 text-amber-400 border-amber-500/20":"bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                      {a.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
