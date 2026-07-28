// src/components/FieldPaymentForm.tsx
// Complete Field Payment: Advance + Progress + Final
// Receipt generated from text data on demand — no image storage
import React, { useRef, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { SimpleIDScanner } from "./SimpleIDScanner";
import html2canvas from "html2canvas";
import {
  Check, X, ChevronRight, ChevronLeft,
  DollarSign, FileText, PenTool, User,
  AlertCircle, CheckCircle2, RefreshCw,
  ListTodo, TrendingUp, CreditCard, Flag
} from "lucide-react";
import { cn } from "../components/ui";

// Payment type determines the flow
type PaymentType = "advance"|"progress"|"final"|"payment";
type Step = "type_select"|"id_scan"|"project_task"|"payment"|"signature"|"done";

type FormData = {
  // Payment type
  payment_type: PaymentType;
  // Worker
  worker_name: string; worker_id_number: string;
  worker_phone: string; worker_address: string;
  worker_ref: string; // worker_name + id_number combined key
  // Project/Milestone/Task
  project_id: string; milestone_id: string; task_id: string;
  task_name: string; trade_type: string; unit: string;
  // Payment
  rate_type: string; task_quantity: string;
  task_unit_rate: string; days_worked: string;
  rate_per_day: string; hours_worked: string;
  rate_per_hour: string; total_amount: string;
  advance_amount: string; balance_due: string;
  payment_method: string; notes: string;
  // Signature
  signature_data: string; supervisor_name: string;
};

const PAYMENT_METHODS = [
  {value:"cash",label:"Cash"},
  {value:"bank_transfer",label:"Bank Transfer"},
  {value:"check",label:"Cheque"},
  {value:"other",label:"Other"},
];

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:2}).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}function SignaturePad({ onSign, onClear }: { onSign:(data:string)=>void; onClear:()=>void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  function getPos(e: MouseEvent|TouchEvent, canvas: HTMLCanvasElement) {
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width; const scaleY=canvas.height/rect.height;
    if("touches" in e)return{x:(e.touches[0].clientX-rect.left)*scaleX,y:(e.touches[0].clientY-rect.top)*scaleY};
    return{x:(e.clientX-rect.left)*scaleX,y:(e.clientY-rect.top)*scaleY};
  }

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d")!;
    ctx.strokeStyle="#0891b2"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round";
    function start(e:MouseEvent|TouchEvent){e.preventDefault();drawing.current=true;const pos=getPos(e,canvas!);ctx.beginPath();ctx.moveTo(pos.x,pos.y);}
    function move(e:MouseEvent|TouchEvent){if(!drawing.current)return;e.preventDefault();const pos=getPos(e,canvas!);ctx.lineTo(pos.x,pos.y);ctx.stroke();setHasSign(true);}
    function stop(){if(!drawing.current)return;drawing.current=false;onSign(canvas!.toDataURL("image/png"));}
    canvas.addEventListener("mousedown",start);canvas.addEventListener("mousemove",move);canvas.addEventListener("mouseup",stop);
    canvas.addEventListener("touchstart",start,{passive:false});canvas.addEventListener("touchmove",move,{passive:false});canvas.addEventListener("touchend",stop);
    return()=>{
      canvas.removeEventListener("mousedown",start);canvas.removeEventListener("mousemove",move);canvas.removeEventListener("mouseup",stop);
      canvas.removeEventListener("touchstart",start);canvas.removeEventListener("touchmove",move);canvas.removeEventListener("touchend",stop);
    };
  },[]);

  function clear(){const canvas=canvasRef.current!;canvas.getContext("2d")!.clearRect(0,0,canvas.width,canvas.height);setHasSign(false);onClear();}

  return(
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-cyan-500/40 bg-white dark:bg-[#060910] overflow-hidden">
        <canvas ref={canvasRef} width={600} height={200} className="w-full touch-none cursor-crosshair" style={{height:180}}/>
        {!hasSign&&<div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="text-center"><PenTool size={24} className="text-slate-800 dark:text-slate-700 mx-auto mb-2"/><div className="text-xs text-slate-800 dark:text-slate-600">Sign here</div></div></div>}
      </div>
      {hasSign&&<button onClick={clear} className="flex items-center gap-1.5 text-[11px] text-slate-800 dark:text-slate-500 hover:text-red-400 transition"><RefreshCw size={11}/> Clear</button>}
    </div>
  );
}

function StepBar({step, paymentType}:{step:Step; paymentType:PaymentType}) {
  const steps=[
    {key:"type_select", label:"Type",    icon:<CreditCard size={11}/>},
    {key:"id_scan",     label:"Worker",  icon:<User size={11}/>},
    {key:"project_task",label:"Task",    icon:<ListTodo size={11}/>},
    {key:"payment",     label:"Amount",  icon:<DollarSign size={11}/>},
    {key:"signature",   label:"Sign",    icon:<PenTool size={11}/>},
    {key:"done",        label:"Receipt", icon:<FileText size={11}/>},
  ];
  const idx=steps.findIndex(s=>s.key===step);
  return(
    <div className="flex items-center justify-between mb-5">
      {steps.map((s,i)=>(
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-0.5">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all",
              i<idx?"bg-emerald-500 border-emerald-500 text-white":i===idx?"bg-cyan-600 border-cyan-400 text-white":"bg-slate-100 dark:bg-white/[0.04] border-slate-300 dark:border-white/[0.12] text-slate-500 dark:text-slate-600")}>
              {i<idx?<Check size={11}/>:s.icon}
            </div>
            <div className={cn("text-[8px] font-bold uppercase tracking-wider",i<=idx?"text-slate-800 dark:text-slate-300":"text-slate-400 dark:text-slate-700")}>{s.label}</div>
          </div>
          {i<steps.length-1&&<div className={cn("flex-1 h-0.5 mx-0.5 mb-3",i<idx?"bg-emerald-500":"bg-slate-200 dark:bg-white/[0.08]")}/>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Receipt Generator ─────────────────────────────────────────────────────────
// Generates receipt HTML from payment data — no image stored
export function generateReceiptHTML(payment: any, company: any, logoBase64?: string|null, watermark?: {url:string;opacity:number}|null) {
  const totalAdvances = payment.previous_advances||0;
  const earned = Number(payment.total_amount||0);
  const balance = earned - totalAdvances;
  
  return `
  <div style="background:#fff;padding:32px;font-family:Georgia,serif;color:#1a1a1a;max-width:600px;margin:0 auto">
    <div style="text-align:center;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:20px">
      ${logoBase64?`<img src="${logoBase64}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;margin:0 auto 10px;display:block"/>`:""}
      <div style="font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase">${company?.company_name||""}</div>
      ${company?.address_line1?`<div style="font-size:11px;color:#666;margin-top:3px">${company.address_line1}${company?.parish?`, ${company.parish}`:""}${company?.country?`, ${company.country}`:""}</div>`:""}
      <div style="font-size:11px;color:#666">${company?.phone?`Tel: ${company.phone}`:""}${company?.phone&&company?.email?" · ":""}${company?.email||""}</div>
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${payment.payment_type==="advance"?"#d97706":payment.payment_type==="final"?"#16a34a":"#0891b2"}">
          ${payment.payment_type==="advance"?"⚡ ADVANCE PAYMENT":payment.payment_type==="final"?"✅ FINAL PAYMENT — PAID IN FULL":"💰 PAYMENT RECEIPT"}
        </div>
        <div style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:3px;margin-top:4px">Payment Receipt</div>
        <div style="font-size:11px;color:#666;margin-top:3px">Receipt #${payment.receipt_number} · ${new Date(payment.created_at||Date.now()).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
      </div>
    </div>
    
    ${payment.project_name||payment.milestone_name||payment.task_name?`
    <div style="background:#f0f9ff;border-left:4px solid #0891b2;border-radius:8px;padding:12px 16px;margin-bottom:16px">
      ${payment.project_name?`<div style="font-size:12px;margin-bottom:3px"><span style="color:#666;width:80px;display:inline-block">Project:</span><strong>${payment.project_name}</strong></div>`:""}
      ${payment.milestone_name?`<div style="font-size:12px;margin-bottom:3px"><span style="color:#666;width:80px;display:inline-block">Milestone:</span><strong>${payment.milestone_name}</strong></div>`:""}
      ${payment.task_name?`<div style="font-size:12px"><span style="color:#666;width:80px;display:inline-block">Task:</span><strong>${payment.task_name}</strong></div>`:""}
    </div>`:""}

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tbody>
        <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px;width:140px">Worker</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.worker_name}</td></tr>
        ${payment.worker_id_number?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">ID Number</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.worker_id_number}</td></tr>`:""}
        ${payment.worker_phone?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Phone</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.worker_phone}</td></tr>`:""}
        ${payment.trade_type?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Trade</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.trade_type}</td></tr>`:""}
        <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Work Date</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${new Date(payment.work_date||Date.now()).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Payment Method</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right;text-transform:uppercase">${(payment.payment_method||"cash").replace("_"," ")}</td></tr>
        ${payment.work_type?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Work Done</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.work_type}</td></tr>`:""}
        ${totalAdvances>0?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Previous Advances</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right;color:#d97706">- ${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(totalAdvances)}</td></tr>`:""}
        ${payment.notes?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Notes</td><td style="padding:7px 0;font-size:13px;text-align:right">${payment.notes}</td></tr>`:""}
      </tbody>
    </table>

    <div style="border-top:3px solid #1a1a1a;border-bottom:3px solid #1a1a1a;padding:12px 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="font-size:16px;font-weight:900">${payment.payment_type==="advance"?"ADVANCE PAID":"TOTAL PAID"}</span>
      <span style="font-size:26px;font-weight:900;color:${payment.payment_type==="advance"?"#d97706":"#16a34a"}">${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(earned)}</span>
    </div>

    ${payment.payment_type==="advance"?`
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e">
      ⚡ This is an advance payment. Balance will be settled upon completion of work.
    </div>`:""}

    ${payment.payment_type==="final"?`
    <div style="background:#d1fae5;border:1px solid #10b981;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#065f46;text-align:center;font-weight:700">
      ✅ PAID IN FULL — All advances settled. Thank you!
    </div>`:""}

    ${payment.signature_data?`
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:8px">
      <div style="font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Worker Signature</div>
      <img src="${payment.signature_data}" style="height:56px;border:1px solid #e5e7eb;border-radius:6px;padding:4px"/>
      <div style="font-size:11px;color:#666;margin-top:4px">${payment.worker_name}</div>
    </div>`:""}

    ${watermark?.url?`<img src="${watermark.url}" style="position:fixed;bottom:6mm;right:6mm;height:${(watermark as any).size||25}mm;width:${(watermark as any).size||25}mm;object-fit:contain;object-position:bottom right;opacity:${watermark.opacity};pointer-events:none;z-index:0;-webkit-print-color-adjust:exact;print-color-adjust:exact"/>`:""}
    <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:12px;text-align:center;font-size:10px;color:#999">
      Paid by: ${payment.supervisor_name||""} · ${new Date(payment.created_at||Date.now()).toLocaleDateString()}<br/>
      ${company?.company_name||""}${company?.tagline?` · "${company.tagline}"`:""}
    </div>
  </div>`;
}interface FieldPaymentFormProps { onComplete:()=>void; onCancel:()=>void; prefillWorker?:{name:string;id_number:string;phone:string;payment_type:string}|null; }

export function FieldPaymentForm({ onComplete, onCancel, prefillWorker }: FieldPaymentFormProps) {
  const { projects } = useProjectContext();
  const initialStep = useRef<Step>(prefillWorker?"id_scan":"type_select");
  const [step, setStep] = useState<Step>(initialStep.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [savedPaymentId, setSavedPaymentId] = useState<string|null>(null);
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [supervisorId, setSupervisorId] = useState<string|null>(null);
  const [company, setCompany] = useState<any>(null);
  const [logoBase64, setLogoBase64] = useState<string>("");
  const [idPhotoFile, setIdPhotoFile] = useState<File|null>(null);

  // Worker advance history
  const [workerAdvances, setWorkerAdvances] = useState<any[]>([]);
  const [totalAdvanced, setTotalAdvanced] = useState(0);

  // Project/Milestone/Task
  const [milestones, setMilestones] = useState<any[]>([]);
  const [taskOptions, setTaskOptions] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const [form, setForm] = useState<FormData>({
    payment_type:(prefillWorker?.payment_type as PaymentType)||"payment",
    worker_name:prefillWorker?.name||"", worker_id_number:prefillWorker?.id_number||"", worker_phone:prefillWorker?.phone||"",
    worker_address:"", worker_ref:"",
    project_id:"", milestone_id:"", task_id:"",
    task_name:"", trade_type:"", unit:"",
    rate_type:"task", task_quantity:"", task_unit_rate:"",
    days_worked:"1", rate_per_day:"", hours_worked:"", rate_per_hour:"",
    total_amount:"", advance_amount:"", balance_due:"",
    payment_method:"cash", notes:"",
    signature_data:"", supervisor_name:"",
  });

  function setF(key: keyof FormData) {
    return (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>
      setForm(f=>({...f,[key]:e.target.value}));
  }

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      if(!user)return;
      setSupervisorId(user.id);
      supabase.from("user_profiles").select("company_id,full_name").eq("id",user.id).maybeSingle()
        .then(({data})=>{
          if(data?.company_id){
            setCompanyId(data.company_id);
            supabase.from("company_settings").select("company_name,logo_url,phone,email,address_line1,address_line2,parish,country,tagline,website")
              .eq("company_id",data.company_id).maybeSingle()
              .then(({data:cs})=>{
            setCompany(cs);
            if(cs?.logo_url){
              fetch(cs.logo_url)
                .then(r=>r.blob())
                .then(blob=>{
                  const reader=new FileReader();
                  reader.onloadend=()=>setLogoBase64(reader.result as string);
                  reader.readAsDataURL(blob);
                }).catch(()=>{});
            }
          });
          }
          if(data?.full_name)setForm(f=>({...f,supervisor_name:data.full_name}));
        });
    });
  },[]);

  // Load worker advance history when worker ID confirmed
  async function loadWorkerHistory(workerRef: string) {
    if(!workerRef||!companyId)return;
    const {data}=await supabase.from("field_payments")
      .select("id,total_amount,payment_type,created_at,receipt_number,work_type")
      .eq("company_id",companyId)
      .eq("worker_ref",workerRef)
      .eq("payment_type","advance")
      .order("created_at",{ascending:false});
    const advances=data||[];
    setWorkerAdvances(advances);
    const total=advances.reduce((s:number,a:any)=>s+Number(a.total_amount||0),0);
    setTotalAdvanced(total);
  }

  // Load milestones when project changes
  useEffect(()=>{
    if(!form.project_id){setMilestones([]);setTaskOptions([]);return;}
    const proj=projects.find(p=>p.id===form.project_id);
    setSelectedProject(proj||null);
    supabase.from("project_milestones").select("*").eq("project_id",form.project_id).order("milestone_no")
      .then(({data})=>setMilestones(data||[]));
    setForm(f=>({...f,milestone_id:"",task_id:"",task_name:"",trade_type:"",unit:"",task_unit_rate:"",task_quantity:"",total_amount:""}));
    setSelectedMilestone(null); setSelectedTask(null);
  },[form.project_id]);

  // Load tasks when milestone changes
  useEffect(()=>{
    if(!form.milestone_id){setTaskOptions([]);return;}
    const ms=milestones.find(m=>m.id===form.milestone_id);
    setSelectedMilestone(ms||null);
    supabase.from("project_tasks").select("*").eq("milestone_id",form.milestone_id).order("created_at")
      .then(({data})=>setTaskOptions(data||[]));
    setForm(f=>({...f,task_id:"",task_name:"",trade_type:"",unit:"",task_unit_rate:"",task_quantity:"",total_amount:""}));
    setSelectedTask(null);
  },[form.milestone_id]);

  function selectTask(taskId: string) {
    const task=taskOptions.find(t=>t.id===taskId);
    if(!task)return;
    setSelectedTask(task);
    setForm(f=>({...f,task_id:taskId,task_name:task.task_name||"",trade_type:task.trade_type||"",unit:task.unit||"",task_unit_rate:String(task.rate_per_unit||""),task_quantity:String(task.quantity||"")}));
  }

  // Auto-calculate total
  useEffect(()=>{
    if(form.payment_type==="advance")return; // advance entered manually
    if(form.rate_type==="task"){
      const qty=parseFloat(form.task_quantity)||0;
      const rate=parseFloat(form.task_unit_rate)||0;
      if(qty>0&&rate>0)setForm(f=>({...f,total_amount:(qty*rate).toFixed(2)}));
    } else if(form.rate_type==="day"){
      const days=parseFloat(form.days_worked)||0;
      const rate=parseFloat(form.rate_per_day)||0;
      if(days>0&&rate>0)setForm(f=>({...f,total_amount:(days*rate).toFixed(2)}));
    } else if(form.rate_type==="hour"){
      const hrs=parseFloat(form.hours_worked)||0;
      const rate=parseFloat(form.rate_per_hour)||0;
      if(hrs>0&&rate>0)setForm(f=>({...f,total_amount:(hrs*rate).toFixed(2)}));
    }
  },[form.task_quantity,form.task_unit_rate,form.days_worked,form.rate_per_day,form.hours_worked,form.rate_per_hour,form.rate_type,form.payment_type]);

  function handleIDScanResult(ocr:any, photoFile?: File) {
    const name=[ocr.firstName,ocr.middleName,ocr.lastName].filter(Boolean).join(" ");
    setForm(f=>({...f,worker_name:name||f.worker_name,worker_id_number:ocr.idNumber||ocr.documentNumber||f.worker_id_number,worker_address:ocr.address||f.worker_address}));
    if(photoFile) setIdPhotoFile(photoFile);
  }

  async function savePayment() {
    setSaving(true); setError(null);
    try {
      let idPhotoUrl="";
      if(idPhotoFile&&companyId){
        const path=`field-payments/ids/${companyId}/${Date.now()}_${form.worker_id_number||"id"}.jpg`;
        const {error:ue}=await supabase.storage.from("project-files").upload(path,idPhotoFile,{upsert:true});
        if(!ue){const {data:ud}=supabase.storage.from("project-files").getPublicUrl(path);idPhotoUrl=ud.publicUrl;}
      }

      const recNum=`FP-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}-${Date.now().toString().slice(-6)}`;
      setReceiptNumber(recNum);

      const workerRef=`${form.worker_name.trim().toLowerCase().replace(/\s+/g,"_")}_${form.worker_id_number.trim()}`;

      const workLabel=form.payment_type==="advance"
        ?`Advance Payment`
        :form.rate_type==="task"&&form.task_name
          ?`${form.task_name}${form.task_quantity?` (${form.task_quantity} ${form.unit||"units"})`:""}` 
          :form.rate_type==="day"?`${form.days_worked} days work`
          :`${form.hours_worked} hours work`;

      const amount=form.payment_type==="advance"
        ?parseFloat(form.advance_amount)||0
        :parseFloat(form.total_amount)||0;

      const {data:payment,error:pe}=await supabase.from("field_payments").insert({
        company_id:companyId,
        project_id:form.project_id||null,
        worker_name:form.worker_name.trim(),
        worker_id_number:form.worker_id_number.trim()||null,
        worker_phone:form.worker_phone.trim()||null,
        worker_address:form.worker_address.trim()||null,
        id_photo_url:idPhotoUrl||null,
        work_type:workLabel,
        work_date:new Date().toISOString().split("T")[0],
        hours_worked:parseFloat(form.hours_worked)||null,
        days_worked:parseFloat(form.days_worked)||null,
        rate_per_hour:parseFloat(form.rate_per_hour)||null,
        rate_per_day:parseFloat(form.rate_per_day)||null,
        total_amount:amount,
        payment_method:form.payment_method,
        notes:form.notes.trim()||null,
        status:"signed",
        supervisor_id:supervisorId,
        supervisor_name:form.supervisor_name.trim()||null,
        synced_to_finance:false,
        receipt_number:recNum,
        payment_type:form.payment_type,
        advance_amount:form.payment_type==="advance"?amount:0,
        balance_due:form.payment_type==="advance"?amount:0,
        worker_ref:workerRef,
        signature_url:form.signature_data||null,
      }).select().maybeSingle();
      if(pe)throw pe;
      if(!payment)throw new Error("Failed to save payment");
      setSavedPaymentId(payment.id);

      // Save signature record
      if(form.signature_data){
        await supabase.from("field_payment_signatures").insert({
          field_payment_id:payment.id,company_id:companyId,
          signature_type:"worker",signature_data:form.signature_data,
          signed_at:new Date().toISOString(),signed_by:form.worker_name,
        });
      }

      // Save receipt record with all text data
      await supabase.from("field_payment_receipts").insert({
        field_payment_id:payment.id,
        company_id:companyId,
        receipt_type:form.payment_type,
        receipt_number:recNum,
      });

      // Update task progress if task payment
      if(form.task_id&&form.task_quantity&&form.payment_type!=="advance"){
        const {data:task}=await supabase.from("project_tasks")
          .select("actual_quantity_completed,quantity").eq("id",form.task_id).maybeSingle();
        if(task){
          const newActual=(Number(task.actual_quantity_completed)||0)+parseFloat(form.task_quantity);
          const pct=task.quantity?Math.min(100,Math.round((newActual/Number(task.quantity))*100)):0;
          await supabase.from("project_tasks").update({
            actual_quantity_completed:newActual,percent_complete:pct,
            status:pct>=100?"complete":"active",
          }).eq("id",form.task_id);
        }
      }

      // Log expense
      await supabase.from("expenses").insert({
        company_id:companyId,project_id:form.project_id||null,
        description:`${form.payment_type==="advance"?"Advance":"Field Payment"} — ${form.worker_name} (${workLabel})`,
        amount:amount,expense_date:new Date().toISOString().split("T")[0],status:"approved",
      });

      setStep("done");
    } catch(e:any){setError(e.message);}
    finally{setSaving(false);}
  }

  // Generate and print receipt from stored data
  function generateAndPrint() {
    const paymentData={
      receipt_number:receiptNumber,
      worker_name:form.worker_name,
      worker_id_number:form.worker_id_number,
      worker_phone:form.worker_phone,
      trade_type:form.trade_type,
      work_date:new Date().toISOString(),
      work_type:form.payment_type==="advance"?"Advance Payment":form.task_name||"Work Payment",
      payment_method:form.payment_method,
      total_amount:form.payment_type==="advance"?parseFloat(form.advance_amount)||0:parseFloat(form.total_amount)||0,
      payment_type:form.payment_type,
      previous_advances:form.payment_type==="final"?totalAdvanced:0,
      notes:form.notes,
      signature_data:form.signature_data,
      supervisor_name:form.supervisor_name,
      project_name:selectedProject?.name,
      milestone_name:selectedMilestone?.milestone_name,
      task_name:form.task_name,
      created_at:new Date().toISOString(),
    };
    const html=generateReceiptHTML(paymentData,company);
    const w=window.open("","_blank");
    if(!w)return;
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${receiptNumber}</title>
    <style>*{box-sizing:border-box}body{margin:0;background:white}@media print{body{margin:0}}</style>
    </head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  // WhatsApp — text summary (receipt shown in print)
  function sendWhatsApp() {
    const amount=form.payment_type==="advance"?parseFloat(form.advance_amount)||0:parseFloat(form.total_amount)||0;
    const msg=`*${company?.company_name||""}*\n*${form.payment_type==="advance"?"⚡ ADVANCE PAYMENT":form.payment_type==="final"?"✅ FINAL PAYMENT":"💰 PAYMENT RECEIPT"}*\n\nReceipt #: ${receiptNumber}\nWorker: ${form.worker_name}\nID: ${form.worker_id_number||"—"}\n${selectedProject?`Project: ${selectedProject.name}\n`:""}${selectedMilestone?`Milestone: ${selectedMilestone.milestone_name}\n`:""}${form.task_name?`Task: ${form.task_name}\n`:""}Payment: ${form.payment_method.replace("_"," ")}\n\n*AMOUNT: ${fmtJMD(amount)}*\n${form.payment_type==="advance"?"⚡ This is an advance. Balance due on completion.":form.payment_type==="final"?"✅ PAID IN FULL. All advances settled.":""}\n\nPaid by: ${form.supervisor_name} · ${new Date().toLocaleDateString()}`;
    const phone=form.worker_phone?.replace(/\D/g,"");
    window.open(`https://wa.me/${phone?`1${phone}`:""}?text=${encodeURIComponent(msg)}`,"_blank");
  }

  function sendEmail() {
    const amount=form.payment_type==="advance"?parseFloat(form.advance_amount)||0:parseFloat(form.total_amount)||0;
    const subject=encodeURIComponent(`Payment Receipt - ${form.worker_name} - ${receiptNumber}`);
    const body=encodeURIComponent(
      `${company?.company_name||""}\n\n`+
      `${form.payment_type==="advance"?"ADVANCE PAYMENT":form.payment_type==="final"?"FINAL PAYMENT — PAID IN FULL":"PAYMENT RECEIPT"}\n`+
      `Receipt #: ${receiptNumber}\nDate: ${new Date().toLocaleDateString()}\n\n`+
      `Worker: ${form.worker_name}\nID: ${form.worker_id_number||"—"}\n`+
      `${selectedProject?`Project: ${selectedProject.name}\n`:""}`+
      `${selectedMilestone?`Milestone: ${selectedMilestone.milestone_name}\n`:""}`+
      `${form.task_name?`Task: ${form.task_name}\n`:""}`+
      `Payment: ${form.payment_method.replace("_"," ")}\n\n`+
      `AMOUNT: ${fmtJMD(amount)}\n\n`+
      `${form.payment_type==="advance"?"This is an advance payment. Balance due on completion.":""}`+
      `${form.payment_type==="final"?"PAID IN FULL. All advances settled. Thank you!":""}`+
      `\n\nPaid by: ${form.supervisor_name} · ${new Date().toLocaleDateString()}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`,"_blank");
  }

  const totalAmount=parseFloat(form.total_amount)||0;
  const advanceAmount=parseFloat(form.advance_amount)||0;return(
    <div className="min-h-full bg-slate-50 dark:bg-[#080b10]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0c1018]">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">New Field Payment</div>
          <div className="text-[10px] text-slate-800 dark:text-slate-600">
            {step==="type_select"&&"Select payment type"}
            {step==="id_scan"&&"Scan or enter worker ID"}
            {step==="project_task"&&"Select project & task"}
            {step==="payment"&&"Enter payment details"}
            {step==="signature"&&"Worker signature"}
            {step==="done"&&"Payment complete"}
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><X size={16}/></button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {step!=="done"&&<StepBar step={step} paymentType={form.payment_type}/>}

        {error&&<div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-300"><AlertCircle size={13}/>{error}<button onClick={()=>setError(null)} className="ml-auto"><X size={11}/></button></div>}

        {/* ── STEP 1: PAYMENT TYPE ── */}
        {step==="type_select"&&(
          <div className="space-y-3">
            <div className="text-xs text-slate-800 dark:text-slate-500 text-center mb-4">What type of payment is this?</div>
            {[
              {type:"advance" as PaymentType, label:"Advance Payment", desc:"Give worker money before work is done", icon:<TrendingUp size={20}/>, color:"text-amber-400", bg:"bg-amber-500/10", border:"border-amber-500/30", grad:"from-amber-500/20 to-amber-600/10"},
              {type:"payment" as PaymentType, label:"Work Payment",    desc:"Pay for work completed today",          icon:<DollarSign size={20}/>, color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/30", grad:"from-emerald-500/20 to-emerald-600/10"},
              {type:"final" as PaymentType,   label:"Final Payment",   desc:"Settle all advances and complete job",  icon:<CheckCircle2 size={20}/>, color:"text-cyan-400", bg:"bg-cyan-500/10", border:"border-cyan-500/30", grad:"from-cyan-500/20 to-cyan-600/10"},
            ].map(t=>(
              <button key={t.type} onClick={()=>{setForm(f=>({...f,payment_type:t.type}));setStep("id_scan");}}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border ${t.border} bg-gradient-to-r ${t.grad} hover:opacity-90 transition text-left`}>
                <div className={`w-12 h-12 rounded-xl ${t.bg} border ${t.border} flex items-center justify-center flex-shrink-0 ${t.color}`}>
                  {t.icon}
                </div>
                <div>
                  <div className={`text-sm font-bold ${t.color}`}>{t.label}</div>
                  <div className="text-[11px] text-slate-800 dark:text-slate-500 mt-0.5">{t.desc}</div>
                </div>
                <ChevronRight size={16} className="ml-auto text-slate-800 dark:text-slate-600"/>
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 2: ID SCAN ── */}
        {step==="id_scan"&&(
          <div className="space-y-4">
            {/* Payment type badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border ${form.payment_type==="advance"?"bg-amber-500/10 border-amber-500/30 text-amber-400":form.payment_type==="final"?"bg-cyan-500/10 border-cyan-500/30 text-cyan-400":"bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
              {form.payment_type==="advance"?"⚡ Advance Payment":form.payment_type==="final"?"✅ Final Payment":"💰 Work Payment"}
              <button onClick={()=>setStep("type_select")} className="text-slate-800 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-400 ml-1">change</button>
            </div>

            <SimpleIDScanner onResult={handleIDScanResult} onCancel={()=>{}}/>

            <div className="border-t border-slate-200 dark:border-white/[0.06] pt-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600">
                Worker Details {form.worker_name&&<span className="text-emerald-400 ml-2">✓ Auto-filled</span>}
              </div>
              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Full Name *</label>
                <input value={form.worker_name} onChange={setF("worker_name")} placeholder="Worker full name"
                  className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">ID Number</label>
                  <input value={form.worker_id_number} onChange={setF("worker_id_number")} placeholder="National ID #"
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Phone</label>
                  <input value={form.worker_phone} onChange={setF("worker_phone")} placeholder="876-xxx-xxxx"
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
              </div>
              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Address</label>
                <input value={form.worker_address} onChange={setF("worker_address")} placeholder="Worker address"
                  className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
            </div>

            <button onClick={async()=>{
              if(!form.worker_name.trim()){alert("Enter worker name.");return;}
              const ref=`${form.worker_name.trim().toLowerCase().replace(/\s+/g,"_")}_${form.worker_id_number.trim()}`;
              setForm(f=>({...f,worker_ref:ref}));
              await loadWorkerHistory(ref);
              setStep("project_task");
            }}
              disabled={!form.worker_name.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold">
              Continue <ChevronRight size={16}/>
            </button>
          </div>
        )}

        {/* ── STEP 3: PROJECT / MILESTONE / TASK ── */}
        {step==="project_task"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3">
              <div className="w-9 h-9 rounded-full bg-cyan-500/20 flex items-center justify-center text-sm font-bold text-cyan-300 flex-shrink-0">
                {form.worker_name.split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">{form.worker_name}</div>
                {form.worker_id_number&&<div className="text-[10px] text-slate-800 dark:text-slate-600">ID: {form.worker_id_number}</div>}
              </div>
              <button onClick={()=>setStep("id_scan")} className="ml-auto text-[10px] text-cyan-500">Edit</button>
            </div>

            {/* Show advance history if exists */}
            {totalAdvanced>0&&(
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Worker Advance History</div>
                <div className="text-sm font-bold text-amber-400">Total Advanced: {fmtJMD(totalAdvanced)}</div>
                <div className="text-[10px] text-slate-800 dark:text-slate-600 mt-1">{workerAdvances.length} advance{workerAdvances.length!==1?"s":""} on record</div>
                {workerAdvances.slice(0,3).map((a:any,i:number)=>(
                  <div key={i} className="text-[10px] text-slate-800 dark:text-slate-600 mt-0.5">· {new Date(a.created_at).toLocaleDateString()} — {fmtJMD(a.total_amount)}</div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Project (optional)</label>
                <select value={form.project_id} onChange={setF("project_id")}
                  className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                  <option value="">— No project —</option>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>

              {form.project_id&&milestones.length>0&&(
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Milestone</label>
                  <select value={form.milestone_id} onChange={setF("milestone_id")}
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                    <option value="">— Select milestone —</option>
                    {milestones.map(m=><option key={m.id} value={m.id}>{m.milestone_name}</option>)}
                  </select></div>
              )}

              {form.milestone_id&&taskOptions.length>0&&(
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Task</label>
                  <select value={form.task_id} onChange={e=>selectTask(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                    <option value="">— Select task —</option>
                    {taskOptions.map(t=><option key={t.id} value={t.id}>{t.task_name}{t.quantity?` (${t.quantity} ${t.unit||"units"} @ JMD ${t.rate_per_unit||0})`:""}</option>)}
                  </select></div>
              )}

              {selectedTask&&(
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 mb-1">Task Auto-filled</div>
                  <div className="flex flex-wrap gap-3 text-[11px]">
                    {selectedTask.trade_type&&<span className="text-slate-800 dark:text-slate-400">🔨 {selectedTask.trade_type}</span>}
                    {selectedTask.quantity&&<span className="text-slate-800 dark:text-slate-400">📦 {selectedTask.quantity} {selectedTask.unit||""} total</span>}
                    {selectedTask.rate_per_unit&&<span className="text-slate-800 dark:text-slate-400">💰 {fmtJMD(selectedTask.rate_per_unit)}/{selectedTask.unit||"unit"}</span>}
                    {selectedTask.actual_quantity_completed>0&&<span className="text-amber-400">✓ {selectedTask.actual_quantity_completed} done so far</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={()=>setStep("id_scan")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-slate-400"><ChevronLeft size={15}/> Back</button>
              <button onClick={()=>setStep("payment")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm text-white font-semibold">
                Continue <ChevronRight size={15}/>
              </button>
            </div>
          </div>
        )}{/* ── STEP 4: PAYMENT DETAILS ── */}
        {step==="payment"&&(
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{form.worker_name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${form.payment_type==="advance"?"text-amber-400 bg-amber-500/10 border-amber-500/20":form.payment_type==="final"?"text-cyan-400 bg-cyan-500/10 border-cyan-500/20":"text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                  {form.payment_type==="advance"?"⚡ Advance":form.payment_type==="final"?"✅ Final":"💰 Payment"}
                </span>
              </div>
              {selectedProject&&<div className="text-[10px] text-slate-800 dark:text-slate-600">📁 {selectedProject.name}</div>}
              {selectedMilestone&&<div className="text-[10px] text-slate-800 dark:text-slate-600">🚩 {selectedMilestone.milestone_name}</div>}
              {form.task_name&&<div className="text-[10px] text-slate-800 dark:text-slate-600">✅ {form.task_name}</div>}
              {totalAdvanced>0&&<div className="text-[10px] text-amber-500">⚡ Previous advances: {fmtJMD(totalAdvanced)}</div>}
            </div>

            <div className="space-y-3">
              {/* ADVANCE — just enter amount */}
              {form.payment_type==="advance"&&(
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Advance Amount</div>
                  <input type="number" value={form.advance_amount} onChange={setF("advance_amount")} placeholder="0.00"
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-3 text-2xl font-bold text-amber-400 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-amber-500/50"/>
                  <div className="text-[11px] text-slate-800 dark:text-slate-600 text-center">This advance will be deducted from final payment</div>
                  {totalAdvanced>0&&(
                    <div className="text-[11px] text-amber-500 text-center">Running total after this: {fmtJMD(totalAdvanced+(parseFloat(form.advance_amount)||0))}</div>
                  )}
                </div>
              )}

              {/* WORK PAYMENT / FINAL — enter work details */}
              {(form.payment_type==="payment"||form.payment_type==="final")&&(
                <>
                  <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-2">Payment Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[{v:"task",l:"By Task"},{v:"day",l:"By Day"},{v:"hour",l:"By Hour"}].map(t=>(
                        <button key={t.v} onClick={()=>setForm(f=>({...f,rate_type:t.v,total_amount:""}))}
                          className={cn("py-2.5 rounded-lg text-xs font-bold border transition",form.rate_type===t.v?"bg-cyan-500/20 border-cyan-500/40 text-cyan-300":"bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.07] text-slate-800 dark:text-slate-500")}>
                          {t.l}</button>
                      ))}</div></div>

                  {form.rate_type==="task"&&(
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3 space-y-3">
                      <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Task / Work Done</label>
                        <input value={form.task_name} onChange={setF("task_name")} placeholder="e.g. Lay blocks, Paint walls..."
                          className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Quantity Done</label>
                          <input type="number" value={form.task_quantity} onChange={setF("task_quantity")} placeholder="e.g. 60"
                            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500/50"/></div>
                        <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Rate/Unit (JMD)</label>
                          <input type="number" value={form.task_unit_rate} onChange={setF("task_unit_rate")} placeholder="e.g. 18"
                            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500/50"/></div>
                      </div>
                      {form.task_quantity&&form.task_unit_rate&&(
                        <div className="text-xs text-slate-800 dark:text-slate-500 text-center">
                          {form.task_quantity} {form.unit||"units"} × {fmtJMD(parseFloat(form.task_unit_rate)||0)} = <span className="text-emerald-400 font-bold">{fmtJMD(totalAmount)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {form.rate_type==="day"&&(
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Days Worked</label>
                          <input type="number" value={form.days_worked} onChange={setF("days_worked")} placeholder="1"
                            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500/50"/></div>
                        <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Rate/Day (JMD)</label>
                          <input type="number" value={form.rate_per_day} onChange={setF("rate_per_day")} placeholder="0.00"
                            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500/50"/></div>
                      </div>
                      {form.days_worked&&form.rate_per_day&&<div className="text-xs text-slate-800 dark:text-slate-500 text-center">{form.days_worked} days × {fmtJMD(parseFloat(form.rate_per_day)||0)} = <span className="text-emerald-400 font-bold">{fmtJMD(totalAmount)}</span></div>}
                    </div>
                  )}

                  {form.rate_type==="hour"&&(
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Hours Worked</label>
                          <input type="number" value={form.hours_worked} onChange={setF("hours_worked")} placeholder="0"
                            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500/50"/></div>
                        <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Rate/Hour (JMD)</label>
                          <input type="number" value={form.rate_per_hour} onChange={setF("rate_per_hour")} placeholder="0.00"
                            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500/50"/></div>
                      </div>
                      {form.hours_worked&&form.rate_per_hour&&<div className="text-xs text-slate-800 dark:text-slate-500 text-center">{form.hours_worked} hrs × {fmtJMD(parseFloat(form.rate_per_hour)||0)} = <span className="text-emerald-400 font-bold">{fmtJMD(totalAmount)}</span></div>}
                    </div>
                  )}

                  <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Total Amount (JMD) *</label>
                    <input type="number" value={form.total_amount} onChange={setF("total_amount")} placeholder="0.00"
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-3 text-xl font-bold text-emerald-400 placeholder-slate-400 dark:placeholder-slate-700 outline-none"/></div>

                  {/* Final payment — show advance deduction */}
                  {form.payment_type==="final"&&totalAdvanced>0&&totalAmount>0&&(
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600">Final Settlement</div>
                      <div className="flex justify-between text-sm"><span className="text-slate-800 dark:text-slate-400">Total Earned</span><span className="text-slate-900 dark:text-slate-200 font-bold">{fmtJMD(totalAmount)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-800 dark:text-slate-400">Less Advances</span><span className="text-amber-400 font-bold">- {fmtJMD(totalAdvanced)}</span></div>
                      <div className="border-t border-slate-200 dark:border-white/[0.08] pt-1.5 flex justify-between text-sm font-bold"><span className="text-slate-900 dark:text-slate-200">Balance to Pay</span><span className="text-emerald-600 dark:text-emerald-400">{fmtJMD(Math.max(0,totalAmount-totalAdvanced))}</span></div>
                    </div>
                  )}
                </>
              )}

              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(m=>(
                    <button key={m.value} onClick={()=>setForm(f=>({...f,payment_method:m.value}))}
                      className={cn("py-2 rounded-lg text-[11px] font-semibold border transition",form.payment_method===m.value?"bg-cyan-500/20 border-cyan-500/40 text-cyan-300":"bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.07] text-slate-800 dark:text-slate-500")}>
                      {m.label}</button>
                  ))}</div></div>

              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={setF("notes") as any} rows={2} placeholder="Additional notes..."
                  className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none resize-none"/></div>
            </div>

            <div className="flex gap-3">
              <button onClick={()=>setStep("project_task")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-slate-400"><ChevronLeft size={15}/> Back</button>
              <button onClick={()=>setStep("signature")}
                disabled={form.payment_type==="advance"?!form.advance_amount:!form.total_amount}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold">
                Get Signature <ChevronRight size={15}/>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: SIGNATURE ── */}
        {step==="signature"&&(
          <div className="space-y-4">
            <div className={`rounded-xl border p-4 ${form.payment_type==="advance"?"border-amber-500/20 bg-amber-500/[0.06]":form.payment_type==="final"?"border-cyan-500/20 bg-cyan-500/[0.06]":"border-emerald-500/20 bg-emerald-500/[0.06]"}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-200">{form.worker_name}</div>
                  {selectedProject&&<div className="text-[10px] text-slate-800 dark:text-slate-500">📁 {selectedProject.name}</div>}
                  {selectedMilestone&&<div className="text-[10px] text-slate-800 dark:text-slate-500">🚩 {selectedMilestone.milestone_name}</div>}
                  {form.task_name&&<div className="text-[10px] text-slate-800 dark:text-slate-500">✅ {form.task_name}</div>}
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${form.payment_type==="advance"?"text-amber-400":form.payment_type==="final"?"text-cyan-400":"text-emerald-400"}`}>
                    {fmtJMD(form.payment_type==="advance"?advanceAmount:totalAmount)}
                  </div>
                  <div className={`text-[10px] font-bold ${form.payment_type==="advance"?"text-amber-600":form.payment_type==="final"?"text-cyan-600":"text-emerald-600"}`}>
                    {form.payment_type==="advance"?"⚡ Advance":form.payment_type==="final"?"✅ Final Payment":"💰 Payment"}
                  </div>
                </div>
              </div>
              {form.payment_type==="final"&&totalAdvanced>0&&(
                <div className="text-[11px] text-slate-800 dark:text-slate-500 mt-1">Previous advances: {fmtJMD(totalAdvanced)} will be settled</div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-300 mb-2 flex items-center gap-2"><PenTool size={13} className="text-cyan-400"/>Worker Signature</div>
              <div className="text-[10px] text-slate-800 dark:text-slate-600 mb-3">
                {form.payment_type==="advance"
                  ?"I acknowledge receiving this advance payment. Balance to be settled on completion."
                  :form.payment_type==="final"
                  ?"I acknowledge receiving final payment. All advances settled. Work is complete."
                  :"I acknowledge receiving payment for work performed."}
              </div>
              <SignaturePad onSign={data=>setForm(f=>({...f,signature_data:data}))} onClear={()=>setForm(f=>({...f,signature_data:""}))}/>
            </div>

            <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-800 dark:text-slate-600 block mb-1">Supervisor / Paid By</label>
              <input value={form.supervisor_name} onChange={setF("supervisor_name")} placeholder="Your name"
                className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none"/></div>

            <div className="flex gap-3">
              <button onClick={()=>setStep("payment")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-slate-400"><ChevronLeft size={15}/> Back</button>
              <button onClick={savePayment} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm text-white font-semibold">
                {saving?<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving...</>:<><Check size={15}/>Confirm & Save</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 6: DONE ── */}
        {step==="done"&&(
          <div className="space-y-4">
            <div className={`flex items-center gap-3 rounded-xl border p-5 ${form.payment_type==="advance"?"border-amber-500/30 bg-amber-500/[0.08]":form.payment_type==="final"?"border-cyan-500/30 bg-cyan-500/[0.08]":"border-emerald-500/30 bg-emerald-500/[0.08]"}`}>
              <CheckCircle2 size={28} className={form.payment_type==="advance"?"text-amber-400":form.payment_type==="final"?"text-cyan-400":"text-emerald-400"}/>
              <div>
                <div className={`text-base font-bold ${form.payment_type==="advance"?"text-amber-300":form.payment_type==="final"?"text-cyan-300":"text-emerald-300"}`}>
                  {form.payment_type==="advance"?"⚡ Advance Recorded!":form.payment_type==="final"?"✅ Final Payment Complete!":"💰 Payment Recorded!"}
                </div>
                <div className="text-[11px] text-slate-800 dark:text-slate-500 mt-0.5">Receipt #{receiptNumber}</div>
                <div className="text-[11px] text-slate-800 dark:text-slate-500">Saved · Generate receipt anytime from payment list</div>
              </div>
            </div>

            {/* Payment summary */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-800 dark:text-slate-500">Worker</span>
                <span className="text-slate-900 dark:text-slate-200 font-semibold">{form.worker_name}</span>
              </div>
              {selectedProject&&<div className="flex justify-between text-sm"><span className="text-slate-800 dark:text-slate-500">Project</span><span className="text-slate-900 dark:text-slate-200 font-semibold">{selectedProject.name}</span></div>}
              {selectedMilestone&&<div className="flex justify-between text-sm"><span className="text-slate-800 dark:text-slate-500">Milestone</span><span className="text-slate-900 dark:text-slate-200 font-semibold">{selectedMilestone.milestone_name}</span></div>}
              {form.task_name&&<div className="flex justify-between text-sm"><span className="text-slate-800 dark:text-slate-500">Task</span><span className="text-slate-900 dark:text-slate-200 font-semibold">{form.task_name}</span></div>}
              <div className="border-t border-slate-200 dark:border-white/[0.06] pt-2 flex justify-between">
                <span className="text-slate-800 dark:text-slate-500 font-semibold">Amount Paid</span>
                <span className={`text-xl font-bold ${form.payment_type==="advance"?"text-amber-400":form.payment_type==="final"?"text-cyan-400":"text-emerald-400"}`}>
                  {fmtJMD(form.payment_type==="advance"?advanceAmount:totalAmount)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button onClick={generateAndPrint}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-white/[0.1] hover:border-slate-300 dark:hover:border-white/[0.2] bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-800 dark:text-slate-300 font-semibold transition text-sm">
                <FileText size={15}/> Generate & Print Receipt
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={sendWhatsApp}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition text-sm font-semibold">
                  <span>📱</span> WhatsApp
                </button>
                <button onClick={sendEmail}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition text-sm font-semibold">
                  <span>📧</span> Email
                </button>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-700 text-center">Receipt saved — generate again anytime from the payment list</div>
            </div>

            <button onClick={onComplete}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm text-white font-semibold">
              <Check size={15}/> Done — Back to Payments
            </button>
          </div>
        )}
      </div>
    </div>
  );
}