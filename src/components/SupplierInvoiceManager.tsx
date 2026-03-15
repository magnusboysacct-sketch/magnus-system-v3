import { useEffect, useState } from "react";
import { CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Circle as XCircle, FileText, Eye, Plus, RefreshCw } from "lucide-react";
import type { SupplierInvoice, SupplierInvoiceLineItem, ThreeWayMatchResult } from "../lib/finance";
import {
  fetchSupplierInvoices,
  fetchSupplierInvoiceLineItems,
  performThreeWayMatch
} from "../lib/finance";

interface Props {
  projectId?: string;
  companyId: string;
}

export default function SupplierInvoiceManager({ projectId, companyId }: Props) {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoice | null>(null);
  const [lineItems, setLineItems] = useState<SupplierInvoiceLineItem[]>([]);
  const [matchResult, setMatchResult] = useState<ThreeWayMatchResult | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [projectId, companyId]);

  async function loadInvoices() {
    try {
      setLoading(true);
      const data = await fetchSupplierInvoices(companyId);
      const filtered = projectId
        ? data.filter(inv => inv.project_id === projectId)
        : data;
      setInvoices(filtered);
    } catch (error) {
      console.error("Error loading supplier invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadInvoiceDetails(invoice: SupplierInvoice) {
    try {
      setSelectedInvoice(invoice);
      const items = await fetchSupplierInvoiceLineItems(invoice.id);
      setLineItems(items);
      setShowDetailModal(true);
    } catch (error) {
      console.error("Error loading invoice details:", error);
    }
  }

  async function runThreeWayMatch(invoiceId: string) {
    try {
      setMatching(true);
      const result = await performThreeWayMatch(invoiceId);
      setMatchResult(result);
      await loadInvoices();
      if (selectedInvoice?.id === invoiceId) {
        const items = await fetchSupplierInvoiceLineItems(invoiceId);
        setLineItems(items);
      }
    } catch (error) {
      console.error("Error performing 3-way match:", error);
      alert("Failed to perform 3-way match");
    } finally {
      setMatching(false);
    }
  }

  function getMatchStatusBadge(status?: string | null) {
    switch (status) {
      case "matched":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <CheckCircle2 size={14} />
            Matched
          </span>
        );
      case "mismatch":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
            <AlertTriangle size={14} />
            Mismatch
          </span>
        );
      case "no_po":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            <XCircle size={14} />
            No PO
          </span>
        );
      case "no_receiving":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
            <AlertTriangle size={14} />
            Not Received
          </span>
        );
      case "overbilling":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            <XCircle size={14} />
            Overbilling
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
            Pending
          </span>
        );
    }
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { bg: string; text: string }> = {
      pending: { bg: "bg-yellow-100", text: "text-yellow-800" },
      approved: { bg: "bg-green-100", text: "text-green-800" },
      partial: { bg: "bg-blue-100", text: "text-blue-800" },
      paid: { bg: "bg-gray-100", text: "text-gray-800" },
      disputed: { bg: "bg-red-100", text: "text-red-800" },
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading supplier invoices...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Supplier Invoices & 3-Way Matching</h2>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Supplier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Match Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No supplier invoices found
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {invoice.supplier_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {formatCurrency(invoice.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {getStatusBadge(invoice.status)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {getMatchStatusBadge(invoice.three_way_match_status)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadInvoiceDetails(invoice)}
                        className="p-1 text-gray-600 hover:text-blue-600 rounded hover:bg-blue-50"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => runThreeWayMatch(invoice.id)}
                        disabled={matching}
                        className="p-1 text-gray-600 hover:text-green-600 rounded hover:bg-green-50 disabled:opacity-50"
                        title="Run 3-Way Match"
                      >
                        <RefreshCw size={16} className={matching ? "animate-spin" : ""} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Invoice Details: {selectedInvoice.invoice_number}
                  </h3>
                  <div className="flex items-center gap-3 mt-2">
                    {getStatusBadge(selectedInvoice.status)}
                    {getMatchStatusBadge(selectedInvoice.three_way_match_status)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setMatchResult(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Invoice Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.invoice_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Due Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.due_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(selectedInvoice.total_amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Balance Due</p>
                  <p className="text-lg font-bold text-orange-600">{formatCurrency(selectedInvoice.balance_due)}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">Line Items</h4>
                  <button
                    onClick={() => runThreeWayMatch(selectedInvoice.id)}
                    disabled={matching}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={matching ? "animate-spin" : ""} />
                    Run 3-Way Match
                  </button>
                </div>

                {lineItems.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No line items found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Item</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Unit Cost</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Total</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Match Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {lineItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">{item.item_name}</div>
                              {item.description && (
                                <div className="text-xs text-gray-500">{item.description}</div>
                              )}
                              {item.match_notes && (
                                <div className="text-xs text-red-600 mt-1">{item.match_notes}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div>{item.quantity} {item.unit}</div>
                              {item.po_quantity && (
                                <div className="text-xs text-gray-500">PO: {item.po_quantity}</div>
                              )}
                              {item.received_quantity !== null && item.received_quantity !== undefined && (
                                <div className="text-xs text-gray-500">Rcv: {item.received_quantity}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div>{formatCurrency(item.unit_cost)}</div>
                              {item.po_unit_cost && (
                                <div className="text-xs text-gray-500">PO: {formatCurrency(item.po_unit_cost)}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatCurrency(item.total_amount)}
                            </td>
                            <td className="px-3 py-2">
                              {item.match_status === "matched" && (
                                <span className="text-green-600 text-xs">✓ Matched</span>
                              )}
                              {item.match_status === "quantity_mismatch" && (
                                <span className="text-yellow-600 text-xs">Qty Mismatch</span>
                              )}
                              {item.match_status === "price_mismatch" && (
                                <span className="text-yellow-600 text-xs">Price Mismatch</span>
                              )}
                              {item.match_status === "not_received" && (
                                <span className="text-orange-600 text-xs">Not Received</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {matchResult && (
                <div className={`border rounded-lg p-4 ${
                  matchResult.match_status === "matched"
                    ? "bg-green-50 border-green-200"
                    : "bg-yellow-50 border-yellow-200"
                }`}>
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    {matchResult.match_status === "matched" ? (
                      <CheckCircle2 size={20} className="text-green-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-yellow-600" />
                    )}
                    3-Way Match Result
                  </h4>
                  <div className="text-sm space-y-1">
                    <p><strong>Status:</strong> {matchResult.match_status}</p>
                    <p><strong>Invoice Total:</strong> {formatCurrency(matchResult.match_details.total_invoice_amount)}</p>
                    <p><strong>PO Total:</strong> {formatCurrency(matchResult.match_details.total_po_amount)}</p>
                    {matchResult.can_auto_approve && (
                      <p className="text-green-700 font-medium">✓ Auto-approved (perfect match)</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
