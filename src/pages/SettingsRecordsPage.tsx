// src/pages/SettingsRecordsPage.tsx — Worker Records & ID Management
// Admin/Director only — print company worker IDs and field worker file sheets
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { Printer, Search, User, FileText, ChevronLeft, Shield, CreditCard, Briefcase } from "lucide-react";

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:0}).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}

export default function SettingsRecordsPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean|null>(null);
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [company, setCompany] = useState<any>(null);
  const [logoBase64, setLogoBase64] = useState<string|null>(null);
  const [tab, setTab] = useState<"company"|"field">("company");
  const [search, setSearch] = useState("");
  const [companyWorkers, setCompanyWorkers] = useState<any[]>([]);
  const [fieldWorkers, setFieldWorkers] = useState<any[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [fieldPayments, setFieldPayments] = useState<any[]>([]);

  // Auth check — director only
  useEffect(()=>{
    supabase.auth.getUser().then(async({data})=>{
      if(!data.user){ setAllowed(false); return; }
      const {data:p}=await supabase.from("user_profiles").select("company_id,role").eq("id",data.user.id).maybeSingle();
      if(!p){ setAllowed(false); return; }
      const isAdmin = ["director","admin","owner"].includes(p.role||"");
      setAllowed(isAdmin);
      if(isAdmin && p.company_id){
        setCompanyId(p.company_id);
        // Load company settings
        supabase.from("company_settings").select("*").eq("company_id",p.company_id).maybeSingle()
          .then(({data:cs})=>{
            setCompany(cs);
            if(cs?.logo_url){
              fetch(cs.logo_url).then(r=>r.blob())
                .then(blob=>new Promise<string>((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result as string);fr.onerror=rej;fr.readAsDataURL(blob);}))
                .then(b64=>setLogoBase64(b64)).catch(()=>{});
            }
          });
      }
    });
  },[]);

  useEffect(()=>{
    if(!companyId) return;
    setLoadingWorkers(true);
    Promise.all([
      supabase.from("workers").select("*").eq("company_id",companyId).order("last_name"),
      supabase.from("field_payments").select("*").eq("company_id",companyId).order("created_at",{ascending:false}),
    ]).then(([{data:w},{data:fp}])=>{
      setCompanyWorkers(w||[]);
      setFieldPayments(fp||[]);
      // Group field payments by worker_ref
      const workerMap: Record<string,any> = {};
      (fp||[]).forEach((p:any)=>{
        const key = p.worker_ref||p.worker_name;
        if(!workerMap[key]){
          workerMap[key]={
            name:p.worker_name, id_number:p.worker_id_number,
            phone:p.worker_phone, address:p.worker_address,
            id_photo_url:p.id_photo_url, payments:[], total:0, advances:0
          };
        }
        workerMap[key].payments.push(p);
        workerMap[key].total += p.total_amount||0;
        if(p.payment_type==="advance") workerMap[key].advances += p.total_amount||0;
        if(p.id_photo_url && !workerMap[key].id_photo_url) workerMap[key].id_photo_url = p.id_photo_url;
      });
      setFieldWorkers(Object.values(workerMap));
      setLoadingWorkers(false);
    });
  },[companyId]);

  function printCompanyWorkerFile(worker: any) {
    const html = `<!DOCTYPE html><html><head><title>Worker File - ${worker.first_name} ${worker.last_name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white;padding:40px}
      .header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px}
      .logo{width:70px;height:70px;border-radius:10px;object-fit:cover}
      .company-name{font-size:22px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
      .company-sub{font-size:11px;color:#666;margin-top:3px}
      .doc-title{text-align:center;margin-bottom:24px}
      .doc-title h2{font-size:18px;font-weight:900;letter-spacing:3px;text-transform:uppercase}
      .doc-title p{font-size:11px;color:#666;margin-top:4px}
      .content{display:grid;grid-template-columns:1fr 180px;gap:24px}
      .photo{width:180px;height:220px;object-fit:cover;border:2px solid #1a1a1a;border-radius:6px}
      .photo-placeholder{width:180px;height:220px;border:2px dashed #999;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      td{padding:8px 4px;border-bottom:1px solid #eee;font-size:13px}
      td:first-child{color:#666;width:140px;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      td:last-child{font-weight:600}
      .section-title{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin:20px 0 8px}
      .id-photo{width:100%;max-height:180px;object-fit:contain;border:1px solid #eee;border-radius:6px;margin-top:8px}
      .footer{margin-top:32px;border-top:2px solid #1a1a1a;padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
      .sig-line{border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;font-size:11px;color:#666}
      @media print{body{padding:20px}}
    </style></head><body>
    <div class="header">
      ${logoBase64?`<img src="${logoBase64}" class="logo"/>`:""}
      <div>
        <div class="company-name">${company?.company_name||""}</div>
        <div class="company-sub">${company?.address_line1||""}${company?.parish?`, ${company.parish}`:""}</div>
        <div class="company-sub">${company?.phone||""} · ${company?.email||""}</div>
      </div>
    </div>
    <div class="doc-title">
      <h2>Employee File Record</h2>
      <p>Confidential — For authorized personnel only · Printed: ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="content">
      <div>
        <div class="section-title">Personal Information</div>
        <table>
          <tr><td>Full Name</td><td>${worker.first_name||""} ${worker.last_name||""}</td></tr>
          <tr><td>Employee ID</td><td>${worker.employee_id||"—"}</td></tr>
          <tr><td>ID Number</td><td>${worker.id_number||"—"}</td></tr>
          <tr><td>ID Type</td><td>${worker.national_id_type||"—"}</td></tr>
          <tr><td>Phone</td><td>${worker.phone||"—"}</td></tr>
          <tr><td>Email</td><td>${worker.email||"—"}</td></tr>
          <tr><td>Address</td><td>${worker.address||"—"}</td></tr>
          <tr><td>Date of Birth</td><td>${worker.date_of_birth?fmtDate(worker.date_of_birth):"—"}</td></tr>
        </table>
        <div class="section-title">Employment Details</div>
        <table>
          <tr><td>Role</td><td>${worker.worker_type||worker.role||"—"}</td></tr>
          <tr><td>Department</td><td>${worker.department||"—"}</td></tr>
          <tr><td>Start Date</td><td>${worker.start_date?fmtDate(worker.start_date):"—"}</td></tr>
          <tr><td>Pay Rate</td><td>${worker.pay_rate?fmtJMD(worker.pay_rate):"—"}</td></tr>
          <tr><td>Status</td><td>${worker.status||"—"}</td></tr>
        </table>
      </div>
      <div>
        ${worker.passport_photo_url?`<img src="${worker.passport_photo_url}" class="photo"/>`:`<div class="photo-placeholder">No Photo</div>`}
        ${worker.id_photo_url?`<div class="section-title">ID Document</div><img src="${worker.id_photo_url}" class="id-photo"/>`:""}
      </div>
    </div>
    <div class="footer">
      <div><div class="sig-line">Authorized By</div></div>
      <div><div class="sig-line">Date</div></div>
    </div>
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#999">${company?.company_name||""} · ${company?.tagline?`"${company.tagline}" · `:""}CONFIDENTIAL</div>
    </body></html>`;
    const w = window.open("","_blank");
    if(!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  function printFieldWorkerFile(worker: any) {
    const html = `<!DOCTYPE html><html><head><title>Field Worker File - ${worker.name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white;padding:40px}
      .header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px}
      .logo{width:70px;height:70px;border-radius:10px;object-fit:cover}
      .company-name{font-size:22px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
      .company-sub{font-size:11px;color:#666;margin-top:3px}
      .doc-title{text-align:center;margin-bottom:24px}
      .doc-title h2{font-size:18px;font-weight:900;letter-spacing:3px;text-transform:uppercase}
      .content{display:grid;grid-template-columns:1fr 220px;gap:24px}
      .id-photo{width:220px;height:auto;max-height:280px;object-fit:contain;border:2px solid #1a1a1a;border-radius:6px;background:#f5f5f5}
      .id-placeholder{width:220px;height:200px;border:2px dashed #999;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      td{padding:8px 4px;border-bottom:1px solid #eee;font-size:13px}
      td:first-child{color:#666;width:140px;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      td:last-child{font-weight:600}
      .section-title{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin:16px 0 8px}
      .payment-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:12px}
      .total-row{display:flex;justify-content:space-between;padding:8px 0;font-weight:900;font-size:14px;border-top:2px solid #1a1a1a;margin-top:4px}
      .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
      .advance{background:#fef3c7;color:#92400e}
      .payment{background:#d1fae5;color:#065f46}
      .final{background:#cffafe;color:#164e63}
      @media print{body{padding:20px}}
    </style></head><body>
    <div class="header">
      ${logoBase64?`<img src="${logoBase64}" class="logo"/>`:""}
      <div>
        <div class="company-name">${company?.company_name||""}</div>
        <div class="company-sub">${company?.address_line1||""}${company?.parish?`, ${company.parish}`:""}</div>
        <div class="company-sub">${company?.phone||""} · ${company?.email||""}</div>
      </div>
    </div>
    <div class="doc-title">
      <h2>Field Worker File Record</h2>
      <p>Confidential · Printed: ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="content">
      <div>
        <div class="section-title">Worker Information</div>
        <table>
          <tr><td>Full Name</td><td>${worker.name||"—"}</td></tr>
          <tr><td>ID Number</td><td>${worker.id_number||"—"}</td></tr>
          <tr><td>Phone</td><td>${worker.phone||"—"}</td></tr>
          <tr><td>Address</td><td>${worker.address||"—"}</td></tr>
        </table>
        <div class="section-title">Payment History</div>
        ${worker.payments.map((p:any)=>`
          <div class="payment-row">
            <div>
              <span class="badge ${p.payment_type==="advance"?"advance":p.payment_type==="final"?"final":"payment"}">${p.payment_type}</span>
              <span style="margin-left:8px;color:#666">${fmtDate(p.created_at)}</span>
              ${p.project_name?`<span style="margin-left:8px;color:#999;font-size:11px">${p.project_name}</span>`:""}
            </div>
            <strong>${fmtJMD(p.total_amount)}</strong>
          </div>`).join("")}
        <div class="total-row">
          <span>Total Paid</span>
          <span>${fmtJMD(worker.total)}</span>
        </div>
        ${worker.advances>0?`<div style="font-size:12px;color:#92400e;margin-top:4px">⚡ Total Advances: ${fmtJMD(worker.advances)}</div>`:""}
      </div>
      <div>
        ${worker.id_photo_url?`<img src="${worker.id_photo_url}" class="id-photo"/>`:`<div class="id-placeholder">No ID Photo</div>`}
      </div>
    </div>
    <div style="margin-top:40px;border-top:2px solid #1a1a1a;padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div><div style="border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;font-size:11px;color:#666">Authorized By</div></div>
      <div><div style="border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;font-size:11px;color:#666">Date</div></div>
    </div>
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#999">${company?.company_name||""} · CONFIDENTIAL</div>
    </body></html>`;
    const w = window.open("","_blank");
    if(!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  function printCompanyIDCard(worker: any) {
    const html = `<!DOCTYPE html><html><head><title>ID Card - ${worker.first_name} ${worker.last_name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;flex-direction:column;gap:20px;padding:20px}
      .card{width:85.6mm;height:54mm;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.2);position:relative}
      .front{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:white;display:flex;padding:0;height:54mm}
      .front-left{width:28mm;background:rgba(0,0,0,0.3);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px}
      .front-photo{width:22mm;height:26mm;object-fit:cover;border-radius:4px;border:2px solid rgba(255,255,255,0.3)}
      .front-photo-placeholder{width:22mm;height:26mm;border-radius:4px;border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:8px;color:rgba(255,255,255,0.4)}
      .front-right{flex:1;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between}
      .co-name{font-size:7px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.7;margin-bottom:2px}
      .worker-name{font-size:11px;font-weight:900;line-height:1.2;text-transform:uppercase}
      .worker-role{font-size:8px;opacity:0.7;margin-top:2px;text-transform:uppercase;letter-spacing:1px}
      .id-num{font-size:9px;font-family:monospace;background:rgba(255,255,255,0.1);padding:3px 6px;border-radius:3px;margin-top:4px;display:inline-block}
      .card-footer{font-size:7px;opacity:0.5;margin-top:auto}
      .back{background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;text-align:center;height:54mm}
      .back-logo{width:40px;height:40px;border-radius:8px;object-fit:cover;margin-bottom:8px}
      .back-company{font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px}
      .back-address{font-size:7px;opacity:0.6;line-height:1.6}
      .back-tagline{font-size:8px;font-style:italic;opacity:0.7;margin-top:6px;border-top:1px solid rgba(255,255,255,0.2);padding-top:6px}
      .back-auth{font-size:7px;opacity:0.5;margin-top:8px}
      .label{font-size:6px;opacity:0.5;text-transform:uppercase;letter-spacing:1px;margin-bottom:1px}
      @media print{body{background:white;padding:10px}@page{size:A4;margin:10mm}}
    </style></head><body>
    <div style="text-align:center;font-size:11px;color:#666;margin-bottom:8px">FRONT</div>
    <div class="card">
      <div class="front">
        <div class="front-left">
          ${worker.passport_photo_url?`<img src="${worker.passport_photo_url}" class="front-photo"/>`:`<div class="front-photo-placeholder">PHOTO</div>`}
        </div>
        <div class="front-right">
          <div>
            <div class="co-name">${company?.company_name||""}</div>
            <div class="worker-name">${worker.first_name||""} ${worker.last_name||""}</div>
            <div class="worker-role">${worker.worker_type||worker.role||"Staff"}</div>
            ${worker.id_number?`<div class="id-num">ID: ${worker.id_number}</div>`:""}
            ${worker.employee_id?`<div class="id-num">EMP: ${worker.employee_id}</div>`:""}
          </div>
          <div class="card-footer">
            ${worker.start_date?`<div><span class="label">Since</span> ${fmtDate(worker.start_date)}</div>`:""}
          </div>
        </div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#666;margin-top:16px;margin-bottom:8px">BACK</div>
    <div class="card">
      <div class="back">
        ${logoBase64?`<img src="${logoBase64}" class="back-logo"/>`:""}
        <div class="back-company">${company?.company_name||""}</div>
        <div class="back-address">
          ${company?.address_line1||""}${company?.address_line2?`<br/>${company.address_line2}`:""}<br/>
          ${company?.parish||""}${company?.country?`, ${company.country}`:""}<br/>
          ${company?.phone||""}${company?.email?` · ${company.email}`:""}
        </div>
        ${company?.tagline?`<div class="back-tagline">"${company.tagline}"</div>`:""}
        <div class="back-auth">This card certifies the bearer is an authorized representative of ${company?.company_name||"this company"}</div>
      </div>
    </div>
    </body></html>`;
    const w = window.open("","_blank");
    if(!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  if(allowed===null) return <div className="p-8 text-slate-500 text-sm">Checking access...</div>;
  if(allowed===false) return (
    <div className="p-8 text-center">
      <Shield size={40} className="text-red-400 mx-auto mb-4"/>
      <div className="text-slate-300 font-bold text-lg">Access Restricted</div>
      <div className="text-slate-500 text-sm mt-2">This section is for Directors and Administrators only.</div>
      <button onClick={()=>navigate("/settings")} className="mt-4 px-4 py-2 rounded-lg bg-white/[0.06] text-slate-400 text-sm">← Back to Settings</button>
    </div>
  );

  const filteredCompany = companyWorkers.filter(w=>
    `${w.first_name} ${w.last_name} ${w.worker_type||""} ${w.id_number||""}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredField = fieldWorkers.filter(w=>
    `${w.name} ${w.id_number||""} ${w.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate("/settings")} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500">
          <ChevronLeft size={16}/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Records & IDs</h1>
          <p className="text-xs text-slate-500 mt-0.5">Print worker files and ID cards — Admin only</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Shield size={12} className="text-amber-400"/>
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Director Access</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workers..."
          className="w-full pl-8 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-cyan-500/50"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <button onClick={()=>setTab("company")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab==="company"?"bg-cyan-600 text-white":"text-slate-500 hover:text-slate-300"}`}>
          <Briefcase size={12}/> Company Workers ({filteredCompany.length})
        </button>
        <button onClick={()=>setTab("field")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab==="field"?"bg-cyan-600 text-white":"text-slate-500 hover:text-slate-300"}`}>
          <User size={12}/> Field Workers ({filteredField.length})
        </button>
      </div>

      {/* Company Workers */}
      {tab==="company"&&(
        <div className="space-y-3">
          {filteredCompany.length===0&&<div className="text-center py-8 text-xs text-slate-600">No company workers found</div>}
          {filteredCompany.map(w=>(
            <div key={w.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex items-center gap-4">
              {w.passport_photo_url?(
                <img src={w.passport_photo_url} className="w-12 h-12 rounded-full object-cover border border-white/[0.1]"/>
              ):(
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  {(w.first_name?.[0]||"")+( w.last_name?.[0]||"")}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-200">{w.first_name} {w.last_name}</div>
                <div className="text-[10px] text-slate-500">{w.worker_type||w.role||"Staff"}{w.id_number?` · ID: ${w.id_number}`:""}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>printCompanyIDCard(w)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition">
                  <CreditCard size={12}/> ID Card
                </button>
                <button onClick={()=>printCompanyWorkerFile(w)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition">
                  <FileText size={12}/> File Sheet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Field Workers */}
      {tab==="field"&&(
        <div className="space-y-3">
          {filteredField.length===0&&<div className="text-center py-8 text-xs text-slate-600">No field workers found</div>}
          {filteredField.map((w,i)=>(
            <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex items-center gap-4">
              {w.id_photo_url?(
                <img src={w.id_photo_url} className="w-12 h-12 rounded-lg object-cover border border-white/[0.1]"/>
              ):(
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                  {w.name?.[0]?.toUpperCase()||"?"}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-200">{w.name}</div>
                <div className="text-[10px] text-slate-500">
                  {w.id_number?`ID: ${w.id_number} · `:""}
                  {w.phone||""}
                </div>
                <div className="text-[10px] text-slate-600">{w.payments.length} payments · Total: {fmtJMD(w.total)}</div>
              </div>
              <button onClick={()=>printFieldWorkerFile(w)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition">
                <FileText size={12}/> Print File
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}