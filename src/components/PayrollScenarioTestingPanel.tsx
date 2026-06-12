// Payroll Scenario Testing Panel - Phase 3D
// Scenario testing review and analysis component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BarChart3,
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Filter,
  Download,
  Eye,
  Settings,
  ChevronRight,
  Info,
  Loader2
} from "lucide-react";
import { jamaicanPayrollScenarioTester } from "../lib/jamaicanPayrollScenarioTesting";
import type {
  PayrollValidationSuite,
  PayrollScenarioProfile,
  PayrollScenarioResult,
  PayrollAccuracySummary
} from "../lib/jamaicanPayrollScenarioTesting";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

interface PayrollScenarioTestingPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onScenarioSelect?: (scenario: PayrollScenarioProfile) => void;
  readOnly?: boolean;
}

export default function PayrollScenarioTestingPanel({
  companyId,
  payrollPeriodId,
  onScenarioSelect,
  readOnly = false
}: PayrollScenarioTestingPanelProps) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [scenarios, setScenarios] = useState<PayrollScenarioProfile[]>([]);
  const [results, setResults] = useState<PayrollValidationSuite | null>(null);
  const [accuracy, setAccuracy] = useState<PayrollAccuracySummary | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");

  // Load scenarios
  useEffect(() => {
    async function loadScenarios() {
      try {
        setLoading(true);
        const scenarioProfiles = jamaicanPayrollScenarioTester.generatePayrollScenarioProfiles();
        setScenarios(scenarioProfiles);
      } catch (error) {
        console.error("Error loading scenarios:", error);
      } finally {
        setLoading(false);
      }
    }

    loadScenarios();
  }, [companyId, payrollPeriodId]);

  // Run scenario testing
  const runScenarioTesting = async () => {
    if (readOnly || running) return;

    try {
      setRunning(true);
      
      // Execute scenario validation
      const validationResults = await jamaicanPayrollScenarioTester.executeScenarioValidation(
        scenarios,
        'comprehensive'
      );
      
      setResults(validationResults);
      
      // Build accuracy summary
      const accuracySummary = jamaicanPayrollScenarioTester.buildAccuracySummary(
        validationResults.executionResults
      );
      setAccuracy(accuracySummary);
      
    } catch (error) {
      console.error("Error running scenario testing:", error);
    } finally {
      setRunning(false);
    }
  };

  // Filter and sort scenarios
  const filteredScenarios = scenarios
    .filter(scenario => {
      const matchesCategory = selectedCategory === "all" || scenario.category.id === selectedCategory;
      const matchesSearch = scenario.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           scenario.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'category':
          return a.category.name.localeCompare(b.category.name);
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return (priorityOrder[b.category.priority as keyof typeof priorityOrder] || 0) - 
                 (priorityOrder[a.category.priority as keyof typeof priorityOrder] || 0);
        default:
          return 0;
      }
    });

  // Get unique categories
  const categories = Array.from(new Set(scenarios.map(s => s.category)));

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading scenario profiles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Scenario Testing</h3>
            <p className="text-sm text-gray-600">
              {scenarios.length} scenario profiles available
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={runScenarioTesting}
              disabled={readOnly || running || scenarios.length === 0}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Run Tests</span>
                </>
              )}
            </button>
            <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
              <RefreshCw className="h-4 w-4" />
              <span className="text-sm">Refresh</span>
            </button>
            <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
              <Download className="h-4 w-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search scenarios..."
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
              <option value="name">Sort by Name</option>
              <option value="category">Sort by Category</option>
              <option value="priority">Sort by Priority</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      {results && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-4">Test Results Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-900">{results.summary.totalScenarios}</div>
              <div className="text-sm text-blue-700">Total Scenarios</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-900">{results.summary.passedScenarios}</div>
              <div className="text-sm text-green-700">Passed</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-900">{results.summary.failedScenarios}</div>
              <div className="text-sm text-red-700">Failed</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-900">{formatPercent(results.summary.overallPassRate)}</div>
              <div className="text-sm text-purple-700">Pass Rate</div>
            </div>
          </div>

          {/* Critical Failures */}
          {results.summary.criticalFailures.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <h5 className="font-medium text-red-900 mb-2">Critical Failures</h5>
              <ul className="space-y-1">
                {results.summary.criticalFailures.map((failure, index) => (
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

      {/* Accuracy Summary */}
      {accuracy && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-4">Accuracy Analysis</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{formatPercent(accuracy.overallAccuracy)}</div>
              <div className="text-sm text-gray-700">Overall Accuracy</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-900">{formatPercent(accuracy.statutoryAccuracy)}</div>
              <div className="text-sm text-blue-700">Statutory Accuracy</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-900">{formatPercent(accuracy.varianceControl)}</div>
              <div className="text-sm text-green-700">Variance Control</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-900">{formatPercent(accuracy.complianceAdherence)}</div>
              <div className="text-sm text-purple-700">Compliance Adherence</div>
            </div>
          </div>

          {/* Recommendations */}
          {accuracy.recommendations.length > 0 && (
            <div className="mt-4 space-y-2">
              <h5 className="font-medium text-gray-900">Recommendations</h5>
              {accuracy.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
                  <Info className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700">{recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scenario List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900">Scenario Profiles</h4>
        </div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {filteredScenarios.map((scenario) => {
            const result = results?.executionResults.find(r => r.scenarioId === scenario.id);
            
            return (
              <div
                key={scenario.id}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onScenarioSelect && onScenarioSelect(scenario)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h5 className="font-medium text-gray-900">{scenario.name}</h5>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        scenario.category.priority === 'high' ? 'bg-red-100 text-red-800' :
                        scenario.category.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {scenario.category.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span>Category: {scenario.category.name}</span>
                      <span>Employee: {scenario.workerData.firstName} {scenario.workerData.lastName}</span>
                      <span>Frequency: {scenario.workerData.frequency.type}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {result && (
                      <>
                        {result.passed ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {formatPercent(result.overallScore)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDuration(result.executionTime)}
                          </div>
                        </div>
                      </>
                    )}
                    <button className="text-blue-600 hover:text-blue-700">
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
