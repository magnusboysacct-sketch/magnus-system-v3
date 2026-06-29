// src/pages/ProjectDashboardPage.tsx — v4: Milestones + Tasks + full project management
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Ruler, ShoppingCart, Wallet, FileText, BarChart3,
  ArrowRight, DollarSign, Users, Package, Receipt,
  Clock, CheckCircle2, AlertCircle, TrendingUp,
  TrendingDown, Building2, RefreshCw, ChevronLeft,
  Plus, X, Save, ListTodo, Trash2, Edit2, Flag,
  Calendar, Target, Layers
} from "lucide-react";

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",maximumFractionDigits:0}).format(n);
}
function fmtShort(n: number) {
  if(n>=1000000)return `J$${(n/1000000).toFixed(1)}M`;
  if(n>=1000)return `J$${(n/1000).toFixed(0)}K`;
  return fmtJMD(n);
}
function fmtTime(d: string) {
  const diff=Date.now()-new Date(d).getTime();
  const mins=Math.floor(diff/60000);
  if(mins<60)return `${mins}m ago`;
  const hrs=Math.floor(mins/60);
  if(hrs<24)return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime()-new Date(a).getTime())/(1000*60*60*24));
}
function daysFromNow(d: string) {
  const diff=new Date(d).getTime()-Date.now();
  const days=Math.round(diff/(1000*60*60*24));
  if(days<0)return `${Math.abs(days)} days overdue`;
  if(days===0)return "Due today";
  return `${days} days left`;
}

type Tab = "overview"|"milestones"|"tasks"|"financials"|"team"|"activity"|"messages";

const STATUS_CFG: Record<string,{color:string;bg:string;border:string}> = {
  active:   {color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20"},
  planning: {color:"text-blue-400",   bg:"bg-blue-500/10",   border:"border-blue-500/20"},
  on_hold:  {color:"text-amber-400",  bg:"bg-amber-500/10",  border:"border-amber-500/20"},
  completed:{color:"text-purple-400", bg:"bg-purple-500/10", border:"border-purple-500/20"},
  cancelled:{color:"text-red-400",    bg:"bg-red-500/10",    border:"border-red-500/20"},
};

const MS_STATUS_CFG: Record<string,{color:string;bg:string;border:string;label:string}> = {
  planned:  {color:"text-slate-600 dark:text-slate-400",  bg:"bg-slate-500/10",  border:"border-slate-500/20",  label:"Planned"},
  active:   {color:"text-cyan-400",   bg:"bg-cyan-500/10",   border:"border-cyan-500/20",   label:"Active"},
  complete: {color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20",label:"Complete"},
  on_hold:  {color:"text-amber-400",  bg:"bg-amber-500/10",  border:"border-amber-500/20",  label:"On Hold"},
};

const TASK_STATUS_CFG: Record<string,{color:string;bg:string;border:string}> = {
  planned:  {color:"text-slate-600 dark:text-slate-400",  bg:"bg-slate-500/10",  border:"border-slate-500/20"},
  active:   {color:"text-cyan-400",   bg:"bg-cyan-500/10",   border:"border-cyan-500/20"},
  complete: {color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20"},
};

const TRADE_TYPES = [
  "General Labour","Mason","Carpenter","Painter","Electrician",
  "Plumber","Steel Fixer","Tiler","Welder","Equipment Operator",
  "Driver","Landscaping","Other"
];

const UNITS = ["m²","m³","m","no.","bag","block","ton","kg","L","hr","day","ls"];export default function ProjectDashboardPage() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string>("");
  const [stats, setStats] = useState({
    totalExpenses:0, openPOs:0, totalPOValue:0, activeWorkers:0,
  });
  const [activity, setActivity] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string|null>(null);

  // Milestone form
  const [showMSForm, setShowMSForm] = useState(false);
  const [editingMS, setEditingMS] = useState<any>(null);
  const [msForm, setMsForm] = useState({
    milestone_name:"", description:"", status:"planned",
    planned_start_date:"", planned_end_date:"",
    planned_labour_cost:"", planned_material_cost:"",
    planned_equipment_cost:"", crew_size_needed:"",
    production_rate_per_day:"", payment_amount:"",
  });
  const [savingMS, setSavingMS] = useState(false);

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>("");
  const [taskForm, setTaskForm] = useState({
    task_name:"", task_description:"", trade_type:"General Labour",
    quantity:"", unit:"m²", rate_per_unit:"",
    start_date:"", end_date:"", status:"planned", milestone_id:"",
  });
  const [savingTask, setSavingTask] = useState(false);

  const [messages, setMessages] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newReply, setNewReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [currentUser, setCurrentUser] = useState<{id:string; full_name?:string} | null>(null);

  useEffect(()=>{ if(projectId) loadAll(); },[projectId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("user_profiles").select("id, full_name").eq("id", data.user.id).maybeSingle()
          .then(({ data: profile }) => setCurrentUser(profile));
      }
    });
  }, []);

  useEffect(() => {
    if (tab === "messages" && messages.some(m => m.sender_type === "client" && !m.read_at)) {
      supabase.from("client_comments")
        .update({ read_at: new Date().toISOString() })
        .eq("project_id", projectId!)
        .eq("sender_type", "client")
        .is("read_at", null)
        .then(() => loadMessages());
    }
  }, [tab]);

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const {data:proj,error:pe} = await supabase.from("projects")
        .select("id,name,status,client_id,start_date,end_date,notes,company_id,site_address")
        .eq("id",projectId!).maybeSingle();
      if(pe)throw pe;
      if(!proj)throw new Error("Project not found");
      setProject(proj);
      setCompanyId(proj.company_id||"");

      if(proj.client_id){
        const {data:cl}=await supabase.from("clients")
          .select("id,name,email,phone,address").eq("id",proj.client_id).maybeSingle();
        setClient(cl);
      }

      const [expRes,poRes,workerRes,msRes,taskRes,msgRes]=await Promise.allSettled([
        supabase.from("expenses").select("amount,description,created_at").eq("project_id",projectId!),
        supabase.from("purchase_orders").select("id,status,created_at,supplier_name").eq("project_id",projectId!),
        supabase.from("workers").select("id,first_name,last_name,worker_type,status").eq("company_id",proj.company_id||"").eq("status","active").limit(30),
        supabase.from("project_milestones").select("*").eq("project_id",projectId!).order("milestone_no",{ascending:true}),
        supabase.from("project_tasks").select("id,task_name,task_description,trade_type,quantity,unit,rate_per_unit,start_date,end_date,status,percent_complete,milestone_id").eq("project_id",projectId!).order("created_at",{ascending:true}),
        supabase.from("client_comments").select("*").eq("project_id",projectId!).order("created_at",{ascending:true}),
      ]);

      const expenses=expRes.status==="fulfilled"?expRes.value.data||[]:[];
      const pos=poRes.status==="fulfilled"?poRes.value.data||[]:[];
      const workerList=workerRes.status==="fulfilled"?workerRes.value.data||[]:[];
      const msList=msRes.status==="fulfilled"?msRes.value.data||[]:[];
      const taskList=taskRes.status==="fulfilled"?taskRes.value.data||[]:[];
      const msgList=msgRes.status==="fulfilled"?msgRes.value.data||[]:[];

      setWorkers(workerList);
      setMilestones(msList);
      setTasks(taskList);
      setMessages(msgList);
      setUnreadCount(msgList.filter((m:any)=>m.sender_type==="client"&&!m.read_at).length);

      setStats({
        totalExpenses:expenses.reduce((s:number,e:any)=>s+(Number(e.amount)||0),0),
        openPOs:pos.filter((p:any)=>["pending","submitted","approved"].includes(p.status)).length,
        totalPOValue:0,
        activeWorkers:workerList.length,
      });

      const acts:any[]=[];
      pos.slice(0,5).forEach((p:any)=>acts.push({id:p.id,type:"po",label:`PO to ${p.supplier_name||"Supplier"}`,amount:0,time:p.created_at,status:p.status}));
      expenses.slice(0,5).forEach((e:any,i:number)=>acts.push({id:`exp-${i}`,type:"expense",label:e.description||"Expense",amount:e.amount,time:e.created_at||new Date().toISOString()}));
      acts.sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime());
      setActivity(acts.slice(0,8));
    } catch(e:any){setError(e.message||"Failed to load project");}
    setLoading(false);
  }

  async function loadMilestones() {
    const {data}=await supabase.from("project_milestones").select("*").eq("project_id",projectId!).order("milestone_no",{ascending:true});
    setMilestones(data||[]);
  }

  async function loadTasks() {
    const {data}=await supabase.from("project_tasks").select("id,task_name,task_description,trade_type,quantity,unit,rate_per_unit,start_date,end_date,status,percent_complete,milestone_id").eq("project_id",projectId!).order("created_at",{ascending:true});
    setTasks(data||[]);
  }

  async function loadMessages() {
    const { data } = await supabase
      .from("client_comments")
      .select("*")
      .eq("project_id", projectId!)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setUnreadCount((data || []).filter((m:any) => m.sender_type === "client" && !m.read_at).length);
  }

  async function sendReply() {
    if (!newReply.trim() || !currentUser) return;
    setSendingReply(true);
    const { error } = await supabase.from("client_comments").insert({
      project_id: projectId,
      client_id: project?.client_id || null,
      message: newReply,
      sender_type: "staff",
      sender_id: currentUser.id,
    });
    if (!error) { setNewReply(""); await loadMessages(); }
    setSendingReply(false);
  }

  // ── Milestone functions ──
  function openNewMS() {
    setEditingMS(null);
    setMsForm({milestone_name:"",description:"",status:"planned",planned_start_date:"",planned_end_date:"",planned_labour_cost:"",planned_material_cost:"",planned_equipment_cost:"",crew_size_needed:"",production_rate_per_day:"",payment_amount:""});
    setShowMSForm(true);
  }

  function openEditMS(ms: any) {
    setEditingMS(ms);
    setMsForm({
      milestone_name:ms.milestone_name||"",description:ms.description||"",status:ms.status||"planned",
      planned_start_date:ms.planned_start_date||"",planned_end_date:ms.planned_end_date||"",
      planned_labour_cost:String(ms.planned_labour_cost||""),planned_material_cost:String(ms.planned_material_cost||""),
      planned_equipment_cost:String(ms.planned_equipment_cost||""),crew_size_needed:String(ms.crew_size_needed||""),
      production_rate_per_day:String(ms.production_rate_per_day||""),payment_amount:String(ms.payment_amount||""),
    });
    setShowMSForm(true);
  }

  async function saveMS() {
    if(!msForm.milestone_name.trim()){alert("Milestone name required.");return;}
    setSavingMS(true);
    const labour=parseFloat(msForm.planned_labour_cost)||0;
    const material=parseFloat(msForm.planned_material_cost)||0;
    const equipment=parseFloat(msForm.planned_equipment_cost)||0;
    const payload:any={
      project_id:projectId, company_id:companyId,
      milestone_name:msForm.milestone_name.trim(),
      description:msForm.description.trim()||null,
      status:msForm.status||"planned",
      planned_start_date:msForm.planned_start_date||null,
      planned_end_date:msForm.planned_end_date||null,
      planned_labour_cost:labour,
      planned_material_cost:material,
      planned_equipment_cost:equipment,
      planned_total_cost:labour+material+equipment,
      crew_size_needed:parseFloat(msForm.crew_size_needed)||null,
      production_rate_per_day:parseFloat(msForm.production_rate_per_day)||null,
      payment_amount:parseFloat(msForm.payment_amount)||0,
      milestone_no:editingMS?editingMS.milestone_no:milestones.length+1,
    };
    if(editingMS){
      await supabase.from("project_milestones").update(payload).eq("id",editingMS.id);
    } else {
      await supabase.from("project_milestones").insert(payload);
    }
    setSavingMS(false); setShowMSForm(false);
    await loadMilestones();
  }

  async function deleteMS(id: string) {
    if(!confirm("Delete this milestone and all its tasks?"))return;
    await supabase.from("project_tasks").update({milestone_id:null}).eq("milestone_id",id);
    await supabase.from("project_milestones").delete().eq("id",id);
    await loadMilestones(); await loadTasks();
  }

  async function updateMSStatus(id: string, status: string) {
    const updates:any={status};
    if(status==="active")updates.actual_start_date=new Date().toISOString().slice(0,10);
    if(status==="complete"){updates.actual_end_date=new Date().toISOString().slice(0,10);updates.percent_complete=100;}
    await supabase.from("project_milestones").update(updates).eq("id",id);
    setMilestones(prev=>prev.map(m=>m.id===id?{...m,...updates}:m));
  }

  // ── Task functions ──
  function openNewTask(milestoneId?: string) {
    setEditingTask(null);
    setTaskForm({task_name:"",task_description:"",trade_type:"General Labour",quantity:"",unit:"m²",rate_per_unit:"",start_date:"",end_date:"",status:"planned",milestone_id:milestoneId||""});
    setShowTaskForm(true);
  }

  function openEditTask(task: any) {
    setEditingTask(task);
    setTaskForm({
      task_name:task.task_name||"",task_description:task.task_description||"",
      trade_type:task.trade_type||"General Labour",quantity:String(task.quantity||""),
      unit:task.unit||"m²",rate_per_unit:String(task.rate_per_unit||""),
      start_date:task.start_date||"",end_date:task.end_date||"",
      status:task.status||"planned",milestone_id:task.milestone_id||"",
    });
    setShowTaskForm(true);
  }

  async function saveTask() {
    if(!taskForm.task_name.trim()){alert("Task name required.");return;}
    setSavingTask(true);
    const payload:any={
      project_id:projectId,
      task_name:taskForm.task_name.trim(),
      status:taskForm.status||"planned",
      start_date:taskForm.start_date||null,
      end_date:taskForm.end_date||null,
      milestone_id:taskForm.milestone_id||null,
    };
    if(taskForm.task_description.trim())payload.task_description=taskForm.task_description.trim();
    if(taskForm.trade_type)payload.trade_type=taskForm.trade_type;
    if(taskForm.quantity)payload.quantity=parseFloat(taskForm.quantity);
    if(taskForm.unit)payload.unit=taskForm.unit;
    if(taskForm.rate_per_unit)payload.rate_per_unit=parseFloat(taskForm.rate_per_unit);
    if(editingTask){
      await supabase.from("project_tasks").update(payload).eq("id",editingTask.id);
    } else {
      await supabase.from("project_tasks").insert(payload);
    }
    setSavingTask(false); setShowTaskForm(false);
    await loadTasks();
  }

  async function deleteTask(id: string) {
    if(!confirm("Delete this task?"))return;
    await supabase.from("project_tasks").delete().eq("id",id);
    await loadTasks();
  }

  async function updateTaskStatus(id: string, status: string) {
    await supabase.from("project_tasks").update({status,percent_complete:status==="complete"?100:status==="active"?50:0}).eq("id",id);
    setTasks(prev=>prev.map(t=>t.id===id?{...t,status}:t));
  }if(loading)return(
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-600">
        <RefreshCw size={14} className="animate-spin text-cyan-500"/> Loading project…
      </div>
    </div>
  );

  if(error||!project)return(
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <AlertCircle size={32} className="text-red-400 mx-auto"/>
        <div className="text-sm text-slate-700 dark:text-slate-300">{error||"Project not found"}</div>
        <button onClick={()=>nav("/projects")} className="text-xs text-cyan-400 hover:text-cyan-300">← Back to Projects</button>
      </div>
    </div>
  );

  const budget=0;
  const spent=stats.totalExpenses;
  const statusCfg=STATUS_CFG[project.status]||STATUS_CFG.planning;
  const totalPlannedCost=milestones.reduce((s,m)=>s+(Number(m.planned_total_cost)||0),0);
  const totalActualCost=milestones.reduce((s,m)=>s+(Number(m.actual_total_cost)||0),0);
  const msComplete=milestones.filter(m=>m.status==="complete").length;
  const overallProgress=milestones.length>0?Math.round((msComplete/milestones.length)*100):0;

  const MODULES=[
    {label:"BOQ Builder",icon:<FileText size={15}/>,to:`/projects/${projectId}/boq`,color:"text-blue-400",bg:"bg-blue-500/10",border:"border-blue-500/20",desc:"Bills of quantities"},
    {label:"Takeoff",icon:<Ruler size={15}/>,to:`/projects/${projectId}/takeoff`,color:"text-cyan-400",bg:"bg-cyan-500/10",border:"border-cyan-500/20",desc:"PDF measurements"},
    {label:"Procurement",icon:<ShoppingCart size={15}/>,to:`/projects/${projectId}/procurement`,color:"text-amber-400",bg:"bg-amber-500/10",border:"border-amber-500/20",desc:"Purchase orders"},
    {label:"Finance",icon:<Wallet size={15}/>,to:`/projects/${projectId}/finance`,color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20",desc:"Project finances"},
    {label:"Reports",icon:<BarChart3 size={15}/>,to:`/projects/${projectId}/reports`,color:"text-violet-400",bg:"bg-violet-500/10",border:"border-violet-500/20",desc:"Analytics"},
  ];

  const TABS:[{key:Tab;label:string;count?:number}] =[
    {key:"overview",label:"Overview"},
    {key:"milestones",label:"Milestones",count:milestones.length},
    {key:"tasks",label:"Tasks",count:tasks.length},
    {key:"financials",label:"Financials"},
    {key:"team",label:"Team",count:stats.activeWorkers},
    {key:"activity",label:"Activity",count:activity.length},
    {key:"messages",label:"Messages",count:unreadCount},
  ] as any;

  return(
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] text-slate-100">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d1117] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={()=>nav("/projects")} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition flex-shrink-0">
              <ChevronLeft size={16}/>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 truncate">{project.name}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                  {project.status?.replace("_"," ")}
                </span>
              </div>
              <p className="text-xs text-slate-500">{client?.name||"No client assigned"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={loadAll} className="p-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">
              <RefreshCw size={13}/>
            </button>
            <button onClick={()=>nav(`/projects/${projectId}/takeoff`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-slate-300 font-semibold transition">
              <Ruler size={12}/> Takeoff
            </button>
            <button onClick={()=>nav(`/projects/${projectId}/boq`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition">
              <FileText size={12}/> BOQ
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d1117] px-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((t:any)=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition whitespace-nowrap ${tab===t.key?"border-cyan-500 text-cyan-300":"border-transparent text-slate-400 dark:text-slate-700 hover:text-slate-500"}`}>
              {t.label}
              {t.count!==undefined&&t.count>0&&(
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab===t.key?"bg-cyan-500/20 text-cyan-400":"bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600"}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">{/* ── OVERVIEW ── */}
        {tab==="overview"&&(
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {label:"Milestones",  value:`${msComplete}/${milestones.length}`, sub:"completed", color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20",    icon:<Flag size={14}/>},
                {label:"Tasks",       value:tasks.length,                          sub:`${tasks.filter(t=>t.status==="complete").length} done`, color:"text-violet-400", bg:"bg-violet-500/10", border:"border-violet-500/20", icon:<ListTodo size={14}/>},
                {label:"Spent",       value:fmtShort(spent),                       sub:"total expenses", color:"text-amber-400",  bg:"bg-amber-500/10",   border:"border-amber-500/20",   icon:<Receipt size={14}/>},
                {label:"Team Size",   value:stats.activeWorkers,                   sub:"active workers", color:"text-emerald-400",bg:"bg-emerald-500/10", border:"border-emerald-500/20", icon:<Users size={14}/>},
              ].map(card=>(
                <div key={card.label} className={`rounded-xl border ${card.border} ${card.bg} p-4`}>
                  <div className={`${card.color} mb-2`}>{card.icon}</div>
                  <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{card.label}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-700 mt-0.5">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Overall Progress */}
            {milestones.length>0&&(
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Overall Project Progress</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-600 mt-0.5">{msComplete} of {milestones.length} milestones complete</div>
                  </div>
                  <div className="text-2xl font-bold text-cyan-400">{overallProgress}%</div>
                </div>
                <div className="w-full bg-slate-200 dark:bg-white/[0.06] rounded-full h-3">
                  <div className="h-3 rounded-full bg-cyan-500 transition-all" style={{width:`${overallProgress}%`}}/>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {milestones.map(m=>{
                    const cfg=MS_STATUS_CFG[m.status]||MS_STATUS_CFG.planned;
                    return(
                      <div key={m.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                        {m.status==="complete"?<CheckCircle2 size={10}/>:<Clock size={10}/>}
                        {m.milestone_name}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Module links */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Project Modules</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5">
                {MODULES.map((m,i)=>(
                  <button key={m.to} onClick={()=>nav(m.to)}
                    className={`flex flex-col items-center gap-2 p-5 hover:bg-white/[0.03] transition group ${i<MODULES.length-1?"border-r border-slate-100 dark:border-white/[0.04]":""}`}>
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110 ${m.bg} ${m.border}`}>
                      <span className={m.color}>{m.icon}</span>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 group-hover:text-white transition">{m.label}</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-700 mt-0.5">{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Project info + Client */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-4">Project Details</div>
                <div className="space-y-3">
                  {[
                    {label:"Status",  value:<span className={`text-xs font-bold capitalize ${statusCfg.color}`}>{project.status?.replace("_"," ")}</span>},
                    {label:"Start",   value:<span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{project.start_date?new Date(project.start_date).toLocaleDateString():"—"}</span>},
                    {label:"End",     value:<span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{project.end_date?new Date(project.end_date).toLocaleDateString():"—"}</span>},
                    {label:"Milestones",value:<span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{milestones.length}</span>},
                    {label:"Tasks",   value:<span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{tasks.length}</span>},
                    {label:"Open POs",value:<span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{stats.openPOs}</span>},
                  ].map(row=>(
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 dark:text-slate-600">{row.label}</span>
                      {row.value}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-4">Client</div>
                {client?(
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <Building2 size={16} className="text-cyan-400"/>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{client.name}</div>
                        {client.email&&<div className="text-[10px] text-slate-500 dark:text-slate-600">{client.email}</div>}
                      </div>
                    </div>
                    {client.phone&&<div className="flex justify-between"><span className="text-[11px] text-slate-500 dark:text-slate-600">Phone</span><span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{client.phone}</span></div>}
                    {client.address&&<div className="flex justify-between"><span className="text-[11px] text-slate-500 dark:text-slate-600">Address</span><span className="text-xs text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[160px]">{client.address}</span></div>}
                  </div>
                ):(
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <Building2 size={20} className="text-slate-400 dark:text-slate-700"/>
                    <p className="text-xs text-slate-500 dark:text-slate-600">No client assigned</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}{/* ── MILESTONES ── */}
        {tab==="milestones"&&(
          <>
            {/* Milestone Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                {label:"Total",    value:milestones.length,                              color:"text-slate-700 dark:text-slate-300",   bg:"bg-slate-50 dark:bg-white/[0.04]",   border:"border-slate-200 dark:border-white/[0.07]"},
                {label:"Planned",  value:milestones.filter(m=>m.status==="planned").length,  color:"text-slate-600 dark:text-slate-400",   bg:"bg-slate-500/10",   border:"border-slate-500/20"},
                {label:"Active",   value:milestones.filter(m=>m.status==="active").length,   color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20"},
                {label:"Complete", value:milestones.filter(m=>m.status==="complete").length, color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20"},
              ].map(s=>(
                <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-3 text-center`}>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Budget Summary */}
            {totalPlannedCost>0&&(
              <div className="grid grid-cols-3 gap-3">
                {[
                  {label:"Planned Budget",  value:fmtJMD(totalPlannedCost), color:"text-blue-400",    bg:"bg-blue-500/10",    border:"border-blue-500/20"},
                  {label:"Actual Cost",     value:fmtJMD(totalActualCost),  color:"text-amber-400",   bg:"bg-amber-500/10",   border:"border-amber-500/20"},
                  {label:"Variance",        value:fmtJMD(totalPlannedCost-totalActualCost), color:totalActualCost>totalPlannedCost?"text-red-400":"text-emerald-400", bg:totalActualCost>totalPlannedCost?"bg-red-500/10":"bg-emerald-500/10", border:totalActualCost>totalPlannedCost?"border-red-500/20":"border-emerald-500/20"},
                ].map(s=>(
                  <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Project Milestones</span>
              <button onClick={openNewMS}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition">
                <Plus size={12}/> Add Milestone
              </button>
            </div>

            {/* Milestone Form Modal */}
            {showMSForm&&(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07] sticky top-0 bg-white dark:bg-[#0d1117]">
                    <span className="text-sm font-bold text-slate-100">{editingMS?"Edit Milestone":"New Milestone"}</span>
                    <button onClick={()=>setShowMSForm(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500"><X size={14}/></button>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Milestone Name *</label>
                      <input value={msForm.milestone_name} onChange={e=>setMsForm(f=>({...f,milestone_name:e.target.value}))}
                        placeholder="e.g. Foundation Phase, Superstructure, Roofing..."
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Description</label>
                      <textarea value={msForm.description} onChange={e=>setMsForm(f=>({...f,description:e.target.value}))}
                        placeholder="What does this milestone involve..." rows={2}
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50 resize-none"/>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Status</label>
                      <select value={msForm.status} onChange={e=>setMsForm(f=>({...f,status:e.target.value}))}
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                        <option value="planned">Planned</option>
                        <option value="active">Active</option>
                        <option value="complete">Complete</option>
                        <option value="on_hold">On Hold</option>
                      </select>
                    </div>

                    {/* Timeline */}
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3 space-y-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Timeline</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Planned Start</label>
                          <input type="date" value={msForm.planned_start_date} onChange={e=>setMsForm(f=>({...f,planned_start_date:e.target.value}))}
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-cyan-500/50"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Planned End</label>
                          <input type="date" value={msForm.planned_end_date} onChange={e=>setMsForm(f=>({...f,planned_end_date:e.target.value}))}
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-cyan-500/50"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Crew Size Needed</label>
                          <input type="number" value={msForm.crew_size_needed} onChange={e=>setMsForm(f=>({...f,crew_size_needed:e.target.value}))}
                            placeholder="e.g. 5"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Production Rate/Day</label>
                          <input type="number" value={msForm.production_rate_per_day} onChange={e=>setMsForm(f=>({...f,production_rate_per_day:e.target.value}))}
                            placeholder="e.g. 100 blocks/day"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                        </div>
                      </div>
                    </div>

                    {/* Budget */}
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3 space-y-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Planned Budget (JMD)</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Labour</label>
                          <input type="number" value={msForm.planned_labour_cost} onChange={e=>setMsForm(f=>({...f,planned_labour_cost:e.target.value}))}
                            placeholder="0"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Materials</label>
                          <input type="number" value={msForm.planned_material_cost} onChange={e=>setMsForm(f=>({...f,planned_material_cost:e.target.value}))}
                            placeholder="0"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Equipment</label>
                          <input type="number" value={msForm.planned_equipment_cost} onChange={e=>setMsForm(f=>({...f,planned_equipment_cost:e.target.value}))}
                            placeholder="0"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                        </div>
                      </div>
                      {(msForm.planned_labour_cost||msForm.planned_material_cost||msForm.planned_equipment_cost)&&(
                        <div className="text-xs text-slate-500 text-center">
                          Total: <span className="text-cyan-400 font-bold">{fmtJMD((parseFloat(msForm.planned_labour_cost)||0)+(parseFloat(msForm.planned_material_cost)||0)+(parseFloat(msForm.planned_equipment_cost)||0))}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Contract Payment Amount (JMD)</label>
                      <input type="number" value={msForm.payment_amount} onChange={e=>setMsForm(f=>({...f,payment_amount:e.target.value}))}
                        placeholder="Amount client pays when this milestone is complete"
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                    </div>
                  </div>
                  <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/[0.07]">
                    <button onClick={()=>setShowMSForm(false)}
                      className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 transition">Cancel</button>
                    <button onClick={saveMS} disabled={savingMS||!msForm.milestone_name.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-40 transition">
                      <Save size={13}/>{savingMS?"Saving…":editingMS?"Update Milestone":"Create Milestone"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Milestone List */}
            {milestones.length===0?(
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117]">
                <Flag size={24} className="text-slate-400 dark:text-slate-700"/>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">No milestones yet</p>
                <p className="text-slate-400 dark:text-slate-700 text-xs">Break your project into phases — Foundation, Superstructure, Roofing...</p>
                <button onClick={openNewMS}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition mt-1">
                  <Plus size={12}/> Add First Milestone
                </button>
              </div>
            ):(
              <div className="flex flex-col gap-4">
                {milestones.map(ms=>{
                  const cfg=MS_STATUS_CFG[ms.status]||MS_STATUS_CFG.planned;
                  const msTasks=tasks.filter(t=>t.milestone_id===ms.id);
                  const msTasksDone=msTasks.filter(t=>t.status==="complete").length;
                  const daysPlanned=ms.planned_start_date&&ms.planned_end_date?daysBetween(ms.planned_start_date,ms.planned_end_date):null;
                  const prediction=ms.planned_end_date&&ms.status!=="complete"?daysFromNow(ms.planned_end_date):null;
                  return(
                    <div key={ms.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
                      {/* Milestone Header */}
                      <div className="p-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-600">#{ms.milestone_no}</span>
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{ms.milestone_name}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>{cfg.label}</span>
                          </div>
                          {ms.description&&<p className="text-[11px] text-slate-500 dark:text-slate-600 mb-2">{ms.description}</p>}

                          {/* Timeline info */}
                          <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 dark:text-slate-600">
                            {ms.planned_start_date&&<span>📅 Start: {new Date(ms.planned_start_date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                            {ms.planned_end_date&&<span>🏁 End: {new Date(ms.planned_end_date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                            {daysPlanned&&<span>⏱ {daysPlanned} days planned</span>}
                            {ms.crew_size_needed&&<span>👷 {ms.crew_size_needed} workers needed</span>}
                            {prediction&&<span className={prediction.includes("overdue")?"text-red-400 font-semibold":"text-amber-400"}>⚠️ {prediction}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={()=>openNewTask(ms.id)}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-semibold hover:bg-cyan-500/20 transition">
                            <Plus size={10}/> Task
                          </button>
                          <button onClick={()=>openEditMS(ms)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition"><Edit2 size={12}/></button>
                          <button onClick={()=>deleteMS(ms.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-slate-600 hover:text-red-400 transition"><Trash2 size={12}/></button>
                        </div>
                      </div>

                      {/* Budget Row */}
                      {ms.planned_total_cost>0&&(
                        <div className="px-4 py-2 border-t border-slate-100 dark:border-white/[0.04] grid grid-cols-3 gap-4 bg-slate-50 dark:bg-white/[0.01]">
                          {[
                            {label:"Planned",value:fmtJMD(ms.planned_total_cost),color:"text-blue-400"},
                            {label:"Actual", value:fmtJMD(ms.actual_total_cost||0),color:"text-amber-400"},
                            {label:"Payment",value:fmtJMD(ms.payment_amount||0),color:"text-emerald-400"},
                          ].map(b=>(
                            <div key={b.label} className="text-center">
                              <div className={`text-sm font-bold ${b.color}`}>{b.value}</div>
                              <div className="text-[9px] text-slate-400 dark:text-slate-700 uppercase tracking-wider">{b.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tasks under milestone */}
                      {msTasks.length>0&&(
                        <div className="border-t border-slate-100 dark:border-white/[0.04]">
                          <div className="px-4 py-2 flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Tasks ({msTasksDone}/{msTasks.length} done)</span>
                          </div>
                          {msTasks.map(t=>{
                            const tcfg=TASK_STATUS_CFG[t.status]||TASK_STATUS_CFG.planned;
                            const tTotal=(parseFloat(t.quantity)||0)*(parseFloat(t.rate_per_unit)||0);
                            return(
                              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.03] hover:bg-slate-50 dark:bg-white/[0.02] transition">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${tcfg.color} ${tcfg.bg} ${tcfg.border}`}>{t.status}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.task_name}</div>
                                  {t.trade_type&&<div className="text-[9px] text-slate-500 dark:text-slate-600">{t.trade_type}</div>}
                                </div>
                                {t.quantity&&<span className="text-[10px] text-slate-500 dark:text-slate-600">{t.quantity} {t.unit||""}</span>}
                                {tTotal>0&&<span className="text-xs font-bold text-emerald-400">{fmtJMD(tTotal)}</span>}
                                <div className="flex items-center gap-1">
                                  <button onClick={()=>openEditTask(t)} className="p-1 rounded hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300"><Edit2 size={10}/></button>
                                  <button onClick={()=>deleteTask(t.id)} className="p-1 rounded hover:bg-red-500/10 text-slate-500 dark:text-slate-600 hover:text-red-400"><Trash2 size={10}/></button>
                                  <select value={t.status} onChange={e=>updateTaskStatus(t.id,e.target.value)}
                                    className="text-[9px] bg-slate-50 dark:bg-[#080b10] border border-slate-200 dark:border-white/[0.07] rounded px-1 py-0.5 text-slate-500 outline-none">
                                    <option value="planned">Planned</option>
                                    <option value="active">Active</option>
                                    <option value="complete">Complete</option>
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Milestone footer - status change */}
                      <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.04] flex items-center justify-between bg-slate-50 dark:bg-white/[0.01]">
                        <span className="text-[10px] text-slate-500 dark:text-slate-600">{msTasks.length} tasks · {msTasksDone} complete</span>
                        <select value={ms.status} onChange={e=>updateMSStatus(ms.id,e.target.value)}
                          className="text-[10px] bg-slate-50 dark:bg-[#080b10] border border-slate-200 dark:border-white/[0.07] rounded px-2 py-1 text-slate-600 dark:text-slate-400 outline-none">
                          <option value="planned">Planned</option>
                          <option value="active">Active</option>
                          <option value="complete">Complete</option>
                          <option value="on_hold">On Hold</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}{/* ── TASKS ── */}
        {(tab==="tasks"||showTaskForm)&&(
          <>
            <div className="grid grid-cols-4 gap-3">
              {[
                {label:"Total",    value:tasks.length,                                color:"text-slate-700 dark:text-slate-300",   bg:"bg-slate-50 dark:bg-white/[0.04]",   border:"border-slate-200 dark:border-white/[0.07]"},
                {label:"Planned",  value:tasks.filter(t=>t.status==="planned").length, color:"text-slate-600 dark:text-slate-400",   bg:"bg-slate-500/10",   border:"border-slate-500/20"},
                {label:"Active",   value:tasks.filter(t=>t.status==="active").length,  color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20"},
                {label:"Complete", value:tasks.filter(t=>t.status==="complete").length,color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20"},
              ].map(s=>(
                <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-3 text-center`}>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">All Tasks</span>
              <button onClick={()=>openNewTask()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition">
                <Plus size={12}/> Add Task
              </button>
            </div>

            {/* Task Form Modal */}
            {showTaskForm&&(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07] sticky top-0 bg-white dark:bg-[#0d1117]">
                    <span className="text-sm font-bold text-slate-100">{editingTask?"Edit Task":"New Task"}</span>
                    <button onClick={()=>setShowTaskForm(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500"><X size={14}/></button>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Milestone</label>
                      <select value={taskForm.milestone_id} onChange={e=>setTaskForm(f=>({...f,milestone_id:e.target.value}))}
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                        <option value="">No milestone</option>
                        {milestones.map(m=><option key={m.id} value={m.id}>{m.milestone_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Task Name *</label>
                      <input value={taskForm.task_name} onChange={e=>setTaskForm(f=>({...f,task_name:e.target.value}))}
                        placeholder="e.g. Lay foundation blocks, Paint exterior walls..."
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Description</label>
                      <textarea value={taskForm.task_description} onChange={e=>setTaskForm(f=>({...f,task_description:e.target.value}))}
                        placeholder="What exactly needs to be done..." rows={2}
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50 resize-none"/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Trade Type</label>
                        <select value={taskForm.trade_type} onChange={e=>setTaskForm(f=>({...f,trade_type:e.target.value}))}
                          className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                          {TRADE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Status</label>
                        <select value={taskForm.status} onChange={e=>setTaskForm(f=>({...f,status:e.target.value}))}
                          className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                          <option value="planned">Planned</option>
                          <option value="active">Active</option>
                          <option value="complete">Complete</option>
                        </select>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3 space-y-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Quantity & Rate (for field payments)</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Quantity</label>
                          <input type="number" value={taskForm.quantity} onChange={e=>setTaskForm(f=>({...f,quantity:e.target.value}))} placeholder="0"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-cyan-500/50"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Unit</label>
                          <select value={taskForm.unit} onChange={e=>setTaskForm(f=>({...f,unit:e.target.value}))}
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                            {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Rate/Unit (JMD)</label>
                          <input type="number" value={taskForm.rate_per_unit} onChange={e=>setTaskForm(f=>({...f,rate_per_unit:e.target.value}))} placeholder="0.00"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-cyan-500/50"/>
                        </div>
                      </div>
                      {taskForm.quantity&&taskForm.rate_per_unit&&(
                        <div className="text-xs text-slate-500 text-center">
                          {taskForm.quantity} {taskForm.unit} × {fmtJMD(parseFloat(taskForm.rate_per_unit)||0)} = <span className="text-emerald-400 font-bold">{fmtJMD((parseFloat(taskForm.quantity)||0)*(parseFloat(taskForm.rate_per_unit)||0))}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Start Date</label>
                        <input type="date" value={taskForm.start_date} onChange={e=>setTaskForm(f=>({...f,start_date:e.target.value}))}
                          className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none"/>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">End Date</label>
                        <input type="date" value={taskForm.end_date} onChange={e=>setTaskForm(f=>({...f,end_date:e.target.value}))}
                          className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none"/>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/[0.07]">
                    <button onClick={()=>setShowTaskForm(false)}
                      className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 transition">Cancel</button>
                    <button onClick={saveTask} disabled={savingTask||!taskForm.task_name.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-40 transition">
                      <Save size={13}/>{savingTask?"Saving…":editingTask?"Update Task":"Create Task"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tasks.length===0?(
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117]">
                <ListTodo size={24} className="text-slate-400 dark:text-slate-700"/>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">No tasks yet</p>
                <p className="text-slate-400 dark:text-slate-700 text-xs">Add milestones first, then add tasks to each milestone</p>
                <button onClick={()=>setTab("milestones")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition mt-1">
                  <Flag size={12}/> Go to Milestones
                </button>
              </div>
            ):(
              <div className="flex flex-col gap-3">
                {tasks.map(task=>{
                  const cfg=TASK_STATUS_CFG[task.status]||TASK_STATUS_CFG.planned;
                  const totalValue=(parseFloat(task.quantity)||0)*(parseFloat(task.rate_per_unit)||0);
                  const ms=milestones.find(m=>m.id===task.milestone_id);
                  return(
                    <div key={task.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          {ms&&<div className="text-[9px] text-cyan-600 font-bold uppercase tracking-wider mb-1">📍 {ms.milestone_name}</div>}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{task.task_name}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border capitalize ${cfg.color} ${cfg.bg} ${cfg.border}`}>{task.status}</span>
                          </div>
                          {task.task_description&&<p className="text-[11px] text-slate-500 dark:text-slate-600 mb-1">{task.task_description}</p>}
                          {task.trade_type&&<span className="text-[10px] text-slate-500 dark:text-slate-600">🔨 {task.trade_type}</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={()=>openEditTask(task)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition"><Edit2 size={12}/></button>
                          <button onClick={()=>deleteTask(task.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-slate-600 hover:text-red-400 transition"><Trash2 size={12}/></button>
                        </div>
                      </div>
                      {task.quantity&&(
                        <div className="flex items-center gap-4 text-xs mb-2 p-2 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04]">
                          <span className="text-slate-500">Qty: <span className="text-slate-700 dark:text-slate-300 font-semibold">{task.quantity} {task.unit||""}</span></span>
                          {task.rate_per_unit&&<span className="text-slate-500">Rate: <span className="text-slate-700 dark:text-slate-300 font-semibold">{fmtJMD(task.rate_per_unit)}/{task.unit||"unit"}</span></span>}
                          {totalValue>0&&<span className="text-slate-500 ml-auto">Total: <span className="text-emerald-400 font-bold">{fmtJMD(totalValue)}</span></span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-600">
                          {task.start_date&&<span>📅 {new Date(task.start_date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                          {task.end_date&&<span>→ {new Date(task.end_date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                        </div>
                        <select value={task.status} onChange={e=>updateTaskStatus(task.id,e.target.value)}
                          className="text-[10px] bg-slate-50 dark:bg-[#080b10] border border-slate-200 dark:border-white/[0.07] rounded px-2 py-1 text-slate-600 dark:text-slate-400 outline-none">
                          <option value="planned">Planned</option>
                          <option value="active">Active</option>
                          <option value="complete">Complete</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── FINANCIALS ── */}
        {tab==="financials"&&(
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {label:"Planned Budget",  value:fmtShort(totalPlannedCost), color:"text-blue-400",    icon:<Target size={14}/>},
                {label:"Actual Cost",     value:fmtShort(totalActualCost),  color:"text-amber-400",   icon:<TrendingDown size={14}/>},
                {label:"Variance",        value:fmtShort(Math.abs(totalPlannedCost-totalActualCost)), color:totalActualCost>totalPlannedCost?"text-red-400":"text-emerald-400", icon:<TrendingUp size={14}/>},
                {label:"PO Commitments",  value:fmtShort(0),                color:"text-violet-400",  icon:<Package size={14}/>},
              ].map(card=>(
                <div key={card.label} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] p-4">
                  <div className={`${card.color} mb-2`}>{card.icon}</div>
                  <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{card.label}</div>
                </div>
              ))}
            </div>
            {/* Cost per Milestone */}
            {milestones.length>0&&(
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Cost per Milestone</span>
                </div>
                {milestones.map((ms,i)=>{
                  const pct=ms.planned_total_cost>0?Math.min(100,(ms.actual_total_cost/ms.planned_total_cost)*100):0;
                  return(
                    <div key={ms.id} className={`px-5 py-4 border-b border-slate-100 dark:border-white/[0.04] last:border-0 ${i%2===1?"bg-slate-50 dark:bg-white/[0.01]":""}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ms.milestone_name}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-500">Planned: <span className="text-blue-400 font-semibold">{fmtJMD(ms.planned_total_cost||0)}</span></span>
                          <span className="text-slate-500">Actual: <span className="text-amber-400 font-semibold">{fmtJMD(ms.actual_total_cost||0)}</span></span>
                        </div>
                      </div>
                      {ms.planned_total_cost>0&&(
                        <div className="w-full bg-slate-200 dark:bg-white/[0.06] rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${pct>100?"bg-red-500":pct>70?"bg-amber-500":"bg-cyan-500"}`} style={{width:`${Math.min(pct,100)}%`}}/>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-white/[0.06]"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Quick Links</span></div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {[
                  {label:"Expenses",       to:"/expenses",           icon:<Receipt size={13}/>,      color:"text-amber-400"},
                  {label:"Purchase Orders",to:`/projects/${projectId}/procurement`,icon:<ShoppingCart size={13}/>,color:"text-blue-400"},
                  {label:"Cash Flow",      to:"/cash-flow",          icon:<TrendingUp size={13}/>,   color:"text-cyan-400"},
                  {label:"Accounts Recv.", to:"/accounts-receivable",icon:<FileText size={13}/>,     color:"text-violet-400"},
                ].map(l=>(
                  <button key={l.to} onClick={()=>nav(l.to)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-slate-200 dark:border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] transition text-left">
                    <span className={l.color}>{l.icon}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{l.label}</span>
                    <ArrowRight size={11} className="ml-auto text-slate-400 dark:text-slate-700"/>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── TEAM ── */}
        {tab==="team"&&(
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.06]">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Active Workers</span>
              <button onClick={()=>nav("/workers")} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">Manage <ArrowRight size={11}/></button>
            </div>
            {workers.length===0?(
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Users size={20} className="text-slate-400 dark:text-slate-700"/>
                <p className="text-xs text-slate-500 dark:text-slate-600">No active workers found</p>
                <button onClick={()=>nav("/workers")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition">
                  <Users size={11}/> Go to Workers
                </button>
              </div>
            ):workers.map((w:any)=>(
              <div key={w.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50 dark:bg-white/[0.02] transition">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Users size={12} className="text-violet-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{w.first_name} {w.last_name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-600">{w.worker_type||"General"}</div>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">{w.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {tab==="activity"&&(
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.06]">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Recent Activity</span>
            </div>
            {activity.length===0?(
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Clock size={20} className="text-slate-400 dark:text-slate-700"/>
                <p className="text-xs text-slate-500 dark:text-slate-600">No activity yet</p>
              </div>
            ):activity.map((a:any)=>{
              const typeMap:Record<string,{color:string;bg:string;icon:React.ReactNode}>={
                expense:{color:"text-amber-400",bg:"bg-amber-500/10",icon:<Receipt size={11}/>},
                po:{color:"text-blue-400",bg:"bg-blue-500/10",icon:<Package size={11}/>},
              };
              const t=typeMap[a.type]||typeMap.po;
              return(
                <div key={a.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                  <div className={`w-7 h-7 rounded-lg ${t.bg} flex items-center justify-center flex-shrink-0`}>
                    <span className={t.color}>{t.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{a.label}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-700 capitalize">{a.type} · {fmtTime(a.time)}</div>
                  </div>
                  {a.amount!==undefined&&<div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex-shrink-0">{fmtShort(Number(a.amount||0))}</div>}
                  {a.status&&(
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${a.status==="approved"?"bg-emerald-500/10 text-emerald-400 border-emerald-500/20":a.status==="pending"?"bg-amber-500/10 text-amber-400 border-amber-500/20":"bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"}`}>
                      {a.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab==="messages"&&(
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-96 overflow-y-auto space-y-3">
              {messages.length===0&&(
                <div className="text-sm text-slate-400 text-center py-8">No messages yet.</div>
              )}
              {messages.map((m:any)=>(
                <div key={m.id} className={`flex ${m.sender_type==="staff"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.sender_type==="staff"?"bg-cyan-600 text-white":"bg-slate-100 text-slate-800"
                  }`}>
                    <div>{m.message}</div>
                    <div className={`text-[10px] mt-1 ${m.sender_type==="staff"?"text-cyan-100":"text-slate-400"}`}>
                      {m.sender_type==="staff"?"You":"Client"} · {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea value={newReply} onChange={(e)=>setNewReply(e.target.value)}
                placeholder="Reply to client..." rows={2}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-cyan-400"/>
              <button onClick={sendReply} disabled={!newReply.trim()||sendingReply}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold disabled:opacity-50 self-end">
                {sendingReply?"Sending...":"Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}