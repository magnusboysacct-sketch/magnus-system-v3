import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  Landmark,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";

type RowData = Record<string, string | number | boolean | null>;

type PeriodOption = {
  key: string;
  label: string;
  year?: number;
  month?: number;
};

const VIEW_NAMES = {
  profitLoss: "v_profit_loss",
  profitLossSummary: "v_profit_loss_summary",
  balanceSheet: "v_balance_sheet",
  balanceSheetSummary: "v_balance_sheet_summary",
  cashFlowSummary: "v_cash_flow_summary",
} as const;

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-JM", {
  style: "currency",
  currency: "JMD",
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-JM", {
  maximumFractionDigits: 2,
});

function isNumericLike(value: unknown) {
  if (typeof value === "number") return true;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return true;
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: unknown) {
  const num = toNumber(value);
  if (num === null) return "—";
  return formatCurrency(num);
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";

  if (
    key.toLowerCase().includes("date") ||
    key.toLowerCase().includes("period") ||
    key.toLowerCase().includes("month_name")
  ) {
    return String(value);
  }

  if (
    key.toLowerCase().includes("amount") ||
    key.toLowerCase().includes("balance") ||
    key.toLowerCase().includes("revenue") ||
    key.toLowerCase().includes("expense") ||
    key.toLowerCase().includes("profit") ||
    key.toLowerCase().includes("loss") ||
    key.toLowerCase().includes("cash") ||
    key.toLowerCase().includes("asset") ||
    key.toLowerCase().includes("liabilit") ||
    key.toLowerCase().includes("equity")
  ) {
    return formatMoney(value);
  }

  if (isNumericLike(value)) {
    return NUMBER_FORMATTER.format(Number(value));
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function startCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function getCandidateValue(row: RowData | null | undefined, keys: string[]) {
  if (!row) return null;
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return null;
}

function getPeriodKey(row: RowData) {
  const year = toNumber(row.report_year);
  const month = toNumber(row.report_month);
  if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
  if (year) return `${year}`;
  return "all";
}

function sortRowsByPeriodDesc(rows: RowData[]) {
  return [...rows].sort((a, b) => {
    const ay = toNumber(a.report_year) ?? 0;
    const by = toNumber(b.report_year) ?? 0;
    if (by !== ay) return by - ay;

    const am = toNumber(a.report_month) ?? 0;
    const bm = toNumber(b.report_month) ?? 0;
    if (bm !== am) return bm - am;

    const ad = String(a.created_at ?? a.date ?? "");
    const bd = String(b.created_at ?? b.date ?? "");
    return bd.localeCompare(ad);
  });
}

function buildPeriodOptions(rows: RowData[]): PeriodOption[] {
  const seen = new Set<string>();
  const options: PeriodOption[] = [{ key: "all", label: "All Periods" }];

  sortRowsByPeriodDesc(rows).forEach((row) => {
    const year = toNumber(row.report_year) ?? undefined;
    const month = toNumber(row.report_month) ?? undefined;

    if (year && month) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        const label = new Date(year, month - 1, 1).toLocaleDateString("en-JM", {
          month: "long",
          year: "numeric",
        });
        options.push({ key, label, year, month });
      }
      return;
    }

    if (year) {
      const key = `${year}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({ key, label: String(year), year });
      }
    }
  });

  return options;
}

function uniqueStringValues(rows: RowData[], key: string) {
  const values = Array.from(
    new Set(
      rows
        .map((row) => row[key])
        .filter((v): v is string | number => v !== null && v !== undefined && String(v).trim() !== "")
        .map((v) => String(v))
    )
  );
  return values.sort((a, b) => a.localeCompare(b));
}

function applyCommonFilters(
  rows: RowData[],
  selectedPeriod: string,
  selectedCompany: string,
  selectedProject: string
) {
  return rows.filter((row) => {
    if (selectedPeriod !== "all") {
      const rowKey = getPeriodKey(row);
      if (rowKey !== selectedPeriod && String(row.report_year ?? "") !== selectedPeriod) {
        return false;
      }
    }

    if (selectedCompany !== "all" && "company_id" in row) {
      if (String(row.company_id ?? "") !== selectedCompany) return false;
    }

    if (selectedProject !== "all" && "project_id" in row) {
      if (String(row.project_id ?? "") !== selectedProject) return false;
    }

    return true;
  });
}

function getColumns(rows: RowData[]) {
  const priority = [
    "report_year",
    "report_month",
    "company_id",
    "project_id",
    "category",
    "section",
    "account_code",
    "account_name",
    "amount",
    "balance",
  ];

  const set = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (row[key] !== null && row[key] !== undefined) set.add(key);
    });
  });

  const columns = Array.from(set);
  columns.sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });

  return columns;
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600/20 text-sky-400">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-200">{title}</h2>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-800/60 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${subtle ? "text-slate-400" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}

function SummaryBlock({
  title,
  icon,
  metrics,
}: {
  title: string;
  icon: React.ReactNode;
  metrics: Array<{ label: string; value: string; subtle?: boolean }>;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600/20 text-sky-400">
          {icon}
        </div>
        <div className="text-sm font-semibold text-slate-200">{title}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {metrics.map((metric) => (
          <SummaryMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            subtle={metric.subtle}
          />
        ))}
      </div>
    </div>
  );
}

function DetailTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: RowData[];
  emptyLabel: string;
}) {
  const columns = useMemo(() => getColumns(rows), [rows]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <div className="text-xs text-slate-400">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/30">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {startCase(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={`${title}-${rowIndex}`}
                  className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/20"
                >
                  {columns.map((column) => (
                    <td key={`${title}-${rowIndex}-${column}`} className="px-4 py-3 align-top text-slate-200">
                      {formatValue(column, row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FinanceReportsPage() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject } = useProjectContext();
  const financeAccess = useFinanceAccess();
  const navigate = useNavigate();

  const projectId = routeProjectId || currentProjectId;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [profitLossRows, setProfitLossRows] = useState<RowData[]>([]);
  const [profitLossSummaryRows, setProfitLossSummaryRows] = useState<RowData[]>([]);
  const [balanceSheetRows, setBalanceSheetRows] = useState<RowData[]>([]);
  const [balanceSheetSummaryRows, setBalanceSheetSummaryRows] = useState<RowData[]>([]);
  const [cashFlowSummaryRows, setCashFlowSummaryRows] = useState<RowData[]>([]);

  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");

  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      // Get company ID from project if available
      let targetCompanyId = companyId;
      if (!targetCompanyId && projectId) {
        const { data: project } = await supabase
          .from("projects")
          .select("company_id")
          .eq("id", projectId)
          .single();

        if (project?.company_id) {
          targetCompanyId = project.company_id;
          setCompanyId(targetCompanyId);
        }
      }

      const [
        profitLossResult,
        profitLossSummaryResult,
        balanceSheetResult,
        balanceSheetSummaryResult,
        cashFlowSummaryResult,
      ] = await Promise.all([
        supabase.from(VIEW_NAMES.profitLoss as any).select("*").eq("company_id", targetCompanyId || ""),
        supabase.from(VIEW_NAMES.profitLossSummary as any).select("*").eq("company_id", targetCompanyId || ""),
        supabase.from(VIEW_NAMES.balanceSheet as any).select("*").eq("company_id", targetCompanyId || ""),
        supabase.from(VIEW_NAMES.balanceSheetSummary as any).select("*").eq("company_id", targetCompanyId || ""),
        supabase.from(VIEW_NAMES.cashFlowSummary as any).select("*").eq("company_id", targetCompanyId || ""),
      ]);

      const results = [
        profitLossResult,
        profitLossSummaryResult,
        balanceSheetResult,
        balanceSheetSummaryResult,
        cashFlowSummaryResult,
      ];

      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      setProfitLossRows(sortRowsByPeriodDesc((profitLossResult.data ?? []) as RowData[]));
      setProfitLossSummaryRows(sortRowsByPeriodDesc((profitLossSummaryResult.data ?? []) as RowData[]));
      setBalanceSheetRows(sortRowsByPeriodDesc((balanceSheetResult.data ?? []) as RowData[]));
      setBalanceSheetSummaryRows(sortRowsByPeriodDesc((balanceSheetSummaryResult.data ?? []) as RowData[]));
      setCashFlowSummaryRows(sortRowsByPeriodDesc((cashFlowSummaryResult.data ?? []) as RowData[]));
    } catch (err: any) {
      setError(err?.message || "Failed to load finance reports.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const allRows = useMemo(
    () => [
      ...profitLossRows,
      ...profitLossSummaryRows,
      ...balanceSheetRows,
      ...balanceSheetSummaryRows,
      ...cashFlowSummaryRows,
    ],
    [
      profitLossRows,
      profitLossSummaryRows,
      balanceSheetRows,
      balanceSheetSummaryRows,
      cashFlowSummaryRows,
    ]
  );

  const periodOptions = useMemo(() => buildPeriodOptions(allRows), [allRows]);

  const companyOptions = useMemo(() => uniqueStringValues(allRows, "company_id"), [allRows]);
  const projectOptions = useMemo(() => uniqueStringValues(allRows, "project_id"), [allRows]);

  const filteredProfitLossRows = useMemo(
    () => applyCommonFilters(profitLossRows, selectedPeriod, selectedCompany, selectedProject),
    [profitLossRows, selectedPeriod, selectedCompany, selectedProject]
  );

  const filteredProfitLossSummaryRows = useMemo(
    () => applyCommonFilters(profitLossSummaryRows, selectedPeriod, selectedCompany, selectedProject),
    [profitLossSummaryRows, selectedPeriod, selectedCompany, selectedProject]
  );

  const filteredBalanceSheetRows = useMemo(
    () => applyCommonFilters(balanceSheetRows, selectedPeriod, selectedCompany, selectedProject),
    [balanceSheetRows, selectedPeriod, selectedCompany, selectedProject]
  );

  const filteredBalanceSheetSummaryRows = useMemo(
    () => applyCommonFilters(balanceSheetSummaryRows, selectedPeriod, selectedCompany, selectedProject),
    [balanceSheetSummaryRows, selectedPeriod, selectedCompany, selectedProject]
  );

  const filteredCashFlowSummaryRows = useMemo(
    () => applyCommonFilters(cashFlowSummaryRows, selectedPeriod, selectedCompany, selectedProject),
    [cashFlowSummaryRows, selectedPeriod, selectedCompany, selectedProject]
  );

  const profitLossSummary = filteredProfitLossSummaryRows[0] ?? null;
  const balanceSheetSummary = filteredBalanceSheetSummaryRows[0] ?? null;
  const cashFlowSummary = filteredCashFlowSummaryRows[0] ?? null;

  const profitLossMetrics = useMemo(
    () => [
      {
        label: "Revenue",
        value: formatMoney(
          getCandidateValue(profitLossSummary, [
            "total_revenue",
            "revenue",
            "gross_revenue",
            "income",
          ])
        ),
      },
      {
        label: "Expenses",
        value: formatMoney(
          getCandidateValue(profitLossSummary, [
            "total_expenses",
            "expenses",
            "operating_expenses",
            "costs",
          ])
        ),
      },
      {
        label: "Net Profit",
        value: formatMoney(
          getCandidateValue(profitLossSummary, [
            "net_profit",
            "net_income",
            "profit",
            "loss",
            "current_period_earnings",
          ])
        ),
      },
    ],
    [profitLossSummary]
  );

  const balanceSheetMetrics = useMemo(
    () => [
      {
        label: "Assets",
        value: formatMoney(
          getCandidateValue(balanceSheetSummary, ["total_assets", "assets"])
        ),
      },
      {
        label: "Liabilities",
        value: formatMoney(
          getCandidateValue(balanceSheetSummary, ["total_liabilities", "liabilities"])
        ),
      },
      {
        label: "Equity",
        value: formatMoney(
          getCandidateValue(balanceSheetSummary, [
            "total_equity",
            "equity",
            "total_equity_base",
          ])
        ),
      },
    ],
    [balanceSheetSummary]
  );

  const cashFlowMetrics = useMemo(
    () => [
      {
        label: "Net Cash Flow",
        value: formatMoney(
          getCandidateValue(cashFlowSummary, ["net_cash_flow", "cash_flow"])
        ),
      },
      {
        label: "Cash In",
        value: formatMoney(
          getCandidateValue(cashFlowSummary, ["cash_in", "total_cash_in", "inflows"])
        ),
        subtle: !("cash_in" in (cashFlowSummary ?? {})) && !("total_cash_in" in (cashFlowSummary ?? {})),
      },
      {
        label: "Cash Out",
        value: formatMoney(
          getCandidateValue(cashFlowSummary, ["cash_out", "total_cash_out", "outflows"])
        ),
        subtle: !("cash_out" in (cashFlowSummary ?? {})) && !("total_cash_out" in (cashFlowSummary ?? {})),
      },
    ],
    [cashFlowSummary]
  );

  const activePeriodLabel =
    periodOptions.find((option) => option.key === selectedPeriod)?.label || "All Periods";

  if (financeAccess.loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 text-2xl text-slate-400">Loading Finance Reports...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Finance Reports</h1>
              <p className="text-slate-400">
                Profit &amp; Loss, Balance Sheet, and Cash Flow summaries with detailed reporting.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/projects/${projectId}/finance/dashboard`)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex min-w-[180px] flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Period
            </span>
            <div className="relative">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/70 px-4 pr-10 text-sm text-slate-200 outline-none transition focus:border-sky-600"
              >
                {periodOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <label className="flex min-w-[180px] flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Company
            </span>
            <div className="relative">
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/70 px-4 pr-10 text-sm text-slate-200 outline-none transition focus:border-sky-600"
              >
                <option value="all">All Companies</option>
                {companyOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <label className="flex min-w-[180px] flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Project
            </span>
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/70 px-4 pr-10 text-sm text-slate-200 outline-none transition focus:border-sky-600"
              >
                <option value="all">All Projects</option>
                {projectOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <button
            type="button"
            onClick={() => loadData(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-4 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1">
            <Calendar className="h-3.5 w-3.5" />
            {activePeriodLabel}
          </div>
          {selectedCompany !== "all" && (
            <div className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1">
              Company: {selectedCompany}
            </div>
          )}
          {selectedProject !== "all" && (
            <div className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1">
              Project: {selectedProject}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading finance reports...
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-800/60 bg-rose-900/20 p-6 text-sm text-rose-300">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <SummaryBlock
              title="Profit & Loss"
              icon={<BarChart3 className="h-5 w-5" />}
              metrics={profitLossMetrics}
            />
            <SummaryBlock
              title="Balance Sheet"
              icon={<Landmark className="h-5 w-5" />}
              metrics={balanceSheetMetrics}
            />
            <SummaryBlock
              title="Cash Flow"
              icon={<Wallet className="h-5 w-5" />}
              metrics={cashFlowMetrics}
            />
          </div>

          <div className="space-y-6">
            <SectionCard title="Profit & Loss Details" icon={<BarChart3 className="h-5 w-5" />}>
              <div className="space-y-4">
                <DetailTable
                  title="Summary"
                  rows={filteredProfitLossSummaryRows}
                  emptyLabel="No Profit & Loss summary rows found for the selected filters."
                />
                <DetailTable
                  title="Detailed Lines"
                  rows={filteredProfitLossRows}
                  emptyLabel="No Profit & Loss detail rows found for the selected filters."
                />
              </div>
            </SectionCard>

            <SectionCard title="Balance Sheet Details" icon={<Landmark className="h-5 w-5" />}>
              <div className="space-y-4">
                <DetailTable
                  title="Summary"
                  rows={filteredBalanceSheetSummaryRows}
                  emptyLabel="No Balance Sheet summary rows found for the selected filters."
                />
                <DetailTable
                  title="Detailed Lines"
                  rows={filteredBalanceSheetRows}
                  emptyLabel="No Balance Sheet detail rows found for the selected filters."
                />
              </div>
            </SectionCard>

            <SectionCard title="Cash Flow Details" icon={<Wallet className="h-5 w-5" />}>
              <div className="space-y-4">
                <DetailTable
                  title="Summary"
                  rows={filteredCashFlowSummaryRows}
                  emptyLabel="No Cash Flow summary rows found for the selected filters."
                />
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}