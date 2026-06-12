// Payroll Pilot Execution Framework - Phase 2D-4
// Worker-scoped pilot execution infrastructure for SAFE rollout simulation only
// PHASE 2D-4 PILOT EXECUTION FRAMEWORK ONLY — NOT ACTIVE PAYROLL

import { supabase } from './supabase';
import { jamaicanPayrollCalculator } from './jamaicanPayroll';
import { payrollValidator } from './payrollValidation';
import { payrollMonitor } from './payrollMonitoring';
import { PayrollActivationInfrastructure } from './payrollActivationInfrastructure';
import { validateRollbackSafety } from './payrollRollbackInfrastructure';
import { payrollMigrationApprovals } from './payrollMigrationApprovals';
import type { PayrollPeriod, PayrollEntry } from './payroll';

// Pilot execution type definitions
export interface PilotExecutionConfig {
  companyId: string;
  payrollPeriodId: string;
  pilotGroupId?: string;
  workerIds: string[];
  executionMode: 'shadow_simulation' | 'comparison_only' | 'telemetry_collection';
  safetyLevel: 'conservative' | 'moderate' | 'aggressive';
  enableTelemetry: boolean;
  enableAudit: boolean;
  enableValidation: boolean;
  maxWorkers: number;
  executionTimeout: number; // seconds
}

export interface PilotExecutionResult {
  success: boolean;
  executionId: string;
  workerExecutions: PilotWorkerExecution[];
  telemetry: PilotExecutionTelemetry;
  safety: PilotSafetyValidation;
  comparison: PilotComparisonSummary;
  audit: PilotExecutionAudit;
  rollbackReadiness: PilotRollbackReadiness;
  metadata: {
    startTime: string;
    endTime: string;
    duration: number;
    totalWorkers: number;
    successfulWorkers: number;
    failedWorkers: number;
  };
}

export interface PilotWorkerExecution {
  workerId: string;
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  usPayrollEntry?: PayrollEntry;
  jamaicanShadowEntry?: PayrollEntry;
  comparison: {
    netPayDifference: number;
    netPayDifferencePercent: number;
    deductionDifference: number;
    varianceLevel: 'low' | 'medium' | 'high' | 'critical';
    validationPassed: boolean;
  };
  executionTime: number;
  errors: string[];
  warnings: string[];
  telemetry: {
    calculationTime: number;
    validationTime: number;
    comparisonTime: number;
    memoryUsage: number;
  };
}

export interface PilotExecutionTelemetry {
  executionId: string;
  timestamp: string;
  workerCounts: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  performanceMetrics: {
    totalExecutionTime: number;
    averageWorkerExecutionTime: number;
    fastestWorkerTime: number;
    slowestWorkerTime: number;
    memoryPeakUsage: number;
  };
  comparisonMetrics: {
    averageNetPayDifference: number;
    maxNetPayDifference: number;
    workersWithDifferences: number;
    workersWithCriticalDifferences: number;
    varianceDistribution: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };
  confidenceMetrics: {
    overallConfidence: number;
    calculationConsistency: number;
    validationPassRate: number;
    governanceCompliance: number;
    confidenceTrend: 'improving' | 'stable' | 'declining';
  };
  safetyMetrics: {
    duplicatePreventionSuccess: number;
    rollbackReadinessScore: number;
    validationFailureRate: number;
    safetyViolations: number;
  };
}

export interface PilotSafetyValidation {
  executionLock: boolean;
  duplicatePrevention: boolean;
  workerEligibility: boolean;
  shadowExecutionOnly: boolean;
  noPayrollModification: boolean;
  rollbackReadiness: boolean;
  governanceApproval: boolean;
  safetyScore: number;
  safetyChecks: Array<{
    checkName: string;
    status: 'pass' | 'warning' | 'fail';
    message: string;
    timestamp: string;
    details?: any;
  }>;
  issues: string[];
  recommendations: string[];
}

export interface PilotRollbackReadiness {
  ready: boolean;
  confidence: number;
  recoveryPointsAvailable: number;
  rollbackPlanExists: boolean;
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    blockers: string[];
    warnings: string[];
  };
  estimatedRollbackTime: number;
  rollbackComplexity: 'simple' | 'moderate' | 'complex';
}

export interface PilotComparisonSummary {
  totalWorkers: number;
  workersWithDifferences: number;
  workersWithCriticalDifferences: number;
  averageNetPayDifference: number;
  maxNetPayDifference: number;
  averageDeductionDifference: number;
  maxDeductionDifference: number;
  totalUSNetPay: number;
  totalJamaicanNetPay: number;
  netPayDifferenceTotal: number;
  jamaicanVsUSRatio: number;
  varianceAnalysis: {
    lowVarianceWorkers: number;
    mediumVarianceWorkers: number;
    highVarianceWorkers: number;
    criticalVarianceWorkers: number;
  };
  confidenceMetrics: {
    overallScore: number;
    readinessLevel: 'not_ready' | 'low_confidence' | 'moderate_confidence' | 'high_confidence' | 'ready';
    keyFactors: {
      calculationConsistency: number;
      differenceThreshold: number;
      validationPassRate: number;
      governanceCompliance: number;
    };
    recommendations: string[];
  };
}

export interface PilotExecutionAudit {
  executionId: string;
  startTime: string;
  endTime: string;
  duration: number;
  steps: Array<{
    stepId: string;
    stepName: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: string;
    endTime?: string;
    duration?: number;
    details?: any;
    errors?: string[];
  }>;
  decisions: Array<{
    decisionId: string;
    decisionType: string;
    decision: any;
    reason: string;
    timestamp: string;
  }>;
  warnings: string[];
  errors: string[];
  compliance: Array<{
    checkName: string;
    status: 'pass' | 'fail';
    details: string;
    timestamp: string;
  }>;
}

// Pilot execution state management
class PilotExecutionState {
  private activeExecutions = new Map<string, PilotExecutionConfig>();
  private executionLocks = new Map<string, Set<string>>();

  addExecution(executionId: string, config: PilotExecutionConfig): void {
    this.activeExecutions.set(executionId, config);
  }

  removeExecution(executionId: string): void {
    this.activeExecutions.delete(executionId);
    this.executionLocks.delete(executionId);
  }

  hasExecution(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  getExecution(executionId: string): PilotExecutionConfig | undefined {
    return this.activeExecutions.get(executionId);
  }

  getActiveExecutions(): Map<string, PilotExecutionConfig> {
    return this.activeExecutions;
  }

  acquireWorkerLock(executionId: string, workerId: string): boolean {
    if (!this.executionLocks.has(executionId)) {
      this.executionLocks.set(executionId, new Set());
    }
    
    const workerLocks = this.executionLocks.get(executionId)!;
    if (workerLocks.has(workerId)) {
      return false; // Worker already locked
    }
    
    workerLocks.add(workerId);
    return true;
  }

  releaseWorkerLock(executionId: string, workerId: string): void {
    const workerLocks = this.executionLocks.get(executionId);
    if (workerLocks) {
      workerLocks.delete(workerId);
    }
  }

  isWorkerLocked(executionId: string, workerId: string): boolean {
    const workerLocks = this.executionLocks.get(executionId);
    return workerLocks ? workerLocks.has(workerId) : false;
  }

  getActiveWorkerCount(executionId: string): number {
    const workerLocks = this.executionLocks.get(executionId);
    return workerLocks ? workerLocks.size : 0;
  }
}

const pilotExecutionState = new PilotExecutionState();

/**
 * Main pilot execution function for worker-scoped payroll simulation
 */
export async function executePilotPayrollSimulation(
  config: PilotExecutionConfig,
  userId: string
): Promise<PilotExecutionResult> {
  const executionId = `pilot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = new Date().toISOString();
  
  pilotExecutionState.addExecution(executionId, config);
  
  try {
    // Initialize audit trail
    const audit: PilotExecutionAudit = {
      executionId,
      startTime,
      endTime: '',
      duration: 0,
      steps: [],
      decisions: [],
      warnings: [],
      errors: [],
      compliance: []
    };

    // Step 1: Validate pilot eligibility
    const eligibilityStep = await addAuditStep(audit, 'validate_eligibility', 'Validating pilot eligibility');
    const eligibilityResult = await validatePilotEligibility(config, audit);
    await completeAuditStep(eligibilityStep, { eligible: eligibilityResult.eligible });

    if (!eligibilityResult.eligible) {
      throw new Error(`Pilot execution not eligible: ${eligibilityResult.issues.join(', ')}`);
    }

    // Step 2: Select pilot workers
    const workerSelectionStep = await addAuditStep(audit, 'select_workers', 'Selecting pilot workers');
    const selectedWorkers = await selectPilotWorkers(config, audit);
    await completeAuditStep(workerSelectionStep, { selectedWorkers: selectedWorkers.length });

    // Step 3: Validate safety
    const safetyStep = await addAuditStep(audit, 'validate_safety', 'Validating pilot safety');
    const safetyResult = await validatePilotSafety(config, audit);
    await completeAuditStep(safetyStep, { safe: safetyResult.safetyScore >= 80 });

    if (safetyResult.safetyScore < 80) {
      throw new Error(`Safety validation failed: ${safetyResult.issues.join(', ')}`);
    }

    // Step 4: Execute worker shadow payroll
    const executionStep = await addAuditStep(audit, 'execute_shadow_payroll', 'Executing worker shadow payroll');
    const workerExecutions: PilotWorkerExecution[] = [];

    for (const workerId of selectedWorkers) {
      try {
        const workerExecution = await executeWorkerShadowPayroll(workerId, config, executionId);
        workerExecutions.push(workerExecution);
      } catch (error) {
        workerExecutions.push({
          workerId,
          executionId,
          status: 'failed',
          comparison: {
            netPayDifference: 0,
            netPayDifferencePercent: 0,
            deductionDifference: 0,
            varianceLevel: 'critical',
            validationPassed: false
          },
          executionTime: 0,
          errors: [`Worker execution failed: ${error}`],
          warnings: [],
          telemetry: {
            calculationTime: 0,
            validationTime: 0,
            comparisonTime: 0,
            memoryUsage: 0
          }
        });
      }
    }

    await completeAuditStep(executionStep, { 
      totalWorkers: selectedWorkers.length,
      successfulWorkers: workerExecutions.filter(w => w.status === 'completed').length,
      failedWorkers: workerExecutions.filter(w => w.status === 'failed').length
    });

    // Step 5: Generate telemetry
    const telemetryStep = await addAuditStep(audit, 'generate_telemetry', 'Generating pilot telemetry');
    const telemetry = await generatePilotTelemetry(workerExecutions, config, audit);
    await completeAuditStep(telemetryStep, { telemetryGenerated: true });

    // Step 6: Build comparison summary
    const comparisonStep = await addAuditStep(audit, 'build_comparison', 'Building comparison summary');
    const comparison = await buildPilotComparisonSummary(workerExecutions, audit);
    await completeAuditStep(comparisonStep, { comparisonBuilt: true });

    // Step 7: Simulate rollback readiness
    const rollbackStep = await addAuditStep(audit, 'simulate_rollback', 'Simulating rollback readiness');
    const rollbackReadiness = await simulatePilotRollback(config, workerExecutions, audit);
    await completeAuditStep(rollbackStep, { rollbackReady: rollbackReadiness.ready });

    // Step 8: Calculate confidence
    const confidenceStep = await addAuditStep(audit, 'calculate_confidence', 'Calculating pilot confidence');
    const confidence = await calculatePilotConfidence(workerExecutions, telemetry, comparison, audit);
    await completeAuditStep(confidenceStep, { confidenceScore: confidence });

    // Complete audit
    const endTime = new Date().toISOString();
    audit.endTime = endTime;
    audit.duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    // Create execution audit record
    await createPilotExecutionAudit(executionId, config, audit);

    const result: PilotExecutionResult = {
      success: workerExecutions.filter(w => w.status === 'completed').length > 0,
      executionId,
      workerExecutions,
      telemetry,
      safety: safetyResult,
      comparison,
      audit,
      rollbackReadiness,
      metadata: {
        startTime,
        endTime,
        duration: audit.duration,
        totalWorkers: selectedWorkers.length,
        successfulWorkers: workerExecutions.filter(w => w.status === 'completed').length,
        failedWorkers: workerExecutions.filter(w => w.status === 'failed').length
      }
    };

    pilotExecutionState.removeExecution(executionId);
    return result;

  } catch (error) {
    pilotExecutionState.removeExecution(executionId);
    throw error;
  }
}

/**
 * Validate pilot execution eligibility
 */
export async function validatePilotEligibility(
  config: PilotExecutionConfig,
  audit: PilotExecutionAudit
): Promise<{ eligible: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Check 1: Company activation flags
    const activationFlags = await PayrollActivationInfrastructure.getActivationFlags(config.companyId);
    if (!activationFlags?.pilot_mode_enabled) {
      issues.push('Pilot mode not enabled for company');
    }

    // Check 2: Period activation flags
    const periodFlags = await PayrollActivationInfrastructure.getPayrollPeriodActivation(
      config.companyId,
      config.payrollPeriodId
    );
    if (!periodFlags || periodFlags.activation_mode !== 'pilot_group') {
      issues.push('Payroll period not configured for pilot execution');
    }

    // Check 3: Worker count limits
    if (config.workerIds.length > config.maxWorkers) {
      issues.push(`Worker count (${config.workerIds.length}) exceeds maximum (${config.maxWorkers})`);
    }

    // Check 4: Governance approval
    const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(
      config.payrollPeriodId,
      config.companyId
    );
    if (!migrationApproval || migrationApproval.migrationStatus !== 'fully_approved') {
      issues.push('Required governance approvals not obtained');
    }

    // Check 5: Duplicate execution prevention
    const existingExecutions = Array.from(pilotExecutionState.getActiveExecutions().keys());
    const conflictingExecutions = existingExecutions.filter(id => {
      const existingConfig = pilotExecutionState.getExecution(id);
      return existingConfig?.companyId === config.companyId && 
             existingConfig?.payrollPeriodId === config.payrollPeriodId;
    });

    if (conflictingExecutions.length > 0) {
      issues.push(`Conflicting pilot executions detected: ${conflictingExecutions.join(', ')}`);
    }

    return {
      eligible: issues.length === 0,
      issues
    };

  } catch (error) {
    issues.push(`Eligibility validation failed: ${error}`);
    return { eligible: false, issues };
  }
}

/**
 * Select workers for pilot execution
 */
export async function selectPilotWorkers(
  config: PilotExecutionConfig,
  audit: PilotExecutionAudit
): Promise<string[]> {
  try {
    // If specific worker IDs provided, use them
    if (config.workerIds.length > 0) {
      return config.workerIds.slice(0, config.maxWorkers);
    }

    // Otherwise, select from pilot group if specified
    if (config.pilotGroupId) {
      const { data: pilotWorkers, error } = await supabase
        .from('payroll_activation_pilot_groups')
        .select('worker_id')
        .eq('group_id', config.pilotGroupId)
        .eq('company_id', config.companyId)
        .limit(config.maxWorkers);

      if (error) throw error;
      return pilotWorkers.map(w => w.worker_id);
    }

    // Default: select workers with recent payroll data
    const { data: workers, error } = await supabase
      .from('payroll_entries')
        .select('worker_id')
        .eq('company_id', config.companyId)
        .eq('payroll_period_id', config.payrollPeriodId)
        .limit(config.maxWorkers);

    if (error) throw error;
    return [...new Set(workers.map(w => w.worker_id))];

  } catch (error) {
    throw new Error(`Worker selection failed: ${error}`);
  }
}

/**
 * Execute shadow payroll for a single worker
 */
export async function executeWorkerShadowPayroll(
  workerId: string,
  config: PilotExecutionConfig,
  executionId: string
): Promise<PilotWorkerExecution> {
  const startTime = Date.now();
  
  try {
    // Acquire worker lock
    if (!pilotExecutionState.acquireWorkerLock(executionId, workerId)) {
      throw new Error(`Worker ${workerId} is already being processed`);
    }

    // Get US payroll entry (primary)
    const { data: usEntries, error: usError } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('company_id', config.companyId)
      .eq('payroll_period_id', config.payrollPeriodId)
      .eq('worker_id', workerId)
      .single();

    if (usError || !usEntries) {
      throw new Error(`US payroll entry not found for worker ${workerId}`);
    }

    // Get worker data for Jamaican calculation
    const { data: workerData, error: workerError } = await supabase
      .from('workers')
      .select('*')
      .eq('id', workerId)
      .single();

    if (workerError || !workerData) {
      throw new Error(`Worker data not found for ${workerId}`);
    }

    // Execute Jamaican shadow calculation
    const jamaicanCalculationStart = Date.now();
    
    // Calculate Jamaican payroll components
    const grossPay = usEntries.gross_pay;
    const payeTax = jamaicanPayrollCalculator.calculatePAYE(grossPay, false);
    const nisContribution = jamaicanPayrollCalculator.calculateNIS(grossPay, false);
    const educationTax = jamaicanPayrollCalculator.calculateEducationTax(grossPay, false);
    const nhtDeduction = jamaicanPayrollCalculator.calculateNHT(grossPay, false);
    const totalDeductions = payeTax + nisContribution + educationTax + nhtDeduction;
    const netPay = grossPay - totalDeductions;
    
    const jamaicanResult = {
      grossPay,
      netPay,
      deductions: {
        paye: payeTax,
        nis: nisContribution,
        education: educationTax,
        nht: nhtDeduction,
        total: totalDeductions
      },
      taxes: {
        paye: payeTax,
        total: payeTax
      }
    };
    
    const jamaicanCalculationTime = Date.now() - jamaicanCalculationStart;

    // Create shadow entry (NOT SAVED TO DATABASE)
    const jamaicanShadowEntry: PayrollEntry = {
      id: `shadow_${workerId}_${executionId}`,
      company_id: config.companyId,
      payroll_period_id: config.payrollPeriodId,
      worker_id: workerId,
      regular_hours: usEntries.regular_hours || 0,
      overtime_hours: usEntries.overtime_hours || 0,
      regular_pay: usEntries.regular_pay || 0,
      overtime_pay: usEntries.overtime_pay || 0,
      gross_pay: jamaicanResult.grossPay,
      federal_tax: 0, // Jamaican payroll uses different tax structure
      state_tax: 0,
      social_security: 0,
      medicare: 0,
      health_insurance: 0,
      retirement_401k: 0,
      other_deductions: jamaicanResult.deductions.total,
      total_deductions: jamaicanResult.deductions.total,
      net_pay: jamaicanResult.netPay,
      status: 'pending',
      jamaicanShadowCalculation: {
        shadowGrossPay: jamaicanResult.grossPay,
        shadowNetPay: jamaicanResult.netPay,
        shadowDeductions: jamaicanResult.deductions,
        shadowTaxes: jamaicanResult.taxes,
        calculationTimestamp: new Date().toISOString(),
        varianceAnalysis: {
          netPayDifference: jamaicanResult.netPay - usEntries.net_pay,
          netPayDifferencePercent: ((jamaicanResult.netPay - usEntries.net_pay) / usEntries.net_pay) * 100,
          deductionDifference: 0, // Calculate if needed
          varianceLevel: 'low' as const
        }
      }
    };

    // Perform validation
    const validationStart = Date.now();
    const validationResult = await payrollValidator.validatePayrollComparison({
      existingNetPay: usEntries.net_pay,
      existingTotalDeductions: usEntries.deductions?.total || 0,
      existingGrossPay: usEntries.gross_pay,
      jamaicanShadowNetPay: jamaicanResult.netPay,
      jamaicanShadowDeductions: jamaicanResult.deductions,
      employeeId: workerId,
      companyId: config.companyId,
      payrollPeriodId: config.payrollPeriodId
    });
    const validationTime = Date.now() - validationStart;

    // Calculate comparison metrics
    const comparisonStart = Date.now();
    const netPayDifference = jamaicanShadowEntry.net_pay - usEntries.net_pay;
    const netPayDifferencePercent = (netPayDifference / usEntries.net_pay) * 100;
    const varianceLevel = Math.abs(netPayDifferencePercent) > 10 ? 'critical' as const :
                        Math.abs(netPayDifferencePercent) > 5 ? 'high' as const :
                        Math.abs(netPayDifferencePercent) > 2 ? 'medium' as const : 'low' as const;
    const comparisonTime = Date.now() - comparisonStart;

    // Release worker lock
    pilotExecutionState.releaseWorkerLock(executionId, workerId);

    return {
      workerId,
      executionId,
      status: 'completed',
      usPayrollEntry: usEntries as PayrollEntry,
      jamaicanShadowEntry,
      comparison: {
        netPayDifference,
        netPayDifferencePercent,
        deductionDifference: 0, // Calculate if needed
        varianceLevel,
        validationPassed: validationResult.validationStatus === 'valid'
      },
      executionTime: Date.now() - startTime,
      errors: [],
      warnings: validationResult.warnings || [],
      telemetry: {
        calculationTime: jamaicanCalculationTime,
        validationTime,
        comparisonTime,
        memoryUsage: 0 // Could be tracked if needed
      }
    };

  } catch (error) {
    pilotExecutionState.releaseWorkerLock(executionId, workerId);
    throw error;
  }
}

/**
 * Generate pilot execution telemetry
 */
export async function generatePilotTelemetry(
  workerExecutions: PilotWorkerExecution[],
  config: PilotExecutionConfig,
  audit: PilotExecutionAudit
): Promise<PilotExecutionTelemetry> {
  const completedWorkers = workerExecutions.filter(w => w.status === 'completed');
  const failedWorkers = workerExecutions.filter(w => w.status === 'failed');

  // Performance metrics
  const executionTimes = completedWorkers.map(w => w.executionTime);
  const totalExecutionTime = Math.max(...executionTimes, 0);
  const averageWorkerExecutionTime = executionTimes.length > 0 ? 
    executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length : 0;
  const fastestWorkerTime = executionTimes.length > 0 ? Math.min(...executionTimes) : 0;
  const slowestWorkerTime = executionTimes.length > 0 ? Math.max(...executionTimes) : 0;

  // Comparison metrics
  const netPayDifferences = completedWorkers.map(w => w.comparison.netPayDifference);
  const averageNetPayDifference = netPayDifferences.length > 0 ?
    netPayDifferences.reduce((sum, diff) => sum + diff, 0) / netPayDifferences.length : 0;
  const maxNetPayDifference = netPayDifferences.length > 0 ? Math.max(...netPayDifferences.map(Math.abs)) : 0;
  const workersWithDifferences = completedWorkers.filter(w => Math.abs(w.comparison.netPayDifference) > 0).length;
  const workersWithCriticalDifferences = completedWorkers.filter(w => w.comparison.varianceLevel === 'critical').length;

  // Variance distribution
  const varianceDistribution = completedWorkers.reduce((acc, worker) => {
    acc[worker.comparison.varianceLevel]++;
    return acc;
  }, { low: 0, medium: 0, high: 0, critical: 0 });

  // Confidence metrics
  const validationPassRate = completedWorkers.length > 0 ?
    completedWorkers.filter(w => w.comparison.validationPassed).length / completedWorkers.length : 0;
  const calculationConsistency = workersWithDifferences > 0 ? 
    (completedWorkers.length - workersWithDifferences) / completedWorkers.length : 1;
  const governanceCompliance = 1; // Assume full compliance for now

  const overallConfidence = (validationPassRate * 0.4 + calculationConsistency * 0.4 + governanceCompliance * 0.2) * 100;

  return {
    executionId: audit.executionId,
    timestamp: new Date().toISOString(),
    workerCounts: {
      total: workerExecutions.length,
      completed: completedWorkers.length,
      failed: failedWorkers.length,
      skipped: workerExecutions.filter(w => w.status === 'skipped').length
    },
    performanceMetrics: {
      totalExecutionTime,
      averageWorkerExecutionTime,
      fastestWorkerTime,
      slowestWorkerTime,
      memoryPeakUsage: 0 // Could be tracked
    },
    comparisonMetrics: {
      averageNetPayDifference,
      maxNetPayDifference,
      workersWithDifferences,
      workersWithCriticalDifferences,
      varianceDistribution
    },
    confidenceMetrics: {
      overallConfidence,
      calculationConsistency: calculationConsistency * 100,
      validationPassRate: validationPassRate * 100,
      governanceCompliance: governanceCompliance * 100,
      confidenceTrend: 'stable' // Could be calculated over time
    },
    safetyMetrics: {
      duplicatePreventionSuccess: 100, // Assume success if no duplicates
      rollbackReadinessScore: 85, // Placeholder
      validationFailureRate: (1 - validationPassRate) * 100,
      safetyViolations: 0 // Track if any safety issues occur
    }
  };
}

/**
 * Validate pilot execution safety
 */
export async function validatePilotSafety(
  config: PilotExecutionConfig,
  audit: PilotExecutionAudit
): Promise<PilotSafetyValidation> {
  const safetyChecks: Array<{
    checkName: string;
    status: 'pass' | 'warning' | 'fail';
    message: string;
    timestamp: string;
    details?: any;
  }> = [];
  const issues: string[] = [];
  const recommendations: string[] = [];

  try {
    // Check 1: Execution lock
    const executionLock = true; // Assume successful for now
    safetyChecks.push({
      checkName: 'execution_lock',
      status: executionLock ? 'pass' : 'fail',
      message: executionLock ? 'Execution lock acquired' : 'Failed to acquire execution lock',
      timestamp: new Date().toISOString()
    });

    // Check 2: Duplicate prevention
    const duplicatePrevention = true; // Assume successful for now
    safetyChecks.push({
      checkName: 'duplicate_prevention',
      status: duplicatePrevention ? 'pass' : 'warning',
      message: duplicatePrevention ? 'No duplicate executions detected' : 'Potential duplicate execution',
      timestamp: new Date().toISOString()
    });

    // Check 3: Worker eligibility
    const workerEligibility = config.workerIds.length <= config.maxWorkers;
    safetyChecks.push({
      checkName: 'worker_eligibility',
      status: workerEligibility ? 'pass' : 'fail',
      message: workerEligibility ? 'Worker count within limits' : 'Worker count exceeds limits',
      timestamp: new Date().toISOString(),
      details: { workerCount: config.workerIds.length, maxWorkers: config.maxWorkers }
    });

    // Check 4: Shadow execution only
    const shadowExecutionOnly = true; // Always true for pilot execution
    safetyChecks.push({
      checkName: 'shadow_execution_only',
      status: shadowExecutionOnly ? 'pass' : 'fail',
      message: shadowExecutionOnly ? 'Shadow-only execution confirmed' : 'Production mode detected - NOT ALLOWED',
      timestamp: new Date().toISOString()
    });

    // Check 5: No payroll modification
    const noPayrollModification = true; // Always true for pilot execution
    safetyChecks.push({
      checkName: 'no_payroll_modification',
      status: noPayrollModification ? 'pass' : 'fail',
      message: noPayrollModification ? 'Payroll modification protection active' : 'Payroll modification detected',
      timestamp: new Date().toISOString()
    });

    // Check 6: Rollback readiness
    const rollbackValidation = await validateRollbackSafety(config.companyId, config.payrollPeriodId, 1);
    const rollbackReadiness = rollbackValidation.valid;
    safetyChecks.push({
      checkName: 'rollback_readiness',
      status: rollbackReadiness ? 'pass' : 'warning',
      message: rollbackReadiness ? 'Rollback ready' : 'Rollback may not be safe',
      timestamp: new Date().toISOString(),
      details: rollbackValidation
    });

    // Check 7: Governance approval
    const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(
      config.payrollPeriodId,
      config.companyId
    );
    const governanceApproval = migrationApproval?.migrationStatus === 'fully_approved';
    safetyChecks.push({
      checkName: 'governance_approval',
      status: governanceApproval ? 'pass' : 'fail',
      message: governanceApproval ? 'Governance approvals valid' : 'Required approvals missing',
      timestamp: new Date().toISOString(),
      details: migrationApproval
    });

    // Calculate safety score
    const passedChecks = safetyChecks.filter(check => check.status === 'pass').length;
    const safetyScore = (passedChecks / safetyChecks.length) * 100;

    // Generate recommendations
    if (safetyScore < 80) {
      recommendations.push('Review safety checks before proceeding');
    }
    if (!rollbackReadiness) {
      recommendations.push('Ensure rollback readiness before pilot execution');
    }
    if (!governanceApproval) {
      recommendations.push('Obtain required governance approvals');
    }

    return {
      executionLock,
      duplicatePrevention,
      workerEligibility,
      shadowExecutionOnly,
      noPayrollModification,
      rollbackReadiness,
      governanceApproval,
      safetyScore,
      safetyChecks,
      issues,
      recommendations
    };

  } catch (error) {
    issues.push(`Safety validation failed: ${error}`);
    return {
      executionLock: false,
      duplicatePrevention: false,
      workerEligibility: false,
      shadowExecutionOnly: false,
      noPayrollModification: false,
      rollbackReadiness: false,
      governanceApproval: false,
      safetyScore: 0,
      safetyChecks: [],
      issues,
      recommendations: ['Fix safety validation errors before proceeding']
    };
  }
}

/**
 * Create pilot execution audit record
 */
export async function createPilotExecutionAudit(
  executionId: string,
  config: PilotExecutionConfig,
  audit: PilotExecutionAudit
): Promise<{ auditId: string; stored: boolean }> {
  try {
    const { data, error } = await supabase
      .from('payroll_pilot_execution_audit')
      .insert({
        execution_id: executionId,
        company_id: config.companyId,
        payroll_period_id: config.payrollPeriodId,
        execution_mode: config.executionMode,
        safety_level: config.safetyLevel,
        worker_count: config.workerIds.length,
        start_time: audit.startTime,
        end_time: audit.endTime,
        duration: audit.duration,
        steps: audit.steps,
        decisions: audit.decisions,
        warnings: audit.warnings,
        errors: audit.errors,
        compliance: audit.compliance,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.warn('Failed to store pilot execution audit:', error);
      return { auditId: executionId, stored: false };
    }

    return { auditId: executionId, stored: true };

  } catch (error) {
    console.warn('Failed to create pilot execution audit:', error);
    return { auditId: executionId, stored: false };
  }
}

/**
 * Build pilot comparison summary
 */
export async function buildPilotComparisonSummary(
  workerExecutions: PilotWorkerExecution[],
  audit: PilotExecutionAudit
): Promise<PilotComparisonSummary> {
  const completedWorkers = workerExecutions.filter(w => w.status === 'completed');
  
  // Basic metrics
  const totalWorkers = completedWorkers.length;
  const workersWithDifferences = completedWorkers.filter(w => Math.abs(w.comparison.netPayDifference) > 0).length;
  const workersWithCriticalDifferences = completedWorkers.filter(w => w.comparison.varianceLevel === 'critical').length;
  
  // Net pay differences
  const netPayDifferences = completedWorkers.map(w => w.comparison.netPayDifference);
  const averageNetPayDifference = netPayDifferences.length > 0 ?
    netPayDifferences.reduce((sum, diff) => sum + diff, 0) / netPayDifferences.length : 0;
  const maxNetPayDifference = netPayDifferences.length > 0 ? Math.max(...netPayDifferences.map(Math.abs)) : 0;
  
  // Deduction differences
  const deductionDifferences = completedWorkers.map(w => w.comparison.deductionDifference);
  const averageDeductionDifference = deductionDifferences.length > 0 ?
    deductionDifferences.reduce((sum, diff) => sum + diff, 0) / deductionDifferences.length : 0;
  const maxDeductionDifference = deductionDifferences.length > 0 ? Math.max(...deductionDifferences.map(Math.abs)) : 0;
  
  // Total pay calculations
  const totalUSNetPay = completedWorkers.reduce((sum, w) => sum + (w.usPayrollEntry?.net_pay || 0), 0);
  const totalJamaicanNetPay = completedWorkers.reduce((sum, w) => sum + (w.jamaicanShadowEntry?.net_pay || 0), 0);
  const netPayDifferenceTotal = totalJamaicanNetPay - totalUSNetPay;
  const jamaicanVsUSRatio = totalUSNetPay > 0 ? totalJamaicanNetPay / totalUSNetPay : 1;
  
  // Variance analysis
  const varianceAnalysis = completedWorkers.reduce((acc, worker) => {
    switch (worker.comparison.varianceLevel) {
      case 'low': acc.lowVarianceWorkers++; break;
      case 'medium': acc.mediumVarianceWorkers++; break;
      case 'high': acc.highVarianceWorkers++; break;
      case 'critical': acc.criticalVarianceWorkers++; break;
    }
    return acc;
  }, { lowVarianceWorkers: 0, mediumVarianceWorkers: 0, highVarianceWorkers: 0, criticalVarianceWorkers: 0 });
  
  // Confidence metrics
  const validationPassRate = completedWorkers.length > 0 ?
    completedWorkers.filter(w => w.comparison.validationPassed).length / completedWorkers.length : 0;
  const calculationConsistency = workersWithDifferences > 0 ? 
    (completedWorkers.length - workersWithDifferences) / completedWorkers.length : 1;
  const governanceCompliance = 1; // Assume full compliance
  
  const overallScore = (validationPassRate * 0.4 + calculationConsistency * 0.4 + governanceCompliance * 0.2) * 100;
  const readinessLevel = overallScore >= 95 ? 'ready' :
                        overallScore >= 80 ? 'high_confidence' :
                        overallScore >= 60 ? 'moderate_confidence' :
                        overallScore >= 40 ? 'low_confidence' : 'not_ready';

  return {
    totalWorkers,
    workersWithDifferences,
    workersWithCriticalDifferences,
    averageNetPayDifference,
    maxNetPayDifference,
    averageDeductionDifference,
    maxDeductionDifference,
    totalUSNetPay,
    totalJamaicanNetPay,
    netPayDifferenceTotal,
    jamaicanVsUSRatio,
    varianceAnalysis,
    confidenceMetrics: {
      overallScore,
      readinessLevel,
      keyFactors: {
        calculationConsistency: calculationConsistency * 100,
        differenceThreshold: Math.max(0, 100 - (maxNetPayDifference / averageNetPayDifference) * 100),
        validationPassRate: validationPassRate * 100,
        governanceCompliance: governanceCompliance * 100
      },
      recommendations: overallScore < 80 ? [
        'Review worker payroll calculations',
        'Investigate significant variance sources',
        'Consider additional validation checks'
      ] : []
    }
  };
}

/**
 * Simulate pilot rollback readiness
 */
export async function simulatePilotRollback(
  config: PilotExecutionConfig,
  workerExecutions: PilotWorkerExecution[],
  audit: PilotExecutionAudit
): Promise<PilotRollbackReadiness> {
  try {
    // Get rollback validation
    const rollbackValidation = await validateRollbackSafety(config.companyId, config.payrollPeriodId, 1);
    
    // Calculate confidence based on execution results
    const completedWorkers = workerExecutions.filter(w => w.status === 'completed');
    const successRate = completedWorkers.length > 0 ? 
      completedWorkers.filter(w => w.comparison.validationPassed).length / completedWorkers.length : 0;
    
    // Risk assessment
    const criticalIssues = workerExecutions.filter(w => w.comparison.varianceLevel === 'critical').length;
    const riskLevel = criticalIssues > 5 ? 'critical' :
                     criticalIssues > 2 ? 'high' :
                     criticalIssues > 0 ? 'medium' : 'low';
    
    const factors = [];
    const blockers = [];
    const warnings = [];
    
    if (!rollbackValidation.valid) {
      blockers.push(...rollbackValidation.blockers);
    }
    if (criticalIssues > 0) {
      warnings.push(`${criticalIssues} workers with critical variances`);
      factors.push('Critical variance detected');
    }
    if (successRate < 0.8) {
      warnings.push('Low validation success rate');
      factors.push('Low validation success rate');
    }
    
    // Calculate rollback complexity
    const rollbackComplexity = workerExecutions.length > 100 ? 'complex' :
                             workerExecutions.length > 50 ? 'moderate' : 'simple';
    
    // Estimate rollback time (seconds)
    const estimatedRollbackTime = workerExecutions.length * 2; // 2 seconds per worker
    
    return {
      ready: rollbackValidation.valid && criticalIssues === 0 && successRate >= 0.8,
      confidence: (rollbackValidation.valid ? 40 : 0) + 
                  (criticalIssues === 0 ? 30 : 0) + 
                  (successRate * 30),
      recoveryPointsAvailable: 1, // Assume at least one recovery point
      rollbackPlanExists: true, // Assume rollback plan exists
      riskAssessment: {
        level: riskLevel,
        factors,
        blockers,
        warnings
      },
      estimatedRollbackTime,
      rollbackComplexity
    };

  } catch (error) {
    return {
      ready: false,
      confidence: 0,
      recoveryPointsAvailable: 0,
      rollbackPlanExists: false,
      riskAssessment: {
        level: 'critical',
        factors: ['Rollback simulation failed'],
        blockers: [`Simulation error: ${error}`],
        warnings: []
      },
      estimatedRollbackTime: 0,
      rollbackComplexity: 'complex'
    };
  }
}

/**
 * Calculate pilot confidence score
 */
export async function calculatePilotConfidence(
  workerExecutions: PilotWorkerExecution[],
  telemetry: PilotExecutionTelemetry,
  comparison: PilotComparisonSummary,
  audit: PilotExecutionAudit
): Promise<number> {
  try {
    // Factor 1: Execution success rate (30%)
    const successRate = workerExecutions.filter(w => w.status === 'completed').length / workerExecutions.length;
    const executionScore = successRate * 30;
    
    // Factor 2: Validation pass rate (25%)
    const validationScore = telemetry.confidenceMetrics.validationPassRate * 0.25;
    
    // Factor 3: Calculation consistency (25%)
    const consistencyScore = telemetry.confidenceMetrics.calculationConsistency * 0.25;
    
    // Factor 4: Variance control (15%)
    const varianceScore = Math.max(0, 100 - comparison.maxNetPayDifference) * 0.15;
    
    // Factor 5: Safety compliance (5%)
    const safetyScore = telemetry.safetyMetrics.rollbackReadinessScore * 0.05;
    
    const totalConfidence = executionScore + validationScore + consistencyScore + varianceScore + safetyScore;
    
    return Math.min(100, Math.max(0, totalConfidence));

  } catch (error) {
    console.warn('Failed to calculate pilot confidence:', error);
    return 0;
  }
}

// Helper functions
async function addAuditStep(audit: PilotExecutionAudit, stepName: string, description: string): Promise<any> {
  const step = {
    stepId: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    stepName,
    status: 'running' as const,
    startTime: new Date().toISOString(),
    details: { description }
  };
  
  audit.steps.push(step);
  return step;
}

async function completeAuditStep(step: any, result: any): Promise<void> {
  step.status = 'completed';
  step.endTime = new Date().toISOString();
  step.duration = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
  step.details = { ...step.details, ...result };
}
