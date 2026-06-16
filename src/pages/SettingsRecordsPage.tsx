// src/pages/SettingsRecordsPage.tsx — Worker Records & ID Management
// Admin/Director only — print company worker IDs and field worker file sheets
import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
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
  const [watermark, setWatermark] = useState<{url:string;opacity:number}|null>(null);
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
            if(cs?.watermark_enabled && cs?.watermark_url){
              setWatermark({url:cs.watermark_url, opacity:cs.watermark_opacity||0.15, size:cs.watermark_size||25});
            } else { setWatermark(null); }
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
      @media print{@page{size:A4;margin:15mm}body{padding:20px}}
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
    ${watermark?`<img src="${watermark.url}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);width:60%;opacity:${watermark.opacity};pointer-events:none;z-index:0"/>`:""}
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
      @media print{@page{size:A4;margin:15mm}body{padding:20px}}
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
    ${watermark?`<img src="${watermark.url}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);width:60%;opacity:${watermark.opacity};pointer-events:none;z-index:0"/>`:""}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#999">${company?.company_name||""} · CONFIDENTIAL</div>
    </body></html>`;
    const w = window.open("","_blank");
    if(!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  async function printCompanyIDCard(worker: any) {
    const cardBgImg = "data:image/png;base64,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";
    const workerUrl = `https://app.magnusboys.com/verify-worker/${worker.id}`;
    const qrDataUrl = await QRCode.toDataURL(workerUrl, {width:80,margin:1});
    const html = `<!DOCTYPE html><html><head><title>ID Card - ${worker.first_name} ${worker.last_name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:white;padding:20mm;display:flex;flex-direction:column;align-items:center;gap:20px}
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
      .card{width:85.6mm;height:54mm;border-radius:6px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.3);position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .front{background:linear-gradient(135deg,#050d1a 0%,#0a1f3d 60%,#0f2d5a 100%);color:white;display:flex;padding:0;height:54mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;position:relative;overflow:hidden}
      .front-bg{position:absolute;bottom:3mm;right:3mm;width:45mm;height:35mm;object-fit:cover;opacity:0.4;pointer-events:none;filter:invert(1) brightness(10) grayscale(1);-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .front-left{width:28mm;background:rgba(0,20,60,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .front-photo{width:20mm;height:25mm;object-fit:cover;border-radius:3px;border:2px solid rgba(255,255,255,0.5);-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .front-photo-placeholder{width:20mm;height:25mm;border-radius:3px;border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:8px;color:rgba(255,255,255,0.4);overflow:hidden}
      .front-right{flex:1;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between}
      .co-name{font-size:7px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.7;margin-bottom:2px}
      .worker-name{font-size:11px;font-weight:900;line-height:1.2;text-transform:uppercase}
      .worker-role{font-size:8px;opacity:0.7;margin-top:2px;text-transform:uppercase;letter-spacing:1px}
      .id-num{font-size:9px;font-family:monospace;background:rgba(255,255,255,0.1);padding:3px 6px;border-radius:3px;margin-top:4px;display:inline-block}
      .card-footer{font-size:7px;opacity:0.5;margin-top:auto}
      .back{background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;text-align:center;height:54mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .back-logo{width:40px;height:40px;border-radius:50%;object-fit:cover;margin-bottom:8px;border:2px solid rgba(255,255,255,0.3)}
      .back-company{font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px}
      .back-address{font-size:7px;opacity:0.6;line-height:1.6}
      .back-tagline{font-size:8px;font-style:italic;opacity:0.7;margin-top:6px;border-top:1px solid rgba(255,255,255,0.2);padding-top:6px}
      .back-auth{font-size:7px;opacity:0.5;margin-top:8px}
      .label{font-size:6px;opacity:0.5;text-transform:uppercase;letter-spacing:1px;margin-bottom:1px}
      @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}body{background:white;padding:10mm}@page{size:A4 portrait;margin:15mm}}
    </style></head><body>
    <div style="text-align:center;font-size:11px;color:#666;margin-bottom:8px">FRONT</div>
    <div class="card">
      <div class="front">
        <img src="${cardBgImg}" class="front-bg"/>
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
        <img src="${qrDataUrl}" style="width:40px;height:40px;margin:4px 0"/>
        <div class="back-auth">This card certifies the bearer is an authorized representative of ${company?.company_name||"this company"}</div>
      </div>
    </div>
        ${watermark?`<img src="${watermark.url}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);width:60%;opacity:${watermark.opacity};pointer-events:none;z-index:0"/>`:""}
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