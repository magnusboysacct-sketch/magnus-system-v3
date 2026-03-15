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

export interface ClientInvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  created_at?: string;
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
  three_way_match_status?: "pending" | "matched" | "discrepancy" | null;
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
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

export async function fetchInvoiceItems(invoiceId: string) {
  const { data, error } = await supabase
    .from("client_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data as ClientInvoiceItem[];
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
  return data as ClientPayment;
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

export async function approveExpense(id: string) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("expenses")
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
