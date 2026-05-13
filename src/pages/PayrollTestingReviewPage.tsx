// Payroll Testing Review Dashboard - Phase 3D
// Comprehensive payroll testing and review workflows
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  TrendingUp,
  TrendingDown,
  Eye,
  Users,
  Calculator,
  Scale,
  Target,
  Calendar,
  DollarSign,
  AlertCircle,
  ChevronRight,
  Download,
  RefreshCw,
  Filter,
  Search,
  BarChart3,
  PieChart,
  Activity,
  Shield,
  FileCheck,
  CreditCard,
  Building,
  UserCheck,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  X,
  Check,
  XCircle,
  Loader2
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import { jamaicanPayrollScenarioTester } from "../lib/jamaicanPayrollScenarioTesting";
import type {
  PayrollJournalPreview,
  PayrollReconciliationResult,
  PayrollFinanceIntegrationSummary,
  PayrollLiabilitySummary,
  PayrollVariance,
  PayrollAccountingMapping,
  PayrollProjectCostAllocation
} from "../lib/payrollAccountingIntegration";
import type {
  PayrollValidationSuite,
  PayrollScenarioProfile,
  PayrollAccuracySummary
} from "../lib/jamaicanPayrollScenarioTesting";

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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function PayrollTestingReviewPage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject } = useProjectContext();
  const financeAccess = useFinanceAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("current");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Data states
  const [integrationSummary, setIntegrationSummary] = useState<PayrollFinanceIntegrationSummary | null>(null);
  const [journalPreview, setJournalPreview] = useState<PayrollJournalPreview | null>(null);
  const [reconciliationResult, setReconciliationResult] = useState<PayrollReconciliationResult | null>(null);
  const [liabilitySummary, setLiabilitySummary] = useState<PayrollLiabilitySummary | null>(null);
  const [scenarioResults, setScenarioResults] = useState<PayrollValidationSuite | null>(null);
  const [accuracySummary, setAccuracySummary] = useState<PayrollAccuracySummary | null>(null);
  const [projectAllocations, setProjectAllocations] = useState<PayrollProjectCostAllocation[]>([]);

  const projectId = currentProjectId || routeProjectId;

  // Load data
  useEffect(() => {
    async function loadPayrollReviewData() {
      if (!projectId || !financeAccess.canAccessProjectFinance) return;

      try {
        setLoading(true);
        setError(null);

        // Get company ID from project
        const { data: project } = await supabase
          .from("projects")
          .select("company_id")
          .eq("id", projectId)
          .single();

        if (!project?.company_id) {
          throw new Error("Project not found or no company associated");
        }

        setCompanyId(project.company_id);

        // Load all payroll review data in parallel
        const mockPeriodId = "period_2024_05"; // Mock period for testing
        
        const [
          integrationData,
          journalData,
          reconciliationData,
          liabilityData,
          scenarioData,
          accuracyData,
          allocationData
        ] = await Promise.all([
          payrollAccountingIntegration.generatePayrollAccountingSummary(project.company_id, mockPeriodId),
          payrollAccountingIntegration.generatePayrollJournalPreview(project.company_id, mockPeriodId),
          payrollAccountingIntegration.reconcilePayrollToGL(
            project.company_id, 
            mockPeriodId, 
            [], 
            { employees: [] }
          ),
          payrollAccountingIntegration.calculatePayrollLiabilities(project.company_id, mockPeriodId),
          jamaicanPayrollScenarioTester.executeScenarioValidation([], 'comprehensive'),
          jamaicanPayrollScenarioTester.buildAccuracySummary([]),
          payrollAccountingIntegration.buildProjectCostAllocations(project.company_id, mockPeriodId, 'proj_001')
        ]);

        setIntegrationSummary(integrationData);
        setJournalPreview(journalData);
        setReconciliationResult(reconciliationData);
        setLiabilitySummary(liabilityData);
        setScenarioResults(scenarioData);
        setAccuracySummary(accuracyData);
        setProjectAllocations([allocationData]);

      } catch (err) {
        console.error("Error loading payroll review data:", err);
        setError(err instanceof Error ? err.message : "Failed to load payroll review data");
      } finally {
        setLoading(false);
      }
    }

    loadPayrollReviewData();
  }, [projectId, financeAccess.canAccessProjectFinance]);

  // Calculate derived metrics
  const metrics = useMemo(() => {
    if (!integrationSummary) return null;

    return {
      readinessScore: integrationSummary.readinessScore,
      totalPayrollAmount: integrationSummary.summary.totalPayrollAmount,
      totalEmployees: integrationSummary.summary.totalEmployees,
      varianceCount: reconciliationResult?.summary.varianceTransactions || 0,
      complianceScore: liabilitySummary?.statutoryCompliance.overallComplianceScore || 0,
      journalEntriesGenerated: integrationSummary.summary.journalEntriesGenerated,
      liabilitiesIdentified: integrationSummary.summary.liabilitiesIdentified
    };
  }, [integrationSummary, reconciliationResult, liabilitySummary]);

  // Filter data based on search and filters
  const filteredData = useMemo(() => {
    if (!integrationSummary) return null;

    // Apply filters (mock implementation)
    return {
      integration: integrationSummary,
      journal: journalPreview,
      reconciliation: reconciliationResult,
      liabilities: liabilitySummary,
      scenarios: scenarioResults,
      accuracy: accuracySummary,
      allocations: projectAllocations
    };
  }, [integrationSummary, journalPreview, reconciliationResult, liabilitySummary, scenarioResults, accuracySummary, projectAllocations, searchTerm, filterStatus]);

  if (!financeAccess.canAccessProjectFinance) {
    return <FinanceAccessDenied />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading payroll review data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payroll Testing & Review</h1>
              <p className="text-sm text-gray-500">
                {currentProject?.name || `Project ${projectId}`} • Phase 3D Review Dashboard
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="current">Current Period</option>
                  <option value="previous">Previous Period</option>
                  <option value="ytd">Year to Date</option>
                </select>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="text-sm">Refresh</span>
              </button>
              <button className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                <Download className="h-4 w-4" />
                <span className="text-sm">Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Readiness Score */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Readiness Score</p>
                  <p className="text-2xl font-bold text-gray-900">{formatPercent(metrics.readinessScore)}</p>
                </div>
                <div className={`p-3 rounded-full ${
                  metrics.readinessScore >= 90 ? 'bg-green-100' :
                  metrics.readinessScore >= 70 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <Target className={`h-6 w-6 ${
                    metrics.readinessScore >= 90 ? 'text-green-600' :
                    metrics.readinessScore >= 70 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  {metrics.readinessScore >= 90 ? (
                    <><CheckCircle className="h-4 w-4 text-green-500 mr-1" /> Ready for posting</>
                  ) : metrics.readinessScore >= 70 ? (
                    <><AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" /> Review required</>
                  ) : (
                    <><XCircle className="h-4 w-4 text-red-500 mr-1" /> Issues detected</>
                  )}
                </div>
              </div>
            </div>

            {/* Total Payroll */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Payroll</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.totalPayrollAmount)}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm text-gray-600">
                  <Users className="h-4 w-4 mr-1" />
                  {metrics.totalEmployees} employees
                </div>
              </div>
            </div>

            {/* Variance Count */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Variances Detected</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.varianceCount}</p>
                </div>
                <div className={`p-3 rounded-full ${
                  metrics.varianceCount === 0 ? 'bg-green-100' :
                  metrics.varianceCount <= 5 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <AlertTriangle className={`h-6 w-6 ${
                    metrics.varianceCount === 0 ? 'text-green-600' :
                    metrics.varianceCount <= 5 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  {metrics.varianceCount === 0 ? (
                    <><CheckCircle className="h-4 w-4 text-green-500 mr-1" /> No variances</>
                  ) : (
                    <><AlertCircle className="h-4 w-4 text-yellow-500 mr-1" /> Review required</>
                  )}
                </div>
              </div>
            </div>

            {/* Compliance Score */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Compliance Score</p>
                  <p className="text-2xl font-bold text-gray-900">{formatPercent(metrics.complianceScore)}</p>
                </div>
                <div className={`p-3 rounded-full ${
                  metrics.complianceScore >= 95 ? 'bg-green-100' :
                  metrics.complianceScore >= 85 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <Shield className={`h-6 w-6 ${
                    metrics.complianceScore >= 95 ? 'text-green-600' :
                    metrics.complianceScore >= 85 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  {metrics.complianceScore >= 95 ? (
                    <><CheckCircle className="h-4 w-4 text-green-500 mr-1" /> Fully compliant</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" /> Review compliance</>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {[
                { id: 'overview', name: 'Overview', icon: BarChart3 },
                { id: 'scenarios', name: 'Scenario Testing', icon: Calculator },
                { id: 'journal', name: 'Journal Preview', icon: FileText },
                { id: 'reconciliation', name: 'Reconciliation', icon: Scale },
                { id: 'compliance', name: 'Compliance', icon: Shield },
                { id: 'liabilities', name: 'Liabilities', icon: CreditCard },
                { id: 'allocations', name: 'Allocations', icon: Building }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <tab.icon className="h-4 w-4" />
                    <span>{tab.name}</span>
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Integration Status</h3>
              {integrationSummary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 ${
                      integrationSummary.integrationStatus === 'ready' ? 'bg-green-100' :
                      integrationSummary.integrationStatus === 'in_progress' ? 'bg-yellow-100' : 'bg-red-100'
                    }`}>
                      {integrationSummary.integrationStatus === 'ready' ? (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      ) : integrationSummary.integrationStatus === 'in_progress' ? (
                        <Clock className="h-8 w-8 text-yellow-600" />
                      ) : (
                        <XCircle className="h-8 w-8 text-red-600" />
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900">Status</h4>
                    <p className="text-sm text-gray-600 capitalize">{integrationSummary.integrationStatus.replace('_', ' ')}</p>
                  </div>
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-2">
                      <FileCheck className="h-8 w-8 text-blue-600" />
                    </div>
                    <h4 className="font-medium text-gray-900">Journal Entries</h4>
                    <p className="text-sm text-gray-600">{integrationSummary.summary.journalEntriesGenerated} generated</p>
                  </div>
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 mb-2">
                      <AlertTriangle className="h-8 w-8 text-purple-600" />
                    </div>
                    <h4 className="font-medium text-gray-900">Issues</h4>
                    <p className="text-sm text-gray-600">{integrationSummary.summary.variancesDetected} detected</p>
                  </div>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {integrationSummary?.recommendations && integrationSummary.recommendations.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
                <div className="space-y-3">
                  {integrationSummary.recommendations.map((recommendation, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
                      <Info className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">{recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {integrationSummary?.nextSteps && integrationSummary.nextSteps.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Next Steps</h3>
                <div className="space-y-3">
                  {integrationSummary.nextSteps.map((step, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <ArrowUpRight className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-gray-900">{step}</span>
                      </div>
                      <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                        View Details →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Scenario Testing Results</h3>
              {scenarioResults && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-900">{scenarioResults.summary.totalScenarios}</div>
                      <div className="text-sm text-blue-700">Total Scenarios</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-900">{scenarioResults.summary.passedScenarios}</div>
                      <div className="text-sm text-green-700">Passed</div>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-900">{scenarioResults.summary.failedScenarios}</div>
                      <div className="text-sm text-red-700">Failed</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-900">{formatPercent(scenarioResults.summary.overallPassRate)}</div>
                      <div className="text-sm text-purple-700">Pass Rate</div>
                    </div>
                  </div>

                  {scenarioResults.summary.criticalFailures.length > 0 && (
                    <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                      <h4 className="font-medium text-red-900 mb-2">Critical Failures</h4>
                      <ul className="space-y-2">
                        {scenarioResults.summary.criticalFailures.map((failure, index) => (
                          <li key={index} className="flex items-start space-x-2 text-sm text-red-800">
                            <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{failure}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="space-y-6">
            {journalPreview && (
              <>
                {/* Journal Summary */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Journal Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Total Debits</div>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(journalPreview.summary.totalDebits)}</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Total Credits</div>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(journalPreview.summary.totalCredits)}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm text-blue-600">Total Lines</div>
                      <div className="text-lg font-bold text-blue-900">{journalPreview.lines.length}</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-sm text-green-600">Status</div>
                      <div className="text-lg font-bold text-green-900 capitalize">{journalPreview.status}</div>
                    </div>
                  </div>
                </div>

                {/* Journal Lines Table */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Journal Entry Lines</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Component</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {journalPreview.lines.map((line, index) => (
                          <tr key={line.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div>
                                <div className="font-medium">{line.accountCode}</div>
                                <div className="text-gray-500">{line.accountName}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{line.description}</td>
                            <td className="px-6 py-4 text-sm text-right text-gray-900">
                              {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-right text-gray-900">
                              {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {line.payrollComponent.type}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'reconciliation' && (
          <div className="space-y-6">
            {reconciliationResult && (
              <>
                {/* Reconciliation Summary */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Confidence Score</div>
                      <div className="text-lg font-bold text-gray-900">{formatPercent(reconciliationResult.confidenceScore)}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm text-blue-600">Total Transactions</div>
                      <div className="text-lg font-bold text-blue-900">{reconciliationResult.summary.totalPayrollTransactions}</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-sm text-green-600">Reconciled</div>
                      <div className="text-lg font-bold text-green-900">{reconciliationResult.summary.reconciledTransactions}</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <div className="text-sm text-red-600">Variances</div>
                      <div className="text-lg font-bold text-red-900">{reconciliationResult.summary.varianceTransactions}</div>
                    </div>
                  </div>
                </div>

                {/* Balancing Checks */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Balancing Checks</h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {reconciliationResult.balancingChecks.map((check, index) => (
                        <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                          <div className="flex items-center space-x-3">
                            {check.passed ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                            <div>
                              <div className="font-medium text-gray-900">{check.description}</div>
                              <div className="text-sm text-gray-600">{check.details}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${
                              check.passed ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {check.passed ? 'Passed' : 'Failed'}
                            </div>
                            <div className="text-sm text-gray-500">
                              Variance: {formatCurrency(check.variance)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-6">
            {liabilitySummary && (
              <>
                {/* Compliance Overview */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Statutory Compliance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                      {liabilitySummary.statutoryCompliance.nisCompliance ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">NIS Compliance</div>
                        <div className="text-sm text-gray-600">
                          {liabilitySummary.statutoryCompliance.nisCompliance ? 'Compliant' : 'Non-compliant'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                      {liabilitySummary.statutoryCompliance.nhtCompliance ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">NHT Compliance</div>
                        <div className="text-sm text-gray-600">
                          {liabilitySummary.statutoryCompliance.nhtCompliance ? 'Compliant' : 'Non-compliant'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                      {liabilitySummary.statutoryCompliance.payeCompliance ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">PAYE Compliance</div>
                        <div className="text-sm text-gray-600">
                          {liabilitySummary.statutoryCompliance.payeCompliance ? 'Compliant' : 'Non-compliant'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                      {liabilitySummary.statutoryCompliance.educationTaxCompliance ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">Education Tax Compliance</div>
                        <div className="text-sm text-gray-600">
                          {liabilitySummary.statutoryCompliance.educationTaxCompliance ? 'Compliant' : 'Non-compliant'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                      {liabilitySummary.statutoryCompliance.minimumWageCompliance ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">Minimum Wage Compliance</div>
                        <div className="text-sm text-gray-600">
                          {liabilitySummary.statutoryCompliance.minimumWageCompliance ? 'Compliant' : 'Non-compliant'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {formatPercent(liabilitySummary.statutoryCompliance.overallComplianceScore)}
                        </div>
                        <div className="text-sm text-gray-600">Overall Score</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compliance Issues */}
                {liabilitySummary.statutoryCompliance.complianceIssues.length > 0 && (
                  <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Compliance Issues</h3>
                    </div>
                    <div className="p-6">
                      <div className="space-y-3">
                        {liabilitySummary.statutoryCompliance.complianceIssues.map((issue, index) => (
                          <div key={index} className="flex items-start space-x-3 p-4 bg-red-50 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="font-medium text-red-900">{issue.type}</div>
                              <div className="text-sm text-red-800">{issue.description}</div>
                              <div className="text-sm text-red-700 mt-1">Recommended: {issue.recommendedAction}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'liabilities' && (
          <div className="space-y-6">
            {liabilitySummary && (
              <>
                {/* Liability Summary */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Liability Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-red-50 rounded-lg">
                      <div className="text-sm text-red-600">Total Liabilities</div>
                      <div className="text-lg font-bold text-red-900">{formatCurrency(liabilitySummary.totalLiabilities)}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm text-blue-600">Employer Contributions</div>
                      <div className="text-lg font-bold text-blue-900">{formatCurrency(liabilitySummary.totalEmployerContributions)}</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-sm text-green-600">Liability Types</div>
                      <div className="text-lg font-bold text-green-900">{liabilitySummary.liabilities.length}</div>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <div className="text-sm text-purple-600">Next 7 Days</div>
                      <div className="text-lg font-bold text-purple-900">{formatCurrency(liabilitySummary.cashFlowProjection.nextSevenDays)}</div>
                    </div>
                  </div>
                </div>

                {/* Liabilities Table */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Liability Details</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {liabilitySummary.liabilities.map((liability, index) => (
                          <tr key={liability.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                {liability.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{liability.description}</td>
                            <td className="px-6 py-4 text-sm text-right text-gray-900">{formatCurrency(liability.amount)}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">{formatDateTime(liability.dueDate)}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                liability.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                                liability.paymentStatus === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                                liability.paymentStatus === 'overdue' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {liability.paymentStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'allocations' && (
          <div className="space-y-6">
            {projectAllocations.length > 0 && (
              <>
                {/* Allocation Summary */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Cost Allocations</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {projectAllocations.map((allocation, index) => (
                      <div key={allocation.id} className="p-4 bg-blue-50 rounded-lg">
                        <div className="text-sm text-blue-600">{allocation.projectName}</div>
                        <div className="text-lg font-bold text-blue-900">{formatCurrency(allocation.totalAllocatedCost)}</div>
                        <div className="text-sm text-blue-700">{allocation.allocations.length} employees</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Allocation Details */}
                {projectAllocations.map((allocation) => (
                  <div key={allocation.id} className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">{allocation.projectName} - Employee Allocations</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Regular Hours</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Overtime Hours</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Pay</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Allocation %</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Allocated Amount</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {allocation.allocations.map((empAlloc, index) => (
                            <tr key={empAlloc.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                <div>
                                  <div className="font-medium">{empAlloc.employeeName}</div>
                                  <div className="text-gray-500">{empAlloc.department}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-right text-gray-900">{empAlloc.regularHours}</td>
                              <td className="px-6 py-4 text-sm text-right text-gray-900">{empAlloc.overtimeHours}</td>
                              <td className="px-6 py-4 text-sm text-right text-gray-900">{formatCurrency(empAlloc.totalPay)}</td>
                              <td className="px-6 py-4 text-sm text-right text-gray-900">{formatPercent(empAlloc.allocationPercentage)}</td>
                              <td className="px-6 py-4 text-sm text-right text-gray-900">{formatCurrency(empAlloc.allocatedAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
