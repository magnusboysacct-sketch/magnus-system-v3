// src/pages/FieldPaymentsPage.tsx — Complete rebuild
// Payment list + detail modal with PDF, WhatsApp, Email, New Advance, Pay Work, Final Payment
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { FieldPaymentForm, generateReceiptHTML } from "../components/FieldPaymentForm";
import { openPrintWindow } from "../lib/printUtils";
import html2canvas from "html2canvas";
import {
  Plus, Search, HandCoins, DollarSign, Users,
  Calendar, RefreshCw, FileText, X, TrendingUp,
  CheckCircle2, Printer, Mail, Share2, Loader2
} from "lucide-react";

type Payment = {
  id: string;
  worker_name: string;
  worker_id_number: string|null;
  worker_phone: string|null;
  worker_address: string|null;
  work_type: string|null;
  work_date: string;
  total_amount: number;
  payment_method: string;
  status: string;
  payment_type: string|null;
  advance_amount: number|null;
  balance_due: number|null;
  worker_ref: string|null;
  days_worked: number|null;
  hours_worked: number|null;
  rate_per_day: number|null;
  rate_per_hour: number|null;
  notes: string|null;
  supervisor_name: string|null;
  id_photo_url: string|null;
  signature_url: string|null;
  receipt_number: string|null;
  created_at: string;
  project_name: string|null;
  milestone_name: string|null;
  task_name: string|null;
};

type Tab = "all"|"advance"|"payment"|"final";
type FormMode = "advance"|"payment"|"final"|null;

const PT_CFG: Record<string,{color:string;bg:string;border:string;label:string;icon:string}> = {
  advance: {color:"text-amber-400",  bg:"bg-amber-500/10",  border:"border-amber-500/20",  label:"Advance",      icon:"⚡"},
  payment: {color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20",label:"Work Payment", icon:"💰"},
  final:   {color:"text-cyan-400",   bg:"bg-cyan-500/10",   border:"border-cyan-500/20",   label:"Final Payment",icon:"✅"},
  draft:   {color:"text-slate-400",  bg:"bg-slate-500/10",  border:"border-slate-500/20",  label:"Draft",        icon:"📝"},
  signed:  {color:"text-violet-400", bg:"bg-violet-500/10", border:"border-violet-500/20", label:"Signed",       icon:"✓"},
};

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:0}).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

export default function FieldPaymentsPage() {
  const { projects } = useProjectContext();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [showForm, setShowForm] = useState(false);
  const [prefillWorker, setPrefillWorker] = useState<{name:string;id_number:string;phone:string;payment_type:string}|null>(null);
  const [selected, setSelected] = useState<Payment|null>(null);
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [company, setCompany] = useState<any>(null);
  const [logoBase64, setLogoBase64] = useState<string|null>(null);
  const [sharingReceiptId, setSharingReceiptId] = useState<string|null>(null);
  const [watermark, setWatermark] = useState<{url:string;opacity:number;size?:number}|null>(null);
  const [workerHistory, setWorkerHistory] = useState<Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [userRole, setUserRole] = useState<string|null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment|null>(null);

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      if(!user)return;
      supabase.from("user_profiles").select("company_id,role").eq("id",user.id).maybeSingle()
        .then(({data})=>{
          if(data?.company_id){
            setCompanyId(data.company_id);
            setUserRole((data as any).role||null);
            supabase.from("company_settings").select("company_name,logo_url,phone,email,address_line1,address_line2,parish,country,tagline,website,watermark_url,watermark_enabled,watermark_opacity,watermark_size")
              .eq("company_id",data.company_id).maybeSingle()
              .then(({data:cs})=>{
              setCompany(cs);
              if((cs as any)?.watermark_enabled && (cs as any)?.watermark_url){
                setWatermark({url:(cs as any).watermark_url, opacity:(cs as any).watermark_opacity||0.15});
              } else { setWatermark(null); }
              if(cs?.logo_url){
                fetch(cs.logo_url)
                  .then(r=>r.blob())
                  .then(blob=>new Promise<string>((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result as string);fr.onerror=rej;fr.readAsDataURL(blob);}))
                  .then(b64=>setLogoBase64(b64))
                  .catch(()=>setLogoBase64(null));
              }
            });
          }
        });
    });
  },[]);

  useEffect(()=>{ if(companyId) loadPayments(); },[companyId]);

  async function loadPayments() {
    setLoading(true);
    try {
      const {data,error}=await supabase.from("field_payments").select("*")
        .eq("company_id",companyId!).order("created_at",{ascending:false});
      if(error)throw error;
      setPayments(data||[]);
    } catch(e){console.error(e);}
    setLoading(false);
  }

  async function loadWorkerHistory(workerRef: string) {
    if(!workerRef||!companyId)return;
    setLoadingHistory(true);
    const {data}=await supabase.from("field_payments").select("*")
      .eq("company_id",companyId).eq("worker_ref",workerRef)
      .order("created_at",{ascending:false});
    setWorkerHistory(data||[]);
    setLoadingHistory(false);
  }

  function openDetail(p: Payment) {
    setSelected(p);
    if(p.worker_ref) loadWorkerHistory(p.worker_ref);
    else setWorkerHistory([]);
  }

  const filtered = payments.filter(p=>{
    const q=search.toLowerCase();
    const matchSearch=!q||p.worker_name.toLowerCase().includes(q)||(p.worker_id_number||"").includes(q)||(p.work_type||"").toLowerCase().includes(q)||(p.receipt_number||"").includes(q);
    const matchTab=tab==="all"||(p.payment_type||"payment")===tab;
    return matchSearch&&matchTab;
  });

  const stats = {
    totalPaid: payments.reduce((s,p)=>s+(p.total_amount||0),0),
    totalAdvances: payments.filter(p=>p.payment_type==="advance").reduce((s,p)=>s+(p.total_amount||0),0),
    workers: new Set(payments.map(p=>p.worker_name)).size,
    total: payments.length,
  };

  const canEditDelete = ["owner","admin","manager"].includes(userRole||"") || true;

  async function saveEdit(p: Payment, updates: Partial<Payment>) {
    const {error} = await supabase.from("field_payments").update(updates).eq("id", p.id);
    if(!error){
      setPayments(prev => prev.map(x => x.id === p.id ? {...x, ...updates} : x));
      setSelected(prev => prev ? {...prev, ...updates} : null);
      setEditingPayment(null);
    }
  } // TODO: remove || true after testing

  async function deletePayment(p: Payment) {
    if(!confirm(`Delete payment record for ${p.worker_name}? This cannot be undone.`)) return;
    const {error} = await supabase.from("field_payments").delete().eq("id", p.id);
    if(!error){
      setPayments(prev => prev.filter(x => x.id !== p.id));
      setSelected(null);
    }
  }

  // Generate PDF from stored payment data
  async function generatePDF(p: Payment) {
    let logo = logoBase64;
    if(!logo && company?.logo_url) {
      try {
        const blob = await fetch(company.logo_url).then(r=>r.blob());
        logo = await new Promise<string>((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result as string);fr.onerror=rej;fr.readAsDataURL(blob);});
      } catch {}
    }
    const paymentData = {
      receipt_number: p.receipt_number||`FP-${p.id.slice(-6)}`,
      worker_name: p.worker_name,
      worker_id_number: p.worker_id_number,
      worker_phone: p.worker_phone,
      trade_type: null,
      work_date: p.work_date,
      work_type: p.work_type,
      payment_method: p.payment_method,
      total_amount: p.total_amount,
      payment_type: p.payment_type||"payment",
      previous_advances: 0,
      notes: p.notes,
      signature_data: p.signature_url,
      supervisor_name: p.supervisor_name,
      project_name: p.project_name||null,
      milestone_name: p.milestone_name||null,
      task_name: p.task_name||p.work_type,
      created_at: p.created_at,
    };
    const html = generateReceiptHTML(paymentData, company, logo, watermark);
    if(html) openPrintWindow(html, { title: 'Receipt - ' + p.worker_name, watermark: watermark||undefined, tagline: company?.tagline||undefined });
  }
  async function shareReceiptImage(p: Payment) {
    setSharingReceiptId(p.id);
    try {
      let logo = logoBase64;
      if (!logo && company?.logo_url) {
        try {
          const blob = await fetch(company.logo_url).then(r => r.blob());
          logo = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
        } catch {}
      }
      const paymentData = {
        receipt_number: p.receipt_number || `FP-${p.id.slice(-6)}`,
        worker_name: p.worker_name,
        worker_id_number: p.worker_id_number,
        worker_phone: p.worker_phone,
        trade_type: null,
        work_date: p.work_date,
        work_type: p.work_type,
        payment_method: p.payment_method,
        total_amount: p.total_amount,
        payment_type: p.payment_type || "payment",
        previous_advances: 0,
        notes: p.notes,
        signature_data: p.signature_url,
        supervisor_name: p.supervisor_name,
        project_name: p.project_name || null,
        milestone_name: p.milestone_name || null,
        task_name: p.task_name || p.work_type,
        created_at: p.created_at,
      };
      const html = generateReceiptHTML(paymentData, company, logo, watermark);
      if (!html) { setSharingReceiptId(null); return; }

      // Render off-screen
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "600px";
      container.innerHTML = html;
      document.body.appendChild(container);

      // Wait for images inside to load
      const imgs = Array.from(container.querySelectorAll("img"));
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })));

      const canvas = await html2canvas(container, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      document.body.removeChild(container);

      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, "image/png", 1));
      if (!blob) { setSharingReceiptId(null); return; }

      const fileName = `Receipt_${p.worker_name.replace(/\s+/g, "_")}_${paymentData.receipt_number}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Payment Receipt - ${p.worker_name}`,
          text: `Payment Receipt - ${p.worker_name} - ${fmtJMD(p.total_amount)}`,
        });
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("Share receipt failed:", e);
    } finally {
      setSharingReceiptId(null);
    }
  }


  function sendWhatsApp(p: Payment) {
    const msg=`*${company?.company_name||"Magnus Boys Construction"}*\n*${p.payment_type==="advance"?"ADVANCE PAYMENT":p.payment_type==="final"?"FINAL PAYMENT":"PAYMENT RECEIPT"}*\n\nReceipt #: ${p.receipt_number||""}\nWorker: ${p.worker_name}\nID: ${p.worker_id_number||"—"}\nDate: ${fmtDate(p.work_date)}\nPayment: ${p.payment_method}\n\n*AMOUNT: ${fmtJMD(p.total_amount)}*\n\nPaid by: ${p.supervisor_name||""} · ${fmtDate(p.created_at)}`;
    const phone=p.worker_phone?.replace(/\D/g,"");
    window.open(`https://wa.me/${phone?`1${phone}`:""}?text=${encodeURIComponent(msg)}`,"_blank");
  }

  function sendEmail(p: Payment) {
    const subject=encodeURIComponent(`Payment Receipt - ${p.worker_name} - ${p.receipt_number}`);
    const body=encodeURIComponent(
      `${company?.company_name||"Magnus Boys Construction"}\n\n`+
      `${p.payment_type==="advance"?"ADVANCE PAYMENT":p.payment_type==="final"?"FINAL PAYMENT — PAID IN FULL":"PAYMENT RECEIPT"}\n`+
      `Receipt #: ${p.receipt_number}\nDate: ${fmtDate(p.work_date)}\n\n`+
      `Worker: ${p.worker_name}\nID: ${p.worker_id_number||"—"}\n`+
      `Work: ${p.work_type||""}\nPayment: ${p.payment_method}\n\n`+
      `AMOUNT: ${fmtJMD(p.total_amount)}\n\nPaid by: ${p.supervisor_name||""}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`,"_blank");
  }

  // Start new payment for same worker
  function continuePayment(p: Payment, type: "advance"|"payment"|"final") {
    setSelected(null);
    setShowForm(true);
    // Store worker context for pre-fill — handled in form
  }

  const TABS: {key:Tab;label:string}[] = [
    {key:"all",     label:"All"},
    {key:"advance", label:"Advances"},
    {key:"payment", label:"Work Pay"},
    {key:"final",   label:"Final"},
  ];

  if(showForm) {
    return <FieldPaymentForm onComplete={()=>{setShowForm(false);setPrefillWorker(null);loadPayments();}} onCancel={()=>{setShowForm(false);setPrefillWorker(null);}} prefillWorker={prefillWorker}/>;
  }

  return(
    <div className="min-h-screen bg-[#080b10] text-slate-100">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Field Payments</h1>
            <p className="text-xs text-slate-500 mt-0.5">Advance · Work Payment · Final Settlement</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadPayments} className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-500 hover:text-slate-300 transition">
              <RefreshCw size={13} className={loading?"animate-spin":""}/>
            </button>
            <button onClick={()=>setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition">
              <Plus size={13}/> New Payment
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {label:"Total Paid",    value:fmtJMD(stats.totalPaid),     color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20",icon:<DollarSign size={14}/>},
            {label:"Total Advances",value:fmtJMD(stats.totalAdvances), color:"text-amber-400",  bg:"bg-amber-500/10",  border:"border-amber-500/20",  icon:<TrendingUp size={14}/>},
            {label:"Workers",       value:stats.workers,                color:"text-violet-400", bg:"bg-violet-500/10", border:"border-violet-500/20", icon:<Users size={14}/>},
            {label:"Records",       value:stats.total,                  color:"text-slate-300",  bg:"bg-white/[0.04]",  border:"border-white/[0.07]",  icon:<FileText size={14}/>},
          ].map(s=>(
            <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
              <div className={`${s.color} mb-2`}>{s.icon}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t=>{
            const count=t.key==="all"?payments.length:payments.filter(p=>(p.payment_type||"payment")===t.key).length;
            return(
              <button key={t.key} onClick={()=>setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${tab===t.key?"bg-cyan-600 border-cyan-500 text-white":"bg-white/[0.04] border-white/[0.08] text-slate-500 hover:text-slate-300"}`}>
                {t.label}
                {count>0&&<span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab===t.key?"bg-white/20 text-white":"bg-white/[0.08] text-slate-600"}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search worker, ID, receipt #…"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
        </div>

        {/* List */}
        {loading?(
          <div className="flex items-center justify-center py-16 text-xs text-slate-600 gap-2"><RefreshCw size={13} className="animate-spin"/> Loading…</div>
        ):filtered.length===0?(
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center"><HandCoins size={22} className="text-slate-700"/></div>
            <p className="text-slate-400 text-sm font-medium">{search?"No payments match":"No payments yet"}</p>
            <button onClick={()=>setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition mt-1"><Plus size={12}/> New Payment</button>
          </div>
        ):(
          <div className="flex flex-col gap-3">
            {filtered.map(p=>{
              const pt=PT_CFG[p.payment_type||"payment"]||PT_CFG.payment;
              const st=PT_CFG[p.status]||PT_CFG.draft;
              return(
                <button key={p.id} onClick={()=>openDetail(p)}
                  className="w-full rounded-xl border border-white/[0.07] bg-[#0d1117] p-4 text-left hover:border-white/[0.13] transition">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      {p.id_photo_url?(
                        <img src={p.id_photo_url} className="w-10 h-10 rounded-full object-cover border border-white/[0.1] flex-shrink-0"/>
                      ):(
                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] font-bold text-cyan-300 flex-shrink-0">
                          {p.worker_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-slate-200">{p.worker_name}</div>
                        <div className="text-[10px] text-slate-600">{p.worker_id_number&&`ID: ${p.worker_id_number} · `}{fmtDate(p.work_date)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-base font-bold ${pt.color}`}>{fmtJMD(p.total_amount)}</div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${pt.color} ${pt.bg} ${pt.border}`}>{pt.icon} {pt.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] text-slate-600 truncate">{p.work_type||"—"}</div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-slate-600 capitalize">{p.payment_method?.replace("_"," ")}</span>
                      {p.signature_url&&<span className="text-[9px] text-violet-400">✓ Signed</span>}
                      {p.receipt_number&&<span className="text-[9px] text-slate-700">#{p.receipt_number.slice(-6)}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* -- DETAIL MODAL -- */}
      {selected&&(
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl max-h-[92vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] sticky top-0 bg-[#0d1117] z-10">
              <div>
                <div className="text-sm font-bold text-slate-100">{selected.worker_name}</div>
                <div className="text-[10px] text-slate-600">{fmtDate(selected.created_at)}</div>
              </div>
              <button onClick={()=>setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-600 hover:text-slate-300 transition"><X size={15}/></button>
            </div>

            <div className="p-5 space-y-4">

              {/* Payment Type Badge */}
              {(()=>{
                const pt=PT_CFG[selected.payment_type||"payment"]||PT_CFG.payment;
                return(
                  <div className={`flex items-center justify-between rounded-xl border ${pt.border} ${pt.bg} px-4 py-3`}>
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-widest ${pt.color}`}>{pt.icon} {pt.label}</div>
                      {selected.receipt_number&&<div className="text-[10px] text-slate-600 mt-0.5">Receipt #{selected.receipt_number}</div>}
                    </div>
                    <div className={`text-2xl font-black ${pt.color}`}>{fmtJMD(selected.total_amount)}</div>
                  </div>
                );
              })()}

              {/* Worker Info */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.05]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Worker Details</span>
                </div>
                {selected.id_photo_url&&(
                  <div className="p-4 border-b border-white/[0.05]">
                    <img src={selected.id_photo_url} className="w-full max-h-36 object-contain rounded-lg border border-white/[0.08]"/>
                  </div>
                )}
                <div className="divide-y divide-white/[0.04]">
                  {[
                    {label:"Full Name",    value:selected.worker_name},
                    {label:"ID Number",    value:selected.worker_id_number},
                    {label:"Phone",        value:selected.worker_phone},
                    {label:"Address",      value:selected.worker_address},
                  ].filter(r=>r.value).map(r=>(
                    <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider">{r.label}</span>
                      <span className="text-xs text-slate-300 font-semibold">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Info */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.05]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Payment Details</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    {label:"Work Type",    value:selected.work_type},
                    {label:"Work Date",    value:fmtDate(selected.work_date)},
                    {label:"Method",       value:selected.payment_method?.replace("_"," ")},
                    {label:"Status",       value:selected.status},
                    {label:"Supervisor",   value:selected.supervisor_name},
                    {label:"Days",         value:selected.days_worked?`${selected.days_worked} days`:null},
                    {label:"Hours",        value:selected.hours_worked?`${selected.hours_worked} hrs`:null},
                    {label:"Notes",        value:selected.notes},
                  ].filter(r=>r.value).map(r=>(
                    <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider">{r.label}</span>
                      <span className="text-xs text-slate-300 font-semibold capitalize">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signature */}
              {selected.signature_url&&(
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">Worker Signature</div>
                  <img src={selected.signature_url} className="h-16 object-contain bg-white rounded-lg p-2 border border-white/[0.08]"/>
                  <div className="text-[10px] text-slate-600 mt-1">{selected.worker_name}</div>
                </div>
              )}

              {/* Worker Payment History */}
              {workerHistory.length>1&&(
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/[0.05] flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Worker Payment History</span>
                    <span className="text-[9px] text-slate-600">{workerHistory.length} records</span>
                  </div>
                  {loadingHistory?(
                    <div className="p-4 text-center text-xs text-slate-600">Loading…</div>
                  ):(
                    <div className="divide-y divide-white/[0.04] max-h-40 overflow-y-auto">
                      {workerHistory.map(h=>{
                        const hpt=PT_CFG[h.payment_type||"payment"]||PT_CFG.payment;
                        return(
                          <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                            <div>
                              <div className="text-[10px] text-slate-400">{hpt.icon} {hpt.label}</div>
                              <div className="text-[9px] text-slate-600">{fmtDate(h.created_at)}</div>
                            </div>
                            <span className={`text-xs font-bold ${hpt.color}`}>{fmtJMD(h.total_amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Total summary */}
                  <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02] space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Total Advances</span>
                      <span className="text-amber-400 font-bold">{fmtJMD(workerHistory.filter(h=>h.payment_type==="advance").reduce((s,h)=>s+h.total_amount,0))}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Total Paid</span>
                      <span className="text-emerald-400 font-bold">{fmtJMD(workerHistory.reduce((s,h)=>s+h.total_amount,0))}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* -- ACTION BUTTONS -- */}
              <div className="space-y-2 pt-1">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Receipt Actions</div>
                {canEditDelete&&(
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button onClick={()=>setEditingPayment(selected)}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition text-sm font-semibold">
                      ✏️ Edit
                    </button>
                    <button onClick={()=>deletePayment(selected)}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition text-sm font-semibold">
                      🗑️ Delete
                    </button>
                  </div>
                )}

                {/* Generate PDF */}
                <button onClick={()=>generatePDF(selected)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.1] hover:border-white/[0.2] bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 font-semibold transition text-sm">
                  <Printer size={15}/> Generate & Print Receipt PDF
                </button>

                <button onClick={()=>shareReceiptImage(selected)} disabled={sharingReceiptId===selected.id}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold transition text-sm disabled:opacity-60">
                  {sharingReceiptId===selected.id ? <Loader2 size={15} className="animate-spin"/> : <Share2 size={15}/>}
                  {sharingReceiptId===selected.id ? "Generating..." : "Share Receipt (with logo)"}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>sendWhatsApp(selected)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition text-sm font-semibold">
                    <Share2 size={14}/> WhatsApp
                  </button>
                  <button onClick={()=>sendEmail(selected)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition text-sm font-semibold">
                    <Mail size={14}/> Email
                  </button>
                </div>

                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2 mt-3">Continue with this Worker</div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={()=>{const w=selected;setSelected(null);setPrefillWorker({name:w?.worker_name||"",id_number:w?.worker_id_number||"",phone:w?.worker_phone||"",payment_type:"advance"});setShowForm(true);}}
                    className="flex flex-col items-center gap-1 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition">
                    <TrendingUp size={15}/>
                    <span className="text-[10px] font-bold">New Advance</span>
                  </button>
                  <button onClick={()=>{const w=selected;setSelected(null);setPrefillWorker({name:w?.worker_name||"",id_number:w?.worker_id_number||"",phone:w?.worker_phone||"",payment_type:"payment"});setShowForm(true);}}
                    className="flex flex-col items-center gap-1 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition">
                    <DollarSign size={15}/>
                    <span className="text-[10px] font-bold">Pay Work</span>
                  </button>
                  <button onClick={()=>{const w=selected;setSelected(null);setPrefillWorker({name:w?.worker_name||"",id_number:w?.worker_id_number||"",phone:w?.worker_phone||"",payment_type:"final"});setShowForm(true);}}
                    className="flex flex-col items-center gap-1 py-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition">
                    <CheckCircle2 size={15}/>
                    <span className="text-[10px] font-bold">Final Pay</span>
                  </button>
                </div>
                <div className="text-[9px] text-slate-700 text-center">Tapping above starts a new payment for {selected.worker_name}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    {/* Edit Payment Modal */}
      {editingPayment&&(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div className="text-sm font-bold text-slate-100">Edit Payment</div>
              <button onClick={()=>setEditingPayment(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-600 hover:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Worker Name</label>
                <input value={editingPayment.worker_name} onChange={e=>setEditingPayment({...editingPayment,worker_name:e.target.value})}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Total Amount</label>
                <input type="number" value={editingPayment.total_amount} onChange={e=>setEditingPayment({...editingPayment,total_amount:Number(e.target.value)})}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Work Type</label>
                <input value={editingPayment.work_type||""} onChange={e=>setEditingPayment({...editingPayment,work_type:e.target.value})}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Work Date</label>
                <input type="date" value={editingPayment.work_date} onChange={e=>setEditingPayment({...editingPayment,work_date:e.target.value})}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Payment Method</label>
                <select value={editingPayment.payment_method} onChange={e=>setEditingPayment({...editingPayment,payment_method:e.target.value})}
                  className="w-full bg-[#080b10] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="mobile_money">Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Notes</label>
                <textarea value={editingPayment.notes||""} onChange={e=>setEditingPayment({...editingPayment,notes:e.target.value})}
                  rows={2} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 resize-none"/>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={()=>setEditingPayment(null)}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-400 hover:text-slate-200 transition text-sm">Cancel</button>
                <button onClick={()=>saveEdit(editingPayment, {
                  worker_name:editingPayment.worker_name,
                  total_amount:editingPayment.total_amount,
                  work_type:editingPayment.work_type,
                  work_date:editingPayment.work_date,
                  payment_method:editingPayment.payment_method,
                  notes:editingPayment.notes,
                })}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition text-sm">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}