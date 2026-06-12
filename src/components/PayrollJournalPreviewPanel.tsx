// Payroll Journal Preview Panel - Phase 3D
// Journal entry preview and review component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  FileText,
  DollarSign,
  Eye,
  Download,
  Filter,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronUp,
  Settings,
  Loader2,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import type { PayrollJournalPreview, PayrollGLPostingLine } from "../lib/payrollAccountingIntegration";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

interface PayrollJournalPreviewPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onJournalSelect?: (journal: PayrollJournalPreview) => void;
  readOnly?: boolean;
}

export default function PayrollJournalPreviewPanel({
  companyId,
  payrollPeriodId,
  onJournalSelect,
  readOnly = false
}: PayrollJournalPreviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState<PayrollJournalPreview | null>(null);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterComponent, setFilterComponent] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("account");

  // Load journal preview
  useEffect(() => {
    async function loadJournalPreview() {
      try {
        setLoading(true);
        
        const journalPreview = await payrollAccountingIntegration.generatePayrollJournalPreview(
          companyId,
          payrollPeriodId,
          {
            includeStatutoryDetails: true,
            includeProjectAllocations: true,
            includeVarianceAnalysis: true,
            previewMode: 'comprehensive'
          }
        );
        
        setJournal(journalPreview);
      } catch (error) {
        console.error("Error loading journal preview:", error);
      } finally {
        setLoading(false);
      }
    }

    loadJournalPreview();
  }, [companyId, payrollPeriodId]);

  // Refresh journal preview
  const refreshJournal = async () => {
    if (loading) return;

    try {
      setLoading(true);
      
      const journalPreview = await payrollAccountingIntegration.generatePayrollJournalPreview(
        companyId,
        payrollPeriodId,
        {
          includeStatutoryDetails: true,
          includeProjectAllocations: true,
          includeVarianceAnalysis: true,
          previewMode: 'comprehensive'
        }
      );
      
      setJournal(journalPreview);
    } catch (error) {
      console.error("Error refreshing journal preview:", error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle line expansion
  const toggleLineExpansion = (lineId: string) => {
    const newExpanded = new Set(expandedLines);
    if (newExpanded.has(lineId)) {
      newExpanded.delete(lineId);
    } else {
      newExpanded.add(lineId);
    }
    setExpandedLines(newExpanded);
  };

  // Filter and sort lines
  const filteredLines = journal?.lines
    .filter(line => {
      const matchesSearch = searchTerm === "" || 
                           line.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           line.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           line.employeeName?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAccount = filterAccount === "all" || line.accountId === filterAccount;
      const matchesComponent = filterComponent === "all" || line.payrollComponent.type === filterComponent;
      return matchesSearch && matchesAccount && matchesComponent;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'account':
          return a.accountName.localeCompare(b.accountName);
        case 'description':
          return a.description.localeCompare(b.description);
        case 'debit':
          return b.debit - a.debit;
        case 'credit':
          return b.credit - a.credit;
        case 'employee':
          return (a.employeeName || "").localeCompare(b.employeeName || "");
        default:
          return 0;
      }
    }) || [];

  // Get unique accounts and components
  const uniqueAccounts = Array.from(new Set(journal?.lines.map(l => l.accountId) || []));
  const uniqueComponents = Array.from(new Set(journal?.lines.map(l => l.payrollComponent.type) || []));

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading journal preview...</span>
        </div>
      </div>
    );
  }

  if (!journal) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Journal Data</h3>
          <p className="text-gray-600">Unable to load journal preview. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Journal Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Journal Preview</h3>
            <p className="text-sm text-gray-600">
              {journal.description} • {formatDateTime(journal.generatedAt)}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              journal.status === 'ready' ? 'bg-green-100 text-green-800' :
              journal.status === 'preview' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {journal.status.toUpperCase()}
            </div>
            <button
              onClick={refreshJournal}
              disabled={loading}
              className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </button>
            <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
              <Download className="h-4 w-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Journal Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Total Debits</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(journal.summary.totalDebits)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Total Credits</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(journal.summary.totalCredits)}</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-600">Total Lines</div>
            <div className="text-lg font-bold text-blue-900">{journal.lines.length}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-green-600">Balancing Status</div>
            <div className="text-lg font-bold text-green-900 capitalize">
              {journal.summary.balancingStatus.replace('_', ' ')}
            </div>
          </div>
        </div>

        {/* Variance Summary */}
        {journal.summary.varianceCount > 0 && (
          <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="font-medium text-yellow-900">
                {journal.summary.varianceCount} variance(s) detected
              </span>
            </div>
          </div>
        )}

        {/* Reconciliation Summary */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-600">Wages Expense</div>
            <div className="text-lg font-bold text-purple-900">
              {formatCurrency(journal.summary.totalWagesExpense)}
            </div>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="text-sm text-orange-600">Statutory Deductions</div>
            <div className="text-lg font-bold text-orange-900">
              {formatCurrency(journal.summary.totalStatutoryDeductions)}
            </div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-red-600">Net Payroll</div>
            <div className="text-lg font-bold text-red-900">
              {formatCurrency(journal.summary.totalNetPayroll)}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Accounts</option>
              {uniqueAccounts.map((accountId) => (
                <option key={accountId} value={accountId}>
                  {journal.lines.find(l => l.accountId === accountId)?.accountName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={filterComponent}
              onChange={(e) => setFilterComponent(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Components</option>
              {uniqueComponents.map((component) => (
                <option key={component} value={component}>
                  {component}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search lines..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="account">Sort by Account</option>
              <option value="description">Sort by Description</option>
              <option value="debit">Sort by Debit</option>
              <option value="credit">Sort by Credit</option>
              <option value="employee">Sort by Employee</option>
            </select>
          </div>
        </div>
      </div>

      {/* Journal Lines */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">
              Journal Entry Lines ({filteredLines.length})
            </h4>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setExpandedLines(new Set(journal.lines.map(l => l.id)))}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Expand All
              </button>
              <button
                onClick={() => setExpandedLines(new Set())}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortBy(sortBy === 'account' ? 'account_desc' : 'account')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    Account
                    {sortBy === 'account' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortBy(sortBy === 'description' ? 'description_desc' : 'description')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    Description
                    {sortBy === 'description' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortBy(sortBy === 'debit' ? 'debit_desc' : 'debit')}
                    className="flex items-center justify-end space-x-1 hover:text-gray-700"
                  >
                    Debit
                    {sortBy === 'debit' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortBy(sortBy === 'credit' ? 'credit_desc' : 'credit')}
                    className="flex items-center justify-end space-x-1 hover:text-gray-700"
                  >
                    Credit
                    {sortBy === 'credit' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Component</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLines.map((line, index) => (
                <React.Fragment key={line.id}>
                  <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{line.accountCode}</div>
                        <div className="text-gray-500">{line.accountName}</div>
                        <div className="text-xs text-gray-400">{line.accountType}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{line.description}</div>
                      {line.statutoryCategory && (
                        <div className="text-xs text-blue-600">Statutory: {line.statutoryCategory}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        line.payrollComponent.category === 'wages' ? 'bg-blue-100 text-blue-800' :
                        line.payrollComponent.category === 'deductions' ? 'bg-red-100 text-red-800' :
                        line.payrollComponent.category === 'taxes' ? 'bg-orange-100 text-orange-800' :
                        line.payrollComponent.category === 'contributions' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {line.payrollComponent.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {line.employeeName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {line.projectId || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleLineExpansion(line.id)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          {expandedLines.has(line.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <button className="text-blue-600 hover:text-blue-700">
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded Details */}
                  {expandedLines.has(line.id) && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="font-medium text-gray-700">Allocation</div>
                            <div className="text-gray-600">
                              {line.allocation.allocationPercentage}% • {line.allocation.allocationMethod}
                            </div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-700">Tax Jurisdiction</div>
                            <div className="text-gray-600">{line.taxJurisdiction || 'N/A'}</div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-700">Line Number</div>
                            <div className="text-gray-600">#{line.lineNumber}</div>
                          </div>
                        </div>
                        
                        {line.metadata && (
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="font-medium text-gray-700">Calculation Method</div>
                              <div className="text-gray-600">{line.metadata.calculationMethod}</div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-700">Source System</div>
                              <div className="text-gray-600">{line.metadata.sourceSystem}</div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-700">Validation Status</div>
                              <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                line.metadata.validationStatus === 'validated' ? 'bg-green-100 text-green-800' :
                                line.metadata.validationStatus === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {line.metadata.validationStatus}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-700">Last Modified</div>
                              <div className="text-gray-600">
                                {line.metadata.lastModified ? formatDateTime(line.metadata.lastModified) : 'N/A'}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Journal Footer */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Generated by {journal.generatedBy} on {formatDateTime(journal.generatedAt)}
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              journal.reconciliation.confidenceScore >= 90 ? 'bg-green-100 text-green-800' :
              journal.reconciliation.confidenceScore >= 70 ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              Confidence: {formatPercent(journal.reconciliation.confidenceScore)}
            </div>
            {journal.notes && (
              <div className="text-sm text-gray-600">
                <Info className="h-4 w-4 inline mr-1" />
                {journal.notes}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
