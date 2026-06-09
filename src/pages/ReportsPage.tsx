// src/pages/ReportsPage.tsx — Full Reports Center
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useCompanySettings } from "../hooks/useCompanySettings";
import {
  BarChart3, Download, FileText, Users, DollarSign, TrendingUp,
  Calendar, Camera, Package, ClipboardList, RefreshCw, ChevronDown,
  ChevronUp, PieChart, Activity, Building2, Hammer, AlertTriangle,
  CheckCircle2, Clock, Filter
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReportSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const SECTIONS: ReportSection[] = [
  { id: "financial",   title: "Financial Summary",     icon: <DollarSign size={18}/>,    color: "text-green-400",  description: "Revenue, costs, payments" },
  { id: "payroll",     title: "Payroll Report",        icon: <Users size={18}/>,         color: "text-blue-400",   description: "Worker payments by period" },
  { id: "project",     title: "Project Progress",      icon: <TrendingUp size={18}/>,    color: "text-purple-400", description: "BOQ, milestones, timeline" },
  { id: "fieldops",    title: "Field Operations",      icon: <Hammer size={18}/>,        color: "text-amber-400",  description: "Daily logs, weather, activity" },
  { id: "workers",     title: "Workers & Attendance",  icon: <ClipboardList size={18}/>, color: "text-cyan-400",   description: "Headcount, roles, status" },
  { id: "procurement", title: "Procurement & Materials",icon: <Package size={18}/>,      color: "text-orange-400", description: "Purchase orders, materials" },
  { id: "expenses",    title: "Expenses",              icon: <BarChart3 size={18}/>,     color: "text-red-400",    description: "Cost categories, receipts" },
  { id: "photos",      title: "Site Photos Log",       icon: <Camera size={18}/>,        color: "text-pink-400",   description: "Photo timeline by project" },
  { id: "issues",      title: "Issues & Delays",       icon: <AlertTriangle size={18}/>, color: "text-yellow-400", description: "Reported problems, severity" },
  { id: "access",      title: "Access & Security",     icon: <CheckCircle2 size={18}/>,  color: "text-emerald-400",description: "QR scan log, identity checks" },
];

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { currentProject } = useProjectContext();
  const { settings: company } = useCompanySettings();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, any>>({});
  const [dateRange, setDateRange] = useState<"week"|"month"|"quarter"|"year"|"all">("month");
  const [companyId, setCompanyId] = useState<string|null>(null);

  useEffect(() => {
    async function getCompany() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (p?.company_id) setCompanyId(p.company_id);
    }
    getCompany();
  }, []);

  async function loadSection(id: string) {
    if (data[id]) { setActiveSection(id); return; }
    setLoading(true);
    setActiveSection(id);
    const cutoff = getCutoff();
    const pid = currentProject?.id;
    const cid = companyId;

    try {
      switch (id) {
        case "financial": {
          const [fp, exp, inv] = await Promise.all([
            supabase.from("field_payments").select("amount,paid_at,worker:worker_id(first_name,last_name)").eq("company_id", cid).gte("paid_at", cutoff),
            supabase.from("expenses").select("amount,category,date,description").eq("company_id", cid).gte("date", cutoff),
            supabase.from("invoices").select("total_amount,status,issue_date").eq("company_id", cid).gte("issue_date", cutoff),
          ]);
          const totalPaid = (fp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
          const totalExp = (exp.data||[]).reduce((s:number,r:any)=>s+(Number(r.amount)||0),0);
          const totalInv = (inv.data||[]).reduce((s:number,r:any)=>s+(Number(r.total_amount)||0),0);
          setData(d=>({...d,[id]:{payments:fp.data||[],expenses:exp.data||[],invoices:inv.data||[],totalPaid,totalExp,totalInv}}));
          break;
        }
        case "payroll": {
          const { data: fp } = await supabase.from("field_payments").select("amount,paid_at,payment_method,worker:worker_id(first_name,last_name,worker_type)").eq("company_id", cid).gte("paid_at", cutoff).order("paid_at",{ascending:false});
          const byWorker: Record<string,any> = {};
          (fp||[]).forEach((r:any) => {
            const name = `${r.worker?.first_name} ${r.worker?.last_name}`;
            if (!byWorker[name]) byWorker[name] = { name, role: r.worker?.worker_type, total: 0, count: 0 };
            byWorker[name].total += Number(r.amount)||0;
            byWorker[name].count++;
          });
          setData(d=>({...d,[id]:{payments:fp||[],byWorker:Object.values(byWorker)}}));
          break;
        }
        case "project": {
          const [boq, milestones] = await Promise.all([
            supabase.from("boq_items").select("*").eq("project_id", pid),
            supabase.from("project_milestones").select("*").eq("project_id", pid),
          ]);
          const total = (boq.data||[]).length;
          const done = (boq.data||[]).filter((b:any)=>b.status==="complete").length;
          setData(d=>({...d,[id]:{boq:boq.data||[],milestones:milestones.data||[],total,done,pct:total?Math.round(done/total*100):0}}));
          break;
        }
        case "fieldops": {
          const { data: logs } = await supabase.from("daily_logs").select("*").eq("project_id", pid).gte("log_date", cutoff).order("log_date",{ascending:false});
          const totalWorkers = (logs||[]).reduce((s:number,l:any)=>s+(l.workers_count||0),0);
          const avgWorkers = logs?.length ? Math.round(totalWorkers / logs.length) : 0;
          setData(d=>({...d,[id]:{logs:logs||[],totalDays:logs?.length||0,avgWorkers}}));
          break;
        }
        case "workers": {
          const { data: workers } = await supabase.from("workers").select("*").eq("company_id", cid);
          const byStatus: Record<string,number> = {};
          const byType: Record<string,number> = {};
          (workers||[]).forEach((w:any) => {
            byStatus[w.status] = (byStatus[w.status]||0)+1;
            byType[w.worker_type] = (byType[w.worker_type]||0)+1;
          });
          setData(d=>({...d,[id]:{workers:workers||[],byStatus,byType,total:workers?.length||0}}));
          break;
        }
        case "procurement": {
          const { data: pos } = await supabase.from("purchase_orders").select("*").eq("project_id", pid).gte("created_at", cutoff).order("created_at",{ascending:false});
          const totalValue = (pos||[]).reduce((s:number,p:any)=>s+(Number(p.total_amount)||0),0);
          setData(d=>({...d,[id]:{pos:pos||[],totalValue,count:pos?.length||0}}));
          break;
        }
        case "expenses": {
          const { data: exp } = await supabase.from("expenses").select("*").eq("company_id", cid).gte("date", cutoff).order("date",{ascending:false});
          const byCategory: Record<string,number> = {};
          (exp||[]).forEach((e:any) => { byCategory[e.category||"Other"] = (byCategory[e.category||"Other"]||0)+(Number(e.amount)||0); });
          const total = (exp||[]).reduce((s:number,e:any)=>s+(Number(e.amount)||0),0);
          setData(d=>({...d,[id]:{expenses:exp||[],byCategory,total}}));
          break;
        }
        case "photos": {
          const { data: photos } = await supabase.from("project_photos").select("*").eq("project_id", pid).gte("created_at", cutoff).order("created_at",{ascending:false});
          setData(d=>({...d,[id]:{photos:photos||[],count:photos?.length||0}}));
          break;
        }
        case "issues": {
          const { data: issues } = await supabase.from("project_issues").select("*").eq("project_id", pid).gte("reported_at", cutoff).order("reported_at",{ascending:false});
          const bySeverity: Record<string,number> = {};
          (issues||[]).forEach((i:any) => { bySeverity[i.severity||"low"] = (bySeverity[i.severity||"low"]||0)+1; });
          setData(d=>({...d,[id]:{issues:issues||[],bySeverity,open:(issues||[]).filter((i:any)=>i.status==="open").length}}));
          break;
        }
        case "access": {
          const { data: logs } = await supabase.from("access_logs").select("*,worker:worker_id(first_name,last_name,worker_type)").eq("company_id", cid).gte("scanned_at", cutoff).order("scanned_at",{ascending:false});
          setData(d=>({...d,[id]:{logs:logs||[],total:logs?.length||0,unique:new Set((logs||[]).map((l:any)=>l.worker_id)).size}}));
          break;
        }
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  function getCutoff() {
    const now = new Date();
    if (dateRange === "week")    { now.setDate(now.getDate()-7); }
    else if (dateRange === "month")   { now.setMonth(now.getMonth()-1); }
    else if (dateRange === "quarter") { now.setMonth(now.getMonth()-3); }
    else if (dateRange === "year")    { now.setFullYear(now.getFullYear()-1); }
    else return "2000-01-01";
    return now.toISOString();
  }

  function exportCSV(sectionId: string) {
    const d = data[sectionId];
    if (!d) return;
    let rows: string[][] = [];
    if (sectionId === "payroll") {
      rows = [["Worker","Role","Total Paid","Payments"], ...d.byWorker.map((w:any)=>[w.name,w.role||"",`$${fmt(w.total)}`,w.count])];
    } else if (sectionId === "financial") {
      rows = [["Type","Amount"], ["Field Payments",`$${fmt(d.totalPaid)}`], ["Expenses",`$${fmt(d.totalExp)}`], ["Invoiced",`$${fmt(d.totalInv)}`]];
    } else if (sectionId === "workers") {
      rows = [["Name","Type","Status","National ID"], ...d.workers.map((w:any)=>[`${w.first_name} ${w.last_name}`,w.worker_type||"",w.status||"",w.id_number||""])];
    } else if (sectionId === "expenses") {
      rows = [["Date","Category","Description","Amount"], ...d.expenses.map((e:any)=>[e.date||"",e.category||"",e.description||"",`$${fmt(Number(e.amount)||0)}`])];
    } else if (sectionId === "access") {
      rows = [["Worker","Time","Device"], ...d.logs.map((l:any)=>[`${l.worker?.first_name} ${l.worker?.last_name}`,new Date(l.scanned_at).toLocaleString(),l.device_info?.slice(0,40)||""])];
    }
    if (!rows.length) { alert("No data to export."); return; }
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = `${sectionId}-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">{company?.company_name || "Magnus Boys Construction"} — {currentProject?.name || "All Projects"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-slate-400"/>
          {(["week","month","quarter","year","all"] as const).map(r => (
            <button key={r} onClick={() => { setDateRange(r); setData({}); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${dateRange===r?"bg-blue-600 text-white":"bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"}`}>
              {r==="all"?"All Time":r==="week"?"7 Days":r==="month"?"30 Days":r==="quarter"?"90 Days":"1 Year"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Workers", value: "—", icon: <Users size={16}/>, color: "text-blue-400" },
          { label: "Field Payments", value: "—", icon: <DollarSign size={16}/>, color: "text-green-400" },
          { label: "Open Issues", value: "—", icon: <AlertTriangle size={16}/>, color: "text-yellow-400" },
          { label: "QR Scans", value: "—", icon: <CheckCircle2 size={16}/>, color: "text-emerald-400" },
        ].map((s,i) => (
          <div key={i} className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4">
            <div className={`${s.color} mb-2`}>{s.icon}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Report Sections */}
      <div className="space-y-3">
        {SECTIONS.map(section => (
          <div key={section.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 overflow-hidden">
            {/* Section header */}
            <button onClick={() => activeSection===section.id ? setActiveSection(null) : loadSection(section.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className={section.color}>{section.icon}</div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{section.title}</div>
                  <div className="text-xs text-slate-400">{section.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeSection===section.id && data[section.id] && (
                  <button onClick={e=>{e.stopPropagation();exportCSV(section.id);}}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 text-xs hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                    <Download size={11}/> CSV
                  </button>
                )}
                {activeSection===section.id
                  ? <ChevronUp size={16} className="text-slate-400"/>
                  : <ChevronDown size={16} className="text-slate-400"/>
                }
              </div>
            </button>

            {/* Section content */}
            {activeSection===section.id && (
              <div className="border-t border-slate-100 dark:border-slate-800 p-4">
                {loading && !data[section.id] ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-4 justify-center">
                    <RefreshCw size={13} className="animate-spin"/> Loading...
                  </div>
                ) : (
                  <SectionContent id={section.id} data={data[section.id]}/>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section Content Renderers ────────────────────────────────────────────────
function SectionContent({ id, data }: { id: string; data: any }) {
  if (!data) return <div className="text-xs text-slate-500 py-4 text-center">No data available for this period.</div>;

  if (id === "financial") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Field Payments" value={`$${fmt(data.totalPaid)}`} color="text-green-400"/>
        <StatCard label="Expenses" value={`$${fmt(data.totalExp)}`} color="text-red-400"/>
        <StatCard label="Invoiced" value={`$${fmt(data.totalInv)}`} color="text-blue-400"/>
      </div>
      {data.expenses?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Recent Expenses</div>
          <SimpleTable headers={["Date","Category","Description","Amount"]}
            rows={data.expenses.slice(0,8).map((e:any)=>[fmtDate(e.date),e.category||"—",e.description||"—",`$${fmt(Number(e.amount)||0)}`])}/>
        </div>
      )}
    </div>
  );

  if (id === "payroll") return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">By Worker</div>
      {data.byWorker?.length === 0 ? <Empty/> :
        <SimpleTable headers={["Worker","Role","Total Paid","Payments"]}
          rows={(data.byWorker||[]).map((w:any)=>[w.name,roleLabel(w.role),`$${fmt(w.total)}`,w.count])}/>
      }
    </div>
  );

  if (id === "project") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="BOQ Items" value={data.total} color="text-purple-400"/>
        <StatCard label="Completed" value={data.done} color="text-green-400"/>
        <StatCard label="Progress" value={`${data.pct}%`} color="text-blue-400"/>
      </div>
      <ProgressBar pct={data.pct}/>
      {data.milestones?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Milestones</div>
          <SimpleTable headers={["Milestone","Status","Due Date"]}
            rows={data.milestones.map((m:any)=>[m.name||"—",m.status||"—",m.due_date?fmtDate(m.due_date):"—"])}/>
        </div>
      )}
    </div>
  );

  if (id === "fieldops") return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Days Logged" value={data.totalDays} color="text-amber-400"/>
        <StatCard label="Avg Workers/Day" value={data.avgWorkers} color="text-blue-400"/>
      </div>
      {data.logs?.length === 0 ? <Empty/> :
        <SimpleTable headers={["Date","Workers","Weather","Notes"]}
          rows={data.logs.slice(0,10).map((l:any)=>[fmtDate(l.log_date),l.workers_count||0,l.weather||"—",(l.work_performed||"").slice(0,40)||"—"])}/>
      }
    </div>
  );

  if (id === "workers") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Workers" value={data.total} color="text-cyan-400"/>
        <StatCard label="Active" value={data.byStatus?.active||0} color="text-green-400"/>
        <StatCard label="Inactive" value={(data.byStatus?.inactive||0)+(data.byStatus?.terminated||0)} color="text-red-400"/>
      </div>
      {data.workers?.length === 0 ? <Empty/> :
        <SimpleTable headers={["Name","Role","Status","National ID"]}
          rows={data.workers.map((w:any)=>[`${w.first_name} ${w.last_name}`,roleLabel(w.worker_type),w.status||"—",w.id_number||"—"])}/>
      }
    </div>
  );

  if (id === "procurement") return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Purchase Orders" value={data.count} color="text-orange-400"/>
        <StatCard label="Total Value" value={`$${fmt(data.totalValue)}`} color="text-green-400"/>
      </div>
      {data.pos?.length === 0 ? <Empty/> :
        <SimpleTable headers={["Date","Supplier","Status","Amount"]}
          rows={data.pos.slice(0,10).map((p:any)=>[p.created_at?fmtDate(p.created_at):"—",p.supplier_name||"—",p.status||"—",`$${fmt(Number(p.total_amount)||0)}`])}/>
      }
    </div>
  );

  if (id === "expenses") return (
    <div className="space-y-4">
      <StatCard label="Total Expenses" value={`$${fmt(data.total)}`} color="text-red-400"/>
      <div>
        <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">By Category</div>
        <div className="space-y-2">
          {Object.entries(data.byCategory||{}).map(([cat,amt]:any) => (
            <div key={cat} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-white/5">
              <span className="text-xs text-slate-600 dark:text-slate-300">{cat}</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">${fmt(amt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (id === "photos") return (
    <div className="space-y-3">
      <StatCard label="Photos Taken" value={data.count} color="text-pink-400"/>
      {data.photos?.length === 0 ? <Empty/> : (
        <div className="grid grid-cols-4 gap-2">
          {data.photos.slice(0,12).map((p:any) => (
            <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
              <img src={p.url||p.public_url||p.publicUrl} alt="" className="w-full h-full object-cover"/>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (id === "issues") return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Issues" value={data.issues?.length||0} color="text-yellow-400"/>
        <StatCard label="Open" value={data.open||0} color="text-red-400"/>
        <StatCard label="High Severity" value={data.bySeverity?.high||0} color="text-orange-400"/>
      </div>
      {data.issues?.length === 0 ? <Empty/> :
        <SimpleTable headers={["Date","Severity","Description","Status"]}
          rows={data.issues.slice(0,10).map((i:any)=>[i.reported_at?fmtDate(i.reported_at):"—",i.severity||"low",(i.description||"").slice(0,50),i.status||"open"])}/>
      }
    </div>
  );

  if (id === "access") return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Scans" value={data.total} color="text-emerald-400"/>
        <StatCard label="Unique Workers" value={data.unique} color="text-blue-400"/>
      </div>
      {data.logs?.length === 0 ? <Empty/> :
        <SimpleTable headers={["Worker","Role","Time","Device"]}
          rows={data.logs.slice(0,10).map((l:any)=>[`${l.worker?.first_name} ${l.worker?.last_name}`,roleLabel(l.worker?.worker_type),new Date(l.scanned_at).toLocaleString(),(l.device_info||"").includes("Windows")?"Windows PC":(l.device_info||"").includes("Android")?"Android":"Browser"])}/>
      }
    </div>
  );

  return <Empty/>;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-3">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2.5">
      <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }}/>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: any[][] }) {
  if (!rows.length) return <Empty/>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-white/5">
            {headers.map(h => <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold uppercase tracking-wide text-[10px]">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-slate-700 dark:text-slate-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <div className="text-center py-6 text-xs text-slate-400">No data for this period.</div>;
}

function roleLabel(t?: string) {
  return (t || "worker").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
