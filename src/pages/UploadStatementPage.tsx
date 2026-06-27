// src/pages/UploadStatementPage.tsx
import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../lib/supabase";
import { magnusAI, type StatementTransaction } from "../lib/magnusAI";
import { uploadBankStatement, storeBankTransactions } from "../services/finance/bankParser";
import {
  PageHeader, Card, Badge, Btn, Table, Th, Tr, Td, Empty, Select, Field, cn
} from "../components/ui";
import {
  Upload, FileText, Image as ImageIcon, RefreshCw, Check, X,
  AlertCircle, ArrowUpRight, ArrowDownRight
} from "lucide-react";

GlobalWorkerOptions.workerSrc = workerSrc;

type BankAccount = {
  id: string;
  account_name: string;
  bank_name?: string | null;
};

type Stage = "select" | "scanning" | "preview" | "saving" | "done";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

// Render every page of a PDF file to JPEG Blobs using pdf.js
async function pdfToImages(file: File): Promise<File[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const images: File[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
    );
    images.push(new File([blob], `${file.name}-page-${pageNum}.jpg`, { type: "image/jpeg" }));
  }

  return images;
}

export default function UploadStatementPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<StatementTransaction[]>([]);
  const [statementMeta, setStatementMeta] = useState<{ period: string; last4: string } | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("bank_accounts").select("id, account_name, bank_name")
      .eq("company_id", companyId).eq("is_active", true)
      .then(({ data }) => setAccounts(data || []));
  }, [companyId]);

  function reset() {
    setStage("select");
    setFile(null);
    setExtracted([]);
    setStatementMeta(null);
    setError(null);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelected(selectedFile: File) {
    if (!accountId) {
      setError("Choose an account first");
      return;
    }
    setError(null);
    setFile(selectedFile);
    setStage("scanning");

    try {
      let pagesToScan: File[];

      if (selectedFile.type === "application/pdf") {
        pagesToScan = await pdfToImages(selectedFile);
      } else {
        pagesToScan = [selectedFile];
      }

      setProgress({ current: 0, total: pagesToScan.length });

      const allTransactions: StatementTransaction[] = [];
      let lastPeriod = "";
      let lastLast4 = "";

      for (let i = 0; i < pagesToScan.length; i++) {
        const result = await magnusAI.scanStatement(pagesToScan[i]);
        allTransactions.push(...result.transactions);
        if (result.statementPeriod) lastPeriod = result.statementPeriod;
        if (result.accountNumberLast4) lastLast4 = result.accountNumberLast4;
        setProgress({ current: i + 1, total: pagesToScan.length });
      }

      if (allTransactions.length === 0) {
        setError("No transactions were detected in this file. Try a clearer scan, or check the file isn't blank.");
        setStage("select");
        return;
      }

      setExtracted(allTransactions);
      setStatementMeta({ period: lastPeriod, last4: lastLast4 });
      setStage("preview");
    } catch (e: any) {
      setError(e.message || "Failed to read statement");
      setStage("select");
    }
  }

  async function handleConfirm() {
    if (!file || !accountId) return;
    setStage("saving");
    setError(null);
    try {
      const statement = await uploadBankStatement(accountId, file, {
        statementPeriod: statementMeta?.period,
      });

      const parsed = extracted.map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.type === "debit" ? -Math.abs(t.amount) : Math.abs(t.amount),
        balance: t.balanceAfter ?? undefined,
        raw_line: `${t.date} ${t.description}`,
      }));

      const result = await storeBankTransactions(statement.id, parsed);

      if (!result.success) {
        setError(`Saved statement, but some transactions failed to store: ${result.errors.join("; ")}`);
      }

      setStage("done");
    } catch (e: any) {
      setError(e.message || "Failed to save statement");
      setStage("preview");
    }
  }

  const totalCredits = extracted.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const totalDebits = extracted.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader title="Upload Statement" subtitle="Import a bank or credit card statement using AI extraction"/>

      <div className="p-6 max-w-3xl space-y-5">

        {stage === "select" && (
          <Card>
            <div className="space-y-4">
              <Field label="Account">
                <Select value={accountId} onChange={e => setAccountId(e.target.value)}>
                  <option value="">Select account...</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_name}{a.bank_name ? ` — ${a.bank_name}` : ""}</option>
                  ))}
                </Select>
              </Field>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>
                  <span>{error}</span>
                </div>
              )}

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center transition-colors",
                  accountId ? "border-white/10 hover:border-cyan-500/40 cursor-pointer" : "border-white/5 opacity-50"
                )}
                onClick={() => accountId && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/jpg"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
                />
                <Upload size={28} className="mx-auto mb-3 text-slate-600"/>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {accountId ? "Click to choose a statement" : "Choose an account above first"}
                </div>
                <div className="text-xs text-slate-600">PDF, JPG, or PNG — multi-page PDFs are supported</div>
              </div>
            </div>
          </Card>
        )}

        {stage === "scanning" && (
          <Card>
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <RefreshCw size={24} className="animate-spin text-cyan-400"/>
              <div className="text-sm text-slate-700 dark:text-slate-300 font-medium">Reading statement with AI...</div>
              {progress.total > 0 && (
                <div className="text-xs text-slate-600">Page {progress.current} of {progress.total}</div>
              )}
              <div className="text-[10px] text-slate-700 max-w-xs text-center mt-2">
                This can take a little while for multi-page statements — each page is read individually for accuracy.
              </div>
            </div>
          </Card>
        )}

        {stage === "preview" && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">Transactions Found</div>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-200">{extracted.length}</div>
              </Card>
              <Card>
                <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">Total Credits</div>
                <div className="text-xl font-bold text-emerald-400">{fmt(totalCredits)}</div>
              </Card>
              <Card>
                <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">Total Debits</div>
                <div className="text-xl font-bold text-red-400">{fmt(totalDebits)}</div>
              </Card>
            </div>

            {statementMeta?.period && (
              <div className="text-xs text-slate-500">Statement period: {statementMeta.period}</div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>
                <span>{error}</span>
              </div>
            )}

            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Review before saving</span>
                <span className="text-xs text-slate-600">Check this looks right — these will be added as unmatched transactions</span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Type</Th>
                      <Th right>Amount</Th>
                      <Th right>Balance After</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.map((t, i) => (
                      <Tr key={i}>
                        <Td muted>{t.date}</Td>
                        <Td><span className="text-slate-800 dark:text-slate-200">{t.description}</span></Td>
                        <Td>
                          <Badge color={t.type === "credit" ? "green" : "red"} dot>
                            {t.type === "credit" ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
                            {t.type}
                          </Badge>
                        </Td>
                        <Td right>
                          <span className={cn("font-semibold", t.type === "credit" ? "text-emerald-400" : "text-red-400")}>
                            {t.type === "credit" ? "+" : "-"}{fmt(t.amount)}
                          </span>
                        </Td>
                        <Td right muted>{t.balanceAfter !== null ? fmt(t.balanceAfter) : "—"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>

            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" icon={<X size={13}/>} onClick={reset}>Cancel, start over</Btn>
              <Btn variant="primary" size="sm" icon={<Check size={13}/>} onClick={handleConfirm}>
                Save {extracted.length} Transactions
              </Btn>
            </div>
          </>
        )}

        {stage === "saving" && (
          <Card>
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <RefreshCw size={24} className="animate-spin text-cyan-400"/>
              <div className="text-sm text-slate-700 dark:text-slate-300 font-medium">Saving transactions...</div>
            </div>
          </Card>
        )}

        {stage === "done" && (
          <Card>
            <Empty icon={<Check size={20} className="text-emerald-400"/>} title="Statement uploaded"
              body={`${extracted.length} transactions were added. Head to Finance > Transactions to review, classify, and match them.`}
              action={<Btn variant="primary" size="sm" onClick={reset}>Upload Another</Btn>}/>
          </Card>
        )}
      </div>
    </div>
  );
}