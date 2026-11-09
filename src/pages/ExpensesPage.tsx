// src/pages/ExpensesPage.tsx
import { PRIVATE_FILES_BUCKET, resolveFileUrl, safeUploadName, toStoredRef, withResolvedUrls } from "../lib/storageRefs";
import { fetchBillPictures, folderMonth, listReceiptFiles, type BillPicture, type FolderFile } from "../lib/receiptsFolder";
import { describeDuplicate, useDuplicateCheck } from "../lib/duplicates";
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { markDone, type FromInbox } from "../lib/receiptInbox";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { supabase } from "../lib/supabase";
import { showPrintPreview } from "../lib/printPreview";
import { useProjectContext } from "../context/ProjectContext";
import { postExpenseToLedger, expenseLedgerState, POSTABLE_STATUSES, isPaidFromAccount, detectNonJmdCurrency } from "../lib/expensePosting";
import type { LedgerAccount, PostExpenseResult } from "../lib/expensePosting";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Tabs, cn
} from "../components/ui";
import {
  Plus, Search, Download, Receipt, DollarSign,
  RefreshCw, Filter, X, Check, Calendar, Pencil, Trash2
} from "lucide-react";

// ─── Date range filter — same proven pattern as ReportsPage.tsx (not
// imported from there since it doesn't export these; ReportsPage.tsx
// itself is untouched, this is a deliberate copy of its shape) ───────────

type DateRange = "week" | "month" | "quarter" | "year" | "all" | "custom";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "week", label: "Last 7 Days" },
  { key: "month", label: "Last 30 Days" },
  { key: "quarter", label: "Last 3 Months" },
  { key: "year", label: "Last 12 Months" },
  { key: "all", label: "All Time" },
  { key: "custom", label: "Custom Range" },
];

// Presets only — "custom" is handled separately by customRangeBounds()
// below, since a preset is always "cutoff through now" (a single lower
// bound), while a custom range needs both an arbitrary start AND end.
function getCutoff(range: DateRange): string | null {
  const now = new Date();
  if (range === "all" || range === "custom") return null;
  if (range === "week") { now.setDate(now.getDate() - 7); }
  else if (range === "month") { now.setMonth(now.getMonth() - 1); }
  else if (range === "quarter") { now.setMonth(now.getMonth() - 3); }
  else if (range === "year") { now.setFullYear(now.getFullYear() - 1); }
  return now.toISOString();
}

// Custom range bounds — local-midnight-safe, same discipline as every
// date field built this session: new Date("YYYY-MM-DD") alone parses as
// UTC midnight and can shift a day depending on the browser's timezone,
// so the time component is set explicitly rather than left implicit.
// Empty start/end means "no bound on that side" (an open-ended custom
// range is valid — e.g. "everything up to a specific end date").
function customRangeBounds(start: string, end: string): { start: string | null; end: string | null } {
  return {
    start: start ? new Date(`${start}T00:00:00`).toISOString() : null,
    end: end ? new Date(`${end}T23:59:59.999`).toISOString() : null,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Expense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string | null;
  category_id: string | null; // older link, kept for history; new/edited expenses use chart_account_id
  chart_account_id: string | null; // the expense account (Chart of Accounts) this expense is charged to
  project_id: string | null;
  worker_id: string | null;
  status: string | null;
  receipt_url: string | null;
  line_items?: LineItem[] | null;         // the items on the receipt (migration 20260996000000)
  vendor?: string | null;
  receipt_number?: string | null;
  paid_from_account_id: string | null;
  gl_transaction_id: string | null;
  created_at: string;
  projects?: { name: string } | null;
  workers?: { first_name: string; last_name: string } | null;
  expense_categories?: { name: string } | null;
};

type Category = { id: string; name: string; category_type: string; chart_account_id: string | null };
type LineItem = { description: string; quantity: number | null; unit_price: number | null; amount: number | null };
type ItemRow = { description: string; quantity: string; unit_price: string; amount: string };   // as typed in the form
const toRows = (items: LineItem[] | null | undefined): ItemRow[] => (items || []).map(i => ({
  description: i.description || "", quantity: i.quantity != null ? String(i.quantity) : "", unit_price: i.unit_price != null ? String(i.unit_price) : "", amount: i.amount != null ? String(i.amount) : "" }));
const fromRows = (rows: ItemRow[]): LineItem[] | null => {
  const n = (v: string) => { const x = Number(v.replace(/,/g, "")); return v.trim() && isFinite(x) ? x : null; };
  const out = rows.filter(r => r.description.trim() || r.amount.trim()).map(r => ({ description: r.description.trim(), quantity: n(r.quantity), unit_price: n(r.unit_price), amount: n(r.amount) }));
  return out.length ? out : null;
};
const scanRows = (items: { description: string; quantity: number; unitPrice: number; amount: number }[] | undefined): ItemRow[] =>
  (items || []).map(i => ({ description: i.description || "", quantity: i.quantity ? String(i.quantity) : "", unit_price: i.unitPrice ? String(i.unitPrice) : "", amount: i.amount ? String(i.amount) : "" }));
const isPdf = (u: string | null | undefined) => !!u && /\.pdf(\?|$)/i.test(u.split("?")[0] + "?");

type Tab = "all" | "pending" | "approved" | "filing";

// projectFilter sentinel for "company-level expenses only" (project_id is
// null) — deliberately NOT the empty string, since "" already means "All
// projects" (no filter at all, every row matches regardless of project_id).
// An actual project's id is always a real uuid, so this literal can never
// collide with one.
const NO_PROJECT_FILTER = "__no_project__";

// Matches the expenses.status CHECK constraint exactly: pending/approved/
// reimbursed/rejected — "paid" was never a real status (no such value in
// the DB constraint; see the "Mark Paid" fix below), so it's "reimbursed"
// that needs the color, not "paid".
const STATUS_COLOR: Record<string, any> = {
  pending:    "amber",
  approved:   "green",
  reimbursed: "blue",
  rejected:   "red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 2
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { projects, currentProject, userRole } = useProjectContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // Exact company-wide row count, independent of the fetch below — a
  // separate { count: "exact", head: true } query isn't subject to
  // PostgREST's row-return cap the way the actual data fetch is, so this
  // stays correct as the headline "N total" figure even if the company
  // ever grows past the .range() bound on the real fetch.
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  // The company's ledger accounts (for the "Paid from" list and the Ledger column), and the outcome of the last ledger posting.
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [ledgerNote, setLedgerNote] = useState<{ kind: "success" | "warning" | "error" | "info"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [projectFilter, setProjectFilter] = useState("");
  // Defaults to "month", matching ReportsPage.tsx's own default — no
  // reason found to differ for this page.
  const [dateRange, setDateRange] = useState<DateRange>("all");   // all dates by default, so every expense shows and totals match Project Finance
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showExpenseScanner, setShowExpenseScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null while editing an existing expense — reuses the same "Log
  // Expense" modal, pre-filled, instead of a separate edit modal. Null
  // means the modal (if open) is in "create new" mode.
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const receiptRefs = useRef<Map<string, string | null>>(new Map());          // expense id -> the stored receipt path
  // The scanned receipt photo waits here and is filed when the expense is SAVED (it used to upload in the background as
  // soon as it was scanned: saving before that finished left the expense without its receipt and a loose photo in the folder).
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  // Shown when a just-saved expense would be hidden by the filters, so it never seems to "disappear".
  const [listNote, setListNote] = useState<string | null>(null);
  // Duplicate check while typing: refused if the same receipt / bill number from the same vendor is already entered;
  // a warning (tick to go ahead) if, with no number, the same vendor, amount and day is already there.
  const [notDuplicate, setNotDuplicate] = useState(false);
  // Everything in the receipts folder (expense receipts, bill pictures, loose pictures) for the filing cabinet.
  const [folderFiles, setFolderFiles] = useState<FolderFile[] | null>(null);
  const [billPics, setBillPics] = useState<BillPicture[]>([]);

  function handleExpenseScan(result: any, receiptFile?: File) {
    setShowExpenseScanner(false);
    // the PATH is stored (not a long-lived URL); a short-lived signed URL is made when the receipt is shown
    if (receiptFile) setReceiptFile(receiptFile);   // filed in the receipts folder when the expense is saved
    setForm(f => ({
      ...f,
      description: result.vendor ? `${result.vendor} - Receipt` : f.description,
      vendor: result.vendor || f.vendor,
      receipt_number: result.receiptNumber || f.receipt_number,
      amount:      result.amount ? result.amount.toString() : f.amount,
      expense_date: result.date || f.expense_date,
      items: result.lineItems?.length ? scanRows(result.lineItems) : f.items,
    }));
  }
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    description: "", amount: "", expense_date: "",
    chart_account_id: "", project_id: currentProject?.id || "", status: "pending", receipt_url: "", paid_from_account_id: "",
    vendor: "", receipt_number: "", items: [] as ItemRow[],
  });
  // the expense opened to look at (row click), and the receipt picture shown in the form
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [receiptView, setReceiptView] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const dupChecks = useDuplicateCheck({
    vendor: form.vendor, number: form.receipt_number, amount: Number(form.amount) || null, date: form.expense_date || null, excludeId: editingExpense?.id,
  }, showNew);
  const exactDups = dupChecks.filter(d => d.exact);
  const possibleDups = dupChecks.filter(d => !d.exact);

  // Load company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => {
    if (companyId) { loadExpenses(); loadCategories(); loadAccounts(); loadFolder(); }
  }, [companyId]);

  // Opened from the Receipt Inbox ("Make it an expense"): the form starts filled in from what the AI read, with the picture
  // attached. When it is saved, the receipt leaves the inbox and the page goes back to the inbox.
  const location = useLocation();
  const navigate = useNavigate();
  const fromInbox = useRef<FromInbox | null>(null);
  useEffect(() => {
    const fi = (location.state as { fromInbox?: FromInbox } | null)?.fromInbox;
    if (!fi) return;
    fromInbox.current = fi;
    navigate(location.pathname, { replace: true, state: null });
    setNotDuplicate(false); setReceiptFile(null); setEditingExpense(null);
    const a = fi.ai || {};
    setForm({ ...blankForm, receipt_url: fi.path, project_id: fi.projectId || "",
      amount: a.amount ? String(a.amount) : "", expense_date: a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : "",
      vendor: a.vendor || "", receipt_number: a.receiptNumber || "", items: scanRows(a.lineItems),
      description: fi.note || (a.vendor ? `Purchase at ${a.vendor}` : "") });
    setShowNew(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFolder() {
    if (!companyId) return;
    fetchBillPictures(companyId).then(setBillPics).catch(() => setBillPics([]));
    // Only people who may open finance files can list the folder; for others the cabinet shows expenses and bills only.
    listReceiptFiles(companyId).then(setFolderFiles).catch(() => setFolderFiles(null));
  }

  async function loadExpenses() {
    setLoading(true);
    try {
      // Correction to the earlier fix here: PostgREST's max-rows cap
      // (default 1000) is a HARD SERVER-SIDE limit — .range(0, 49999)
      // only requests a window, it cannot force the server past its own
      // configured ceiling. The server just silently returns up to
      // max-rows regardless of what's asked for (HTTP 206, not an error),
      // so that "fix" never actually worked for the real row data — it
      // only looked like it worked because the "N total" headline number
      // came from a separate count-only query (a response header, never
      // subject to the row-data cap at all), while anything computed from
      // the actual fetched array — like the Pending/Approved tab counts —
      // was still silently capped at 1000. Confirmed by the exact split
      // Veron reported: All correct (count-based), Pending wrong
      // (array-based).
      //
      // Real fix: loop, requesting successive windows, until a page comes
      // back shorter than requested — that's the actual end of the data,
      // whatever the server's true max-rows turns out to be. Works
      // regardless of that value, rather than trying to guess/out-request it.
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      for (let guard = 0; guard < 200; guard++) { // 200 * 1000 = 200,000 rows, a hard safety stop against a runaway loop, not a realistic ceiling
        const { data: page, error: e } = await supabase
          .from("expenses")
          .select("*, projects(name), workers(first_name, last_name), expense_categories(name)")
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (e) throw e;
        all = all.concat(page || []);
        if (!page || page.length < PAGE) break; // short page — reached the actual end
        from += PAGE;
      }
      const { count } = await supabase
        .from("expenses")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      // receipts are stored as paths; made into short-lived signed URLs for showing. The stored paths are kept so an edit never writes a temporary URL (or nothing, for
      // someone who may not open receipts) over them.
      receiptRefs.current = new Map(all.map((x: Expense) => [x.id, x.receipt_url || null]));
      all = await withResolvedUrls(all, ["receipt_url"]);
      setExpenses(all);
      setTotalCount(count ?? null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadCategories() {
    const { data } = await supabase
      .from("expense_categories")
      .select("id, name, category_type, chart_account_id")
      .eq("company_id", companyId!);
    setCategories(data || []);
  }

  const accountsById = new Map<string, LedgerAccount>(accounts.map(a => [a.id, a]));
  const byCode = (a: LedgerAccount, b: LedgerAccount) => a.code.localeCompare(b.code, undefined, { numeric: true });
  // The Category list is the company's active expense accounts from the Chart of Accounts - only the "leaf" ones. An account that has active
  // child accounts under it (e.g. 6000 Operating Expenses, 6200 Office Expenses) is a heading, not something to charge an expense to.
  const groupIds = new Set(accounts.filter(a => a.is_active !== false && a.parent_id).map(a => a.parent_id as string));
  const expenseAccounts = accounts.filter(a => a.type === "expense" && a.is_active !== false && !groupIds.has(a.id)).sort(byCode);
  // The expense account an expense is charged to: its own account, or (older rows) the account its old category is linked to.
  const effectiveAccountId = (x: { chart_account_id?: string | null; category_id?: string | null }) =>
    x.chart_account_id || categories.find(c => c.id === x.category_id)?.chart_account_id || null;
  // What to show in the Category column: the account's name, or (older rows) the old category's name.
  const categoryLabel = (x: Expense) => (x.chart_account_id ? accountsById.get(x.chart_account_id)?.name : undefined) || x.expense_categories?.name || "";

  async function loadAccounts() {
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name, type, subtype, parent_id, is_active, is_project_linkable, company_id")
      .eq("company_id", companyId!);
    setAccounts((data || []) as LedgerAccount[]);
  }

  const blankForm = { description: "", amount: "", expense_date: "", chart_account_id: "", project_id: currentProject?.id || "", status: "pending", receipt_url: "", paid_from_account_id: "", vendor: "", receipt_number: "", items: [] as ItemRow[] };

  function openNew() {
    setNotDuplicate(false);
    setReceiptFile(null);
    setEditingExpense(null);
    setForm(blankForm);
    setShowNew(true);
  }

  function openEdit(exp: Expense) {
    setNotDuplicate(false);
    setReceiptFile(null);
    setEditingExpense(exp);
    setForm({
      description: exp.description || "",
      amount: exp.amount != null ? String(exp.amount) : "",
      expense_date: exp.expense_date || "",
      // Older expenses only have a category: preselect the account that category is linked to.
      chart_account_id: effectiveAccountId(exp) || "",
      project_id: exp.project_id || "",
      status: exp.status || "pending",
      receipt_url: receiptRefs.current.get(exp.id) || "",
      paid_from_account_id: exp.paid_from_account_id || "",
      vendor: exp.vendor || "",
      receipt_number: exp.receipt_number || "",
      items: toRows(exp.line_items),
    });
    setShowNew(true);
  }

  // the receipt picture shown in the form: the new one chosen, or the one already attached
  useEffect(() => {
    let alive = true, objectUrl: string | null = null;
    if (receiptFile) { objectUrl = URL.createObjectURL(receiptFile); setReceiptView(objectUrl); }
    else if (form.receipt_url) {
      const shown = editingExpense && receiptRefs.current.get(editingExpense.id) === form.receipt_url ? editingExpense.receipt_url : null;
      if (shown) setReceiptView(shown);
      else void resolveFileUrl(form.receipt_url).then(u => { if (alive) setReceiptView(u); });
    } else setReceiptView(null);
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [receiptFile, form.receipt_url, editingExpense]);

  function closeModal() {
    setNotDuplicate(false);
    setReceiptFile(null);
    setShowNew(false);
    setEditingExpense(null);
    setError(null);
    setForm(blankForm);
  }

  // Handles both create and edit — editingExpense being set is what decides
  // insert vs. update. No status restriction on editing (matches the
  // precedent on AccountsReceivablePage/FieldPaymentsPage: edit is allowed
  // at any status, only delete is role-gated).
  // Posts an expense to the ledger and tells the user exactly what happened. Never throws and never undoes the expense itself.
  async function postAndReport(expenseId: string, prefix: string) {
    let res: PostExpenseResult;
    try { res = await postExpenseToLedger(expenseId); }
    catch (e: any) { res = { status: "failed", reason: e?.message || String(e) }; }
    if (res.status === "posted" || res.status === "already_posted") {
      setExpenses(prev => prev.map(x => x.id === expenseId ? { ...x, gl_transaction_id: res.transactionId } : x));
    }
    if (res.status === "posted") setLedgerNote({ kind: res.currencyNote ? "warning" : "success", text: `${prefix}Posted to the ledger${res.transactionNumber ? ` as ${res.transactionNumber}` : ""}.${res.currencyNote ? ` Note: ${res.currencyNote}` : ""}` });
    else if (res.status === "already_posted") setLedgerNote({ kind: "info", text: `${prefix}Already posted to the ledger.` });
    else if (res.status === "not_posted") setLedgerNote({ kind: "warning", text: `${prefix}Not posted to the ledger yet: ${res.reason} The expense itself is saved; fix this, then save it again or use Post.` });
    else setLedgerNote({ kind: "error", text: `${prefix}Couldn't post to the ledger: ${res.reason} The expense itself is saved.` });
  }

  async function saveExpense() {
    if (exactDups.length > 0) { setError(`Already exists: ${describeDuplicate(exactDups[0])}. It was not entered again.`); return; }
    if (possibleDups.length > 0 && !notDuplicate) { setError("This looks like an expense already entered (see the warning). Tick \"This is a different purchase\" to save it anyway."); return; }
    setSaving(true); setError(null);
    try {
      // The category IS the expense account. The older category_id is left alone when the account didn't change, and otherwise follows
      // the one old category linked to the new account (or is cleared), so nothing still reading category_id sees a stale value.
      const accountId = form.chart_account_id || null;
      const accountUnchanged = !!editingExpense && accountId === effectiveAccountId(editingExpense);
      const linkedCategories = categories.filter(c => !!accountId && c.chart_account_id === accountId);
      let receiptRef = toStoredRef(form.receipt_url);
      if (receiptFile && companyId) {
        const ym = (form.expense_date || new Date().toISOString()).slice(0, 7);
        const ext = (receiptFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${companyId}/receipts/${ym.slice(0, 4)}/${ym.slice(5, 7)}/${safeUploadName("receipt", ext)}`;
        const { error: ue } = await supabase.storage.from(PRIVATE_FILES_BUCKET).upload(path, receiptFile, { upsert: false, contentType: receiptFile.type || "image/jpeg" });
        if (ue) throw new Error(`The receipt photo was not saved (${ue.message}). Nothing was saved: try again.`);
        receiptRef = path;
      }
      const payload = {
        description: form.description.trim(),
        amount: parseFloat(form.amount) || 0,
        expense_date: form.expense_date || null,
        chart_account_id: accountId,
        category_id: accountUnchanged ? (editingExpense!.category_id ?? null) : (linkedCategories.length === 1 ? linkedCategories[0].id : null),
        project_id: form.project_id || null,
        status: form.status,
        receipt_url: receiptRef,
        paid_from_account_id: form.paid_from_account_id || null,
        vendor: form.vendor.trim() || null,
        receipt_number: form.receipt_number.trim() || null,
        line_items: fromRows(form.items),
      };
      // Once an expense is on the ledger, what the entry was built from can't be changed here (that would leave the books wrong).
      if (editingExpense?.gl_transaction_id) {
        const e0 = editingExpense;
        const moneyChanged = Number(payload.amount) !== Number(e0.amount) || (payload.expense_date ?? null) !== (e0.expense_date ?? null)
          || (payload.chart_account_id ?? null) !== (effectiveAccountId(e0) ?? null) || (payload.project_id ?? null) !== (e0.project_id ?? null)
          || (payload.paid_from_account_id ?? null) !== (e0.paid_from_account_id ?? null);
        if (moneyChanged) throw new Error("This expense is already posted to the ledger, so its amount, date, category, project and Paid-from account can't be changed here. Reverse the ledger entry first.");
        if (!POSTABLE_STATUSES.includes(payload.status)) throw new Error("This expense is already posted to the ledger, so it can't go back to pending or rejected. Reverse the ledger entry first.");
      }
      let savedId: string | undefined = editingExpense?.id;
      if (editingExpense) {
        const { error: e } = await supabase.from("expenses").update(payload).eq("id", editingExpense.id);
        if (e) throw e;
      } else {
        const { data: created, error: e } = await supabase.from("expenses").insert({ company_id: companyId, ...payload }).select("id").single();
        if (e) throw e;
        savedId = created?.id;
        // from the Receipt Inbox: the receipt is filed now (it leaves the inbox)
        if (savedId && fromInbox.current && payload.receipt_url === fromInbox.current.path) {
          const fi = fromInbox.current; fromInbox.current = null;
          try { await markDone(fi.id, "expense", savedId); }
          catch (me: unknown) { setListNote(`Saved, but the receipt is still in the inbox: ${me instanceof Error ? me.message : "try again"}.`); }
          if (savedId && POSTABLE_STATUSES.includes(payload.status)) await postAndReport(savedId, "Saved. ");
          closeModal();
          navigate("/receipt-inbox", { state: { filed: "Filed as an expense." } });
          return;
        }
      }
      // Approved / paid: post to the ledger (does nothing if it's already posted). A problem here never undoes the save.
      if (savedId && POSTABLE_STATUSES.includes(payload.status)) await postAndReport(savedId, "Saved. ");
      await loadExpenses();
      loadFolder();
      // A saved expense must never seem to disappear: if the filters would hide it, show everything again and say why.
      const effMs = new Date(payload.expense_date ? `${payload.expense_date}T12:00:00` : Date.now()).getTime();
      const hiddenByDate = (dateStartMs !== null && effMs < dateStartMs) || (dateEndMs !== null && effMs > dateEndMs);
      const hiddenByProject = projectFilter === NO_PROJECT_FILTER ? payload.project_id !== null : !!projectFilter && payload.project_id !== projectFilter;
      const hiddenByTab = tab !== "all" && tab !== payload.status;
      if (hiddenByDate || hiddenByProject || hiddenByTab || search) {
        setDateRange("all"); setProjectFilter(""); setTab("all"); setSearch("");
        setListNote(`Saved. It is dated ${payload.expense_date ? new Date(`${payload.expense_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "today"}, which the filters were hiding, so the list now shows all expenses. Check the date is right.`);
      }
      closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  // Delete is restricted to director, matching the same role-gate used for
  // destructive actions on ClientsPage / AccountsReceivablePage. Uses
  // window.confirm() rather than a custom modal — ConfirmModal isn't used
  // anywhere live in this app; window.confirm() is the dominant pattern for
  // every other delete action (invoices, POs, contracts, field payments).
  async function deleteExpense(exp: Expense) {
    if (exp.gl_transaction_id) {
      setLedgerNote({ kind: "error", text: "This expense is posted to the ledger, so it can't be deleted here. Reverse the ledger entry first." });
      return;
    }
    if (!window.confirm(`Delete expense "${exp.description || "this expense"}"? This cannot be undone.`)) return;
    const { error: e } = await supabase.from("expenses").delete().eq("id", exp.id);
    if (e) { setError(e.message); return; }
    setExpenses(prev => prev.filter(x => x.id !== exp.id));
    // Its receipt picture goes with it (unless another expense uses the same picture).
    const path = toStoredRef(receiptRefs.current.get(exp.id));
    receiptRefs.current.delete(exp.id);
    const sharedWithAnother = [...receiptRefs.current.values()].some(v => toStoredRef(v) === path);
    if (path && !/^https?:/i.test(path) && !sharedWithAnother) {
      const { error: re } = await supabase.storage.from(PRIVATE_FILES_BUCKET).remove([path]);
      if (re) setLedgerNote({ kind: "warning", text: `Expense deleted, but its receipt picture could not be removed (${re.message}). It shows as "not attached" in the filing cabinet.` });
    }
    loadFolder();
  }

  // "Mark Paid" previously called updateStatus(id, "approved") — the same
  // target as the Approve button, a copy-paste no-op. The expenses.status
  // CHECK constraint is pending/approved/reimbursed/rejected — "paid" was
  // never a real value. lib/finance.ts's approveExpense()/reimburseExpense()
  // already treat "reimbursed" as the paid-equivalent terminal state (see
  // its `markAsPaid` param), so "reimbursed" is the correct target here too,
  // not a new "paid" value added to the constraint.
  async function updateStatus(id: string, status: string) {
    const exp = expenses.find(x => x.id === id);
    if (exp?.gl_transaction_id && !POSTABLE_STATUSES.includes(status)) {
      setLedgerNote({ kind: "error", text: "This expense is posted to the ledger, so it can't go back to pending or rejected. Reverse the ledger entry first." });
      return;
    }
    const { error: e } = await supabase.from("expenses").update({ status }).eq("id", id);
    if (e) { setLedgerNote({ kind: "error", text: "Couldn't update the expense: " + e.message }); return; }
    setExpenses(prev => prev.map(x => x.id === id ? { ...x, status } : x));
    // Approving (or marking paid) posts it to the ledger. The status change above stands whatever happens here.
    if (POSTABLE_STATUSES.includes(status)) await postAndReport(id, status === "approved" ? "Approved. " : "Marked paid. ");
  }

  function exportCSV() {
    const rows = filtered.map(e => [
      fmtDate(e.expense_date), e.description || "", fmt(e.amount),
      categoryLabel(e), e.projects?.name || "",
      `${e.workers?.first_name || ""} ${e.workers?.last_name || ""}`.trim(), e.status || ""
    ].join(","));
    const csv = ["Date,Description,Amount,Category,Project,Worker,Status", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `expenses_${Date.now()}.csv`; a.click();
  }

  // Filter — client-side, same as the existing search/tab/project filters
  // below (loadExpenses() already fetches the full company-scoped set, no
  // separate server round-trip needed for this). Real date column is
  // expense_date (nullable) — the cutoff check falls back to created_at
  // when it's null, matching how this file's own display logic already
  // does it elsewhere (e.g. the "Filing Cabinet" row date, line ~417),
  // so a still-real expense missing expense_date doesn't just silently
  // vanish from every range except "All Time".
  // "custom" needs both a start AND end bound; every preset is just a
  // single lower bound (cutoff through now) — start covers both cases,
  // end is only ever set for custom.
  const { start: dateStartIso, end: dateEndIso } = dateRange === "custom"
    ? customRangeBounds(customStart, customEnd)
    : { start: getCutoff(dateRange), end: null as string | null };
  const dateStartMs = dateStartIso ? new Date(dateStartIso).getTime() : null;
  const dateEndMs = dateEndIso ? new Date(dateEndIso).getTime() : null;
  const filtered = expenses.filter(e => {
    const matchSearch = (e.description || "").toLowerCase().includes(search.toLowerCase()) ||
      categoryLabel(e).toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || e.status === tab;
    const matchProject = projectFilter === NO_PROJECT_FILTER
      ? e.project_id === null
      : !projectFilter || e.project_id === projectFilter;
    // Real Date comparison, not raw string >= — expense_date is a plain
    // "YYYY-MM-DD" (no time component), while the cutoff/created_at are
    // full ISO datetimes; comparing those as strings is lexicographically
    // unreliable right at the boundary (a same-day expense could wrongly
    // fall outside the cutoff).
    const effMs = new Date(e.expense_date || e.created_at).getTime();
    const matchDate = (dateStartMs === null || effMs >= dateStartMs) && (dateEndMs === null || effMs <= dateEndMs);
    return matchSearch && matchTab && matchProject && matchDate;
  });

  // Project + date only — reused by the 3 summary cards and all 4 Tabs
  // badges below. Deliberately does NOT include the tab/search filters
  // `filtered` (the actual table below) applies: the tab badges need to
  // show each tab's own count regardless of which tab is currently
  // active (a "Pending" badge that only counted pending rows after an
  // "approved" tab filter was already applied would always read 0), and
  // the 3 summary cards are meant to show a status breakdown for the
  // current project/date selection, not just re-total whichever tab
  // happens to be open. Same matchProject/matchDate logic as `filtered`
  // above, not a second, differently-worded copy.
  const projectDateFiltered = expenses.filter(e => {
    const matchProject = projectFilter === NO_PROJECT_FILTER
      ? e.project_id === null
      : !projectFilter || e.project_id === projectFilter;
    const effMs = new Date(e.expense_date || e.created_at).getTime();
    const matchDate = (dateStartMs === null || effMs >= dateStartMs) && (dateEndMs === null || effMs <= dateEndMs);
    return matchProject && matchDate;
  });

  // Header subtitle's own all-time total — intentionally left unfiltered,
  // a stable "how many expense records exist in total" reference,
  // distinct from the summary cards below. Not part of the reported bug
  // (which was about the 3 cards and the tab badges specifically) and
  // left showing exactly what it showed before this fix.
  const allTimeTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Totals — THE BUG: these were computed straight from the raw,
  // unfiltered `expenses` array, same as the Tabs badges below, while the
  // table itself already correctly applied search/tab/project/date via
  // `filtered`. Now derived from projectDateFiltered instead, so changing
  // the date range or project filter actually moves these numbers.
  // The filing cabinet holds every picture in the receipts folder, whatever the filters: expense receipts, supplier bill
  // pictures, and pictures not attached to anything. Its tab count is all of them (it used to count only receipts in the
  // date filter, so it could say 1 while the cabinet showed 4).
  const attachedPaths = new Set<string>([
    ...[...receiptRefs.current.values()].map(v => toStoredRef(v)).filter((v): v is string => !!v),
    ...billPics.map(b => b.path),
  ]);
  // pictures still waiting in the Receipt Inbox (inbox-...) are the inbox's to file, not loose pictures
  const looseFiles = (folderFiles || []).filter(f => !attachedPaths.has(f.path) && !f.name.startsWith("inbox-"));
  const expenseReceipts = expenses.filter(e => !!e.receipt_url);
  const cabinetCount = expenseReceipts.length + billPics.length + looseFiles.length;

  // Rejected expenses never count; "Approved" includes paid (reimbursed) ones - the same rule as Project Finance and the
  // project dashboard. (Total used to include rejected, and Approved left out reimbursed.)
  const totalAll = projectDateFiltered.filter(e => e.status !== "rejected").reduce((s, e) => s + (e.amount || 0), 0);
  const totalPending = projectDateFiltered.filter(e => e.status === "pending").reduce((s, e) => s + (e.amount || 0), 0);
  const totalApproved = projectDateFiltered.filter(e => e.status === "approved" || e.status === "reimbursed").reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Expenses"
        subtitle={`${totalCount ?? expenses.length} total · ${fmt(allTimeTotal)}`}
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<Download size={13}/>} onClick={exportCSV}>Export</Btn>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={openNew}>Log Expense</Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Total Expenses", value: fmt(totalAll),     color: "text-slate-800 dark:text-slate-200" },
            { label: "Pending",        value: fmt(totalPending),  color: "text-amber-400" },
            { label: "Approved & paid", value: fmt(totalApproved), color: "text-emerald-400" },
          ].map(s => (
            <Card key={s.label} className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">{s.label}</div>
              <div className={cn("text-lg sm:text-2xl font-bold truncate", s.color)}>{s.value}</div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs
          tabs={[
            { key: "all" as Tab,      label: "All",      count: projectDateFiltered.length },
            { key: "pending" as Tab,  label: "Pending",  count: projectDateFiltered.filter(e => e.status === "pending").length },
            { key: "approved" as Tab, label: "Approved", count: projectDateFiltered.filter(e => e.status === "approved").length },
            { key: "filing" as Tab, label: "📁 Filing Cabinet", count: cabinetCount },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-700"/>
            <Input className="pl-8" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-44">
            <option value="">All projects</option>
            <option value={NO_PROJECT_FILTER}>Company / No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)} className="w-40">
            {DATE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
          {dateRange === "custom" && (
            <>
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" aria-label="Custom range start"/>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" aria-label="Custom range end"/>
            </>
          )}
        </div>

        {ledgerNote && <Alert type={ledgerNote.kind} onClose={() => setLedgerNote(null)}>{ledgerNote.text}</Alert>}
        {listNote && <Alert type="info" onClose={() => setListNote(null)}>{listNote}</Alert>}

        {/* Table (the Filing Cabinet tab shows the cabinet instead) */}
        {tab !== "filing" && <Card padding={false}>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Project</Th>
                <Th>Worker</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Ledger</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={9} className="text-center py-10 text-slate-500 dark:text-slate-600">
                  <RefreshCw size={14} className="animate-spin inline mr-2"/>Loading...
                </Td></tr>
              ) : filtered.length === 0 ? (
                <tr><Td colSpan={9}>
                  <Empty icon={<Receipt size={18}/>} title="No expenses found"
                    action={<Btn variant="primary" size="sm" icon={<Plus size={12}/>} onClick={openNew}>Log Expense</Btn>}/>
                </Td></tr>
              ) : filtered.map(e => (
                <Tr key={e.id} onClick={() => setViewing(e)}>
                  <Td muted>{fmtDate(e.expense_date)}</Td>
                  <Td><span className="font-medium text-slate-800 dark:text-slate-200">{e.description || "—"}</span></Td>
                  <Td muted>{categoryLabel(e) || "—"}</Td>
                  <Td muted>{e.projects?.name || "—"}</Td>
                  <Td muted>
                    {e.workers ? `${e.workers.first_name} ${e.workers.last_name}` : "—"}
                  </Td>
                  <Td right><span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(e.amount)}</span></Td>
                  <Td>
                    <Badge color={STATUS_COLOR[e.status || "pending"] || "slate"} dot>
                      {e.status || "pending"}
                    </Badge>
                  </Td>
                  <Td>
                    {(() => {
                      const ls = expenseLedgerState(e, categories.find(c => c.id === e.category_id), accountsById);
                      if (ls.state === "posted") return <span title="Posted to the General Ledger"><Badge color="green" dot>Posted</Badge></span>;
                      if (ls.state === "not_posted") return <span title={ls.reason}><Badge color="amber" dot>Not posted</Badge></span>;
                      if (ls.state === "ready") return <span title="Ready to post: use Post, or save the expense again"><Badge color="amber" dot>Not posted</Badge></span>;
                      return <span className="text-slate-500 dark:text-slate-700">—</span>;
                    })()}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={ev => ev.stopPropagation()}>
                      {e.receipt_url && (
                        <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" title="View the receipt"
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">🧾</a>
                      )}
                      {POSTABLE_STATUSES.includes(e.status || "") && !e.gl_transaction_id && (
                        <button onClick={() => postAndReport(e.id, "")} title="Post this expense to the General Ledger"
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-colors">
                          Post
                        </button>
                      )}
                      {e.status === "pending" && (
                        <button onClick={() => updateStatus(e.id, "approved")}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                          Approve
                        </button>
                      )}
                      {e.status === "approved" && (
                        <button onClick={() => updateStatus(e.id, "reimbursed")}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                          Mark Paid
                        </button>
                      )}
                      <button onClick={() => openEdit(e)} title="Edit"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <Pencil size={12}/>
                      </button>
                      {userRole === "director" && (
                        <button onClick={() => deleteExpense(e)} title="Delete"
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>}
      </div>

      {/* New Expense Modal */}
      {/* Filing Cabinet: every picture in the receipts folder, by month. A picture attached to an expense or a bill can't be
          deleted here (delete the expense and its picture goes with it); only loose pictures can be deleted, by a director. */}
      {tab==="filing"&&(
        <div className="px-6 pb-6 space-y-4">
          {(() => {
            type Item =
              | { kind: "expense"; key: string; month: string; e: Expense }
              | { kind: "bill"; key: string; month: string; b: BillPicture }
              | { kind: "loose"; key: string; month: string; f: FolderFile };
            const items: Item[] = [
              ...expenseReceipts.map(e => ({ kind: "expense" as const, key: `e-${e.id}`, month: (e.expense_date || e.created_at || "").slice(0, 7), e })),
              ...billPics.map(b => ({ kind: "bill" as const, key: `b-${b.id}`, month: (b.invoice_date || "").slice(0, 7), b })),
              ...looseFiles.map(f => ({ kind: "loose" as const, key: `f-${f.path}`, month: folderMonth(f), f })),
            ];
            if (items.length === 0) return (
              <div className="text-center py-16 text-slate-600 text-sm">
                <div className="text-4xl mb-3">📁</div>
                <div>No receipts filed yet</div>
                <div className="text-xs mt-1">Scan a receipt when logging an expense to file it here</div>
              </div>
            );
            const grouped: Record<string, Item[]> = {};
            items.forEach(it => { (grouped[it.month || "0000-00"] ||= []).push(it); });
            const openPath = async (path: string) => {
              const tabWin = window.open("", "_blank");
              const url = await resolveFileUrl(path).catch(() => null);
              if (url && tabWin) tabWin.location.href = url;
              else { tabWin?.close(); setLedgerNote({ kind: "error", text: "The picture could not be opened. Only people with full finance access, or whoever added it, can see it." }); }
            };
            const deleteLoose = async (f: FolderFile) => {
              if (!window.confirm("Delete this picture? It is not attached to any expense or bill. This can't be undone.")) return;
              const { error: re } = await supabase.storage.from(PRIVATE_FILES_BUCKET).remove([f.path]);
              if (re) { setLedgerNote({ kind: "error", text: `The picture was not deleted: ${re.message}` }); return; }
              setFolderFiles(list => (list || []).filter(x => x.path !== f.path));
            };
            const btn = "flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-600 dark:text-slate-400 text-[10px] transition";
            return (
              <>
                {folderFiles === null && (
                  <div className="text-[11px] text-slate-500">Showing expense receipts and bill pictures. Pictures not attached to anything are shown to people with full finance access.</div>
                )}
                {Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([key, list])=>{
                  const [year, month] = key.split("-");
                  const monthName = Number(month) ? new Date(Number(year), Number(month)-1).toLocaleString("en-US",{month:"long"}) : "No date";
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] overflow-hidden">
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-white/[0.05] flex items-center gap-2">
                        <span>📁</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{monthName} {Number(month) ? year : ""}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-600 ml-auto">{list.length} picture{list.length!==1?"s":""}</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                        {list.map(it => (
                          <div key={it.key} className="flex items-center gap-3 px-4 py-3">
                            {it.kind === "expense" ? (
                              <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] flex-shrink-0 cursor-pointer"
                                onClick={()=>window.open(it.e.receipt_url!,"_blank")}>
                                <img src={it.e.receipt_url!} className="w-full h-full object-cover"/>
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] flex-shrink-0 flex items-center justify-center text-xl">
                                {it.kind === "bill" ? "🧾" : "🖼️"}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              {it.kind === "expense" && <>
                                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{it.e.description||"Expense"}</div>
                                <div className="text-[10px] text-slate-500">{it.e.expense_date?new Date(`${it.e.expense_date}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):""} · {it.e.projects?.name||"No project"}</div>
                                <div className="text-[10px] text-slate-400">Attached to this expense. Delete the expense and its picture goes with it.</div>
                              </>}
                              {it.kind === "bill" && <>
                                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Bill {it.b.invoice_number} · {it.b.supplier}</div>
                                <div className="text-[10px] text-slate-500">{new Date(`${it.b.invoice_date}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
                                <div className="text-[10px] text-slate-400">Attached to a supplier bill (Payables).</div>
                              </>}
                              {it.kind === "loose" && <>
                                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Not attached to any expense or bill</div>
                                <div className="text-[10px] text-slate-500">Added {it.f.created_at ? new Date(it.f.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""}</div>
                              </>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {it.kind === "expense" && <div className="text-sm font-bold text-emerald-500">JMD {(it.e.amount||0).toLocaleString()}</div>}
                              {it.kind === "bill" && <div className="text-sm font-bold text-slate-700 dark:text-slate-300">JMD {(it.b.total_amount||0).toLocaleString()}</div>}
                              <div className="flex flex-wrap justify-end gap-1 mt-1">
                                {it.kind === "expense" ? <>
                                  <button onClick={()=>window.open(it.e.receipt_url!,"_blank")} className={btn}>👁 View</button>
                                  <button onClick={()=>showPrintPreview(`<!DOCTYPE html><html><head><title>Receipt</title></head><body style="margin:0"><img src="${it.e.receipt_url}" style="max-width:100%"/></body></html>`)} className={btn}>🖨 Print</button>
                                </> : it.kind === "bill" ? (
                                  <button onClick={()=>{ void openPath(it.b.path); }} className={btn}>👁 View</button>
                                ) : <>
                                  <button onClick={()=>{ void openPath(it.f.path); }} className={btn}>👁 View</button>
                                  <button onClick={()=>{ openNew(); setForm(f => ({ ...f, receipt_url: it.f.path })); }} className={btn}>➕ Log expense with it</button>
                                  {userRole === "director" && (
                                    <button onClick={()=>{ void deleteLoose(it.f); }} className={cn(btn, "text-red-600 dark:text-red-400")}>🗑 Delete</button>
                                  )}
                                </>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
      <Modal open={showNew} onClose={closeModal}
        title={editingExpense ? "Edit Expense" : "Log Expense"}
        subtitle={editingExpense ? "Update this expense's details" : "Record a new project expense"}>
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* Receipt Scanner */}
          {showExpenseScanner ? (
            <ReceiptScanner
              onResult={handleExpenseScan}
              onCancel={() => setShowExpenseScanner(false)}
            />
          ) : (
            <button onClick={() => setShowExpenseScanner(true)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-3 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Scan Receipt with AI</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-600">Auto-fill from photo</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 dark:text-slate-700 ml-auto"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          {/* the receipt itself: see it, open it big, or change it */}
          <input ref={replaceRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setReceiptFile(f); }}/>
          {(receiptFile || form.receipt_url) ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-white/[0.08] p-2">
              {receiptView && !(receiptFile ? receiptFile.type === "application/pdf" : isPdf(form.receipt_url))
                ? <a href={receiptView} target="_blank" rel="noopener noreferrer"><img src={receiptView} alt="Receipt" className="h-24 w-20 rounded-lg object-cover border border-slate-200"/></a>
                : <a href={receiptView || undefined} target="_blank" rel="noopener noreferrer" className="h-24 w-20 rounded-lg bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center text-3xl">📄</a>}
              <div className="text-[11px] space-y-1.5">
                <div className={receiptFile ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}>
                  {receiptFile ? "New receipt picture: it is filed in the receipts folder when you save." : "The receipt attached to this expense."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {receiptView && <a href={receiptView} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 underline">🧾 View receipt</a>}
                  <button type="button" onClick={() => replaceRef.current?.click()} className="font-semibold text-slate-600 dark:text-slate-300 underline">{receiptFile ? "Choose another" : "Replace picture"}</button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => replaceRef.current?.click()} className="text-[11px] font-semibold text-blue-600 underline">📎 Attach a receipt picture (without scanning)</button>
          )}

          <Field label="Description">
            <Input placeholder="e.g. Cement bags from Hardware Plus" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} autoFocus/>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor / shop">
              <Input placeholder="e.g. Hardware Plus" value={form.vendor}
                onChange={e => { setNotDuplicate(false); setForm(f => ({ ...f, vendor: e.target.value })); }}/>
            </Field>
            <Field label="Receipt / bill #" hint="The number printed on it. Stops it being entered twice.">
              <Input placeholder="e.g. 004512" value={form.receipt_number}
                onChange={e => { setNotDuplicate(false); setForm(f => ({ ...f, receipt_number: e.target.value })); }}/>
            </Field>
          </div>
          {exactDups.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <b>Already exists:</b> {describeDuplicate(exactDups[0])}. This receipt can't be entered again.
            </div>
          )}
          {exactDups.length === 0 && possibleDups.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <div><b>This looks like it is already entered:</b> {describeDuplicate(possibleDups[0])}{possibleDups.length > 1 ? ` and ${possibleDups.length - 1} more` : ""}.</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notDuplicate} onChange={e => setNotDuplicate(e.target.checked)}/>
                This is a different purchase - save it anyway
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount ($)">
              <Input type="number" placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
            </Field>
            <Field label="Date">
              <Input type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}/>
              {(() => {
                // Scanned receipts sometimes come back with the wrong year: flag dates far from today.
                if (!form.expense_date) return null;
                const days = Math.round((Date.now() - new Date(`${form.expense_date}T12:00:00`).getTime()) / 86400000);
                if (days < -1) return <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">This date is in the future. Check it.</div>;
                if (days > 45) return <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">This date is {days > 400 ? `${Math.round(days / 365)} year(s)` : `${days} days`} ago. Check it is right.</div>;
                return null;
              })()}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(() => {
              // Leaf expense accounts, plus the account already on this expense if it is no longer offered (deactivated, or a heading account).
              const picked = form.chart_account_id ? accountsById.get(form.chart_account_id) : undefined;
              const options = picked && !expenseAccounts.some(a => a.id === picked.id) ? [...expenseAccounts, picked].sort(byCode) : expenseAccounts;
              return (
                <Field label="Category" hint={expenseAccounts.length === 0 ? "No expense accounts yet. Add one in Chart of Accounts and it will appear here." : "Your expense accounts from the Chart of Accounts."}>
                  <Select value={form.chart_account_id} onChange={e => setForm(f => ({ ...f, chart_account_id: e.target.value }))}>
                    <option value="">No category</option>
                    {options.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}{a.is_active === false ? " (inactive)" : groupIds.has(a.id) ? " (group account)" : ""}</option>)}
                  </Select>
                </Field>
              );
            })()}
            <Field label="Project">
              <Select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          {(() => {
            const catAccount = form.chart_account_id ? accountsById.get(form.chart_account_id) : undefined;
            const needsProject = !!catAccount?.is_project_linkable && !form.project_id;
            // Money accounts (bank, cash, petty cash) and accounts for money OWED (payables, reimbursements, credit cards), shown in two groups.
            const usable = accounts.filter(a => a.is_active !== false && isPaidFromAccount(a));
            const moneyAccounts = usable.filter(a => a.type === "asset").sort(byCode);
            const owedAccounts = usable.filter(a => a.type === "liability").sort(byCode);
            const optionText = (a: LedgerAccount) => `${a.code} - ${a.name}${detectNonJmdCurrency(a.name) ? ` (${detectNonJmdCurrency(a.name)} account)` : ""}`;
            const chosen = accounts.find(a => a.id === form.paid_from_account_id);
            const chosenCurrency = chosen ? detectNonJmdCurrency(chosen.name) : null;
            return (
              <>
                {needsProject && (
                  <div className="text-[11px] text-amber-500">The ledger account for this category ({catAccount!.code} {catAccount!.name}) requires a project. Pick one so this expense can be posted.</div>
                )}
                <Field label="Paid from" hint="Where the money came from: a bank, cash or petty-cash account if it was paid now, or a payable / credit-card account if it is still owed. Needed to post this expense to the ledger; you can set it later.">
                  <Select value={form.paid_from_account_id} onChange={e => setForm(f => ({ ...f, paid_from_account_id: e.target.value }))}>
                    <option value="">Not set yet</option>
                    {moneyAccounts.length > 0 && (
                      <optgroup label="Paid now (bank, cash, petty cash)">
                        {moneyAccounts.map(a => <option key={a.id} value={a.id}>{optionText(a)}</option>)}
                      </optgroup>
                    )}
                    {owedAccounts.length > 0 && (
                      <optgroup label="Not paid yet (payables, credit cards)">
                        {owedAccounts.map(a => <option key={a.id} value={a.id}>{optionText(a)}</option>)}
                      </optgroup>
                    )}
                  </Select>
                </Field>
                {chosenCurrency && (
                  <div className="text-[11px] text-amber-500">{chosen!.code} {chosen!.name} looks like a {chosenCurrency} account. This expense will be recorded in JMD (the amount as entered), with no currency conversion. You can still select it.</div>
                )}
              </>
            );
          })()}
          {/* the items on the receipt (a record of what was bought; the Amount above is what goes in the books) */}
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Items on the receipt {form.items.length > 0 && <span className="font-normal text-slate-400">({form.items.length})</span>}</div>
              <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, { description: "", quantity: "", unit_price: "", amount: "" }] }))}
                className="text-[11px] font-semibold text-blue-600 underline">＋ Add item</button>
            </div>
            {form.items.length === 0 ? <div className="text-[11px] text-slate-400">No items. Scanning a receipt fills them in, or add them yourself.</div> : (<>
              <div className="grid grid-cols-[1fr_56px_80px_88px_20px] gap-1 text-[10px] font-semibold text-slate-400"><span>Item</span><span>Qty</span><span>Price</span><span>Amount</span><span/></div>
              {form.items.map((it, i) => {
                const set = (k: keyof ItemRow, v: string) => setForm(f => ({ ...f, items: f.items.map((x, j) => {
                  if (j !== i) return x;
                  const nx = { ...x, [k]: v };
                  // quantity x price fills the amount (when both are numbers)
                  if ((k === "quantity" || k === "unit_price") && Number(nx.quantity) > 0 && Number(nx.unit_price) > 0) nx.amount = String(Math.round(Number(nx.quantity) * Number(nx.unit_price) * 100) / 100);
                  return nx;
                }) }));
                const cls = "w-full rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200";
                return (
                  <div key={i} className="grid grid-cols-[1fr_56px_80px_88px_20px] gap-1 items-center">
                    <input value={it.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Cement 42.5" className={cls}/>
                    <input value={it.quantity} onChange={e => set("quantity", e.target.value)} inputMode="decimal" className={cls}/>
                    <input value={it.unit_price} onChange={e => set("unit_price", e.target.value)} inputMode="decimal" className={cls}/>
                    <input value={it.amount} onChange={e => set("amount", e.target.value)} inputMode="decimal" className={cls}/>
                    <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-500" aria-label="Remove item">×</button>
                  </div>
                );
              })}
              {(() => {
                const sum = form.items.reduce((t, x) => t + (Number(x.amount.replace(/,/g, "")) || 0), 0);
                const amt = Number(form.amount) || 0;
                const off = Math.abs(sum - amt) > 0.5;
                return (
                  <div className={`text-[11px] ${off ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}`}>
                    Items add up to {fmt(sum)}{off ? ` (the expense amount is ${fmt(amt)}; tax or a discount can explain the difference)` : ""}.
                    {off && sum > 0 && <button type="button" onClick={() => setForm(f => ({ ...f, amount: String(Math.round(sum * 100) / 100) }))} className="ml-2 font-semibold underline">Use {fmt(sum)} as the amount</button>}
                  </div>
                );
              })()}
            </>)}
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="reimbursed">Reimbursed / Paid</option>
              <option value="rejected">Rejected</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveExpense}
              disabled={!form.description.trim() || !form.amount || saving || exactDups.length > 0 || (possibleDups.length > 0 && !notDuplicate)}>
              {saving ? "Saving..." : editingExpense ? "Save Changes" : "Log Expense"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* one expense opened to look at: its details, the receipt picture and the items */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.description || "Expense"}
        subtitle={viewing ? `${fmtDate(viewing.expense_date)} · ${fmt(viewing.amount)}` : undefined}>
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {([
                ["Vendor / shop", viewing.vendor || "—"], ["Receipt / bill #", viewing.receipt_number || "—"],
                ["Category", categoryLabel(viewing) || "—"], ["Project", viewing.projects?.name || "—"],
                ["Status", viewing.status || "pending"], ["Paid from", viewing.paid_from_account_id ? (accountsById.get(viewing.paid_from_account_id)?.name || "—") : "—"],
                ["Ledger", viewing.gl_transaction_id ? "Posted" : "Not posted"], ["Amount", fmt(viewing.amount)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}><div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div><div className="font-semibold text-slate-800 dark:text-slate-200">{v}</div></div>
              ))}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Receipt</div>
              {viewing.receipt_url ? (
                isPdf(receiptRefs.current.get(viewing.id))
                  ? <a href={viewing.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-blue-600">📄 Open the receipt (PDF)</a>
                  : <a href={viewing.receipt_url} target="_blank" rel="noopener noreferrer" title="Open full size"><img src={viewing.receipt_url} alt="Receipt" className="max-h-80 w-auto rounded-lg border border-slate-200"/></a>
              ) : <div className="text-xs text-slate-400">No receipt picture. Use Edit → "Attach a receipt picture".</div>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Items on the receipt</div>
              {(viewing.line_items || []).length === 0 ? <div className="text-xs text-slate-400">No items recorded.</div> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-400"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {(viewing.line_items || []).map((it, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-white/[0.05] text-slate-700 dark:text-slate-300">
                        <td className="py-1">{it.description || "—"}</td><td className="text-right">{it.quantity ?? ""}</td>
                        <td className="text-right">{it.unit_price != null ? fmt(it.unit_price) : ""}</td><td className="text-right font-semibold">{it.amount != null ? fmt(it.amount) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              {viewing.receipt_url && <a href={viewing.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-slate-200 dark:border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">🧾 Open receipt</a>}
              <Btn variant="ghost" onClick={() => setViewing(null)}>Close</Btn>
              <Btn variant="primary" onClick={() => { const e = viewing; setViewing(null); openEdit(e); }}>✏️ Edit</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}