// src/pages/AccountsPayablePage.tsx
//
// Bills / Accounts Payable. Banking Step 4a added "New bill" (NewBillModal ->
// create_bill RPC) and Approve / Dispute in the detail modal; an approved bill
// goes in the books (migration 20260975). Mirrors
// AccountsReceivablePage.tsx's list-plus-detail-modal shape: click a row to
// open a modal that fetches that bill's line items on demand, rather than a
// separate detail route.
//
// suppliers' real name column is supplier_name, not name — the same bug
// (suppliers(name), a nonexistent embedded column, silently emptying the
// whole query) already found and fixed this round in FinancePage.tsx's
// Payable tab and finance.ts's fetchSupplierInvoices(); this page's own
// query is written correctly from the start.
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchSupplierInvoiceLineItems } from "../lib/finance";
import { NewBillModal } from "../components/NewBillModal";
import { PayBillModal } from "../components/PayBillModal";
import { AddProofModal } from "../components/BillPaymentProof";
import { ApplyAdvanceModal, GiveAdvanceModal } from "../components/AdvanceModals";
import { showBillReceipt } from "../lib/billReceipt";
import { resolveFileUrl } from "../lib/storageRefs";
import {
  approveBill, disputeBill, setBillFile, uploadBillFile, fetchAdvances, fetchBillPayments, fetchCostAccounts, fetchUnsignedCashPayments, needsProof, undoBillPayment, PAY_METHODS,
  type BillPayment, type CostAccount, type SupplierAdvance, type UnsignedPayment,
} from "../lib/bills";
import type { SupplierInvoiceLineItem } from "../lib/finance";
import {
  PageHeader, Card, Badge, Btn, Input,
  Table, Th, Tr, Td, Empty, Modal, Alert, Tabs,
  Spinner, cn
} from "../components/ui";
import {
  Search, RefreshCw, Landmark, Package, Plus, CheckCircle2, AlertTriangle, Banknote, Undo2, PenTool, Printer, Image as ImageIcon, ScanLine, HandCoins,
} from "lucide-react";

interface SupplierInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  balance_due: number;
  status: string;
  supplier_id: string | null;
  project_id: string | null;
  suppliers: { supplier_name: string } | null;
  projects: { name: string } | null;
  retention_amount: number | null;
  gl_transaction_id: string | null;
  ledger_note: string | null;
  bill_file_path: string | null;
}

type StatusFilter = "all" | "pending" | "approved" | "partial" | "paid" | "disputed";

// Shared with FinancePage.tsx's own status coloring for the same
// underlying vocabulary, kept in sync intentionally rather than imported
// (FinancePage's map also covers client_invoices' separate draft/sent/
// overdue/cancelled values, which don't apply here).
const STATUS_COLOR: Record<string, "amber" | "cyan" | "green" | "red"> = {
  pending: "amber", approved: "cyan", partial: "amber",
  paid: "green", disputed: "red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 0
  }).format(n || 0);
}

function msg(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.";
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AccountsPayablePage() {
  const [bills, setBills] = useState<SupplierInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [selectedBill, setSelectedBill] = useState<SupplierInvoiceRow | null>(null);
  const [lineItems, setLineItems] = useState<SupplierInvoiceLineItem[]>([]);
  const [loadingLineItems, setLoadingLineItems] = useState(false);
  const [lineItemsError, setLineItemsError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [costAccounts, setCostAccounts] = useState<CostAccount[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const canApprove = ["director", "admin", "office_user"].includes(role);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [paying, setPaying] = useState<null | "bill" | "retention">(null);
  const [proofFor, setProofFor] = useState<{ id: string; amount: number; signed: boolean; hasPhoto: boolean; name: string } | null>(null);
  const [advances, setAdvances] = useState<SupplierAdvance[]>([]);
  const [showGive, setShowGive] = useState(false);
  const [applying, setApplying] = useState(false);
  const [unsigned, setUnsigned] = useState<UnsignedPayment[]>([]);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => { loadBills(); }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("user_profiles").select("company_id, role").eq("id", user.id).single();
      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);
      setRole(profile.role || "");
      fetchCostAccounts(profile.company_id).then(setCostAccounts).catch(() => setCostAccounts([]));
      fetchUnsignedCashPayments(profile.company_id).then(setUnsigned).catch(() => setUnsigned([]));
      fetchAdvances(profile.company_id, { openOnly: true }).then(setAdvances).catch(() => setAdvances([]));
      const { data: co } = await supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle();
      setCompanyName((co as { name?: string } | null)?.name || "");
    })();
  }, []);

  async function loadBills() {
    setLoading(true);
    setError(null);
    try {
      // Genuine multi-page loop — PostgREST's server-side row cap can't be
      // bypassed by .range() alone, same fix already applied across the
      // rest of this app. Only 9 bills exist today, but this is written
      // correctly from the start rather than waiting to get bitten by the
      // same class of bug a second time.
      const PAGE = 1000;
      let all: SupplierInvoiceRow[] = [];
      let from = 0;
      for (let guard = 0; guard < 200; guard++) {
        const { data: page, error: e } = await supabase
          .from("supplier_invoices")
          .select("id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, supplier_id, project_id, retention_amount, gl_transaction_id, ledger_note, bill_file_path, suppliers(supplier_name), projects(name)")
          .order("due_date", { ascending: true })
          .range(from, from + PAGE - 1);
        if (e) throw e;
        all = all.concat((page as unknown as SupplierInvoiceRow[]) || []);
        if (!page || page.length < PAGE) break;
        from += PAGE;
      }
      setBills(all);
    } catch (e: unknown) { setError(msg(e)); }
    finally { setLoading(false); }
  }

  async function openDetail(bill: SupplierInvoiceRow) {
    setSelectedBill(bill);
    setLoadingLineItems(true);
    setLineItemsError(null);
    try {
      const [items, pays] = await Promise.all([fetchSupplierInvoiceLineItems(bill.id), fetchBillPayments(bill.id)]);
      setLineItems(items);
      setPayments(pays);
    } catch (e: unknown) {
      setLineItemsError(msg(e));
    } finally {
      setLoadingLineItems(false);
    }
  }

  async function refreshSelected(id: string) {
    await loadBills();
    const { data } = await supabase.from("supplier_invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, supplier_id, project_id, retention_amount, gl_transaction_id, ledger_note, bill_file_path, suppliers(supplier_name), projects(name)")
      .eq("id", id).single();
    if (data) setSelectedBill(data as unknown as SupplierInvoiceRow);
    setPayments(await fetchBillPayments(id).catch(() => [] as BillPayment[]));
    refreshSide();
  }

  function refreshSide() {
    if (!companyId) return;
    fetchUnsignedCashPayments(companyId).then(setUnsigned).catch(() => undefined);
    fetchAdvances(companyId, { openOnly: true }).then(setAdvances).catch(() => undefined);
  }

  function printAdvanceReceipt(a: SupplierAdvance) {
    showBillReceipt({
      company: companyName, receiptNumber: a.payment_number || "Advance", date: a.payment_date, amount: a.given,
      method: a.payment_method, reference: a.reference_number, retention: false, supplier: a.supplier, billNumber: "",
      project: a.project, receivedBy: a.received_by_name, signature: a.signature_data, signedAt: a.signed_at,
    });
  }

  async function undoAdvance(a: SupplierAdvance) {
    if (acting) return;
    if (!window.confirm(`Undo the advance of ${fmt(a.given)} to ${a.supplier}? It comes out of the books.`)) return;
    setActing(true); setError(null);
    try {
      await undoBillPayment(a.id);
      setNotice(`Advance to ${a.supplier} undone.`);
      refreshSide();
    } catch (e: unknown) { setError(msg(e)); }
    finally { setActing(false); }
  }

  function printReceipt(p: BillPayment) {
    if (!selectedBill) return;
    showBillReceipt({
      company: companyName, receiptNumber: p.payment_number || "Payment", date: p.payment_date, amount: p.amount,
      method: p.payment_method, reference: p.reference_number, retention: p.is_retention_release,
      supplier: selectedBill.suppliers?.supplier_name || "", billNumber: selectedBill.invoice_number, project: selectedBill.projects?.name || null,
      receivedBy: p.received_by_name, signature: p.signature_data, signedAt: p.signed_at,
    });
  }

  async function viewBillFile() {
    if (!selectedBill?.bill_file_path) return;
    const tab = window.open("", "_blank");
    const url = await resolveFileUrl(selectedBill.bill_file_path).catch(() => null);
    if (url && tab) tab.location.href = url;
    else { tab?.close(); setActionError("The bill picture could not be opened. Only people with full finance access, or whoever added it, can see it."); }
  }

  async function attachBillFile(f: File) {
    if (!selectedBill || !companyId || acting) return;
    setActing(true); setActionError(null);
    try {
      await setBillFile(selectedBill.id, await uploadBillFile(companyId, f, selectedBill.invoice_date));
      setNotice(`Bill picture saved in the receipts folder for ${selectedBill.invoice_date.slice(0, 7)}.`);
      await refreshSelected(selectedBill.id);
    } catch (e: unknown) { setActionError(msg(e)); }
    finally { setActing(false); }
  }

  async function viewPhoto(p: BillPayment) {
    const tab = window.open("", "_blank");
    const url = await resolveFileUrl(p.proof_path).catch(() => null);
    if (url && tab) tab.location.href = url;
    else { tab?.close(); setActionError("The photo could not be opened. Only people with full finance access, or whoever added it, can see it."); }
  }

  async function handleUndoPayment(p: BillPayment) {
    if (!selectedBill || acting) return;
    if (!window.confirm(p.applied_from_payment_id
      ? `Take ${fmt(p.amount)} off this bill? It goes back to the advance, to use later.`
      : `Undo the payment of ${fmt(p.amount)} on ${fmtDate(p.payment_date)}? It comes out of the books and goes back on the bill.`)) return;
    setActing(true); setActionError(null);
    try {
      await undoBillPayment(p.id);
      setNotice(p.applied_from_payment_id ? `${fmt(p.amount)} went back to the advance.` : `Payment of ${fmt(p.amount)} undone.`);
      await refreshSelected(selectedBill.id);
    } catch (e: unknown) { setActionError(msg(e)); }
    finally { setActing(false); }
  }

  async function handleApprove() {
    if (!selectedBill || acting) return;
    setActing(true); setActionError(null);
    try {
      await approveBill(selectedBill.id);
      setNotice(`Bill ${selectedBill.invoice_number} approved.`);
      await refreshSelected(selectedBill.id);
    } catch (e: unknown) { setActionError(msg(e)); }
    finally { setActing(false); }
  }

  async function handleDispute() {
    if (!selectedBill || acting || disputing === null) return;
    if (disputing.trim().length < 3) { setActionError("Write what is wrong with the bill."); return; }
    setActing(true); setActionError(null);
    try {
      await disputeBill(selectedBill.id, disputing.trim());
      setDisputing(null);
      setNotice(`Bill ${selectedBill.invoice_number} marked disputed. It is out of the books until it is approved again.`);
      await refreshSelected(selectedBill.id);
    } catch (e: unknown) { setActionError(msg(e)); }
    finally { setActing(false); }
  }

  function closeDetail() {
    setPayments([]);
    setActionError(null);
    setDisputing(null);
    setSelectedBill(null);
    setLineItems([]);
    setLineItemsError(null);
  }

  const retentionHeld = selectedBill ? Math.round(((selectedBill.retention_amount || 0) - payments.filter(p => p.is_retention_release).reduce((t, p) => t + p.amount, 0)) * 100) / 100 : 0;
  const owedNow = selectedBill ? Math.round(((selectedBill.total_amount || 0) - (selectedBill.retention_amount || 0) - payments.filter(p => !p.is_retention_release).reduce((t, p) => t + p.amount, 0)) * 100) / 100 : 0;
  const canPay = canApprove && !!selectedBill && ["approved", "partial", "paid"].includes(selectedBill.status);

  // One combined search box covering invoice_number + supplier + project,
  // matching the same OR-across-fields shape used elsewhere (Clients'
  // search), rather than three separate dropdown filters.
  const filtered = bills.filter(b => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      b.invoice_number.toLowerCase().includes(q) ||
      (b.suppliers?.supplier_name || "").toLowerCase().includes(q) ||
      (b.projects?.name || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: bills.length,
    outstanding: bills.filter(b => b.status !== "paid").reduce((s, b) => s + (b.balance_due || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Payables"
        subtitle={`${stats.total} bills · ${fmt(stats.outstanding)} outstanding`}
        actions={
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadBills}/>
            {canApprove && <Btn variant="ghost" size="sm" icon={<HandCoins size={13}/>} onClick={() => setShowGive(true)} disabled={!companyId}>Give advance</Btn>}
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => setShowNew(true)} disabled={!companyId}>New bill</Btn>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
        {unsigned.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200">
            <div className="font-semibold flex items-center gap-1.5 mb-1"><PenTool size={13}/> {unsigned.length} cash payment{unsigned.length === 1 ? "" : "s"} not signed yet</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {unsigned.map(u => {
                const b = bills.find(x => x.id === u.invoice_id);
                return (
                  <button key={u.id} type="button" className="underline hover:no-underline text-left"
                    onClick={() => { if (b) void openDetail(b); else setProofFor({ id: u.id, amount: u.amount, signed: false, hasPhoto: false, name: u.supplier || "" }); }}>
                    {u.supplier || "Supplier"} · {fmt(u.amount)} · {fmtDate(u.payment_date)}{u.invoice_number ? ` · bill ${u.invoice_number}` : " · advance"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {advances.length > 0 && (
          <Card padding={false}>
            <div className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-200 dark:border-white/[0.06]">
              <HandCoins size={13}/> Advances not used up yet · {fmt(advances.reduce((t, a) => t + a.left, 0))}
            </div>
            <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
              {advances.map(a => (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {a.supplier} · {a.payment_number} · {fmtDate(a.payment_date)}{a.project ? ` · ${a.project}` : ""}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Given {fmt(a.given)} · <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(a.left)} left</span> to use on their bills
                      {a.signed_at ? ` · signed by ${a.received_by_name}` : ""}
                    </div>
                    {needsProof({ ...a, applied_from_payment_id: null }) && <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Not signed yet</div>}
                    {a.ledger_note && a.left > 0 && <div className="text-[10px] text-amber-600 dark:text-amber-400">{a.ledger_note}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Btn variant="ghost" size="sm" icon={<Printer size={12}/>} onClick={() => printAdvanceReceipt(a)}>Receipt</Btn>
                    {(!a.signed_at || !a.proof_path) && (
                      <Btn variant="ghost" size="sm" icon={<PenTool size={12}/>}
                        onClick={() => setProofFor({ id: a.id, amount: a.given, signed: !!a.signed_at, hasPhoto: !!a.proof_path, name: a.supplier })}>
                        {!a.signed_at ? "Sign / add photo" : "Add photo"}
                      </Btn>
                    )}
                    {canApprove && <Btn variant="ghost" size="sm" icon={<Undo2 size={12}/>} onClick={() => { void undoAdvance(a); }} disabled={acting}>Undo</Btn>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Tabs
          tabs={[
            { key: "all" as StatusFilter,      label: "All",      count: bills.length },
            { key: "pending" as StatusFilter,  label: "Pending",  count: bills.filter(b => b.status === "pending").length },
            { key: "approved" as StatusFilter, label: "Approved", count: bills.filter(b => b.status === "approved").length },
            { key: "partial" as StatusFilter,  label: "Partial",  count: bills.filter(b => b.status === "partial").length },
            { key: "paid" as StatusFilter,     label: "Paid",     count: bills.filter(b => b.status === "paid").length },
            { key: "disputed" as StatusFilter, label: "Disputed", count: bills.filter(b => b.status === "disputed").length },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />

        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
          <Input className="pl-8" placeholder="Search bill #, vendor, project..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading bills...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<Landmark size={20}/>}
            title={search || statusFilter !== "all" ? "No bills match" : "No bills yet"}
            body={search || statusFilter !== "all" ? "Try a different search or filter." : "Tap New bill to enter a bill from a supplier, subcontractor or workman."}
            action={
              (search || statusFilter !== "all")
                ? <Btn variant="ghost" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</Btn>
                : undefined
            }
          />
        ) : (
          <Card padding={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Invoice #</Th>
                  <Th>Vendor</Th>
                  <Th>Project</Th>
                  <Th>Due Date</Th>
                  <Th right>Total</Th>
                  <Th right>Balance</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <Tr key={b.id} onClick={() => openDetail(b)}>
                    <Td>
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{b.invoice_number}</span>
                      {b.ledger_note
                        ? <div className="text-[10px] text-amber-600 dark:text-amber-400 max-w-[14rem] truncate" title={b.ledger_note}>{b.ledger_note}</div>
                        : b.gl_transaction_id && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">In the books</div>}
                    </Td>
                    <Td><span className="font-medium text-slate-800 dark:text-slate-200">{b.suppliers?.supplier_name || "—"}</span></Td>
                    <Td muted>{b.projects?.name || "—"}</Td>
                    <Td muted className={new Date(b.due_date) < new Date() && b.status !== "paid" ? "text-red-400" : ""}>
                      {fmtDate(b.due_date)}
                    </Td>
                    <Td right>{fmt(b.total_amount)}</Td>
                    <Td right>
                      <span className={b.balance_due > 0 ? "text-red-400 font-semibold" : "text-slate-600"}>{fmt(b.balance_due)}</span>
                      {b.status === "partial" && (b.retention_amount || 0) > 0 && b.balance_due <= (b.retention_amount || 0) && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400">Retention held</div>
                      )}
                    </Td>
                    <Td><Badge color={STATUS_COLOR[b.status] || "slate"} dot>{b.status}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Bill Detail Modal — line items fetched on open, matching
          AccountsReceivablePage.tsx's detail-modal-not-a-separate-route
          pattern. */}
      <Modal open={!!selectedBill} onClose={closeDetail}
        title={selectedBill ? `Bill ${selectedBill.invoice_number}` : "Bill"}
        subtitle={selectedBill?.suppliers?.supplier_name || undefined}
        width="max-w-2xl">
        {selectedBill && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Status</div>
                <Badge color={STATUS_COLOR[selectedBill.status] || "slate"} dot>{selectedBill.status}</Badge>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Due</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fmtDate(selectedBill.due_date)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Total</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fmt(selectedBill.total_amount)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Balance</div>
                <div className={cn("text-sm font-semibold", selectedBill.balance_due > 0 ? "text-red-400" : "text-slate-800 dark:text-slate-200")}>{fmt(selectedBill.balance_due)}</div>
              </div>
            </div>

            {actionError && <Alert type="error" onClose={() => setActionError(null)}>{actionError}</Alert>}

            {selectedBill.ledger_note ? (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/> {selectedBill.ledger_note}
              </div>
            ) : selectedBill.gl_transaction_id ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={14}/> In the books
              </div>
            ) : null}

            {(selectedBill.retention_amount || 0) > 0 && (
              <div className="text-xs text-slate-500">
                Retention: <span className="font-medium text-slate-700 dark:text-slate-300">{fmt(selectedBill.retention_amount || 0)}</span>
                {retentionHeld > 0 ? ` - ${fmt(retentionHeld)} still held (paid when the work is accepted)` : " - paid"}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {selectedBill.bill_file_path ? (
                <Btn variant="ghost" size="sm" icon={<ImageIcon size={13}/>} onClick={() => { void viewBillFile(); }}>View bill</Btn>
              ) : (
                <label className={cn("inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400", acting ? "opacity-50" : "cursor-pointer hover:underline")}>
                  <ScanLine size={13}/> Attach bill picture
                  <input type="file" accept="image/*,application/pdf" className="hidden" disabled={acting}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void attachBillFile(f); }}/>
                </label>
              )}
            </div>

            {selectedBill.projects?.name && (
              <div className="text-xs text-slate-500 dark:text-slate-600">Project: <span className="text-slate-700 dark:text-slate-300 font-medium">{selectedBill.projects.name}</span></div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Package size={13}/> Line Items
              </div>
              {lineItemsError && <Alert type="error" onClose={() => setLineItemsError(null)}>{lineItemsError}</Alert>}
              {loadingLineItems ? (
                <div className="flex items-center justify-center py-8 text-xs text-slate-500">
                  <Spinner size={16}/> <span className="ml-2">Loading line items...</span>
                </div>
              ) : lineItems.length === 0 ? (
                <Empty icon={<Package size={16}/>} title="No line items" body="This bill has no recorded line items."/>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] overflow-hidden">
                  <Table>
                    <thead>
                      <tr><Th>#</Th><Th>Item</Th><Th>Cost account</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Amount</Th></tr>
                    </thead>
                    <tbody>
                      {lineItems.map(li => (
                        <Tr key={li.id}>
                          <Td muted>{li.line_no}</Td>
                          <Td>{li.item_name}</Td>
                          <Td muted>{(() => { const a = costAccounts.find(c => c.id === li.chart_account_id); return a ? `${a.code} ${a.name}` : "—"; })()}</Td>
                          <Td right>{li.quantity}</Td>
                          <Td right>{fmt(li.unit_cost)}</Td>
                          <Td right>{fmt(li.total_amount)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Banknote size={13}/> Payments
              </div>
              {payments.length === 0 ? (
                <div className="text-xs text-slate-500">No payments yet.</div>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] divide-y divide-slate-200 dark:divide-white/[0.06]">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">
                          {fmtDate(p.applied_on || p.payment_date)} · {p.applied_from_payment_id ? `From advance ${(p.payment_number || "").split("-").slice(0, 2).join("-")}` : p.is_retention_release ? "Retention paid" : (PAY_METHODS.find(m => m.value === p.payment_method)?.label || "Payment")}
                          {p.reference_number ? ` · ${p.reference_number}` : ""}
                        </div>
                        {p.ledger_note
                          ? <div className="text-[10px] text-amber-600 dark:text-amber-400">{p.ledger_note}</div>
                          : p.gl_transaction_id && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">In the books</div>}
                        {p.signed_at
                          ? <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Signed by {p.received_by_name} · {fmtDate(p.signed_at)}</div>
                          : needsProof(p) && <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Not signed yet</div>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {!p.applied_from_payment_id && <Btn variant="ghost" size="sm" icon={<Printer size={12}/>} onClick={() => printReceipt(p)}>Receipt</Btn>}
                          {p.proof_path && <Btn variant="ghost" size="sm" icon={<ImageIcon size={12}/>} onClick={() => { void viewPhoto(p); }}>Photo</Btn>}
                          {!p.applied_from_payment_id && (!p.signed_at || !p.proof_path) && (
                            <Btn variant={needsProof(p) ? "primary" : "ghost"} size="sm" icon={<PenTool size={12}/>}
                              onClick={() => setProofFor({ id: p.id, amount: p.amount, signed: !!p.signed_at, hasPhoto: !!p.proof_path, name: selectedBill.suppliers?.supplier_name || "" })}>
                              {!p.signed_at ? "Sign / add photo" : "Add photo"}
                            </Btn>
                          )}
                          {canApprove && (
                            <Btn variant="ghost" size="sm" icon={<Undo2 size={12}/>} onClick={() => { void handleUndoPayment(p); }} disabled={acting}>
                              {p.applied_from_payment_id ? "Unapply" : "Undo"}
                            </Btn>
                          )}
                        </div>
                      </div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 self-start">{fmt(p.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {disputing !== null && (
              <div className="space-y-2">
                <Input autoFocus placeholder="What is wrong with the bill? e.g. wrong amount, work not done" value={disputing}
                  onChange={e => setDisputing(e.target.value)}/>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => setDisputing(null)} disabled={acting}>Cancel</Btn>
                  <Btn variant="danger" size="sm" onClick={handleDispute} disabled={acting}>{acting ? "Saving..." : "Mark disputed"}</Btn>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              {canPay && disputing === null && owedNow > 0 && (
                <Btn variant="primary" size="sm" icon={<Banknote size={13}/>} onClick={() => setPaying("bill")} disabled={acting}>Pay bill</Btn>
              )}
              {canPay && disputing === null && owedNow > 0 && advances.some(a => a.supplier_id === selectedBill.supplier_id && a.left > 0) && (
                <Btn variant="secondary" size="sm" icon={<HandCoins size={13}/>} onClick={() => setApplying(true)} disabled={acting}>Use advance</Btn>
              )}
              {canPay && disputing === null && retentionHeld > 0 && (
                <Btn variant={owedNow > 0 ? "secondary" : "primary"} size="sm" onClick={() => setPaying("retention")} disabled={acting}>Pay retention</Btn>
              )}
              {canApprove && disputing === null && ["pending", "disputed"].includes(selectedBill.status) && (
                <Btn variant="primary" size="sm" onClick={handleApprove} disabled={acting}>{acting ? "Saving..." : "Approve"}</Btn>
              )}
              {canApprove && disputing === null && ["pending", "approved"].includes(selectedBill.status) && payments.length === 0 && (
                <Btn variant="ghost" size="sm" onClick={() => setDisputing("")} disabled={acting}>Dispute</Btn>
              )}
              <Btn variant="ghost" onClick={closeDetail}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>

      <AddProofModal open={!!proofFor} onClose={() => setProofFor(null)} companyId={companyId}
        payment={proofFor} defaultName={proofFor?.name || ""}
        onDone={m => { setNotice(m); if (selectedBill) void refreshSelected(selectedBill.id); else refreshSide(); }}/>

      <GiveAdvanceModal open={showGive} onClose={() => setShowGive(false)} companyId={companyId}
        onDone={m => { setNotice(m); refreshSide(); }}/>

      <ApplyAdvanceModal open={applying} onClose={() => setApplying(false)} companyId={companyId} owed={owedNow}
        bill={selectedBill ? { id: selectedBill.id, invoice_number: selectedBill.invoice_number, supplier_id: selectedBill.supplier_id, supplier: selectedBill.suppliers?.supplier_name || "the supplier" } : null}
        onDone={m => { setNotice(m); if (selectedBill) void refreshSelected(selectedBill.id); }}/>

      <PayBillModal open={paying !== null} onClose={() => setPaying(null)} retention={paying === "retention"} companyId={companyId}
        owed={paying === "retention" ? retentionHeld : owedNow}
        bill={selectedBill ? { id: selectedBill.id, invoice_number: selectedBill.invoice_number, supplier: selectedBill.suppliers?.supplier_name || "the supplier" } : null}
        onDone={m => { setNotice(m); if (selectedBill) void refreshSelected(selectedBill.id); }}/>

      <NewBillModal open={showNew} onClose={() => setShowNew(false)} companyId={companyId} canApprove={canApprove}
        onDone={msg => { setNotice(msg); loadBills(); }}/>
    </div>
  );
}
