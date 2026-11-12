// src/lib/bills.ts — Banking Step 4a: supplier / subcontractor bills.
// A bill is a cost you owe. Saved with create_bill() (bill + lines in one step); when APPROVED it goes into the books
// (cost on the job, GCT Input Credit, Supplier Payables, retention held) - see migration 20260975.

import { supabase } from "./supabase";
import { privatePath, safeUploadName, uploadPrivate } from "./storageRefs";

const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "Something went wrong.";

export interface SupplierOption { id: string; name: string; workerId?: string | null; type?: "supplier" | "contractor" }
export interface CostAccount { id: string; code: string; name: string; type: string }
export interface NewBillLine { item_name: string; chart_account_id: string; amount: number }
export interface NewBill {
  supplier_id: string; project_id: string | null; invoice_number: string; invoice_date: string; due_date: string;
  tax_amount: number; retention_percent: number; notes: string;
}

export async function fetchSuppliers(companyId: string): Promise<SupplierOption[]> {
  const { data, error } = await supabase.from("suppliers").select("id, supplier_name, is_active, worker_id, supplier_type")
    .eq("company_id", companyId).order("supplier_name");
  if (error) throw new Error(errText(error));
  return ((data || []) as { id: string; supplier_name: string; is_active: boolean | null; worker_id: string | null; supplier_type: SupplierType | null }[])
    .filter((s) => s.is_active !== false)
    .map((s) => ({ id: s.id, name: s.supplier_name, workerId: s.worker_id, type: s.supplier_type ?? "supplier" }));
}

export interface WorkerOption { id: string; name: string; type: string }

/** Active workers, subcontractors and crew leads: a bill can be from them too. */
export async function fetchWorkerChoices(companyId: string): Promise<WorkerOption[]> {
  const { data, error } = await supabase.from("workers").select("id, first_name, last_name, worker_type, status")
    .eq("company_id", companyId).order("first_name");
  if (error) throw new Error(errText(error));
  return ((data || []) as { id: string; first_name: string | null; last_name: string | null; worker_type: string; status: string | null }[])
    .filter((w) => w.status !== "terminated" && w.status !== "inactive")
    .map((w) => ({ id: w.id, name: `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || "Worker", type: w.worker_type }));
}

/** The supplier record for a worker (made the first time they are chosen on a bill). */
export async function supplierForWorker(workerId: string): Promise<string> {
  const { data, error } = await supabase.rpc("supplier_for_worker", { p_worker: workerId });
  if (error) throw new Error(errText(error));
  return data as string;
}

export type SupplierType = "supplier" | "contractor";

/** Quick add from the bill form: a supplier (materials, rentals) or a contractor (subcontractor, mason, workman). */
export async function addSupplier(companyId: string, name: string, phone: string, type: SupplierType = "supplier", address = ""): Promise<SupplierOption> {
  const { data, error } = await supabase.from("suppliers")
    .insert({ company_id: companyId, supplier_name: name.trim(), phone: phone.trim() || null, address: address.trim() || null,
              supplier_type: type, is_active: true })
    .select("id, supplier_name, supplier_type").single();
  if (error) {
    if (/duplicate|unique/i.test(errText(error))) throw new Error(`"${name.trim()}" is already in your suppliers list. Choose it from the list.`);
    throw new Error(errText(error));
  }
  const d = data as { id: string; supplier_name: string; supplier_type: SupplierType };
  return { id: d.id, name: d.supplier_name, type: d.supplier_type };
}

/** Accounts a bill line can be charged to: active expense accounts that are not headings. */
export async function fetchCostAccounts(companyId: string): Promise<CostAccount[]> {
  const { data, error } = await supabase.from("chart_of_accounts").select("id, code, name, type, parent_id, is_active")
    .eq("company_id", companyId).eq("type", "expense").order("code");
  if (error) throw new Error(errText(error));
  const rows = (data || []) as (CostAccount & { parent_id: string | null; is_active: boolean | null })[];
  const parents = new Set(rows.map((r) => r.parent_id).filter(Boolean));
  return rows.filter((r) => r.is_active !== false && !parents.has(r.id)).map(({ id, code, name, type }) => ({ id, code, name, type }));
}

export async function createBill(bill: NewBill, lines: NewBillLine[], approve: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("create_bill", { p_bill: bill, p_lines: lines, p_approve: approve });
  if (error) throw new Error(errText(error));
  return data as string;
}

// "Bill this to the client": the bill then shows under "Add billable expenses" on the project's invoice (migration 20261005000000)
export async function setBillBillable(id: string, on: boolean, markup: number): Promise<void> {
  const { error } = await supabase.rpc("bill_set_billable", { p_bill: id, p_on: on, p_markup: markup });
  if (error) throw new Error(errText(error));
}

export async function approveBill(id: string): Promise<void> {
  const { error } = await supabase.rpc("approve_bill", { p_id: id });
  if (error) throw new Error(errText(error));
}

export async function disputeBill(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("dispute_bill", { p_id: id, p_reason: reason });
  if (error) throw new Error(errText(error));
}

export const GCT_RATE = 0.15;

// ── Banking Step 4b: paying bills (migration 20260976). Paying: DEBIT Supplier Payables, CREDIT the bank/cash/card.
// Paying out retention: DEBIT Retention Payable, CREDIT the bank/cash/card.

export type PayMethod = "wire" | "cash" | "check" | "credit_card" | "other";
export const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "wire", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Cheque" },
  { value: "credit_card", label: "Card" },
  { value: "other", label: "Other (e.g. Lynk)" },
];

export interface BillPayment {
  id: string;
  payment_number: string | null;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  is_retention_release: boolean;
  paid_from_account_id: string | null;
  gl_transaction_id: string | null;
  ledger_note: string | null;
  received_by_name: string | null;
  signature_data: string | null;
  signed_at: string | null;
  proof_path: string | null;
  is_advance: boolean;
  applied_from_payment_id: string | null;
  applied_on: string | null;
}

/** Cash handed over with no signature and no photo yet. (A part used from an advance carries no proof: the advance does.) */
export const needsProof = (p: { payment_method: string | null; signed_at: string | null; proof_path: string | null; applied_from_payment_id?: string | null }) =>
  p.payment_method === "cash" && !p.signed_at && !p.proof_path && !p.applied_from_payment_id;

export async function fetchBillPayments(billId: string): Promise<BillPayment[]> {
  const { data, error } = await supabase.from("supplier_payments")
    .select("id, payment_number, payment_date, amount, payment_method, reference_number, is_retention_release, paid_from_account_id, gl_transaction_id, ledger_note, received_by_name, signature_data, signed_at, proof_path, is_advance, applied_from_payment_id, applied_on")
    .eq("invoice_id", billId).order("payment_date").order("created_at");
  if (error) throw new Error(errText(error));
  return ((data || []) as BillPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function payBill(p: {
  billId: string; amount: number; date: string; paidFrom: string; method: PayMethod; reference: string; retention: boolean;
  receivedBy?: string; signature?: string | null; proofPath?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("pay_bill", {
    p_bill: p.billId, p_amount: p.amount, p_date: p.date, p_paid_from: p.paidFrom,
    p_method: p.method, p_reference: p.reference.trim() || null, p_retention: p.retention,
    p_received_by: p.receivedBy?.trim() || null, p_signature: p.signature || null, p_proof_path: p.proofPath || null,
  });
  if (error) throw new Error(errText(error));
  return data as string;
}

export async function undoBillPayment(id: string): Promise<void> {
  const { error } = await supabase.rpc("undo_bill_payment", { p_id: id });
  if (error) throw new Error(errText(error));
}

// ── Banking Step 4b-2: proof of payment (migration 20260977) ──

export interface ProofValue { receivedBy: string; signature: string | null; photo: File | null }
export const emptyProof = (name = ""): ProofValue => ({ receivedBy: name, signature: null, photo: null });

/** Upload a proof photo (signed receipt, the person / their ID, or a transfer screenshot). Returns the stored path. */
export async function uploadBillProof(companyId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const { path, error } = await uploadPrivate(privatePath(companyId, "finance/bill-payments", safeUploadName("proof", ext)), file,
    { contentType: file.type || "image/jpeg" });
  if (error || !path) throw new Error(error || "The photo was not saved.");
  return path;
}

export async function addBillPaymentProof(id: string, receivedBy: string, signature: string | null, proofPath: string | null): Promise<void> {
  const { error } = await supabase.rpc("add_bill_payment_proof", {
    p_id: id, p_received_by: receivedBy.trim() || null, p_signature: signature, p_proof_path: proofPath,
  });
  if (error) throw new Error(errText(error));
}

export interface UnsignedPayment {
  id: string; amount: number; payment_date: string; invoice_id: string | null;
  invoice_number: string | null; supplier: string | null;
}

/** Cash bill payments still waiting for a signature or photo. */
export async function fetchUnsignedCashPayments(companyId: string): Promise<UnsignedPayment[]> {
  const { data, error } = await supabase.from("supplier_payments")
    .select("id, amount, payment_date, invoice_id, supplier_invoices(invoice_number), suppliers(supplier_name)")
    .eq("company_id", companyId).eq("payment_method", "cash").is("signed_at", null).is("proof_path", null)
    .is("applied_from_payment_id", null)
    .order("payment_date");
  if (error) throw new Error(errText(error));
  type Row = { id: string; amount: number; payment_date: string; invoice_id: string | null;
    supplier_invoices: { invoice_number: string } | null; suppliers: { supplier_name: string } | null };
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id, amount: Number(r.amount), payment_date: r.payment_date, invoice_id: r.invoice_id,
    invoice_number: r.supplier_invoices?.invoice_number ?? null, supplier: r.suppliers?.supplier_name ?? null,
  }));
}

// ── Scan a bill (migration 20260979) ──

/** File the bill picture in the monthly receipts folder (same as expense receipts): <company>/receipts/<year>/<month>/. */
export async function uploadBillFile(companyId: string, file: File, billDate: string): Promise<string> {
  const d = /^\d{4}-\d{2}/.test(billDate) ? billDate : new Date().toISOString();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const { path, error } = await uploadPrivate(privatePath(companyId, `receipts/${d.slice(0, 4)}/${d.slice(5, 7)}`, safeUploadName("bill", ext)), file,
    { contentType: file.type || "image/jpeg" });
  if (error || !path) throw new Error(error || "The bill picture was not saved.");
  return path;
}

export async function setBillFile(billId: string, path: string): Promise<void> {
  const { error } = await supabase.from("supplier_invoices").update({ bill_file_path: path }).eq("id", billId);
  if (error) throw new Error(errText(error));
}

const squash = (t: string) => t.toLowerCase().replace(/\b(ltd|limited|co|company|inc|the|and|&)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** The supplier (or worker) whose name matches the name read off the bill, if any. */
export function matchName<T extends { name: string }>(read: string, list: T[]): T | null {
  const r = squash(read);
  if (!r) return null;
  return list.find((x) => squash(x.name) === r)
    ?? list.find((x) => { const n = squash(x.name); return n.length > 2 && (r.includes(n) || n.includes(r)); })
    ?? null;
}

/** A first guess at the cost account for a bill line, from its words. The user checks it. */
export function guessCostAccount(description: string, accounts: CostAccount[], contractor: boolean): string {
  const d = description.toLowerCase();
  const find = (re: RegExp) => accounts.find((a) => re.test(a.name.toLowerCase()))?.id ?? "";
  const rules: [RegExp, RegExp][] = [
    [/(rent|rental|hire|excavator|backhoe|mixer|scaffold|equipment|tool)/, /(equipment|rental)/],
    [/(fuel|gas|diesel|petrol)/, /(fuel|vehicle)/],
    [/(truck|haul|transport|delivery|freight)/, /(transport|freight|haul|delivery)/],
    [/(labour|labor|work|install|block ?work|masonry|plaster|tiling|paint(ing)?|carpentry|steel ?work|stage|day ?work)/, /(subcontract|labou?r)/],
    [/(cement|block|sand|steel|rebar|lumber|board|ply|nail|zinc|gravel|stone|marl|aggregate|pipe|wire|paint|tile|material)/, /material/],
  ];
  for (const [words, acct] of rules) if (words.test(d)) { const id = find(acct); if (id) return id; }
  return contractor ? find(/subcontract/) || find(/labou?r/) : find(/material/);
}

// ── Banking Step 4b-3: advances to suppliers and contractors (migration 20260980) ──
// Giving an advance: DEBIT Advances to Suppliers and Subcontractors, CREDIT bank/cash. Using it on their bill moves
// that part onto the bill (Advances down, what you owe down, bank unchanged).

export async function giveAdvance(p: {
  supplierId: string; projectId: string | null; amount: number; date: string; paidFrom: string; method: PayMethod; reference: string;
  receivedBy?: string; signature?: string | null; proofPath?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("pay_supplier_advance", {
    p_supplier: p.supplierId, p_project: p.projectId, p_amount: p.amount, p_date: p.date, p_paid_from: p.paidFrom,
    p_method: p.method, p_reference: p.reference.trim() || null,
    p_received_by: p.receivedBy?.trim() || null, p_signature: p.signature || null, p_proof_path: p.proofPath || null,
  });
  if (error) throw new Error(errText(error));
  return data as string;
}

export async function applyAdvance(advanceId: string, billId: string, amount: number, date: string): Promise<string> {
  const { data, error } = await supabase.rpc("apply_supplier_advance", { p_advance: advanceId, p_bill: billId, p_amount: amount, p_date: date });
  if (error) throw new Error(errText(error));
  return data as string;
}

export interface SupplierAdvance {
  id: string;
  payment_number: string | null;
  payment_date: string;
  supplier_id: string | null;
  supplier: string;
  project: string | null;
  /** What is still left to use on bills. */
  left: number;
  /** What was given (left + what is used on bills). */
  given: number;
  payment_method: string | null;
  reference_number: string | null;
  received_by_name: string | null;
  signature_data: string | null;
  signed_at: string | null;
  proof_path: string | null;
  gl_transaction_id: string | null;
  ledger_note: string | null;
}

/** Advances given (optionally for one supplier). With openOnly, only those with money left or still waiting for proof. */
export async function fetchAdvances(companyId: string, opts: { supplierId?: string; openOnly?: boolean } = {}): Promise<SupplierAdvance[]> {
  let q = supabase.from("supplier_payments")
    .select("id, payment_number, payment_date, amount, supplier_id, payment_method, reference_number, received_by_name, signature_data, signed_at, proof_path, gl_transaction_id, ledger_note, suppliers(supplier_name), projects(name)")
    .eq("company_id", companyId).eq("is_advance", true).is("invoice_id", null)
    .order("payment_date", { ascending: false });
  if (opts.supplierId) q = q.eq("supplier_id", opts.supplierId);
  const { data, error } = await q;
  if (error) throw new Error(errText(error));
  type Row = Omit<SupplierAdvance, "supplier" | "project" | "left" | "given"> & { amount: number;
    suppliers: { supplier_name: string } | null; projects: { name: string } | null };
  const rows = (data || []) as unknown as Row[];
  const used = new Map<string, number>();
  if (rows.length > 0) {
    const { data: parts } = await supabase.from("supplier_payments").select("applied_from_payment_id, amount")
      .in("applied_from_payment_id", rows.map((r) => r.id));
    for (const p of (parts || []) as { applied_from_payment_id: string; amount: number }[]) {
      used.set(p.applied_from_payment_id, (used.get(p.applied_from_payment_id) || 0) + Number(p.amount));
    }
  }
  return rows.map(({ suppliers, projects, amount, ...r }) => ({
    ...r, supplier: suppliers?.supplier_name ?? "Supplier", project: projects?.name ?? null,
    left: Number(amount), given: Math.round((Number(amount) + (used.get(r.id) || 0)) * 100) / 100,
  })).filter((a) => !opts.openOnly || a.left > 0 || needsProof({ ...a, applied_from_payment_id: null }));
}

// ── Banking Step 4c: a bill from a Purchase Order (migration 20260981) ──

export interface BillablePO { id: string; po_number: string; title: string; supplier: string; project: string | null; status: string }
export interface POLine {
  id: string; material_name: string; description: string | null; unit: string | null;
  ordered: number; received: number; billed: number; left_to_bill: number; rate: number;
}

/** Issued / part-delivered / delivered purchase orders. */
export async function fetchBillablePOs(companyId: string): Promise<BillablePO[]> {
  const { data, error } = await supabase.from("purchase_orders")
    .select("id, po_number, title, status, supplier_name, suppliers(supplier_name), projects(name)")
    .eq("company_id", companyId).in("status", ["issued", "part_delivered", "delivered"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(errText(error));
  type Row = { id: string; po_number: string; title: string; status: string; supplier_name: string | null;
    suppliers: { supplier_name: string } | null; projects: { name: string } | null };
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id, po_number: r.po_number, title: r.title, status: r.status,
    supplier: r.suppliers?.supplier_name ?? r.supplier_name ?? "Supplier", project: r.projects?.name ?? null,
  }));
}

export async function fetchPOLines(poId: string): Promise<POLine[]> {
  const { data, error } = await supabase.rpc("po_lines_to_bill", { p_po: poId });
  if (error) throw new Error(errText(error));
  return ((data || []) as POLine[]).map((l) => ({
    ...l, ordered: Number(l.ordered), received: Number(l.received), billed: Number(l.billed),
    left_to_bill: Number(l.left_to_bill), rate: Number(l.rate),
  }));
}

export async function createBillFromPO(poId: string, bill: {
  invoice_number: string; invoice_date: string; due_date: string; tax_amount: number; retention_percent: number; notes: string;
}, lines: { po_item_id: string; quantity: number; unit_cost: number; chart_account_id: string }[], approve: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("create_bill_from_po", { p_po: poId, p_bill: bill, p_lines: lines, p_approve: approve });
  if (error) throw new Error(errText(error));
  return data as string;
}
