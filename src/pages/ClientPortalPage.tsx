// src/pages/ClientPortalPage.tsx … Secure portal with password + PWA
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type AuthState = "loading"|"error"|"setup"|"login"|"authenticated";
type Tab = "overview"|"photos"|"invoices"|"contracts"|"changes"|"feedback";

interface Client { id:string; name:string; contact_name:string|null; email:string|null; phone:string|null; portal_email:string|null; portal_password_hash:string|null; portal_activated_at:string|null; }
interface Project { id:string; name:string; status:string; start_date:string|null; end_date:string|null; site_address:string|null; notes:string|null; budget:number|null; }
interface Invoice { id:string; invoice_number:string|null; total_amount:number; status:string; issue_date:string|null; due_date:string|null; }
interface ChangeOrder { id:string; title:string; description:string|null; amount:number; status:string; created_at:string; }
interface Comment { id:string; message:string; created_at:string; }
interface Photo { id:string; url?:string; public_url?:string; publicUrl?:string; caption?:string; created_at:string; }
interface Co { company_name:string|null; logo_url:string|null; phone:string|null; email:string|null; address_line1:string|null; }

const fmt = (n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(n);
const fmtDate = (d:string|null) => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "…";
const timeAgo = (d:string) => { const s=Math.floor((Date.now()-new Date(d).getTime())/1000); if(s<60)return "just now"; if(s<3600)return `${Math.floor(s/60)}m ago`; if(s<86400)return `${Math.floor(s/3600)}h ago`; return fmtDate(d); };

async function hashPassword(p:string):Promise<string> {
  const data = new TextEncoder().encode(p+"magnus_portal_2026");
  const hash = await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
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
function AuthScreen({client,company,mode,onSuccess}:{client:Client;company:Co|null;mode:"setup"|"login";onSuccess:()=>void}) {
  const [email,setEmail]=useState(client.portal_email||client.email||"");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [showPass,setShowPass]=useState(false);

  async function handleSetup() {
    if(!email.trim()){setError("Please enter your email address.");return;}
    if(password.length<6){setError("Password must be at least 6 characters.");return;}
    if(password!==confirm){setError("Passwords do not match.");return;}
    setLoading(true);setError("");
    const hash=await hashPassword(password);
    const {error:e}=await supabase.from("clients").update({portal_email:email.trim(),portal_password_hash:hash,portal_activated_at:new Date().toISOString()}).eq("id",client.id);
    if(e){setError("Failed to set up account.");setLoading(false);return;}
    const tok=crypto.randomUUID();
    await supabase.from("client_portal_sessions").insert({client_id:client.id,session_token:tok,device_info:navigator.userAgent.slice(0,200)});
    localStorage.setItem(`portal_${client.id}`,tok);
    onSuccess();setLoading(false);
  }

  async function handleLogin() {
    if(!password){setError("Please enter your password.");return;}
    setLoading(true);setError("");
    const hash=await hashPassword(password);
    if(hash!==client.portal_password_hash){setError("Incorrect password. Please try again.");setLoading(false);return;}
    const tok=crypto.randomUUID();
    await supabase.from("client_portal_sessions").insert({client_id:client.id,session_token:tok,device_info:navigator.userAgent.slice(0,200)});
    localStorage.setItem(`portal_${client.id}`,tok);
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
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#1e293b"}}>🔒 Secured by {company?.company_name||company?.company_name||company?.company_name||"Magnus Boys Construction"}</div>
    </div>
  </div>;
}

function SignatureModal({contract,client,saving,onSign,onCancel}:{contract:any;client:any;saving:boolean;onSign:(dataUrl:string)=>void;onCancel:()=>void}){
  const canvasRef=React.useRef<HTMLCanvasElement|null>(null);
  const [hasDrawn,setHasDrawn]=React.useState(false);
  const [mode,setMode]=React.useState<"draw"|"upload">("draw");
  const [uploadPreview,setUploadPreview]=React.useState<string|null>(null);
  const drawing=React.useRef(false);

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

  const canSubmit=mode==="draw"?hasDrawn:!!uploadPreview;

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

      <div style={{display:"flex",gap:8,marginTop:14}}>
        {mode==="draw"&&<button onClick={clear} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer"}}>Clear</button>}
        <button onClick={onCancel} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
        <button onClick={submit} disabled={!canSubmit||saving} style={{flex:1.4,padding:"10px 0",borderRadius:10,border:"none",background:canSubmit?"#22c55e":"rgba(255,255,255,0.06)",color:canSubmit?"white":"#475569",fontSize:13,fontWeight:700,cursor:canSubmit?"pointer":"not-allowed"}}>{saving?"Saving…":"Sign & Submit"}</button>
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const {token}=useParams<{token:string}>();
  const [authState,setAuthState]=useState<AuthState>("loading");
  const [client,setClient]=useState<Client|null>(null);
  const [project,setProject]=useState<Project|null>(null);
  const [company,setCompany]=useState<Co|null>(null);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [changes,setChanges]=useState<ChangeOrder[]>([]);
  const [comments,setComments]=useState<Comment[]>([]);
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [contracts,setContracts]=useState<any[]>([]);
  const [signingContract,setSigningContract]=useState<any|null>(null);
  const [savingSignature,setSavingSignature]=useState(false);
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

  useEffect(()=>{if(token)checkAuth();},[token]);

  async function checkAuth() {
    setAuthState("loading");
    try {
      const {data:c}=await supabase.from("clients").select("*").eq("portal_token",token).eq("portal_enabled",true).single();
      if(!c){setErrorMsg("This portal link is invalid or has been disabled.");setAuthState("error");return;}
      setClient(c);
      if(c.company_id){
        const {data:cs}=await supabase.from("company_settings").select("company_name,logo_url,phone,email,address_line1").eq("company_id",c.company_id).maybeSingle();
        setCompany(cs);
      }
      const sess=localStorage.getItem(`portal_${c.id}`);
      if(sess){
        const {data:s}=await supabase.from("client_portal_sessions").select("id").eq("session_token",sess).eq("client_id",c.id).gt("expires_at",new Date().toISOString()).maybeSingle();
        if(s){await loadData(c);setAuthState("authenticated");return;}
      }
      setAuthState(c.portal_password_hash?"login":"setup");
    } catch {setErrorMsg("Something went wrong.");setAuthState("error");}
  }

  async function loadData(c:Client) {
    try {
      const {data:p}=await supabase.from("projects").select("*").eq("client_id",c.id).order("created_at",{ascending:false}).limit(1);
      const proj=p?.[0]||null; setProject(proj);
      const {data:cm}=await supabase.from("client_comments").select("*").eq("client_id",c.id).order("created_at",{ascending:true});
      setComments(cm||[]);
      if(proj){
        const [inv,co,ph,boq,ct]=await Promise.all([
          supabase.from("invoices").select("*").eq("project_id",proj.id).order("issue_date",{ascending:false}),
          supabase.from("change_orders").select("*").eq("project_id",proj.id).order("created_at",{ascending:false}),
          supabase.from("project_photos").select("*").eq("project_id",proj.id).order("created_at",{ascending:false}),
          supabase.from("boq_items").select("status").eq("project_id",proj.id),
          supabase.from("client_contracts").select("*").eq("project_id",proj.id).eq("client_id",c.id).order("created_at",{ascending:false}),
        ]);
        setInvoices(inv.data||[]);setChanges(co.data||[]);setPhotos(ph.data||[]);setContracts(ct.data||[]);
        const items=boq.data||[];
        setProgress(items.length?Math.round(items.filter((b:any)=>b.status==="complete").length/items.length*100):0);
      }
    } catch(e){console.error(e);}
  }

  async function onAuthSuccess(){
    const fresh=await supabase.from("clients").select("*").eq("portal_token",token).single();
    if(fresh.data){setClient(fresh.data);await loadData(fresh.data);}
    setAuthState("authenticated");
    setToast({msg:"Welcome to your project portal!",type:"success"});
  }

  async function submitComment(){
    if(!newComment.trim()||!client) return;

    const { error } = await supabase.from("client_comments").insert({
      client_id: client.id,
      project_id: project?.id || null,
      message: newComment,
    });

    if (error) {
      setToast({ msg: "Failed to send message. Please try again.", type: "error" });
      console.error("submitComment insert error:", error);
      return;
    }

    setNewComment("");
    setToast({ msg: "Message sent!", type: "success" });
    loadData(client);
  }

  async function submitReview(){
    if(!rating||!client||!project)return;
    await supabase.from("client_reviews").insert({client_id:client.id,project_id:project.id,rating,comment:reviewText});
    setReviewSubmitted(true);setToast({msg:"Thank you for your review!",type:"success"});
  }

  async function respondChange(id:string,resp:"approved"|"rejected"){
    setRespondingTo(id);
    await supabase.from("change_orders").update({status:resp,client_response:resp,responded_at:new Date().toISOString()}).eq("id",id);
    setToast({msg:resp==="approved"?"Change approved!":"Change rejected.",type:resp==="approved"?"success":"error"});
    setRespondingTo(null);if(client)loadData(client);
  }

  const totalInvoiced=invoices.reduce((s,i)=>s+Number(i.total_amount||0),0);
  const totalPaid=invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.total_amount||0),0);
  const balanceDue=totalInvoiced-totalPaid;
  const pendingChanges=changes.filter(c=>c.status==="pending").length;

  const G=`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box} body{margin:0} input::placeholder,textarea::placeholder{color:#94a3b8} input:focus,textarea:focus{border-color:#0891b2!important} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}`;

  if(authState==="loading")return <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{G}</style><div style={{textAlign:"center"}}><div style={{width:44,height:44,border:"3px solid #0891b2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/><p style={{color:"#64748b",fontSize:14}}>Loading portal…</p></div></div>;

  if(authState==="error")return <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><style>{G}</style><div style={{textAlign:"center",maxWidth:360}}><div style={{fontSize:52,marginBottom:14}}>🔒</div><h2 style={{color:"#0f172a",fontSize:20,fontWeight:700,marginBottom:8}}>Access Denied</h2><p style={{color:"#64748b",fontSize:14,lineHeight:1.6}}>{errorMsg}</p></div></div>;

  if(authState==="setup"||authState==="login")return <><style>{G}</style><AuthScreen client={client!} company={company} mode={authState} onSuccess={onAuthSuccess}/></>;

  if(!client||authState!=="authenticated")return null;

  const sColor:Record<string,string>={active:"#22c55e",planning:"#3b82f6",on_hold:"#f59e0b",completed:"#94a3b8",cancelled:"#ef4444"};
  const TABS=[{id:"overview",label:"Overview",emoji:"📋"},{id:"contracts",label:"Contracts",emoji:"📝",badge:contracts.filter((c:any)=>!c.client_signed_at).length||undefined},{id:"photos",label:"Photos",emoji:"📸",badge:photos.length||undefined},{id:"invoices",label:"Invoices",emoji:"🧾",badge:invoices.filter(i=>i.status!=="paid").length||undefined},{id:"changes",label:"Changes",emoji:"⚠️",badge:pendingChanges||undefined},{id:"feedback",label:"Feedback",emoji:"⭐"}] as const;

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
          <button onClick={()=>{localStorage.removeItem(`portal_${client.id}`);setAuthState("login");}} style={{padding:"6px 12px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,color:"#475569",fontSize:11,cursor:"pointer",fontWeight:600}}>Sign Out</button>
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
          {project?.budget&&<div style={{marginTop:8,fontSize:11,color:"#475569"}}>Budget: <span style={{color:"#94a3b8",fontWeight:600}}>{fmt(project.budget)}</span></div>}
        </div>
        {project?.notes&&<div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Project Notes</div>
          <p style={{fontSize:13,color:"#475569",lineHeight:1.7,margin:0}}>{project.notes}</p>
        </div>}
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:14}}>💬 Messages</div>
          {comments.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,maxHeight:280,overflowY:"auto"}}>
            {comments.map(c=><div key={c.id} style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px"}}>
              <p style={{fontSize:13,color:"#1e3a5f",margin:"0 0 4px",lineHeight:1.5}}>{c.message}</p>
              <span style={{fontSize:10,color:"#475569"}}>{timeAgo(c.created_at)}</span>
            </div>)}
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
              {!ct.client_signed_at&&ct.contractor_signed_at&&<button onClick={()=>setSigningContract(ct)} style={{width:"100%",marginTop:12,padding:"12px 0",background:"#22c55e",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Sign This Contract</button>}
              {!ct.contractor_signed_at&&<div style={{marginTop:12,padding:"10px 14px",background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10,fontSize:12,color:"#f59e0b"}}>Waiting for contractor signature before you can sign.</div>}
            </div>
          )
        }
        {signingContract&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <SignatureModal contract={signingContract} client={client} saving={savingSignature} onCancel={()=>setSigningContract(null)} onSign={async(dataUrl)=>{
            setSavingSignature(true);
            try{
              const blob=await(await fetch(dataUrl)).blob();
              const path=`client-signatures/${signingContract.id}_${Date.now()}.png`;
              const{error:ue}=await supabase.storage.from("project-files").upload(path,blob,{upsert:true,contentType:"image/png"});
              const sigUrl=ue?null:supabase.storage.from("project-files").getPublicUrl(path).data.publicUrl;
              await supabase.from("client_contracts").update({client_signed_at:new Date().toISOString(),client_signature_url:sigUrl,client_signed_ip:"portal"}).eq("id",signingContract.id);
              setContracts(prev=>prev.map(c=>c.id===signingContract.id?{...c,client_signed_at:new Date().toISOString()}:c));
              setSigningContract(null);
              setToast({msg:"Contract signed successfully!",type:"success"});
            }catch(e:any){setToast({msg:"Failed to save signature.",type:"error"});}
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