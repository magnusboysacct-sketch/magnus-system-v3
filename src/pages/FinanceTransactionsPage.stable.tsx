import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bot,
  Check,
  ChevronRight,
  CreditCard,
  Filter,
  Landmark,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { FormModal } from "../components/common/FormModal";
import { theme } from "../lib/theme";
import {
  classifyTransaction,
  matchTransaction,
  getConfidenceScore,
} from "../services/finance/automationEngine";
import type {
  ClassificationResult,
  MatchingResult,
  ConfidenceScoreBreakdown,
} from "../services/finance/automationEngine";
import { fetchBankAccounts } from "../lib/finance";
import { fetchBankTransactions } from "../services/finance/bankParser";
import { fetchCreditCardTransactions } from "../services/finance/creditCard";
import { postTransactionWithData } from "../services/finance/postingEngine";
import type { BankAccount } from "../lib/finance";
import type { BankTransaction } from "../services/finance/bankParser";
import type { CreditCardTransaction } from "../services/finance/creditCard";

type TransactionType = "all" | "bank" | "credit";
type TransactionStatus = "all" | "needs_review" | "ready_to_post" | "posted" | "high_confidence";
type BulkOperation = "review" | "post" | "ignore" | "restore" | null;

interface CombinedTransaction {
  id: string;
  type: "bank" | "credit";
  bank_account_id?: string;
  credit_card_id?: string;
  transaction_date: string;
  description: string;
  amount: number;
  balance?: number;
  match_status: "unmatched" | "matched" | "posted" | "disputed" | "reconciled";
  gl_transaction_id?: string;
  confidence_score?: number;
  classification?: ClassificationResult;
  matches?: MatchingResult[];
  bank_account_name?: string;
  credit_card_name?: string;
  reference_number?: string;
  merchant_name?: string;
  transaction_type?: string;
  created_at: string;
  updated_at: string;
  source_type?: string;
  source_id?: string;
}

interface SelectorOption {
  id: string;
  label: string;
  meta?: string;
}

interface DetailFormState {
  projectId: string;
  accountId: string;
  vendorId: string;
  ownerDraw: boolean;
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialsFromText(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function rowStatusLabel(txn: CombinedTransaction) {
  if (txn.gl_transaction_id) return "Posted";
  if ((txn.confidence_score ?? 0) >= 0.7) return "Ready";
  return "Review";
}

function rowStatusClasses(txn: CombinedTransaction) {
  if (txn.gl_transaction_id) {
    return "border-emerald-800/70 bg-emerald-900/20 text-emerald-300";
  }
  if ((txn.confidence_score ?? 0) >= 0.7) {
    return "border-teal-800/70 bg-teal-900/20 text-teal-300";
  }
  return "border-amber-800/70 bg-amber-900/20 text-amber-300";
}

function confidenceBarClasses(score?: number) {
  if ((score ?? 0) >= 0.8) return "bg-emerald-500";
  if ((score ?? 0) >= 0.6) return "bg-amber-500";
  return "bg-rose-500";
}

function amountClasses(amount: number) {
  return amount >= 0 ? "text-emerald-400" : "text-rose-400";
}

function getClassificationCategory(classification?: ClassificationResult) {
  const bucket = classification as unknown as Record<string, unknown> | undefined;
  return (
    (typeof bucket?.category === "string" && bucket.category) ||
    (typeof bucket?.account_category === "string" && bucket.account_category) ||
    (typeof bucket?.recommended_category === "string" && bucket.recommended_category) ||
    "Unclassified"
  );
}

function getClassificationSubcategory(classification?: ClassificationResult) {
  const bucket = classification as unknown as Record<string, unknown> | undefined;
  return (
    (typeof bucket?.subcategory === "string" && bucket.subcategory) ||
    (typeof bucket?.recommended_subcategory === "string" && bucket.recommended_subcategory) ||
    ""
  );
}

function getClassificationRuleName(classification?: ClassificationResult) {
  const bucket = classification as unknown as Record<string, unknown> | undefined;
  return (
    (typeof bucket?.rule_name === "string" && bucket.rule_name) ||
    (typeof bucket?.matched_rule === "string" && bucket.matched_rule) ||
    ""
  );
}

function getClassificationMatchType(classification?: ClassificationResult) {
  const bucket = classification as unknown as Record<string, unknown> | undefined;
  return (
    (typeof bucket?.match_type === "string" && bucket.match_type) ||
    (typeof bucket?.reasoning === "string" && bucket.reasoning) ||
    "AI"
  );
}

function getMatchDetailsValue(match: MatchingResult, key: string) {
  const details = (match as unknown as Record<string, unknown>)?.match_details;
  if (!details || typeof details !== "object") return "";
  const value = (details as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export default function FinanceTransactionsPage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject } = useProjectContext();
  const financeAccess = useFinanceAccess();

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<CombinedTransaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<CombinedTransaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<TransactionType>("all");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkBusy, setBulkBusy] = useState<BulkOperation>(null);
  const [postingLoading, setPostingLoading] = useState<string | null>(null);

  // Create transaction modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    bank_account_id: '',
    reference_number: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Selector options
  const [projectOptions, setProjectOptions] = useState<SelectorOption[]>([]);
  const [accountOptions, setAccountOptions] = useState<SelectorOption[]>([]);
  const [vendorOptions, setVendorOptions] = useState<SelectorOption[]>([]);

  // Detail form for selected transaction
  const [detailForm, setDetailForm] = useState({
    projectId: "",
    accountId: "",
    vendorId: "",
    ownerDraw: false,
  });

  const projectId = routeProjectId || currentProjectId || null;

  useEffect(() => {
    let alive = true;

    async function loadTransactionsData() {
      if (!projectId) {
        if (!alive) return;
        setTransactions([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: projectRow, error: projectError } = await supabase
          .from("projects")
          .select("id, name, company_id")
          .eq("id", projectId)
          .maybeSingle();

        if (projectError) throw projectError;

        const nextCompanyId =
          typeof projectRow?.company_id === "string" ? projectRow.company_id : null;
        setCompanyId(nextCompanyId);

        // Load bank transactions and credit card transactions from intended schema
        const bankAccounts = await fetchBankAccounts(nextCompanyId || "");
        const bankTxns = await fetchBankTransactions(nextCompanyId || "");
        const creditTxns = await fetchCreditCardTransactions(nextCompanyId || "");

        // Convert to unified format
        const combined: CombinedTransaction[] = [
          ...bankTxns.map((txn: BankTransaction): CombinedTransaction => ({
            id: txn.id,
            type: "bank",
            bank_account_id: txn.bank_account_id,
            transaction_date: txn.transaction_date,
            description: txn.description,
            amount: txn.amount,
            balance: txn.balance_after,
            match_status: txn.match_status,
            gl_transaction_id: txn.gl_transaction_id,
            confidence_score: txn.confidence_score,
            bank_account_name: txn.bank_account_id, // Will be populated via join
            reference_number: txn.reference_number,
            created_at: txn.created_at,
            updated_at: txn.updated_at,
            source_type: "bank_transaction",
            source_id: txn.id,
          })),
          ...creditTxns.map((txn: CreditCardTransaction): CombinedTransaction => ({
            id: txn.id,
            type: "credit",
            credit_card_id: txn.credit_card_id,
            transaction_date: txn.transaction_date,
            description: txn.description,
            amount: txn.amount,
            balance: txn.running_balance,
            match_status: txn.match_status,
            gl_transaction_id: txn.gl_transaction_id,
            confidence_score: txn.confidence_score,
            credit_card_name: txn.credit_card_id, // Will be populated via join
            reference_number: txn.reference_number,
            merchant_name: txn.merchant_name,
            created_at: txn.created_at,
            updated_at: txn.updated_at,
            source_type: "credit_card_transaction",
            source_id: txn.id,
          })),
        ];

        if (!alive) return;

        const sorted = combined.sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        );

        setTransactions(sorted);
        setAccountOptions([
          ...bankAccounts.map((acc: BankAccount) => ({
            id: acc.id,
            label: acc.account_name || "Unnamed Bank Account",
            meta: acc.bank_name || "",
          })),
          {
            id: "credit-cards",
            label: "Credit Cards",
            meta: "Liability accounts",
          },
        ]);
      } catch (e: unknown) {
        console.error("[FinanceTransactions] loadTransactionsData failed:", e);
        if (!alive) return;
        setError(
          e && typeof e === "object" && "message" in e && typeof e.message === "string"
            ? e.message
            : "Failed to load transactions data"
        );
        setTransactions([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadTransactionsData();

    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    let alive = true;

    async function loadSelectorData() {
      if (!companyId) {
        setProjectOptions([]);
        setAccountOptions([]);
        setVendorOptions([]);
        return;
      }

      try {
        const [projectsRes, accountsRes, vendorsRes] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name")
            .eq("company_id", companyId)
            .order("name", { ascending: true }),
          supabase
            .from("chart_of_accounts")
            .select("id, account_code, account_name")
            .eq("company_id", companyId)
            .order("account_code", { ascending: true }),
          supabase
            .from("suppliers")
            .select("id, supplier_name")
            .eq("company_id", companyId)
            .order("supplier_name", { ascending: true }),
        ]);

        if (!alive) return;

        setProjectOptions(
          (projectsRes.data || []).map((row: Record<string, unknown>) => ({
            id: String(row.id || ""),
            label: String(row.name || "Unnamed project"),
          }))
        );

        setAccountOptions(
          (accountsRes.data || []).map((row: Record<string, unknown>) => ({
            id: String(row.id || ""),
            label: `${String(row.account_code || "").trim()} ${String(
              row.account_name || "Unnamed account"
            ).trim()}`.trim(),
            meta: String(row.account_name || ""),
          }))
        );

        setVendorOptions(
          (vendorsRes.data || []).map((row: Record<string, unknown>) => ({
            id: String(row.id || ""),
            label: String(row.supplier_name || "Unnamed supplier"),
          }))
        );
      } catch (e) {
        console.error("[FinanceTransactions] selector load failed:", e);
      }
    }

    void loadSelectorData();

    return () => {
      alive = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (!selectedTransaction) return;

    const classificationCategory = getClassificationCategory(selectedTransaction.classification);
    const detectedOwnerDraw =
      classificationCategory.toLowerCase().includes("owner") ||
      selectedTransaction.description.toLowerCase().includes("owner draw");

    setDetailForm((prev) => ({
      projectId: prev.projectId || projectId || "",
      accountId: prev.accountId || "",
      vendorId: prev.vendorId || "",
      ownerDraw: detectedOwnerDraw,
    }));
  }, [projectId, selectedTransaction]);

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (activeTab !== "all") {
      filtered = filtered.filter((txn) => txn.type === activeTab);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((txn) => {
        switch (statusFilter) {
          case "needs_review":
            return !txn.gl_transaction_id && (txn.confidence_score ?? 0) < 0.7;
          case "ready_to_post":
            return !txn.gl_transaction_id && (txn.confidence_score ?? 0) >= 0.7;
          case "posted":
            return !!txn.gl_transaction_id;
          case "high_confidence":
            return (txn.confidence_score ?? 0) >= 0.7;
          default:
            return true;
        }
      });
    }

    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((txn) => {
        const haystack = [
          txn.description,
          txn.reference_number,
          txn.merchant_name,
          txn.bank_account_name,
          txn.credit_card_name,
          getClassificationCategory(txn.classification),
          getClassificationSubcategory(txn.classification),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    return filtered;
  }, [transactions, activeTab, statusFilter, searchTerm]);

  const selectedTransactions = useMemo(
    () => filteredTransactions.filter((txn) => selectedIds.includes(txn.id)),
    [filteredTransactions, selectedIds]
  );

  const allFilteredSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((txn) => selectedIds.includes(txn.id));

  const summaryStats = useMemo(() => {
    const total = filteredTransactions.length;
    const bank = filteredTransactions.filter((txn) => txn.type === "bank").length;
    const credit = filteredTransactions.filter((txn) => txn.type === "credit").length;
    const unmatched = filteredTransactions.filter((txn) => txn.match_status === "unmatched").length;
    const matched = filteredTransactions.filter((txn) => txn.match_status === "matched").length;
    const ignored = filteredTransactions.filter((txn) => txn.match_status === "disputed").length;
    const needsReview = filteredTransactions.filter(
      (txn) => !txn.gl_transaction_id && (txn.confidence_score ?? 0) < 0.7
    ).length;
    const readyToPost = filteredTransactions.filter(
      (txn) => !txn.gl_transaction_id && (txn.confidence_score ?? 0) >= 0.7
    ).length;
    const posted = filteredTransactions.filter((txn) => !!txn.gl_transaction_id).length;
    const totalAmount = filteredTransactions.reduce((sum, txn) => sum + txn.amount, 0);
    const bankAmount = filteredTransactions
      .filter((txn) => txn.type === "bank")
      .reduce((sum, txn) => sum + txn.amount, 0);
    const creditAmount = filteredTransactions
      .filter((txn) => txn.type === "credit")
      .reduce((sum, txn) => sum + txn.amount, 0);

    return {
      total,
      bank,
      credit,
      unmatched,
      matched,
      ignored,
      needsReview,
      readyToPost,
      posted,
      totalAmount,
      bankAmount,
      creditAmount,
    };
  }, [filteredTransactions]);

  async function ensureAnalysis(transaction: CombinedTransaction) {
    let nextTransaction = { ...transaction };

    // Only classify if not already classified
    if (!transaction.classification) {
      const classification = await classifyTransaction(
        {
          description: transaction.description,
          amount: transaction.amount,
          transaction_type: transaction.type === "bank" ? "all" : "all",
          transaction_date: transaction.transaction_date,
          reference_number: transaction.reference_number,
        },
        companyId
      );

      nextTransaction = {
        ...nextTransaction,
        classification: classification || undefined,
      };
    }

    // Only match if not already matched
    if (!nextTransaction.matches) {
      const matches = await matchTransaction(
        {
          description: transaction.description,
          amount: transaction.amount,
          transaction_type: transaction.type === "bank" ? "all" : "all",
          transaction_date: transaction.transaction_date,
          reference_number: transaction.reference_number,
          target_entity_type: "expense",
        },
        companyId
      );

      nextTransaction = {
        ...nextTransaction,
        matches: matches || [],
      };
    }

    // Only get confidence if not already calculated
    if (nextTransaction.confidence_score === undefined) {
      const confidence = await getConfidenceScore(
        {
          description: transaction.description,
          amount: transaction.amount,
          transaction_type: transaction.type === "bank" ? "all" : "all",
          transaction_date: transaction.transaction_date,
          reference_number: transaction.reference_number,
        },
        companyId
      );

      nextTransaction = {
        ...nextTransaction,
        confidence_score: confidence,
      };
    }

    return nextTransaction;
  }

  const updateSelectedTransaction = useCallback((transaction: CombinedTransaction | null) => {
    setSelectedTransaction(transaction);
    setSelectedIds(transaction ? [transaction.id] : []);
  }, [setSelectedTransaction, setSelectedIds]);

  const handleTransactionSelect = (transaction: CombinedTransaction) => {
    setSelectedTransaction(transaction);
    updateSelectedIds(transaction.id);
  };

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("cash_transactions")
        .insert({
          company_id: companyId,
          bank_account_id: createForm.bank_account_id,
          transaction_date: createForm.transaction_date,
          description: createForm.description,
          amount: parseFloat(createForm.amount),
          reference_number: createForm.reference_number || null,
          transaction_type: parseFloat(createForm.amount) >= 0 ? 'income' : 'expense',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Close modal and reset form
      setShowCreateModal(false);
      setCreateForm({
        transaction_date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        bank_account_id: '',
        reference_number: '',
      });

      // Reload transactions to show the new one
      await loadTransactionsData();
    } catch (createError) {
      console.error("Error creating transaction:", createError);
      setError("Failed to create transaction");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleManualPost(transaction: CombinedTransaction) {
    if (!companyId) return;

    setPostingLoading(transaction.id);
    try {
      // Use posting engine for proper double-entry posting
      await postTransactionWithData({
        source_type: transaction.source_type || "manual",
        source_id: transaction.source_id || "",
        company_id: companyId,
        transaction_date: transaction.transaction_date,
        description: transaction.description,
        amount: Math.abs(transaction.amount),
        // Map to proper accounts based on transaction type
        debit_account_id: transaction.amount >= 0 ? "cash" : "expense", // Simplified mapping
        credit_account_id: transaction.amount >= 0 ? "revenue" : "cash", // Simplified mapping
        project_id: detailForm.projectId || null,
        notes: `Manual posting from ${transaction.type} transaction`,
      });

      const updatedTxn: CombinedTransaction = {
        ...transaction,
        match_status: "posted",
        gl_transaction_id: `manual_${Date.now()}_${transaction.id}`,
      };

      updateTransactionInState(transaction.id, updatedTxn);
      
      // Clear selection if this was the selected transaction
      if (selectedTransaction?.id === transaction.id) {
        setSelectedTransaction(null);
        setSelectedIds([]);
      }
    } catch (postError) {
      console.error("Error posting transaction:", postError);
      setError("Failed to post transaction");
    } finally {
      setPostingLoading(null);
    }
  }

  const isCreateFormValid = createForm.transaction_date && 
                           createForm.description && 
                           createForm.amount && 
                           createForm.bank_account_id;

  async function handleAcceptMatch(transaction: CombinedTransaction, match: MatchingResult) {
    if (!companyId) return;

    setPostingLoading(transaction.id);
    try {
      // Use posting engine with matched account
      await postTransactionWithData({
        source_type: transaction.source_type || "manual",
        source_id: transaction.source_id || "",
        company_id: companyId,
        transaction_date: transaction.transaction_date,
        description: transaction.description,
        amount: Math.abs(transaction.amount),
        debit_account_id: match.target_entity_id, // Use matched account
        credit_account_id: transaction.amount >= 0 ? "revenue" : "cash",
        project_id: detailForm.projectId || null,
        notes: `Auto-match to ${match.target_entity_type}: ${match.target_entity_id}`,
      });

      const updatedTxn: CombinedTransaction = {
        ...transaction,
        match_status: "posted",
        gl_transaction_id: `matched_${Date.now()}_${transaction.id}`,
      };

      setTransactions((prev) =>
        prev.map((txn) => (txn.id === transaction.id ? updatedTxn : txn))
      );

      if (selectedTransaction?.id === transaction.id) {
        setSelectedTransaction(updatedTxn);
      }
    } catch (postError) {
      console.error("Error accepting match:", postError);
      setError("Failed to accept match");
    } finally {
      setPostingLoading(null);
    }
  }

  async function handleIgnoreTransaction(transaction: CombinedTransaction) {
    if (!companyId) return;

    try {
      // Update transaction to mark as ignored (set match_status to disputed for now)
      const tableName = transaction.type === "bank" ? "bank_transactions" : "credit_card_transactions";
      const { error } = await supabase
        .from(tableName)
        .update({
          match_status: "disputed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id);

      if (error) throw error;

      const updatedTxn: CombinedTransaction = {
        ...transaction,
        match_status: "disputed",
      };

      setTransactions((prev) =>
        prev.map((txn) => (txn.id === transaction.id ? updatedTxn : txn))
      );

      if (selectedTransaction?.id === transaction.id) {
        setSelectedTransaction(updatedTxn);
      }
    } catch (ignoreError) {
      console.error("Error ignoring transaction:", ignoreError);
      setError("Failed to ignore transaction");
    }
  }

  async function handleBulkIgnore() {
    if (!companyId) return;

    setBulkBusy("ignore");
    try {
      await Promise.all(
        selectedTransactions.map((transaction) =>
          handleIgnoreTransaction(transaction)
        )
      );

      setSelectedIds([]);
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error bulk ignoring transactions:", error);
      setError("Failed to ignore transactions");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkRestore() {
    if (!companyId) return;

    setBulkBusy("restore");
    try {
      // Update ignored/disputed transactions back to unmatched
      const tableName = selectedTransactions[0]?.type === "bank" ? "bank_transactions" : "credit_card_transactions";
      
      await Promise.all(
        selectedTransactions.map((transaction) =>
          supabase
            .from(tableName)
            .update({
              match_status: "unmatched",
              updated_at: new Date().toISOString(),
            })
            .eq("id", transaction.id)
        )
      );

      // Update local state
      setTransactions((prev) =>
        prev.map((txn) =>
          selectedTransactions.some((selected) => selected.id === txn.id)
            ? { ...txn, match_status: "unmatched" }
            : txn
        )
      );

      setSelectedIds([]);
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error bulk restoring transactions:", error);
      setError("Failed to restore transactions");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkPost() {
    if (!companyId) return;

    setBulkBusy("post");
    try {
      // Only post transactions that are ready (matched or high confidence)
      const readyTransactions = selectedTransactions.filter(
        (txn) => txn.match_status === "matched" || (txn.confidence_score ?? 0) >= 0.7
      );

      await Promise.all(
        readyTransactions.map((transaction) =>
          handleManualPost(transaction)
        )
      );

      setSelectedIds([]);
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error bulk posting transactions:", error);
      setError("Failed to post transactions");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleAcceptAiSuggestion() {
    if (!selectedTransaction) return;

    const enriched = await ensureAnalysis(selectedTransaction);
    const classification = enriched.classification;
    const firstMatch = enriched.matches?.[0];

    setDetailForm((prev) => ({
      ...prev,
      vendorId: prev.vendorId || firstMatch?.target_entity_id || "",
      ownerDraw:
        prev.ownerDraw ||
        getClassificationCategory(classification).toLowerCase().includes("owner") ||
        enriched.description.toLowerCase().includes("owner draw"),
    }));
  }

  async function handleBulkReview() {
    if (!companyId || selectedTransactions.length === 0) return;

    setBulkBusy("review");

    try {
      await Promise.all(selectedTransactions.map((txn) => ensureAnalysis(txn)));
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleAutoPostReady() {
    if (!companyId) return;

    const readyTransactions = filteredTransactions.filter(
      (txn) => !txn.gl_transaction_id && (txn.confidence_score ?? 0) >= 0.7
    );

    if (!readyTransactions.length) {
      setError("No transactions ready for auto-posting");
      return;
    }

    setBulkBusy("post");
    try {
      await Promise.all(readyTransactions.map((txn) => handleManualPost(txn)));
    } catch (error) {
      console.error("Error auto-posting transactions:", error);
      setError("Failed to auto-post transactions");
    } finally {
      setBulkBusy(null);
    }
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !filteredTransactions.some((txn) => txn.id === id))
      );
      return;
    }

    setSelectedIds((prev) => {
      const merged = new Set(prev);
      filteredTransactions.forEach((txn) => merged.add(txn.id));
      return Array.from(merged);
    });
  }

  const contentRightPadding = selectedTransaction ? "xl:pr-[29rem]" : "";

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Finance Transactions</h1>
            {currentProject && (
              <div className={`mt-2 text-sm ${theme.text.muted}`}>
                Project:{" "}
                <span className={`font-semibold ${theme.text.secondary}`}>
                  {currentProject.name}
                </span>
              </div>
            )}
            <p className={`${theme.text.muted} mt-1`}>
              Select a project to view transactions
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-sm text-slate-400">
            Please select a project from the projects page
          </p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-4 rounded-xl bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`relative p-6 transition-all duration-300 ${contentRightPadding}`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Finance Transactions</h1>
          {currentProject && (
            <div className={`mt-2 text-sm ${theme.text.muted}`}>
              Project:{" "}
              <span className={`font-semibold ${theme.text.secondary}`}>
                {currentProject.name}
              </span>
            </div>
          )}
          <p className={`${theme.text.muted} mt-1`}>
            Bank and credit card transaction management with AI classification
          </p>
        </div>
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="rounded-xl bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800"
        >
          Back to Project
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">Loading transactions...</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-xl border border-rose-800/60 bg-rose-900/20 p-4">
              <p className="text-sm text-rose-300">Error: {error}</p>
            </div>
          )}

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            <div className="rounded-xl border border-amber-800/60 bg-amber-900/20 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-500"></div>
                <div>
                  <div className="text-lg font-semibold text-amber-300">{summaryStats.unmatched}</div>
                  <div className="text-xs text-amber-400">Unmatched</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">Need classification and matching</div>
            </div>
            <div className="rounded-xl border border-emerald-800/60 bg-emerald-900/20 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-500"></div>
                <div>
                  <div className="text-lg font-semibold text-emerald-300">{summaryStats.matched}</div>
                  <div className="text-xs text-emerald-400">Matched</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">Ready to post</div>
            </div>
            <div className="rounded-xl border border-rose-800/60 bg-rose-900/20 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-rose-500"></div>
                <div>
                  <div className="text-lg font-semibold text-rose-300">{summaryStats.ignored}</div>
                  <div className="text-xs text-rose-400">Ignored</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">Disputed transactions</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-sky-500"></div>
                <div>
                  <div className="text-lg font-semibold text-sky-400">${formatCurrency(summaryStats.bankAmount)}</div>
                  <div className="text-xs text-slate-400">Total Bank Amount</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                {summaryStats.bankAmount >= 0 ? "Income" : "Expenses"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-violet-500"></div>
                <div>
                  <div className="text-lg font-semibold text-violet-400">${formatCurrency(summaryStats.creditAmount)}</div>
                  <div className="text-xs text-slate-400">Total Credit Amount</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                {summaryStats.creditAmount >= 0 ? "Charges" : "Payments"}
              </div>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <div className="text-sm font-medium text-slate-300 mb-2">Quick Filters:</div>
                
                {/* Transaction Type Filters */}
                <div className="flex flex-wrap gap-2">
                  {(["all", "bank", "credit"] as TransactionType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveTab(type)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        activeTab === type
                          ? "bg-sky-600 text-white"
                          : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      {type === "all" ? "All" : type === "bank" ? "Bank" : "Credit"}
                    </button>
                  ))}
                </div>

                {/* Status Filters */}
                <div className="flex flex-wrap gap-2">
                  {(["all", "needs_review", "ready_to_post", "posted"] as TransactionStatus[]).map(
                    (status) => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          statusFilter === status
                            ? "bg-sky-600 text-white"
                            : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        {status === "all"
                          ? "All"
                          : status === "needs_review"
                          ? "Needs Review"
                          : status === "ready_to_post"
                          ? "Ready to Post"
                          : "Posted"}
                      </button>
                    )
                  )}
                </div>

                {/* Confidence Filters */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatusFilter("all")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      statusFilter === "all"
                        ? "bg-sky-600 text-white"
                        : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    All Confidence
                  </button>
                  <button
                    onClick={() => setStatusFilter("high_confidence")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      statusFilter === "high_confidence"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    High Confidence (≥70%)
                  </button>
                </div>
              </div>

              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAutoPostReady}
                  disabled={summaryStats.readyToPost === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Auto Post Ready ({summaryStats.readyToPost})
                </button>
                
                {/* Bulk Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleBulkIgnore}
                    disabled={selectedTransactions.length === 0 || bulkBusy !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-700 bg-rose-900/20 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    {bulkBusy === "ignore" ? "Ignoring..." : "Bulk Ignore"}
                  </button>
                  <button
                    onClick={handleBulkRestore}
                    disabled={selectedTransactions.length === 0 || bulkBusy !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {bulkBusy === "restore" ? "Restoring..." : "Bulk Restore"}
                  </button>
                  <button
                    onClick={handleBulkPost}
                    disabled={selectedTransactions.length === 0 || bulkBusy !== null}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {bulkBusy === "post" ? "Posting..." : "Bulk Post Ready"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1">
                  {selectedTransactions.length} selected
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1">
                  {filteredTransactions.length} visible
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Total</div>
              <div className="mt-1 text-lg font-semibold text-white">{summaryStats.total}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Bank</div>
              <div className="mt-1 text-lg font-semibold text-sky-400">{summaryStats.bank}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Credit</div>
              <div className="mt-1 text-lg font-semibold text-violet-400">
                {summaryStats.credit}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Needs Review</div>
              <div className="mt-1 text-lg font-semibold text-amber-400">
                {summaryStats.needsReview}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Ready to Post</div>
              <div className="mt-1 text-lg font-semibold text-teal-400">
                {summaryStats.readyToPost}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Posted</div>
              <div className="mt-1 text-lg font-semibold text-emerald-400">
                {summaryStats.posted}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Total Amount</div>
              <div className="mt-1 text-lg font-semibold text-white">
                ${formatCurrency(summaryStats.totalAmount)}
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
              <div className="flex flex-wrap gap-2">
                {(["all", "bank", "credit"] as TransactionType[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "bg-sky-600 text-white"
                        : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {tab === "all" ? "All" : tab === "bank" ? "Bank" : "Credit"}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {(["all", "needs_review", "ready_to_post", "posted"] as TransactionStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        statusFilter === status
                          ? "bg-sky-600 text-white"
                          : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      {status === "all"
                        ? "All"
                        : status === "needs_review"
                        ? "Needs Review"
                        : status === "ready_to_post"
                        ? "Ready to Post"
                        : "Posted"}
                    </button>
                  )
                )}
              </div>

              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <button
                onClick={handleAutoPostReady}
                disabled={summaryStats.readyToPost === 0}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto Post Ready ({summaryStats.readyToPost})
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/80 pt-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1">
                  {selectedTransactions.length} selected
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1">
                  {filteredTransactions.length} visible
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleBulkReview}
                  disabled={selectedTransactions.length === 0 || bulkBusy !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Bot className="h-4 w-4" />
                  {bulkBusy === "review" ? "Reviewing..." : "Bulk Review"}
                </button>
                <button
                  onClick={handleBulkPost}
                  disabled={selectedTransactions.length === 0 || bulkBusy !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {bulkBusy === "post" ? "Posting..." : "Bulk Post"}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Transaction</th>
                    <th className="px-4 py-3 font-medium">Account / Vendor</th>
                    <th className="px-4 py-3 font-medium">AI Classification</th>
                    <th className="px-4 py-3 font-medium">Match Suggestions</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Unmatched Section */}
                  {filteredTransactions.filter(t => t.match_status === 'unmatched').length > 0 && (
                    <>
                      <tr className="border-b-2 border-amber-800/40 bg-amber-900/10">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                            <span className="text-sm font-semibold text-amber-300">
                              Unmatched ({filteredTransactions.filter(t => t.match_status === 'unmatched').length})
                            </span>
                            <span className="text-xs text-amber-400">
                              - Need classification and matching
                            </span>
                          </div>
                        </td>
                      </tr>
                      {filteredTransactions.filter(t => t.match_status === 'unmatched').map((transaction) => {
                        const isSelected = selectedIds.includes(transaction.id);
                        const accountLabel =
                          transaction.type === "bank"
                            ? transaction.bank_account_name || "Unknown Bank"
                            : transaction.credit_card_name || "Unknown Card";

                        const vendorHint =
                          transaction.merchant_name ||
                          getClassificationSubcategory(transaction.classification) ||
                          "—";

                        return (
                          <tr
                            key={transaction.id}
                            className={`border-b border-slate-800/60 transition ${
                              selectedTransaction?.id === transaction.id
                                ? "bg-slate-800/50"
                                : "hover:bg-slate-800/30"
                            }`}
                          >
                            <td className="px-4 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRowSelection(transaction.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                              />
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold ${
                                    transaction.type === "bank"
                                      ? "border-sky-800/60 bg-sky-900/20 text-sky-300"
                                      : "border-violet-800/60 bg-violet-900/20 text-violet-300"
                                  }`}
                                >
                                  {transaction.type === "bank" ? (
                                    <Landmark className="h-4 w-4" />
                                  ) : (
                                    <CreditCard className="h-4 w-4" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-white">
                                      {transaction.description}
                                    </span>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClasses(
                                        transaction
                                      )}`}
                                    >
                                      {rowStatusLabel(transaction)}
                                    </span>
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                    <span>{formatDate(transaction.transaction_date)}</span>
                                    <span>
                                      {transaction.type === "bank" ? "Bank" : "Credit"}
                                    </span>
                                    {transaction.reference_number ? (
                                      <span>Ref: {transaction.reference_number}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm text-slate-200">{accountLabel}</div>
                                <div className="text-xs text-slate-500">{vendorHint}</div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className={`h-full ${confidenceBarClasses(
                                        transaction.confidence_score
                                      )}`}
                                      style={{
                                        width: `${Math.max(
                                          4,
                                          Math.round((transaction.confidence_score ?? 0) * 100)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">
                                    {transaction.confidence_score !== undefined
                                      ? `${Math.round(transaction.confidence_score * 100)}%`
                                      : "—"}
                                  </span>
                                </div>
                                <div className="truncate text-xs text-slate-500">
                                  {getClassificationCategory(transaction.classification)}
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm text-slate-200">
                                  {transaction.gl_transaction_id
                                    ? "Posted to GL"
                                    : "Pending"}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {transaction.gl_transaction_id || "Not yet posted"}
                                </div>
                              </div>
                            </td>

                            <td
                              className={`cursor-pointer px-4 py-3 text-right align-top text-sm font-semibold ${amountClasses(
                                transaction.amount
                              )}`}
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              {transaction.amount >= 0 ? "+" : ""}
                              {formatCurrency(transaction.amount)}
                            </td>

                            <td className="px-4 py-3 text-right align-top">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => updateSelectedTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  Open
                                </button>
                                {transaction.matches && transaction.matches.length > 0 && (() => {
                                  const match = transaction.matches[0];
                                  return (
                                    <button
                                      onClick={() => {
                                        if (match) {
                                          handleAcceptMatch(transaction, match);
                                        }
                                      }}
                                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                                    >
                                      Match
                                    </button>
                                  );
                                })()}
                                {!transaction.gl_transaction_id && (
                                  <button
                                    onClick={() => void handleManualPost(transaction)}
                                    disabled={postingLoading === transaction.id}
                                    className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {postingLoading === transaction.id ? "..." : "Post"}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleIgnoreTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  Ignore
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* Matched Section */}
                  {filteredTransactions.filter(t => t.match_status === 'matched').length > 0 && (
                    <>
                      <tr className="border-b-2 border-emerald-800/40 bg-emerald-900/10">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                            <span className="text-sm font-semibold text-emerald-300">
                              Matched ({filteredTransactions.filter(t => t.match_status === 'matched').length})
                            </span>
                            <span className="text-xs text-emerald-400">
                              - Ready to post
                            </span>
                          </div>
                        </td>
                      </tr>
                      {filteredTransactions.filter(t => t.match_status === 'matched').map((transaction) => {
                        const isSelected = selectedIds.includes(transaction.id);
                        const accountLabel =
                          transaction.type === "bank"
                            ? transaction.bank_account_name || "Unknown Bank"
                            : transaction.credit_card_name || "Unknown Card";

                        const vendorHint =
                          transaction.merchant_name ||
                          getClassificationSubcategory(transaction.classification) ||
                          "—";

                        return (
                          <tr
                            key={transaction.id}
                            className={`border-b border-slate-800/60 transition ${
                              selectedTransaction?.id === transaction.id
                                ? "bg-slate-800/50"
                                : "hover:bg-slate-800/30"
                            }`}
                          >
                            <td className="px-4 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRowSelection(transaction.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                              />
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold ${
                                    transaction.type === "bank"
                                      ? "border-sky-800/60 bg-sky-900/20 text-sky-300"
                                      : "border-violet-800/60 bg-violet-900/20 text-violet-300"
                                  }`}
                                >
                                  {transaction.type === "bank" ? (
                                    <Landmark className="h-4 w-4" />
                                  ) : (
                                    <CreditCard className="h-4 w-4" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-white">
                                      {transaction.description}
                                    </span>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-800/60 bg-emerald-900/20 text-emerald-300`}
                                    >
                                      Matched
                                    </span>
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                    <span>{formatDate(transaction.transaction_date)}</span>
                                    <span>
                                      {transaction.type === "bank" ? "Bank" : "Credit"}
                                    </span>
                                    {transaction.reference_number ? (
                                      <span>Ref: {transaction.reference_number}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm text-slate-200">{accountLabel}</div>
                                <div className="text-xs text-slate-500">{vendorHint}</div>
                                {transaction.classification && (
                                  <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                                    <div className="text-xs font-medium text-slate-400 mb-1">AI Classification</div>
                                    <div className="text-sm text-slate-200">
                                      {getClassificationCategory(transaction.classification)} / {getClassificationSubcategory(transaction.classification)}
                                    </div>
                                    {transaction.classification.confidence_score && (
                                      <div className="text-xs text-slate-500">
                                        Confidence: {Math.round(transaction.classification.confidence_score * 100)}%
                                      </div>
                                    )}
                                  </div>
                                )}
                                {transaction.matches && transaction.matches.length > 0 && (
                                  <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                                    <div className="text-xs font-medium text-slate-400 mb-1">Match Suggestions</div>
                                    {transaction.matches.slice(0, 2).map((match, index) => (
                                      <div key={index} className="text-sm text-slate-200 mb-1">
                                        <div className="font-medium">{match.target_entity_type}</div>
                                        <div className="text-xs text-slate-500">{match.target_entity_id}</div>
                                        <div className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                          {Math.round(match.confidence_score * 100)}%
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className={`h-full ${confidenceBarClasses(
                                        transaction.confidence_score
                                      )}`}
                                      style={{
                                        width: `${Math.max(
                                          4,
                                          Math.round((transaction.confidence_score ?? 0) * 100)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">
                                    {transaction.confidence_score !== undefined
                                      ? `${Math.round(transaction.confidence_score * 100)}%`
                                      : "—"}
                                  </span>
                                </div>
                                <div className="truncate text-xs text-slate-500">
                                  {getClassificationCategory(transaction.classification)}
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm text-emerald-300 font-semibold">
                                  Ready to Post
                                </div>
                                <div className="text-xs text-emerald-500">
                                  {transaction.gl_transaction_id || "Ready for GL posting"}
                                </div>
                              </div>
                            </td>

                            <td
                              className={`cursor-pointer px-4 py-3 text-right align-top text-sm font-semibold ${amountClasses(
                                transaction.amount
                              )}`}
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              {transaction.amount >= 0 ? "+" : ""}
                              {formatCurrency(transaction.amount)}
                            </td>

                            <td className="px-4 py-3 text-right align-top">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => updateSelectedTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  Open
                                </button>
                                {transaction.matches && transaction.matches.length > 0 && (() => {
                                  const match = transaction.matches[0];
                                  return (
                                    <button
                                      onClick={() => {
                                        if (match) {
                                          handleAcceptMatch(transaction, match);
                                        }
                                      }}
                                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                                    >
                                      Accept Match
                                    </button>
                                  );
                                })()}
                                {!transaction.gl_transaction_id && (
                                  <button
                                    onClick={() => void handleManualPost(transaction)}
                                    disabled={postingLoading === transaction.id}
                                    className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {postingLoading === transaction.id ? "..." : "Post"}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleIgnoreTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  Ignore
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* Posted Section */}
                  {filteredTransactions.filter(t => t.match_status === 'posted').length > 0 && (
                    <>
                      <tr className="border-b-2 border-emerald-800/40 bg-emerald-900/10">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                            <span className="text-sm font-semibold text-emerald-300">
                              Posted ({filteredTransactions.filter(t => t.match_status === 'posted').length})
                            </span>
                            <span className="text-xs text-emerald-400">
                              - In General Ledger
                            </span>
                          </div>
                        </td>
                      </tr>
                      {filteredTransactions.filter(t => t.match_status === 'posted').map((transaction) => {
                        const isSelected = selectedIds.includes(transaction.id);
                        const accountLabel =
                          transaction.type === "bank"
                            ? transaction.bank_account_name || "Unknown Bank"
                            : transaction.credit_card_name || "Unknown Card";

                        const vendorHint =
                          transaction.merchant_name ||
                          getClassificationSubcategory(transaction.classification) ||
                          "—";

                        return (
                          <tr
                            key={transaction.id}
                            className={`border-b border-slate-800/60 transition ${
                              selectedTransaction?.id === transaction.id
                                ? "bg-slate-800/50"
                                : "hover:bg-slate-800/30"
                            }`}
                          >
                            <td className="px-4 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRowSelection(transaction.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                              />
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold ${
                                    transaction.type === "bank"
                                      ? "border-sky-800/60 bg-sky-900/20 text-sky-300"
                                      : "border-violet-800/60 bg-violet-900/20 text-violet-300"
                                  }`}
                                >
                                  {transaction.type === "bank" ? (
                                    <Landmark className="h-4 w-4" />
                                  ) : (
                                    <CreditCard className="h-4 w-4" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-white">
                                      {transaction.description}
                                    </span>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-800/60 bg-emerald-900/20 text-emerald-300`}
                                    >
                                      Posted
                                    </span>
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                    <span>{formatDate(transaction.transaction_date)}</span>
                                    <span>
                                      {transaction.type === "bank" ? "Bank" : "Credit"}
                                    </span>
                                    {transaction.reference_number ? (
                                      <span>Ref: {transaction.reference_number}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm text-slate-200">{accountLabel}</div>
                                <div className="text-xs text-slate-500">{vendorHint}</div>
                                {transaction.classification && (
                                  <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                                    <div className="text-xs font-medium text-slate-400 mb-1">AI Classification</div>
                                    <div className="text-sm text-slate-200">
                                      {getClassificationCategory(transaction.classification)} / {getClassificationSubcategory(transaction.classification)}
                                    </div>
                                    {transaction.classification.confidence_score && (
                                      <div className="text-xs text-slate-500">
                                        Confidence: {Math.round(transaction.classification.confidence_score * 100)}%
                                      </div>
                                    )}
                                  </div>
                                )}
                                {transaction.matches && transaction.matches.length > 0 && (
                                  <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                                    <div className="text-xs font-medium text-slate-400 mb-1">Match Suggestions</div>
                                    {transaction.matches.slice(0, 2).map((match, index) => (
                                      <div key={index} className="text-sm text-slate-200 mb-1">
                                        <div className="font-medium">{match.target_entity_type}</div>
                                        <div className="text-xs text-slate-500">{match.target_entity_id}</div>
                                        <div className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                          {Math.round(match.confidence_score * 100)}%
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-emerald-800">
                                    <div
                                      className={`h-full bg-emerald-500`}
                                      style={{
                                        width: `${Math.max(
                                          4,
                                          Math.round((transaction.confidence_score ?? 0) * 100)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-emerald-400">
                                    {transaction.confidence_score !== undefined
                                      ? `${Math.round(transaction.confidence_score * 100)}%`
                                      : "—"}
                                  </span>
                                </div>
                                <div className="truncate text-xs text-slate-500">
                                  {getClassificationCategory(transaction.classification)}
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm text-emerald-300 font-semibold">
                                  Posted to GL
                                </div>
                                <div className="text-xs text-emerald-500">
                                  {transaction.gl_transaction_id || "Posted"}
                                </div>
                              </div>
                            </td>

                            <td
                              className={`cursor-pointer px-4 py-3 text-right align-top text-sm font-semibold ${amountClasses(
                                transaction.amount
                              )}`}
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              {transaction.amount >= 0 ? "+" : ""}
                              {formatCurrency(transaction.amount)}
                            </td>

                            <td className="px-4 py-3 text-right align-top">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => updateSelectedTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleIgnoreTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  Ignore
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* Ignored/Disputed Section */}
                  {filteredTransactions.filter(t => t.match_status === 'disputed').length > 0 && (
                    <>
                      <tr className="border-b-2 border-rose-800/40 bg-rose-900/10">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-rose-500"></div>
                            <span className="text-sm font-semibold text-rose-300">
                              Ignored ({filteredTransactions.filter(t => t.match_status === 'disputed').length})
                            </span>
                            <span className="text-xs text-rose-400">
                              - Disputed transactions
                            </span>
                          </div>
                        </td>
                      </tr>
                      {filteredTransactions.filter(t => t.match_status === 'disputed').map((transaction) => {
                        const isSelected = selectedIds.includes(transaction.id);
                        const accountLabel =
                          transaction.type === "bank"
                            ? transaction.bank_account_name || "Unknown Bank"
                            : transaction.credit_card_name || "Unknown Card";

                        const vendorHint =
                          transaction.merchant_name ||
                          getClassificationSubcategory(transaction.classification) ||
                          "—";

                        return (
                          <tr
                            key={transaction.id}
                            className={`border-b border-slate-800/60 transition opacity-60 ${
                              selectedTransaction?.id === transaction.id
                                ? "bg-slate-800/50"
                                : "hover:bg-slate-800/30"
                            }`}
                          >
                            <td className="px-4 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRowSelection(transaction.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                              />
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold ${
                                    transaction.type === "bank"
                                      ? "border-sky-800/60 bg-sky-900/20 text-sky-300"
                                      : "border-violet-800/60 bg-violet-900/20 text-violet-300"
                                  }`}
                                >
                                  {transaction.type === "bank" ? (
                                    <Landmark className="h-4 w-4" />
                                  ) : (
                                    <CreditCard className="h-4 w-4" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-white opacity-60">
                                      {transaction.description}
                                    </span>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-rose-800/60 bg-rose-900/20 text-rose-300`}
                                    >
                                      Ignored
                                    </span>
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 opacity-60">
                                    <span>{formatDate(transaction.transaction_date)}</span>
                                    <span>
                                      {transaction.type === "bank" ? "Bank" : "Credit"}
                                    </span>
                                    {transaction.reference_number ? (
                                      <span>Ref: {transaction.reference_number}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1 opacity-60">
                                <div className="text-sm text-slate-200">{accountLabel}</div>
                                <div className="text-xs text-slate-500">{vendorHint}</div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1 opacity-60">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className={`h-full bg-rose-500`}
                                      style={{
                                        width: `${Math.max(
                                          4,
                                          Math.round((transaction.confidence_score ?? 0) * 100)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">
                                    {transaction.confidence_score !== undefined
                                      ? `${Math.round(transaction.confidence_score * 100)}%`
                                      : "—"}
                                  </span>
                                </div>
                                <div className="truncate text-xs text-slate-500">
                                  {getClassificationCategory(transaction.classification)}
                                </div>
                              </div>
                            </td>

                            <td
                              className="cursor-pointer px-4 py-3 align-top"
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              <div className="space-y-1 opacity-60">
                                <div className="text-sm text-rose-300 font-semibold">
                                  Disputed
                                </div>
                                <div className="text-xs text-rose-500">
                                  {transaction.gl_transaction_id || "Ignored"}
                                </div>
                              </div>
                            </td>

                            <td
                              className={`cursor-pointer px-4 py-3 text-right align-top text-sm font-semibold ${amountClasses(
                                transaction.amount
                              )} opacity-60`}
                              onClick={() => updateSelectedTransaction(transaction)}
                            >
                              {transaction.amount >= 0 ? "+" : ""}
                              {formatCurrency(transaction.amount)}
                            </td>

                            <td className="px-4 py-3 text-right align-top">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => updateSelectedTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleIgnoreTransaction(transaction)}
                                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                                >
                                  Restore
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* Other transactions that don't fit above categories */}
                  {filteredTransactions.filter(t => !['unmatched', 'matched', 'posted', 'disputed'].includes(t.match_status)).map((transaction) => {
                    const isSelected = selectedIds.includes(transaction.id);
                    const accountLabel =
                      transaction.type === "bank"
                        ? transaction.bank_account_name || "Unknown Bank"
                        : transaction.credit_card_name || "Unknown Card";

                    const vendorHint =
                      transaction.merchant_name ||
                      getClassificationSubcategory(transaction.classification) ||
                      "—";

                    return (
                      <tr
                        key={transaction.id}
                        className={`border-b border-slate-800/60 transition ${
                          selectedTransaction?.id === transaction.id
                            ? "bg-slate-800/50"
                            : "hover:bg-slate-800/30"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(transaction.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                          />
                        </td>

                        <td
                          className="cursor-pointer px-4 py-3 align-top"
                          onClick={() => updateSelectedTransaction(transaction)}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold ${
                                transaction.type === "bank"
                                  ? "border-sky-800/60 bg-sky-900/20 text-sky-300"
                                  : "border-violet-800/60 bg-violet-900/20 text-violet-300"
                              }`}
                            >
                              {transaction.type === "bank" ? (
                                <Landmark className="h-4 w-4" />
                              ) : (
                                <CreditCard className="h-4 w-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-white">
                                  {transaction.description}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClasses(
                                    transaction
                                  )}`}
                                >
                                  {rowStatusLabel(transaction)}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                <span>{formatDate(transaction.transaction_date)}</span>
                                <span>
                                  {transaction.type === "bank" ? "Bank" : "Credit"}
                                </span>
                                {transaction.reference_number ? (
                                  <span>Ref: {transaction.reference_number}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          className="cursor-pointer px-4 py-3 align-top"
                          onClick={() => updateSelectedTransaction(transaction)}
                        >
                          <div className="space-y-1">
                            <div className="text-sm text-slate-200">{accountLabel}</div>
                            <div className="text-xs text-slate-500">{vendorHint}</div>
                            {transaction.classification && (
                              <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                                <div className="text-xs font-medium text-slate-400 mb-1">AI Classification</div>
                                <div className="text-sm text-slate-200">
                                  {getClassificationCategory(transaction.classification)} / {getClassificationSubcategory(transaction.classification)}
                                </div>
                                {transaction.classification.confidence_score && (
                                  <div className="text-xs text-slate-500">
                                    Confidence: {Math.round(transaction.classification.confidence_score * 100)}%
                                  </div>
                                )}
                              </div>
                            )}
                            {transaction.matches && transaction.matches.length > 0 && (
                              <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                                <div className="text-xs font-medium text-slate-400 mb-1">Match Suggestions</div>
                                {transaction.matches.slice(0, 2).map((match, index) => (
                                  <div key={index} className="text-sm text-slate-200 mb-1">
                                    <div className="font-medium">{match.target_entity_type}</div>
                                    <div className="text-xs text-slate-500">{match.target_entity_id}</div>
                                    <div className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                      {Math.round(match.confidence_score * 100)}%
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        <td
                          className="cursor-pointer px-4 py-3 align-top"
                          onClick={() => updateSelectedTransaction(transaction)}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full ${confidenceBarClasses(
                                    transaction.confidence_score
                                  )}`}
                                  style={{
                                    width: `${Math.max(
                                      4,
                                      Math.round((transaction.confidence_score ?? 0) * 100)
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-slate-400">
                                {transaction.confidence_score !== undefined
                                  ? `${Math.round(transaction.confidence_score * 100)}%`
                                  : "—"}
                              </span>
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {getClassificationCategory(transaction.classification)}
                            </div>
                          </div>
                        </td>

                        <td
                          className="cursor-pointer px-4 py-3 align-top"
                          onClick={() => updateSelectedTransaction(transaction)}
                        >
                          <div className="space-y-1">
                            <div className="text-sm text-slate-200">
                              {transaction.gl_transaction_id
                                ? "Posted to GL"
                                : "Pending"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {transaction.gl_transaction_id || "Not yet posted"}
                            </div>
                          </div>
                        </td>

                        <td
                          className={`cursor-pointer px-4 py-3 text-right align-top text-sm font-semibold ${amountClasses(
                            transaction.amount
                          )}`}
                          onClick={() => updateSelectedTransaction(transaction)}
                        >
                          {transaction.amount >= 0 ? "+" : ""}
                          {formatCurrency(transaction.amount)}
                        </td>

                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => updateSelectedTransaction(transaction)}
                              className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                            >
                              Open
                            </button>
                            {transaction.matches && transaction.matches.length > 0 && (() => {
                              const match = transaction.matches[0];
                              return (
                                <button
                                  onClick={() => {
                                    if (match) {
                                      handleAcceptMatch(transaction, match);
                                    }
                                  }}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                                >
                                  Match
                                </button>
                              );
                            })()}
                            {!transaction.gl_transaction_id && (
                              <button
                                onClick={() => void handleManualPost(transaction)}
                                disabled={postingLoading === transaction.id}
                                className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {postingLoading === transaction.id ? "..." : "Post"}
                              </button>
                            )}
                            <button
                              onClick={() => handleIgnoreTransaction(transaction)}
                              className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
                            >
                              Ignore
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredTransactions.length === 0 && (
              <div className="p-8">
                <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-800/50">
                    <Landmark className="h-8 w-8 text-slate-400" />
                  </div>
                  
                  <h3 className="mb-2 text-lg font-semibold text-white">
                    No Transactions Yet
                  </h3>
                  
                  <p className="mb-6 text-sm text-slate-400 leading-relaxed">
                    No bank or cash transactions have been imported yet. 
                    Start by connecting your bank accounts or creating transactions manually from the finance workflow.
                  </p>
                  
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add Transaction
                    </button>
                    
                    <button
                      onClick={() => navigate("/finance")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700"
                    >
                      <Landmark className="h-4 w-4" />
                      Go to Finance Hub
                    </button>
                    
                    <button
                      onClick={() => navigate(`/projects/${projectId}`)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                    >
                      <ChevronRight className="h-4 w-4" />
                      Back to Project
                    </button>
                  </div>
                  
                  <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-3 text-left">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      <strong className="text-slate-400">💡 Tip:</strong> You can import bank statements, connect bank feeds, or create manual cash transactions from the Finance Hub to get started.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedTransaction && (
            <>
              <div
                className="fixed inset-0 z-30 bg-slate-950/30 xl:hidden"
                onClick={() => setSelectedTransaction(null)}
              />
              <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-[28rem] border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur xl:bg-slate-950">
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            selectedTransaction.type === "bank"
                              ? "border-sky-800/70 bg-sky-900/20 text-sky-300"
                              : "border-violet-800/70 bg-violet-900/20 text-violet-300"
                          }`}
                        >
                          {selectedTransaction.type === "bank" ? "Bank" : "Credit"}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClasses(
                            selectedTransaction
                          )}`}
                        >
                          {rowStatusLabel(selectedTransaction)}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate text-lg font-semibold text-white">
                        Transaction Details
                      </h3>
                      <p className="mt-1 truncate text-sm text-slate-400">
                        {selectedTransaction.description}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedTransaction(null)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">Transaction</h4>
                        <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                          {selectedTransaction.source_type}
                        </span>
                      </div>
                      <div className="mb-3 flex items-center justify-between">
                        <div className={`text-lg font-semibold ${amountClasses(selectedTransaction.amount)}`}>
                          {selectedTransaction.amount >= 0 ? "+" : ""}
                          {formatCurrency(selectedTransaction.amount)}
                        </div>
                        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          selectedTransaction.gl_transaction_id 
                            ? "border-emerald-800/70 bg-emerald-900/20 text-emerald-300"
                            : "border-amber-800/70 bg-amber-900/20 text-amber-300"
                        }`}>
                          {selectedTransaction.gl_transaction_id ? "Posted" : "Unposted"}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 text-sm">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Date
                          </div>
                          <div className="mt-1 text-slate-200">
                            {formatDateTime(selectedTransaction.transaction_date)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Account
                          </div>
                          <div className="mt-1 text-slate-200">
                            {selectedTransaction.type === "bank"
                              ? selectedTransaction.bank_account_name || "Unknown Bank"
                              : selectedTransaction.credit_card_name || "Unknown Card"}
                          </div>
                        </div>

                        {selectedTransaction.reference_number && (
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Reference
                            </div>
                            <div className="mt-1 break-all font-mono text-slate-300">
                              {selectedTransaction.reference_number}
                            </div>
                          </div>
                        )}

                        {selectedTransaction.merchant_name && (
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Merchant
                            </div>
                            <div className="mt-1 text-slate-200">
                              {selectedTransaction.merchant_name}
                            </div>
                          </div>
                        )}

                        {selectedTransaction.gl_transaction_id && (
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              GL Transaction ID
                            </div>
                            <div className="mt-1 break-all font-mono text-emerald-300">
                              {selectedTransaction.gl_transaction_id}
                            </div>
                          </div>
                        )}

                        {selectedTransaction.balance !== undefined && (
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Balance
                            </div>
                            <div className="mt-1 text-slate-200">
                              {formatCurrency(selectedTransaction.balance)}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">
                          Posting / Assignment
                        </h4>
                        <button
                          onClick={() => void handleAcceptAiSuggestion()}
                          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Accept AI Suggestion
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-400">
                            Project
                          </label>
                          <select
                            value={detailForm.projectId}
                            onChange={(e) =>
                              setDetailForm((prev) => ({
                                ...prev,
                                projectId: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                          >
                            <option value="">Select project</option>
                            {projectOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-400">
                            Account
                          </label>
                          <select
                            value={detailForm.accountId}
                            onChange={(e) =>
                              setDetailForm((prev) => ({
                                ...prev,
                                accountId: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                          >
                            <option value="">Select account</option>
                            {accountOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-400">
                            Vendor
                          </label>
                          <select
                            value={detailForm.vendorId}
                            onChange={(e) =>
                              setDetailForm((prev) => ({
                                ...prev,
                                vendorId: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                          >
                            <option value="">Select vendor</option>
                            {vendorOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-800/50 px-3 py-3">
                          <div>
                            <div className="text-sm font-medium text-white">Owner Draw</div>
                            <div className="text-xs text-slate-400">
                              Mark this transaction as owner draw handling
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={detailForm.ownerDraw}
                            onClick={() =>
                              setDetailForm((prev) => ({
                                ...prev,
                                ownerDraw: !prev.ownerDraw,
                              }))
                            }
                            className={`relative h-7 w-12 rounded-full transition ${
                              detailForm.ownerDraw ? "bg-sky-600" : "bg-slate-700"
                            }`}
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                                detailForm.ownerDraw ? "left-6" : "left-1"
                              }`}
                            />
                          </button>
                        </label>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-sky-400" />
                          <h4 className="text-sm font-semibold text-white">AI Analysis</h4>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-semibold ${
                            (selectedTransaction.confidence_score ?? 0) >= 0.7 
                              ? "text-emerald-400" 
                              : (selectedTransaction.confidence_score ?? 0) >= 0.5 
                                ? "text-amber-400" 
                                : "text-rose-400"
                          }`}>
                            {selectedTransaction.confidence_score !== undefined
                              ? `${Math.round(selectedTransaction.confidence_score * 100)}%`
                              : "Unscored"}
                          </div>
                          <div className="text-[10px] text-slate-500">Confidence</div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium text-slate-200">
                              {getClassificationCategory(selectedTransaction.classification)}
                            </div>
                            <div className="text-xs text-slate-400">
                              {selectedTransaction.confidence_score !== undefined
                                ? `${Math.round(selectedTransaction.confidence_score * 100)}% confidence`
                                : "Unscored"}
                            </div>
                          </div>
                          {getClassificationSubcategory(selectedTransaction.classification) ? (
                            <div className="text-xs text-slate-400">
                              Subcategory:{" "}
                              {getClassificationSubcategory(selectedTransaction.classification)}
                            </div>
                          ) : null}
                          <div className="mt-1 text-xs text-slate-500">
                            Match type:{" "}
                            {getClassificationMatchType(selectedTransaction.classification)}
                          </div>
                          {getClassificationRuleName(selectedTransaction.classification) ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Rule: {getClassificationRuleName(selectedTransaction.classification)}
                            </div>
                          ) : null}
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                            <div
                              className={`h-full ${confidenceBarClasses(
                                selectedTransaction.confidence_score
                              )}`}
                              style={{
                                width: `${Math.max(
                                  4,
                                  Math.round((selectedTransaction.confidence_score ?? 0) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                            All Match Suggestions ({selectedTransaction.matches?.length || 0})
                          </div>
                          {selectedTransaction.matches && selectedTransaction.matches.length > 0 ? (
                            <div className="space-y-2">
                              {selectedTransaction.matches.map((match, index) => (
                                <div
                                  key={`${match.target_entity_id}-${index}`}
                                  className="rounded-xl border border-slate-800 bg-slate-800/50 p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-slate-200">
                                        {match.target_entity_type}
                                      </div>
                                      <div className="truncate text-xs text-slate-500">
                                        {match.target_entity_id}
                                      </div>
                                    </div>
                                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                      {Math.round(match.confidence_score * 100)}%
                                    </span>
                                  </div>
                                  <div className="mt-2 text-xs text-slate-500">
                                    {getMatchDetailsValue(match, "match_type") || "AI suggestion"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-500">
                              No matches found
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Notes Section */}
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">Raw Data</h4>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Source ID
                          </div>
                          <div className="mt-1 break-all font-mono text-slate-300">
                            {selectedTransaction.source_id}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Created
                          </div>
                          <div className="mt-1 text-slate-200">
                            {formatDateTime(selectedTransaction.created_at)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Last Updated
                          </div>
                          <div className="mt-1 text-slate-200">
                            {formatDateTime(selectedTransaction.updated_at)}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="border-t border-slate-800 px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      {!selectedTransaction.gl_transaction_id ? (
                        <button
                          onClick={() => void handleManualPost(selectedTransaction)}
                          disabled={postingLoading === selectedTransaction.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          {postingLoading === selectedTransaction.id
                            ? "Posting..."
                            : "Post Transaction"}
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-800/70 bg-emerald-900/20 px-4 py-2 text-sm font-medium text-emerald-300">
                          <Check className="h-4 w-4" />
                          Posted
                        </div>
                      )}

                      <button
                        onClick={() => setSelectedTransaction(null)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        Close
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </>
          )}
        </>
      )}
      </div>

      {/* Create Transaction Modal */}
      <FormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateTransaction}
        title="Create Transaction"
        size="sm"
        submitLabel="Create Transaction"
        isSubmitting={isCreating}
        submitDisabled={!isCreateFormValid}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Date *
            </label>
            <input
              type="date"
              value={createForm.transaction_date}
              onChange={(e) => setCreateForm(prev => ({ ...prev, transaction_date: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Description *
            </label>
            <input
              type="text"
              value={createForm.description}
              onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter transaction description"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={createForm.amount}
              onChange={(e) => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="0.00"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              required
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Positive for income, negative for expenses
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Bank Account *
            </label>
            <select
              value={createForm.bank_account_id}
              onChange={(e) => setCreateForm(prev => ({ ...prev, bank_account_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="">Select bank account</option>
              {accountOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} {option.meta && `(${option.meta})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Reference (Optional)
            </label>
            <input
              type="text"
              value={createForm.reference_number}
              onChange={(e) => setCreateForm(prev => ({ ...prev, reference_number: e.target.value }))}
              placeholder="Check number, transaction ID, etc."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </div>
        </div>
      </FormModal>
    </>
  );
}