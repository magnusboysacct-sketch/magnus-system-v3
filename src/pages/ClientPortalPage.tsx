// src/pages/ClientPortalPage.tsx — Public client-facing portal
// Accessed via: /portal/:token
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface Client { id: string; name: string; contact_name: string|null; email: string|null; phone: string|null; }
interface Project { id: string; name: string; status: string; start_date: string|null; end_date: string|null; site_address: string|null; notes: string|null; }
interface Invoice { id: string; invoice_number: string|null; total_amount: number; status: string; issue_date: string|null; due_date: string|null; }
interface ChangeOrder { id: string; title: string; description: string|null; amount: number; status: string; created_at: string; }
interface Comment { id: string; message: string; created_at: string; }
interface Photo { id: string; url?: string; public_url?: string; publicUrl?: string; caption?: string; created_at: string; }
interface CompanySettings { company_name: string|null; logo_url: string|null; phone: string|null; email: string|null; address_line1: string|null; }

const STATUS_COLORS: Record<string,string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  planning: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  on_hold: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  completed: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  paid: "bg-green-500/15 text-green-400 border-green-500/30",
  overdue: "bg-red-500/15 text-red-400 border-red-500/30",
};

function fmt(n: number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n); }
function fmtDate(d: string|null) { return d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"; }

type Tab = "overview"|"photos"|"invoices"|"documents"|"changes"|"feedback";

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [client, setClient] = useState<Client|null>(null);
  const [project, setProject] = useState<Project|null>(null);
  const [company, setCompany] = useState<CompanySettings|null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [changes, setChanges] = useState<ChangeOrder[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [newComment, setNewComment] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string|null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function load() {
    setLoading(true);
    try {
      // Find client by portal token
      const { data: clientData, error: ce } = await supabase
        .from("clients").select("*").eq("portal_token", token).eq("portal_enabled", true).single();
      if (ce || !clientData) { setError("This portal link is invalid or has been disabled."); setLoading(false); return; }
      setClient(clientData);

      // Log access
      await supabase.from("clients").update({ portal_last_accessed: new Date().toISOString() }).eq("id", clientData.id);

      // Get company settings
      const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", clientData.created_by || "").maybeSingle();

      // Get projects for this client
      const { data: projects } = await supabase.from("projects").select("*").eq("client_id", clientData.id).order("created_at",{ascending:false}).limit(1);
      const proj = projects?.[0] || null;
      setProject(proj);

      if (proj) {
        // Load everything in parallel
        const [inv, co, cm, ph, boq] = await Promise.all([
          supabase.from("invoices").select("*").eq("project_id", proj.id).order("issue_date",{ascending:false}),
          supabase.from("change_orders").select("*").eq("project_id", proj.id).order("created_at",{ascending:false}),
          supabase.from("client_comments").select("*").eq("project_id", proj.id).order("created_at",{ascending:false}),
          supabase.from("project_photos").select("*").eq("project_id", proj.id).order("created_at",{ascending:false}),
          supabase.from("boq_items").select("status").eq("project_id", proj.id),
        ]);
        setInvoices(inv.data || []);
        setChanges(co.data || []);
        setComments(cm.data || []);
        setPhotos(ph.data || []);

        // Calculate progress
        const items = boq.data || [];
        const done = items.filter((b:any) => b.status === "complete").length;
        setProgress(items.length ? Math.round(done/items.length*100) : 0);
      }

      // Get company settings (try without auth)
      const { data: cs } = await supabase.from("company_settings").select("company_name,logo_url,phone,email,address_line1").limit(1).maybeSingle();
      setCompany(cs);

    } catch(e) { setError("Something went wrong loading the portal."); }
    setLoading(false);
  }

  async function submitComment() {
    if (!newComment.trim() || !client || !project) return;
    await supabase.from("client_comments").insert({ client_id: client.id, project_id: project.id, message: newComment });
    setNewComment("");
    load();
  }

  async function submitReview() {
    if (!rating || !client || !project) return;
    setSubmittingReview(true);
    await supabase.from("client_reviews").insert({ client_id: client.id, project_id: project.id, rating, comment: reviewText });
    setSubmittingReview(false);
    setReviewSubmitted(true);
  }

  async function respondToChange(id: string, response: "approved"|"rejected") {
    await supabase.from("change_orders").update({ status: response, client_response: response, responded_at: new Date().toISOString() }).eq("id", id);
    setRespondingTo(null);
    load();
  }

  const totalInvoiced = invoices.reduce((s,i) => s+Number(i.total_amount||0), 0);
  const totalPaid = invoices.filter(i=>i.status==="paid").reduce((s,i) => s+Number(i.total_amount||0), 0);
  const balanceDue = totalInvoiced - totalPaid;
  const pendingChanges = changes.filter(c=>c.status==="pending").length;

  if (loading) return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-slate-400 text-sm">Loading your portal...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Access Denied</h2>
        <p className="text-slate-400 text-sm">{error}</p>
      </div>
    </div>
  );

  const TABS: {id:Tab; label:string; badge?:number}[] = [
    {id:"overview",  label:"Overview"},
    {id:"photos",    label:"Site Photos", badge: photos.length},
    {id:"invoices",  label:"Invoices",    badge: invoices.filter(i=>i.status!=="paid").length||undefined},
    {id:"documents", label:"Documents"},
    {id:"changes",   label:"Changes",     badge: pendingChanges||undefined},
    {id:"feedback",  label:"Feedback"},
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white font-sans">

      {/* Header */}
      <div className="border-b border-white/10 bg-[#0d1420]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company?.logo_url
              ? <img src={company.logo_url} alt="logo" className="w-9 h-9 rounded-lg object-cover"/>
              : <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-sm">{(company?.company_name||"M").charAt(0)}</div>
            }
            <div>
              <div className="text-sm font-bold text-slate-100">{company?.company_name || "Magnus Boys Construction"}</div>
              <div className="text-xs text-slate-500">Client Portal</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-200">{client?.contact_name || client?.name}</div>
            <div className="text-xs text-slate-500">{client?.email}</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Project Hero */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-600/10 border border-blue-500/20 p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-1">Your Project</div>
              <h1 className="text-2xl font-bold text-white">{project?.name || "No project assigned"}</h1>
              {project?.site_address && <p className="text-slate-400 text-sm mt-1">📍 {project.site_address}</p>}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {project?.status && (
                  <span className={`text-xs px-3 py-1 rounded-full border font-semibold capitalize ${STATUS_COLORS[project.status]||STATUS_COLORS.planning}`}>
                    {project.status.replace("_"," ")}
                  </span>
                )}
                {project?.start_date && <span className="text-xs text-slate-400">Started {fmtDate(project.start_date)}</span>}
                {project?.end_date && <span className="text-xs text-slate-400">Est. completion {fmtDate(project.end_date)}</span>}
              </div>
            </div>
            <div className="text-center">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#3b82f6" strokeWidth="3"
                    strokeDasharray={`${progress} ${100-progress}`} strokeLinecap="round"/>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-white">{progress}%</span>
                </div>
              </div>
              <div className="text-xs text-slate-400 mt-1">Complete</div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{fmt(totalPaid)}</div>
            <div className="text-xs text-slate-400 mt-1">Paid</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
            <div className={`text-2xl font-bold ${balanceDue>0?"text-red-400":"text-green-400"}`}>{fmt(balanceDue)}</div>
            <div className="text-xs text-slate-400 mt-1">Balance Due</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
            <div className={`text-2xl font-bold ${pendingChanges>0?"text-yellow-400":"text-slate-300"}`}>{pendingChanges}</div>
            <div className="text-xs text-slate-400 mt-1">Pending Approvals</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${tab===t.id?"bg-blue-600 text-white shadow-lg":"bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}>
              {t.label}
              {t.badge ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab===t.id?"bg-white/20":"bg-blue-500/20 text-blue-400"}`}>{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Tab Content */}

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-4">
            {project?.notes && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Project Notes</div>
                <p className="text-sm text-slate-300 leading-relaxed">{project.notes}</p>
              </div>
            )}
            {/* Progress bar */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-200">Overall Progress</div>
                <div className="text-sm font-bold text-blue-400">{progress}%</div>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all" style={{width:`${progress}%`}}/>
              </div>
            </div>
            {/* Recent comments */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="text-sm font-semibold text-slate-200 mb-3">Leave a Comment</div>
              <textarea value={newComment} onChange={e=>setNewComment(e.target.value)}
                placeholder="Ask a question or leave a note for the team..."
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-500 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              <button onClick={submitComment} disabled={!newComment.trim()}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors">
                Send Comment
              </button>
              {comments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Previous Comments</div>
                  {comments.map(c => (
                    <div key={c.id} className="bg-white/5 rounded-lg p-3">
                      <p className="text-sm text-slate-300">{c.message}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{fmtDate(c.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PHOTOS */}
        {tab === "photos" && (
          <div>
            {photos.length === 0 ? (
              <div className="rounded-xl bg-white/5 border border-white/10 p-12 text-center">
                <div className="text-4xl mb-3">📸</div>
                <p className="text-slate-400">No site photos yet. Check back soon!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map(p => (
                  <div key={p.id} className="rounded-xl overflow-hidden aspect-square bg-white/5 border border-white/10">
                    <img src={p.url||p.public_url||p.publicUrl||""} alt={p.caption||"Site photo"} className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* INVOICES */}
        {tab === "invoices" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="text-lg font-bold text-slate-100">{fmt(totalInvoiced)}</div>
                <div className="text-xs text-slate-400">Total Invoiced</div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="text-lg font-bold text-green-400">{fmt(totalPaid)}</div>
                <div className="text-xs text-slate-400">Paid</div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className={`text-lg font-bold ${balanceDue>0?"text-red-400":"text-green-400"}`}>{fmt(balanceDue)}</div>
                <div className="text-xs text-slate-400">Balance Due</div>
              </div>
            </div>
            {invoices.length === 0 ? (
              <div className="rounded-xl bg-white/5 border border-white/10 p-12 text-center">
                <div className="text-4xl mb-3">🧾</div>
                <p className="text-slate-400">No invoices yet.</p>
              </div>
            ) : invoices.map(inv => (
              <div key={inv.id} className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">Invoice #{inv.invoice_number || inv.id.slice(0,8)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-slate-100">{fmt(Number(inv.total_amount||0))}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${STATUS_COLORS[inv.status]||STATUS_COLORS.pending}`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DOCUMENTS */}
        {tab === "documents" && (
          <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
            <div className="text-4xl mb-3">📁</div>
            <p className="text-slate-300 font-medium mb-1">Documents & Contracts</p>
            <p className="text-slate-500 text-sm">Your contracts and project documents will appear here. Contact us to request documents.</p>
            <div className="mt-4 p-4 bg-white/5 rounded-xl text-sm text-slate-400">
              📞 {company?.phone || "Contact us"} · ✉️ {company?.email || ""}
            </div>
          </div>
        )}

        {/* CHANGE ORDERS */}
        {tab === "changes" && (
          <div className="space-y-3">
            <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-3 text-xs text-yellow-400">
              ⚠️ Change orders require your approval before work begins. Review carefully before approving.
            </div>
            {changes.length === 0 ? (
              <div className="rounded-xl bg-white/5 border border-white/10 p-12 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-slate-400">No change orders at this time.</p>
              </div>
            ) : changes.map(co => (
              <div key={co.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-200">{co.title}</div>
                    {co.description && <p className="text-xs text-slate-400 mt-1">{co.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-sm font-bold text-white">{fmt(Number(co.amount||0))}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${STATUS_COLORS[co.status]||STATUS_COLORS.pending}`}>{co.status}</span>
                      <span className="text-[10px] text-slate-500">{fmtDate(co.created_at)}</span>
                    </div>
                  </div>
                </div>
                {co.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => respondToChange(co.id, "approved")}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">
                      ✓ Approve
                    </button>
                    <button onClick={() => respondToChange(co.id, "rejected")}
                      className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold rounded-lg border border-red-500/20 transition-colors">
                      ✗ Reject
                    </button>
                  </div>
                )}
                {co.status === "approved" && <div className="mt-2 text-xs text-green-400">✓ You approved this change order</div>}
                {co.status === "rejected" && <div className="mt-2 text-xs text-red-400">✗ You rejected this change order</div>}
              </div>
            ))}
          </div>
        )}

        {/* FEEDBACK */}
        {tab === "feedback" && (
          <div className="space-y-4">
            {reviewSubmitted ? (
              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-8 text-center">
                <div className="text-4xl mb-3">⭐</div>
                <p className="text-green-400 font-semibold">Thank you for your feedback!</p>
                <p className="text-slate-400 text-sm mt-1">We appreciate you taking the time to rate our work.</p>
              </div>
            ) : (
              <div className="rounded-xl bg-white/5 border border-white/10 p-6">
                <div className="text-sm font-semibold text-slate-200 mb-4">Rate Our Work</div>
                <div className="flex gap-2 justify-center mb-4">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setRating(s)}
                      className={`text-3xl transition-transform hover:scale-110 ${s<=rating?"text-yellow-400":"text-slate-600"}`}>
                      ★
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <>
                    <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)}
                      placeholder="Tell us about your experience..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-500 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
                    <button onClick={submitReview} disabled={submittingReview}
                      className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
                      {submittingReview ? "Submitting..." : "Submit Review"}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Contact info */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="text-sm font-semibold text-slate-200 mb-3">Contact Us</div>
              <div className="space-y-2 text-sm text-slate-400">
                {company?.phone && <div>📞 {company.phone}</div>}
                {company?.email && <div>✉️ {company.email}</div>}
                {company?.address_line1 && <div>📍 {company.address_line1}</div>}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="border-t border-white/5 mt-12 py-6 text-center text-xs text-slate-600">
        {company?.company_name || "Magnus Boys Construction"} · Powered by Magnus ERP
      </div>
    </div>
  );
}
