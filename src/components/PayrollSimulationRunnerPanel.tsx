// Payroll Simulation Runner Panel - Phase 3E
// Interactive simulation execution and monitoring component
// PHASE 3E PAYROLL SIMULATION ONLY — SHADOW SAFE

import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  PlayCircle,
  StopCircle,
  RotateCcw,
  Zap,
  Shield,
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Timer,
  TrendingUp,
  Activity,
  Users,
  Calculator,
  FileText,
  BarChart3,
  Eye,
  Download,
  ChevronRight,
  Info,
  Lock,
  Unlock,
  Target,
  Gauge,
  AlertCircle,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { payrollSimulationEngine, executePayrollSimulation } from "../lib/payrollSimulationExecution";
import type {
  PayrollSimulationRun,
  PayrollSimulationConfig,
  PayrollSimulationParameters,
  PayrollSimulationSafety,
  PayrollSimulationExecution
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

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

interface PayrollSimulationRunnerPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onSimulationStart?: (simulationId: string) => void;
  onSimulationComplete?: (simulationId: string, result: any) => void;
  readOnly?: boolean;
}

export default function PayrollSimulationRunnerPanel({
  companyId,
  payrollPeriodId,
  onSimulationStart,
  onSimulationComplete,
  readOnly = false
}: PayrollSimulationRunnerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [simulationConfig, setSimulationConfig] = useState<PayrollSimulationConfig>({
    companyId,
    payrollPeriodId,
    executionMode: 'shadow_only',
    safetyLevel: 'conservative',
    enableTelemetry: true,
    enableAudit: true,
    enableValidation: true,
    enableComparison: true,
    maxWorkers: 100,
    timeoutMinutes: 60,
    retryAttempts: 3,
    isolationLevel: 'strict',
    duplicatePrevention: true,
    rollbackPreparation: true
  });
  const [simulationParameters, setSimulationParameters] = useState<PayrollSimulationParameters>({
    precisionLevel: 'detailed',
    includeAccountingPreview: true,
    includeComplianceValidation: true,
    includeReconciliation: true,
    includeLiabilitySimulation: true
  });
  const [safetyValidation, setSafetyValidation] = useState<PayrollSimulationSafety | null>(null);
  const [currentSimulation, setCurrentSimulation] = useState<PayrollSimulationRun | null>(null);
  const [executionProgress, setExecutionProgress] = useState({
    percentage: 0,
    currentStep: 'Initializing',
    completedSteps: [],
    totalSteps: 7,
    estimatedTimeRemaining: 0
  });
  const [resourceUsage, setResourceUsage] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    database: 0
  });

  // Validate safety on config change
  useEffect(() => {
    async function validateSafety() {
      try {
        const safety = await payrollSimulationEngine.validateSimulationSafety(
          simulationConfig,
          simulationParameters
        );
        setSafetyValidation(safety);
      } catch (error) {
        console.error("Error validating safety:", error);
      }
    }

    validateSafety();
  }, [simulationConfig, simulationParameters]);

  // Execute simulation
  const executeSimulation = async () => {
    if (!safetyValidation || safetyValidation.blocked) {
      alert('Simulation blocked by safety checks. Please review safety validation.');
      return;
    }

    try {
      setExecuting(true);
      setLoading(true);

      const result = await executePayrollSimulation(
        simulationConfig,
        simulationParameters,
        'current_user'
      );

      if (onSimulationStart) {
        onSimulationStart(result.simulationId);
      }

      // Simulate progress updates
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
          progress = 100;
          clearInterval(progressInterval);
          setExecuting(false);
          setLoading(false);
          
          if (onSimulationComplete) {
            onSimulationComplete(result.simulationId, result);
          }
        }

        setExecutionProgress(prev => ({
          ...prev,
          percentage: Math.min(progress, 100),
          currentStep: getSimulationStep(progress),
          estimatedTimeRemaining: Math.max(0, (100 - progress) * 2)
        }));
      }, 1000);

    } catch (error: any) {
      console.error("Error executing simulation:", error);
      setExecuting(false);
      setLoading(false);
      alert('Simulation failed: ' + (error?.message || String(error)));
    }
  };

  // Get simulation step based on progress
  const getSimulationStep = (progress: number): string => {
    if (progress < 15) return 'Initializing simulation environment';
    if (progress < 30) return 'Loading worker data';
    if (progress < 45) return 'Executing payroll calculations';
    if (progress < 60) return 'Running scenario tests';
    if (progress < 75) return 'Generating accounting preview';
    if (progress < 90) return 'Performing reconciliation';
    return 'Finalizing results';
  };

  // Pause simulation
  const pauseSimulation = () => {
    // This would pause the simulation
    setExecuting(false);
  };

  // Stop simulation
  const stopSimulation = () => {
    // This would stop the simulation
    setExecuting(false);
    setExecutionProgress({
      percentage: 0,
      currentStep: 'Initializing',
      completedSteps: [],
      totalSteps: 7,
      estimatedTimeRemaining: 0
    });
  };

  // Restart simulation
  const restartSimulation = () => {
    setExecutionProgress({
      percentage: 0,
      currentStep: 'Initializing',
      completedSteps: [],
      totalSteps: 7,
      estimatedTimeRemaining: 0
    });
    executeSimulation();
  };

  if (loading && !executing) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Preparing simulation environment...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Simulation Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Simulation Configuration</h3>
            <p className="text-sm text-gray-600">Configure simulation parameters and safety settings</p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-600">Shadow Safe Mode</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Execution Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Execution Mode</label>
            <select
              value={simulationConfig.executionMode}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                executionMode: e.target.value as any
              }))}
              disabled={executing || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="shadow_only">Shadow Only (Safe)</option>
              <option value="comparison">Comparison Mode</option>
              <option value="scenario_test">Scenario Test</option>
              <option value="pilot_group">Pilot Group</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Shadow-only ensures no production impact</p>
          </div>

          {/* Safety Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Safety Level</label>
            <select
              value={simulationConfig.safetyLevel}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                safetyLevel: e.target.value as any
              }))}
              disabled={executing || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Higher safety = more checks, slower execution</p>
          </div>

          {/* Precision Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Precision Level</label>
            <select
              value={simulationParameters.precisionLevel}
              onChange={(e) => setSimulationParameters(prev => ({
                ...prev,
                precisionLevel: e.target.value as any
              }))}
              disabled={executing || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="basic">Basic</option>
              <option value="detailed">Detailed</option>
              <option value="comprehensive">Comprehensive</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Higher precision = more detailed analysis</p>
          </div>

          {/* Max Workers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Workers</label>
            <input
              type="number"
              value={simulationConfig.maxWorkers}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                maxWorkers: parseInt(e.target.value) || 1
              }))}
              disabled={executing || readOnly}
              min="1"
              max="1000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum workers to include in simulation</p>
          </div>

          {/* Timeout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Timeout (minutes)</label>
            <input
              type="number"
              value={simulationConfig.timeoutMinutes}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                timeoutMinutes: parseInt(e.target.value) || 1
              }))}
              disabled={executing || readOnly}
              min="1"
              max="180"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum execution time before timeout</p>
          </div>

          {/* Isolation Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Isolation Level</label>
            <select
              value={simulationConfig.isolationLevel}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                isolationLevel: e.target.value as any
              }))}
              disabled={executing || readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="strict">Strict</option>
              <option value="moderate">Moderate</option>
              <option value="relaxed">Relaxed</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Production system isolation strictness</p>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={simulationParameters.includeAccountingPreview}
              onChange={(e) => setSimulationParameters(prev => ({
                ...prev,
                includeAccountingPreview: e.target.checked
              }))}
              disabled={executing || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Accounting Preview</div>
              <div className="text-xs text-gray-500">Generate GL journal preview</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={simulationParameters.includeComplianceValidation}
              onChange={(e) => setSimulationParameters(prev => ({
                ...prev,
                includeComplianceValidation: e.target.checked
              }))}
              disabled={executing || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Compliance Validation</div>
              <div className="text-xs text-gray-500">Check statutory compliance</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={simulationParameters.includeReconciliation}
              onChange={(e) => setSimulationParameters(prev => ({
                ...prev,
                includeReconciliation: e.target.checked
              }))}
              disabled={executing || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Reconciliation</div>
              <div className="text-xs text-gray-500">Perform reconciliation checks</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={simulationConfig.enableTelemetry}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                enableTelemetry: e.target.checked
              }))}
              disabled={executing || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Telemetry</div>
              <div className="text-xs text-gray-500">Collect execution telemetry</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={simulationConfig.enableAudit}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                enableAudit: e.target.checked
              }))}
              disabled={executing || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Audit Trail</div>
              <div className="text-xs text-gray-500">Generate comprehensive audit</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={simulationConfig.duplicatePrevention}
              onChange={(e) => setSimulationConfig(prev => ({
                ...prev,
                duplicatePrevention: e.target.checked
              }))}
              disabled={executing || readOnly}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Duplicate Prevention</div>
              <div className="text-xs text-gray-500">Prevent duplicate executions</div>
            </div>
          </label>
        </div>
      </div>

      {/* Safety Validation */}
      {safetyValidation && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Safety Validation</h3>
            <div className="flex items-center space-x-2">
              <Shield className={`h-5 w-5 ${
                safetyValidation.blocked ? 'text-red-600' : 
                safetyValidation.safetyScore >= 95 ? 'text-green-600' : 
                safetyValidation.safetyScore >= 80 ? 'text-yellow-600' : 'text-orange-600'
              }`} />
              <span className={`text-sm font-medium ${
                safetyValidation.blocked ? 'text-red-600' : 
                safetyValidation.safetyScore >= 95 ? 'text-green-600' : 
                safetyValidation.safetyScore >= 80 ? 'text-yellow-600' : 'text-orange-600'
              }`}>
                {safetyValidation.blocked ? 'BLOCKED' : `${safetyValidation.safetyScore}% Safe`}
              </span>
            </div>
          </div>

          {/* Safety Checks */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {safetyValidation.safetyChecks.map((check, index) => (
              <div key={check.checkId} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                {check.status === 'pass' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : check.status === 'warning' ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{check.checkName}</div>
                  <div className="text-xs text-gray-600">{check.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Safety Warnings */}
          {safetyValidation.warnings.length > 0 && (
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-700">
                  <div className="font-medium text-yellow-900">Safety Warnings</div>
                  <ul className="mt-1 space-y-1">
                    {safetyValidation.warnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Block Reason */}
          {safetyValidation.blocked && (
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-start space-x-2">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">
                  <div className="font-medium text-red-900">Execution Blocked</div>
                  <div>{safetyValidation.blockReason}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Execution Control */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Execution Control</h3>
          <div className="flex items-center space-x-2">
            {executing ? (
              <>
                <div className="animate-pulse">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-blue-600">Executing</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-600">Ready</span>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {executing && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">{executionProgress.currentStep}</span>
              <span className="text-sm text-gray-900">{Math.round(executionProgress.percentage)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
                style={{ width: `${executionProgress.percentage}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                Step {Math.floor(executionProgress.percentage / 14.3) + 1} of {executionProgress.totalSteps}
              </span>
              <span className="text-xs text-gray-500">
                {executionProgress.estimatedTimeRemaining > 0 && 
                  `${Math.ceil(executionProgress.estimatedTimeRemaining / 60)}m remaining`
                }
              </span>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex items-center space-x-3">
          {!executing ? (
            <button
              onClick={executeSimulation}
              disabled={!safetyValidation || safetyValidation.blocked || readOnly}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlayCircle className="h-5 w-5" />
              <span>Start Simulation</span>
            </button>
          ) : (
            <>
              <button
                onClick={pauseSimulation}
                disabled={readOnly}
                className="flex items-center space-x-2 bg-yellow-600 text-white px-4 py-3 rounded-lg hover:bg-yellow-700"
              >
                <Pause className="h-5 w-5" />
                <span>Pause</span>
              </button>
              <button
                onClick={stopSimulation}
                disabled={readOnly}
                className="flex items-center space-x-2 bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700"
              >
                <Square className="h-5 w-5" />
                <span>Stop</span>
              </button>
              <button
                onClick={restartSimulation}
                disabled={readOnly}
                className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700"
              >
                <RotateCcw className="h-5 w-5" />
                <span>Restart</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resource Monitoring */}
      {executing && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Resource Monitoring</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <Cpu className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">CPU Usage</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${resourceUsage.cpu}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{resourceUsage.cpu}% utilized</div>
            </div>

            <div>
              <div className="flex items-center space-x-3 mb-2">
                <HardDrive className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-gray-900">Memory Usage</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${resourceUsage.memory}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{resourceUsage.memory}% utilized</div>
            </div>

            <div>
              <div className="flex items-center space-x-3 mb-2">
                <Database className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-900">Database Load</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${resourceUsage.database}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{resourceUsage.database}% load</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
            <Users className="h-5 w-5 text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">Worker Selection</div>
              <div className="text-xs text-gray-600">Choose specific workers</div>
            </div>
          </button>

          <button className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
            <Calculator className="h-5 w-5 text-green-600" />
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">Scenario Tests</div>
              <div className="text-xs text-gray-600">Run test scenarios</div>
            </div>
          </button>

          <button className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
            <FileText className="h-5 w-5 text-purple-600" />
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">Templates</div>
              <div className="text-xs text-gray-600">Use saved templates</div>
            </div>
          </button>

          <button className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
            <BarChart3 className="h-5 w-5 text-orange-600" />
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">Preview Results</div>
              <div className="text-xs text-gray-600">Expected outcomes</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
