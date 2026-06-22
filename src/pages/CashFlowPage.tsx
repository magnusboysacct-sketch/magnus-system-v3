// src/pages/CashFlowPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  createBankAccount, transferFunds, withdrawFunds,
} from "../lib/finance";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Table, Th, Tr, Td, Empty, Tabs, Modal, Field, Input, Select, cn
} from "../components/ui";
import {
  TrendingUp, TrendingDown, DollarSign,
  ArrowUpRight, ArrowDownRight, RefreshCw,
  Wallet, Building2, Plus, ArrowLeftRight, MinusCircle, CreditCard
} from "lucide-react";

type Transaction = {
  id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  transaction_date: string | null;
  reference_number: string | null;
  bank_account_id: string | null;
  created_at: string;
  bank_accounts?: { account_name: string } | null;
};

type BankAccount = {
  id: string;
  account_name: string;
  account_type: "checking" | "savings" | "credit" | "line_of_credit";
  bank_name?: string | null;
  account_number_last_4?: string | null;
  current_balance: number;
  available_balance: number;
  is_primary: boolean;
  is_active: boolean;
};

type TransferPair = {
  reference_number: string;
  date: string;
  amount: number;
  description: string | null;
  fromAccountName: string;
  toAccountName: string;
  fromId: string;
  toId: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const TYPE_COLOR: Record<string, any> = {
  income: "green", receipt: "green", payment: "red",
  expense: "red", transfer: "blue", adjustment: "slate",
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: "Checking", savings: "Savings",
  credit: "Credit Card", line_of_credit: "Line of Credit",
};

export default function CashFlowPage() {
  const [tab, setTab] = useState<"overview" | "accounts" | "transfers">("overview");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"30" | "90" | "365">("30");

  // Modals
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [activeAccount, setActiveAccount] = useState<BankAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add account form state
  const [newAccount, setNewAccount] = useState({
    account_name: "", account_type: "checking" as BankAccount["account_type"],
    bank_name: "", account_number_last_4: "", current_balance: "",
  });

  // Transfer form state
  const [transferForm, setTransferForm] = useState({ toAccountId: "", amount: "", description: "" });

  // Withdraw form state
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", reason: "", category: "Withdrawal" });

  const totalIn = transactions
    .filter(t => ["income", "receipt"].includes(t.transaction_type))
    .reduce((s, t) => s + (t.amount || 0), 0);

  const totalOut = transactions
    .filter(t => ["expense", "payment"].includes(t.transaction_type))
    .reduce((s, t) => s + Math.abs(t.amount || 0), 0);

  const netFlow = totalIn - totalOut;

  const totalBalance = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);

  // Group transfer legs into paired rows by reference_number
  const transferPairs: TransferPair[] = (() => {
    const transferTxns = transactions.filter(t => t.transaction_type === "transfer" && t.reference_number);
    const byRef = new Map<string, Transaction[]>();
    for (const t of transferTxns) {
      const ref = t.reference_number!;
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref)!.push(t);
    }
    const pairs: TransferPair[] = [];
    byRef.forEach((legs, ref) => {
      const outLeg = legs.find(l => l.amount < 0);
      const inLeg = legs.find(l => l.amount > 0);
      if (outLeg && inLeg) {
        pairs.push({
          reference_number: ref,
          date: outLeg.transaction_date || outLeg.created_at,
          amount: Math.abs(outLeg.amount),
          description: outLeg.description,
          fromAccountName: outLeg.bank_accounts?.account_name || "—",
          toAccountName: inLeg.bank_accounts?.account_name || "—",
          fromId: outLeg.id,
          toId: inLeg.id,
        });
      }
    });
    return pairs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  const unlinkedTransferCount = transactions.filter(
    t => t.transaction_type === "transfer" && !t.reference_number
  ).length;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadData(); }, [companyId, period]);

  async function loadData() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));

      const [txRes, accRes] = await Promise.all([
        supabase.from("cash_transactions")
          .select("*, bank_accounts(account_name)")
          .eq("company_id", companyId!)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("bank_accounts")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("is_primary", { ascending: false }),
      ]);

      setTransactions(txRes.data || []);
      setAccounts(accRes.data || []);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }

  function openTransfer(account: BankAccount) {
    setActiveAccount(account);
    setTransferForm({ toAccountId: "", amount: "", description: "" });
    setFormError(null);
    setShowTransfer(true);
  }

  function openWithdraw(account: BankAccount) {
    setActiveAccount(account);
    setWithdrawForm({ amount: "", reason: "", category: "Withdrawal" });
    setFormError(null);
    setShowWithdraw(true);
  }

  async function handleAddAccount() {
    setFormError(null);
    if (!newAccount.account_name.trim()) {
      setFormError("Account name is required");
      return;
    }
    setSaving(true);
    try {
      const balance = parseFloat(newAccount.current_balance) || 0;
      await createBankAccount({
        account_name: newAccount.account_name.trim(),
        account_type: newAccount.account_type,
        bank_name: newAccount.bank_name.trim() || undefined,
        account_number_last_4: newAccount.account_number_last_4.trim() || undefined,
        current_balance: balance,
        available_balance: balance,
      });
      setShowAddAccount(false);
      setNewAccount({ account_name: "", account_type: "checking", bank_name: "", account_number_last_4: "", current_balance: "" });
      await loadData();
    } catch (e: any) {
      setFormError(e.message || "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransfer() {
    setFormError(null);
    const amount = parseFloat(transferForm.amount);
    if (!transferForm.toAccountId) { setFormError("Choose a destination account"); return; }
    if (!amount || amount <= 0) { setFormError("Enter a valid amount"); return; }
    if (!activeAccount) return;

    setSaving(true);
    try {
      await transferFunds({
        fromAccountId: activeAccount.id,
        toAccountId: transferForm.toAccountId,
        amount,
        description: transferForm.description.trim() || undefined,
      });
      setShowTransfer(false);
      await loadData();
    } catch (e: any) {
      setFormError(e.message || "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    setFormError(null);
    const amount = parseFloat(withdrawForm.amount);
    if (!amount || amount <= 0) { setFormError("Enter a valid amount"); return; }
    if (!withdrawForm.reason.trim()) { setFormError("Enter a reason for this withdrawal"); return; }
    if (!activeAccount) return;

    setSaving(true);
    try {
      await withdrawFunds({
        accountId: activeAccount.id,
        amount,
        reason: withdrawForm.reason.trim(),
        category: withdrawForm.category,
      });
      setShowWithdraw(false);
      await loadData();
    } catch (e: any) {
      setFormError(e.message || "Withdrawal failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Cash Flow"
        subtitle="Bank accounts, transfers, and transaction history"
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadData}/>
            {tab === "overview" && (
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
                {(["30","90","365"] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors",
                      period === p ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}>
                    {p === "365" ? "1Y" : `${p}D`}
                  </button>
                ))}
              </div>
            )}
            {tab === "accounts" && (
              <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => { setFormError(null); setShowAddAccount(true); }}>
                Add Account
              </Btn>
            )}
          </>
        }
      />

      <div className="px-6">
        <Tabs
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "accounts", label: "Accounts", count: accounts.length },
            { key: "transfers", label: "Transfers", count: transferPairs.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="p-6 space-y-5">

        {tab === "overview" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Balance" value={fmt(totalBalance)}
                icon={<Wallet size={15}/>} color="text-cyan-300" sub={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}/>
              <StatCard label={`Cash In (${period}d)`} value={fmt(totalIn)}
                icon={<ArrowUpRight size={15}/>} color="text-emerald-300"/>
              <StatCard label={`Cash Out (${period}d)`} value={fmt(totalOut)}
                icon={<ArrowDownRight size={15}/>} color="text-red-300"/>
              <StatCard label="Net Flow" value={fmt(netFlow)}
                icon={netFlow >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}
                color={netFlow >= 0 ? "text-emerald-300" : "text-red-300"}/>
            </div>

            {/* Transactions table */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-200">
                  Transactions <span className="text-slate-600 font-normal text-xs ml-2">last {period} days</span>
                </span>
                <span className="text-xs text-slate-600">{transactions.length} records</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-600">
                  <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
                </div>
              ) : transactions.length === 0 ? (
                <Empty icon={<DollarSign size={18}/>} title="No transactions found"
                  body="Cash transactions will appear here as you record income, expenses, and transfers."/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Account</Th>
                      <Th>Type</Th>
                      <Th>Reference</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(t => {
                      const isIn = t.amount > 0;
                      return (
                        <Tr key={t.id}>
                          <Td muted>{fmtDate(t.transaction_date || t.created_at)}</Td>
                          <Td><span className="font-medium text-slate-200">{t.description || "—"}</span></Td>
                          <Td muted>{t.bank_accounts?.account_name || "—"}</Td>
                          <Td>
                            <Badge color={TYPE_COLOR[t.transaction_type] || "slate"} dot>
                              {t.transaction_type}
                            </Badge>
                          </Td>
                          <Td muted className="font-mono text-[10px]">{t.reference_number || "—"}</Td>
                          <Td right>
                            <span className={cn("font-semibold", isIn ? "text-emerald-400" : "text-red-400")}>
                              {isIn ? "+" : "-"}{fmt(Math.abs(t.amount))}
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {tab === "accounts" && (
          <>
            {accounts.length === 0 ? (
              <Card>
                <Empty icon={<Building2 size={18}/>} title="No accounts yet"
                  body="Add your first bank account or credit card to start tracking balances, transfers, and withdrawals."
                  action={<Btn variant="primary" size="sm" onClick={() => setShowAddAccount(true)}>Add Account</Btn>}/>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map(a => {
                  const isCredit = a.account_type === "credit" || a.account_type === "line_of_credit";
                  return (
                    <Card key={a.id}>
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border",
                          isCredit ? "bg-violet-500/10 border-violet-500/20" : "bg-cyan-500/10 border-cyan-500/20")}>
                          {isCredit ? <CreditCard size={14} className="text-violet-400"/> : <Building2 size={14} className="text-cyan-400"/>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {a.is_primary && <Badge color="cyan">Primary</Badge>}
                          <Badge color="slate">{ACCOUNT_TYPE_LABEL[a.account_type] || a.account_type}</Badge>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-200 mb-0.5">{a.account_name}</div>
                      <div className="text-[10px] text-slate-600 mb-2">
                        {a.bank_name || "—"}{a.account_number_last_4 ? ` •••• ${a.account_number_last_4}` : ""}
                      </div>
                      <div className={cn("text-xl font-bold mb-3", a.current_balance >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmt(a.current_balance)}
                      </div>
                      <div className="flex gap-2">
                        <Btn variant="secondary" size="sm" icon={<ArrowLeftRight size={12}/>} onClick={() => openTransfer(a)} className="flex-1">
                          Transfer
                        </Btn>
                        <Btn variant="secondary" size="sm" icon={<MinusCircle size={12}/>} onClick={() => openWithdraw(a)} className="flex-1">
                          Withdraw
                        </Btn>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "transfers" && (
          <>
            {unlinkedTransferCount > 0 && (
              <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                {unlinkedTransferCount} older transfer record{unlinkedTransferCount !== 1 ? "s" : ""} from before this log existed {unlinkedTransferCount !== 1 ? "aren't" : "isn't"} linked and won't appear here — they're still visible in the Overview tab.
              </div>
            )}
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-200">
                  Transfer Log <span className="text-slate-600 font-normal text-xs ml-2">last {period} days</span>
                </span>
                <span className="text-xs text-slate-600">{transferPairs.length} transfers</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-600">
                  <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
                </div>
              ) : transferPairs.length === 0 ? (
                <Empty icon={<ArrowLeftRight size={18}/>} title="No transfers yet"
                  body="Transfers between your accounts will appear here, with both sides linked together."/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Description</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferPairs.map(p => (
                      <Tr key={p.reference_number}>
                        <Td muted>{fmtDateTime(p.date)}</Td>
                        <Td><span className="font-medium text-slate-200">{p.fromAccountName}</span></Td>
                        <Td><span className="font-medium text-slate-200">{p.toAccountName}</span></Td>
                        <Td muted>{p.description || "—"}</Td>
                        <Td right><span className="font-semibold text-cyan-300">{fmt(p.amount)}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Add Account modal */}
      <Modal open={showAddAccount} onClose={() => setShowAddAccount(false)} title="Add Bank Account" subtitle="Create a new bank account or credit card to track">
        <div className="space-y-3">
          {formError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}
          <Field label="Account Name">
            <Input placeholder="e.g. NCB Business Checking" value={newAccount.account_name}
              onChange={e => setNewAccount(s => ({ ...s, account_name: e.target.value }))}/>
          </Field>
          <Field label="Account Type">
            <Select value={newAccount.account_type} onChange={e => setNewAccount(s => ({ ...s, account_type: e.target.value as BankAccount["account_type"] }))}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="line_of_credit">Line of Credit</option>
            </Select>
          </Field>
          <Field label="Bank / Institution (optional)">
            <Input placeholder="e.g. NCB, Scotiabank, JN Bank" value={newAccount.bank_name}
              onChange={e => setNewAccount(s => ({ ...s, bank_name: e.target.value }))}/>
          </Field>
          <Field label="Last 4 Digits (optional)">
            <Input placeholder="e.g. 4821" maxLength={4} value={newAccount.account_number_last_4}
              onChange={e => setNewAccount(s => ({ ...s, account_number_last_4: e.target.value.replace(/\D/g, "") }))}/>
          </Field>
          <Field label="Opening Balance">
            <Input type="number" placeholder="0.00" value={newAccount.current_balance}
              onChange={e => setNewAccount(s => ({ ...s, current_balance: e.target.value }))}/>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowAddAccount(false)}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleAddAccount} disabled={saving}>
              {saving ? "Saving..." : "Add Account"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Transfer modal */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Funds" subtitle={activeAccount ? `From ${activeAccount.account_name}` : undefined}>
        <div className="space-y-3">
          {formError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}
          <Field label="To Account">
            <Select value={transferForm.toAccountId} onChange={e => setTransferForm(s => ({ ...s, toAccountId: e.target.value }))}>
              <option value="">Select destination account...</option>
              {accounts.filter(a => a.id !== activeAccount?.id).map(a => (
                <option key={a.id} value={a.id}>{a.account_name} ({fmt(a.current_balance)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" placeholder="0.00" value={transferForm.amount}
              onChange={e => setTransferForm(s => ({ ...s, amount: e.target.value }))}/>
          </Field>
          <Field label="Description (optional)">
            <Input placeholder="e.g. Moving funds for payroll" value={transferForm.description}
              onChange={e => setTransferForm(s => ({ ...s, description: e.target.value }))}/>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowTransfer(false)}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleTransfer} disabled={saving}>
              {saving ? "Transferring..." : "Transfer"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Withdraw modal */}
      <Modal open={showWithdraw} onClose={() => setShowWithdraw(false)} title="Withdraw Funds" subtitle={activeAccount ? `From ${activeAccount.account_name}` : undefined}>
        <div className="space-y-3">
          {formError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}
          <Field label="Amount">
            <Input type="number" placeholder="0.00" value={withdrawForm.amount}
              onChange={e => setWithdrawForm(s => ({ ...s, amount: e.target.value }))}/>
          </Field>
          <Field label="Category">
            <Select value={withdrawForm.category} onChange={e => setWithdrawForm(s => ({ ...s, category: e.target.value }))}>
              <option value="Withdrawal">General Withdrawal</option>
              <option value="Owner Draw">Owner Draw</option>
              <option value="Cash for Site">Cash for Site</option>
              <option value="Petty Cash">Petty Cash</option>
            </Select>
          </Field>
          <Field label="Reason">
            <Input placeholder="What is this withdrawal for?" value={withdrawForm.reason}
              onChange={e => setWithdrawForm(s => ({ ...s, reason: e.target.value }))}/>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowWithdraw(false)}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleWithdraw} disabled={saving}>
              {saving ? "Withdrawing..." : "Withdraw"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
