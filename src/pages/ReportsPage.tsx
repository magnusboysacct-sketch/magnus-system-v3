// src/pages/ReportsPage.tsx — v2 Rebuild: dark theme, JMD, AI insights
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { magnusAI } from "../lib/magnusAI";
import { useProjectContext } from "../context/ProjectContext";
import { useCompanySettings } from "../hooks/useCompanySettings";
import {
  BarChart3, Download, FileText, Users, DollarSign, TrendingUp,
  Calendar, Camera, Package, ClipboardList, RefreshCw, ChevronDown,
  ChevronUp, Activity, Hammer, AlertTriangle, CheckCircle2,
  Filter, Bot, Sparkles, Loader, X
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReportSection {
  id: string; title: string; icon: React.ReactNode;
  color: string; bg: string; border: string; description: string;
}

const SECTIONS: ReportSection[] = [
  { id:"financial",    title:"Financial Summary",      icon:<DollarSign size={16}/>,    color:"text-emerald-400", bg:"bg-emerald-500/10",  border:"border-emerald-500/20",  description:"Revenue, costs, payments" },
  { id:"payroll",      title:"Payroll Report",         icon:<Users size={16}/>,         color:"text-blue-400",    bg:"bg-blue-500/10",     border:"border-blue-500/20",     description:"Worker payments by period" },
  { id:"project",      title:"Project Progress",       icon:<TrendingUp size={16}/>,    color:"text-purple-400",  bg:"bg-purple-500/10",   border:"border-purple-500/20",   description:"BOQ, milestones, timeline" },
  { id:"fieldops",     title:"Field Operations",       icon:<Hammer size={16}/>,        color:"text-amber-400",   bg:"bg-amber-500/10",    border:"border-amber-500/20",    description:"Daily logs, activity" },
  { id:"workers",      title:"Workers & Attendance",   icon:<ClipboardList size={16}/>, color:"text-cyan-400",    bg:"bg-cyan-500/10",     border:"border-cyan-500/20",     description:"Headcount, roles, status" },
  { id:"procurement",  title:"Procurement & Materials",icon:<Package size={16}/>,       color:"text-orange-400",  bg:"bg-orange-500/10",   border:"border-orange-500/20",   description:"Purchase orders, materials" },
  { id:"expenses",     title:"Expenses",               icon:<BarChart3 size={16}/>,     color:"text-red-400",     bg:"bg-red-500/10",      border:"border-red-500/20",      description:"Cost categories, receipts" },
  { id:"photos",       title:"Site Photos Log",        icon:<Camera size={16}/>,        color:"text-pink-400",    bg:"bg-pink-500/10",     border:"border-pink-500/20",     description:"Photo timeline by project" },
  { id:"issues",       title:"Issues & Delays",        icon:<AlertTriangle size={16}/>, color:"text-yellow-400",  bg:"bg-yellow-500/10",   border:"border-yellow-500/20",   description:"Reported problems, severity" },
  { id:"access",       title:"Access & Security",      icon:<CheckCircle2 size={16}/>,  color:"text-teal-400",    bg:"bg-teal-500/10",     border:"border-teal-500/20",     description:"QR scan log, identity checks" },
];

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"JMD", minimumFractionDigits:2 }).format(n);
}
function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }); }
function roleLabel(t?: string) { return (t||"worker").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()); }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { currentProject } = useProjectContext();
  const { settings: company } = useCompanySettings();
  const [activeSection, setActiveSection] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string,any>>({});
  const [dateRange, setDateRange] = useState<"week"|"month"|"quarter"|"year"|"all">("month");
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [aiInsights, setAiInsights] = useState<Record<string,string>>({});
  const [aiLoading, setAiLoading] = useState<string|null>(null);
  const [summaryStats, setSummaryStats] = useState({ workers:0, payments:0, issues:0, scans:0 });

  useEffect(() => {
    async function init() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data:p } = await supabase.from("user_profiles").select("company_id").eq("id",user.id).maybeSingle();
      if (p?.company_id) {
        setCompanyId(p.company_id);
        // Load summary stats
        const [w, fp, al] = await Promise.all([
          supabase.from("workers").select("id",{count:"exact"}).eq("company_id",p.company_id).eq("status","active"),
          supabase.from("field_payments").select("amount").eq("company_id",p.company_id),
          supabase.from("access_logs").select("id",{count:"exact"}).eq("company_id",p.company_id),
        ]);
        const totalPaid = (fp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
        setSummaryStats({ workers:w.count||0, payments:totalPaid, issues:0, scans:al.count||0 });
      }
    }
    init();
  }, []);

  function getCutoff() {
    const now = new Date();
    if (dateRange==="week") now.setDate(now.getDate()-7);
    else if (dateRange==="month") now.setMonth(now.getMonth()-1);
    else if (dateRange==="quarter") now.setMonth(now.getMonth()-3);
    else if (dateRange==="year") now.setFullYear(now.getFullYear()-1);
    else return "2000-01-01";
    return now.toISOString();
  }

  async function loadSection(id: string) {
    if (data[id]) { setActiveSection(id); return; }
    setLoading(true); setActiveSection(id);
    const cutoff = getCutoff();
    const pid = currentProject?.id;
    const cid = companyId;
    try {
      switch (id) {
        case "financial": {
          const [fp,exp,inv] = await Promise.all([
            supabase.from("field_payments").select("amount,paid_at,worker:worker_id(first_name,last_name)").eq("company_id",cid).gte("paid_at",cutoff),
            supabase.from("expenses").select("amount,category,date,description").eq("company_id",cid).gte("date",cutoff),
            supabase.from("invoices").select("total_amount,status,issue_date").eq("company_id",cid).gte("issue_date",cutoff),
          ]);
          const totalPaid=(fp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
          const totalExp=(exp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
          const totalInv=(inv.data||[]).reduce((s:number,r:any)=>s+(Number(r.total_amount)||0),0);
          setData(d=>({...d,[id]:{payments:fp.data||[],expenses:exp.data||[],invoices:inv.data||[],totalPaid,totalExp,totalInv}}));
          break;
        }
        case "payroll": {
          const {data:fp}=await supabase.from("field_payments").select("amount,paid_at,payment_method,worker:worker_id(first_name,last_name,worker_type)").eq("company_id",cid).gte("paid_at",cutoff).order("paid_at",{ascending:false});
          const byWorker:Record<string,any>={};
          (fp||[]).forEach((r:any)=>{
            const name=`${r.worker?.first_name} ${r.worker?.last_name}`;
            if(!byWorker[name]) byWorker[name]={name,role:r.worker?.worker_type,total:0,count:0};
            byWorker[name].total+=Number(r.amount)||0;
            byWorker[name].count++;
          });
          setData(d=>({...d,[id]:{payments:fp||[],byWorker:Object.values(byWorker)}}));
          break;
        }
        case "project": {
          const [boq,milestones]=await Promise.all([
            supabase.from("boq_items").select("*").eq("project_id",pid),
            supabase.from("project_milestones").select("*").eq("project_id",pid),
          ]);
          const total=(boq.data||[]).length;
          const done=(boq.data||[]).filter((b:any)=>b.status==="complete").length;
          setData(d=>({...d,[id]:{boq:boq.data||[],milestones:milestones.data||[],total,done,pct:total?Math.round(done/total*100):0}}));
          break;
        }
        case "fieldops": {
          const {data:logs}=await supabase.from("daily_logs").select("*").eq("project_id",pid).gte("log_date",cutoff).order("log_date",{ascending:false});
          const totalWorkers=(logs||[]).reduce((s:number,l:any)=>s+(l.workers_count||0),0);
          setData(d=>({...d,[id]:{logs:logs||[],totalDays:logs?.length||0,avgWorkers:logs?.length?Math.round(totalWorkers/logs.length):0}}));
          break;
        }
        case "workers": {
          const {data:workers}=await supabase.from("workers").select("*").eq("company_id",cid);
          const byStatus:Record<string,number>={};
          const byType:Record<string,number>={};
          (workers||[]).forEach((w:any)=>{byStatus[w.status]=(byStatus[w.status]||0)+1;byType[w.worker_type]=(byType[w.worker_type]||0)+1;});
          setData(d=>({...d,[id]:{workers:workers||[],byStatus,byType,total:workers?.length||0}}));
          break;
        }
        case "procurement": {
          const {data:pos}=await supabase.from("purchase_orders").select("*").eq("project_id",pid).gte("created_at",cutoff).order("created_at",{ascending:false});
          const totalValue=(pos||[]).reduce((s:number,p:any)=>s+(Number(p.total_amount)||0),0);
          setData(d=>({...d,[id]:{pos:pos||[],totalValue,count:pos?.length||0}}));
          break;
        }
        case "expenses": {
          const {data:exp}=await supabase.from("expenses").select("*").eq("company_id",cid).gte("date",cutoff).order("date",{ascending:false});
          const byCategory:Record<string,number>={};
          (exp||[]).forEach((e:any)=>{byCategory[e.category||"Other"]=(byCategory[e.category||"Other"]||0)+(Number(e.amount)||0);});
          const total=(exp||[]).reduce((s:number,e:any)=>s+(Number(e.amount)||0),0);
          setData(d=>({...d,[id]:{expenses:exp||[],byCategory,total}}));
          break;
        }
        case "photos": {
          const {data:photos}=await supabase.from("project_photos").select("*").eq("project_id",pid).gte("created_at",cutoff).order("created_at",{ascending:false});
          setData(d=>({...d,[id]:{photos:photos||[],count:photos?.length||0}}));
          break;
        }
        case "issues": {
          const {data:issues}=await supabase.from("project_issues").select("*").eq("project_id",pid).gte("reported_at",cutoff).order("reported_at",{ascending:false});
          const bySeverity:Record<string,number>={};
          (issues||[]).forEach((i:any)=>{bySeverity[i.severity||"low"]=(bySeverity[i.severity||"low"]||0)+1;});
          setData(d=>({...d,[id]:{issues:issues||[],bySeverity,open:(issues||[]).filter((i:any)=>i.status==="open").length}}));
          break;
        }
        case "access": {
          const {data:logs}=await supabase.from("access_logs").select("*,worker:worker_id(first_name,last_name,worker_type)").eq("company_id",cid).gte("scanned_at",cutoff).order("scanned_at",{ascending:false});
          setData(d=>({...d,[id]:{logs:logs||[],total:logs?.length||0,unique:new Set((logs||[]).map((l:any)=>l.worker_id)).size}}));
          break;
        }
      }
    } catch(e){ console.error(e); }
    setLoading(false);
  }

  async function getAIInsight(sectionId: string) {
    const d = data[sectionId];
    if (!d) return;
    setAiLoading(sectionId);
    try {
      let context = "";
      if (sectionId==="financial") context = `Financial data: Field payments total JMD ${fmt(d.totalPaid)}, Expenses total JMD ${fmt(d.totalExp)}, Invoiced JMD ${fmt(d.totalInv)}.`;
      else if (sectionId==="payroll") context = `Payroll: ${d.byWorker?.length||0} workers paid. Top earner: ${d.byWorker?.[0]?.name||"N/A"} at JMD ${fmt(d.byWorker?.[0]?.total||0)}.`;
      else if (sectionId==="workers") context = `Workers: ${d.total} total, ${d.byStatus?.active||0} active, ${d.byStatus?.inactive||0} inactive.`;
      else if (sectionId==="expenses") context = `Expenses: Total JMD ${fmt(d.total)}. Categories: ${Object.entries(d.byCategory||{}).map(([k,v])=>`${k}: JMD ${fmt(Number(v))}`).join(", ")}.`;
      else if (sectionId==="fieldops") context = `Field ops: ${d.totalDays} days logged, average ${d.avgWorkers} workers per day.`;
      else if (sectionId==="project") context = `Project: ${d.total} BOQ items, ${d.done} complete (${d.pct}% progress).`;
      else if (sectionId==="issues") context = `Issues: ${d.issues?.length||0} total, ${d.open||0} open, ${d.bySeverity?.high||0} high severity.`;
      else if (sectionId==="procurement") context = `Procurement: ${d.count} purchase orders, total value JMD ${fmt(d.totalValue)}.`;
      else context = `Report section: ${sectionId}. Date range: ${dateRange}.`;

      const text = await magnusAI.chat(
        `You are a construction business analyst for Magnus Boys Construction in Jamaica.
Analyze this data and give 2-3 brief, actionable insights. Focus on what stands out and what to watch.
Keep it under 100 words. Use plain English, no jargon.

Data: ${context}
Project: ${currentProject?.name || "General"}
Period: Last ${dateRange}`
      );
      setAiInsights(prev => ({ ...prev, [sectionId]: String(text).trim() }));
    } catch { setAiInsights(prev => ({ ...prev, [sectionId]: "Could not generate insight right now." })); }
    setAiLoading(null);
  }

  function exportCSV(sectionId: string) {
    const d = data[sectionId];
    if (!d) return;
    let rows: string[][] = [];
    if (sectionId==="payroll") rows=[["Worker","Role","Total Paid","Payments"],...(d.byWorker||[]).map((w:any)=>[w.name,w.role||"",fmtJMD(w.total),w.count])];
    else if (sectionId==="financial") rows=[["Type","Amount"],["Field Payments",fmtJMD(d.totalPaid)],["Expenses",fmtJMD(d.totalExp)],["Invoiced",fmtJMD(d.totalInv)]];
    else if (sectionId==="workers") rows=[["Name","Type","Status","National ID"],...(d.workers||[]).map((w:any)=>[`${w.first_name} ${w.last_name}`,roleLabel(w.worker_type),w.status||"",w.id_number||""])];
    else if (sectionId==="expenses") rows=[["Date","Category","Description","Amount"],...(d.expenses||[]).map((e:any)=>[e.date||"",e.category||"",e.description||"",fmtJMD(Number(e.amount)||0)])];
    else if (sectionId==="access") rows=[["Worker","Time","Device"],...(d.logs||[]).map((l:any)=>[`${l.worker?.first_name} ${l.worker?.last_name}`,new Date(l.scanned_at).toLocaleString(),l.device_info?.slice(0,40)||""])];
    if (!rows.length) { alert("No data to export."); return; }
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = `${sectionId}-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-6 py-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Reports</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {company?.company_name || "Magnus Boys Construction"} — {currentProject?.name || "All Projects"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={11} className="text-slate-600"/>
            {(["week","month","quarter","year","all"] as const).map(r => (
              <button key={r} onClick={() => { setDateRange(r); setData({}); setAiInsights({}); }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition ${dateRange===r?"bg-blue-600 text-white":"bg-white/[0.04] border border-white/[0.08] text-slate-500 hover:text-slate-300"}`}>
                {r==="all"?"All Time":r==="week"?"7 Days":r==="month"?"30 Days":r==="quarter"?"90 Days":"1 Year"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-5xl">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:"Active Workers",  value:summaryStats.workers,                    icon:<Users size={15}/>,         color:"text-blue-400",    bg:"bg-blue-500/10",    border:"border-blue-500/20" },
            { label:"Total Payments",  value:fmtJMD(summaryStats.payments),           icon:<DollarSign size={15}/>,    color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20" },
            { label:"Open Issues",     value:summaryStats.issues,                     icon:<AlertTriangle size={15}/>, color:"text-amber-400",   bg:"bg-amber-500/10",   border:"border-amber-500/20" },
            { label:"Access Scans",    value:summaryStats.scans.toLocaleString(),     icon:<CheckCircle2 size={15}/>,  color:"text-teal-400",    bg:"bg-teal-500/10",    border:"border-teal-500/20" },
          ].map((s,i) => (
            <div key={i} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
              <div className={`${s.color} mb-2`}>{s.icon}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider font-semibold">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Report Sections */}
        <div className="space-y-2">
          {SECTIONS.map(section => (
            <div key={section.id} className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              {/* Section header */}
              <button onClick={() => activeSection===section.id ? setActiveSection(null) : loadSection(section.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${section.bg} ${section.border}`}>
                    <span className={section.color}>{section.icon}</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-200">{section.title}</div>
                    <div className="text-[10px] text-slate-600">{section.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeSection===section.id && data[section.id] && (
                    <button onClick={e=>{e.stopPropagation();exportCSV(section.id);}}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-[10px] text-slate-400 transition">
                      <Download size={10}/> CSV
                    </button>
                  )}
                  {activeSection===section.id
                    ? <ChevronUp size={14} className="text-slate-600"/>
                    : <ChevronDown size={14} className="text-slate-600"/>}
                </div>
              </button>

              {/* Section content */}
              {activeSection===section.id && (
                <div className="border-t border-white/[0.06] p-5 space-y-4">
                  {loading && !data[section.id] ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
                      <RefreshCw size={13} className="animate-spin"/> Loading…
                    </div>
                  ) : (
                    <>
                      {/* AI Insight */}
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">Report Data</span>
                        <button onClick={() => getAIInsight(section.id)} disabled={!data[section.id] || aiLoading===section.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] text-purple-400 font-semibold disabled:opacity-40 transition">
                          {aiLoading===section.id ? <Loader size={9} className="animate-spin"/> : <Sparkles size={9}/>}
                          {aiLoading===section.id ? "Analyzing…" : "AI Insights"}
                        </button>
                      </div>

                      {aiInsights[section.id] && (
                        <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] px-4 py-3 flex gap-3">
                          <Bot size={14} className="text-purple-400 flex-shrink-0 mt-0.5"/>
                          <div className="flex-1">
                            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">AI Analysis</div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">{aiInsights[section.id]}</p>
                          </div>
                          <button onClick={() => setAiInsights(p=>({...p,[section.id]:""}))} className="text-slate-700 hover:text-slate-400 flex-shrink-0">
                            <X size={12}/>
                          </button>
                        </div>
                      )}

                      <SectionContent id={section.id} data={data[section.id]}/>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section Content ──────────────────────────────────────────────────────────
function SectionContent({ id, data }: { id:string; data:any }) {
  if (!data) return <Empty/>;

  if (id==="financial") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Field Payments" value={fmtJMD(data.totalPaid)} color="text-emerald-400"/>
        <StatCard label="Expenses"       value={fmtJMD(data.totalExp)}  color="text-red-400"/>
        <StatCard label="Invoiced"       value={fmtJMD(data.totalInv)}  color="text-blue-400"/>
      </div>
      {data.expenses?.length>0 && (
        <SimpleTable headers={["Date","Category","Description","Amount"]}
          rows={data.expenses.slice(0,8).map((e:any)=>[fmtDate(e.date),e.category||"—",e.description||"—",fmtJMD(Number(e.amount)||0)])}/>
      )}
    </div>
  );

  if (id==="payroll") return (
    <div className="space-y-3">
      {!data.byWorker?.length ? <Empty/> :
        <SimpleTable headers={["Worker","Role","Total Paid","Payments"]}
          rows={(data.byWorker||[]).map((w:any)=>[w.name,roleLabel(w.role),fmtJMD(w.total),w.count])}/>
      }
    </div>
  );

  if (id==="project") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="BOQ Items"  value={data.total}      color="text-purple-400"/>
        <StatCard label="Completed"  value={data.done}       color="text-emerald-400"/>
        <StatCard label="Progress"   value={`${data.pct}%`}  color="text-blue-400"/>
      </div>
      <div className="w-full bg-white/[0.06] rounded-full h-2">
        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width:`${data.pct}%`}}/>
      </div>
      {data.milestones?.length>0 && (
        <SimpleTable headers={["Milestone","Status","Due Date"]}
          rows={data.milestones.map((m:any)=>[m.name||"—",m.status||"—",m.due_date?fmtDate(m.due_date):"—"])}/>
      )}
    </div>
  );

  if (id==="fieldops") return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Days Logged"     value={data.totalDays}   color="text-amber-400"/>
        <StatCard label="Avg Workers/Day" value={data.avgWorkers}  color="text-blue-400"/>
      </div>
      {!data.logs?.length ? <Empty/> :
        <SimpleTable headers={["Date","Workers","Weather","Notes"]}
          rows={data.logs.slice(0,10).map((l:any)=>[fmtDate(l.log_date),l.workers_count||0,l.weather||"—",(l.work_performed||"").slice(0,40)||"—"])}/>
      }
    </div>
  );

  if (id==="workers") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total"    value={data.total}                color="text-cyan-400"/>
        <StatCard label="Active"   value={data.byStatus?.active||0}  color="text-emerald-400"/>
        <StatCard label="Inactive" value={(data.byStatus?.inactive||0)+(data.byStatus?.terminated||0)} color="text-red-400"/>
      </div>
      {!data.workers?.length ? <Empty/> :
        <SimpleTable headers={["Name","Role","Status","National ID"]}
          rows={data.workers.map((w:any)=>[`${w.first_name} ${w.last_name}`,roleLabel(w.worker_type),w.status||"—",w.id_number||"—"])}/>
      }
    </div>
  );

  if (id==="procurement") return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Purchase Orders" value={data.count}              color="text-orange-400"/>
        <StatCard label="Total Value"     value={fmtJMD(data.totalValue)} color="text-emerald-400"/>
      </div>
      {!data.pos?.length ? <Empty/> :
        <SimpleTable headers={["Date","Supplier","Status","Amount"]}
          rows={data.pos.slice(0,10).map((p:any)=>[p.created_at?fmtDate(p.created_at):"—",p.supplier_name||"—",p.status||"—",fmtJMD(Number(p.total_amount)||0)])}/>
      }
    </div>
  );

  if (id==="expenses") return (
    <div className="space-y-4">
      <StatCard label="Total Expenses" value={fmtJMD(data.total)} color="text-red-400"/>
      <div className="rounded-xl border border-white/[0.07] overflow-hidden">
        {Object.entries(data.byCategory||{}).map(([cat,amt]:any,i) => (
          <div key={cat} className={`flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] last:border-0 ${i%2===1?"bg-white/[0.01]":""}`}>
            <span className="text-xs text-slate-400">{cat}</span>
            <span className="text-xs font-bold text-slate-200">{fmtJMD(amt)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (id==="photos") return (
    <div className="space-y-3">
      <StatCard label="Photos Taken" value={data.count} color="text-pink-400"/>
      {!data.photos?.length ? <Empty/> : (
        <div className="grid grid-cols-4 gap-2">
          {data.photos.slice(0,12).map((p:any) => (
            <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06]">
              <img src={p.url||p.public_url} alt="" className="w-full h-full object-cover"/>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (id==="issues") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total"    value={data.issues?.length||0}    color="text-yellow-400"/>
        <StatCard label="Open"     value={data.open||0}              color="text-red-400"/>
        <StatCard label="High"     value={data.bySeverity?.high||0}  color="text-orange-400"/>
      </div>
      {!data.issues?.length ? <Empty/> :
        <SimpleTable headers={["Date","Severity","Description","Status"]}
          rows={data.issues.slice(0,10).map((i:any)=>[i.reported_at?fmtDate(i.reported_at):"—",i.severity||"low",(i.description||"").slice(0,50),i.status||"open"])}/>
      }
    </div>
  );

  if (id==="access") return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Scans"     value={data.total}  color="text-teal-400"/>
        <StatCard label="Unique Workers"  value={data.unique} color="text-blue-400"/>
      </div>
      {!data.logs?.length ? <Empty/> :
        <SimpleTable headers={["Worker","Role","Time","Device"]}
          rows={data.logs.slice(0,10).map((l:any)=>[
            `${l.worker?.first_name} ${l.worker?.last_name}`,
            roleLabel(l.worker?.worker_type),
            new Date(l.scanned_at).toLocaleString(),
            (l.device_info||"").includes("Windows")?"Windows":(l.device_info||"").includes("Android")?"Android":"Browser"
          ])}/>
      }
    </div>
  );

  return <Empty/>;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label:string; value:any; color:string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers:string[]; rows:any[][] }) {
  if (!rows.length) return <Empty/>;
  return (
    <div className="rounded-xl border border-white/[0.07] overflow-hidden">
      <div className={`grid text-[9px] font-bold uppercase tracking-widest text-slate-700 px-4 py-2 bg-white/[0.02] border-b border-white/[0.05]`}
        style={{gridTemplateColumns:`repeat(${headers.length},1fr)`}}>
        {headers.map(h=><span key={h}>{h}</span>)}
      </div>
      {rows.map((row,i)=>(
        <div key={i} className={`grid items-center px-4 py-2.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition ${i%2===1?"bg-white/[0.01]":""}`}
          style={{gridTemplateColumns:`repeat(${headers.length},1fr)`}}>
          {row.map((cell,j)=><span key={j} className="text-[11px] text-slate-300 truncate">{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="text-center py-6 text-xs text-slate-600">No data for this period.</div>;
}
