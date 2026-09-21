// src/pages/ClientPortalPage.tsx … Secure portal with password + PWA
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { logPortalEvent } from "../lib/portalActivity";
import { functionErrorMessage } from "../lib/portalErrors";
import { openPrintWindow } from "../lib/printUtils";
import { contractSummaryRows, contractLongSections, buildPortalContractHtml, formatJamaicaDateTimeFull } from "../lib/contractDocument";

type AuthState = "loading"|"error"|"setup"|"login"|"authenticated";
type Tab = "overview"|"photos"|"invoices"|"contracts"|"changes"|"feedback"|"estimates";

// No portal_password_hash — nothing in this file selects it anymore, so it
// was removed from the type rather than left declared-but-always-undefined.
interface Client { id:string; name:string; contact_name:string|null; email:string|null; phone?:string|null; portal_email:string|null; portal_activated_at:string|null; company_id?:string|null; }
interface Project { id:string; name:string; status:string; start_date:string|null; end_date:string|null; site_address:string|null; }
interface Invoice { id:string; invoice_number:string|null; total_amount:number; status:string; issue_date:string|null; due_date:string|null; }
interface ChangeOrder { id:string; title:string; description:string|null; amount:number; status:string; created_at:string; }
interface Comment { id:string; message:string; created_at:string; sender_type?:string; }
interface Photo { id:string; url?:string; public_url?:string; publicUrl?:string; caption?:string; created_at:string; }
interface Co { company_name:string|null; logo_url:string|null; phone:string|null; email:string|null; address_line1:string|null; }

const fmt = (n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(n);
// Date-only values (YYYY-MM-DD) are calendar dates: parsing them as UTC midnight and
// formatting in Jamaica time showed them a day early, so format those in UTC (no shift).
// Full timestamps display in Jamaica time.
const fmtDate = (d:string|null) => {
  if(!d)return "…";
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const dt=m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):new Date(d);
  return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:m?"UTC":"America/Jamaica"});
};
const timeAgo = (d:string) => { const s=Math.floor((Date.now()-new Date(d).getTime())/1000); if(s<60)return "just now"; if(s<3600)return `${Math.floor(s/60)}m ago`; if(s<86400)return `${Math.floor(s/3600)}h ago`; return fmtDate(d); };

// Whole-dollar JMD, matching how the printed proposal shows estimate prices.
const fmt0 = (n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:0,maximumFractionDigits:0}).format(n);
// Same date-only handling as fmtDate, but keeps the weekday format Site Updates uses.
const fmtLogDay = (d:string) => {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const dt=m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):new Date(d);
  return dt.toLocaleDateString("en-JM",{weekday:"short",month:"short",day:"numeric",timeZone:m?"UTC":"America/Jamaica"});
};

// Read-only view of a shared estimate snapshot (client-facing prices only). A summary
// snapshot has no line items at all, so none are rendered for it. No print/share/copy.
function PortalEstimateCard({es}:{es:any}) {
  const sn=es?.snapshot||{};
  const full=sn.detail_level==="full";
  const cats:any[]=Array.isArray(sn.categories)?sn.categories:[];
  const n=(v:any)=>Number(v)||0;
  const th:React.CSSProperties={fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",padding:"6px 8px",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"};
  const td:React.CSSProperties={fontSize:12,color:"#334155",padding:"7px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
  return <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:4}}>
      <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{sn.title||es?.title||"Estimate"}</div>
      <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:"rgba(59,130,246,0.12)",color:"#2563eb",whiteSpace:"nowrap"}}>v{sn.version??es?.version??1}</span>
    </div>
    <div style={{fontSize:11,color:"#64748b"}}>Prepared for {sn.client_name||"you"}{sn.prepared_date?` · ${fmtDate(sn.prepared_date)}`:""}</div>
    {sn.project_name&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>Project: {sn.project_name}</div>}
    {sn.valid_until&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>Valid until {fmtDate(sn.valid_until)}</div>}
    <div style={{marginTop:14}}>
      {cats.length===0&&<div style={{fontSize:12,color:"#94a3b8"}}>No items to show.</div>}
      {!full&&cats.map((c:any,i:number)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"9px 0",borderBottom:"1px solid #f1f5f9"}}>
        <span style={{fontSize:13,color:"#334155",fontWeight:600}}>{c?.name}</span>
        <span style={{fontSize:13,color:"#0f172a",fontWeight:700}}>{fmt0(n(c?.total))}</span>
      </div>)}
      {full&&cats.map((c:any,i:number)=><div key={i} style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"6px 0"}}>
          <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{c?.name}</span>
          <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{fmt0(n(c?.total))}</span>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:420}}>
            <thead><tr>
              <th style={{...th,textAlign:"left"}}>Item</th>
              <th style={{...th,textAlign:"right"}}>Qty</th>
              <th style={{...th,textAlign:"left"}}>Unit</th>
              <th style={{...th,textAlign:"right"}}>Unit price</th>
              <th style={{...th,textAlign:"right"}}>Amount</th>
            </tr></thead>
            <tbody>
              {(Array.isArray(c?.items)?c.items:[]).map((it:any,j:number)=><tr key={j}>
                <td style={td}><div style={{fontWeight:600}}>{it?.item}</div></td>
                <td style={{...td,textAlign:"right"}}>{n(it?.qty).toLocaleString(undefined,{maximumFractionDigits:4})}</td>
                <td style={td}>{it?.unit}</td>
                <td style={{...td,textAlign:"right"}}>{fmt(n(it?.rate))}</td>
                <td style={{...td,textAlign:"right",fontWeight:600}}>{fmt0(n(it?.amount))}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>)}
    </div>
    <div style={{marginTop:6,paddingTop:10,borderTop:"2px solid #e2e8f0"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#475569",padding:"3px 0"}}><span>Subtotal</span><span>{fmt0(n(sn.subtotal))}</span></div>
      {n(sn.contingency_amount)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#475569",padding:"3px 0"}}><span>Contingency allowance</span><span>{fmt0(n(sn.contingency_amount))}</span></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,padding:"12px 14px",background:"#0f172a",borderRadius:12}}>
        <span style={{fontSize:13,fontWeight:700,color:"#ffffff"}}>Total</span>
        <span style={{fontSize:17,fontWeight:800,color:"#ffffff"}}>{fmt0(n(sn.total))}</span>
      </div>
    </div>
    {sn.company?.name&&<div style={{fontSize:10,color:"#94a3b8",marginTop:10}}>Prepared by {sn.company.name}</div>}
  </div>;
}

function ProgressRing({pct}:{pct:number}) {
  const r=28,circ=2*Math.PI*r;
  const [off,setOff]=useState(circ);
  useEffect(()=>{setTimeout(()=>setOff(circ-(pct/100)*circ),400);},[pct]);
  return <svg width={72} height={72} style={{transform:"rotate(-90deg)"}}>
    <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6}/>
    <circle cx={36} cy={36} r={r} fill="none" stroke="#3b82f6" strokeWidth={6} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 1.2s ease"}}/>
  </svg>;
}

function Stars({value,onChange}:{value:number;onChange:(n:number)=>void}) {
  const [hover,setHover]=useState(0);
  return <div style={{display:"flex",gap:4,justifyContent:"center"}}>
    {[1,2,3,4,5].map(s=><button key={s} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>onChange(s)} style={{fontSize:34,background:"none",border:"none",cursor:"pointer",color:s<=(hover||value)?"#f59e0b":"#cbd5e1",transition:"all 0.15s",transform:s<=(hover||value)?"scale(1.2)":"scale(1)"}}>★</button>)}
  </div>;
}

function Toast({msg,type="success",onDone}:{msg:string;type?:"success"|"error";onDone:()=>void}) {
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:type==="success"?"#1e293b":"#450a0a",border:`1px solid ${type==="success"?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,borderRadius:12,padding:"12px 20px",color:type==="success"?"#4ade80":"#fca5a5",fontSize:13,fontWeight:600,zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",whiteSpace:"nowrap"}}>
    {type==="success"?"?":"?"} {msg}
  </div>;
}
function AuthScreen({client,company,mode,token,onSuccess}:{client:Client;company:Co|null;mode:"setup"|"login";token:string;onSuccess:()=>void}) {
  const [email,setEmail]=useState(client.portal_email||client.email||"");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [showPass,setShowPass]=useState(false);
  const [view,setView]=useState<"auth"|"forgot"|"resetSent">("auth");
  const [forgotLoading,setForgotLoading]=useState(false);
  const [forgotError,setForgotError]=useState("");

  // Identity for both actions below is anchored on the magic-link token
  // (portalToken), not the typed email — see client-portal-login's header
  // comment for why: keying by email here would let someone set up a
  // *different* client's account by typing their email during this one's
  // setup flow.
  async function handleSetup() {
    if(!email.trim()){setError("Please enter your email address.");return;}
    if(password.length<6){setError("Password must be at least 6 characters.");return;}
    if(password!==confirm){setError("Passwords do not match.");return;}
    setLoading(true);setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("client-portal-login",
      {body:{action:"magicLinkSetup",portalToken:token,email:email.trim(),password}});
    if(invokeError||data?.error){setError(await functionErrorMessage(invokeError,data,invokeError?.message||"Failed to set up account."));setLoading(false);return;}
    localStorage.setItem(`portal_${client.id}`,data.sessionToken);
    onSuccess();setLoading(false);
  }

  async function handleForgotPassword() {
    setForgotLoading(true);
    setForgotError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "client-password-reset",
        { body: { action: "request", email: email.trim() } }
      );
      if (invokeError) {
        setForgotError(await functionErrorMessage(invokeError, data, invokeError.message || "Failed to send reset email."));
        setForgotLoading(false);
        return;
      }
      if (data?.error) {
        setForgotError(String(data.error));
        setForgotLoading(false);
        return;
      }
      setView("resetSent");
    } catch {
      setForgotError("Something went wrong. Please try again.");
    }
    setForgotLoading(false);
  }

  async function handleLogin() {
    if(!password){setError("Please enter your password.");return;}
    setLoading(true);setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("client-portal-login",
      {body:{action:"magicLinkLogin",portalToken:token,password}});
    if(invokeError||data?.error){setError(await functionErrorMessage(invokeError,data,invokeError?.message||"Login failed. Please try again."));setLoading(false);return;}
    localStorage.setItem(`portal_${client.id}`,data.sessionToken);
    onSuccess();setLoading(false);
  }

  const S={
    page:{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:20} as React.CSSProperties,
    card:{width:"100%",maxWidth:400,background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:20,padding:28,boxShadow:"0 10px 30px rgba(0,0,0,0.08)"} as React.CSSProperties,
    input:{width:"100%",background:"#ffffff",border:"1px solid #cbd5e1",borderRadius:10,padding:"11px 14px",fontSize:14,color:"#0f172a",boxSizing:"border-box" as "border-box",outline:"none"},
    label:{fontSize:12,color:"#64748b",fontWeight:600,display:"block",marginBottom:6} as React.CSSProperties,
    btn:{width:"100%",padding:"13px 0",background:"#0891b2",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4} as React.CSSProperties,
  };

  return <div style={S.page}>
    <div style={{width:"100%",maxWidth:400}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        {company?.logo_url?<img src={company.logo_url} style={{width:52,height:52,borderRadius:12,objectFit:"cover",margin:"0 auto 10px",display:"block"}}/>
          :<div style={{width:52,height:52,borderRadius:12,background:"linear-gradient(135deg,#0891b2,#06b6d4)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,margin:"0 auto 10px",color:"#fff"}}>{(company?.company_name||"M")[0]}</div>}
        <div style={{fontSize:17,fontWeight:800,color:"#0f172a",marginBottom:3}}>{company?.company_name||company?.company_name||company?.company_name||"Magnus Boys Construction"}</div>
        <div style={{fontSize:12,color:"#64748b"}}>Client Portal</div>
      </div>
      <div style={S.card}>
        <h2 style={{fontSize:19,fontWeight:800,color:"#0f172a",margin:"0 0 6px"}}>{mode==="setup"?"Activate Your Account":"Welcome Back"}</h2>
        <p style={{fontSize:13,color:"#475569",margin:"0 0 20px",lineHeight:1.6}}>
          {mode==="setup"?`Hello ${client.contact_name||client.name}! Create a password to access your project portal.`:`Sign in to view your project updates.`}
        </p>
        {error&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#dc2626",marginBottom:14}}>⚠ {error}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {mode==="setup"&&<div>
            <label style={S.label}>EMAIL ADDRESS</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@email.com" style={S.input}/>
          </div>}
          {mode==="login"&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#1d4ed8"}}>
            📧 Signing in as: <strong>{client.portal_email||client.email}</strong>
          </div>}
          <div>
            <label style={S.label}>{mode==="setup"?"CREATE PASSWORD":"PASSWORD"}</label>
            <div style={{position:"relative"}}>
              <input value={password} onChange={e=>setPassword(e.target.value)} type={showPass?"text":"password"}
                placeholder={mode==="setup"?"Minimum 6 characters":"Enter your password"}
                onKeyDown={e=>e.key==="Enter"&&(mode==="setup"?handleSetup():handleLogin())}
                style={{...S.input,paddingRight:44}}/>
              <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>
                {showPass?"🙈":"👁"}
              </button>
            </div>
          </div>
          {mode==="setup"&&<div>
            <label style={S.label}>CONFIRM PASSWORD</label>
            <input value={confirm} onChange={e=>setConfirm(e.target.value)} type={showPass?"text":"password"}
              placeholder="Repeat your password" onKeyDown={e=>e.key==="Enter"&&handleSetup()} style={S.input}/>
          </div>}
          <button onClick={mode==="setup"?handleSetup:handleLogin} disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
            {loading?"Please wait…":mode==="setup"?"Activate Account ?":"Sign In ?"}
          </button>
          {mode==="login"&&view==="auth"&&(
            <button onClick={()=>{setView("forgot");setForgotError("");}}
              style={{width:"100%",marginTop:12,background:"transparent",border:"none",color:"#0284c7",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              Forgot password?
            </button>
          )}
          {view==="forgot"&&(
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:8}}>Reset your password</div>
              <div style={{fontSize:13,color:"#475569",marginBottom:16}}>
                We'll send a reset link to <strong>{email}</strong>
              </div>
              {forgotError&&(
                <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#dc2626",marginBottom:12}}>
                  {forgotError}
                </div>
              )}
              <button onClick={handleForgotPassword} disabled={forgotLoading}
                style={{width:"100%",padding:"13px 0",background:"#d97706",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                {forgotLoading?"Sending...":"Send Reset Link"}
              </button>
              <button onClick={()=>setView("auth")}
                style={{width:"100%",marginTop:10,background:"transparent",border:"none",color:"#64748b",fontSize:13,cursor:"pointer"}}>
                Back to login
              </button>
            </div>
          )}
          {view==="resetSent"&&(
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:8}}>Check your email</div>
              <div style={{fontSize:13,color:"#475569",marginBottom:16}}>
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
              </div>
              <button onClick={()=>setView("auth")}
                style={{width:"100%",padding:"13px 0",background:"#0891b2",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                Back to login
              </button>
            </div>
          )}
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#1e293b"}}>🔒 Secured by {company?.company_name||company?.company_name||company?.company_name||"Magnus Boys Construction"}</div>
    </div>
  </div>;
}

// ---- Contract viewing (read-only) ----------------------------------------------------------
// The contract's terms as a "paper" document. Empty fields are skipped, long text keeps its line
// breaks, and the internal `notes` field is never shown. Used by the Read contract viewer and by
// the read-first step of the signing flow.
// The contract's payment schedule comes from the session-validated get_portal_contract_schedule
// function (the table itself is never read from the browser). Any failure just means "no schedule":
// nothing is shown and no error is surfaced to the client.
function useContractSchedule(contractId:string|undefined,sessionToken:string|null):any[]{
  const [rows,setRows]=useState<any[]>([]);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        if(!contractId||!sessionToken){if(!cancelled)setRows([]);return;}
        const {data,error}=await supabase.rpc("get_portal_contract_schedule",{p_session_token:sessionToken,p_contract_id:contractId});
        if(error||!Array.isArray(data)){if(!cancelled)setRows([]);return;}
        const sorted=[...data].sort((a:any,b:any)=>(Number(a?.sort_order)||0)-(Number(b?.sort_order)||0));
        if(!cancelled)setRows(sorted);
      }catch{if(!cancelled)setRows([]);}
    })();
    return()=>{cancelled=true;};
  },[contractId,sessionToken]);
  return rows;
}

function ContractTerms({contract,company,client,schedule}:{contract:any;company:Co|null;client:any;schedule?:any[]}) {
  const rows=contractSummaryRows(contract);
  const sections=contractLongSections(contract);
  const pay=sections.find(s=>s.key==="payment_terms");
  const rest=sections.filter(s=>s.key!=="payment_terms");
  const contact=[company?.address_line1,company?.phone,company?.email].filter(Boolean).join(" · ");
  const block=(s:{key:string;title:string;text:string})=><div key={s.key} style={{marginTop:18}}>
    <div style={{fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#374151",borderBottom:"1px solid #e5e7eb",paddingBottom:4,marginBottom:8}}>{s.title}</div>
    <div style={{fontSize:13,lineHeight:1.7,color:"#374151",whiteSpace:"pre-wrap"}}>{s.text}</div>
  </div>;
  return <div style={{background:"#ffffff",color:"#1a1a1a",fontFamily:"Georgia,serif",border:"1px solid #e2e8f0",borderRadius:12,padding:"22px 22px 26px"}}>
    <div style={{textAlign:"center",marginBottom:14}}>
      <div style={{fontSize:15,fontWeight:800}}>{company?.company_name||"Magnus Boys Construction"}</div>
      {contact&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{contact}</div>}
    </div>
    <div style={{textAlign:"center",fontSize:10,letterSpacing:3,color:"#94a3b8",fontWeight:700}}>CONTRACT</div>
    <div style={{textAlign:"center",fontSize:19,fontWeight:800,margin:"4px 0"}}>{contract.contract_name}</div>
    <div style={{textAlign:"center",fontSize:12,color:"#64748b",marginBottom:16}}>Prepared for {client?.contact_name||client?.name||"you"}</div>
    {rows.length>0&&<table style={{width:"100%",borderCollapse:"collapse"}}><tbody>
      {rows.map(r=><tr key={r.label}>
        <td style={{padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,width:150,verticalAlign:"top"}}>{r.label}</td>
        <td style={{padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:13}}>{r.value}</td>
      </tr>)}
    </tbody></table>}
    {pay&&block(pay)}
    {schedule&&schedule.length>0&&<div style={{marginTop:18}}>
      <div style={{fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#374151",borderBottom:"1px solid #e5e7eb",paddingBottom:4,marginBottom:8}}>Payment schedule</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:420}}>
          <thead><tr>
            {[["Milestone","left"],["Due date","left"],["Amount","right"],["% complete","right"]].map(([h,a])=><th key={h} style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",padding:"6px 8px",borderBottom:"1px solid #e2e8f0",textAlign:a as "left"|"right",whiteSpace:"nowrap"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {schedule.map((p:any,i:number)=><tr key={p.id||i}>
              <td style={{padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:13,verticalAlign:"top"}}><div style={{fontWeight:700}}>{p.milestone_name}</div>{p.milestone_description&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{p.milestone_description}</div>}</td>
              <td style={{padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:12,verticalAlign:"top",whiteSpace:"nowrap"}}>{fmtDate(p.due_date||null)}</td>
              <td style={{padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:13,fontWeight:700,textAlign:"right",verticalAlign:"top",whiteSpace:"nowrap"}}>{fmt(Number(p.amount)||0)}</td>
              <td style={{padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:12,textAlign:"right",verticalAlign:"top"}}>{p.percent_complete===null||p.percent_complete===undefined||p.percent_complete===""?"":`${Number(p.percent_complete)||0}%`}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}
    {rest.map(block)}
  </div>;
}

// Signature images with their signed date and time (Jamaica), for whichever side has signed.
function ContractSignatures({contract}:{contract:any}) {
  const sides=[
    {label:"Contractor",at:contract.contractor_signed_at,url:contract.contractor_signature_url},
    {label:"You",at:contract.client_signed_at,url:contract.client_signature_url},
  ].filter(s=>s.at);
  if(sides.length===0)return null;
  return <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:12,padding:"16px 22px",marginTop:12}}>
    <div style={{fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#374151",marginBottom:10}}>Signatures</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:20}}>
      {sides.map(s=><div key={s.label}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{s.label}</div>
        {s.url&&<img src={s.url} alt={`${s.label} signature`} style={{maxHeight:70,maxWidth:"100%",objectFit:"contain",display:"block",marginBottom:4}}/>}
        <div style={{borderTop:"1px solid #cbd5e1",paddingTop:5,fontSize:11,color:"#475569"}}>Signed {formatJamaicaDateTimeFull(s.at)}</div>
      </div>)}
    </div>
  </div>;
}

// Read-only contract viewer. A Print / Save as PDF button is offered ONLY once the client has
// signed; an unsigned contract cannot be printed or downloaded from here.
function PortalContractViewer({contract,company,client,sessionToken,onClose}:{contract:any;company:Co|null;client:any;sessionToken:string|null;onClose:()=>void}) {
  const signed=!!contract.client_signed_at;
  const schedule=useContractSchedule(contract.id,sessionToken);
  function printCopy(){
    try{
      openPrintWindow(buildPortalContractHtml({contract,company,clientName:client?.contact_name||client?.name||"",schedule}),{title:`${contract.contract_number||"Contract"} - ${contract.contract_name||""}`});
    }catch{alert("Could not open the print window. Please allow pop-ups for this site and try again.");}
  }
  return <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#f8fafc",borderRadius:16,width:"100%",maxWidth:720,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"14px 18px",borderBottom:"1px solid #e2e8f0"}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>Contract</div>
          <div style={{fontSize:11,color:"#64748b"}}>{contract.contract_name}{contract.contract_number?` · #${contract.contract_number}`:""}</div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",fontSize:22,lineHeight:1,color:"#64748b",cursor:"pointer",padding:4}}>×</button>
      </div>
      <div style={{flex:1,minHeight:0,overflowY:"auto",padding:16}}>
        <ContractTerms contract={contract} company={company} client={client} schedule={schedule}/>
        <ContractSignatures contract={contract}/>
      </div>
      <div style={{display:"flex",gap:8,padding:"12px 18px",borderTop:"1px solid #e2e8f0"}}>
        {signed&&<button onClick={printCopy} style={{flex:1.4,padding:"11px 0",background:"#0891b2",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Print / Save as PDF</button>}
        <button onClick={onClose} style={{flex:1,padding:"11px 0",background:"#ffffff",border:"1px solid #cbd5e1",borderRadius:10,color:"#475569",fontSize:13,fontWeight:600,cursor:"pointer"}}>Close</button>
      </div>
    </div>
  </div>;
}

function SignatureModal({contract,client,company,sessionToken,saving,onSign,onCancel}:{contract:any;client:any;company?:any;sessionToken?:string|null;saving:boolean;onSign:(dataUrl:string)=>void;onCancel:()=>void}){
  const canvasRef=React.useRef<HTMLCanvasElement|null>(null);
  const [hasDrawn,setHasDrawn]=React.useState(false);
  const [mode,setMode]=React.useState<"draw"|"upload">("draw");
  const [uploadPreview,setUploadPreview]=React.useState<string|null>(null);
  const drawing=React.useRef(false);
  // The contract is read first, then signed; Submit stays disabled until the agreement box is ticked.
  const [step,setStep]=React.useState<"read"|"sign">("read");
  const [agreed,setAgreed]=React.useState(false);
  const schedule=useContractSchedule(contract?.id,sessionToken||null);

  function getPos(e:any,canvas:HTMLCanvasElement){
    const rect=canvas.getBoundingClientRect();
    const clientX=e.touches?e.touches[0].clientX:e.clientX;
    const clientY=e.touches?e.touches[0].clientY:e.clientY;
    return{x:clientX-rect.left,y:clientY-rect.top};
  }
  function start(e:any){
    drawing.current=true;
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d"); if(!ctx)return;
    const{x,y}=getPos(e,canvas);
    ctx.beginPath();ctx.moveTo(x,y);
  }
  function move(e:any){
    if(!drawing.current)return;
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d"); if(!ctx)return;
    const{x,y}=getPos(e,canvas);
    ctx.lineTo(x,y);ctx.strokeStyle="#1a1a1a";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.stroke();
    setHasDrawn(true);
  }
  function end(){drawing.current=false;}
  function clear(){
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d"); if(!ctx)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    setHasDrawn(false);
  }
  function submit(){
    if(mode==="upload"&&uploadPreview){onSign(uploadPreview);return;}
    const canvas=canvasRef.current; if(!canvas||!hasDrawn)return;
    onSign(canvas.toDataURL("image/png"));
  }
  function handleUpload(e:any){
    const f=e.target.files?.[0]; if(!f)return;
    const reader=new FileReader();
    reader.onload=ev=>{if(ev.target?.result)setUploadPreview(ev.target.result as string);};
    reader.readAsDataURL(f);
  }

  const canSubmit=(mode==="draw"?hasDrawn:!!uploadPreview)&&agreed;

  if(step==="read")return(
    <div style={{background:"#0d1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,padding:20,width:"100%",maxWidth:700,maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
      <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>Read Contract</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Please read the whole contract before you sign it.</div>
      <div style={{flex:1,minHeight:0,overflowY:"auto",borderRadius:12}}>
        <ContractTerms contract={contract} company={company||null} client={client} schedule={schedule}/>
      </div>
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <button onClick={onCancel} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
        <button onClick={()=>setStep("sign")} style={{flex:1.4,padding:"10px 0",borderRadius:10,border:"none",background:"#22c55e",color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>Continue to sign</button>
      </div>
    </div>
  );

  return(
    <div style={{background:"#0d1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,padding:20,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>Sign Contract</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>{contract.contract_name} · {contract.contract_number}</div>

      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:12,marginBottom:14,maxHeight:160,overflowY:"auto",fontSize:11,color:"#94a3b8",lineHeight:1.6}}>
        By signing below, I, <strong style={{color:"#f1f5f9"}}>{client?.contact_name||client?.name}</strong>, agree to the terms, payment schedule, and scope of work outlined in this contract.
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={()=>{setMode("draw");setUploadPreview(null);}} style={{flex:1,padding:"8px 0",borderRadius:10,border:"1px solid",fontSize:12,fontWeight:700,cursor:"pointer",background:mode==="draw"?"#3b82f6":"transparent",borderColor:mode==="draw"?"#3b82f6":"rgba(255,255,255,0.1)",color:mode==="draw"?"#fff":"#94a3b8"}}>✍ Draw Signature</button>
        <button onClick={()=>{setMode("upload");clear();}} style={{flex:1,padding:"8px 0",borderRadius:10,border:"1px solid",fontSize:12,fontWeight:700,cursor:"pointer",background:mode==="upload"?"#3b82f6":"transparent",borderColor:mode==="upload"?"#3b82f6":"rgba(255,255,255,0.1)",color:mode==="upload"?"#fff":"#94a3b8"}}>📷 Upload / Camera</button>
      </div>

      {mode==="draw"&&<>
        <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Draw your signature below:</div>
        <canvas ref={canvasRef} width={360} height={140}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{width:"100%",height:140,background:"white",borderRadius:10,border:"2px dashed rgba(255,255,255,0.15)",touchAction:"none",cursor:"crosshair"}}/>
      </>}

      {mode==="upload"&&<>
        <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Take a photo of your signature or upload an image:</div>
        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:20,borderRadius:12,border:"2px dashed rgba(255,255,255,0.15)",cursor:"pointer",background:"rgba(255,255,255,0.02)",minHeight:120}}>
          {uploadPreview
            ?<img src={uploadPreview} style={{maxHeight:120,maxWidth:"100%",borderRadius:8,objectFit:"contain"}}/>
            :<><div style={{fontSize:32}}>📷</div><div style={{fontSize:12,color:"#64748b",textAlign:"center"}}>Tap to take photo or choose file<br/><span style={{fontSize:11,color:"#334155"}}>JPG, PNG accepted</span></div></>}
          <input type="file" accept="image/*" capture="environment" onChange={handleUpload} style={{display:"none"}}/>
        </label>
        {uploadPreview&&<button onClick={()=>setUploadPreview(null)} style={{marginTop:8,width:"100%",padding:"6px 0",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",background:"transparent",color:"#ef4444",fontSize:12,cursor:"pointer"}}>Remove Photo</button>}
      </>}

      <label style={{display:"flex",alignItems:"flex-start",gap:8,marginTop:14,fontSize:12,color:"#cbd5e1",lineHeight:1.5,cursor:"pointer"}}>
        <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{marginTop:2,width:16,height:16,accentColor:"#22c55e",cursor:"pointer"}}/>
        <span>I have read and agree to this contract</span>
      </label>
      <button onClick={()=>setStep("read")} style={{marginTop:8,background:"none",border:"none",padding:0,color:"#60a5fa",fontSize:11,cursor:"pointer"}}>&larr; Read the contract again</button>

      <div style={{display:"flex",gap:8,marginTop:14}}>
        {mode==="draw"&&<button onClick={clear} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer"}}>Clear</button>}
        <button onClick={onCancel} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
        <button onClick={submit} disabled={!canSubmit||saving} style={{flex:1.4,padding:"10px 0",borderRadius:10,border:"none",background:canSubmit?"#22c55e":"rgba(255,255,255,0.06)",color:canSubmit?"white":"#475569",fontSize:13,fontWeight:700,cursor:canSubmit?"pointer":"not-allowed"}}>{saving?"Saving…":"Sign & Submit"}</button>
      </div>
    </div>
  );
}

// Contract signing goes through the portal-sign-contract edge function, which only accepts a small
// PNG. The drawn signature is already one; a photo uploaded from a phone (any image type, often
// several MB) is redrawn smaller as a PNG first. If that fails the original is sent unchanged
// and the server explains what is wrong.
async function normalizeSignature(dataUrl:string):Promise<string>{
  try{
    if(dataUrl.startsWith("data:image/png")&&dataUrl.length<600000)return dataUrl;
    const img=await new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("image"));i.src=dataUrl;});
    const scale=Math.min(1,800/Math.max(img.width,img.height));
    const cv=document.createElement("canvas");
    cv.width=Math.max(1,Math.round(img.width*scale));cv.height=Math.max(1,Math.round(img.height*scale));
    const ctx=cv.getContext("2d");
    if(!ctx)return dataUrl;
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,cv.width,cv.height);
    ctx.drawImage(img,0,0,cv.width,cv.height);
    return cv.toDataURL("image/png");
  }catch{return dataUrl;}
}

export default function ClientPortalPage() {
  // Two distinct, unrelated ways to arrive here: /portal/:token is the
  // magic-link flow (token compared against clients.portal_token — an
  // intentional separate feature, left as-is below); /client-portal/session/
  // :sessionToken is the email+password flow from ClientLoginPage.tsx,
  // compared against client_portal_sessions.session_token instead. They
  // used to collide on one route (/client-portal/:clientId) with a param
  // named "token" that the session flow never actually populated correctly.
  const {token}=useParams<{token:string}>();
  const {sessionToken}=useParams<{sessionToken:string}>();
  const [authState,setAuthState]=useState<AuthState>("loading");
  const [client,setClient]=useState<Client|null>(null);
  // The real credential client_comments' new RPC functions validate —
  // NOT the magic-link `token` param. Both login paths (magic-link and
  // email+password) converge on a client_portal_sessions.session_token
  // before loadData() ever runs; see the lock-down migration's own header
  // comment for the full reasoning. Threaded through explicitly to
  // loadData() at every call site below rather than read from this state
  // inside loadData() itself, to avoid a stale-closure read immediately
  // after the setState call that establishes it.
  const [portalSessionToken,setPortalSessionToken]=useState<string|null>(null);
  const [project,setProject]=useState<Project|null>(null);
  const [company,setCompany]=useState<Co|null>(null);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [changes,setChanges]=useState<ChangeOrder[]>([]);
  const [comments,setComments]=useState<Comment[]>([]);
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [contracts,setContracts]=useState<any[]>([]);
  const [estimates,setEstimates]=useState<any[]>([]);
  const [signingContract,setSigningContract]=useState<any|null>(null);
  const [savingSignature,setSavingSignature]=useState(false);
  const [viewingContract,setViewingContract]=useState<any|null>(null);
  const [tab,setTab]=useState<Tab>("overview");
  const [progress,setProgress]=useState(0);
  const [newComment,setNewComment]=useState("");
  const [rating,setRating]=useState(0);
  const [reviewText,setReviewText]=useState("");
  const [reviewSubmitted,setReviewSubmitted]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:"success"|"error"}|null>(null);
  const [lightbox,setLightbox]=useState<Photo|null>(null);
  const [respondingTo,setRespondingTo]=useState<string|null>(null);
  const [errorMsg,setErrorMsg]=useState("");
  const [dailyLogs,setDailyLogs]=useState<any[]>([]);
  const [logsLoading,setLogsLoading]=useState(true);
  const [sitePhotos,setSitePhotos]=useState<any[]>([]);
  const [photosLoading,setPhotosLoading]=useState(true);
  const [selectedPhoto,setSelectedPhoto]=useState<any|null>(null);

  useEffect(()=>{
    if(sessionToken)checkAuthViaSession(sessionToken);
    else if(token)checkAuth();
  },[token,sessionToken]);

  // Portal activity logging (client_portal_activity) — fire-and-forget, see
  // src/lib/portalActivity.ts. These effects only observe existing state; they
  // never change it, and skip the initial render (no session token yet).
  useEffect(()=>{
    if(portalSessionToken)logPortalEvent(portalSessionToken,"tab_view",{entityType:"tab",entityId:tab});
  },[tab]);
  useEffect(()=>{
    if(lightbox)logPortalEvent(portalSessionToken,"photo_view",{entityType:"photo",entityId:lightbox.id,projectId:project?.id});
  },[lightbox]);
  useEffect(()=>{
    if(selectedPhoto)logPortalEvent(portalSessionToken,"photo_view",{entityType:"photo",entityId:selectedPhoto.id,projectId:project?.id});
  },[selectedPhoto]);
  useEffect(()=>{
    if(signingContract)logPortalEvent(portalSessionToken,"contract_view",{entityType:"contract",entityId:signingContract.id,projectId:project?.id});
  },[signingContract]);
  useEffect(()=>{
    if(viewingContract)logPortalEvent(portalSessionToken,"contract_view",{entityType:"contract",entityId:viewingContract.id,projectId:viewingContract.project_id});
  },[viewingContract]);
  // Item-level views: when a tab is opened, log a view for each item it lists. The database
  // already skips repeats within 30 minutes; the id-key deps only stop a re-fire on every render.
  useEffect(()=>{
    if(tab==="invoices"&&portalSessionToken)invoices.slice(0,20).forEach((inv:any)=>logPortalEvent(portalSessionToken,"invoice_view",{entityType:"invoice",entityId:inv.id,projectId:inv.project_id}));
  },[tab,invoices.map((i:any)=>i.id).join(",")]);
  useEffect(()=>{
    if(tab==="estimates"&&portalSessionToken)estimates.slice(0,20).forEach((es:any)=>logPortalEvent(portalSessionToken,"estimate_view",{entityType:"estimate",entityId:es.id,projectId:es.project_id}));
  },[tab,estimates.map((e:any)=>e.id).join(",")]);
  useEffect(()=>{
    if(tab==="contracts"&&portalSessionToken)contracts.slice(0,20).forEach((ct:any)=>logPortalEvent(portalSessionToken,"contract_view",{entityType:"contract",entityId:ct.id,projectId:ct.project_id}));
  },[tab,contracts.map((c:any)=>c.id).join(",")]);

  // Session-URL route (email+password login from ClientLoginPage.tsx): the session token in the
  // URL is validated AND everything the page shows is loaded by ONE server call, get_portal_data.
  // No direct table reads happen from the browser any more.
  async function checkAuthViaSession(sessTok: string) {
    setAuthState("loading");
    try {
      const {data:d,error:dErr}=await supabase.rpc("get_portal_data",{p_session_token:sessTok});
      if(dErr||!d){setErrorMsg("This session has expired. Please sign in again.");setAuthState("error");return;}
      setPortalSessionToken(sessTok);
      logPortalEvent(sessTok,"session_resume");
      await loadData(d.client,sessTok,d);
      setAuthState("authenticated");
    } catch {setErrorMsg("Something went wrong.");setAuthState("error");}
  }

  // /portal/:token magic-link flow. get_portal_link_info identifies the client and says whether
  // this is a first-time setup or a login (it never returns anything secret); a stored session
  // is then resumed by asking get_portal_data, which returns null unless the session is valid.
  async function checkAuth() {
    setAuthState("loading");
    try {
      const {data:info}=await supabase.rpc("get_portal_link_info",{p_portal_token:token});
      if(!info||!info.client){setErrorMsg("This portal link is invalid or has been disabled.");setAuthState("error");return;}
      setClient(info.client);
      setCompany({company_name:null,logo_url:null,phone:null,email:null,address_line1:null,...(info.company||{})} as Co);
      const sess=localStorage.getItem(`portal_${info.client.id}`);
      if(sess){
        const {data:d}=await supabase.rpc("get_portal_data",{p_session_token:sess});
        if(d&&d.client?.id===info.client.id){setPortalSessionToken(sess);logPortalEvent(sess,"session_resume");await loadData(d.client,sess,d);setAuthState("authenticated");return;}
      }
      setAuthState((info.mode||(info.client.portal_activated_at?"login":"setup"))==="setup"?"setup":"login");
    } catch {setErrorMsg("Something went wrong.");setAuthState("error");}
  }

  // Puts one get_portal_data payload into state: client, company, project, progress, photos,
  // site updates and change orders. Photo URLs are built from photo_url exactly as before.
  // As before, the project-scoped lists are only touched when the client has a project.
  function applyPortalData(d:any,fallback?:Client){
    setClient(d.client||fallback||null);
    setCompany(d.company||null);
    const proj=d.project||null;
    setProject(proj);
    if(proj){
      const newest=(a:any,b:any)=>String(b.created_at||"").localeCompare(String(a.created_at||""));
      const ph=[...(d.photos||[])].sort(newest);
      setPhotos(ph.map((photo:any)=>{
        const{data:urlData}=supabase.storage.from("project-photos").getPublicUrl(photo.photo_url);
        return{...photo,url:urlData.publicUrl};
      }));
      setSitePhotos(ph.slice(0,20).map((photo:any)=>{
        const{data:urlData}=supabase.storage.from("project-photos").getPublicUrl(photo.photo_url);
        return{...photo,publicUrl:urlData.publicUrl};
      }));
      setDailyLogs([...(d.daily_logs||[])].sort((a:any,b:any)=>String(b.log_date||"").localeCompare(String(a.log_date||""))).slice(0,10));
      setChanges([...(d.change_orders||[])].sort(newest));
      setProgress(Math.round(Number(d.progress_pct)||0));
      setLogsLoading(false);
      setPhotosLoading(false);
    }
  }

  async function loadData(c:Client,sessionTok:string,prefetched?:any) {
    try {
      const d=prefetched??(await supabase.rpc("get_portal_data",{p_session_token:sessionTok})).data;
      if(!d)return;
      applyPortalData(d,c);
      const proj=d.project||null;
      const {data:cm,error:cmErr}=await supabase.rpc("get_portal_comments",{p_session_token:sessionTok});
      if(cmErr)console.error("get_portal_comments failed:",cmErr);
      setComments(cm||[]);
      // Shared estimates come back per client, so this sits outside the if(proj) block.
      try{
        const {data:es,error:esErr}=await supabase.rpc("get_portal_estimates",{p_session_token:sessionTok});
        if(esErr)console.error("get_portal_estimates failed:",esErr);
        setEstimates(Array.isArray(es)?es:[]);
      }catch(e){console.error("get_portal_estimates failed:",e);}
      // Contracts the contractor has sent (per client, like estimates), so also outside if(proj).
      try{
        const {data:cts,error:ctErr}=await supabase.rpc("get_portal_contracts",{p_session_token:sessionTok});
        if(ctErr)console.error("get_portal_contracts failed:",ctErr);
        else setContracts(Array.isArray(cts)?cts:[]);
      }catch(e){console.error("get_portal_contracts failed:",e);}
      if(proj){
        const inv=await supabase.rpc("get_portal_invoices",{p_session_token:sessionTok});
        setInvoices(inv.data||[]);
        if(inv.error)console.error("get_portal_invoices failed:",inv.error);
      }
    } catch(e){console.error(e);}
  }

  async function onAuthSuccess(){
    // AuthScreen already wrote the freshly-minted session token to localStorage under this
    // client's key immediately before calling onSuccess(), so it is present here, not a race.
    const sessTok=client?localStorage.getItem(`portal_${client.id}`):null;
    if(sessTok){
      const {data:d}=await supabase.rpc("get_portal_data",{p_session_token:sessTok});
      if(d){setPortalSessionToken(sessTok);await loadData(d.client,sessTok,d);}
    }
    setAuthState("authenticated");
    setToast({msg:"Welcome to your project portal!",type:"success"});
  }
  async function submitComment(){
    if(!newComment.trim()||!client||!portalSessionToken) return;

    // Replaces the direct client_comments INSERT — client_id is never
    // sent from the browser now; the RPC derives it server-side from the
    // validated session, same as get_portal_comments above.
    const { error } = await supabase.rpc("insert_portal_comment", {
      p_session_token: portalSessionToken,
      p_project_id: project?.id || null,
      p_message: newComment,
    });

    if (error) {
      setToast({ msg: "Failed to send message. Please try again.", type: "error" });
      console.error("insert_portal_comment error:", error);
      return;
    }

    setNewComment("");
    logPortalEvent(portalSessionToken,"comment_sent",{projectId:project?.id});
    setToast({ msg: "Message sent!", type: "success" });
    loadData(client,portalSessionToken);
  }

  async function submitReview(){
    if(!rating||!client||!project)return;
    try{
      if(!portalSessionToken)throw new Error("Your session has expired. Please sign in again.");
      const {error}=await supabase.rpc("submit_portal_review",{p_session_token:portalSessionToken,p_project_id:project.id,p_rating:rating,p_comment:reviewText});
      if(error)throw new Error(error.message);
      setReviewSubmitted(true);setToast({msg:"Thank you for your review!",type:"success"});
    }catch(e:any){setToast({msg:e?.message||"Could not submit your review. Please try again.",type:"error"});}
  }
  function getWeatherEmoji(desc:string) {
    if(!desc)return"🌤️";
    const d=desc.toLowerCase();
    if(d.includes("sun")||d.includes("clear"))return"☀️";
    if(d.includes("cloud"))return"⛅";
    if(d.includes("rain")||d.includes("shower"))return"🌧️";
    if(d.includes("storm")||d.includes("thunder"))return"⛈️";
    if(d.includes("wind"))return"💨";
    if(d.includes("fog")||d.includes("mist"))return"🌫️";
    return"🌤️";
  }

  async function downloadPhoto(photo:any,e:React.MouseEvent) {
    e.stopPropagation();
    try {
      // Photos are public URLs (that is how they are displayed), so fetch the image directly.
      const src=photo.publicUrl||photo.url||photo.public_url;
      const resp=src?await fetch(src):null;
      if(!resp||!resp.ok){alert("Failed to download photo.");return;}
      const data=await resp.blob();
      const url=URL.createObjectURL(data);
      const a=document.createElement("a");
      a.href=url;
      a.download=photo.caption?`${photo.caption.replace(/\s+/g,"-")}.jpg`:`site-photo-${photo.id}.jpg`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logPortalEvent(portalSessionToken,"photo_download",{entityType:"photo",entityId:photo.id,projectId:project?.id});
    } catch {alert("Failed to download photo.");}
  }

  // Approve / reject a change order through the server function, which checks the order is this
  // client's and still unanswered, and logs change_approve / change_reject itself.
  async function respondChange(id:string,resp:"approved"|"rejected"){
    setRespondingTo(id);
    try{
      if(!portalSessionToken)throw new Error("Your session has expired. Please sign in again.");
      const {data,error}=await supabase.rpc("respond_portal_change_order",{p_session_token:portalSessionToken,p_change_order_id:id,p_response:resp});
      if(error)throw new Error(error.message);
      setChanges(prev=>prev.map(c=>c.id===id?{...c,status:resp,...(data&&typeof data==="object"?data:{})}:c));
      setToast({msg:resp==="approved"?"Change approved!":"Change rejected.",type:resp==="approved"?"success":"error"});
    }catch(e:any){setToast({msg:e?.message||"Could not save your response. Please try again.",type:"error"});}
    finally{setRespondingTo(null);}
  }

  // Sign out: end the session on the server (portal_logout logs "logout" and deletes the
  // session row), fire-and-forget, then clear it locally exactly as before.
  function signOut(){
    try{
      if(portalSessionToken)void Promise.resolve(supabase.rpc("portal_logout",{p_session_token:portalSessionToken})).then(()=>{},()=>{});
    }catch{}
    if(client)localStorage.removeItem(`portal_${client.id}`);
    setAuthState("login");
  }
  const totalInvoiced=invoices.reduce((s,i)=>s+Number(i.total_amount||0),0);
  const totalPaid=invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.total_amount||0),0);
  const balanceDue=totalInvoiced-totalPaid;
  const pendingChanges=changes.filter(c=>c.status==="pending").length;

  const G=`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box} body{margin:0} input::placeholder,textarea::placeholder{color:#94a3b8} input:focus,textarea:focus{border-color:#0891b2!important} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}`;

  if(authState==="loading")return <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{G}</style><div style={{textAlign:"center"}}><div style={{width:44,height:44,border:"3px solid #0891b2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/><p style={{color:"#64748b",fontSize:14}}>Loading portal…</p></div></div>;

  if(authState==="error")return <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><style>{G}</style><div style={{textAlign:"center",maxWidth:360}}><div style={{fontSize:52,marginBottom:14}}>🔒</div><h2 style={{color:"#0f172a",fontSize:20,fontWeight:700,marginBottom:8}}>Access Denied</h2><p style={{color:"#64748b",fontSize:14,lineHeight:1.6}}>{errorMsg}</p></div></div>;

  if(authState==="setup"||authState==="login")return <><style>{G}</style><AuthScreen client={client!} company={company} mode={authState} token={token!} onSuccess={onAuthSuccess}/></>;

  if(!client||authState!=="authenticated")return null;

  const sColor:Record<string,string>={active:"#22c55e",planning:"#3b82f6",on_hold:"#f59e0b",completed:"#94a3b8",cancelled:"#ef4444"};
  const TABS=[{id:"overview",label:"Overview",emoji:"📋"},...(estimates.length?[{id:"estimates",label:"Estimates",emoji:"📐",badge:estimates.length}]:[]),{id:"contracts",label:"Contracts",emoji:"📝",badge:contracts.filter((c:any)=>!c.client_signed_at).length||undefined},{id:"photos",label:"Photos",emoji:"📸",badge:photos.length||undefined},{id:"invoices",label:"Invoices",emoji:"🧾",badge:invoices.filter(i=>i.status!=="paid").length||undefined},{id:"changes",label:"Changes",emoji:"⚠️",badge:pendingChanges||undefined},{id:"feedback",label:"Feedback",emoji:"⭐"}] as const;

  return <div style={{minHeight:"100vh",background:"#f8fafc",color:"#0f172a",fontFamily:"system-ui,sans-serif"}}>
    <style>{G}</style>

    <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(248,250,252,0.95)",backdropFilter:"blur(16px)",borderBottom:"1px solid #e2e8f0"}}>
      <div style={{maxWidth:860,margin:"0 auto",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {company?.logo_url?<img src={company.logo_url} style={{width:34,height:34,borderRadius:8,objectFit:"cover"}}/>
            :<div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#0891b2,#06b6d4)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"#fff"}}>{(company?.company_name||"M")[0]}</div>}
          <div>
            <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{company?.company_name||company?.company_name||company?.company_name||"Magnus Boys Construction"}</div>
            <div style={{fontSize:10,color:"#64748b"}}>Client Portal</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#0f172a"}}>{client.contact_name||client.name}</div>
            <div style={{fontSize:10,color:"#64748b"}}>{client.portal_email||client.email}</div>
          </div>
          <button onClick={signOut} style={{padding:"6px 12px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,color:"#475569",fontSize:11,cursor:"pointer",fontWeight:600}}>Sign Out</button>
        </div>
      </div>
    </div>

    <div style={{maxWidth:860,margin:"0 auto",padding:"20px 20px 60px",display:"flex",flexDirection:"column",gap:16}}>

      <div style={{background:"linear-gradient(135deg,#eff6ff,#ecfeff)",border:"1px solid #bae6fd",borderRadius:20,padding:"22px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",animation:"fadeIn 0.4s ease"}}>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:10,color:"#0284c7",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Your Project</div>
          <h1 style={{fontSize:24,fontWeight:800,color:"#0f172a",margin:"0 0 6px"}}>{project?.name||"No project assigned"}</h1>
          {project?.site_address&&<div style={{fontSize:12,color:"#64748b",marginBottom:10}}>📍 {project.site_address}</div>}
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {project?.status&&<span style={{fontSize:11,padding:"4px 12px",borderRadius:20,fontWeight:700,background:`${sColor[project.status]||"#3b82f6"}18`,color:sColor[project.status]||"#3b82f6",border:`1px solid ${sColor[project.status]||"#3b82f6"}40`,textTransform:"capitalize"}}>● {project.status.replace("_"," ")}</span>}
            {project?.start_date&&<span style={{fontSize:11,color:"#475569"}}>Started {fmtDate(project.start_date)}</span>}
            {project?.end_date&&<span style={{fontSize:11,color:"#475569"}}>Est. done {fmtDate(project.end_date)}</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <div style={{position:"relative",width:72,height:72}}>
            <ProgressRing pct={progress}/>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#0f172a"}}>{progress}%</div>
          </div>
          <div style={{fontSize:10,color:"#475569"}}>Complete</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[{l:"Paid",v:fmt(totalPaid),c:"#22c55e"},{l:"Balance Due",v:fmt(balanceDue),c:balanceDue>0?"#ef4444":"#22c55e"},{l:"Pending",v:`${pendingChanges}`,c:pendingChanges>0?"#f59e0b":"#64748b"}].map((s,i)=>(
          <div key={i} style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:14,padding:"14px 16px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:10,color:"#475569",marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as Tab)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:12,border:"1px solid",fontSize:13,fontWeight:600,whiteSpace:"nowrap",cursor:"pointer",transition:"all 0.2s",background:tab===t.id?"#0891b2":"#f1f5f9",borderColor:tab===t.id?"#0891b2":"#e2e8f0",color:tab===t.id?"#fff":"#64748b"}}>
            {t.emoji} {t.label}
            {"badge" in t && t.badge?<span style={{fontSize:10,padding:"1px 6px",borderRadius:10,background:tab===t.id?"rgba(255,255,255,0.25)":"#dbeafe",color:tab===t.id?"#fff":"#1d4ed8",fontWeight:700}}>{t.badge}</span>:null}
          </button>
        ))}
      </div>

      {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:14,animation:"fadeIn 0.3s ease"}}>
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:700,color:"#374151"}}>Project Progress</span>
            <span style={{fontSize:14,fontWeight:800,color:"#3b82f6"}}>{progress}%</span>
          </div>
          <div style={{height:8,background:"#e2e8f0",borderRadius:8,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#3b82f6,#06b6d4)",borderRadius:8,transition:"width 1.5s ease"}}/>
          </div>
        </div>
        {/* Daily Logs */}
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:14}}>📋 Site Updates</div>
          {logsLoading?(
            <div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8",fontSize:13}}>Loading...</div>
          ):dailyLogs.length===0?(
            <div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8",fontSize:13}}>No site updates yet</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {dailyLogs.map(log=>(
                <div key={log.id} style={{padding:"14px 16px",borderRadius:12,background:"#f8fafc",border:"1px solid #f1f5f9"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{getWeatherEmoji(log.weather||log.weather_condition||"")}</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#374151"}}>
                        {fmtLogDay(log.log_date)}
                      </span>
                    </div>
                    <span style={{fontSize:11,color:"#64748b"}}>👷 {log.workers_count??0} workers</span>
                  </div>
                  {log.work_performed&&<p style={{fontSize:13,color:"#475569",margin:"0 0 4px",lineHeight:1.6}}>{log.work_performed}</p>}
                  {log.deliveries&&<p style={{fontSize:11,color:"#94a3b8",margin:0}}>📦 {log.deliveries}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Site Photos */}
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:14}}>📸 Site Photos</div>
          {photosLoading?(
            <div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8",fontSize:13}}>Loading...</div>
          ):sitePhotos.length===0?(
            <div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8",fontSize:13}}>No photos yet</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
              {sitePhotos.map(photo=>(
                <div key={photo.id} style={{borderRadius:16,overflow:"hidden",border:"1px solid #e2e8f0",background:"#ffffff"}}>
                  <div onClick={()=>setSelectedPhoto(photo)} style={{aspectRatio:"1",overflow:"hidden",background:"#f1f5f9",cursor:"zoom-in"}}>
                    <img src={photo.publicUrl} alt={photo.caption||"Site photo"} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                  {photo.caption&&<div style={{padding:"4px 8px",borderTop:"1px solid #f1f5f9"}}><p style={{fontSize:11,color:"#64748b",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{photo.caption}</p></div>}
                  <div style={{borderTop:"1px solid #f1f5f9"}}>
                    <button onClick={(e)=>downloadPhoto(photo,e)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",background:"transparent",border:"none",fontSize:11,fontWeight:600,color:"#64748b",cursor:"pointer"}}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Photo Lightbox */}
        {selectedPhoto&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.90)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setSelectedPhoto(null)}>
            <button onClick={()=>setSelectedPhoto(null)} style={{position:"absolute",top:16,right:16,padding:8,borderRadius:"50%",background:"rgba(255,255,255,0.1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{position:"absolute",top:16,left:16}} onClick={e=>e.stopPropagation()}>
              <button onClick={(e)=>downloadPhoto(selectedPhoto,e)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,0.1)",border:"none",color:"#ffffff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>
            </div>
            <img src={selectedPhoto.publicUrl} alt={selectedPhoto.caption||"Site photo"} style={{maxWidth:"100%",maxHeight:"80vh",borderRadius:12,objectFit:"contain"}}/>
            {selectedPhoto.caption&&<div style={{position:"absolute",bottom:24,left:0,right:0,textAlign:"center"}}><span style={{fontSize:13,color:"#ffffff",background:"rgba(0,0,0,0.5)",padding:"6px 16px",borderRadius:20}}>{selectedPhoto.caption}</span></div>}
          </div>
        )}

        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:14}}>💬 Messages</div>
          {comments.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,maxHeight:280,overflowY:"auto"}}>
            {comments.map(c=>{
              const isStaff=c.sender_type==="staff";
              return <div key={c.id} style={{display:"flex",justifyContent:isStaff?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"75%",background:isStaff?"#0891b2":"#eff6ff",border:isStaff?"none":"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px"}}>
                  <p style={{fontSize:13,color:isStaff?"#fff":"#1e3a5f",margin:"0 0 4px",lineHeight:1.5}}>{c.message}</p>
                  <span style={{fontSize:10,color:isStaff?"#e0f2fe":"#475569"}}>{isStaff?"Contractor":"You"} · {timeAgo(c.created_at)}</span>
                </div>
              </div>;
            })}
          </div>}
          <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Send a message to your contractor…"
            style={{width:"100%",background:"#ffffff",border:"1px solid #cbd5e1",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#0f172a",resize:"none",height:76,outline:"none"}}/>
          <button onClick={submitComment} disabled={!newComment.trim()}
            style={{marginTop:10,padding:"10px 20px",background:newComment.trim()?"#0891b2":"#f1f5f9",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            Send Message
          </button>
        </div>
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:12}}>📞 Contact</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {company?.phone&&<a href={`tel:${company.phone}`} style={{fontSize:13,color:"#0284c7",textDecoration:"none"}}>📞 {company.phone}</a>}
            {company?.email&&<a href={`mailto:${company.email}`} style={{fontSize:13,color:"#0284c7",textDecoration:"none"}}>✉️ {company.email}</a>}
            {company?.address_line1&&<div style={{fontSize:13,color:"#64748b"}}>📍 {company.address_line1}</div>}
          </div>
        </div>
      </div>}
      {tab==="contracts"&&<div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn 0.3s ease"}}>
        {contracts.length===0
          ?<div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:48,textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>📝</div><p style={{color:"#64748b"}}>No contracts have been sent for signing yet.</p></div>
          :contracts.map((ct:any)=>
            <div key={ct.id} style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:12}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:4}}>{ct.contract_name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>#{ct.contract_number}</div>
                </div>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:ct.client_signed_at?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.15)",color:ct.client_signed_at?"#22c55e":"#f59e0b"}}>{ct.client_signed_at?"Signed":"Awaiting Signature"}</span>
              </div>
              {ct.scope_of_work&&<p style={{fontSize:12,color:"#64748b",margin:"0 0 14px",lineHeight:1.6}}>{ct.scope_of_work}</p>}
              <div style={{display:"flex",gap:8,paddingTop:12,borderTop:"1px solid #f1f5f9"}}>
                <div style={{flex:1,fontSize:11,padding:"6px 10px",borderRadius:8,textAlign:"center",fontWeight:600,background:ct.contractor_signed_at?"rgba(34,197,94,0.1)":"#f8fafc",color:ct.contractor_signed_at?"#22c55e":"#475569"}}>Contractor {ct.contractor_signed_at?"✓":"Pending"}</div>
                <div style={{flex:1,fontSize:11,padding:"6px 10px",borderRadius:8,textAlign:"center",fontWeight:600,background:ct.client_signed_at?"rgba(34,197,94,0.1)":"#f8fafc",color:ct.client_signed_at?"#22c55e":"#475569"}}>You {ct.client_signed_at?"✓ Signed":"Pending"}</div>
              </div>
              <button onClick={()=>setViewingContract(ct)} style={{width:"100%",marginTop:12,padding:"10px 0",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:12,color:"#0f172a",fontSize:13,fontWeight:700,cursor:"pointer"}}>Read contract</button>
              {!ct.client_signed_at&&ct.contractor_signed_at&&<button onClick={()=>setSigningContract(ct)} style={{width:"100%",marginTop:12,padding:"12px 0",background:"#22c55e",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Sign This Contract</button>}
              {!ct.contractor_signed_at&&<div style={{marginTop:12,padding:"10px 14px",background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10,fontSize:12,color:"#f59e0b"}}>Waiting for contractor signature before you can sign.</div>}
            </div>
          )
        }
        {viewingContract&&<PortalContractViewer contract={viewingContract} company={company} client={client} sessionToken={portalSessionToken} onClose={()=>setViewingContract(null)}/>}
        {signingContract&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <SignatureModal contract={signingContract} client={client} company={company} sessionToken={portalSessionToken} saving={savingSignature} onCancel={()=>setSigningContract(null)} onSign={async(dataUrl)=>{
            setSavingSignature(true);
            try{
              if(!portalSessionToken)throw new Error("Your session has expired. Please sign in again.");
              const signaturePng=await normalizeSignature(dataUrl);
              const{data:signed,error:signErr}=await supabase.functions.invoke("portal-sign-contract",{body:{sessionToken:portalSessionToken,contractId:signingContract.id,signaturePng}});
              if(signErr||signed?.error||!signed?.ok)throw new Error(await functionErrorMessage(signErr,signed,"Failed to save signature."));
              setContracts(prev=>prev.map(c=>c.id===signingContract.id?{...c,client_signed_at:signed.client_signed_at,client_signature_url:signed.client_signature_url}:c));
              setSigningContract(null);
              setToast({msg:"Contract signed successfully!",type:"success"});
            }catch(e:any){setToast({msg:e?.message||"Failed to save signature.",type:"error"});}
            finally{setSavingSignature(false);}
          }}/>
        </div>}
      </div>}

      {tab==="photos"&&<div style={{animation:"fadeIn 0.3s ease"}}>
        {photos.length===0?<div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:60,textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>📸</div><p style={{color:"#64748b"}}>No site photos yet.</p></div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
            {photos.map(p=><div key={p.id} onClick={()=>setLightbox(p)} style={{aspectRatio:"1",borderRadius:12,overflow:"hidden",background:"#f1f5f9",border:"1px solid #e2e8f0",cursor:"zoom-in",position:"relative"}}>
              <img src={p.url||p.public_url||p.publicUrl||""} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              {p.caption&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,0.75))",padding:"16px 8px 8px",fontSize:11,color:"#e2e8f0"}}>{p.caption}</div>}
            </div>)}
          </div>}
      </div>}

      {tab==="invoices"&&<div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn 0.3s ease"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[{l:"Total",v:fmt(totalInvoiced),c:"#0f172a"},{l:"Paid",v:fmt(totalPaid),c:"#22c55e"},{l:"Balance Due",v:fmt(balanceDue),c:balanceDue>0?"#ef4444":"#22c55e"}].map((s,i)=>(
            <div key={i} style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:12,padding:14,textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:"#64748b",marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
        {invoices.length===0?<div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:48,textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>🧾</div><p style={{color:"#64748b"}}>No invoices yet.</p></div>
          :invoices.map(inv=><div key={inv.id} style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:14,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:4}}>Invoice #{inv.invoice_number||inv.id.slice(0,8).toUpperCase()}</div>
              <div style={{fontSize:11,color:"#64748b"}}>Issued {fmtDate(inv.issue_date)} … Due {fmtDate(inv.due_date)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#0f172a",marginBottom:4}}>{fmt(Number(inv.total_amount||0))}</div>
              <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,textTransform:"capitalize",background:inv.status==="paid"?"rgba(34,197,94,0.15)":inv.status==="overdue"?"rgba(239,68,68,0.15)":"rgba(245,158,11,0.15)",color:inv.status==="paid"?"#22c55e":inv.status==="overdue"?"#ef4444":"#f59e0b",border:`1px solid ${inv.status==="paid"?"rgba(34,197,94,0.3)":inv.status==="overdue"?"rgba(239,68,68,0.3)":"rgba(245,158,11,0.3)"}`}}>{inv.status}</span>
            </div>
          </div>)}
      </div>}

      {tab==="estimates"&&<div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn 0.3s ease"}}>
        {estimates.map((es:any)=><PortalEstimateCard key={es.id} es={es}/>)}
      </div>}

      {tab==="changes"&&<div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn 0.3s ease"}}>
        <div style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:12,padding:"12px 16px",fontSize:13,color:"#f59e0b"}}>⚠️ Change orders need your approval before work begins.</div>
        {changes.length===0?<div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:48,textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><p style={{color:"#64748b"}}>No change orders at this time.</p></div>
          :changes.map(co=><div key={co.id} style={{background:"#ffffff",border:`1px solid ${co.status==="approved"?"rgba(34,197,94,0.3)":co.status==="rejected"?"rgba(239,68,68,0.2)":"#e2e8f0"}`,borderRadius:16,padding:20}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:4}}>{co.title}</div>
            {co.description&&<p style={{fontSize:13,color:"#475569",margin:"0 0 10px",lineHeight:1.6}}>{co.description}</p>}
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:co.status==="pending"?14:6}}>
              <span style={{fontSize:17,fontWeight:800,color:"#0f172a"}}>{fmt(Number(co.amount||0))}</span>
              <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,textTransform:"capitalize",background:co.status==="approved"?"rgba(34,197,94,0.15)":co.status==="rejected"?"rgba(239,68,68,0.15)":"rgba(245,158,11,0.15)",color:co.status==="approved"?"#22c55e":co.status==="rejected"?"#ef4444":"#f59e0b"}}>{co.status}</span>
            </div>
            {co.status==="pending"&&<div style={{display:"flex",gap:10}}>
              <button onClick={()=>respondChange(co.id,"approved")} disabled={respondingTo===co.id} style={{flex:1,padding:"11px 0",background:"#16a34a",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",opacity:respondingTo===co.id?0.6:1}}>✅ Approve</button>
              <button onClick={()=>respondChange(co.id,"rejected")} disabled={respondingTo===co.id} style={{flex:1,padding:"11px 0",background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:10,color:"#ef4444",fontSize:13,fontWeight:700,cursor:"pointer"}}>✗ Reject</button>
            </div>}
            {co.status==="approved"&&<div style={{fontSize:12,color:"#22c55e",fontWeight:600}}>✅ You approved this change</div>}
            {co.status==="rejected"&&<div style={{fontSize:12,color:"#ef4444",fontWeight:600}}>✗ You rejected this change</div>}
          </div>)}
      </div>}

      {tab==="feedback"&&<div style={{animation:"fadeIn 0.3s ease"}}>
        {reviewSubmitted?<div style={{background:"rgba(34,197,94,0.07)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:16,padding:48,textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>🌟</div><div style={{fontSize:18,fontWeight:700,color:"#22c55e",marginBottom:6}}>Thank you!</div><p style={{color:"#475569",fontSize:14}}>Your feedback means a lot to us.</p></div>
          :<div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:28}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:4}}>Rate Our Work</div>
            <p style={{fontSize:13,color:"#475569",marginBottom:20}}>How satisfied are you with the project so far?</p>
            <Stars value={rating} onChange={setRating}/>
            {rating>0&&<div style={{marginTop:20}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:6}}>Tell us more (optional)</div>
              <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)} placeholder="What went well? What could be improved?"
                style={{width:"100%",background:"#ffffff",border:"1px solid #cbd5e1",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#0f172a",resize:"none",height:90,outline:"none"}}/>
              <button onClick={submitReview} style={{width:"100%",marginTop:12,padding:"13px 0",background:"#0891b2",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Submit Review</button>
            </div>}
          </div>}
      </div>}
    </div>

    <div style={{borderTop:"1px solid #e2e8f0",padding:"16px 0",textAlign:"center",fontSize:11,color:"#94a3b8"}}>
      {company?.company_name||company?.company_name||company?.company_name||"Magnus Boys Construction"} … Secured Portal … Powered by Magnus ERP
    </div>

    {lightbox&&<div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}>
      <img src={lightbox.url||lightbox.public_url||lightbox.publicUrl||""} style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/>
    </div>}

    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
  </div>;
}