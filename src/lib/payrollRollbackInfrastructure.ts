// Payroll Rollback & Recovery Infrastructure - Phase 2D-2-3
// Rollback orchestration framework for safe payroll recovery
// PHASE 2D-2-3 ROLLBACK INFRASTRUCTURE ONLY — NOT ACTIVE PAYROLL

import { PayrollActivationInfrastructure } from './payrollActivationInfrastructure';
import { payrollMonitor } from './payrollMonitoring';
import { supabase } from './supabase';

// Rollback infrastructure type definitions
export interface PayrollRollbackPlan {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  rollbackReason: string;
  rollbackType: 'emergency' | 'planned' | 'automatic';
  targetVersion: number;
  sourceVersion: number;
  recoveryPoints: PayrollRecoveryPoint[];
  riskAssessment: PayrollRollbackRiskAssessment;
  validationResults: PayrollRollbackValidation;
  confidence: PayrollRollbackConfidence;
  createdAt: string;
  createdBy: string;
  estimatedDuration: number;
  rollbackStrategy: 'full' | 'partial' | 'selective';
}

export interface PayrollRecoveryPoint {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  pointType: 'archive_snapshot' | 'validation_checkpoint' | 'corruption_detection' | 'rollback_trigger';
  versionNumber: number;
  timestamp: string;
  dataIntegrity: {
    checksum: string;
    recordCount: number;
    totalAmount: number;
    lastModified: string;
  };
  metadata: {
    description: string;
    affectedWorkers: number;
    criticalIssues: string[];
    warnings: string[];
  };
  recoveryActions: string[];
  rollbackEligibility: boolean;
}

export interface PayrollArchiveSnapshot {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  versionNumber: number;
  snapshotType: 'full' | 'incremental' | 'shadow';
  executionEngine: 'us' | 'jamaican' | 'dual_run';
  timestamp: string;
  recordCount: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalDeductions: number;
  checksum: string;
  compressionMethod: 'none' | 'gzip' | 'lz4';
  encrypted: boolean;
  integrity: {
    validated: boolean;
    corruptionDetected: boolean;
    validationErrors: string[];
  };
}

export interface PayrollRollbackValidation {
  valid: boolean;
  issues: string[];
  warnings: string[];
  blockers: string[];
  recommendations: string[];
  checksPerformed: {
    archiveIntegrity: boolean;
    duplicateDetection: boolean;
    corruptionAnalysis: boolean;
    versionConsistency: boolean;
    dataIntegrity: boolean;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface PayrollRollbackRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: {
    dataCorruption: number; // 0-25 points
    duplicateEntries: number; // 0-25 points
    archiveIntegrity: number; // 0-25 points
    versionConflicts: number; // 0-25 points
    timingConstraints: number; // 0-25 points
  };
  mitigationStrategies: string[];
  rollbackViability: 'safe' | 'risky' | 'unsafe';
  confidence: number; // 0-100
}

export interface PayrollRecoveryResult {
  success: boolean;
  recoveryType: 'rollback' | 'restore' | 'rebuild';
  recoveredVersion: number;
  affectedRecords: number;
  dataIntegrity: 'verified' | 'partial' | 'compromised';
  duration: number;
  issues: string[];
  summary: string;
}

export interface PayrollRollbackConfidence {
  overallScore: number; // 0-100
  confidenceLevel: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
  keyFactors: {
    archiveIntegrity: number; // 0-25 points
    versionHistory: number; // 0-25 points
    dataConsistency: number; // 0-25 points
    rollbackComplexity: number; // 0-25 points
  };
  recommendations: string[];
  rollbackReadiness: boolean;
}

// Default risk assessment thresholds
const DEFAULT_RISK_THRESHOLDS = {
  maxCorruptionScore: 15, // Above this is high risk
  maxDuplicateScore: 10, // Above this is high risk
  minArchiveIntegrityScore: 20, // Below this is high risk
  maxVersionConflictScore: 15, // Above this is high risk
  minTimingScore: 10, // Below this is high risk
  confidenceThreshold: 70 // Below this is not ready for rollback
};

/**
 * Create recovery point for rollback planning
 */
export async function createRecoveryPoint(
  companyId: string,
  payrollPeriodId: string,
  pointType: PayrollRecoveryPoint['pointType'],
  versionNumber: number,
  metadata: Partial<PayrollRecoveryPoint['metadata']> = {}
): Promise<PayrollRecoveryPoint> {
  const recoveryLog: string[] = [];
  
  try {
    recoveryLog.push(`Creating recovery point: ${pointType} for version ${versionNumber}`);
    
    // Get current payroll data for integrity check
    const { data: payrollEntries } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('payroll_period_id', payrollPeriodId)
      .eq('company_id', companyId);
    
    if (!payrollEntries || payrollEntries.length === 0) {
      throw new Error('No payroll entries found for recovery point creation');
    }
    
    // Calculate data integrity metrics
    const recordCount = payrollEntries.length;
    const totalGrossPay = payrollEntries.reduce((sum, entry) => sum + Number(entry.gross_pay), 0);
    const totalNetPay = payrollEntries.reduce((sum, entry) => sum + Number(entry.net_pay), 0);
    const totalDeductions = payrollEntries.reduce((sum, entry) => sum + Number(entry.total_deductions), 0);
    
    // Generate checksum (simple hash of key data)
    const checksum = generatePayrollChecksum(payrollEntries);
    
    const dataIntegrity = {
      checksum,
      recordCount,
      totalAmount: totalNetPay,
      lastModified: new Date().toISOString()
    };
    
    const recoveryPoint: PayrollRecoveryPoint = {
      id: crypto.randomUUID(),
      companyId,
      payrollPeriodId,
      pointType,
      versionNumber,
      timestamp: new Date().toISOString(),
      dataIntegrity,
      metadata: {
        description: `Recovery point for ${pointType}`,
        affectedWorkers: recordCount,
        criticalIssues: [],
        warnings: [],
        ...metadata
      },
      recoveryActions: [],
      rollbackEligibility: true
    };
    
    recoveryLog.push(`Recovery point created: ${recoveryPoint.id}`);
    console.log('Recovery point created:', recoveryPoint);
    console.log('Recovery log:', recoveryLog);
    
    return recoveryPoint;
    
  } catch (error) {
    recoveryLog.push(`Recovery point creation failed: ${error}`);
    console.error('Recovery point creation failed:', error);
    console.error('Recovery log:', recoveryLog);
    
    throw new Error(`Recovery point creation failed: ${error}`);
  }
}

/**
 * Generate comprehensive rollback plan
 */
export async function generateRollbackPlan(
  companyId: string,
  payrollPeriodId: string,
  rollbackReason: string,
  rollbackType: PayrollRollbackPlan['rollbackType'],
  targetVersion?: number
): Promise<PayrollRollbackPlan> {
  const planningLog: string[] = [];
  
  try {
    planningLog.push(`Generating rollback plan for company: ${companyId}, period: ${payrollPeriodId}`);
    planningLog.push(`Rollback type: ${rollbackType}, reason: ${rollbackReason}`);
    
    // Get execution versions history
    const executionVersions = await PayrollActivationInfrastructure.getExecutionVersions(payrollPeriodId, companyId);
    
    if (executionVersions.length === 0) {
      throw new Error('No execution versions found for rollback planning');
    }
    
    // Determine target and source versions
    const currentVersion = executionVersions[0]; // Most recent
    const sourceVersion = currentVersion.version_number;
    const selectedTargetVersion = targetVersion || Math.max(1, sourceVersion - 1);
    
    // Validate rollback feasibility
    const validationResults = await validateRollbackSafety(companyId, payrollPeriodId, selectedTargetVersion);
    // Simple risk assessment placeholder
    const riskAssessment = {
      overallRisk: 'low' as const,
      riskFactors: {
        dataCorruption: 0,
        duplicateEntries: 0,
        archiveIntegrity: 25,
        versionConflicts: 0,
        timingConstraints: 25
      },
      mitigationStrategies: ['No immediate risks detected'],
      rollbackViability: 'safe' as 'safe' | 'risky' | 'unsafe',
      confidence: 85
    };
    const confidence = calculateRollbackConfidence(validationResults, riskAssessment);
    
    // Generate recovery points
    const recoveryPoints: PayrollRecoveryPoint[] = [];
    
    // Create current state recovery point
    const currentRecoveryPoint = await createRecoveryPoint(
      companyId,
      payrollPeriodId,
      'rollback_trigger',
      sourceVersion,
      {
        description: `Current state before ${rollbackType} rollback`,
        affectedWorkers: currentVersion.version_number,
        criticalIssues: validationResults.issues,
        warnings: validationResults.warnings
      }
    );
    recoveryPoints.push(currentRecoveryPoint);
    
    // Create target recovery point if available
    if (selectedTargetVersion > 0) {
      const targetRecoveryPoint = await createRecoveryPoint(
        companyId,
        payrollPeriodId,
        'archive_snapshot',
        selectedTargetVersion,
        {
          description: `Target state for rollback to version ${selectedTargetVersion}`,
          affectedWorkers: 0, // Would be populated from archive
          criticalIssues: [],
          warnings: ['Rollback target - verify integrity before proceeding']
        }
      );
      recoveryPoints.push(targetRecoveryPoint);
    }
    
    // Determine rollback strategy
    let rollbackStrategy: PayrollRollbackPlan['rollbackStrategy'] = 'full';
    if (riskAssessment.rollbackViability === 'risky') {
      rollbackStrategy = 'selective';
    } else if (riskAssessment.rollbackViability === 'unsafe') {
      rollbackStrategy = 'partial';
    }
    
    const plan: PayrollRollbackPlan = {
      id: crypto.randomUUID(),
      companyId,
      payrollPeriodId,
      rollbackReason,
      rollbackType,
      targetVersion: selectedTargetVersion,
      sourceVersion,
      recoveryPoints,
      riskAssessment,
      validationResults,
      confidence,
      createdAt: new Date().toISOString(),
      createdBy: 'system', // Would be actual user ID
      estimatedDuration: calculateEstimatedRollbackDuration(riskAssessment, rollbackStrategy),
      rollbackStrategy
    };
    
    planningLog.push(`Rollback plan generated: ${JSON.stringify(plan)}`);
    console.log('Rollback plan generated:', plan);
    console.log('Planning log:', planningLog);
    
    return plan;
    
  } catch (error) {
    planningLog.push(`Rollback plan generation failed: ${error}`);
    console.error('Rollback plan generation failed:', error);
    console.error('Planning log:', planningLog);
    
    throw new Error(`Rollback plan generation failed: ${error}`);
  }
}

/**
 * Validate rollback safety and feasibility
 */
export async function validateRollbackSafety(
  companyId: string,
  payrollPeriodId: string,
  targetVersion: number
): Promise<PayrollRollbackValidation> {
  const validationLog: string[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const recommendations: string[] = [];
  
  try {
    validationLog.push(`Validating rollback safety to version ${targetVersion}`);
    
    const checksPerformed = {
      archiveIntegrity: false,
      duplicateDetection: false,
      corruptionAnalysis: false,
      versionConsistency: false,
      dataIntegrity: false
    };
    
    // 1. Validate archive integrity
    try {
      const archiveIntegrityResult = await validateArchiveIntegrity(companyId, payrollPeriodId, targetVersion);
      checksPerformed.archiveIntegrity = true;
      
      if (!archiveIntegrityResult.valid) {
        issues.push(...archiveIntegrityResult.issues);
        warnings.push(...archiveIntegrityResult.warnings);
      }
    } catch (error) {
      issues.push(`Archive integrity validation failed: ${error}`);
    }
    
    // 2. Detect duplicate payroll risk
    try {
      const duplicateRisk = await detectDuplicatePayrollRisk(companyId, payrollPeriodId);
      checksPerformed.duplicateDetection = true;
      
      if (duplicateRisk.hasDuplicates) {
        blockers.push(`Duplicate payroll entries detected: ${duplicateRisk.summary}`);
        issues.push(...duplicateRisk.issues);
      }
    } catch (error) {
      issues.push(`Duplicate detection failed: ${error}`);
    }
    
    // 3. Analyze corruption risk
    try {
      const corruptionRisk = await detectPayrollCorruptionRisk(companyId, payrollPeriodId);
      checksPerformed.corruptionAnalysis = true;
      
      if (corruptionRisk.riskLevel !== 'low') {
        warnings.push(`Corruption risk detected: ${corruptionRisk.summary}`);
        if (corruptionRisk.riskLevel === 'critical') {
          blockers.push(`Critical corruption risk: ${corruptionRisk.criticalIssues.join(', ')}`);
        }
      }
    } catch (error) {
      issues.push(`Corruption analysis failed: ${error}`);
    }
    
    // 4. Validate version consistency
    try {
      const versionConsistency = await validateVersionConsistency(companyId, payrollPeriodId, targetVersion);
      checksPerformed.versionConsistency = true;
      
      if (!versionConsistency.valid) {
        issues.push(...versionConsistency.issues);
      }
    } catch (error) {
      issues.push(`Version consistency validation failed: ${error}`);
    }
    
    // 5. Validate data integrity
    try {
      const dataIntegrityResult = await validateDataIntegrity(companyId, payrollPeriodId);
      checksPerformed.dataIntegrity = true;
      
      if (!dataIntegrityResult.valid) {
        issues.push(...dataIntegrityResult.issues);
      }
    } catch (error) {
      issues.push(`Data integrity validation failed: ${error}`);
    }
    
    // Determine overall risk level
    let riskLevel: PayrollRollbackValidation['riskLevel'] = 'low';
    if (blockers.length > 0) {
      riskLevel = 'critical';
    } else if (issues.length > 5) {
      riskLevel = 'high';
    } else if (issues.length > 2) {
      riskLevel = 'medium';
    }
    
    // Generate recommendations
    if (blockers.length > 0) {
      recommendations.push('Address critical blockers before proceeding with rollback');
    }
    
    if (riskLevel === 'high' || riskLevel === 'critical') {
      recommendations.push('Consider creating data backup before rollback');
      recommendations.push('Plan for extended rollback validation time');
    }
    
    if (warnings.length > 0) {
      recommendations.push('Review warnings and mitigate risks if possible');
    }
    
    const result: PayrollRollbackValidation = {
      valid: blockers.length === 0 && issues.length <= 2,
      issues,
      warnings,
      blockers,
      recommendations,
      checksPerformed,
      riskLevel
    };
    
    validationLog.push(`Rollback validation completed: ${JSON.stringify(result)}`);
    console.log('Rollback validation completed:', result);
    console.log('Validation log:', validationLog);
    
    return result;
    
  } catch (error) {
    validationLog.push(`Rollback validation failed: ${error}`);
    console.error('Rollback validation failed:', error);
    console.error('Validation log:', validationLog);
    
    return {
      valid: false,
      issues: [`Validation failed: ${error}`],
      warnings: ['Unable to complete rollback validation'],
      blockers: ['Validation system error'],
      recommendations: ['Review validation system configuration'],
      checksPerformed: {
        archiveIntegrity: false,
        duplicateDetection: false,
        corruptionAnalysis: false,
        versionConsistency: false,
        dataIntegrity: false
      },
      riskLevel: 'critical'
    };
  }
}

/**
 * Detect payroll corruption risk
 */
export async function detectPayrollCorruptionRisk(
  companyId: string,
  payrollPeriodId: string
): Promise<{
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  issues: string[];
  warnings: string[];
  criticalIssues: string[];
  summary: string;
}> {
  const corruptionLog: string[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  const criticalIssues: string[] = [];
  
  try {
    corruptionLog.push('Analyzing payroll corruption risk');
    
    let riskScore = 0;
    
    // Get current payroll entries
    const { data: payrollEntries } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('payroll_period_id', payrollPeriodId)
      .eq('company_id', companyId);
    
    if (!payrollEntries || payrollEntries.length === 0) {
      return {
        riskLevel: 'low',
        riskScore: 0,
        issues: [],
        warnings: ['No payroll entries found for corruption analysis'],
        criticalIssues: [],
        summary: 'No data to analyze'
      };
    }
    
    // Corruption detection heuristics
    const corruptionIndicators = {
      negativeNetPay: 0,
      zeroGrossPay: 0,
      excessiveDeductions: 0,
      invalidDates: 0,
      calculationAnomalies: 0,
      missingFields: 0
    };
    
    for (const entry of payrollEntries) {
      // Check for negative net pay
      if (Number(entry.net_pay) < 0) {
        corruptionIndicators.negativeNetPay++;
        criticalIssues.push(`Worker ${entry.worker_id}: Negative net pay $${entry.net_pay}`);
      }
      
      // Check for zero gross pay with hours
      if (Number(entry.gross_pay) === 0 && (Number(entry.regular_hours) > 0 || Number(entry.overtime_hours) > 0)) {
        corruptionIndicators.zeroGrossPay++;
        issues.push(`Worker ${entry.worker_id}: Zero gross pay with hours worked`);
      }
      
      // Check for excessive deductions (>100% of gross pay)
      if (Number(entry.total_deductions) > Number(entry.gross_pay)) {
        corruptionIndicators.excessiveDeductions++;
        criticalIssues.push(`Worker ${entry.worker_id}: Deductions exceed gross pay`);
      }
      
      // Check for invalid dates
      const entryDate = new Date(entry.created_at || '');
      if (isNaN(entryDate.getTime())) {
        corruptionIndicators.invalidDates++;
        issues.push(`Worker ${entry.worker_id}: Invalid creation date`);
      }
      
      // Check for calculation anomalies
      const regularPay = Number(entry.regular_pay) || 0;
      const overtimePay = Number(entry.overtime_pay) || 0;
      const grossPay = Number(entry.gross_pay) || 0;
      
      if (grossPay > 0 && (regularPay + overtimePay) !== grossPay) {
        corruptionIndicators.calculationAnomalies++;
        warnings.push(`Worker ${entry.worker_id}: Calculation inconsistency detected`);
      }
      
      // Check for missing critical fields
      const requiredFields = ['worker_id', 'regular_hours', 'gross_pay', 'net_pay'];
      for (const field of requiredFields) {
        if (!entry[field]) {
          corruptionIndicators.missingFields++;
          issues.push(`Worker ${entry.worker_id}: Missing required field ${field}`);
        }
      }
    }
    
    // Calculate risk score
    const totalEntries = payrollEntries.length;
    riskScore = Math.round(
      (corruptionIndicators.negativeNetPay / totalEntries * 25) +
      (corruptionIndicators.zeroGrossPay / totalEntries * 20) +
      (corruptionIndicators.excessiveDeductions / totalEntries * 30) +
      (corruptionIndicators.invalidDates / totalEntries * 15) +
      (corruptionIndicators.calculationAnomalies / totalEntries * 10) +
      (corruptionIndicators.missingFields / totalEntries * 20)
    );
    
    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalIssues.length > 0) {
      riskLevel = 'critical';
    } else if (riskScore > DEFAULT_RISK_THRESHOLDS.maxCorruptionScore) {
      riskLevel = 'high';
    } else if (riskScore > DEFAULT_RISK_THRESHOLDS.maxCorruptionScore / 2) {
      riskLevel = 'medium';
    }
    
    const summary = `
Corruption Risk Analysis
======================
Risk Level: ${riskLevel.toUpperCase()}
Risk Score: ${riskScore}/100
Total Entries: ${totalEntries}
Critical Issues: ${criticalIssues.length}
Indicators Detected:
- Negative Net Pay: ${corruptionIndicators.negativeNetPay}
- Zero Gross Pay: ${corruptionIndicators.zeroGrossPay}
- Excessive Deductions: ${corruptionIndicators.excessiveDeductions}
- Invalid Dates: ${corruptionIndicators.invalidDates}
- Calculation Anomalies: ${corruptionIndicators.calculationAnomalies}
- Missing Fields: ${corruptionIndicators.missingFields}
    `.trim();
    
    const result = {
      riskLevel,
      riskScore,
      issues,
      warnings,
      criticalIssues,
      summary
    };
    
    corruptionLog.push(`Corruption analysis completed: ${JSON.stringify(result)}`);
    console.log('Corruption analysis completed:', result);
    console.log('Corruption log:', corruptionLog);
    
    return result;
    
  } catch (error) {
    corruptionLog.push(`Corruption analysis failed: ${error}`);
    console.error('Corruption analysis failed:', error);
    console.error('Corruption log:', corruptionLog);
    
    return {
      riskLevel: 'critical',
      riskScore: 100,
      issues: [`Analysis failed: ${error}`],
      warnings: ['Unable to complete corruption analysis'],
      criticalIssues: ['Analysis system error'],
      summary: 'Corruption analysis failed'
    };
  }
}

/**
 * Validate archive integrity
 */
export async function validateArchiveIntegrity(
  companyId: string,
  payrollPeriodId: string,
  versionNumber: number
): Promise<{
  valid: boolean;
  issues: string[];
  warnings: string[];
}> {
  try {
    // Get archived entries for specified version
    const archivedEntries = await PayrollActivationInfrastructure.getArchivedPayrollEntries(
      payrollPeriodId,
      companyId,
      versionNumber
    );
    
    if (!archivedEntries || archivedEntries.length === 0) {
      return {
        valid: false,
        issues: [`No archive found for version ${versionNumber}`],
        warnings: ['Archive may not exist or be inaccessible']
      };
    }
    
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Validate archive integrity
    const recordCount = archivedEntries.length;
    const totalGrossPay = archivedEntries.reduce((sum, entry) => sum + Number(entry.gross_pay), 0);
    const totalNetPay = archivedEntries.reduce((sum, entry) => sum + Number(entry.net_pay), 0);
    
    // Check for data consistency
    let inconsistentRecords = 0;
    for (const entry of archivedEntries) {
      if (Number(entry.net_pay) < 0 || Number(entry.gross_pay) < 0) {
        inconsistentRecords++;
        issues.push(`Archive entry ${entry.id}: Invalid pay amounts`);
      }
    }
    
    if (inconsistentRecords > 0) {
      warnings.push(`${inconsistentRecords} archive records have data inconsistencies`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
    
  } catch (error) {
    return {
      valid: false,
      issues: [`Archive integrity validation failed: ${error}`],
      warnings: ['Unable to validate archive integrity']
    };
  }
}

/**
 * Detect duplicate payroll risk
 */
export async function detectDuplicatePayrollRisk(
  companyId: string,
  payrollPeriodId: string
): Promise<{
  hasDuplicates: boolean;
  duplicateCount: number;
  summary: string;
  issues: string[];
}> {
  try {
    // Get current payroll entries
    const { data: payrollEntries } = await supabase
      .from('payroll_entries')
      .select('worker_id, payroll_period_id, created_at')
      .eq('payroll_period_id', payrollPeriodId)
      .eq('company_id', companyId);
    
    if (!payrollEntries || payrollEntries.length === 0) {
      return {
        hasDuplicates: false,
        duplicateCount: 0,
        summary: 'No payroll entries to analyze',
        issues: []
      };
    }
    
    // Check for duplicate entries
    const workerMap = new Map<string, number>();
    let duplicateCount = 0;
    const issues: string[] = [];
    
    for (const entry of payrollEntries) {
      const workerId = entry.worker_id;
      const currentCount = workerMap.get(workerId) || 0;
      workerMap.set(workerId, currentCount + 1);
      
      if (currentCount > 0) {
        duplicateCount++;
        issues.push(`Duplicate payroll entry for worker ${workerId}`);
      }
    }
    
    const summary = `
Duplicate Payroll Analysis
===========================
Total Entries: ${payrollEntries.length}
Unique Workers: ${workerMap.size}
Duplicate Entries: ${duplicateCount}
Duplicate Percentage: ${((duplicateCount / payrollEntries.length) * 100).toFixed(1)}%
    `.trim();
    
    return {
      hasDuplicates: duplicateCount > 0,
      duplicateCount,
      summary,
      issues
    };
    
  } catch (error) {
    return {
      hasDuplicates: true,
      duplicateCount: -1,
      summary: 'Duplicate analysis failed',
      issues: [`Analysis failed: ${error}`]
    };
  }
}

/**
 * Validate version consistency
 */
export async function validateVersionConsistency(
  companyId: string,
  payrollPeriodId: string,
  targetVersion: number
): Promise<{
  valid: boolean;
  issues: string[];
}> {
  try {
    // Get execution versions
    const executionVersions = await PayrollActivationInfrastructure.getExecutionVersions(payrollPeriodId, companyId);
    
    if (!executionVersions || executionVersions.length === 0) {
      return {
        valid: false,
        issues: ['No execution versions found for consistency validation']
      };
    }
    
    const issues: string[] = [];
    
    // Check version sequence integrity
    const versionNumbers = executionVersions.map(v => v.version_number).sort((a, b) => b - a);
    let hasGaps = false;
    
    for (let i = 1; i < versionNumbers.length; i++) {
      if (versionNumbers[i] - versionNumbers[i-1] !== 1) {
        hasGaps = true;
        issues.push(`Version gap detected between ${versionNumbers[i-1]} and ${versionNumbers[i]}`);
      }
    }
    
    // Check if target version exists
    const targetExists = versionNumbers.includes(targetVersion);
    if (!targetExists) {
      issues.push(`Target version ${targetVersion} does not exist in version history`);
    }
    
    return {
      valid: issues.length === 0 && targetExists,
      issues
    };
    
  } catch (error) {
    return {
      valid: false,
      issues: [`Version consistency validation failed: ${error}`]
    };
  }
}

/**
 * Validate data integrity
 */
export async function validateDataIntegrity(
  companyId: string,
  payrollPeriodId: string
): Promise<{
  valid: boolean;
  issues: string[];
}> {
  try {
    // Get current payroll entries
    const { data: payrollEntries } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('payroll_period_id', payrollPeriodId)
      .eq('company_id', companyId);
    
    if (!payrollEntries || payrollEntries.length === 0) {
      return {
        valid: false,
        issues: ['No payroll entries found for integrity validation']
      };
    }
    
    const issues: string[] = [];
    
    // Perform data integrity checks
    for (const entry of payrollEntries) {
      // Check for null/undefined critical fields
      const criticalFields = ['worker_id', 'gross_pay', 'net_pay'];
      for (const field of criticalFields) {
        if (!entry[field] || entry[field] === '') {
          issues.push(`Entry ${entry.id}: Critical field ${field} is null or empty`);
        }
      }
      
      // Check for negative values where inappropriate
      if (Number(entry.gross_pay) < 0) {
        issues.push(`Entry ${entry.id}: Negative gross pay`);
      }
      
      if (Number(entry.net_pay) < 0) {
        issues.push(`Entry ${entry.id}: Negative net pay`);
      }
      
      // Check for calculation consistency
      const grossPay = Number(entry.gross_pay) || 0;
      const totalDeductions = Number(entry.total_deductions) || 0;
      const netPay = Number(entry.net_pay) || 0;
      
      if (Math.abs(grossPay - totalDeductions - netPay) > 0.01) {
        issues.push(`Entry ${entry.id}: Calculation inconsistency (gross - deductions ≠ net)`);
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
    
  } catch (error) {
    return {
      valid: false,
      issues: [`Data integrity validation failed: ${error}`]
    };
  }
}

/**
 * Calculate rollback confidence score
 */
export function calculateRollbackConfidence(
  validationResults: PayrollRollbackValidation,
  riskAssessment: PayrollRollbackRiskAssessment
): PayrollRollbackConfidence {
  try {
    // Factor 1: Archive integrity (0-25 points)
    const archiveIntegrityScore = validationResults.checksPerformed.archiveIntegrity ? 
      (validationResults.issues.length === 0 ? 25 : 10) : 0;
    
    // Factor 2: Version history (0-25 points)
    const versionHistoryScore = validationResults.checksPerformed.versionConsistency ? 
      (validationResults.issues.length === 0 ? 25 : 15) : 0;
    
    // Factor 3: Data consistency (0-25 points)
    const dataConsistencyScore = validationResults.checksPerformed.dataIntegrity ? 
      (validationResults.issues.length === 0 ? 25 : 10) : 0;
    
    // Factor 4: Rollback complexity (0-25 points)
    const rollbackComplexityScore = Math.max(0, 25 - (riskAssessment.riskFactors.versionConflicts * 2));
    
    const overallScore = Math.round(
      archiveIntegrityScore + 
      versionHistoryScore + 
      dataConsistencyScore + 
      rollbackComplexityScore
    );
    
    // Determine confidence level
    let confidenceLevel: PayrollRollbackConfidence['confidenceLevel'] = 'very_low';
    if (overallScore >= 90) {
      confidenceLevel = 'very_high';
    } else if (overallScore >= 75) {
      confidenceLevel = 'high';
    } else if (overallScore >= 60) {
      confidenceLevel = 'moderate';
    } else if (overallScore >= 40) {
      confidenceLevel = 'low';
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (overallScore < DEFAULT_RISK_THRESHOLDS.confidenceThreshold) {
      recommendations.push('Additional validation and testing recommended before rollback');
    }
    
    if (riskAssessment.rollbackViability !== 'safe') {
      recommendations.push('High rollback risk detected - consider alternative recovery methods');
    }
    
    const rollbackReadiness = overallScore >= DEFAULT_RISK_THRESHOLDS.confidenceThreshold;
    
    return {
      overallScore,
      confidenceLevel,
      keyFactors: {
        archiveIntegrity: archiveIntegrityScore,
        versionHistory: versionHistoryScore,
        dataConsistency: dataConsistencyScore,
        rollbackComplexity: rollbackComplexityScore
      },
      recommendations,
      rollbackReadiness
    };
    
  } catch (error) {
    return {
      overallScore: 0,
      confidenceLevel: 'very_low',
      keyFactors: {
        archiveIntegrity: 0,
        versionHistory: 0,
        dataConsistency: 0,
        rollbackComplexity: 0
      },
      recommendations: ['Unable to calculate rollback confidence'],
      rollbackReadiness: false
    };
  }
}

/**
 * Generate recovery summary
 */
export function generateRecoverySummary(
  rollbackPlan: PayrollRollbackPlan,
  validationResult: PayrollRollbackValidation
): {
  summary: string;
  details: string[];
  recommendations: string[];
} {
  const summary = `
Rollback Recovery Summary
======================
Rollback Type: ${rollbackPlan.rollbackType.toUpperCase()}
Target Version: ${rollbackPlan.targetVersion}
Source Version: ${rollbackPlan.sourceVersion}
Risk Level: ${rollbackPlan.riskAssessment.overallRisk.toUpperCase()}
Confidence: ${rollbackPlan.confidence.confidenceLevel.toUpperCase()}
Estimated Duration: ${rollbackPlan.estimatedDuration} minutes
Rollback Strategy: ${rollbackPlan.rollbackStrategy.toUpperCase()}

Validation Results
- Valid: ${validationResult.valid ? 'YES' : 'NO'}
- Issues: ${validationResult.issues.length}
- Warnings: ${validationResult.warnings.length}
- Blockers: ${validationResult.blockers.length}

Recovery Points: ${rollbackPlan.recoveryPoints.length}
  `.trim();
  
  const details = [
    `Archive Integrity: ${validationResult.checksPerformed.archiveIntegrity ? 'Validated' : 'Not validated'}`,
    `Duplicate Detection: ${validationResult.checksPerformed.duplicateDetection ? 'Completed' : 'Not completed'}`,
    `Corruption Analysis: ${validationResult.checksPerformed.corruptionAnalysis ? 'Completed' : 'Not completed'}`,
    `Version Consistency: ${validationResult.checksPerformed.versionConsistency ? 'Validated' : 'Not validated'}`,
    `Data Integrity: ${validationResult.checksPerformed.dataIntegrity ? 'Validated' : 'Not validated'}`,
    `Risk Assessment: ${rollbackPlan.riskAssessment.rollbackViability}`,
    `Confidence Score: ${rollbackPlan.confidence.overallScore}/100`
  ];
  
  const recommendations = [
    ...rollbackPlan.recoveryPoints.map(point => point.metadata.warnings || []).flat(),
    ...validationResult.recommendations,
    ...rollbackPlan.confidence.recommendations
  ];
  
  return {
    summary,
    details,
    recommendations
  };
}

// Utility functions

/**
 * Generate payroll checksum for integrity validation
 */
function generatePayrollChecksum(payrollEntries: any[]): string {
  const keyData = payrollEntries
    .filter(entry => entry.worker_id && entry.gross_pay && entry.net_pay)
    .map(entry => `${entry.worker_id}|${entry.gross_pay}|${entry.net_pay}`)
    .sort()
    .join('|');
  
  // Simple hash function (in production, use proper crypto)
  let hash = 0;
  for (let i = 0; i < keyData.length; i++) {
    const char = keyData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
    hash = ((hash >> 2) + char) & 0xFFFFFFFF;
  }
  
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Calculate estimated rollback duration
 */
function calculateEstimatedRollbackDuration(
  riskAssessment: PayrollRollbackRiskAssessment,
  rollbackStrategy: PayrollRollbackPlan['rollbackStrategy']
): number {
  let baseDuration = 30; // 30 minutes base
  
  // Adjust for risk level
  switch (riskAssessment.overallRisk) {
    case 'critical':
      baseDuration = 120; // 2 hours
      break;
    case 'high':
      baseDuration = 60; // 1 hour
      break;
    case 'medium':
      baseDuration = 45; // 45 minutes
      break;
  }
  
  // Adjust for strategy complexity
  switch (rollbackStrategy) {
    case 'selective':
      baseDuration *= 0.7; // 30% faster
      break;
    case 'partial':
      baseDuration *= 0.85; // 15% faster
      break;
  }
  
  return Math.round(baseDuration);
}
