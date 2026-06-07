// src/pages/FieldPaymentsPage.tsx
// Field Payment Management — list, create, view payments

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { FieldPaymentForm } from "../components/FieldPaymentForm";
import {
  PageHeader, Card, Badge, Btn, Input, Select,
  Table, Th, Tr, Td, Empty, Tabs, cn
} from "../components/ui";
import {
  Plus, Search, HandCoins, DollarSign, Users,
  Calendar, RefreshCw, CheckCircle2, Clock,
  FileText, Phone, User, Briefcase, X
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
  created_at: string;
};

type Tab = "all" | "draft" | "signed" | "completed";

const STATUS_COLOR: Record<string, any> = {
  draft: "amber", signed: "cyan", completed: "green", cancelled: "red"
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(n);
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
        .from("field_payments")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPayments(data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  const filtered = payments.filter(p => {
    const matchSearch =
      p.worker_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.worker_id_number || "").includes(search) ||
      (p.work_type || "").toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || p.status === tab;
    return matchSearch && matchTab;
  });

  const stats = {
    total:     payments.length,
    totalPaid: payments.reduce((s, p) => s + (p.total_amount || 0), 0),
    today:     payments.filter(p => p.work_date === new Date().toISOString().split("T")[0]).length,
    workers:   new Set(payments.map(p => p.worker_name)).size,
  };

  if (showForm) {
    return (
      <FieldPaymentForm
        onComplete={() => { setShowForm(false); loadPayments(); }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Field Payments"
        subtitle="Mobile worker payment and receipt system"
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadPayments}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
              onClick={() => setShowForm(true)}>
              New Payment
            </Btn>
          </>
        }
      />

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:"Total Payments", value:fmt(stats.totalPaid), color:"text-emerald-400", icon:<DollarSign size={14}/> },
            { label:"Today",          value:stats.today,           color:"text-cyan-400",    icon:<Calendar size={14}/> },
            { label:"Unique Workers", value:stats.workers,          color:"text-violet-400",  icon:<Users size={14}/> },
            { label:"All Records",    value:stats.total,            color:"text-slate-300",   icon:<FileText size={14}/> },
          ].map(s => (
            <Card key={s.label}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">{s.label}</div>
                  <div className={cn("text-xl font-bold", s.color)}>{s.value}</div>
                </div>
                <div className="text-slate-700">{s.icon}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs
          tabs={[
            { key:"all" as Tab,       label:"All",       count:payments.length },
            { key:"draft" as Tab,     label:"Draft",     count:payments.filter(p=>p.status==="draft").length },
            { key:"signed" as Tab,    label:"Signed",    count:payments.filter(p=>p.status==="signed").length },
            { key:"completed" as Tab, label:"Completed", count:payments.filter(p=>p.status==="completed").length },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
          <Input className="pl-8" placeholder="Search worker, ID, work type..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<HandCoins size={20}/>}
            title="No payments yet"
            body="Tap New Payment to record a field payment with ID scan and signature."
            action={<Btn variant="primary" icon={<Plus size={13}/>} onClick={() => setShowForm(true)}>New Payment</Btn>}
          />
        ) : (
          <Card padding={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Worker</Th>
                  <Th>Work Type</Th>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th>Status</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <Tr key={p.id} onClick={() => setSelected(p)}>
                    <Td>
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
                    </Td>
                    <Td muted>{p.work_type}</Td>
                    <Td muted>{fmtDate(p.work_date)}</Td>
                    <Td muted className="capitalize">{p.payment_method.replace("_"," ")}</Td>
                    <Td><Badge color={STATUS_COLOR[p.status]||"slate"} dot>{p.status}</Badge></Td>
                    <Td right><span className="font-bold text-emerald-400">{fmt(p.total_amount)}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Payment detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0f1520] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div>
                <div className="text-sm font-semibold text-slate-100">{selected.worker_name}</div>
                <div className="text-[10px] text-slate-600">{fmtDate(selected.work_date)}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                <X size={15}/>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* ID Photo */}
              {selected.id_photo_url && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">Stored ID Photo</div>
                  <img src={selected.id_photo_url} alt="Worker ID" className="w-full rounded-xl border border-white/[0.08] object-contain max-h-40"/>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:"ID Number",    value:selected.worker_id_number },
                  { label:"Phone",        value:selected.worker_phone },
                  { label:"Work Type",    value:selected.work_type },
                  { label:"Payment",      value:selected.payment_method.replace("_"," ") },
                  { label:"Days",         value:selected.days_worked ? `${selected.days_worked} days` : null },
                  { label:"Rate/Day",     value:selected.rate_per_day ? fmt(selected.rate_per_day) : null },
                  { label:"Supervisor",   value:selected.supervisor_name },
                  { label:"Status",       value:selected.status },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
                    <div className="text-[9px] text-slate-600 mb-0.5">{f.label}</div>
                    <div className="text-xs font-semibold text-slate-300 capitalize">{f.value}</div>
                  </div>
                ))}
              </div>
              {selected.notes && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
                  <div className="text-[9px] text-slate-600 mb-0.5">Notes</div>
                  <div className="text-xs text-slate-400">{selected.notes}</div>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-300">Total Paid</span>
                <span className="text-2xl font-bold text-emerald-400">{fmt(selected.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
