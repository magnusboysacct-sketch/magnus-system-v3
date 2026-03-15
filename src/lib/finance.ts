import { supabase } from "./supabase";

export interface ClientInvoice {
  id: string;
  company_id: string;
  project_id?: string | null;
  client_id?: string | null;
  contract_id?: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
  notes?: string | null;
  terms?: string | null;
  sent_date?: string | null;
  paid_date?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface ClientInvoiceLineItem {
  id?: string;
  invoice_id: string;
  company_id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  notes?: string | null;
  boq_item_id?: string | null;
  milestone_id?: string | null;
  billing_item_id?: string | null;
  percent_complete?: number | null;
  previously_billed?: number | null;
  retainage_percent?: number | null;
  retainage_amount?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClientPayment {
  id: string;
  company_id: string;
  client_id?: string | null;
  invoice_id?: string | null;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: "check" | "ach" | "wire" | "credit_card" | "cash" | "other";
  reference_number?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export interface SupplierInvoice {
  id: string;
  company_id: string;
  supplier_id?: string | null;
  project_id?: string | null;
  purchase_order_id?: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: "pending" | "approved" | "partial" | "paid" | "disputed";
  po_matched: boolean;
  receiving_matched: boolean;
  three_way_match_status?: "pending" | "matched" | "mismatch" | "no_po" | "no_receiving" | "overbilling" | null;
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface SupplierInvoiceLineItem {
  id?: string;
  supplier_invoice_id: string;
  purchase_order_item_id?: string | null;
  line_no: number;
  item_name: string;
  description?: string | null;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  po_quantity?: number | null;
  po_unit_cost?: number | null;
  received_quantity?: number | null;
  match_status?: "matched" | "quantity_mismatch" | "price_mismatch" | "not_received" | "pending" | null;
  match_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ThreeWayMatchResult {
  match_status: "matched" | "mismatch" | "no_po" | "no_receiving" | "overbilling" | "error";
  match_details: {
    total_invoice_amount: number;
    total_po_amount: number;
    line_items: Array<{
      line_no: number;
      item_name: string;
      status: string;
      notes: string;
      invoice_qty: number;
      invoice_cost: number;
      po_qty?: number;
      po_cost?: number;
      received_qty?: number;
    }>;
  };
  can_auto_approve: boolean;
}

export interface Expense {
  id: string;
  company_id: string;
  project_id?: string | null;
  category_id?: string | null;
  worker_id?: string | null;
  expense_date: string;
  vendor?: string | null;
  description: string;
  amount: number;
  payment_method?: string | null;
  receipt_url?: string | null;
  ocr_processed: boolean;
  ocr_confidence?: number | null;
  ocr_data?: any;
  status: "pending" | "approved" | "reimbursed" | "rejected";
  approved_by?: string | null;
  approved_at?: string | null;
  reimbursed_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface BankAccount {
  id: string;
  company_id: string;
  account_name: string;
  account_type: "checking" | "savings" | "credit" | "line_of_credit";
  account_number_last_4?: string | null;
  bank_name?: string | null;
  current_balance: number;
  available_balance: number;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CashTransaction {
  id: string;
  company_id: string;
  bank_account_id?: string | null;
  transaction_date: string;
  transaction_type: "income" | "expense" | "transfer";
  category?: string | null;
  amount: number;
  balance_after?: number | null;
  description: string;
  reference_number?: string | null;
  client_payment_id?: string | null;
  supplier_payment_id?: string | null;
  expense_id?: string | null;
  payroll_entry_id?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export async function fetchClientInvoices(companyId: string) {
  const { data, error } = await supabase
    .from("client_invoices")
    .select("*, clients(name), projects(name)")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createClientInvoice(invoice: Partial<ClientInvoice>) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("client_invoices")
    .insert([
      {
        ...invoice,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ClientInvoice;
}

export async function updateClientInvoice(id: string, updates: Partial<ClientInvoice>) {
  const { data, error } = await supabase
    .from("client_invoices")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ClientInvoice;
}

export async function fetchInvoiceLineItems(invoiceId: string) {
  const { data, error } = await supabase
    .from("client_invoice_line_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_number", { ascending: true });

  if (error) throw error;
  return data as ClientInvoiceLineItem[];
}

export async function createInvoiceLineItems(lineItems: Partial<ClientInvoiceLineItem>[]) {
  const { data, error } = await supabase
    .from("client_invoice_line_items")
    .insert(lineItems)
    .select();

  if (error) throw error;
  return data as ClientInvoiceLineItem[];
}

export async function updateInvoiceLineItem(id: string, updates: Partial<ClientInvoiceLineItem>) {
  const { data, error } = await supabase
    .from("client_invoice_line_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ClientInvoiceLineItem;
}

export async function deleteInvoiceLineItem(id: string) {
  const { error } = await supabase
    .from("client_invoice_line_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function fetchInvoicePayments(invoiceId: string) {
  const { data, error } = await supabase
    .from("client_payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });

  if (error) throw error;
  return data as ClientPayment[];
}

export async function createClientPayment(payment: Partial<ClientPayment>) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("client_payments")
    .insert([
      {
        ...payment,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  if (data) {
    let projectId: string | null = null;
    let clientName = "Client";

    if (data.invoice_id) {
      const { data: invoice } = await supabase
        .from("client_invoices")
        .select("project_id, clients(name)")
        .eq("id", data.invoice_id)
        .maybeSingle();

      if (invoice) {
        projectId = invoice.project_id;
        const clients = invoice.clients as any;
        clientName = clients?.name || clientName;
      }
    } else if (data.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", data.client_id)
        .maybeSingle();

      if (client) {
        clientName = client.name;
      }
    }

    const description = `Payment from ${clientName}${data.reference_number ? ` (Ref: ${data.reference_number})` : ""}`;

    const { error: cashError } = await supabase
      .from("cash_transactions")
      .insert({
        company_id: data.company_id,
        transaction_date: data.payment_date,
        transaction_type: "income",
        category: "client_payment",
        amount: data.amount,
        description,
        reference_number: data.reference_number,
        client_payment_id: data.id,
        created_by: user?.id,
      });

    if (cashError) {
      console.error("Error creating cash transaction from client payment:", cashError);
    }
  }

  return data as ClientPayment;
}

export async function updateInvoiceAfterPayment(invoiceId: string) {
  // Fetch all payments for this invoice
  const payments = await fetchInvoicePayments(invoiceId);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Fetch invoice to get total
  const { data: invoice, error: invError } = await supabase
    .from("client_invoices")
    .select("total_amount, due_date")
    .eq("id", invoiceId)
    .single();

  if (invError) throw invError;

  const balanceDue = Number(invoice.total_amount) - totalPaid;
  const isOverdue = new Date(invoice.due_date) < new Date() && balanceDue > 0;

  let status: ClientInvoice["status"] = "draft";
  if (balanceDue <= 0) {
    status = "paid";
  } else if (totalPaid > 0) {
    status = "partial";
  } else if (isOverdue) {
    status = "overdue";
  } else {
    status = "sent";
  }

  // Update invoice
  const { data, error } = await supabase
    .from("client_invoices")
    .update({
      amount_paid: totalPaid,
      balance_due: balanceDue,
      status,
      paid_date: balanceDue <= 0 ? new Date().toISOString().split("T")[0] : null,
    })
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchSupplierInvoices(companyId: string) {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("*, suppliers(name), projects(name), purchase_orders(po_number)")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createSupplierInvoice(invoice: Partial<SupplierInvoice>) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("supplier_invoices")
    .insert([
      {
        ...invoice,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as SupplierInvoice;
}

export async function approveSupplierInvoice(id: string) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("supplier_invoices")
    .update({
      status: "approved",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchExpenses(companyId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*, projects(name), workers(first_name, last_name), expense_categories(name)")
    .eq("company_id", companyId)
    .order("expense_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createExpense(expense: Partial<Expense>) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("expenses")
    .insert([
      {
        ...expense,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as Expense;
}

export async function approveExpense(id: string, markAsPaid: boolean = false) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: expense, error: fetchError } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const updateData: any = {
    status: markAsPaid ? "reimbursed" : "approved",
    approved_by: user?.id,
    approved_at: new Date().toISOString(),
  };

  if (markAsPaid) {
    updateData.reimbursed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("expenses")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  if (expense && expense.project_id) {
    const { data: category } = await supabase
      .from("expense_categories")
      .select("category_type")
      .eq("id", expense.category_id)
      .maybeSingle();

    const categoryType = category?.category_type || "other";
    let costType: "material" | "labor" | "equipment" | "other" = "other";

    if (categoryType === "materials") {
      costType = "material";
    } else if (categoryType === "labor") {
      costType = "labor";
    } else if (categoryType === "equipment") {
      costType = "equipment";
    }

    const { error: costError } = await supabase
      .from("project_costs")
      .insert({
        project_id: expense.project_id,
        cost_type: costType,
        source_id: id,
        source_type: "expense",
        description: expense.description,
        amount: expense.amount,
        cost_date: expense.expense_date,
        notes: `Auto-created from approved expense${expense.vendor ? ` - ${expense.vendor}` : ""}`,
      });

    if (costError) {
      console.error("Error creating project_cost from expense:", costError);
    }
  }

  if (markAsPaid) {
    const { data: worker } = expense.worker_id
      ? await supabase
          .from("workers")
          .select("first_name, last_name")
          .eq("id", expense.worker_id)
          .maybeSingle()
      : { data: null };

    const workerName = worker
      ? `${worker.first_name} ${worker.last_name}`
      : "Employee";

    const description = expense.worker_id
      ? `Expense reimbursement to ${workerName} - ${expense.description}`
      : `Expense payment - ${expense.description}${expense.vendor ? ` (${expense.vendor})` : ""}`;

    const { error: cashError } = await supabase
      .from("cash_transactions")
      .insert({
        company_id: expense.company_id,
        transaction_date: new Date().toISOString().split("T")[0],
        transaction_type: "expense",
        category: expense.worker_id ? "expense_reimbursement" : "expense_payment",
        amount: expense.amount,
        description,
        expense_id: id,
        created_by: user?.id,
      });

    if (cashError) {
      console.error("Error creating cash transaction from expense:", cashError);
    }
  }

  return data;
}

export async function reimburseExpense(id: string) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: expense, error: fetchError } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from("expenses")
    .update({
      status: "reimbursed",
      reimbursed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  if (expense) {
    const { data: worker } = expense.worker_id
      ? await supabase
          .from("workers")
          .select("first_name, last_name")
          .eq("id", expense.worker_id)
          .maybeSingle()
      : { data: null };

    const workerName = worker
      ? `${worker.first_name} ${worker.last_name}`
      : "Employee";

    const description = expense.worker_id
      ? `Expense reimbursement to ${workerName} - ${expense.description}`
      : `Expense payment - ${expense.description}${expense.vendor ? ` (${expense.vendor})` : ""}`;

    const { error: cashError } = await supabase
      .from("cash_transactions")
      .insert({
        company_id: expense.company_id,
        transaction_date: new Date().toISOString().split("T")[0],
        transaction_type: "expense",
        category: expense.worker_id ? "expense_reimbursement" : "expense_payment",
        amount: expense.amount,
        description,
        expense_id: id,
        created_by: user?.id,
      });

    if (cashError) {
      console.error("Error creating cash transaction from expense:", cashError);
    }
  }

  return data;
}

export async function fetchBankAccounts(companyId: string) {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false });

  if (error) throw error;
  return data as BankAccount[];
}

export async function fetchCashTransactions(companyId: string, startDate?: string, endDate?: string) {
  let query = supabase
    .from("cash_transactions")
    .select("*, bank_accounts(account_name)")
    .eq("company_id", companyId);

  if (startDate) query = query.gte("transaction_date", startDate);
  if (endDate) query = query.lte("transaction_date", endDate);

  const { data, error } = await query.order("transaction_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getCashFlowSummary(companyId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("cash_transactions")
    .select("transaction_type, amount")
    .eq("company_id", companyId)
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate);

  if (error) throw error;

  const income = data
    ?.filter((t) => t.transaction_type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

  const expenses = data
    ?.filter((t) => t.transaction_type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

  return {
    income,
    expenses,
    netCashFlow: income - expenses,
  };
}

export async function getARSummary(companyId: string) {
  const { data, error } = await supabase
    .from("client_invoices")
    .select("status, balance_due")
    .eq("company_id", companyId)
    .neq("status", "cancelled");

  if (error) throw error;

  const totalOutstanding = data?.reduce((sum, inv) => sum + Number(inv.balance_due), 0) || 0;
  const overdue = data?.filter((inv) => inv.status === "overdue").length || 0;

  return {
    totalOutstanding,
    overdueCount: overdue,
  };
}

export async function getAPSummary(companyId: string) {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("status, balance_due")
    .eq("company_id", companyId)
    .in("status", ["pending", "approved", "partial"]);

  if (error) throw error;

  const totalDue = data?.reduce((sum, inv) => sum + Number(inv.balance_due), 0) || 0;
  const pendingApproval = data?.filter((inv) => inv.status === "pending").length || 0;

  return {
    totalDue,
    pendingApprovalCount: pendingApproval,
  };
}

export interface SupplierPayment {
  id: string;
  company_id: string;
  supplier_id?: string | null;
  invoice_id?: string | null;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: "check" | "ach" | "wire" | "credit_card" | "cash" | "other";
  check_number?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export interface ProjectFinanceSummary {
  project_id: string;
  company_id: string;
  project_name: string;
  project_status: string;
  budget_total: number;
  committed_total: number;
  actual_total: number;
  billed_total: number;
  received_total: number;
  ar_outstanding: number;
  ap_outstanding: number;
  budget_variance: number;
  committed_variance: number;
  projected_margin: number;
  margin_percent: number;
  cost_completion_percent: number;
  billing_completion_percent: number;
  collection_percent: number;
  created_at?: string;
  updated_at?: string;
}

export async function fetchProjectFinanceSummary(projectId: string) {
  const { data, error } = await supabase
    .from("v_project_finance_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data as ProjectFinanceSummary | null;
}

export async function fetchAllProjectsFinanceSummary(companyId: string) {
  const { data, error } = await supabase
    .from("v_project_finance_summary")
    .select("*")
    .eq("company_id", companyId)
    .order("project_name", { ascending: true });

  if (error) throw error;
  return data as ProjectFinanceSummary[];
}

export async function fetchSupplierInvoiceLineItems(invoiceId: string) {
  const { data, error } = await supabase
    .from("supplier_invoice_line_items")
    .select("*")
    .eq("supplier_invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  if (error) throw error;
  return data as SupplierInvoiceLineItem[];
}

export async function createSupplierInvoiceLineItem(lineItem: Partial<SupplierInvoiceLineItem>) {
  const { data, error } = await supabase
    .from("supplier_invoice_line_items")
    .insert([lineItem])
    .select()
    .single();

  if (error) throw error;
  return data as SupplierInvoiceLineItem;
}

export async function updateSupplierInvoiceLineItem(id: string, updates: Partial<SupplierInvoiceLineItem>) {
  const { data, error } = await supabase
    .from("supplier_invoice_line_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as SupplierInvoiceLineItem;
}

export async function deleteSupplierInvoiceLineItem(id: string) {
  const { error } = await supabase
    .from("supplier_invoice_line_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function performThreeWayMatch(invoiceId: string): Promise<ThreeWayMatchResult> {
  const { data, error } = await supabase.rpc("perform_three_way_match", {
    p_supplier_invoice_id: invoiceId,
  });

  if (error) throw error;

  if (!data || data.length === 0) {
    throw new Error("No match result returned");
  }

  return {
    match_status: data[0].match_status,
    match_details: data[0].match_details,
    can_auto_approve: data[0].can_auto_approve,
  };
}

export async function autoApproveMatchedInvoice(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("auto_approve_matched_invoice", {
    p_supplier_invoice_id: invoiceId,
  });

  if (error) throw error;
  return data as boolean;
}

export interface ContractBillingItem {
  id?: string;
  company_id: string;
  contract_id: string;
  boq_item_id?: string | null;
  line_no: number;
  description: string;
  unit: string;
  contract_quantity: number;
  contract_rate: number;
  contract_amount: number;
  percent_complete: number;
  quantity_completed: number;
  previously_billed_amount: number;
  previously_billed_quantity: number;
  retainage_percent: number;
  total_retainage_held: number;
  current_amount_due: number;
  remaining_contract_balance: number;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContractMilestone {
  id?: string;
  company_id: string;
  contract_id: string;
  milestone_no: number;
  milestone_name: string;
  description?: string | null;
  milestone_amount: number;
  percent_complete: number;
  is_completed: boolean;
  scheduled_date?: string | null;
  completion_date?: string | null;
  billed_amount: number;
  retainage_percent: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContractBillingCalculation {
  billing_item_id: string;
  boq_item_id: string | null;
  line_no: number;
  description: string;
  unit: string;
  contract_quantity: number;
  contract_rate: number;
  contract_amount: number;
  percent_complete: number;
  quantity_completed: number;
  previously_billed_amount: number;
  current_billing_quantity: number;
  current_billing_amount: number;
  retainage_percent: number;
  retainage_amount: number;
  net_amount_due: number;
  remaining_balance: number;
}

export interface ContractBillingSummary {
  contract_amount: number;
  total_billed_to_date: number;
  total_retainage_held: number;
  total_paid: number;
  total_outstanding: number;
  remaining_contract_balance: number;
  percent_billed: number;
  percent_complete: number;
}

export async function fetchContractBillingItems(contractId: string) {
  const { data, error } = await supabase
    .from("contract_billing_items")
    .select("*")
    .eq("contract_id", contractId)
    .eq("is_active", true)
    .order("line_no", { ascending: true });

  if (error) throw error;
  return data as ContractBillingItem[];
}

export async function fetchContractMilestones(contractId: string) {
  const { data, error } = await supabase
    .from("contract_milestones")
    .select("*")
    .eq("contract_id", contractId)
    .order("milestone_no", { ascending: true });

  if (error) throw error;
  return data as ContractMilestone[];
}

export async function createContractBillingItem(item: Partial<ContractBillingItem>) {
  const { data, error } = await supabase
    .from("contract_billing_items")
    .insert([item])
    .select()
    .single();

  if (error) throw error;
  return data as ContractBillingItem;
}

export async function updateContractBillingItem(id: string, updates: Partial<ContractBillingItem>) {
  const { data, error } = await supabase
    .from("contract_billing_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ContractBillingItem;
}

export async function createContractMilestone(milestone: Partial<ContractMilestone>) {
  const { data, error } = await supabase
    .from("contract_milestones")
    .insert([milestone])
    .select()
    .single();

  if (error) throw error;
  return data as ContractMilestone;
}

export async function updateContractMilestone(id: string, updates: Partial<ContractMilestone>) {
  const { data, error } = await supabase
    .from("contract_milestones")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ContractMilestone;
}

export async function calculateContractBilling(
  contractId: string,
  billingDate?: string
): Promise<ContractBillingCalculation[]> {
  const { data, error } = await supabase.rpc("calculate_contract_billing", {
    p_contract_id: contractId,
    p_billing_date: billingDate || new Date().toISOString().split("T")[0],
  });

  if (error) throw error;
  return (data || []) as ContractBillingCalculation[];
}

export async function getContractBillingSummary(contractId: string): Promise<ContractBillingSummary> {
  const { data, error } = await supabase.rpc("get_contract_billing_summary", {
    p_contract_id: contractId,
  });

  if (error) throw error;

  if (!data || data.length === 0) {
    return {
      contract_amount: 0,
      total_billed_to_date: 0,
      total_retainage_held: 0,
      total_paid: 0,
      total_outstanding: 0,
      remaining_contract_balance: 0,
      percent_billed: 0,
      percent_complete: 0,
    };
  }

  return data[0] as ContractBillingSummary;
}

export async function syncBOQToBillingItems(contractId: string): Promise<number> {
  const { data, error } = await supabase.rpc("sync_boq_to_billing_items", {
    p_contract_id: contractId,
  });

  if (error) throw error;
  return data as number;
}

export async function updateBillingItemAfterInvoice(
  billingItemId: string,
  billedAmount: number,
  billedQuantity: number,
  retainageAmount: number
): Promise<void> {
  const { error } = await supabase.rpc("update_billing_item_after_invoice", {
    p_billing_item_id: billingItemId,
    p_billed_amount: billedAmount,
    p_billed_quantity: billedQuantity,
    p_retainage_amount: retainageAmount,
  });

  if (error) throw error;
}

export async function createSupplierPayment(payment: Partial<SupplierPayment>) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("supplier_payments")
    .insert([
      {
        ...payment,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  if (data) {
    let projectId: string | null = null;
    let supplierName = "Supplier";

    if (data.invoice_id) {
      const { data: invoice } = await supabase
        .from("supplier_invoices")
        .select("project_id, suppliers(name)")
        .eq("id", data.invoice_id)
        .maybeSingle();

      if (invoice) {
        projectId = invoice.project_id;
        const suppliers = invoice.suppliers as any;
        supplierName = suppliers?.name || supplierName;
      }
    } else if (data.supplier_id) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", data.supplier_id)
        .maybeSingle();

      if (supplier) {
        supplierName = supplier.name;
      }
    }

    const refInfo = data.check_number ? `Check #${data.check_number}` : data.reference_number ? `Ref: ${data.reference_number}` : "";
    const description = `Payment to ${supplierName}${refInfo ? ` (${refInfo})` : ""}`;

    const { error: cashError } = await supabase
      .from("cash_transactions")
      .insert({
        company_id: data.company_id,
        transaction_date: data.payment_date,
        transaction_type: "expense",
        category: "supplier_payment",
        amount: data.amount,
        description,
        reference_number: data.reference_number || data.check_number,
        supplier_payment_id: data.id,
        created_by: user?.id,
      });

    if (cashError) {
      console.error("Error creating cash transaction from supplier payment:", cashError);
    }

    if (data.invoice_id) {
      const { data: invoice, error: invError } = await supabase
        .from("supplier_invoices")
        .select("total_amount")
        .eq("id", data.invoice_id)
        .single();

      if (!invError && invoice) {
        const { data: allPayments } = await supabase
          .from("supplier_payments")
          .select("amount")
          .eq("invoice_id", data.invoice_id);

        const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        const balanceDue = Number(invoice.total_amount) - totalPaid;

        let status: SupplierInvoice["status"] = "approved";
        if (balanceDue <= 0) {
          status = "paid";
        } else if (totalPaid > 0) {
          status = "partial";
        }

        await supabase
          .from("supplier_invoices")
          .update({
            amount_paid: totalPaid,
            balance_due: balanceDue,
            status,
          })
          .eq("id", data.invoice_id);
      }
    }
  }

  return data as SupplierPayment;
}
