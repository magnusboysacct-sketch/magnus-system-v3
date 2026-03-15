import { useEffect, useState } from "react";
import { FileText, Plus, RefreshCw, CircleCheck as CheckCircle2, Clock, DollarSign, TrendingUp, CircleAlert as AlertCircle } from "lucide-react";
import type {
  ContractBillingItem,
  ContractBillingCalculation,
  ContractBillingSummary,
  ClientInvoice,
  ClientInvoiceLineItem
} from "../lib/finance";
import {
  fetchContractBillingItems,
  calculateContractBilling,
  getContractBillingSummary,
  syncBOQToBillingItems,
  updateContractBillingItem,
  createClientInvoice,
  createInvoiceLineItems,
  updateBillingItemAfterInvoice
} from "../lib/finance";

interface Props {
  contractId: string;
  companyId: string;
  projectId: string;
  clientId: string;
  onInvoiceCreated?: () => void;
}

export default function ContractProgressBilling({
  contractId,
  companyId,
  projectId,
  clientId,
  onInvoiceCreated
}: Props) {
  const [billingItems, setBillingItems] = useState<ContractBillingItem[]>([]);
  const [calculations, setCalculations] = useState<ContractBillingCalculation[]>([]);
  const [summary, setSummary] = useState<ContractBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    loadData();
  }, [contractId]);

  async function loadData() {
    try {
      setLoading(true);
      const [items, summaryData] = await Promise.all([
        fetchContractBillingItems(contractId),
        getContractBillingSummary(contractId)
      ]);
      setBillingItems(items);
      setSummary(summaryData);
    } catch (error) {
      console.error("Error loading contract billing data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncFromBOQ() {
    try {
      setSyncing(true);
      const count = await syncBOQToBillingItems(contractId);
      alert(`Synced ${count} items from BOQ`);
      await loadData();
    } catch (error) {
      console.error("Error syncing BOQ:", error);
      alert("Failed to sync BOQ items");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCalculateBilling() {
    try {
      setCalculating(true);
      const calcs = await calculateContractBilling(contractId, invoiceDate);
      setCalculations(calcs);
      setShowBillingModal(true);
    } catch (error) {
      console.error("Error calculating billing:", error);
      alert("Failed to calculate billing");
    } finally {
      setCalculating(false);
    }
  }

  async function handleUpdateProgress(itemId: string, percentComplete: number) {
    try {
      await updateContractBillingItem(itemId, { percent_complete: percentComplete });
      await loadData();
    } catch (error) {
      console.error("Error updating progress:", error);
      alert("Failed to update progress");
    }
  }

  async function handleGenerateInvoice() {
    try {
      setGenerating(true);

      const selectedCalcs = calculations.filter(c => selectedItems.has(c.billing_item_id));
      if (selectedCalcs.length === 0) {
        alert("Please select at least one item to bill");
        return;
      }

      const subtotal = selectedCalcs.reduce((sum, c) => sum + Number(c.current_billing_amount), 0);
      const totalRetainage = selectedCalcs.reduce((sum, c) => sum + Number(c.retainage_amount), 0);
      const netTotal = selectedCalcs.reduce((sum, c) => sum + Number(c.net_amount_due), 0);

      const { data: { user } } = await (await import("../lib/supabase")).supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: lastInvoice } = await (await import("../lib/supabase")).supabase
        .from("client_invoices")
        .select("invoice_number")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNumber = 1;
      if (lastInvoice?.invoice_number) {
        const match = lastInvoice.invoice_number.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      const invoiceNumber = `INV-${String(nextNumber).padStart(5, "0")}`;

      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice: Partial<ClientInvoice> = {
        company_id: companyId,
        project_id: projectId,
        client_id: clientId,
        contract_id: contractId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate.toISOString().split("T")[0],
        subtotal: subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: netTotal,
        amount_paid: 0,
        balance_due: netTotal,
        status: "draft",
        notes: `Progress billing as of ${invoiceDate}\nRetainage held: ${formatCurrency(totalRetainage)}`,
        created_by: user.id
      };

      const createdInvoice = await createClientInvoice(invoice);

      const lineItemsToCreate = selectedCalcs.map((calc, i) => ({
        invoice_id: createdInvoice.id,
        company_id: companyId,
        line_number: i + 1,
        description: calc.description,
        quantity: Number(calc.current_billing_quantity),
        unit: calc.unit,
        rate: Number(calc.contract_rate),
        amount: Number(calc.net_amount_due),
        billing_item_id: calc.billing_item_id,
        boq_item_id: calc.boq_item_id,
        percent_complete: Number(calc.percent_complete),
        previously_billed: Number(calc.previously_billed_amount),
        retainage_percent: Number(calc.retainage_percent),
        retainage_amount: Number(calc.retainage_amount),
        notes: `${calc.percent_complete}% complete`
      }));

      await createInvoiceLineItems(lineItemsToCreate);

      for (const calc of selectedCalcs) {
        await updateBillingItemAfterInvoice(
          calc.billing_item_id,
          Number(calc.current_billing_amount),
          Number(calc.current_billing_quantity),
          Number(calc.retainage_amount)
        );
      }

      alert(`Invoice ${invoiceNumber} created successfully!`);
      setShowBillingModal(false);
      setSelectedItems(new Set());
      setCalculations([]);
      await loadData();

      if (onInvoiceCreated) {
        onInvoiceCreated();
      }
    } catch (error) {
      console.error("Error generating invoice:", error);
      alert("Failed to generate invoice");
    } finally {
      setGenerating(false);
    }
  }

  function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined) return "0%";
    return `${Number(value).toFixed(1)}%`;
  }

  function toggleItemSelection(itemId: string) {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading contract billing...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Contract Progress Billing</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncFromBOQ}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            Sync from BOQ
          </button>
          <button
            onClick={handleCalculateBilling}
            disabled={calculating || billingItems.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <DollarSign size={16} />
            Calculate Billing
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <FileText size={16} />
              Contract Amount
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary.contract_amount)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <CheckCircle2 size={16} />
              Billed to Date
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.total_billed_to_date)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatPercent(summary.percent_billed)} of contract
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <Clock size={16} />
              Retainage Held
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(summary.total_retainage_held)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <TrendingUp size={16} />
              Remaining Balance
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary.remaining_contract_balance)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatPercent(summary.percent_complete)} complete
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Contract Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Contract Amount</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">% Complete</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Previously Billed</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {billingItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No billing items. Click "Sync from BOQ" to import items.
                </td>
              </tr>
            ) : (
              billingItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-gray-900">{item.description}</div>
                    <div className="text-xs text-gray-500">Line {item.line_no}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {item.contract_quantity} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {formatCurrency(item.contract_rate)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium">
                    {formatCurrency(item.contract_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={item.percent_complete}
                        onChange={(e) => handleUpdateProgress(item.id!, parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm text-center border border-gray-300 rounded"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {formatCurrency(item.previously_billed_amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                    {formatCurrency(item.remaining_contract_balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showBillingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Generate Progress Invoice</h3>
                <button
                  onClick={() => setShowBillingModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3">
                <label className="block text-sm text-gray-600 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded"
                />
              </div>
            </div>

            <div className="p-6">
              {calculations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No billable items found. Update progress percentages and recalculate.
                </div>
              ) : (
                <>
                  <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={20} className="text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        Select items to include in this invoice. Only items with progress updates will appear.
                      </div>
                    </div>
                  </div>

                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={selectedItems.size === calculations.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItems(new Set(calculations.map(c => c.billing_item_id)));
                              } else {
                                setSelectedItems(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Item</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">% Complete</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Previously Billed</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Current Billing</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Retainage</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Net Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {calculations.map((calc) => (
                        <tr key={calc.billing_item_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(calc.billing_item_id)}
                              onChange={() => toggleItemSelection(calc.billing_item_id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{calc.description}</div>
                            <div className="text-xs text-gray-500">
                              {calc.current_billing_quantity} {calc.unit} @ {formatCurrency(calc.contract_rate)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">{formatPercent(calc.percent_complete)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {formatCurrency(calc.previously_billed_amount)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatCurrency(calc.current_billing_amount)}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-600">
                            ({formatCurrency(calc.retainage_amount)})
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-green-600">
                            {formatCurrency(calc.net_amount_due)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-right font-semibold">Totals:</td>
                        <td className="px-3 py-3 text-right font-bold">
                          {formatCurrency(
                            calculations
                              .filter(c => selectedItems.has(c.billing_item_id))
                              .reduce((sum, c) => sum + Number(c.current_billing_amount), 0)
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-orange-600">
                          ({formatCurrency(
                            calculations
                              .filter(c => selectedItems.has(c.billing_item_id))
                              .reduce((sum, c) => sum + Number(c.retainage_amount), 0)
                          )})
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-green-600">
                          {formatCurrency(
                            calculations
                              .filter(c => selectedItems.has(c.billing_item_id))
                              .reduce((sum, c) => sum + Number(c.net_amount_due), 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setShowBillingModal(false)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerateInvoice}
                      disabled={generating || selectedItems.size === 0}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {generating ? "Generating..." : "Generate Invoice"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
