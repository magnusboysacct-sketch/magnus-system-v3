// src/pages/FieldPaymentsPage.tsx — Rebuilt: dark theme, JMD, mobile responsive, no old UI
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { FieldPaymentForm } from "../components/FieldPaymentForm";
import {
  Plus, Search, HandCoins, DollarSign, Users,
  Calendar, RefreshCw, FileText, X, Filter
} from "lucide-react";

type Payment = {
  id: string;
  worker_name: string;
  worker_id_number: string | null;
  worker_phone: string | null;
  work_type: string;
  work_date: string;
  total_amount: number;
  payment_method: string;
  status: string;
  days_worked: number | null;
  hours_worked: number | null;
  rate_per_day: number | null;
  rate_per_hour: number | null;
  notes: string | null;
  supervisor_name: string | null;
  id_photo_url: string | null;
  signature_url: string | null;
  created_at: string;
};

type Tab = "all" | "draft" | "signed" | "completed";

const STATUS_CFG: Record<string, { color: string; bg: string; border: string }> = {
  draft:     { color:"text-amber-400",   bg:"bg-amber-500/10",   border:"border-amber-500/20" },
  signed:    { color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20" },
  completed: { color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20" },
  cancelled: { color:"text-red-400",     bg:"bg-red-500/10",     border:"border-red-500/20" },
};

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"JMD", minimumFractionDigits:0 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

export default function FieldPaymentsPage() {
  const { projects } = useProjectContext();
  const [payments, setPayments]   = useState<Payment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [tab, setTab]             = useState<Tab>("all");
  const [showForm, setShowForm]   = useState(false);
  const [selected, setSelected]   = useState<Payment | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadPayments(); }, [companyId]);

  async function loadPayments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("field_payments").select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPayments(data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.worker_name.toLowerCase().includes(q) ||
      (p.worker_id_number||"").includes(q) ||
      (p.work_type||"").toLowerCase().includes(q);
    const matchTab = tab === "all" || p.status === tab;
    return matchSearch && matchTab;
  });

  const stats = {
    totalPaid: payments.reduce((s, p) => s + (p.total_amount || 0), 0),
    today:     payments.filter(p => p.work_date === new Date().toISOString().split("T")[0]).length,
    workers:   new Set(payments.map(p => p.worker_name)).size,
    total:     payments.length,
  };

  const TABS: { key: Tab; label: string }[] = [
    { key:"all",       label:"All" },
    { key:"draft",     label:"Draft" },
    { key:"signed",    label:"Signed" },
    { key:"completed", label:"Completed" },
  ];

  if (showForm) {
    return (
      <FieldPaymentForm
        onComplete={() => { setShowForm(false); loadPayments(); }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Field Payments</h1>
            <p className="text-xs text-slate-500 mt-0.5">Mobile worker payment and receipt system</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadPayments}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-500 hover:text-slate-300 transition">
              <RefreshCw size={13} className={loading?"animate-spin":""}/>
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition shadow-sm">
              <Plus size={13}/> New Payment
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:"Total Paid",      value:fmtJMD(stats.totalPaid), color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20", icon:<DollarSign size={14}/> },
            { label:"Today",           value:stats.today,              color:"text-cyan-400",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20",    icon:<Calendar size={14}/> },
            { label:"Unique Workers",  value:stats.workers,            color:"text-violet-400",  bg:"bg-violet-500/10",  border:"border-violet-500/20",  icon:<Users size={14}/> },
            { label:"All Records",     value:stats.total,              color:"text-slate-300",   bg:"bg-white/[0.04]",   border:"border-white/[0.07]",   icon:<FileText size={14}/> },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
              <div className={`${s.color} mb-2`}>{s.icon}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t => {
            const count = t.key === "all" ? payments.length : payments.filter(p=>p.status===t.key).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${tab===t.key ? "bg-cyan-600 border-cyan-500 text-white" : "bg-white/[0.04] border-white/[0.08] text-slate-500 hover:text-slate-300"}`}>
                {t.label}
                {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab===t.key?"bg-white/20 text-white":"bg-white/[0.08] text-slate-600"}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search worker, ID, work type…"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600 gap-2">
            <RefreshCw size={13} className="animate-spin"/> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <HandCoins size={22} className="text-slate-700"/>
            </div>
            <p className="text-slate-400 text-sm font-medium">{search ? "No payments match" : "No payments yet"}</p>
            <p className="text-slate-700 text-xs">Tap New Payment to record a field payment</p>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition mt-1">
              <Plus size={12}/> New Payment
            </button>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden flex flex-col gap-3">
              {filtered.map(p => {
                const cfg = STATUS_CFG[p.status] || STATUS_CFG.draft;
                return (
                  <button key={p.id} onClick={() => setSelected(p)}
                    className="w-full rounded-xl border border-white/[0.07] bg-[#0d1117] p-4 text-left hover:border-white/[0.13] transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        {p.id_photo_url ? (
                          <img src={p.id_photo_url} alt="ID" className="w-9 h-9 rounded-full object-cover border border-white/[0.1] flex-shrink-0"/>
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] font-bold text-cyan-300 flex-shrink-0">
                            {p.worker_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-200">{p.worker_name}</div>
                          <div className="text-[10px] text-slate-600">{p.work_type} · {fmtDate(p.work_date)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-emerald-400">{fmtJMD(p.total_amount)}</div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border capitalize ${cfg.color} ${cfg.bg} ${cfg.border}`}>{p.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-600">
                      <span className="capitalize">{p.payment_method?.replace("_"," ")}</span>
                      {p.signature_url && <span className="text-emerald-500">✍️ Signed</span>}
                      {p.worker_id_number && <span>ID: {p.worker_id_number}</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Worker","Work Type","Date","Method","Status","Amount"].map((h,i)=>(
                      <th key={h} className={`px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-600 ${i===5?"text-right":"text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p,i) => {
                    const cfg = STATUS_CFG[p.status] || STATUS_CFG.draft;
                    return (
                      <tr key={p.id} onClick={() => setSelected(p)}
                        className={`border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer transition ${i%2===1?"bg-white/[0.01]":""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.id_photo_url ? (
                              <img src={p.id_photo_url} alt="ID" className="w-8 h-8 rounded-full object-cover border border-white/[0.1]"/>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] font-bold text-cyan-300">
                                {p.worker_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-semibold text-slate-200">{p.worker_name}</div>
                              {p.worker_id_number && <div className="text-[10px] text-slate-600">ID: {p.worker_id_number}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{p.work_type}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.work_date)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 capitalize">{p.payment_method?.replace("_"," ")}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border capitalize ${cfg.color} ${cfg.bg} ${cfg.border}`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-emerald-400">{fmtJMD(p.total_amount)}</span>
                          {p.signature_url && <div className="text-[9px] text-emerald-600 mt-0.5">✍️ Signed</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Payment Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] sticky top-0 bg-[#0d1117]">
              <div>
                <div className="text-sm font-bold text-slate-100">{selected.worker_name}</div>
                <div className="text-[10px] text-slate-600">{fmtDate(selected.work_date)}</div>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-600 hover:text-slate-300 transition">
                <X size={15}/>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {selected.id_photo_url && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">ID Photo</div>
                  <img src={selected.id_photo_url} alt="Worker ID" className="w-full rounded-xl border border-white/[0.08] object-contain max-h-40"/>
                </div>
              )}
              {selected.signature_url && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Signature</div>
                  <img src={selected.signature_url} alt="Signature" className="h-16 rounded-lg border border-white/[0.08] bg-white p-2"/>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:"ID Number",   value:selected.worker_id_number },
                  { label:"Phone",       value:selected.worker_phone },
                  { label:"Work Type",   value:selected.work_type },
                  { label:"Payment",     value:selected.payment_method?.replace("_"," ") },
                  { label:"Days",        value:selected.days_worked ? `${selected.days_worked} days` : null },
                  { label:"Rate/Day",    value:selected.rate_per_day ? fmtJMD(selected.rate_per_day) : null },
                  { label:"Supervisor",  value:selected.supervisor_name },
                  { label:"Status",      value:selected.status },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
                    <div className="text-[9px] text-slate-600 mb-0.5 uppercase tracking-wider">{f.label}</div>
                    <div className="text-xs font-semibold text-slate-300 capitalize">{f.value}</div>
                  </div>
                ))}
              </div>
              {selected.notes && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
                  <div className="text-[9px] text-slate-600 mb-0.5 uppercase tracking-wider">Notes</div>
                  <div className="text-xs text-slate-400">{selected.notes}</div>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-300">Total Paid</span>
                <span className="text-2xl font-bold text-emerald-400">{fmtJMD(selected.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
