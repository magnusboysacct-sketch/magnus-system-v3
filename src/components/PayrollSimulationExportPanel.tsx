// Payroll Simulation Export Panel - Phase 3E
// Comprehensive simulation export and reporting component
// PHASE 3E PAYROLL SIMULATION ONLY — SHADOW SAFE

import React, { useState, useEffect } from "react";
import {
  Download,
  DownloadCloud,
  FileText,
  FileSpreadsheet,
  File,
  Mail,
  Share,
  Database,
  HardDrive,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Settings,
  Eye,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  PieChart,
  LineChart,
  FileSearch,
  FileCheck,
  FileX,
  Printer,
  Send,
  Link,
  Copy,
  Trash2,
  Archive,
  Folder,
  FolderOpen,
  Grid,
  List,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Zap,
  Shield,
  Target,
  Package,
  Truck,
  Building,
  Briefcase,
  CreditCard,
  Receipt,
  Users,
  Calculator,
  Scale,
  TrendingUp,
  TrendingDown,
  Activity,
  Cpu,
  Wifi,
  Globe,
  Lock,
  Unlock,
  EyeOff,
  FilePlus,
  FileDown,
  FileUp,
  FileOutput,
  FileArchive,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileText as FileTextIcon
} from "lucide-react";
import { payrollSimulationEngine, exportSimulationResults } from "../lib/payrollSimulationExecution";
import type {
  PayrollSimulationRun,
  PayrollSimulationResult,
  PayrollSimulationExport,
  PayrollExportContent,
  PayrollExportMetadata
} from "../lib/payrollSimulationExecution";

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

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface PayrollSimulationExportPanelProps {
  companyId: string;
  payrollPeriodId: string;
  simulationId?: string;
  onExportComplete?: (simulationExport: PayrollSimulationExport) => void;
  readOnly?: boolean;
}

export default function PayrollSimulationExportPanel({
  companyId,
  payrollPeriodId,
  simulationId,
  onExportComplete,
  readOnly = false
}: PayrollSimulationExportPanelProps) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exports, setExports] = useState<PayrollSimulationExport[]>([]);
  const [selectedExport, setSelectedExport] = useState<PayrollSimulationExport | null>(null);
  const [exportConfig, setExportConfig] = useState({
    exportType: 'full_report' as 'full_report' | 'summary' | 'detailed_results' | 'comparison' | 'variance' | 'audit' | 'metrics',
    format: 'pdf' as 'pdf' | 'excel' | 'csv' | 'json',
    includeCharts: true,
    includeAttachments: true,
    compression: 'none' as 'none' | 'zip' | 'gzip',
    deliveryMethod: 'download' as 'download' | 'email' | 'api' | 'storage',
    recipients: [] as string[],
    retention: '90_days' as '7_days' | '30_days' | '90_days' | '1_year'
  });
  const [showPreview, setShowPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Load export history
  useEffect(() => {
    async function loadExportHistory() {
      try {
        setLoading(true);
        
        // Mock export data (in real implementation, would fetch from database)
        const mockExports: PayrollSimulationExport[] = [
          {
            id: 'export_001',
            simulationId: simulationId || 'sim_001',
            exportType: 'full_report',
            format: 'pdf',
            status: 'completed',
            content: {
              summary: {
                simulationInfo: {
                  id: 'sim_001',
                  type: 'comprehensive_simulation',
                  executedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                  duration: 30 * 60 * 1000
                },
                executionSummary: {
                  totalWorkers: 100,
                  successfulWorkers: 98,
                  failedWorkers: 2,
                  totalAmount: 250000,
                  accuracy: 94.7
                },
                keyFindings: [
                  '2 workers failed due to data validation errors',
                  'Overall accuracy improved by 2.3% from previous run',
                  'No critical compliance issues detected'
                ],
                recommendations: [
                  'Review data validation rules for failed workers',
                  'Consider updating overtime calculation logic',
                  'Maintain current compliance framework'
                ],
                complianceStatus: {
                  overallScore: 95,
                  statutoryCompliance: true,
                  issues: []
                }
              },
              results: {
                workerResults: [],
                scenarioResults: [],
                accountingResults: [],
                reconciliationResults: [],
                liabilityResults: []
              },
              comparisons: {
                baselineComparisons: [],
                varianceAnalysis: [],
                trendAnalysis: [],
                accuracyAnalysis: []
              },
              variances: {
                varianceSummary: {
                  totalVariances: 5,
                  significantVariances: 2,
                  criticalVariances: 0
                },
                varianceDetails: [],
                varianceAnalysis: [],
                varianceResolution: []
              },
              audit: {
                auditSummary: {
                  overallScore: 92,
                  criticalFindings: 0,
                  highRiskFindings: 1
                },
                findings: [],
                recommendations: [],
                compliance: {
                  overallScore: 95,
                  statutoryCompliance: 96
                }
              },
              metrics: {
                performanceMetrics: {
                  totalDuration: 30 * 60 * 1000,
                  averageWorkerTime: 18 * 1000,
                  throughput: 3.33
                },
                accuracyMetrics: {
                  overallAccuracy: 94.7,
                  calculationAccuracy: 96.2,
                  complianceAccuracy: 95.8
                },
                complianceMetrics: {
                  overallComplianceScore: 95,
                  statutoryComplianceScore: 96,
                  complianceIssues: 2
                },
                qualityMetrics: {
                  overallQualityScore: 93,
                  dataQualityScore: 95,
                  calculationQualityScore: 94
                }
              },
              attachments: []
            },
            metadata: {
              exportedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              exportedBy: 'user_001',
              exportVersion: '1.0',
              dataVersion: '1.0',
              format: 'pdf',
              size: 2048576, // 2MB
              checksum: 'abc123def456',
              retention: '90_days'
            },
            delivery: {
              method: 'download',
              downloadUrl: '/api/simulations/sim_001/exports/export_001/download',
              deliveryAttempts: 1,
              deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            }
          },
          {
            id: 'export_002',
            simulationId: simulationId || 'sim_002',
            exportType: 'detailed_results',
            format: 'excel',
            status: 'completed',
            content: {
              summary: {
                simulationInfo: {
                  id: 'sim_002',
                  type: 'scenario_testing',
                  executedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                  duration: 18 * 60 * 1000
                },
                executionSummary: {
                  totalWorkers: 50,
                  successfulWorkers: 50,
                  failedWorkers: 0,
                  totalAmount: 125000,
                  accuracy: 98.2
                },
                keyFindings: [
                  'All scenario tests passed successfully',
                  'No variances detected in edge cases',
                  'Compliance validation 100% successful'
                ],
                recommendations: [
                  'Scenario testing framework is working optimally',
                  'Consider expanding test coverage',
                  'Document successful test patterns'
                ],
                complianceStatus: {
                  overallScore: 98,
                  statutoryCompliance: true,
                  issues: []
                }
              },
              results: {
                workerResults: [],
                scenarioResults: [],
                accountingResults: [],
                reconciliationResults: [],
                liabilityResults: []
              },
              comparisons: {
                baselineComparisons: [],
                varianceAnalysis: [],
                trendAnalysis: [],
                accuracyAnalysis: []
              },
              variances: {
                varianceSummary: {
                  totalVariances: 0,
                  significantVariances: 0,
                  criticalVariances: 0
                },
                varianceDetails: [],
                varianceAnalysis: [],
                varianceResolution: []
              },
              audit: {
                auditSummary: {
                  overallScore: 98,
                  criticalFindings: 0,
                  highRiskFindings: 0
                },
                findings: [],
                recommendations: [],
                compliance: {
                  overallScore: 98,
                  statutoryCompliance: 98
                }
              },
              metrics: {
                performanceMetrics: {
                  totalDuration: 18 * 60 * 1000,
                  averageWorkerTime: 21.6 * 1000,
                  throughput: 2.78
                },
                accuracyMetrics: {
                  overallAccuracy: 98.2,
                  calculationAccuracy: 99.1,
                  complianceAccuracy: 98.5
                },
                complianceMetrics: {
                  overallComplianceScore: 98,
                  statutoryComplianceScore: 98,
                  complianceIssues: 0
                },
                qualityMetrics: {
                  overallQualityScore: 97,
                  dataQualityScore: 98,
                  calculationQualityScore: 99
                }
              },
              attachments: []
            },
            metadata: {
              exportedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              exportedBy: 'user_002',
              exportVersion: '1.0',
              dataVersion: '1.0',
              format: 'excel',
              size: 3145728, // 3MB
              checksum: 'def456ghi789',
              retention: '90_days'
            },
            delivery: {
              method: 'email',
              recipients: ['manager@company.com'],
              emailStatus: 'sent',
              deliveryAttempts: 1,
              deliveredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            }
          },
          {
            id: 'export_003',
            simulationId: simulationId || 'sim_003',
            exportType: 'variance',
            format: 'csv',
            status: 'generating',
            content: {
              summary: {
                simulationInfo: {
                  id: simulationId,
                  type: 'summary',
                  executedAt: new Date().toISOString(),
                  duration: 0
                },
                executionSummary: {
                  totalWorkers: 0,
                  successfulWorkers: 0,
                  failedWorkers: 0,
                  totalAmount: 0,
                  accuracy: 0
                },
                keyFindings: [],
                recommendations: [],
                complianceStatus: {
                  overallScore: 0,
                  statutoryCompliance: true,
                  issues: []
                }
              },
              results: {
                workerResults: [],
                scenarioResults: [],
                accountingResults: [],
                reconciliationResults: [],
                liabilityResults: []
              },
              comparisons: {
                baselineComparisons: [],
                varianceAnalysis: [],
                trendAnalysis: [],
                accuracyAnalysis: []
              },
              variances: {
                varianceSummary: {
                  totalVariances: 8,
                  significantVariances: 3,
                  criticalVariances: 1
                },
                varianceDetails: [],
                varianceAnalysis: [],
                varianceResolution: []
              },
              audit: {
                auditSummary: {
                  overallScore: 88,
                  criticalFindings: 1,
                  highRiskFindings: 2
                },
                findings: [],
                recommendations: [],
                compliance: {
                  overallScore: 88,
                  statutoryCompliance: 90
                }
              },
              metrics: {
                performanceMetrics: {
                  totalDuration: 22 * 60 * 1000,
                  averageWorkerTime: 26.4 * 1000,
                  throughput: 2.27
                },
                accuracyMetrics: {
                  overallAccuracy: 91.5,
                  calculationAccuracy: 93.2,
                  complianceAccuracy: 92.8
                },
                complianceMetrics: {
                  overallComplianceScore: 88,
                  statutoryComplianceScore: 90,
                  complianceIssues: 5
                },
                qualityMetrics: {
                  overallQualityScore: 89,
                  dataQualityScore: 91,
                  calculationQualityScore: 93
                }
              },
              attachments: []
            },
            metadata: {
              exportedAt: new Date().toISOString(),
              exportedBy: 'user_003',
              exportVersion: '1.0',
              dataVersion: '1.0',
              format: 'csv',
              size: 1048576, // 1MB
              checksum: 'ghi789jkl012',
              retention: '90_days'
            },
            delivery: {
              method: 'download',
              deliveryAttempts: 0
            }
          }
        ];
        
        setExports(mockExports);
      } catch (error) {
        console.error("Error loading export history:", error);
      } finally {
        setLoading(false);
      }
    }

    loadExportHistory();
  }, [companyId, payrollPeriodId, simulationId]);

  // Execute export
  const executeExport = async () => {
    if (!simulationId) {
      alert('Please select a simulation to export');
      return;
    }

    try {
      setExporting(true);
      
      const simulationExport = await exportSimulationResults(
        simulationId,
        exportConfig.exportType,
        exportConfig.format,
        'current_user'
      );
      
      // Add to exports list
      setExports(prev => [simulationExport, ...prev]);
      
      if (onExportComplete) {
        onExportComplete(simulationExport);
      }
      
      setSelectedExport(simulationExport);
    } catch (error: any) {
      console.error("Error exporting:", error);
      alert('Export failed: ' + (error?.message || String(error)));
    } finally {
      setExporting(false);
    }
  };

  // Download export
  const downloadExport = (exportItem: PayrollSimulationExport) => {
    if (exportItem.delivery.downloadUrl) {
      const link = document.createElement('a');
      link.href = exportItem.delivery.downloadUrl;
      link.download = `${exportItem.id}.${exportItem.metadata.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Filter exports
  const filteredExports = exports.filter(exportItem => {
    const matchesSearch = searchTerm === "" || 
                         exportItem.exportType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exportItem.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || exportItem.status === filterStatus;
    const matchesType = filterType === "all" || exportItem.exportType === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading export history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Export Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Export Configuration</h3>
            <p className="text-sm text-gray-600">Configure and generate simulation exports</p>
          </div>
          <div className="flex items-center space-x-2">
            <Download className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Shadow Safe Export</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Export Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Export Type</label>
            <select
              value={exportConfig.exportType}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                exportType: e.target.value as any
              }))}
              disabled={exporting || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="full_report">Full Report</option>
              <option value="summary">Summary Only</option>
              <option value="detailed_results">Detailed Results</option>
              <option value="comparison">Comparison Data</option>
              <option value="variance">Variance Analysis</option>
              <option value="audit">Audit Trail</option>
              <option value="metrics">Performance Metrics</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Select the type of export to generate</p>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <select
              value={exportConfig.format}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                format: e.target.value as any
              }))}
              disabled={exporting || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pdf">PDF Document</option>
              <option value="excel">Excel Spreadsheet</option>
              <option value="csv">CSV Data</option>
              <option value="json">JSON Data</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Choose the export format</p>
          </div>

          {/* Delivery Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Method</label>
            <select
              value={exportConfig.deliveryMethod}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                deliveryMethod: e.target.value as any
              }))}
              disabled={exporting || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="download">Direct Download</option>
              <option value="email">Email Delivery</option>
              <option value="api">API Access</option>
              <option value="storage">Cloud Storage</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">How to receive the export</p>
          </div>
        </div>

        {/* Additional Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Email Recipients */}
          {exportConfig.deliveryMethod === 'email' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Recipients</label>
              <input
                type="text"
                placeholder="Enter email addresses (comma separated)"
                value={exportConfig.recipients.join(', ')}
                onChange={(e) => setExportConfig(prev => ({
                  ...prev,
                  recipients: e.target.value.split(',').map(email => email.trim()).filter(email => email)
                }))}
                disabled={exporting || readOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas</p>
            </div>
          )}

          {/* Compression */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Compression</label>
            <select
              value={exportConfig.compression}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                compression: e.target.value as any
              }))}
              disabled={exporting || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">No Compression</option>
              <option value="zip">ZIP Archive</option>
              <option value="gzip">GZIP Compression</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Reduce file size for large exports</p>
          </div>

          {/* Retention */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Retention Period</label>
            <select
              value={exportConfig.retention}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                retention: e.target.value as any
              }))}
              disabled={exporting || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7_days">7 Days</option>
              <option value="30_days">30 Days</option>
              <option value="90_days">90 Days</option>
              <option value="1_year">1 Year</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">How long to keep the export available</p>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={exportConfig.includeCharts}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                includeCharts: e.target.checked
              }))}
              disabled={exporting || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Include Charts</div>
              <div className="text-xs text-gray-500">Add visual charts and graphs</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={exportConfig.includeAttachments}
              onChange={(e) => setExportConfig(prev => ({
                ...prev,
                includeAttachments: e.target.checked
              }))}
              disabled={exporting || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Include Attachments</div>
              <div className="text-xs text-gray-500">Include supporting documents</div>
            </div>
          </label>
        </div>

        {/* Export Button */}
        <div className="mt-6 flex items-center space-x-3">
          <button
            onClick={executeExport}
            disabled={!simulationId || exporting || readOnly}
            className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generating Export...</span>
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                <span>Generate Export</span>
              </>
            )}
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200"
          >
            <Eye className="h-5 w-5" />
            <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
          </button>
        </div>
      </div>

      {/* Export Preview */}
      {showPreview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Preview</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Content Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Export Type:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {exportConfig.exportType.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Format:</span>
                  <span className="font-medium text-gray-900 uppercase">
                    {exportConfig.format}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Compression:</span>
                  <span className="font-medium text-gray-900 uppercase">
                    {exportConfig.compression}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Retention:</span>
                  <span className="font-medium text-gray-900">
                    {exportConfig.retention.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Delivery Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Method:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {exportConfig.deliveryMethod}
                  </span>
                </div>
                {exportConfig.deliveryMethod === 'email' && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Recipients:</span>
                    <span className="font-medium text-gray-900">
                      {exportConfig.recipients.length} recipient{exportConfig.recipients.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Include Charts:</span>
                  <span className="font-medium text-gray-900">
                    {exportConfig.includeCharts ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Include Attachments:</span>
                  <span className="font-medium text-gray-900">
                    {exportConfig.includeAttachments ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Export History ({filteredExports.length})
            </h3>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search exports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="generating">Generating</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="full_report">Full Report</option>
                <option value="summary">Summary</option>
                <option value="detailed_results">Detailed Results</option>
                <option value="comparison">Comparison</option>
                <option value="variance">Variance</option>
                <option value="audit">Audit</option>
                <option value="metrics">Metrics</option>
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredExports.map((exportItem) => (
            <div key={exportItem.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="text-md font-medium text-gray-900">
                      {exportItem.exportType.replace('_', ' ').toUpperCase()} Export
                    </h4>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      exportItem.status === 'completed' ? 'bg-green-100 text-green-800' :
                      exportItem.status === 'generating' ? 'bg-blue-100 text-blue-800' :
                      exportItem.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {exportItem.status}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {exportItem.metadata.format.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Exported</div>
                      <div className="font-medium text-gray-900">
                        {formatDateTime(exportItem.metadata.exportedAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">File Size</div>
                      <div className="font-medium text-gray-900">
                        {formatFileSize(exportItem.metadata.size)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Method</div>
                      <div className="font-medium text-gray-900 capitalize">
                        {exportItem.delivery.method}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Retention</div>
                      <div className="font-medium text-gray-900">
                        {exportItem.metadata.retention.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Delivery Status */}
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      {exportItem.delivery.method === 'download' && <Download className="h-4 w-4 text-blue-600" />}
                      {exportItem.delivery.method === 'email' && <Mail className="h-4 w-4 text-green-600" />}
                      {exportItem.delivery.method === 'api' && <Globe className="h-4 w-4 text-purple-600" />}
                      {exportItem.delivery.method === 'storage' && <HardDrive className="h-4 w-4 text-orange-600" />}
                      
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {exportItem.delivery.method === 'download' && 'Ready for download'}
                          {exportItem.delivery.method === 'email' && 
                            (exportItem.delivery.emailStatus === 'sent' ? 'Email sent successfully' : 'Email pending')
                          }
                          {exportItem.delivery.method === 'api' && 'Available via API'}
                          {exportItem.delivery.method === 'storage' && 'Stored in cloud'}
                        </div>
                        {exportItem.delivery.recipients && exportItem.delivery.recipients.length > 0 && (
                          <div className="text-xs text-gray-600">
                            Sent to: {exportItem.delivery.recipients.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => setSelectedExport(exportItem)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {exportItem.status === 'completed' && exportItem.delivery.downloadUrl && (
                    <button
                      onClick={() => downloadExport(exportItem)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  <button className="text-gray-600 hover:text-gray-700">
                    <Share className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredExports.length === 0 && (
          <div className="p-12 text-center">
            <Download className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h5 className="text-lg font-medium text-gray-900 mb-2">No exports found</h5>
            <p className="text-sm text-gray-600">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                ? 'Try adjusting your search or filters'
                : 'No exports have been generated yet'
              }
            </p>
          </div>
        )}
      </div>

      {/* Selected Export Details */}
      {selectedExport && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Export Details</h3>
              <button
                onClick={() => setSelectedExport(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Export Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Export ID</span>
                    <span className="font-medium text-gray-900">{selectedExport.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type</span>
                    <span className="font-medium text-gray-900 capitalize">
                      {selectedExport.exportType.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Format</span>
                    <span className="font-medium text-gray-900 uppercase">
                      {selectedExport.metadata.format}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span className="font-medium text-gray-900 capitalize">
                      {selectedExport.status}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Content Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">File Size</span>
                    <span className="font-medium text-gray-900">
                      {formatFileSize(selectedExport.metadata.size)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Version</span>
                    <span className="font-medium text-gray-900">
                      {selectedExport.metadata.exportVersion}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data Version</span>
                    <span className="font-medium text-gray-900">
                      {selectedExport.metadata.dataVersion}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Checksum</span>
                    <span className="font-medium text-gray-900 font-mono text-xs">
                      {selectedExport.metadata.checksum}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center space-x-3">
              {selectedExport.status === 'completed' && selectedExport.delivery.downloadUrl && (
                <button
                  onClick={() => downloadExport(selectedExport)}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </button>
              )}
              <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                <Share className="h-4 w-4" />
                <span>Share</span>
              </button>
              <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                <Copy className="h-4 w-4" />
                <span>Copy Link</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
