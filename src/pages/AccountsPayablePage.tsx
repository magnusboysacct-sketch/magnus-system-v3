// src/pages/AccountsPayablePage.tsx
//
// Bills / Accounts Payable — browse/verify only this round, no create-new-
// bill form (bills currently arrive via the Import Wizard, not manual
// entry — a create flow is a separate, later addition if wanted). Mirrors
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
import type { SupplierInvoiceLineItem } from "../lib/finance";
import {
  PageHeader, Card, Badge, Btn, Input,
  Table, Th, Tr, Td, Empty, Modal, Alert, Tabs,
  Spinner, cn
} from "../components/ui";
import {
  Search, RefreshCw, Landmark, Package,
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
}

type StatusFilter = "all" | "pending" | "approved" | "partial" | "paid" | "disputed";

// Shared with FinancePage.tsx's own status coloring for the same
// underlying vocabulary, kept in sync intentionally rather than imported
// (FinancePage's map also covers client_invoices' separate draft/sent/
// overdue/cancelled values, which don't apply here).
const STATUS_COLOR: Record<string, any> = {
  pending: "amber", approved: "cyan", partial: "amber",
  paid: "green", disputed: "red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 0
  }).format(n || 0);
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

  useEffect(() => { loadBills(); }, []);

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
          .select("id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, supplier_id, project_id, suppliers(supplier_name), projects(name)")
          .order("due_date", { ascending: true })
          .range(from, from + PAGE - 1);
        if (e) throw e;
        all = all.concat((page as any) || []);
        if (!page || page.length < PAGE) break;
        from += PAGE;
      }
      setBills(all);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function openDetail(bill: SupplierInvoiceRow) {
    setSelectedBill(bill);
    setLoadingLineItems(true);
    setLineItemsError(null);
    try {
      const items = await fetchSupplierInvoiceLineItems(bill.id);
      setLineItems(items);
    } catch (e: any) {
      setLineItemsError(e.message);
    } finally {
      setLoadingLineItems(false);
    }
  }

  function closeDetail() {
    setSelectedBill(null);
    setLineItems([]);
    setLineItemsError(null);
  }

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
          <Btn variant="ghost" size="sm"
            icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
            onClick={loadBills}/>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

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
            body={search || statusFilter !== "all" ? "Try a different search or filter." : "Bills imported via the Import Wizard will appear here."}
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
                    <Td><span className="font-mono text-xs text-slate-300">{b.invoice_number}</span></Td>
                    <Td><span className="font-medium text-slate-800 dark:text-slate-200">{b.suppliers?.supplier_name || "—"}</span></Td>
                    <Td muted>{b.projects?.name || "—"}</Td>
                    <Td muted className={new Date(b.due_date) < new Date() && b.status !== "paid" ? "text-red-400" : ""}>
                      {fmtDate(b.due_date)}
                    </Td>
                    <Td right>{fmt(b.total_amount)}</Td>
                    <Td right><span className={b.balance_due > 0 ? "text-red-400 font-semibold" : "text-slate-600"}>{fmt(b.balance_due)}</span></Td>
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
                      <tr><Th>#</Th><Th>Item</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Amount</Th></tr>
                    </thead>
                    <tbody>
                      {lineItems.map(li => (
                        <Tr key={li.id}>
                          <Td muted>{li.line_no}</Td>
                          <Td>{li.item_name}</Td>
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

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              <Btn variant="ghost" onClick={closeDetail}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
