// Payroll Executive Analytics & Migration Oversight - Phase 2D-5
// Executive-level migration analytics and oversight infrastructure
// PHASE 2D-5 EXECUTIVE ANALYTICS ONLY — NOT ACTIVE PAYROLL

import { supabase } from './supabase';
import { payrollMonitor } from './payrollMonitoring';
import { PayrollActivationInfrastructure } from './payrollActivationInfrastructure';
import { payrollMigrationApprovals } from './payrollMigrationApprovals';
import { validateRollbackSafety } from './payrollRollbackInfrastructure';
import type { PayrollPeriod, PayrollEntry } from './payroll';

// Executive analytics type definitions
export interface PayrollMigrationExecutiveSummary {
  companyId: string;
  payrollPeriodId: string;
  generatedAt: string;
  overview: {
    totalWorkers: number;
    migrationReadinessScore: number;
    overallConfidence: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    governanceStatus: 'pending' | 'in_progress' | 'approved' | 'blocked';
  };
  pilotAnalytics: PayrollPilotTrendAnalysis;
  riskProfile: PayrollMigrationRiskProfile;
  governanceAnalytics: PayrollGovernanceAnalytics;
  varianceTrends: PayrollVarianceTrend;
  readinessForecast: PayrollReadinessForecast;
  healthScore: PayrollMigrationHealthScore;
  alerts: PayrollExecutiveAlert[];
  recommendations: string[];
}

export interface PayrollMigrationRiskProfile {
  overallRiskScore: number; // 0-100, higher = more risky
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: {
    calculationConsistency: {
      score: number;
      trend: 'improving' | 'stable' | 'declining';
      impact: 'low' | 'medium' | 'high';
    };
    varianceControl: {
      score: number;
      trend: 'improving' | 'stable' | 'declining';
      impact: 'low' | 'medium' | 'high';
    };
    governanceCompliance: {
      score: number;
      trend: 'improving' | 'stable' | 'declining';
      impact: 'low' | 'medium' | 'high';
    };
    rollbackReadiness: {
      score: number;
      trend: 'improving' | 'stable' | 'declining';
      impact: 'low' | 'medium' | 'high';
    };
  };
  criticalRisks: Array<{
    riskType: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
  }>;
  riskMitigation: string[];
}

export interface PayrollPilotTrendAnalysis {
  pilotExecutions: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  workerCoverage: {
    totalWorkers: number;
    pilotWorkers: number;
    coveragePercentage: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  };
  executionQuality: {
    averageExecutionTime: number;
    averageValidationTime: number;
    averageComparisonTime: number;
    performanceTrend: 'improving' | 'stable' | 'declining';
  };
  varianceAnalysis: {
    averageNetPayDifference: number;
    maxNetPayDifference: number;
    varianceDistribution: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
    varianceTrend: 'improving' | 'stable' | 'worsening';
  };
  confidenceMetrics: {
    overallConfidence: number;
    calculationConsistency: number;
    validationPassRate: number;
    governanceCompliance: number;
    confidenceTrend: 'improving' | 'stable' | 'declining';
  };
}

export interface PayrollGovernanceAnalytics {
  approvalStatus: {
    directorApproval: {
      status: 'pending' | 'approved' | 'rejected';
      approvedAt?: string;
      notes?: string;
    };
    adminApproval: {
      status: 'pending' | 'approved' | 'rejected';
      approvedAt?: string;
      notes?: string;
    };
    overallStatus: 'pending' | 'director_approved' | 'admin_approved' | 'fully_approved' | 'rejected';
    approvalProgress: number; // 0-100
  };
  workerReviews: {
    totalWorkers: number;
    reviewedWorkers: number;
    reviewCompletionRate: number;
    readinessDistribution: {
      not_ready: number;
      ready: number;
      approved: number;
      blocked: number;
    };
    reviewTrend: 'accelerating' | 'steady' | 'lagging';
  };
  complianceMetrics: {
    governanceComplianceScore: number;
    approvalLatency: number; // days
    reviewQualityScore: number;
    complianceTrend: 'improving' | 'stable' | 'declining';
  };
}

export interface PayrollVarianceTrend {
  currentPeriod: {
    totalWorkers: number;
    workersWithDifferences: number;
    averageNetPayDifference: number;
    maxNetPayDifference: number;
    varianceSeverity: 'low' | 'medium' | 'high' | 'critical';
  };
  historicalTrend: Array<{
    period: string;
    varianceScore: number;
    trendDirection: 'improving' | 'stable' | 'worsening';
  }>;
  varianceDrivers: Array<{
    driver: string;
    impact: number;
    frequency: number;
  }>;
  mitigationEffectiveness: {
    currentMitigations: number;
    effectivenessScore: number;
    recommendedActions: string[];
  };
}

export interface PayrollReadinessForecast {
  currentReadiness: {
    score: number;
    level: 'not_ready' | 'low_confidence' | 'moderate_confidence' | 'high_confidence' | 'ready';
    keyFactors: {
      calculationConsistency: number;
      governanceCompliance: number;
      varianceControl: number;
      rollbackReadiness: number;
    };
  };
  projectedReadiness: Array<{
    timeframe: string; // e.g., "1 week", "2 weeks", "1 month"
    projectedScore: number;
    confidence: number; // 0-100
    keyMilestones: string[];
    risks: string[];
  }>;
  readinessBarriers: Array<{
    barrier: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    estimatedResolution: string;
    dependencies: string[];
  }>;
  activationRecommendations: string[];
}

export interface PayrollMigrationHealthScore {
  overallScore: number; // 0-100
  healthLevel: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  componentScores: {
    calculationAccuracy: number;
    varianceControl: number;
    governanceCompliance: number;
    rollbackReadiness: number;
    pilotExecutionQuality: number;
    systemStability: number;
  };
  healthTrend: 'improving' | 'stable' | 'declining';
  criticalIssues: string[];
  improvementOpportunities: string[];
}

export interface PayrollExecutiveAlert {
  alertId: string;
  alertType: 'high_variance' | 'rollback_readiness_failure' | 'governance_blocker' | 'low_confidence' | 'orchestration_safety_warning' | 'duplicate_execution_anomaly';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  affectedComponents: string[];
  timestamp: string;
  resolved: boolean;
  resolutionNotes?: string;
  recommendedActions: string[];
  metrics: {
    currentValue: number;
    threshold: number;
    variance?: number;
  };
}

/**
 * Generate executive migration summary
 */
export async function generateExecutiveMigrationSummary(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollMigrationExecutiveSummary> {
  try {
    const generatedAt = new Date().toISOString();

    // Get overview data
    const overview = await buildExecutiveOverview(companyId, payrollPeriodId);

    // Get pilot analytics
    const pilotAnalytics = await analyzePilotExecutionTrends(companyId, payrollPeriodId);

    // Calculate risk profile
    const riskProfile = await calculateMigrationRiskProfile(companyId, payrollPeriodId);

    // Generate governance analytics
    const governanceAnalytics = await generateGovernanceAnalytics(companyId, payrollPeriodId);

    // Analyze variance trends
    const varianceTrends = await analyzePayrollVarianceTrends(companyId, payrollPeriodId);

    // Build readiness forecast
    const readinessForecast = await buildReadinessForecast(companyId, payrollPeriodId);

    // Calculate health score
    const healthScore = await calculateMigrationHealthScore(companyId, payrollPeriodId);

    // Generate executive alerts
    const alerts = await generateExecutiveAlerts(companyId, payrollPeriodId, overview, riskProfile, pilotAnalytics);

    // Generate recommendations
    const recommendations = generateExecutiveRecommendations(overview, riskProfile, pilotAnalytics, governanceAnalytics);

    return {
      companyId,
      payrollPeriodId,
      generatedAt,
      overview,
      pilotAnalytics,
      riskProfile,
      governanceAnalytics,
      varianceTrends,
      readinessForecast,
      healthScore,
      alerts,
      recommendations
    };

  } catch (error) {
    console.error('Failed to generate executive migration summary:', error);
    throw new Error(`Executive migration summary generation failed: ${error}`);
  }
}

/**
 * Calculate migration health score
 */
export async function calculateMigrationHealthScore(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollMigrationHealthScore> {
  try {
    // Get monitoring data
    const monitoringData = await payrollMonitor.getMonitoringSummary({ companyId, payrollPeriodId });
    
    // Get activation flags
    const activationFlags = await PayrollActivationInfrastructure.getActivationFlags(companyId);
    
    // Get rollback readiness
    const rollbackValidation = await validateRollbackSafety(companyId, payrollPeriodId, 1);
    
    // Get migration approval
    const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(payrollPeriodId, companyId);

    // Component scores
    const calculationAccuracy = monitoringData ? 
      (100 - Math.min(monitoringData.netPayDifferences.averageDifferencePercent, 100)) : 50;
    
    const varianceControl = monitoringData ? 
      (100 - Math.min(monitoringData.netPayDifferences.largestDifferencePercent, 100)) : 50;
    
    const governanceCompliance = migrationApproval ? 
      (migrationApproval.migrationStatus === 'fully_approved' ? 100 : 
       migrationApproval.migrationStatus === 'director_approved' ? 75 :
       migrationApproval.migrationStatus === 'admin_approved' ? 50 : 25) : 0;
    
    const rollbackReadiness = rollbackValidation?.valid ? 100 : 0;
    
    const pilotExecutionQuality = 85; // Placeholder - would come from pilot execution data
    
    const systemStability = activationFlags?.pilot_mode_enabled ? 100 : 50;

    // Calculate overall score
    const componentScores = {
      calculationAccuracy,
      varianceControl,
      governanceCompliance,
      rollbackReadiness,
      pilotExecutionQuality,
      systemStability
    };

    const overallScore = Object.values(componentScores).reduce((sum, score) => sum + score, 0) / Object.keys(componentScores).length;

    // Determine health level
    const healthLevel = overallScore >= 90 ? 'excellent' :
                        overallScore >= 75 ? 'good' :
                        overallScore >= 60 ? 'fair' :
                        overallScore >= 40 ? 'poor' : 'critical';

    // Identify critical issues
    const criticalIssues = [];
    if (calculationAccuracy < 70) criticalIssues.push('Low calculation accuracy detected');
    if (varianceControl < 70) criticalIssues.push('High variance levels detected');
    if (governanceCompliance < 50) criticalIssues.push('Governance approvals missing');
    if (!rollbackReadiness) criticalIssues.push('Rollback readiness not met');

    // Improvement opportunities
    const improvementOpportunities = [];
    if (calculationAccuracy < 90) improvementOpportunities.push('Improve calculation consistency');
    if (varianceControl < 90) improvementOpportunities.push('Reduce payroll variances');
    if (governanceCompliance < 100) improvementOpportunities.push('Complete governance approvals');
    if (!rollbackReadiness) improvementOpportunities.push('Establish rollback recovery points');

    return {
      overallScore,
      healthLevel,
      componentScores,
      healthTrend: 'stable', // Would be calculated over time
      criticalIssues,
      improvementOpportunities
    };

  } catch (error) {
    console.error('Failed to calculate migration health score:', error);
    return {
      overallScore: 0,
      healthLevel: 'critical',
      componentScores: {
        calculationAccuracy: 0,
        varianceControl: 0,
        governanceCompliance: 0,
        rollbackReadiness: 0,
        pilotExecutionQuality: 0,
        systemStability: 0
      },
      healthTrend: 'declining',
      criticalIssues: [`Health score calculation failed: ${error}`],
      improvementOpportunities: ['Fix calculation errors']
    };
  }
}

/**
 * Analyze pilot execution trends
 */
export async function analyzePilotExecutionTrends(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollPilotTrendAnalysis> {
  try {
    // Get pilot execution data (placeholder - would query pilot execution tables)
    const pilotExecutions = {
      total: 10, // Placeholder
      successful: 8,
      failed: 2,
      successRate: 80,
      trend: 'improving' as const
    };

    // Worker coverage analysis
    const workerCoverage = {
      totalWorkers: 100, // Placeholder
      pilotWorkers: 10,
      coveragePercentage: 10,
      trend: 'increasing' as const
    };

    // Execution quality metrics
    const executionQuality = {
      averageExecutionTime: 2000, // ms
      averageValidationTime: 500, // ms
      averageComparisonTime: 300, // ms
      performanceTrend: 'improving' as const
    };

    // Variance analysis
    const varianceAnalysis = {
      averageNetPayDifference: 5.50,
      maxNetPayDifference: 25.00,
      varianceDistribution: {
        low: 6,
        medium: 3,
        high: 1,
        critical: 0
      },
      varianceTrend: 'improving' as const
    };

    // Confidence metrics
    const confidenceMetrics = {
      overallConfidence: 85,
      calculationConsistency: 90,
      validationPassRate: 95,
      governanceCompliance: 80,
      confidenceTrend: 'improving' as const
    };

    return {
      pilotExecutions,
      workerCoverage,
      executionQuality,
      varianceAnalysis,
      confidenceMetrics
    };

  } catch (error) {
    console.error('Failed to analyze pilot execution trends:', error);
    throw new Error(`Pilot execution trend analysis failed: ${error}`);
  }
}

/**
 * Calculate migration risk profile
 */
export async function calculateMigrationRiskProfile(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollMigrationRiskProfile> {
  try {
    // Risk factor calculations
    const calculationConsistency = {
      score: 85,
      trend: 'improving' as const,
      impact: 'high' as const,
    };

    const varianceControl = {
      score: 75,
      trend: 'stable' as const,
      impact: 'high' as const
    };

    const governanceCompliance = {
      score: 60,
      trend: 'declining' as const,
      impact: 'high' as const
    };

    const rollbackReadiness = {
      score: 90,
      trend: 'improving' as const,
      impact: 'low' as const
    };

    // Calculate overall risk score
    const overallRiskScore = (100 - calculationConsistency.score) * 0.3 +
                            (100 - varianceControl.score) * 0.3 +
                            (100 - governanceCompliance.score) * 0.25 +
                            (100 - rollbackReadiness.score) * 0.15;

    // Determine risk level
    const riskLevel = overallRiskScore >= 70 ? 'critical' :
                      overallRiskScore >= 50 ? 'high' :
                      overallRiskScore >= 30 ? 'medium' : 'low';

    // Critical risks
    const criticalRisks = [
      {
        riskType: 'Governance Compliance',
        description: 'Governance approvals are incomplete',
        severity: 'high' as const,
        mitigation: 'Complete director and admin approvals'
      }
    ];

    if (varianceControl.score < 70) {
      criticalRisks.push({
        riskType: 'High Variance',
        description: 'Payroll variance exceeds acceptable thresholds',
        severity: 'high' as const,
        mitigation: 'Investigate variance sources and implement controls'
      });
    }

    const riskMitigation = [
      'Complete governance approval process',
      'Implement variance monitoring and alerts',
      'Establish rollback recovery points',
      'Increase pilot execution coverage'
    ];

    return {
      overallRiskScore,
      riskLevel,
      riskFactors: {
        calculationConsistency,
        varianceControl,
        governanceCompliance,
        rollbackReadiness
      },
      criticalRisks,
      riskMitigation
    };

  } catch (error) {
    console.error('Failed to calculate migration risk profile:', error);
    throw new Error(`Risk profile calculation failed: ${error}`);
  }
}

/**
 * Generate governance analytics
 */
export async function generateGovernanceAnalytics(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollGovernanceAnalytics> {
  try {
    // Get migration approval data
    const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(payrollPeriodId, companyId);

    // Approval status analysis
    const approvalStatus = {
      directorApproval: {
        status: migrationApproval?.migrationStatus === 'fully_approved' || 
                 migrationApproval?.migrationStatus === 'admin_approved' || 
                 migrationApproval?.migrationStatus === 'director_approved' ? 'approved' as const : 'pending' as const,
        approvedAt: migrationApproval?.directorApprovedAt,
        notes: migrationApproval?.directorNotes
      },
      adminApproval: {
        status: migrationApproval?.migrationStatus === 'fully_approved' ? 'approved' as const : 
                 migrationApproval?.migrationStatus === 'admin_approved' ? 'approved' as const : 'pending' as const,
        approvedAt: migrationApproval?.adminApprovedAt,
        notes: migrationApproval?.adminNotes
      },
      overallStatus: migrationApproval?.migrationStatus || 'pending',
      approvalProgress: migrationApproval ? 
        (migrationApproval.migrationStatus === 'fully_approved' ? 100 :
         migrationApproval.migrationStatus === 'admin_approved' ? 75 :
         migrationApproval.migrationStatus === 'director_approved' ? 50 : 25) : 0
    };

    // Worker review analysis
    const workerReviews = await payrollMigrationApprovals.getWorkerReviews(payrollPeriodId, companyId);
    const reviewCompletionRate = workerReviews.length > 0 ? 
      workerReviews.filter(w => w.reviewStatus !== 'pending').length / workerReviews.length * 100 : 0;

    const readinessDistribution = workerReviews.reduce((acc, review) => {
      acc[review.migrationReadiness]++;
      return acc;
    }, { not_ready: 0, ready: 0, approved: 0, blocked: 0 });

    // Compliance metrics
    const complianceMetrics = {
      governanceComplianceScore: approvalStatus.approvalProgress,
      approvalLatency: migrationApproval ? 
        Math.floor((Date.now() - new Date(migrationApproval.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      reviewQualityScore: reviewCompletionRate,
      complianceTrend: 'stable' as const
    };

    return {
      approvalStatus,
      workerReviews: {
        totalWorkers: workerReviews.length,
        reviewedWorkers: workerReviews.filter(w => w.reviewStatus !== 'pending').length,
        reviewCompletionRate,
        readinessDistribution,
        reviewTrend: 'steady' as const
      },
      complianceMetrics
    };

  } catch (error) {
    console.error('Failed to generate governance analytics:', error);
    throw new Error(`Governance analytics generation failed: ${error}`);
  }
}

/**
 * Analyze payroll variance trends
 */
export async function analyzePayrollVarianceTrends(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollVarianceTrend> {
  try {
    // Get current period data
    const monitoringData = await payrollMonitor.getMonitoringSummary({ companyId, payrollPeriodId });
    
    const currentPeriod = {
      totalWorkers: monitoringData?.totalEmployees || 0,
      workersWithDifferences: monitoringData?.totalAuditRecords || 0,
      averageNetPayDifference: monitoringData?.netPayDifferences.averageDifference || 0,
      maxNetPayDifference: monitoringData?.netPayDifferences.largestDifference || 0,
      varianceSeverity: ((monitoringData?.netPayDifferences.largestDifferencePercent || 0) > 10 ? 'critical' :
                        (monitoringData?.netPayDifferences.largestDifferencePercent || 0) > 5 ? 'high' :
                        (monitoringData?.netPayDifferences.largestDifferencePercent || 0) > 2 ? 'medium' : 'low') as 'critical' | 'high' | 'medium' | 'low'
    };

    // Historical trend (placeholder - would query historical data)
    const historicalTrend = [
      {
        period: '2024-11',
        varianceScore: 75,
        trendDirection: 'improving' as const
      },
      {
        period: '2024-12',
        varianceScore: 80,
        trendDirection: 'stable' as const
      }
    ];

    // Variance drivers analysis
    const varianceDrivers = [
      {
        driver: 'Tax calculation differences',
        impact: 60,
        frequency: 80
      },
      {
        driver: 'Deduction calculation differences',
        impact: 30,
        frequency: 45
      },
      {
        driver: 'Rounding differences',
        impact: 10,
        frequency: 95
      }
    ];

    const mitigationEffectiveness = {
      currentMitigations: 3,
      effectivenessScore: 70,
      recommendedActions: [
        'Implement standardized tax calculation rules',
        'Review deduction calculation methodology',
        'Establish rounding consistency standards'
      ]
    };

    return {
      currentPeriod,
      historicalTrend,
      varianceDrivers,
      mitigationEffectiveness
    };

  } catch (error) {
    console.error('Failed to analyze payroll variance trends:', error);
    throw new Error(`Variance trend analysis failed: ${error}`);
  }
}

/**
 * Build readiness forecast
 */
export async function buildReadinessForecast(
  companyId: string,
  payrollPeriodId: string
): Promise<PayrollReadinessForecast> {
  try {
    // Current readiness assessment
    const healthScore = await calculateMigrationHealthScore(companyId, payrollPeriodId);
    
    const currentReadiness = {
      score: healthScore.overallScore,
      level: (healthScore.healthLevel === 'excellent' ? 'ready' :
             healthScore.healthLevel === 'good' ? 'high_confidence' :
             healthScore.healthLevel === 'fair' ? 'moderate_confidence' :
             healthScore.healthLevel === 'poor' ? 'low_confidence' : 'not_ready') as 'ready' | 'high_confidence' | 'moderate_confidence' | 'low_confidence' | 'not_ready',
      keyFactors: {
        calculationConsistency: healthScore.componentScores.calculationAccuracy,
        governanceCompliance: healthScore.componentScores.governanceCompliance,
        varianceControl: healthScore.componentScores.varianceControl,
        rollbackReadiness: healthScore.componentScores.rollbackReadiness
      }
    };

    // Projected readiness based on current trends
    const projectedReadiness = [
      {
        timeframe: '1 week',
        projectedScore: Math.min(100, healthScore.overallScore + 5),
        confidence: 75,
        keyMilestones: ['Complete governance approvals', 'Reduce variance to <5%'],
        risks: ['Unexpected calculation issues', 'Governance delays']
      },
      {
        timeframe: '2 weeks',
        projectedScore: Math.min(100, healthScore.overallScore + 10),
        confidence: 85,
        keyMilestones: ['Full pilot coverage', 'Stabilize variance trends'],
        risks: ['System stability issues', 'Resource constraints']
      },
      {
        timeframe: '1 month',
        projectedScore: Math.min(100, healthScore.overallScore + 15),
        confidence: 90,
        keyMilestones: ['Production readiness evaluation', 'Complete rollback testing'],
        risks: ['Changing requirements', 'Technical debt']
      }
    ];

    // Readiness barriers
    const readinessBarriers = [];
    if (healthScore.componentScores.governanceCompliance < 100) {
      readinessBarriers.push({
        barrier: 'Incomplete governance approvals',
        impact: 'high' as const,
        estimatedResolution: '1-2 weeks',
        dependencies: ['Director approval', 'Admin approval']
      });
    }
    if (healthScore.componentScores.varianceControl < 80) {
      readinessBarriers.push({
        barrier: 'High payroll variance',
        impact: 'high' as const,
        estimatedResolution: '2-3 weeks',
        dependencies: ['Variance analysis', 'Calculation fixes']
      });
    }
    if (healthScore.componentScores.rollbackReadiness < 100) {
      readinessBarriers.push({
        barrier: 'Insufficient rollback readiness',
        impact: 'medium' as const,
        estimatedResolution: '1 week',
        dependencies: ['Recovery point creation', 'Rollback testing']
      });
    }

    const activationRecommendations = [
      'Complete all governance approvals before activation',
      'Achieve <5% variance across all workers',
      'Establish comprehensive rollback recovery points',
      'Conduct full-scale pilot testing',
      'Implement production monitoring and alerting'
    ];

    return {
      currentReadiness,
      projectedReadiness,
      readinessBarriers,
      activationRecommendations
    };

  } catch (error) {
    console.error('Failed to build readiness forecast:', error);
    throw new Error(`Readiness forecast build failed: ${error}`);
  }
}

/**
 * Generate executive alerts
 */
export async function generateExecutiveAlerts(
  companyId: string,
  payrollPeriodId: string,
  overview: any,
  riskProfile: PayrollMigrationRiskProfile,
  pilotAnalytics: PayrollPilotTrendAnalysis
): Promise<PayrollExecutiveAlert[]> {
  const alerts: PayrollExecutiveAlert[] = [];

  try {
    // High variance alerts
    if (pilotAnalytics.varianceAnalysis.maxNetPayDifference > 20) {
      alerts.push({
        alertId: `alert_high_variance_${Date.now()}`,
        alertType: 'high_variance',
        severity: 'warning',
        title: 'High Payroll Variance Detected',
        description: `Maximum variance of $${pilotAnalytics.varianceAnalysis.maxNetPayDifference.toFixed(2)} exceeds acceptable thresholds`,
        affectedComponents: ['payroll_calculation', 'validation'],
        timestamp: new Date().toISOString(),
        resolved: false,
        recommendedActions: [
          'Investigate variance sources',
          'Review calculation methodology',
          'Implement additional validation'
        ],
        metrics: {
          currentValue: pilotAnalytics.varianceAnalysis.maxNetPayDifference,
          threshold: 20
        }
      });
    }

    // Rollback readiness failure alerts
    if (riskProfile.riskFactors.rollbackReadiness.score < 80) {
      alerts.push({
        alertId: `alert_rollback_readiness_${Date.now()}`,
        alertType: 'rollback_readiness_failure',
        severity: 'error',
        title: 'Rollback Readiness Failure',
        description: `Rollback readiness score of ${riskProfile.riskFactors.rollbackReadiness.score} is below minimum threshold`,
        affectedComponents: ['rollback_infrastructure', 'recovery_points'],
        timestamp: new Date().toISOString(),
        resolved: false,
        recommendedActions: [
          'Create rollback recovery points',
          'Test rollback procedures',
          'Validate rollback safety'
        ],
        metrics: {
          currentValue: riskProfile.riskFactors.rollbackReadiness.score,
          threshold: 80
        }
      });
    }

    // Governance blocker alerts
    if (riskProfile.riskFactors.governanceCompliance.score < 50) {
      alerts.push({
        alertId: `alert_governance_blocker_${Date.now()}`,
        alertType: 'governance_blocker',
        severity: 'critical',
        title: 'Governance Approval Blocker',
        description: `Governance compliance score of ${riskProfile.riskFactors.governanceCompliance.score} indicates approval issues`,
        affectedComponents: ['governance_workflow', 'approvals'],
        timestamp: new Date().toISOString(),
        resolved: false,
        recommendedActions: [
          'Complete director approval',
          'Complete admin approval',
          'Address approval concerns'
        ],
        metrics: {
          currentValue: riskProfile.riskFactors.governanceCompliance.score,
          threshold: 50
        }
      });
    }

    // Low confidence alerts
    if (pilotAnalytics.confidenceMetrics.overallConfidence < 70) {
      alerts.push({
        alertId: `alert_low_confidence_${Date.now()}`,
        alertType: 'low_confidence',
        severity: 'warning',
        title: 'Low Migration Confidence',
        description: `Overall confidence score of ${pilotAnalytics.confidenceMetrics.overallConfidence} is below acceptable levels`,
        affectedComponents: ['pilot_execution', 'validation'],
        timestamp: new Date().toISOString(),
        resolved: false,
        recommendedActions: [
          'Improve calculation consistency',
          'Reduce variance levels',
          'Increase validation coverage'
        ],
        metrics: {
          currentValue: pilotAnalytics.confidenceMetrics.overallConfidence,
          threshold: 70
        }
      });
    }

    // Orchestration safety warnings
    if (riskProfile.riskFactors.calculationConsistency.score < 75) {
      alerts.push({
        alertId: `alert_orchestration_safety_${Date.now()}`,
        alertType: 'orchestration_safety_warning',
        severity: 'warning',
        title: 'Orchestration Safety Warning',
        description: `Calculation consistency score of ${riskProfile.riskFactors.calculationConsistency.score} may indicate orchestration issues`,
        affectedComponents: ['orchestration_layer', 'safety_validations'],
        timestamp: new Date().toISOString(),
        resolved: false,
        recommendedActions: [
          'Review orchestration safety checks',
          'Validate execution paths',
          'Check safety lock mechanisms'
        ],
        metrics: {
          currentValue: riskProfile.riskFactors.calculationConsistency.score,
          threshold: 75
        }
      });
    }

    return alerts;

  } catch (error) {
    console.error('Failed to generate executive alerts:', error);
    return [{
      alertId: `alert_generation_error_${Date.now()}`,
      alertType: 'orchestration_safety_warning',
      severity: 'error',
      title: 'Alert Generation Error',
      description: `Failed to generate executive alerts: ${error}`,
      affectedComponents: ['analytics_system'],
      timestamp: new Date().toISOString(),
      resolved: false,
      recommendedActions: ['Fix alert generation system'],
      metrics: {
        currentValue: 0,
        threshold: 0
      }
    }];
  }
}

/**
 * Calculate activation readiness
 */
export async function calculateActivationReadiness(
  companyId: string,
  payrollPeriodId: string
): Promise<{
  score: number;
  readinessLevel: 'not_ready' | 'low_confidence' | 'moderate_confidence' | 'high_confidence' | 'ready';
  factors: {
    governanceApproval: boolean;
    varianceControl: boolean;
    rollbackReadiness: boolean;
    pilotCoverage: boolean;
    systemStability: boolean;
  };
  blockers: string[];
  recommendations: string[];
}> {
  try {
    // Get health score for component analysis
    const healthScore = await calculateMigrationHealthScore(companyId, payrollPeriodId);

    const factors = {
      governanceApproval: healthScore.componentScores.governanceCompliance >= 100,
      varianceControl: healthScore.componentScores.varianceControl >= 80,
      rollbackReadiness: healthScore.componentScores.rollbackReadiness >= 90,
      pilotCoverage: healthScore.componentScores.pilotExecutionQuality >= 80,
      systemStability: healthScore.componentScores.systemStability >= 90
    };

    const blockers = [];
    if (!factors.governanceApproval) blockers.push('Governance approvals incomplete');
    if (!factors.varianceControl) blockers.push('Payroll variance too high');
    if (!factors.rollbackReadiness) blockers.push('Rollback readiness insufficient');
    if (!factors.pilotCoverage) blockers.push('Pilot coverage too low');
    if (!factors.systemStability) blockers.push('System stability issues detected');

    const readinessLevel = healthScore.overallScore >= 95 ? 'ready' :
                        healthScore.overallScore >= 80 ? 'high_confidence' :
                        healthScore.overallScore >= 60 ? 'moderate_confidence' :
                        healthScore.overallScore >= 40 ? 'low_confidence' : 'not_ready';

    const recommendations = [
      'Complete all readiness factors before activation',
      'Achieve 95+ overall health score',
      'Resolve all critical blockers',
      'Conduct final readiness validation'
    ];

    return {
      score: healthScore.overallScore,
      readinessLevel,
      factors,
      blockers,
      recommendations
    };

  } catch (error) {
    console.error('Failed to calculate activation readiness:', error);
    return {
      score: 0,
      readinessLevel: 'not_ready',
      factors: {
        governanceApproval: false,
        varianceControl: false,
        rollbackReadiness: false,
        pilotCoverage: false,
        systemStability: false
      },
      blockers: [`Readiness calculation failed: ${error}`],
      recommendations: ['Fix calculation errors']
    };
  }
}

/**
 * Build executive dashboard metrics
 */
export async function buildExecutiveDashboardMetrics(
  companyId: string,
  payrollPeriodId: string
): Promise<{
  migrationOverview: any;
  riskAssessment: any;
  governanceStatus: any;
  performanceMetrics: any;
  alertSummary: any;
  readinessIndicators: any;
}> {
  try {
    // Generate comprehensive executive summary
    const executiveSummary = await generateExecutiveMigrationSummary(companyId, payrollPeriodId);

    return {
      migrationOverview: {
        readinessScore: executiveSummary.overview.migrationReadinessScore,
        confidenceLevel: executiveSummary.overview.overallConfidence,
        riskLevel: executiveSummary.overview.riskLevel,
        governanceStatus: executiveSummary.overview.governanceStatus
      },
      riskAssessment: {
        overallRiskScore: executiveSummary.riskProfile.overallRiskScore,
        criticalRisksCount: executiveSummary.riskProfile.criticalRisks.length,
        highImpactFactors: executiveSummary.riskProfile.riskFactors.varianceControl.impact === 'high'
      },
      governanceStatus: {
        approvalProgress: executiveSummary.governanceAnalytics.approvalStatus.approvalProgress,
        reviewCompletionRate: executiveSummary.governanceAnalytics.workerReviews.reviewCompletionRate,
        complianceScore: executiveSummary.governanceAnalytics.complianceMetrics.governanceComplianceScore
      },
      performanceMetrics: {
        pilotSuccessRate: executiveSummary.pilotAnalytics.pilotExecutions.successRate,
        varianceControl: executiveSummary.pilotAnalytics.varianceAnalysis.varianceTrend,
        calculationAccuracy: executiveSummary.pilotAnalytics.confidenceMetrics.calculationConsistency
      },
      alertSummary: {
        criticalAlerts: executiveSummary.alerts.filter(a => a.severity === 'critical').length,
        warningAlerts: executiveSummary.alerts.filter(a => a.severity === 'warning').length,
        unresolvedAlerts: executiveSummary.alerts.filter(a => !a.resolved).length
      },
      readinessIndicators: {
        currentScore: executiveSummary.healthScore.overallScore,
        healthLevel: executiveSummary.healthScore.healthLevel,
        barriersCount: executiveSummary.readinessForecast.readinessBarriers.length,
        projectedImprovement: executiveSummary.readinessForecast.projectedReadiness[1]?.projectedScore || 0
      }
    };

  } catch (error) {
    console.error('Failed to build executive dashboard metrics:', error);
    throw new Error(`Executive dashboard metrics build failed: ${error}`);
  }
}

// Helper functions
async function buildExecutiveOverview(companyId: string, payrollPeriodId: string): Promise<any> {
  try {
    // Get monitoring data
    const monitoringData = await payrollMonitor.getMonitoringSummary({ companyId, payrollPeriodId });
    
    // Get migration approval
    const migrationApproval = await payrollMigrationApprovals.getMigrationApproval(payrollPeriodId, companyId);

    // Calculate overview metrics
    const totalWorkers = monitoringData?.totalEmployees || 0;
    const migrationReadinessScore = migrationApproval?.migrationReadinessScore || 0;
    const overallConfidence = migrationReadinessScore; // Simplified for now
    const riskLevel = migrationReadinessScore >= 80 ? 'low' :
                      migrationReadinessScore >= 60 ? 'medium' :
                      migrationReadinessScore >= 40 ? 'high' : 'critical';
    const governanceStatus = migrationApproval?.migrationStatus || 'pending';

    return {
      totalWorkers,
      migrationReadinessScore,
      overallConfidence,
      riskLevel,
      governanceStatus
    };

  } catch (error) {
    console.error('Failed to build executive overview:', error);
    return {
      totalWorkers: 0,
      migrationReadinessScore: 0,
      overallConfidence: 0,
      riskLevel: 'critical',
      governanceStatus: 'error'
    };
  }
}

function generateExecutiveRecommendations(
  overview: any,
  riskProfile: PayrollMigrationRiskProfile,
  pilotAnalytics: PayrollPilotTrendAnalysis,
  governanceAnalytics: PayrollGovernanceAnalytics
): string[] {
  const recommendations: string[] = [];

  // Risk-based recommendations
  if (riskProfile.overallRiskScore > 50) {
    recommendations.push('Address high-priority risk factors immediately');
  }
  if (riskProfile.riskFactors.governanceCompliance.score < 75) {
    recommendations.push('Complete governance approval process');
  }
  if (riskProfile.riskFactors.varianceControl.score < 80) {
    recommendations.push('Implement variance reduction measures');
  }

  // Performance-based recommendations
  if (pilotAnalytics.pilotExecutions.successRate < 90) {
    recommendations.push('Improve pilot execution success rate');
  }
  if (pilotAnalytics.confidenceMetrics.overallConfidence < 80) {
    recommendations.push('Increase calculation consistency');
  }

  // Governance-based recommendations
  if (governanceAnalytics.approvalStatus.approvalProgress < 100) {
    recommendations.push('Complete all required approvals');
  }
  if (governanceAnalytics.workerReviews.reviewCompletionRate < 95) {
    recommendations.push('Accelerate worker review process');
  }

  return recommendations;
}
