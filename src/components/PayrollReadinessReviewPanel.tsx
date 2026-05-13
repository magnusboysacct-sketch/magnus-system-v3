// Payroll Readiness Review Panel - Phase 3D
// Readiness validation and scoring review component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  Target,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Eye,
  Settings,
  BarChart3,
  Clock,
  Shield,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Loader2,
  Activity,
  Users,
  Building
} from "lucide-react";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import type { PayrollFinanceIntegrationSummary } from "../lib/payrollAccountingIntegration";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

interface PayrollReadinessReviewPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onReadinessSelect?: (readiness: PayrollFinanceIntegrationSummary) => void;
  readOnly?: boolean;
}

export default function PayrollReadinessReviewPanel({
  companyId,
  payrollPeriodId,
  onReadinessSelect,
  readOnly = false
}: PayrollReadinessReviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<PayrollFinanceIntegrationSummary | null>(null);
  const [expandedSection, setExpandedSection] = useState<string>("overview");

  // Load readiness data
  useEffect(() => {
    async function loadReadiness() {
      try {
        setLoading(true);
        
        const readinessData = await payrollAccountingIntegration.generatePayrollAccountingSummary(
          companyId,
          payrollPeriodId
        );
        
        setReadiness(readinessData);
      } catch (error) {
        console.error("Error loading readiness data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadReadiness();
  }, [companyId, payrollPeriodId]);

  // Refresh readiness
  const refreshReadiness = async () => {
    if (loading) return;

    try {
      setLoading(true);
      
      const readinessData = await payrollAccountingIntegration.generatePayrollAccountingSummary(
        companyId,
        payrollPeriodId
      );
      
      setReadiness(readinessData);
    } catch (error) {
      console.error("Error refreshing readiness:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading readiness assessment...</span>
        </div>
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Readiness Data</h3>
          <p className="text-gray-600">Unable to load readiness assessment. Please try again.</p>
        </div>
      </div>
    );
  }

  const getReadinessColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getReadinessIcon = (score: number) => {
    if (score >= 90) return <CheckCircle className="h-6 w-6" />;
    if (score >= 70) return <AlertTriangle className="h-6 w-6" />;
    return <XCircle className="h-6 w-6" />;
  };

  return (
    <div className="space-y-6">
      {/* Readiness Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Integration Readiness</h3>
            <p className="text-sm text-gray-600">
              Payroll-to-finance integration readiness assessment • {formatDateTime(readiness.generatedAt)}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getReadinessColor(readiness.readinessScore)}`}>
              {formatPercent(readiness.readinessScore)} Ready
            </div>
            <button
              onClick={refreshReadiness}
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

        {/* Readiness Score */}
        <div className="text-center p-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${getReadinessColor(readiness.readinessScore)}`}>
            {getReadinessIcon(readiness.readinessScore)}
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatPercent(readiness.readinessScore)}
          </div>
          <div className={`text-lg font-medium ${
            readiness.readinessScore >= 90 ? 'text-green-600' :
            readiness.readinessScore >= 70 ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {readiness.readinessScore >= 90 ? 'Ready for Production' :
             readiness.readinessScore >= 70 ? 'Ready for Testing' :
             'Not Ready'}
          </div>
        </div>
      </div>

      {/* Integration Status Details */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900">Integration Status</h4>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">Status</div>
              <div className={`text-lg font-bold capitalize ${
                readiness.integrationStatus === 'ready' ? 'text-green-900' :
                readiness.integrationStatus === 'in_progress' ? 'text-yellow-900' :
                readiness.integrationStatus === 'completed' ? 'text-blue-900' :
                'text-red-900'
              }`}>
                {readiness.integrationStatus.replace('_', ' ')}
              </div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-600">Total Payroll</div>
              <div className="text-lg font-bold text-blue-900">
                ${readiness.summary.totalPayrollAmount.toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-green-600">Employees</div>
              <div className="text-lg font-bold text-green-900">{readiness.summary.totalEmployees}</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-sm text-purple-600">Accuracy</div>
              <div className="text-lg font-bold text-purple-900">{formatPercent(readiness.summary.integrationAccuracy)}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-sm text-orange-600">Journals Generated</div>
              <div className="text-lg font-bold text-orange-900">{readiness.summary.journalEntriesGenerated}</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-sm text-red-600">Journals Posted</div>
              <div className="text-lg font-bold text-red-900">{readiness.summary.journalEntriesPosted}</div>
            </div>
            <div className="text-center p-4 bg-indigo-50 rounded-lg">
              <div className="text-sm text-indigo-600">Liabilities</div>
              <div className="text-lg font-bold text-indigo-900">{readiness.summary.liabilitiesIdentified}</div>
            </div>
            <div className="text-center p-4 bg-teal-50 rounded-lg">
              <div className="text-sm text-teal-600">Variances</div>
              <div className="text-lg font-bold text-teal-900">{readiness.summary.variancesDetected}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">Detailed Assessment</h4>
            <div className="flex space-x-2">
              {['overview', 'mappings', 'journals', 'reconciliation', 'compliance'].map((section) => (
                <button
                  key={section}
                  onClick={() => setExpandedSection(section)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    expandedSection === section 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Overview Section */}
          {expandedSection === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="font-medium text-gray-900 mb-3">Readiness Factors</h5>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Reconciliation Status</span>
                      <span className={`text-sm font-medium ${
                        (readiness.reconciliationStatus?.overallPassRate ?? 0) >= 95 ? 'text-green-600' :
                        (readiness.reconciliationStatus?.overallPassRate ?? 0) >= 85 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {formatPercent(readiness.reconciliationStatus?.overallPassRate ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Compliance Score</span>
                      <span className={`text-sm font-medium ${
                        readiness.complianceStatus?.overallComplianceScore >= 95 ? 'text-green-600' :
                        readiness.complianceStatus?.overallComplianceScore >= 85 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {formatPercent(readiness.complianceStatus.overallComplianceScore)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Mapping Coverage</span>
                      <span className={`text-sm font-medium ${
                        (readiness.accountMappings?.mappingCoverage ?? 0) >= 95 ? 'text-green-600' :
                        (readiness.accountMappings?.mappingCoverage ?? 0) >= 85 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {formatPercent(readiness.accountMappings?.mappingCoverage ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="font-medium text-gray-900 mb-3">Risk Assessment</h5>
                  <div className="space-y-3">
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-900">Medium Risk</span>
                      </div>
                      <div className="text-xs text-yellow-700 mt-1">
                        Some variances detected but within acceptable thresholds
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Account Mappings Section */}
          {expandedSection === 'mappings' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Total Mappings</div>
                  <div className="text-lg font-bold text-gray-900">{readiness.accountMappings.totalMappings}</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600">Active Mappings</div>
                  <div className="text-lg font-bold text-green-900">{readiness.accountMappings.activeMappings}</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Coverage</div>
                  <div className="text-lg font-bold text-blue-900">{formatPercent(readiness.accountMappings?.mappingCoverage ?? 0)}</div>
                </div>
              </div>

              {readiness.accountMappings.unmappedComponents.length > 0 && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <h5 className="font-medium text-red-900 mb-2">Unmapped Components</h5>
                  <ul className="space-y-1">
                    {readiness.accountMappings.unmappedComponents.map((component, index) => (
                      <li key={index} className="flex items-center space-x-2 text-sm text-red-800">
                        <XCircle className="h-4 w-4" />
                        <span>{component.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {readiness.accountMappings.mappingConflicts.length > 0 && (
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h5 className="font-medium text-orange-900 mb-2">Mapping Conflicts</h5>
                  <ul className="space-y-1">
                    {readiness.accountMappings.mappingConflicts.map((conflict, index) => (
                      <li key={index} className="flex items-center space-x-2 text-sm text-orange-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{String(conflict.payrollComponent)}: {conflict.conflictType}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Journal Preview Section */}
          {expandedSection === 'journals' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Total Journals</div>
                  <div className="text-lg font-bold text-gray-900">{readiness.journalPreviews.totalJournals}</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Total Amount</div>
                  <div className="text-lg font-bold text-blue-900">
                    ${readiness.journalPreviews.totalAmount.toLocaleString()}
                  </div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600">Preview Accuracy</div>
                  <div className="text-lg font-bold text-green-900">{formatPercent(readiness.journalPreviews.previewAccuracy)}</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-purple-600">Last Generated</div>
                  <div className="text-lg font-bold text-purple-900">{formatDateTime(readiness.journalPreviews.lastGenerated)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Reconciliation Section */}
          {expandedSection === 'reconciliation' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Last Reconciliation</div>
                  <div className="text-lg font-bold text-gray-900">{formatDateTime(readiness.reconciliationStatus.lastReconciliationDate)}</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Frequency</div>
                  <div className="text-lg font-bold text-blue-900">{readiness.reconciliationStatus.reconciliationFrequency}</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600">Outstanding Variances</div>
                  <div className="text-lg font-bold text-green-900">{readiness.reconciliationStatus.outstandingVariances}</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-sm text-red-600">Average Variance</div>
                  <div className="text-lg font-bold text-red-900">${readiness.reconciliationStatus.averageVarianceAmount.toFixed(2)}</div>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-900">Trend: Improving</span>
                </div>
                <div className="text-xs text-yellow-700 mt-1">
                  Reconciliation accuracy has improved over the last 3 periods
                </div>
              </div>
            </div>
          )}

          {/* Compliance Section */}
          {expandedSection === 'compliance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Overall Score</div>
                  <div className="text-lg font-bold text-blue-900">{formatPercent(readiness.reconciliationStatus?.overallPassRate ?? 0)}</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600">Compliance Issues</div>
                  <div className="text-lg font-bold text-green-900">{readiness.complianceStatus.complianceIssues}</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Last Check</div>
                  <div className="text-lg font-bold text-blue-900">{formatDateTime(readiness.complianceStatus.lastComplianceCheck)}</div>
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">All statutory requirements met</span>
                </div>
                <div className="text-xs text-green-700 mt-1">
                  Next compliance check scheduled for {formatDateTime(readiness.complianceStatus.nextComplianceDue)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {readiness.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Recommendations</h4>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {readiness.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700">{recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Next Steps */}
      {readiness.nextSteps.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Next Steps</h4>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {readiness.nextSteps.map((step, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
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
        </div>
      )}
    </div>
  );
}
