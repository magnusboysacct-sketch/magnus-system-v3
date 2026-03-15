import React, { useEffect, useState } from "react";
import { FileText, Plus, DollarSign, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from "lucide-react";
import { fetchClientInvoices, createClientInvoice } from "../lib/finance";
import type { ClientInvoice } from "../lib/finance";

export default function AccountsReceivablePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "overdue" | "paid">("all");

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const data = await fetchClientInvoices(profile.company_id);
      setInvoices(data);
    } catch (error) {
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredInvoices = invoices.filter((inv) => filter === "all" || inv.status === filter);

  const summary = {
    total: invoices.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + Number(i.balance_due), 0),
    overdue: invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + Number(i.balance_due), 0),
    paid: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total_amount), 0),
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Receivable</h1>
          <p className="text-sm text-slate-600">Manage client invoices and payments</p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={18} />
          New Invoice
        </button>
      </div>

      <div className="p-8">
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5">
                <DollarSign size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Outstanding</div>
                <div className="text-2xl font-bold text-slate-900">${summary.total.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2.5">
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Overdue</div>
                <div className="text-2xl font-bold text-red-600">${summary.overdue.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2.5">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Paid (YTD)</div>
                <div className="text-2xl font-bold text-green-600">${summary.paid.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All Invoices</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Due Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-slate-400" />
                      <span className="font-mono text-sm font-medium text-slate-900">{inv.invoice_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{inv.clients?.name || "-"}</div>
                    {inv.projects?.name && <div className="text-xs text-slate-500">{inv.projects.name}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{inv.invoice_date}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{inv.due_date}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-slate-900">
                    ${Number(inv.total_amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">
                    ${Number(inv.balance_due).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        inv.status === "paid"
                          ? "bg-green-50 text-green-700"
                          : inv.status === "overdue"
                          ? "bg-red-50 text-red-700"
                          : inv.status === "sent"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredInvoices.length === 0 && (
            <div className="py-12 text-center">
              <FileText size={48} className="mx-auto mb-4 text-slate-300" />
              <div className="text-lg font-medium text-slate-900">No invoices found</div>
              <div className="mt-1 text-sm text-slate-600">Create your first client invoice to get started</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
