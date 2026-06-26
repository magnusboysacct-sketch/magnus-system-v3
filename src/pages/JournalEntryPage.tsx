// src/pages/JournalEntryPage.tsx — v2
// Features: auto-fill balancing line, auto-file by Year/Month on post

import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import {
  PageHeader, Card, CardHeader, Badge, Btn, Input, Select,
  Field, Alert, Divider, cn
} from "../components/ui";
import {
  Plus, Trash2, Save, Send, Check,
  AlertCircle, ArrowLeft, Info, ToggleLeft, ToggleRight,
  FolderOpen, Zap, Camera, ScanLine, X as XIcon, ChevronDown, ChevronUp
} from "lucide-react";
import { ReceiptScanner } from "../components/ReceiptScanner";
import type { ReceiptScanResult as OCRResult } from "../lib/magnusAI";

// ─── Types ────────────────────────────────────────────────────────────────────

type Account = {
  id: string; code: string; name: string;
  type: string; subtype: string | null; current_balance: number;
};

type EntryLine = {
  id: string; account_id: string;
  debit: string; credit: string;
  description: string; project_id: string;
};

type SourceType = "manual" | "opening_balance" | "adjustment" | "reclassification" | "bank_transfer";

const SOURCE_TYPES = [
  { value: "manual",           label: "Manual Journal Entry",  desc: "General purpose entry" },
  { value: "opening_balance",  label: "Opening Balance",        desc: "Set initial account balances" },
  { value: "adjustment",       label: "Period Adjustment",      desc: "End-of-period adjustments" },
  { value: "reclassification", label: "Reclassification",       desc: "Move amounts between accounts" },
  { value: "bank_transfer",    label: "Bank Transfer",          desc: "Transfer between bank accounts" },
];

const TYPE_COLOR: Record<string, string> = {
  asset: "text-cyan-400", liability: "text-red-400",
  equity: "text-violet-400", revenue: "text-emerald-400", expense: "text-amber-400",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function newLine(): EntryLine {
  return { id: crypto.randomUUID(), account_id: "", debit: "", credit: "", description: "", project_id: "" };
}

// ─── Auto-file helper ─────────────────────────────────────────────────────────
// Creates a path like "journal-entries/2026/June/JE-XXXXXXXX"
// Stores the reference in gl_transactions.notes as a JSON tag

function getFilingPath(date: string, txNumber: string): string {
  const d = new Date(date);
  const year = d.getFullYear().toString();
  const month = d.toLocaleString("en-US", { month: "long" });
  return `journal-entries/${year}/${month}/${txNumber}.json`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function JournalEntryPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { projects } = useProjectContext();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Settings
  const [autoFill, setAutoFill] = useState(true);
  const [autoFile, setAutoFile] = useState(true);
  const [filedPath, setFiledPath] = useState<string | null>(null);

  // Receipt scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<OCRResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Header
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [sourceType, setSourceType] = useState<SourceType>(
    (searchParams.get("type") as SourceType) || "manual"
  );
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  // Lines
  const [lines, setLines] = useState<EntryLine[]>([newLine(), newLine()]);

  // Totals
  const totalDebits  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const diff         = totalDebits - totalCredits;
  const isBalanced   = Math.abs(diff) < 0.001;
  const hasEntries   = lines.some(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));

  useEffect(() => {
    // Load companyId directly — does NOT depend on project selection
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.company_id) {
            setCompanyId(data.company_id);
          } else {
            // Fallback: try to get from any project the user has access to
            supabase.from("projects")
              .select("company_id")
              .limit(1)
              .maybeSingle()
              .then(({ data: pd }) => {
                if (pd?.company_id) setCompanyId(pd.company_id);
              });
          }
        });
    });
  }, []);

  useEffect(() => { if (companyId) loadAccounts(); }, [companyId]);

  async function loadAccounts() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, type, subtype, current_balance")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (e) throw e;
      setAccounts(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ─── Line management ─────────────────────────────────────────────────────────

  function updateLine(id: string, field: keyof EntryLine, value: string) {
    setLines(prev => {
      const updated = prev.map(l => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: value };
        if (field === "debit"  && value) next.credit = "";
        if (field === "credit" && value) next.debit  = "";
        return next;
      });

      // ── AUTO-FILL ──
      // When user finishes entering an amount on a line and autoFill is on,
      // find the last empty line and fill it with the balancing amount
      if (autoFill && (field === "debit" || field === "credit") && value) {
        const newDebits  = updated.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
        const newCredits = updated.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
        const newDiff    = newDebits - newCredits;

        if (Math.abs(newDiff) > 0.001) {
          // Find last line that has no amount and no account yet — ideal target
          const emptyIdx = updated.map((l, i) => i).reverse()
            .find(i => !updated[i].debit && !updated[i].credit);

          if (emptyIdx !== undefined) {
            const target = { ...updated[emptyIdx] };
            if (newDiff > 0) { target.credit = newDiff.toFixed(2); target.debit = ""; }
            else             { target.debit = Math.abs(newDiff).toFixed(2); target.credit = ""; }
            updated[emptyIdx] = target;
          }
        }
      }

      return updated;
    });
  }

  function addLine() { setLines(prev => [...prev, newLine()]); }

  function removeLine(id: string) {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function autoBalance() {
    if (Math.abs(diff) < 0.001) return;
    setLines(prev => prev.map((l, i) => {
      if (i !== prev.length - 1) return l;
      if (diff > 0) return { ...l, credit: diff.toFixed(2), debit: "" };
      else          return { ...l, debit: Math.abs(diff).toFixed(2), credit: "" };
    }));
  }

  // ─── OCR Receipt Handler ─────────────────────────────────────────────────────

  function handleOCRResult(ocr: OCRResult | null) {
    setShowScanner(false);
    if (!ocr) return;
    setScanResult(ocr);

    // Auto-fill header fields from OCR
    if (ocr.vendor && !description) setDescription(`${ocr.vendor} - Receipt`);
    if (ocr.date) {
      // Convert date string to YYYY-MM-DD
      try {
        const d = new Date(ocr.date);
        if (!isNaN(d.getTime())) setDate(d.toISOString().split("T")[0]);
      } catch {}
    }
    if (ocr.receiptNumber && !reference) setReference(ocr.receiptNumber);

    // Auto-fill amount into first debit line
    if (ocr.amount && ocr.amount > 0) {
      setLines(prev => {
        const updated = [...prev];
        // Find first empty line or use first line
        const targetIdx = updated.findIndex(l => !l.debit && !l.credit) ?? 0;
        updated[targetIdx] = {
          ...updated[targetIdx],
          debit: ocr.amount!.toFixed(2),
          credit: "",
          description: ocr.vendor || "",
        };
        return updated;
      });
    }
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!description.trim()) return "Description is required";
    if (!date) return "Date is required";
    if (!hasEntries) return "At least one entry line with an account and amount is required";
    if (!isBalanced) return `Not balanced. Debits: ${fmt(totalDebits)}, Credits: ${fmt(totalCredits)}, Difference: ${fmt(Math.abs(diff))}`;
    for (const l of lines) {
      if (!l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
        return "All entry lines with amounts must have an account selected";
    }
    return null;
  }

  // ─── Auto-file to storage ─────────────────────────────────────────────────────

  async function fileEntry(txId: string, txNumber: string, entries: any[]) {
    if (!autoFile) return null;
    try {
      const path = getFilingPath(date, txNumber);
      const payload = {
        transaction_id: txId,
        transaction_number: txNumber,
        date, description, reference, source_type: sourceType,
        total_debits: totalDebits, total_credits: totalCredits,
        entries: entries.map(e => ({
          account: accounts.find(a => a.id === e.account_id)?.name,
          code:    accounts.find(a => a.id === e.account_id)?.code,
          debit:   e.debit, credit: e.credit,
        })),
        filed_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const file = new File([blob], `${txNumber}.json`, { type: "application/json" });
      const { error: uploadErr } = await supabase.storage
        .from("project-files")
        .upload(path, file, { upsert: true });
      if (uploadErr) {
        console.warn("Auto-file upload failed:", uploadErr.message);
        return null;
      }
      return path;
    } catch (e) {
      console.warn("Auto-file error:", e);
      return null;
    }
  }

  // ─── Save / Post ──────────────────────────────────────────────────────────────

  async function save(status: "draft" | "posted") {
    const validErr = validate();
    if (validErr) { setError(validErr); return; }

    setSaving(true); setError(null); setSuccess(null); setFiledPath(null);

    try {
      const txNumber = `JE-${new Date(date).getFullYear()}${String(new Date(date).getMonth() + 1).padStart(2,"0")}-${Date.now().toString().slice(-6)}`;

      const { data: tx, error: txErr } = await supabase
        .from("gl_transactions")
        .insert({
          company_id:         companyId,
          transaction_number: txNumber,
          transaction_date:   date,
          reference:          reference.trim() || null,
          source_type:        sourceType,
          description:        description.trim(),
          total_amount:       totalDebits,
          currency:           "USD",
          status,
          notes:              notes.trim() || null,
          posted_at:          status === "posted" ? new Date().toISOString() : null,
        })
        .select()
        .maybeSingle();

      if (txErr) throw txErr;
      if (!tx) throw new Error("Failed to create transaction");

      const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));

      const entries = validLines.map((l, i) => ({
        transaction_id: tx.id,
        company_id:     companyId,
        account_id:     l.account_id,
        debit:          parseFloat(l.debit)  || 0,
        credit:         parseFloat(l.credit) || 0,
        project_id:     l.project_id || null,
        description:    l.description.trim() || description.trim(),
        line_number:    i + 1,
        entry_type:     sourceType === "opening_balance" ? "opening_balance" : "regular",
        reconciled:     false,
      }));

      const { error: entryErr } = await supabase.from("gl_entries").insert(entries);
      if (entryErr) throw entryErr;

      // Update account balances if posting
      if (status === "posted") {
        for (const l of validLines) {
          const acct = accounts.find(a => a.id === l.account_id);
          if (!acct) continue;
          const debit  = parseFloat(l.debit)  || 0;
          const credit = parseFloat(l.credit) || 0;
          const change = ["asset","expense"].includes(acct.type)
            ? debit - credit
            : credit - debit;
          await supabase.from("chart_of_accounts")
            .update({ current_balance: (acct.current_balance || 0) + change })
            .eq("id", l.account_id);
        }
      }

      // ── AUTO-FILE ──
      let path: string | null = null;
      if (status === "posted") {
        path = await fileEntry(tx.id, txNumber, validLines);
        if (path) setFiledPath(path);
      }

      setSuccess(
        status === "posted"
          ? `✓ ${txNumber} posted successfully.${path ? ` Filed to: ${path}` : ""}`
          : `${txNumber} saved as draft.`
      );

      // Reset form
      setTimeout(() => {
        if (status === "posted") nav("/finance");
        else {
          setLines([newLine(), newLine()]);
          setDescription(""); setReference(""); setNotes("");
          setSuccess(null);
        }
      }, 2000);

    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const accountsByType = accounts.reduce((acc: Record<string, Account[]>, a) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Journal Entry"
        subtitle="Double-entry bookkeeping"
        back={() => nav("/finance")}
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={() => nav("/finance")}>Cancel</Btn>
            <Btn variant="secondary" size="sm" icon={<Save size={13}/>}
              onClick={() => save("draft")} disabled={saving || !hasEntries}>
              Save Draft
            </Btn>
            <Btn variant="primary" size="sm" icon={<Send size={13}/>}
              onClick={() => save("posted")} disabled={saving || !isBalanced || !hasEntries}>
              {saving ? "Posting..." : "Post Entry"}
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-4 max-w-5xl">
        {error   && <Alert type="error"   onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

        {/* Settings bar */}
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Entry Settings</span>
          <div className="flex items-center gap-4 ml-2">
            <button onClick={() => setAutoFill(v => !v)}
              className={cn("flex items-center gap-1.5 text-xs transition-colors", autoFill ? "text-cyan-400" : "text-slate-600")}>
              {autoFill ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
              <Zap size={11}/>
              Auto-fill balancing line
            </button>
            <button onClick={() => setAutoFile(v => !v)}
              className={cn("flex items-center gap-1.5 text-xs transition-colors", autoFile ? "text-emerald-400" : "text-slate-600")}>
              {autoFile ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
              <FolderOpen size={11}/>
              Auto-file by Year/Month
            </button>
            {autoFile && (
              <span className="text-[9px] text-slate-700 font-mono">
                → journal-entries/{new Date(date).getFullYear()}/{new Date(date).toLocaleString("en-US",{month:"long"})}/
              </span>
            )}
          </div>
        </div>

        {/* Header */}
        <Card>
          <CardHeader title="Entry Details"/>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date">
              <Input type="date" value={date} onChange={e => setDate(e.target.value)}/>
            </Field>
            <Field label="Entry Type">
              <Select value={sourceType} onChange={e => setSourceType(e.target.value as SourceType)}>
                {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Reference #">
              <Input placeholder="INV-001, CHQ-045" value={reference} onChange={e => setReference(e.target.value)}/>
            </Field>
            <Field label="Description">
              <Input placeholder="e.g. Opening bank balance" value={description} onChange={e => setDescription(e.target.value)}/>
            </Field>
          </div>

          {sourceType === "opening_balance" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2.5">
              <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5"/>
              <div className="text-[11px] text-blue-300">
                <strong>Opening Balance:</strong> Debit asset & expense accounts. Credit liability, equity & revenue accounts. Offset with <em>Retained Earnings</em> or <em>Owner's Equity</em>.
              </div>
            </div>
          )}
        </Card>

        {/* Entry lines */}
        <Card padding={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">Journal Lines</span>
              {autoFill && <Badge color="cyan">Auto-fill ON</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {!isBalanced && hasEntries && (
                <button onClick={autoBalance}
                  className="text-[10px] text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg transition-colors">
                  Auto-balance last line
                </button>
              )}
              <Btn size="xs" variant="secondary" icon={<Plus size={11}/>} onClick={addLine}>Add Line</Btn>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-slate-100 dark:border-white/[0.04] text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-700">
            <div className="col-span-4">Account</div>
            <div className="col-span-3">Line Description</div>
            <div className="col-span-2">Project</div>
            <div className="col-span-1 text-right">Debit (Dr)</div>
            <div className="col-span-1 text-right">Credit (Cr)</div>
            <div className="col-span-1"/>
          </div>

          {/* Lines */}
          <div className="divide-y divide-white/[0.04]">
            {lines.map((line, idx) => {
              const acct = accounts.find(a => a.id === line.account_id);
              const hasDebit  = parseFloat(line.debit)  > 0;
              const hasCredit = parseFloat(line.credit) > 0;
              return (
                <div key={line.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-start hover:bg-white/[0.01] transition-colors">
                  {/* Account */}
                  <div className="col-span-4">
                    <select value={line.account_id}
                      onChange={e => updateLine(line.id, "account_id", e.target.value)}
                      className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-cyan-500/50 transition-colors">
                      <option value="">Select account...</option>
                      {(["asset","liability","equity","revenue","expense"] as const).map(type => (
                        <optgroup key={type} label={type.toUpperCase()}>
                          {(accountsByType[type] || []).map(a => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {acct && (
                      <div className="flex items-center gap-1.5 mt-0.5 px-1">
                        <span className={cn("text-[9px] font-bold uppercase", TYPE_COLOR[acct.type])}>{acct.type}</span>
                        <span className="text-[9px] text-slate-700">Bal: {fmt(acct.current_balance||0)}</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="col-span-3">
                    <Input placeholder="Note..." value={line.description}
                      onChange={e => updateLine(line.id, "description", e.target.value)}
                      className="text-xs py-1.5"/>
                  </div>

                  {/* Project */}
                  <div className="col-span-2">
                    <Select value={line.project_id}
                      onChange={e => updateLine(line.id, "project_id", e.target.value)}
                      className="text-xs py-1.5">
                      <option value="">No project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </div>

                  {/* Debit */}
                  <div className="col-span-1">
                    <input type="number" placeholder="0.00" value={line.debit}
                      onChange={e => updateLine(line.id, "debit", e.target.value)}
                      className={cn(
                        "w-full bg-white/[0.04] border rounded-lg px-2 py-1.5 text-xs text-right outline-none transition-colors",
                        hasDebit
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 focus:border-emerald-500/60"
                          : "border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 focus:border-cyan-500/50"
                      )}/>
                  </div>

                  {/* Credit */}
                  <div className="col-span-1">
                    <input type="number" placeholder="0.00" value={line.credit}
                      onChange={e => updateLine(line.id, "credit", e.target.value)}
                      className={cn(
                        "w-full bg-white/[0.04] border rounded-lg px-2 py-1.5 text-xs text-right outline-none transition-colors",
                        hasCredit
                          ? "border-red-500/40 bg-red-500/10 text-red-300 focus:border-red-500/60"
                          : "border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 focus:border-cyan-500/50"
                      )}/>
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 flex justify-center pt-1">
                    <button onClick={() => removeLine(line.id)} disabled={lines.length <= 2}
                      className="p-1.5 rounded hover:bg-red-500/15 text-slate-700 hover:text-red-400 disabled:opacity-20 transition-colors">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className={cn("grid grid-cols-12 gap-2 px-4 py-3 border-t-2",
            isBalanced ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.04]")}>
            <div className="col-span-9 flex items-center gap-2">
              {isBalanced && hasEntries ? (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                  <Check size={13}/> Balanced — ready to post
                </div>
              ) : hasEntries ? (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                  <AlertCircle size={13}/> Difference: {fmt(Math.abs(diff))}
                  {autoFill && <span className="text-slate-600 font-normal ml-1">(auto-fill will balance on next entry)</span>}
                </div>
              ) : (
                <div className="text-slate-700 text-xs">Enter amounts above to begin</div>
              )}
            </div>
            <div className="col-span-1 text-right">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-0.5">Debits</div>
              <div className={cn("text-sm font-bold", totalDebits > 0 ? "text-emerald-400" : "text-slate-600")}>{fmt(totalDebits)}</div>
            </div>
            <div className="col-span-1 text-right">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-0.5">Credits</div>
              <div className={cn("text-sm font-bold", totalCredits > 0 ? "text-red-400" : "text-slate-600")}>{fmt(totalCredits)}</div>
            </div>
            <div className="col-span-1"/>
          </div>
        </Card>

        {/* Auto-file preview */}
        {autoFile && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05]">
            <FolderOpen size={13} className="text-emerald-400 flex-shrink-0"/>
            <div className="text-[11px] text-emerald-300">
              <strong>Auto-file ON:</strong> When posted, this entry will be saved to{" "}
              <span className="font-mono text-emerald-400">
                journal-entries/{new Date(date).getFullYear()}/{new Date(date).toLocaleString("en-US",{month:"long"})}/JE-XXXXXX.json
              </span>
              {" "}— folder created automatically if it doesn't exist.
            </div>
          </div>
        )}

        {/* ── Receipt Scanner ── */}
        <Card padding={false}>
          <button
            onClick={() => setShowScanner(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <ScanLine size={14} className="text-violet-400"/>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-200">Receipt Scanner</div>
                <div className="text-[10px] text-slate-600">
                  {scanResult ? `✓ Scanned: ${scanResult.vendor || "Receipt"} — $${scanResult.amount?.toFixed(2) || "0.00"}` : "Upload or photograph a receipt to auto-fill this entry"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {scanResult && <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">Scanned</span>}
              {showScanner ? <ChevronUp size={14} className="text-slate-600"/> : <ChevronDown size={14} className="text-slate-600"/>}
            </div>
          </button>

          {showScanner && (
            <div className="border-t border-slate-200 dark:border-white/[0.06] p-4">
              <div className="mb-3 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2 text-[11px] text-violet-300 flex items-start gap-2">
                <ScanLine size={12} className="flex-shrink-0 mt-0.5"/>
                <span>Upload a receipt photo or PDF. The scanner will extract vendor, date, amount and auto-fill this journal entry.</span>
              </div>
              <ReceiptScanner
                onResult={handleOCRResult}
                onCancel={() => setShowScanner(false)}
              />
            </div>
          )}

          {/* OCR result preview */}
          {scanResult && !showScanner && (
            <div className="border-t border-slate-200 dark:border-white/[0.06] px-4 pb-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mt-2 mb-2">Extracted Data</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Vendor",   value: scanResult.vendor },
                  { label: "Date",     value: scanResult.date },
                  { label: "Amount",   value: scanResult.amount ? `$${scanResult.amount.toFixed(2)}` : null },
                  { label: "Receipt#", value: scanResult.receiptNumber },
                ].map(f => f.value ? (
                  <div key={f.label} className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.05] px-2.5 py-2">
                    <div className="text-[9px] text-slate-700 mb-0.5">{f.label}</div>
                    <div className="text-xs font-semibold text-slate-300 truncate">{f.value}</div>
                  </div>
                ) : null)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-600">
                Confidence: <span className={scanResult.confidence > 0.7 ? "text-emerald-400" : "text-amber-400"}>{Math.round(scanResult.confidence * 100)}%</span>
                {scanResult.confidence < 0.5 && <span className="text-amber-400 ml-2">⚠ Low confidence — please verify amounts</span>}
              </div>
            </div>
          )}
        </Card>

        {/* Notes */}
        <Card>
          <Field label="Internal Notes (optional)">
            <textarea rows={2} placeholder="Any internal notes..."
              value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500/50 resize-none transition-colors"/>
          </Field>
        </Card>

        {/* Bottom actions */}
        <div className="flex items-center justify-between pb-8">
          <Btn variant="ghost" onClick={() => nav("/finance")}>Cancel</Btn>
          <div className="flex gap-3">
            <Btn variant="secondary" size="md" icon={<Save size={14}/>}
              onClick={() => save("draft")} disabled={saving || !hasEntries}>
              Save as Draft
            </Btn>
            <Btn variant="primary" size="md" icon={<Send size={14}/>}
              onClick={() => save("posted")} disabled={saving || !isBalanced || !hasEntries}>
              {saving ? "Posting..." : "Post Entry"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}