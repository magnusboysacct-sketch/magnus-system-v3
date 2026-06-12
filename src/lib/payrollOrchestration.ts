// Payroll Orchestration Layer - Phase 2D-3
// Safe orchestration for controlled payroll routing and execution
// PHASE 2D-3 SAFE ORCHESTRATION ONLY — NOT ACTIVE PAYROLL

import { supabase } from './supabase';
import { resolvePayrollExecutionMode, type PayrollRoutingDecision } from './payrollEngineRouting';
import { executeDualRunPayroll, type PayrollDualRunResult } from './payrollDualRun';
import { validateRollbackSafety, generateRollbackPlan } from './payrollRollbackInfrastructure';
import { PayrollActivationInfrastructure } from './payrollActivationInfrastructure';
import { payrollMigrationApprovals } from './payrollMigrationApprovals';
import { payrollMonitor } from './payrollMonitoring';
import type { PayrollPeriod, PayrollEntry } from './payroll';

// Orchestration type definitions
export interface PayrollOrchestrationConfig {
  companyId: string;
  payrollPeriodId: string;
  executionMode: 'safe_shadow' | 'dual_run' | 'pilot' | 'production';
  safetyLevel: 'conservative' | 'moderate' | 'aggressive';
  enableFallback: boolean;
  enableAudit: boolean;
  enableValidation: boolean;
}

export interface PayrollOrchestrationResult {
  success: boolean;
  executionPath: PayrollExecutionPath;
  primaryEntries: PayrollEntry[];
  shadowEntries?: PayrollEntry[];
  comparison?: any;
  audit: PayrollOrchestrationAudit;
  safety: PayrollOrchestrationSafety;
  fallback?: PayrollFallbackResult;
  metadata: PayrollOrchestrationMetadata;
}

export interface PayrollExecutionPath {
  mode: 'us_primary' | 'jamaican_primary' | 'dual_run' | 'shadow_comparison';
  routingDecision: PayrollRoutingDecision;
  safetyValidations: PayrollSafetyValidation[];
  executionOrder: string[];
  rollbackPlan?: any;
}

export interface PayrollOrchestrationAudit {
  orchestrationId: string;
  startTime: string;
  endTime: string;
  duration: number;
  steps: PayrollOrchestrationStep[];
  decisions: PayrollOrchestrationDecision[];
  warnings: string[];
  errors: string[];
  compliance: PayrollComplianceCheck[];
}

export interface PayrollOrchestrationStep {
  stepId: string;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: string;
  endTime?: string;
  duration?: number;
  input?: any;
  output?: any;
  error?: string;
}

export interface PayrollOrchestrationDecision {
  decisionId: string;
  decisionType: 'routing' | 'safety' | 'fallback' | 'validation';
  decision: string;
  reason: string;
  timestamp: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface PayrollOrchestrationSafety {
  executionLock: boolean;
  duplicatePrevention: boolean;
  rollbackReadiness: boolean;
  activationFlags: boolean;
  migrationConfidence: boolean;
  approvalValidation: boolean;
  safetyScore: number;
  safetyChecks: PayrollSafetyCheck[];
}

export interface PayrollSafetyValidation {
  validationType: 'execution_lock' | 'duplicate_prevention' | 'rollback_readiness' | 'activation_flags' | 'migration_confidence' | 'approval_validation';
  valid: boolean;
  message: string;
  details?: any;
}

export interface PayrollSafetyCheck {
  checkName: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  timestamp: string;
  details?: any;
}

export interface PayrollFallbackResult {
  triggered: boolean;
  reason: string;
  fromMode: string;
  toMode: string;
  timestamp: string;
  successful: boolean;
  details?: any;
}

export interface PayrollOrchestrationMetadata {
  orchestrationId: string;
  companyId: string;
  payrollPeriodId: string;
  executedBy: string;
  executionMode: string;
  totalWorkers: number;
  processedWorkers: number;
  failedWorkers: number;
  totalAmount: number;
  shadowAmount?: number;
  netDifference?: number;
  version: string;
}

export interface PayrollComplianceCheck {
  checkType: 'governance' | 'approval' | 'audit' | 'safety';
  status: 'compliant' | 'non_compliant' | 'warning';
  message: string;
  timestamp: string;
}

// Orchestration state management
class PayrollOrchestrationState {
  private activeOrchestrations = new Map<string, PayrollOrchestrationConfig>();
  private executionLocks = new Map<string, { lockId: string; timestamp: string; userId: string }>();
  private duplicateTracking = new Map<string, { lastExecution: string; checksum: string }>();

  public async acquireExecutionLock(companyId: string, payrollPeriodId: string, userId: string): Promise<string | null> {
    const lockKey = `${companyId}-${payrollPeriodId}`;
    const existingLock = this.executionLocks.get(lockKey);
    
    // Check if lock exists and is recent (within 30 minutes)
    if (existingLock) {
      const lockAge = Date.now() - new Date(existingLock.timestamp).getTime();
      if (lockAge < 30 * 60 * 1000) {
        return null; // Lock is still active
      }
      // Lock expired, remove it
      this.executionLocks.delete(lockKey);
    }
    
    // Create new lock
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.executionLocks.set(lockKey, {
      lockId,
      timestamp: new Date().toISOString(),
      userId
    });
    
    return lockId;
  }

  public releaseExecutionLock(companyId: string, payrollPeriodId: string, lockId: string): boolean {
    const lockKey = `${companyId}-${payrollPeriodId}`;
    const existingLock = this.executionLocks.get(lockKey);
    
    if (existingLock && existingLock.lockId === lockId) {
      this.executionLocks.delete(lockKey);
      return true;
    }
    
    return false;
  }

  public async checkDuplicateExecution(companyId: string, payrollPeriodId: string, checksum: string): Promise<boolean> {
    const trackingKey = `${companyId}-${payrollPeriodId}`;
    const existing = this.duplicateTracking.get(trackingKey);
    
    if (existing && existing.checksum === checksum) {
      const lastExecutionTime = new Date(existing.lastExecution).getTime();
      const timeSinceLastExecution = Date.now() - lastExecutionTime;
      
      // Consider duplicate if same checksum within 5 minutes
      if (timeSinceLastExecution < 5 * 60 * 1000) {
        return true;
      }
    }
    
    // Update tracking
    this.duplicateTracking.set(trackingKey, {
      lastExecution: new Date().toISOString(),
      checksum
    });
    
    return false;
  }

  public addOrchestration(orchestrationId: string, config: PayrollOrchestrationConfig): void {
    this.activeOrchestrations.set(orchestrationId, config);
  }

  public removeOrchestration(orchestrationId: string): void {
    this.activeOrchestrations.delete(orchestrationId);
  }

  public getActiveOrchestration(orchestrationId: string): PayrollOrchestrationConfig | undefined {
    return this.activeOrchestrations.get(orchestrationId);
  }
}

// Global orchestration state
const orchestrationState = new PayrollOrchestrationState();

/**
 * Main orchestration function for safe payroll execution
 */
export async function orchestratePayrollExecution(
  config: PayrollOrchestrationConfig,
  userId: string
): Promise<PayrollOrchestrationResult> {
  const orchestrationId = `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = new Date().toISOString();
  let lockId: string | null = null;
  
  orchestrationState.addOrchestration(orchestrationId, config);
  
  try {
    // Initialize audit trail
    const audit: PayrollOrchestrationAudit = {
      orchestrationId,
      startTime,
      endTime: '',
      duration: 0,
      steps: [],
      decisions: [],
      warnings: [],
      errors: [],
      compliance: []
    };

    // Step 1: Acquire execution lock
    const lockStep = await addAuditStep(audit, 'acquire_execution_lock', 'Acquiring execution lock');
    lockId = await orchestrationState.acquireExecutionLock(config.companyId, config.payrollPeriodId, userId);
    
    if (!lockId) {
      throw new Error('Failed to acquire execution lock - another execution may be in progress');
    }
    
    await completeAuditStep(lockStep, { lockId });

    // Step 2: Validate execution safety
    const safetyStep = await addAuditStep(audit, 'validate_execution_safety', 'Validating execution safety');
    const safetyResult = await validateExecutionSafety(config, audit);
    await completeAuditStep(safetyStep, safetyResult);

    if (!safetyResult.safe) {
      throw new Error(`Execution safety validation failed: ${safetyResult.issues.join(', ')}`);
    }

    // Step 3: Resolve execution path
    const pathStep = await addAuditStep(audit, 'resolve_execution_path', 'Resolving execution path');
    const executionPath = await resolveSafeExecutionPath(config, audit);
    await completeAuditStep(pathStep, executionPath);

    // Step 4: Execute payroll based on resolved path
    const executeStep = await addAuditStep(audit, 'execute_payroll', 'Executing payroll');
    const payrollResult = await executePayrollWithSafety(config, executionPath, audit);
    await completeAuditStep(executeStep, payrollResult);

    // Step 5: Create execution audit
    const auditStep = await addAuditStep(audit, 'create_execution_audit', 'Creating execution audit');
    const executionAudit = await createExecutionAudit(orchestrationId, config, payrollResult, audit);
    await completeAuditStep(auditStep, executionAudit);

    // Step 6: Build execution summary
    const summaryStep = await addAuditStep(audit, 'build_execution_summary', 'Building execution summary');
    const summary = await buildExecutionSummary(config, payrollResult, audit);
    await completeAuditStep(summaryStep, summary);

    // Complete orchestration
    const endTime = new Date().toISOString();
    audit.endTime = endTime;
    audit.duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    // Release execution lock
    orchestrationState.releaseExecutionLock(config.companyId, config.payrollPeriodId, lockId);

    const result: PayrollOrchestrationResult = {
      success: true,
      executionPath,
      primaryEntries: payrollResult.primaryEntries,
      shadowEntries: payrollResult.shadowEntries,
      comparison: payrollResult.comparison,
      audit,
      safety: safetyResult,
      metadata: {
        orchestrationId,
        companyId: config.companyId,
        payrollPeriodId: config.payrollPeriodId,
        executedBy: userId,
        executionMode: config.executionMode,
        totalWorkers: payrollResult.primaryEntries.length,
        processedWorkers: payrollResult.primaryEntries.length,
        failedWorkers: 0,
        totalAmount: payrollResult.primaryEntries.reduce((sum, entry) => sum + entry.net_pay, 0),
        shadowAmount: payrollResult.shadowEntries?.reduce((sum, entry) => sum + entry.net_pay, 0),
        netDifference: payrollResult.shadowEntries ? 
          payrollResult.shadowEntries.reduce((sum, entry) => sum + entry.net_pay, 0) - 
          payrollResult.primaryEntries.reduce((sum, entry) => sum + entry.net_pay, 0) : undefined,
        version: '2D-3-safe-orchestration'
      }
    };

    orchestrationState.removeOrchestration(orchestrationId);
    return result;

  } catch (error) {
    // Handle orchestration failure
    const endTime = new Date().toISOString();
    const failedAudit: PayrollOrchestrationAudit = {
      orchestrationId,
      startTime,
      endTime,
      duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
      steps: [],
      decisions: [],
      warnings: [],
      errors: [`Orchestration failed: ${error}`],
      compliance: []
    };

    // Ensure lock is released on failure
    if (lockId) {
      orchestrationState.releaseExecutionLock(config.companyId, config.payrollPeriodId, lockId);
    }
    
    orchestrationState.removeOrchestration(orchestrationId);

    throw error;
  }
}

/**
 * Validate execution safety before proceeding
 */
export async function validateExecutionSafety(
  config: PayrollOrchestrationConfig,
  audit: PayrollOrchestrationAudit
): Promise<PayrollOrchestrationSafety & { safe: boolean; issues: string[] }> {
  const safetyChecks: PayrollSafetyCheck[] = [];
  const issues: string[] = [];

  // Check 1: Execution lock
  const lockCheck: PayrollSafetyCheck = {
    checkName: 'execution_lock',
    status: 'pass',
    message: 'Execution lock available',
    timestamp: new Date().toISOString()
  };
  safetyChecks.push(lockCheck);

  // Check 2: Duplicate prevention
  const checksum = generateChecksum(config);
  const isDuplicate = await orchestrationState.checkDuplicateExecution(
    config.companyId, 
    config.payrollPeriodId, 
    checksum
  );
  
  const duplicateCheck: PayrollSafetyCheck = {
    checkName: 'duplicate_prevention',
    status: isDuplicate ? 'fail' : 'pass',
    message: isDuplicate ? 'Duplicate execution detected' : 'No duplicate execution',
    timestamp: new Date().toISOString()
  };
  safetyChecks.push(duplicateCheck);
  
  if (isDuplicate) {
    issues.push('Duplicate execution prevented');
  }

  // Check 3: Rollback readiness
  const rollbackReadiness = await validateRollbackSafety(config.companyId, config.payrollPeriodId, 1);
  const rollbackCheck: PayrollSafetyCheck = {
    checkName: 'rollback_readiness',
    status: rollbackReadiness.valid ? 'pass' : 'warning',
    message: rollbackReadiness.valid ? 'Rollback ready' : 'Rollback may not be safe',
    timestamp: new Date().toISOString(),
    details: rollbackReadiness
  };
  safetyChecks.push(rollbackCheck);

  if (!rollbackReadiness.valid) {
    issues.push('Rollback readiness concerns');
  }

  // Check 4: Activation flags
  const activationFlags = await PayrollActivationInfrastructure.getActivationFlags(config.companyId);
  const activationCheck: PayrollSafetyCheck = {
    checkName: 'activation_flags',
    status: activationFlags ? 'pass' : 'warning',
    message: activationFlags ? 'Activation flags available' : 'Activation flags missing',
    timestamp: new Date().toISOString(),
    details: activationFlags
  };
  safetyChecks.push(activationCheck);

  if (!activationFlags) {
    issues.push('Activation flags not configured');
  }

  // Check 5: Migration confidence
  const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(config.payrollPeriodId, config.companyId);
  const confidenceCheck: PayrollSafetyCheck = {
    checkName: 'migration_confidence',
    status: (migrationApproval?.migrationReadinessScore || 0) >= 95 ? 'pass' : 'warning',
    message: `Migration confidence: ${migrationApproval?.migrationReadinessScore || 0}%`,
    timestamp: new Date().toISOString(),
    details: migrationApproval
  };
  safetyChecks.push(confidenceCheck);

  if ((migrationApproval?.migrationReadinessScore || 0) < 95) {
    issues.push('Migration confidence below threshold');
  }

  // Check 6: Approval validation
  const approvalValid = migrationApproval?.migrationStatus === 'fully_approved';
  const approvalCheck: PayrollSafetyCheck = {
    checkName: 'approval_validation',
    status: approvalValid ? 'pass' : 'fail',
    message: approvalValid ? 'Approvals valid' : 'Required approvals missing',
    timestamp: new Date().toISOString(),
    details: migrationApproval
  };
  safetyChecks.push(approvalCheck);

  if (!approvalValid) {
    issues.push('Required approvals not obtained');
  }

  // Calculate overall safety score
  const passedChecks = safetyChecks.filter(check => check.status === 'pass').length;
  const safetyScore = (passedChecks / safetyChecks.length) * 100;

  const safety: PayrollOrchestrationSafety = {
    executionLock: true,
    duplicatePrevention: !isDuplicate,
    rollbackReadiness: rollbackReadiness.valid,
    activationFlags: !!activationFlags,
    migrationConfidence: (migrationApproval?.migrationReadinessScore || 0) >= 95,
    approvalValidation: approvalValid,
    safetyScore,
    safetyChecks
  };

  return {
    ...safety,
    safe: issues.length === 0,
    issues
  };
}

/**
 * Resolve safe execution path based on configuration and safety checks
 */
export async function resolveSafeExecutionPath(
  config: PayrollOrchestrationConfig,
  audit: PayrollOrchestrationAudit
): Promise<PayrollExecutionPath> {
  // Get routing decision
  const routingDecision = await resolvePayrollExecutionMode(
    config.companyId,
    config.payrollPeriodId
  );

  // Apply safety constraints based on execution mode
  let executionMode: PayrollExecutionPath['mode'];
  
  switch (config.executionMode) {
    case 'safe_shadow':
      // Always use US as primary, Jamaican as shadow only
      executionMode = 'shadow_comparison';
      break;
    case 'dual_run':
      executionMode = 'dual_run';
      break;
    case 'pilot':
      executionMode = 'shadow_comparison';
      break;
    case 'production':
      // Only allow production if all safety checks pass and approvals are complete
      const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(config.payrollPeriodId, config.companyId);
      if (migrationApproval?.migrationStatus === 'fully_approved' && (migrationApproval?.migrationReadinessScore || 0) >= 99) {
        executionMode = 'jamaican_primary';
      } else {
        executionMode = 'shadow_comparison';
      }
      break;
    default:
      executionMode = 'shadow_comparison';
  }

  // Create rollback plan for safety
  let rollbackPlan;
  try {
    rollbackPlan = await generateRollbackPlan(config.companyId, config.payrollPeriodId, 'planned', 'planned', 1);
  } catch (error) {
    // Rollback plan creation failure shouldn't block execution
    console.warn('Failed to create rollback plan:', error);
  }

  // Create a placeholder routing decision for now
  const placeholderRoutingDecision: PayrollRoutingDecision = {
    selectedMode: 'us',
    selectedEngine: {
      primaryEngine: 'us',
      executionStrategy: 'single'
    },
    safetyResult: {
      valid: true,
      issues: [],
      warnings: [],
      recommendations: [],
      governanceRequired: false
    },
    fallbackStrategy: {
      primaryMode: 'us',
      fallbackMode: 'us',
      fallbackConditions: [],
      autoRollbackEnabled: false
    },
    routingReason: 'Safe orchestration - US primary only',
    timestamp: new Date().toISOString()
  };

  const executionPath: PayrollExecutionPath = {
    mode: executionMode,
    routingDecision: placeholderRoutingDecision,
    safetyValidations: [],
    executionOrder: ['validate_inputs', 'execute_primary', 'shadow_comparison', 'validate_results', 'store_audit'],
    rollbackPlan
  };

  // Record decision in audit
  audit.decisions.push({
    decisionId: `decision_${Date.now()}`,
    decisionType: 'routing',
    decision: executionMode,
    reason: `Execution mode: ${config.executionMode}, Safety level: ${config.safetyLevel}`,
    timestamp: new Date().toISOString(),
    impact: 'high'
  });

  return executionPath;
}

/**
 * Execute payroll with safety protections
 */
export async function executePayrollWithSafety(
  config: PayrollOrchestrationConfig,
  executionPath: PayrollExecutionPath,
  audit: PayrollOrchestrationAudit
): Promise<{
  primaryEntries: PayrollEntry[];
  shadowEntries?: PayrollEntry[];
  comparison?: any;
}> {
  // For safe orchestration, always execute US payroll as primary
  // Jamaican payroll only runs in shadow mode for comparison
  
  const primaryEntries: PayrollEntry[] = [];
  let shadowEntries: PayrollEntry[] | undefined;
  let comparison: any;

  // Step 1: Execute US payroll (always primary in safe mode)
  try {
    // This would integrate with existing payroll.ts logic
    // For now, we'll simulate the execution
    const usResult = await executeUSPayrollSafely(config.companyId, config.payrollPeriodId);
    primaryEntries.push(...usResult.entries);
    
    audit.steps.push({
      stepId: `step_${Date.now()}`,
      stepName: 'execute_us_payroll',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 100,
      input: { companyId: config.companyId, payrollPeriodId: config.payrollPeriodId },
      output: { entryCount: usResult.entries.length, totalAmount: usResult.totalAmount }
    });
  } catch (error) {
    audit.errors.push(`US payroll execution failed: ${error}`);
    throw new Error(`Primary payroll execution failed: ${error}`);
  }

  // Step 2: Execute shadow comparison if enabled
  if (config.executionMode === 'safe_shadow' || config.executionMode === 'dual_run') {
    try {
      const shadowResult = await executeShadowComparison(primaryEntries, config);
      shadowEntries = shadowResult.shadowEntries;
      comparison = shadowResult.comparison;
      
      audit.steps.push({
        stepId: `step_${Date.now()}`,
        stepName: 'execute_shadow_comparison',
        status: 'completed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 150,
        input: { primaryEntryCount: primaryEntries.length },
        output: { shadowEntryCount: shadowEntries?.length || 0, comparisonValid: comparison?.valid }
      });
    } catch (error) {
      audit.warnings.push(`Shadow comparison failed: ${error}`);
      // Shadow failure shouldn't block primary execution
    }
  }

  return {
    primaryEntries,
    shadowEntries,
    comparison
  };
}

/**
 * Execute US payroll safely (integration point)
 */
async function executeUSPayrollSafely(
  companyId: string,
  payrollPeriodId: string
): Promise<{ entries: PayrollEntry[]; totalAmount: number }> {
  // This would integrate with the existing generatePayrollEntries function
  // For now, return a placeholder result
  return {
    entries: [],
    totalAmount: 0
  };
}

/**
 * Execute shadow comparison with Jamaican payroll
 */
export async function executeShadowComparison(
  primaryEntries: PayrollEntry[],
  config: PayrollOrchestrationConfig
): Promise<{ shadowEntries: PayrollEntry[]; comparison: any }> {
  // This would integrate with dual-run infrastructure
  // For now, return a placeholder result
  return {
    shadowEntries: [],
    comparison: {
      valid: true,
      issues: [],
      warnings: [],
      summary: {
        totalWorkers: primaryEntries.length,
        workersWithDifferences: 0,
        averageNetPayDifference: 0
      }
    }
  };
}

/**
 * Execute protected dual-run mode
 */
export async function executeProtectedDualRun(
  config: PayrollOrchestrationConfig
): Promise<PayrollDualRunResult> {
  // This would integrate with dual-run infrastructure with additional safety
  // For now, return a placeholder result
  return {
    usEntries: [],
    jamaicanEntries: [],
    comparison: {
      valid: true,
      issues: [],
      warnings: [],
      recommendations: [],
      summary: {
        totalWorkers: 0,
        workersWithDifferences: 0,
        workersWithCriticalDifferences: 0,
        averageNetPayDifference: 0,
        maxNetPayDifference: 0,
        averageDeductionDifference: 0,
        maxDeductionDifference: 0,
        totalJamaicanNetPay: 0,
        totalUSNetPay: 0,
        netPayDifferenceTotal: 0,
        jamaicanVsUSRatio: 1
      },
      confidence: {
        overallScore: 95,
        readinessLevel: 'high_confidence',
        keyFactors: {
          calculationConsistency: 95,
          differenceThreshold: 95,
          validationPassRate: 95,
          governanceCompliance: 95
        },
        recommendations: []
      }
    },
    executionMetadata: {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 200,
      usCalculationTime: 100,
      jamaicanCalculationTime: 80,
      comparisonTime: 20
    }
  };
}

/**
 * Create execution audit record
 */
export async function createExecutionAudit(
  orchestrationId: string,
  config: PayrollOrchestrationConfig,
  result: any,
  audit: PayrollOrchestrationAudit
): Promise<{ auditId: string; stored: boolean }> {
  try {
    // Store audit in database
    const { data, error } = await supabase
      .from('payroll_orchestration_audits')
      .insert({
        orchestration_id: orchestrationId,
        company_id: config.companyId,
        payroll_period_id: config.payrollPeriodId,
        execution_mode: config.executionMode,
        safety_level: config.safetyLevel,
        audit_data: audit,
        result_data: result,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Failed to store execution audit:', error);
      return { auditId: orchestrationId, stored: false };
    }

    return { auditId: data.id, stored: true };
  } catch (error) {
    console.warn('Failed to create execution audit:', error);
    return { auditId: orchestrationId, stored: false };
  }
}

/**
 * Build execution summary
 */
export async function buildExecutionSummary(
  config: PayrollOrchestrationConfig,
  result: any,
  audit: PayrollOrchestrationAudit
): Promise<{ summaryId: string; summary: any }> {
  const summary = {
    orchestrationId: audit.orchestrationId,
    executionMode: config.executionMode,
    safetyLevel: config.safetyLevel,
    duration: audit.duration,
    totalSteps: audit.steps.length,
    completedSteps: audit.steps.filter(step => step.status === 'completed').length,
    failedSteps: audit.steps.filter(step => step.status === 'failed').length,
    warnings: audit.warnings.length,
    errors: audit.errors.length,
    primaryEntries: result.primaryEntries?.length || 0,
    shadowEntries: result.shadowEntries?.length || 0,
    comparisonValid: result.comparison?.valid || false,
    safetyScore: result.safety?.safetyScore || 0,
    timestamp: new Date().toISOString()
  };

  return {
    summaryId: `summary_${audit.orchestrationId}`,
    summary
  };
}

// Helper functions
function generateChecksum(config: PayrollOrchestrationConfig): string {
  const configString = JSON.stringify(config);
  return btoa(configString).substring(0, 16);
}

async function addAuditStep(audit: PayrollOrchestrationAudit, stepName: string, description: string): Promise<PayrollOrchestrationStep> {
  const step: PayrollOrchestrationStep = {
    stepId: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    stepName,
    status: 'running',
    startTime: new Date().toISOString()
  };
  
  audit.steps.push(step);
  return step;
}

async function completeAuditStep(step: PayrollOrchestrationStep, output: any): Promise<void> {
  step.status = 'completed';
  step.endTime = new Date().toISOString();
  step.duration = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
  step.output = output;
}

// Export orchestration utilities
export { orchestrationState };
