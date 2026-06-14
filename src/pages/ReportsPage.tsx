// src/pages/ReportsPage.tsx — Field Payment Reports v3
// Company-wide with drill-down: cost per project, milestone, task, worker advances
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  BarChart3, TrendingUp, Users, DollarSign, FileText,
  RefreshCw, ChevronDown, ChevronUp, Calendar, Filter,
  Hammer, AlertTriangle, CheckCircle2, Clock, Download,
  ArrowUpRight, ArrowDownRight, Layers, Flag, ListTodo
} from "lucide-react";

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:0}).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function pct(a: number, b: number) {
  if(!b) return 0;
  return Math.round((a/b)*100);
}

type DateRange = "week"|"month"|"quarter"|"year"|"all";
type ReportTab = "overview"|"projects"|"workers"|"milestones";

const DATE_RANGES: {key:DateRange;label:string}[] = [
  {key:"week",label:"This Week"},
  {key:"month",label:"This Month"},
  {key:"quarter",label:"This Quarter"},
  {key:"year",label:"This Year"},
  {key:"all",label:"All Time"},
];

function getCutoff(range: DateRange): string|null {
  const now = new Date();
  if(range==="all") return null;
  if(range==="week"){ now.setDate(now.getDate()-7); }
  else if(range==="month"){ now.setMonth(now.getMonth()-1); }
  else if(range==="quarter"){ now.setMonth(now.getMonth()-3); }
  else if(range==="year"){ now.setFullYear(now.getFullYear()-1); }
  return now.toISOString();
}

export default function ReportsPage() {
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReportTab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [payments, setPayments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);

  useEffect(()=>{
    supabase.auth.getUser().then(async({data})=>{
      if(!data.user) return;
      const {data:p}=await supabase.from("user_profiles").select("company_id").eq("id",data.user.id).maybeSingle();
      if(p?.company_id){
        setCompanyId(p.company_id);
      }
    });
  },[]);

  const loadData = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true);
    const cutoff = getCutoff(dateRange);
    let q = supabase.from("field_payments").select("*").eq("company_id",companyId).order("created_at",{ascending:false});
    if(cutoff) q = q.gte("created_at",cutoff);
    if(projectFilter!=="all") q = q.eq("project_id",projectFilter);
    const [{data:fp},{data:proj},{data:ms}] = await Promise.all([
      q,
      supabase.from("projects").select("id,name,status,budget").eq("company_id",companyId),
      supabase.from("project_milestones").select("id,milestone_name,planned_cost,project_id").eq("company_id",companyId),
    ]);
    setPayments(fp||[]);
    setProjects(proj||[]);
    setMilestones(ms||[]);
    setLoading(false);
  },[companyId,dateRange,projectFilter]);

  useEffect(()=>{ loadData(); },[loadData]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalPaid = payments.reduce((s,p)=>s+(p.total_amount||0),0);
  const totalAdvances = payments.filter(p=>p.payment_type==="advance").reduce((s,p)=>s+(p.total_amount||0),0);
  const totalWork = payments.filter(p=>p.payment_type==="payment").reduce((s,p)=>s+(p.total_amount||0),0);
  const totalFinal = payments.filter(p=>p.payment_type==="final").reduce((s,p)=>s+(p.total_amount||0),0);
  const uniqueWorkers = new Set(payments.map(p=>p.worker_ref)).size;

  // By project
  const byProject: Record<string,{name:string;total:number;advances:number;count:number;budget:number}> = {};
  payments.forEach(p=>{
    const key = p.project_name||"No Project";
    if(!byProject[key]) {
      const proj = projects.find(r=>r.id===p.project_id);
      byProject[key] = {name:key,total:0,advances:0,count:0,budget:proj?.budget||0};
    }
    byProject[key].total += p.total_amount||0;
    byProject[key].count++;
    if(p.payment_type==="advance") byProject[key].advances += p.total_amount||0;
  });
  const projectRows = Object.values(byProject).sort((a,b)=>b.total-a.total);

  // By worker
  const byWorker: Record<string,{name:string;total:number;advances:number;work:number;final:number;count:number}> = {};
  payments.forEach(p=>{
    const key = p.worker_ref||p.worker_name;
    if(!byWorker[key]) byWorker[key] = {name:p.worker_name,total:0,advances:0,work:0,final:0,count:0};
    byWorker[key].total += p.total_amount||0;
    byWorker[key].count++;
    if(p.payment_type==="advance") byWorker[key].advances += p.total_amount||0;
    if(p.payment_type==="payment") byWorker[key].work += p.total_amount||0;
    if(p.payment_type==="final") byWorker[key].final += p.total_amount||0;
  });
  const workerRows = Object.values(byWorker).sort((a,b)=>b.total-a.total);

  // By milestone
  const byMilestone: Record<string,{name:string;project:string;total:number;planned:number;count:number}> = {};
  payments.forEach(p=>{
    if(!p.milestone_name) return;
    const key = p.milestone_name;
    if(!byMilestone[key]) {
      const ms = milestones.find(m=>m.milestone_name===p.milestone_name);
      byMilestone[key] = {name:key,project:p.project_name||"",total:0,planned:ms?.planned_cost||0,count:0};
    }
    byMilestone[key].total += p.total_amount||0;
    byMilestone[key].count++;
  });
  const milestoneRows = Object.values(byMilestone).sort((a,b)=>b.total-a.total);

  // By task
  const byTask: Record<string,{name:string;milestone:string;total:number;count:number}> = {};
  payments.forEach(p=>{
    if(!p.task_name) return;
    const key = p.task_name;
    if(!byTask[key]) byTask[key] = {name:key,milestone:p.milestone_name||"",total:0,count:0};
    byTask[key].total += p.total_amount||0;
    byTask[key].count++;
  });
  const taskRows = Object.values(byTask).sort((a,b)=>b.total-a.total);

  const tabClass = (t: ReportTab) => `px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition ${tab===t?"bg-cyan-600 text-white":"text-slate-500 hover:text-slate-300"}`;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">Field payment analytics across all projects</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-slate-200 text-xs transition">
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={dateRange} onChange={e=>setDateRange(e.target.value as DateRange)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-300 outline-none [&>option]:bg-[#111820]">
          {DATE_RANGES.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-300 outline-none [&>option]:bg-[#111820]">
          <option value="all">All Projects</option>
          {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:"Total Paid",value:fmtJMD(totalPaid),icon:<DollarSign size={14}/>,color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20"},
          {label:"Advances",value:fmtJMD(totalAdvances),icon:<ArrowUpRight size={14}/>,color:"text-amber-400",bg:"bg-amber-500/10",border:"border-amber-500/20"},
          {label:"Work Payments",value:fmtJMD(totalWork),icon:<Hammer size={14}/>,color:"text-cyan-400",bg:"bg-cyan-500/10",border:"border-cyan-500/20"},
          {label:"Workers Paid",value:String(uniqueWorkers),icon:<Users size={14}/>,color:"text-purple-400",bg:"bg-purple-500/10",border:"border-purple-500/20"},
        ].map(c=>(
          <div key={c.label} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${c.color} mb-2`}>
              {c.icon}{c.label}
            </div>
            <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Payment Type Breakdown */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Payment Breakdown</div>
        <div className="space-y-2">
          {[
            {label:"⚡ Advances",amount:totalAdvances,color:"bg-amber-500"},
            {label:"💰 Work Payments",amount:totalWork,color:"bg-emerald-500"},
            {label:"✅ Final Payments",amount:totalFinal,color:"bg-cyan-500"},
          ].map(r=>(
            <div key={r.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{r.label}</span>
                <span className="text-slate-300 font-semibold">{fmtJMD(r.amount)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div className={`h-full rounded-full ${r.color}`} style={{width:`${pct(r.amount,totalPaid)}%`}}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {([["overview","Overview"],["projects","By Project"],["workers","By Worker"],["milestones","By Milestone"]] as [ReportTab,string][]).map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} className={tabClass(t)}>{l}</button>
        ))}
      </div>

      {loading?(
        <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
          <RefreshCw size={16} className="animate-spin mr-2"/> Loading...
        </div>
      ):(
        <>
          {/* OVERVIEW TAB */}
          {tab==="overview"&&(
            <div className="space-y-4">
              <div className="text-xs text-slate-500">{payments.length} payments found in selected period</div>
              {/* Recent payments */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.05]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Recent Payments</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {payments.slice(0,10).map(p=>{
                    const ptColor = p.payment_type==="advance"?"text-amber-400":p.payment_type==="final"?"text-cyan-400":"text-emerald-400";
                    return(
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{p.worker_name}</div>
                          <div className="text-[10px] text-slate-600">{p.project_name||"No project"}{p.milestone_name?` · ${p.milestone_name}`:""}</div>
                          <div className="text-[9px] text-slate-700">{fmtDate(p.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${ptColor}`}>{fmtJMD(p.total_amount)}</div>
                          <div className={`text-[9px] font-bold uppercase ${ptColor}`}>{p.payment_type}</div>
                        </div>
                      </div>
                    );
                  })}
                  {payments.length===0&&<div className="px-4 py-8 text-center text-xs text-slate-600">No payments in selected period</div>}
                </div>
              </div>
            </div>
          )}

          {/* PROJECTS TAB */}
          {tab==="projects"&&(
            <div className="space-y-3">
              {projectRows.length===0&&<div className="text-center py-8 text-xs text-slate-600">No project data in selected period</div>}
              {projectRows.map(r=>(
                <div key={r.name} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-slate-200">{r.name}</div>
                      <div className="text-[10px] text-slate-600">{r.count} payments</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-400">{fmtJMD(r.total)}</div>
                      {r.budget>0&&<div className="text-[10px] text-slate-600">Budget: {fmtJMD(r.budget)}</div>}
                    </div>
                  </div>
                  {r.budget>0&&(
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                        <span>Spent: {pct(r.total,r.budget)}%</span>
                        <span>{fmtJMD(r.budget-r.total)} remaining</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                        <div className={`h-full rounded-full ${pct(r.total,r.budget)>90?"bg-red-500":pct(r.total,r.budget)>70?"bg-amber-500":"bg-emerald-500"}`}
                          style={{width:`${Math.min(100,pct(r.total,r.budget))}%`}}/>
                      </div>
                    </div>
                  )}
                  {r.advances>0&&(
                    <div className="mt-2 text-[10px] text-amber-500">⚡ Outstanding advances: {fmtJMD(r.advances)}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* WORKERS TAB */}
          {tab==="workers"&&(
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.05] flex justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Worker Summary</span>
                <span className="text-[9px] text-slate-600">{workerRows.length} workers</span>
              </div>
              {workerRows.length===0&&<div className="px-4 py-8 text-center text-xs text-slate-600">No worker data in selected period</div>}
              <div className="divide-y divide-white/[0.04]">
                {workerRows.map(r=>(
                  <div key={r.name} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-slate-200">{r.name}</div>
                      <div className="text-sm font-bold text-emerald-400">{fmtJMD(r.total)}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                        <div className="text-[9px] text-amber-600 font-bold uppercase">Advances</div>
                        <div className="text-xs font-bold text-amber-400">{fmtJMD(r.advances)}</div>
                      </div>
                      <div className="text-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                        <div className="text-[9px] text-emerald-600 font-bold uppercase">Work</div>
                        <div className="text-xs font-bold text-emerald-400">{fmtJMD(r.work)}</div>
                      </div>
                      <div className="text-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2">
                        <div className="text-[9px] text-cyan-600 font-bold uppercase">Final</div>
                        <div className="text-xs font-bold text-cyan-400">{fmtJMD(r.final)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MILESTONES TAB */}
          {tab==="milestones"&&(
            <div className="space-y-4">
              {/* By Milestone */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.05]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Cost by Milestone</span>
                </div>
                {milestoneRows.length===0&&<div className="px-4 py-8 text-center text-xs text-slate-600">No milestone data — select project/milestone when creating payments</div>}
                <div className="divide-y divide-white/[0.04]">
                  {milestoneRows.map(r=>(
                    <div key={r.name} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <div className="text-xs font-bold text-slate-200">🚩 {r.name}</div>
                          <div className="text-[10px] text-slate-600">{r.project} · {r.count} payments</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-400">{fmtJMD(r.total)}</div>
                          {r.planned>0&&<div className="text-[10px] text-slate-600">Planned: {fmtJMD(r.planned)}</div>}
                        </div>
                      </div>
                      {r.planned>0&&(
                        <div className="mt-1.5">
                          <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <div className={`h-full rounded-full ${pct(r.total,r.planned)>100?"bg-red-500":pct(r.total,r.planned)>80?"bg-amber-500":"bg-emerald-500"}`}
                              style={{width:`${Math.min(100,pct(r.total,r.planned))}%`}}/>
                          </div>
                          <div className="text-[9px] text-slate-600 mt-0.5">{pct(r.total,r.planned)}% of planned budget used</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* By Task */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.05]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Cost by Task</span>
                </div>
                {taskRows.length===0&&<div className="px-4 py-8 text-center text-xs text-slate-600">No task data in selected period</div>}
                <div className="divide-y divide-white/[0.04]">
                  {taskRows.map(r=>(
                    <div key={r.name} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">✅ {r.name}</div>
                        <div className="text-[10px] text-slate-600">{r.milestone||"No milestone"} · {r.count} payments</div>
                      </div>
                      <div className="text-sm font-bold text-emerald-400">{fmtJMD(r.total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}