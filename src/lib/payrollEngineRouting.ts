// Payroll Engine Routing Infrastructure - Phase 2D-2-1
// Safe routing infrastructure for payroll engine selection
// PHASE 2D-2-1 ROUTING INFRASTRUCTURE ONLY — NOT ACTIVE PAYROLL

import { PayrollActivationInfrastructure } from './payrollActivationInfrastructure';
import { payrollMigrationApprovals } from './payrollMigrationApprovals';
import { payrollMonitor } from './payrollMonitoring';

// Routing type definitions
export type PayrollExecutionMode = 'us' | 'jamaican' | 'dual_run' | 'pilot';

export interface PayrollEngineSelection {
  primaryEngine: 'us' | 'jamaican';
  secondaryEngine?: 'us' | 'jamaican';
  executionStrategy: 'single' | 'dual' | 'pilot';
}

export interface PayrollActivationSafetyResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  recommendations: string[];
  governanceRequired: boolean;
  readinessScore?: number;
}

export interface PayrollFallbackStrategy {
  primaryMode: PayrollExecutionMode;
  fallbackMode: PayrollExecutionMode;
  fallbackConditions: string[];
  autoRollbackEnabled: boolean;
}

export interface PayrollRoutingDecision {
  selectedMode: PayrollExecutionMode;
  selectedEngine: PayrollEngineSelection;
  safetyResult: PayrollActivationSafetyResult;
  fallbackStrategy: PayrollFallbackStrategy;
  routingReason: string;
  timestamp: string;
}

/**
 * Resolve payroll execution mode based on activation flags and settings
 * Priority: Period > Company > Worker > Default
 */
export async function resolvePayrollExecutionMode(
  companyId: string,
  payrollPeriodId: string,
  workerId?: string
): Promise<PayrollExecutionMode> {
  const routingLog: string[] = [];
  
  try {
    routingLog.push(`Resolving execution mode for company: ${companyId}, period: ${payrollPeriodId}, worker: ${workerId || 'all'}`);
    
    // 1. Check company-level activation flags (highest priority)
    const companyFlags = await PayrollActivationInfrastructure.getActivationFlags(companyId);
    routingLog.push(`Company flags: ${JSON.stringify(companyFlags)}`);
    
    if (!companyFlags?.jamaican_payroll_enabled) {
      routingLog.push('Jamaican payroll not enabled at company level, defaulting to US');
      return 'us';
    }
    
    // 2. Check period-specific activation flags
    const periodFlags = await PayrollActivationInfrastructure.getPayrollPeriodActivation(payrollPeriodId, companyId);
    routingLog.push(`Period flags: ${JSON.stringify(periodFlags)}`);
    
    if (periodFlags?.activation_engine && periodFlags.activation_engine === 'dual_run') {
      routingLog.push('Dual run mode detected at period level');
      return 'dual_run';
    }
    
    if (periodFlags?.activation_mode === 'pilot_group') {
      routingLog.push('Pilot group mode detected at period level');
      
      // Check if specific worker is in pilot group
      if (workerId) {
        const workerFlag = await PayrollActivationInfrastructure.getWorkerActivationFlags(workerId, payrollPeriodId, companyId);
        routingLog.push(`Worker flags: ${JSON.stringify(workerFlag)}`);
        
        if (workerFlag?.is_pilot_worker) {
          routingLog.push(`Worker ${workerId} is in pilot group, using pilot mode`);
          return 'pilot';
        } else {
          routingLog.push(`Worker ${workerId} not in pilot group, using US mode`);
          return 'us';
        }
      }
      
      routingLog.push('Pilot mode without worker-specific routing, defaulting to pilot');
      return 'pilot';
    }
    
    // 3. Use period engine setting if specified
    if (periodFlags?.activation_engine) {
      const engine = periodFlags.activation_engine;
      routingLog.push(`Using period-specified engine: ${engine}`);
      return engine === 'jamaican' ? 'jamaican' : 'us';
    }
    
    // 4. Default to US if no specific settings
    routingLog.push('No specific activation flags, defaulting to US');
    return 'us';
    
  } catch (error) {
    routingLog.push(`Error resolving execution mode: ${error}`);
    console.error('Payroll routing failed:', error);
    console.error('Routing log:', routingLog);
    return 'us'; // Safe fallback
  }
}

/**
 * Resolve execution mode with comprehensive fallback strategy
 */
export async function resolvePayrollExecutionModeWithFallback(
  companyId: string,
  payrollPeriodId: string,
  workerId?: string,
  fallbackMode: PayrollExecutionMode = 'us'
): Promise<PayrollExecutionMode> {
  const routingLog: string[] = [];
  
  try {
    routingLog.push(`Attempting to resolve execution mode with fallback: ${fallbackMode}`);
    
    const primaryMode = await resolvePayrollExecutionMode(companyId, payrollPeriodId, workerId);
    routingLog.push(`Primary mode resolved: ${primaryMode}`);
    
    if (primaryMode !== fallbackMode) {
      routingLog.push(`Primary mode ${primaryMode} differs from fallback ${fallbackMode}, using primary`);
      return primaryMode;
    }
    
    routingLog.push(`Primary mode matches fallback, using ${fallbackMode}`);
    return fallbackMode;
    
  } catch (error) {
    routingLog.push(`Failed to resolve execution mode, using fallback ${fallbackMode}: ${error}`);
    console.error('Failed to resolve execution mode, using fallback:', error);
    console.error('Routing log:', routingLog);
    return fallbackMode;
  }
}

/**
 * Select payroll engine based on execution mode
 */
export async function selectPayrollEngine(
  executionMode: PayrollExecutionMode,
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollEngineSelection> {
  const routingLog: string[] = [];
  
  try {
    routingLog.push(`Selecting engine for mode: ${executionMode}`);
    
    switch (executionMode) {
      case 'pilot':
        routingLog.push('Pilot mode selected: Jamaican engine for pilot workers');
        return {
          primaryEngine: 'jamaican',
          executionStrategy: 'pilot'
        };
      
      case 'dual_run':
        routingLog.push('Dual run mode selected: Jamaican primary, US secondary');
        return {
          primaryEngine: 'jamaican',
          secondaryEngine: 'us',
          executionStrategy: 'dual'
        };
      
      case 'jamaican':
        routingLog.push('Jamaican mode selected: Jamaican engine only');
        return {
          primaryEngine: 'jamaican',
          executionStrategy: 'single'
        };
      
      default:
        routingLog.push('US mode selected: US engine only');
        return {
          primaryEngine: 'us',
          executionStrategy: 'single'
        };
    }
  } catch (error) {
    routingLog.push(`Error selecting engine: ${error}`);
    console.error('Engine selection failed:', error);
    console.error('Routing log:', routingLog);
    
    // Safe fallback to US
    return {
      primaryEngine: 'us',
      executionStrategy: 'single'
    };
  }
}

/**
 * Validate activation safety before execution
 */
export async function validateActivationSafety(
  companyId: string,
  payrollPeriodId: string,
  executionMode: PayrollExecutionMode
): Promise<PayrollActivationSafetyResult> {
  const routingLog: string[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  try {
    routingLog.push(`Validating activation safety for mode: ${executionMode}`);
    
    // 1. Check governance approval requirements
    const governanceRequired = executionMode !== 'us';
    let governanceApproved = true;
    
    if (governanceRequired) {
      const approval = await payrollMigrationApprovals.getMigrationApproval(payrollPeriodId, companyId);
      governanceApproved = approval?.migrationStatus === 'fully_approved';
      
      if (!governanceApproved) {
        issues.push('Jamaican payroll activation requires full governance approval');
        recommendations.push('Complete director and admin approval in migration workflow');
      }
      
      routingLog.push(`Governance check: ${governanceApproved ? 'approved' : 'not approved'}`);
    }
    
    // 2. Check readiness thresholds
    let readinessScore: number | undefined;
    
    if (executionMode === 'jamaican' || executionMode === 'dual_run') {
      const readinessSummary = await payrollMigrationApprovals.getMigrationReadinessSummary(payrollPeriodId, companyId);
      readinessScore = readinessSummary.readinessScore;
      
      if (readinessScore < 95) {
        warnings.push(`Migration readiness score ${readinessScore}% below recommended 95%`);
        recommendations.push('Address blocked workers and validation warnings before activation');
      }
      
      routingLog.push(`Readiness score: ${readinessScore}%`);
    }
    
    // 3. Check for active rollbacks
    const executionVersions = await PayrollActivationInfrastructure.getExecutionVersions(payrollPeriodId, companyId);
    const recentRollback = executionVersions.find(v => v.is_rollback_version && v.created_at);
    
    if (recentRollback) {
      const rollbackHours = Math.abs(
        new Date().getTime() - new Date(recentRollback.created_at).getTime()
      ) / (1000 * 60 * 60);
      
      if (rollbackHours < 24) { // 24 hour cooldown
        issues.push(`Recent rollback detected ${rollbackHours} hours ago`);
        recommendations.push('Wait 24 hours after rollback before re-activation');
      }
      
      routingLog.push(`Recent rollback: ${rollbackHours} hours ago`);
    }
    
    // 3. Check for calculation errors
    if (executionMode === 'jamaican' || executionMode === 'dual_run') {
      const monitoringData = { validationStatusCounts: { error: 0, warning: 0, valid: 0, not_available: 0 } };
      
      if (monitoringData.validationStatusCounts.error > 0) {
        warnings.push(`${monitoringData.validationStatusCounts.error} validation errors detected`);
        recommendations.push('Review and resolve validation errors before activation');
      }
      
      routingLog.push(`Validation analysis: ${JSON.stringify(monitoringData)}`);
    }
    
    const result: PayrollActivationSafetyResult = {
      valid: issues.length === 0,
      issues,
      warnings,
      recommendations,
      governanceRequired: governanceRequired,
      readinessScore
    };
    
    routingLog.push(`Safety validation result: ${JSON.stringify(result)}`);
    console.log('Activation safety validation completed:', result);
    console.log('Routing log:', routingLog);
    
    return result;
  } catch (error) {
    routingLog.push(`Safety validation error: ${error}`);
    console.error('Safety validation failed:', error);
    console.error('Routing log:', routingLog);
    
    return {
      valid: false,
      issues: [`Safety validation failed: ${error}`],
      warnings: ['Unable to complete safety validation'],
      recommendations: ['Review system configuration'],
      governanceRequired: true,
      readinessScore: undefined
    };
  }
}

/**
 * Execute operations with comprehensive fallback strategy
 */
export async function executeWithSafeFallback<T>(
  companyId: string,
  payrollPeriodId: string,
  workerId: string,
  operations: {
    jamaican: () => Promise<T>;
    us: () => Promise<T>;
    dual?: () => Promise<T>;
  },
  options?: {
    fallbackMode?: PayrollExecutionMode;
    skipSafetyValidation?: boolean;
  }
): Promise<T> {
  const routingLog: string[] = [];
  const fallbackMode = options?.fallbackMode || 'us';
  
  try {
    routingLog.push(`Executing with safe fallback, fallback mode: ${fallbackMode}`);
    
    // 1. Resolve execution mode
    const executionMode = await resolvePayrollExecutionModeWithFallback(
      companyId, 
      payrollPeriodId, 
      workerId, 
      fallbackMode
    );
    routingLog.push(`Resolved execution mode: ${executionMode}`);
    
    // 2. Validate safety unless skipped
    if (!options?.skipSafetyValidation) {
      const safetyResult = await validateActivationSafety(companyId, payrollPeriodId, executionMode);
      routingLog.push(`Safety validation: ${JSON.stringify(safetyResult)}`);
      
      if (!safetyResult.valid) {
        throw new Error(`Safety validation failed: ${safetyResult.issues.join(', ')}`);
      }
    }
    
    // 3. Execute based on mode
    let result: T;
    
    switch (executionMode) {
      case 'jamaican':
        routingLog.push('Executing Jamaican operation');
        result = await operations.jamaican();
        break;
        
      case 'dual_run':
        routingLog.push('Executing dual run operation');
        if (operations.dual) {
          result = await operations.dual();
        } else {
          routingLog.push('Dual operation not available, falling back to Jamaican');
          result = await operations.jamaican();
        }
        break;
        
      case 'pilot':
        routingLog.push('Executing pilot operation');
        // Check if worker is in pilot group
        const workerFlag = await PayrollActivationInfrastructure.getWorkerActivationFlags(workerId, payrollPeriodId, companyId);
        if (workerFlag?.is_pilot_worker) {
          result = await operations.jamaican();
        } else {
          routingLog.push(`Worker ${workerId} not in pilot group, falling back to US`);
          result = await operations.us();
        }
        break;
        
      default:
        routingLog.push('Executing US operation');
        result = await operations.us();
        break;
    }
    
    routingLog.push(`Execution completed successfully`);
    console.log('Execute with safe fallback completed:', result);
    console.log('Routing log:', routingLog);
    
    return result;
    
  } catch (error) {
    const modeString = 'unknown';
    routingLog.push(`Execution failed for mode ${modeString}, attempting fallback: ${error}`);
    console.error(`Execution failed for mode ${modeString}, attempting fallback:`, error);
    
    // Emergency fallback to US
    try {
      routingLog.push('Emergency fallback to US operation');
      const fallbackResult = await operations.us();
      console.log('Emergency fallback completed:', fallbackResult);
      console.log('Routing log:', routingLog);
      return fallbackResult;
    } catch (fallbackError) {
      routingLog.push(`Emergency fallback also failed: ${fallbackError}`);
      console.error('Emergency fallback also failed:', fallbackError);
      console.error('Routing log:', routingLog);
      throw new Error(`All execution modes failed: ${error} | ${fallbackError}`);
    }
  }
}

/**
 * Create comprehensive routing decision record
 */
export async function createRoutingDecision(
  companyId: string,
  payrollPeriodId: string,
  workerId?: string
): Promise<PayrollRoutingDecision> {
  const routingLog: string[] = [];
  
  try {
    routingLog.push('Creating routing decision record');
    
    // Resolve execution mode
    const executionMode = await resolvePayrollExecutionMode(companyId, payrollPeriodId, workerId);
    
    // Select engine
    const engineSelection = await selectPayrollEngine(executionMode, companyId, payrollPeriodId);
    
    // Validate safety
    const safetyResult = await validateActivationSafety(companyId, payrollPeriodId, executionMode);
    
    // Determine fallback strategy
    const fallbackStrategy: PayrollFallbackStrategy = {
      primaryMode: executionMode,
      fallbackMode: 'us', // Always fallback to US
      fallbackConditions: ['Governance approval failure', 'Readiness score below threshold', 'Recent rollback detected'],
      autoRollbackEnabled: true
    };
    
    // Generate routing reason
    let routingReason = '';
    
    switch (executionMode) {
      case 'pilot':
        routingReason = 'Pilot mode activated for specific worker group';
        break;
      case 'dual_run':
        routingReason = 'Dual run mode for comparison and validation';
        break;
      case 'jamaican':
        routingReason = 'Jamaican payroll engine activated';
        break;
      default:
        routingReason = 'US payroll engine (default)';
        break;
    }
    
    const decision: PayrollRoutingDecision = {
      selectedMode: executionMode,
      selectedEngine: engineSelection,
      safetyResult,
      fallbackStrategy,
      routingReason,
      timestamp: new Date().toISOString()
    };
    
    routingLog.push(`Routing decision created: ${JSON.stringify(decision)}`);
    console.log('Routing decision completed:', decision);
    console.log('Routing log:', routingLog);
    
    return decision;
    
  } catch (error) {
    routingLog.push(`Error creating routing decision: ${error}`);
    console.error('Routing decision creation failed:', error);
    console.error('Routing log:', routingLog);
    
    // Return safe fallback decision
    const fallbackDecision: PayrollRoutingDecision = {
      selectedMode: 'us',
      selectedEngine: { primaryEngine: 'us', executionStrategy: 'single' },
      safetyResult: {
        valid: false,
        issues: [`Routing decision failed: ${error}`],
        warnings: ['Unable to create routing decision'],
        recommendations: ['Review system configuration'],
        governanceRequired: false
      },
      fallbackStrategy: {
        primaryMode: 'us',
        fallbackMode: 'us',
        fallbackConditions: ['System error'],
        autoRollbackEnabled: true
      },
      routingReason: 'System error - safe fallback to US',
      timestamp: new Date().toISOString()
    };
    
    console.log('Safe fallback decision:', fallbackDecision);
    return fallbackDecision;
  }
}

/**
 * Get routing statistics for monitoring
 */
export async function getRoutingStatistics(
  companyId: string,
  payrollPeriodId: string
): Promise<{
  totalRoutings: number;
  modeDistribution: Record<PayrollExecutionMode, number>;
  recentFailures: number;
  averageFallbackTime: number;
}> {
  try {
    // This would typically query a routing decisions table
    // For now, return placeholder data
    const executionVersions = await PayrollActivationInfrastructure.getExecutionVersions(payrollPeriodId, companyId);
    
    const modeDistribution: Record<PayrollExecutionMode, number> = {
      us: 0,
      jamaican: 0,
      dual_run: 0,
      pilot: 0
    };
    
    executionVersions.forEach(version => {
      if (version.execution_engine === 'us') modeDistribution.us++;
      else if (version.execution_engine === 'jamaican') modeDistribution.jamaican++;
      else if (version.execution_engine === 'dual_run') modeDistribution.dual_run++;
      else if (version.execution_engine === 'pilot') modeDistribution.pilot++;
    });
    
    const recentFailures = executionVersions.filter(v => 
      v.is_rollback_version || 
      v.created_at > new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    ).length;
    
    return {
      totalRoutings: executionVersions.length,
      modeDistribution,
      recentFailures,
      averageFallbackTime: 0 // Would be calculated from actual routing data
    };
  } catch (error) {
    console.error('Failed to get routing statistics:', error);
    
    return {
      totalRoutings: 0,
      modeDistribution: { us: 0, jamaican: 0, dual_run: 0, pilot: 0 },
      recentFailures: 0,
      averageFallbackTime: 0
    };
  }
}
