// Jamaican Payroll Monitoring & Analytics Foundation - Phase 1F
// Safe monitoring utilities for Jamaican payroll shadow-mode audit data
// PHASE 1F MONITORING ONLY — NOT ACTIVE PAYROLL

import { supabase } from "./supabase";

export interface PayrollMonitoringSummary {
  // Basic counts
  totalAuditRecords: number;
  totalEmployees: number;
  totalPayrollPeriods: number;
  
  // Validation status breakdown
  validationStatusCounts: {
    valid: number;
    warning: number;
    error: number;
    not_available: number;
  };
  
  // Net pay differences
  netPayDifferences: {
    averageDifference: number;
    averageDifferencePercent: number;
    largestDifference: number;
    largestDifferencePercent: number;
    smallestDifference: number;
    smallestDifferencePercent: number;
  };
  
  // Deduction differences
  deductionDifferences: {
    averageDifference: number;
    averageDifferencePercent: number;
    largestDifference: number;
    largestDifferencePercent: number;
    smallestDifference: number;
    smallestDifferencePercent: number;
  };
  
  // Warning analysis
  warningAnalysis: {
    totalWarnings: number;
    mostCommonWarnings: Array<{ warning: string; count: number }>;
    warningsByEmployee: Array<{ employeeId: string; warningCount: number }>;
  };
  
  // Migration readiness
  migrationReadiness: {
    score: number; // 0-100
    issues: string[];
    recommendations: string[];
  };
  
  // Recent activity
  recentActivity: {
    lastAuditDate: string;
    recentAudits: Array<{
      employeeId: string;
      auditDate: string;
      validationStatus: string;
      netPayDifference: number;
    }>;
  };
  
  // Metadata
  generatedAt: string;
  monitoringVersion: string;
}

export interface PayrollMonitoringFilters {
  companyId: string;
  employeeId?: string;
  payrollPeriodId?: string;
  dateFrom?: string;
  dateTo?: string;
  validationStatus?: string;
}

export class PayrollMonitor {
  private readonly MONITORING_VERSION = 'jamaican_monitoring_v1.0_phase1f';

  /**
   * Get comprehensive monitoring summary for Jamaican payroll audit data
   * PHASE 1F MONITORING ONLY — NOT ACTIVE PAYROLL
   */
  async getMonitoringSummary(filters: PayrollMonitoringFilters): Promise<PayrollMonitoringSummary> {
    try {
      // Fetch audit records
      const auditRecords = await this.fetchAuditRecords(filters);
      
      if (!auditRecords || auditRecords.length === 0) {
        return this.createEmptySummary();
      }

      // Process audit records
      const processedData = this.processAuditRecords(auditRecords);
      
      // Generate summary
      return this.generateSummary(processedData, filters);
    } catch (error) {
      // PHASE 1F MONITORING ONLY — NOT ACTIVE PAYROLL
      // If monitoring fails, return empty summary but don't break system
      console.warn('Payroll monitoring failed:', error);
      return this.createEmptySummary();
    }
  }

  /**
   * Get total audit count
   */
  async getTotalAuditCount(companyId: string, filters?: Partial<PayrollMonitoringFilters>): Promise<number> {
    try {
      const query = supabase
        .from('payroll_calculation_audit')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('new_calculation_method', 'jamaican_shadow_payroll_with_validation');

      if (filters?.employeeId) {
        query.contains('new_values', { employeeId: filters.employeeId });
      }
      if (filters?.payrollPeriodId) {
        query.contains('new_values', { payrollPeriodId: filters.payrollPeriodId });
      }
      if (filters?.dateFrom) {
        query.gte('changed_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query.lte('changed_at', filters.dateTo);
      }

      const { count, error } = await query;
      
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.warn('Failed to get total audit count:', error);
      return 0;
    }
  }

  /**
   * Get validation status counts
   */
  async getValidationStatusCounts(companyId: string): Promise<{
    valid: number;
    warning: number;
    error: number;
    not_available: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('payroll_calculation_audit')
        .select('new_values')
        .eq('company_id', companyId)
        .eq('new_calculation_method', 'jamaican_shadow_payroll_with_validation');

      if (error) throw error;

      const counts = { valid: 0, warning: 0, error: 0, not_available: 0 };
      
      data?.forEach(record => {
        const newValues = record.new_values as any;
        const status = newValues?.validation_status;
        if (status && counts.hasOwnProperty(status)) {
          counts[status as keyof typeof counts]++;
        }
      });

      return counts;
    } catch (error) {
      console.warn('Failed to get validation status counts:', error);
      return { valid: 0, warning: 0, error: 0, not_available: 0 };
    }
  }

  /**
   * Get warning frequency analysis
   */
  async getWarningFrequency(companyId: string): Promise<Array<{ warning: string; count: number }>> {
    try {
      const { data, error } = await supabase
        .from('payroll_calculation_audit')
        .select('new_values')
        .eq('company_id', companyId)
        .eq('new_calculation_method', 'jamaican_shadow_payroll_with_validation');

      if (error) throw error;

      const warningCounts: { [key: string]: number } = {};
      
      data?.forEach(record => {
        const newValues = record.new_values as any;
        const warnings = newValues?.validation_warnings || [];
        
        warnings.forEach((warning: string) => {
          warningCounts[warning] = (warningCounts[warning] || 0) + 1;
        });
      });

      return Object.entries(warningCounts)
        .map(([warning, count]) => ({ warning, count }))
        .sort((a, b) => b.count - a.count);
    } catch (error) {
      console.warn('Failed to get warning frequency:', error);
      return [];
    }
  }

  /**
   * Get net pay difference statistics
   */
  async getNetPayDifferenceStats(companyId: string): Promise<{
    averageDifference: number;
    averageDifferencePercent: number;
    largestDifference: number;
    largestDifferencePercent: number;
    smallestDifference: number;
    smallestDifferencePercent: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('payroll_calculation_audit')
        .select('new_values')
        .eq('company_id', companyId)
        .eq('new_calculation_method', 'jamaican_shadow_payroll_with_validation');

      if (error) throw error;

      const differences: number[] = [];
      const percentDifferences: number[] = [];
      
      data?.forEach(record => {
        const newValues = record.new_values as any;
        const existingNetPay = newValues?.net_pay || 0;
        const jamaicanNetPay = newValues?.jamaican_shadow_net_pay || 0;
        
        if (existingNetPay > 0 && jamaicanNetPay > 0) {
          const diff = jamaicanNetPay - existingNetPay;
          const percentDiff = (diff / Math.abs(existingNetPay)) * 100;
          
          differences.push(diff);
          percentDifferences.push(percentDiff);
        }
      });

      if (differences.length === 0) {
        return {
          averageDifference: 0,
          averageDifferencePercent: 0,
          largestDifference: 0,
          largestDifferencePercent: 0,
          smallestDifference: 0,
          smallestDifferencePercent: 0,
        };
      }

      return {
        averageDifference: differences.reduce((a, b) => a + b, 0) / differences.length,
        averageDifferencePercent: percentDifferences.reduce((a, b) => a + b, 0) / percentDifferences.length,
        largestDifference: Math.max(...differences),
        largestDifferencePercent: Math.max(...percentDifferences),
        smallestDifference: Math.min(...differences),
        smallestDifferencePercent: Math.min(...percentDifferences),
      };
    } catch (error) {
      console.warn('Failed to get net pay difference stats:', error);
      return {
        averageDifference: 0,
        averageDifferencePercent: 0,
        largestDifference: 0,
        largestDifferencePercent: 0,
        smallestDifference: 0,
        smallestDifferencePercent: 0,
      };
    }
  }

  /**
   * Calculate migration readiness score
   */
  async calculateMigrationReadiness(companyId: string): Promise<{
    score: number; // 0-100
    issues: string[];
    recommendations: string[];
  }> {
    try {
      const [statusCounts, warningFrequency, netPayStats] = await Promise.all([
        this.getValidationStatusCounts(companyId),
        this.getWarningFrequency(companyId),
        this.getNetPayDifferenceStats(companyId),
      ]);

      let score = 100;
      const issues: string[] = [];
      const recommendations: string[] = [];

      // Check validation status distribution
      const totalRecords = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      if (totalRecords > 0) {
        const errorRate = (statusCounts.error / totalRecords) * 100;
        const notAvailableRate = (statusCounts.not_available / totalRecords) * 100;
        
        if (errorRate > 10) {
          score -= 30;
          issues.push(`High error rate: ${errorRate.toFixed(1)}%`);
          recommendations.push('Review and fix calculation errors before migration');
        }
        
        if (notAvailableRate > 20) {
          score -= 20;
          issues.push(`High unavailable rate: ${notAvailableRate.toFixed(1)}%`);
          recommendations.push('Improve Jamaican calculation availability');
        }
      }

      // Check warning frequency
      const highFrequencyWarnings = warningFrequency.filter(w => w.count > 10);
      if (highFrequencyWarnings.length > 0) {
        score -= 15;
        issues.push(`${highFrequencyWarnings.length} warnings occur frequently`);
        recommendations.push('Address common warning patterns');
      }

      // Check net pay differences
      if (Math.abs(netPayStats.averageDifferencePercent) > 5) {
        score -= 25;
        issues.push(`Large average net pay difference: ${netPayStats.averageDifferencePercent.toFixed(1)}%`);
        recommendations.push('Review Jamaican calculation assumptions');
      }

      if (Math.abs(netPayStats.largestDifferencePercent) > 20) {
        score -= 10;
        issues.push(`Very large net pay difference: ${netPayStats.largestDifferencePercent.toFixed(1)}%`);
        recommendations.push('Investigate extreme calculation differences');
      }

      // Ensure score doesn't go below 0
      score = Math.max(0, score);

      return { score, issues, recommendations };
    } catch (error) {
      console.warn('Failed to calculate migration readiness:', error);
      return {
        score: 0,
        issues: ['Unable to calculate readiness due to monitoring errors'],
        recommendations: ['Fix monitoring system first'],
      };
    }
  }

  /**
   * Get recent audit summaries
   */
  async getRecentAuditSummaries(companyId: string, limit: number = 10): Promise<Array<{
    employeeId: string;
    auditDate: string;
    validationStatus: string;
    netPayDifference: number;
  }>> {
    try {
      const { data, error } = await supabase
        .from('payroll_calculation_audit')
        .select('new_values, changed_at')
        .eq('company_id', companyId)
        .eq('new_calculation_method', 'jamaican_shadow_payroll_with_validation')
        .order('changed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data?.map(record => {
        const newValues = record.new_values as any;
        const existingNetPay = newValues?.net_pay || 0;
        const jamaicanNetPay = newValues?.jamaican_shadow_net_pay || 0;
        
        return {
          employeeId: newValues?.employeeId || 'unknown',
          auditDate: record.changed_at,
          validationStatus: newValues?.validation_status || 'unknown',
          netPayDifference: jamaicanNetPay - existingNetPay,
        };
      }) || [];
    } catch (error) {
      console.warn('Failed to get recent audit summaries:', error);
      return [];
    }
  }

  /**
   * Fetch audit records from database
   */
  private async fetchAuditRecords(filters: PayrollMonitoringFilters): Promise<any[]> {
    try {
      let query = supabase
        .from('payroll_calculation_audit')
        .select('*')
        .eq('company_id', filters.companyId)
        .eq('new_calculation_method', 'jamaican_shadow_payroll_with_validation');

      if (filters.employeeId) {
        query.contains('new_values', { employeeId: filters.employeeId });
      }
      if (filters.payrollPeriodId) {
        query.contains('new_values', { payrollPeriodId: filters.payrollPeriodId });
      }
      if (filters.dateFrom) {
        query.gte('changed_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query.lte('changed_at', filters.dateTo);
      }
      if (filters.validationStatus) {
        query.contains('new_values', { validationStatus: filters.validationStatus });
      }

      const { data, error } = await query.order('changed_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn('Failed to fetch audit records:', error);
      return [];
    }
  }

  /**
   * Process audit records for analysis
   */
  private processAuditRecords(records: any[]): any {
    const employees = new Set<string>();
    const payrollPeriods = new Set<string>();
    const validationStatusCounts = { valid: 0, warning: 0, error: 0, not_available: 0 };
    const netPayDifferences: number[] = [];
    const netPayPercentDifferences: number[] = [];
    const deductionDifferences: number[] = [];
    const deductionPercentDifferences: number[] = [];
    const warningCounts: { [key: string]: number } = {};
    const warningsByEmployee: { [key: string]: number } = {};

    records.forEach(record => {
      const newValues = record.new_values as any;
      
      // Extract basic info
      if (newValues?.employeeId) employees.add(newValues.employeeId);
      if (newValues?.payrollPeriodId) payrollPeriods.add(newValues.payrollPeriodId);
      
      // Extract validation status
      const status = newValues?.validation_status;
      if (status && validationStatusCounts.hasOwnProperty(status)) {
        validationStatusCounts[status as keyof typeof validationStatusCounts]++;
      }
      
      // Extract net pay differences
      const existingNetPay = newValues?.net_pay || 0;
      const jamaicanNetPay = newValues?.jamaican_shadow_net_pay || 0;
      if (existingNetPay > 0 && jamaicanNetPay > 0) {
        const diff = jamaicanNetPay - existingNetPay;
        const percentDiff = (diff / Math.abs(existingNetPay)) * 100;
        netPayDifferences.push(diff);
        netPayPercentDifferences.push(percentDiff);
      }
      
      // Extract deduction differences
      const existingDeductions = newValues?.total_deductions || 0;
      const jamaicanDeductions = this.extractJamaicanDeductions(newValues?.jamaican_shadow_deductions);
      if (existingDeductions > 0 && jamaicanDeductions > 0) {
        const diff = jamaicanDeductions - existingDeductions;
        const percentDiff = (diff / Math.abs(existingDeductions)) * 100;
        deductionDifferences.push(diff);
        deductionPercentDifferences.push(percentDiff);
      }
      
      // Extract warnings
      const warnings = newValues?.validation_warnings || [];
      warnings.forEach((warning: string) => {
        warningCounts[warning] = (warningCounts[warning] || 0) + 1;
      });
      
      if (warnings.length > 0 && newValues?.employeeId) {
        warningsByEmployee[newValues.employeeId] = (warningsByEmployee[newValues.employeeId] || 0) + warnings.length;
      }
    });

    return {
      employees,
      payrollPeriods,
      validationStatusCounts,
      netPayDifferences,
      netPayPercentDifferences,
      deductionDifferences,
      deductionPercentDifferences,
      warningCounts,
      warningsByEmployee,
      records,
    };
  }

  /**
   * Extract Jamaican deductions from shadow calculation
   */
  private extractJamaicanDeductions(jamaicanDeductions: any): number {
    if (!jamaicanDeductions || typeof jamaicanDeductions !== 'object') {
      return 0;
    }

    return jamaicanDeductions.total_employee_deductions || 0;
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(processedData: any, filters: PayrollMonitoringFilters): PayrollMonitoringSummary {
    const {
      employees,
      payrollPeriods,
      validationStatusCounts,
      netPayDifferences,
      netPayPercentDifferences,
      deductionDifferences,
      deductionPercentDifferences,
      warningCounts,
      warningsByEmployee,
      records,
    } = processedData;

    // Calculate statistics
    const netPayStats = this.calculateDifferences(netPayDifferences, netPayPercentDifferences);
    const deductionStats = this.calculateDifferences(deductionDifferences, deductionPercentDifferences);
    
    // Generate warning analysis
    const mostCommonWarnings = Object.entries(warningCounts)
      .map(([warning, count]) => ({ warning, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const warningsByEmployeeArray = Object.entries(warningsByEmployee)
      .map(([employeeId, warningCount]) => ({ employeeId, warningCount: warningCount as number }))
      .sort((a, b) => b.warningCount - a.warningCount)
      .slice(0, 10);

    // Generate recent activity
    const recentAudits = records.slice(0, 10).map((record: any) => {
      const newValues = record.new_values as any;
      const existingNetPay = newValues?.net_pay || 0;
      const jamaicanNetPay = newValues?.jamaican_shadow_net_pay || 0;
      
      return {
        employeeId: newValues?.employeeId || 'unknown',
        auditDate: record.changed_at,
        validationStatus: newValues?.validation_status || 'unknown',
        netPayDifference: jamaicanNetPay - existingNetPay,
      };
    });

    return {
      totalAuditRecords: records.length,
      totalEmployees: employees.size,
      totalPayrollPeriods: payrollPeriods.size,
      validationStatusCounts,
      netPayDifferences: netPayStats,
      deductionDifferences: deductionStats,
      warningAnalysis: {
        totalWarnings: Object.values(warningCounts).reduce((a: number, b: any) => a + b, 0),
        mostCommonWarnings,
        warningsByEmployee: warningsByEmployeeArray,
      },
      migrationReadiness: {
        score: 0, // Will be calculated separately
        issues: [],
        recommendations: [],
      },
      recentActivity: {
        lastAuditDate: records[0]?.changed_at || new Date().toISOString(),
        recentAudits,
      },
      generatedAt: new Date().toISOString(),
      monitoringVersion: this.MONITORING_VERSION,
    };
  }

  /**
   * Calculate difference statistics
   */
  private calculateDifferences(differences: number[], percentDifferences: number[]) {
    if (differences.length === 0) {
      return {
        averageDifference: 0,
        averageDifferencePercent: 0,
        largestDifference: 0,
        largestDifferencePercent: 0,
        smallestDifference: 0,
        smallestDifferencePercent: 0,
      };
    }

    return {
      averageDifference: differences.reduce((a, b) => a + b, 0) / differences.length,
      averageDifferencePercent: percentDifferences.reduce((a, b) => a + b, 0) / percentDifferences.length,
      largestDifference: Math.max(...differences),
      largestDifferencePercent: Math.max(...percentDifferences),
      smallestDifference: Math.min(...differences),
      smallestDifferencePercent: Math.min(...percentDifferences),
    };
  }

  /**
   * Create empty summary
   */
  private createEmptySummary(): PayrollMonitoringSummary {
    return {
      totalAuditRecords: 0,
      totalEmployees: 0,
      totalPayrollPeriods: 0,
      validationStatusCounts: { valid: 0, warning: 0, error: 0, not_available: 0 },
      netPayDifferences: {
        averageDifference: 0,
        averageDifferencePercent: 0,
        largestDifference: 0,
        largestDifferencePercent: 0,
        smallestDifference: 0,
        smallestDifferencePercent: 0,
      },
      deductionDifferences: {
        averageDifference: 0,
        averageDifferencePercent: 0,
        largestDifference: 0,
        largestDifferencePercent: 0,
        smallestDifference: 0,
        smallestDifferencePercent: 0,
      },
      warningAnalysis: {
        totalWarnings: 0,
        mostCommonWarnings: [],
        warningsByEmployee: [],
      },
      migrationReadiness: {
        score: 0,
        issues: ['No audit data available'],
        recommendations: ['Run payroll calculations to generate audit data'],
      },
      recentActivity: {
        lastAuditDate: new Date().toISOString(),
        recentAudits: [],
      },
      generatedAt: new Date().toISOString(),
      monitoringVersion: this.MONITORING_VERSION,
    };
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-JM', {
      style: 'currency',
      currency: 'JMD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
  }

  /**
   * Generate monitoring summary report
   */
  generateMonitoringReport(summary: PayrollMonitoringSummary): string {
    return `
Jamaican Payroll Monitoring Report
Generated: ${summary.generatedAt}
Version: ${summary.monitoringVersion}

OVERVIEW
--------
Total Audit Records: ${summary.totalAuditRecords}
Total Employees: ${summary.totalEmployees}
Total Payroll Periods: ${summary.totalPayrollPeriods}

VALIDATION STATUS
----------------
Valid: ${summary.validationStatusCounts.valid}
Warning: ${summary.validationStatusCounts.warning}
Error: ${summary.validationStatusCounts.error}
Not Available: ${summary.validationStatusCounts.not_available}

NET PAY DIFFERENCES
-------------------
Average: ${this.formatCurrency(summary.netPayDifferences.averageDifference)} (${summary.netPayDifferences.averageDifferencePercent.toFixed(2)}%)
Largest: ${this.formatCurrency(summary.netPayDifferences.largestDifference)} (${summary.netPayDifferences.largestDifferencePercent.toFixed(2)}%)
Smallest: ${this.formatCurrency(summary.netPayDifferences.smallestDifference)} (${summary.netPayDifferences.smallestDifferencePercent.toFixed(2)}%)

DEDUCTION DIFFERENCES
---------------------
Average: ${this.formatCurrency(summary.deductionDifferences.averageDifference)} (${summary.deductionDifferences.averageDifferencePercent.toFixed(2)}%)
Largest: ${this.formatCurrency(summary.deductionDifferences.largestDifference)} (${summary.deductionDifferences.largestDifferencePercent.toFixed(2)}%)

WARNING ANALYSIS
----------------
Total Warnings: ${summary.warningAnalysis.totalWarnings}
Most Common Warnings:
${summary.warningAnalysis.mostCommonWarnings.map(w => `  - ${w.warning} (${w.count} times)`).join('\n')}

MIGRATION READINESS
------------------
Score: ${summary.migrationReadiness.score}/100
Issues:
${summary.migrationReadiness.issues.map(issue => `  - ${issue}`).join('\n')}
Recommendations:
${summary.migrationReadiness.recommendations.map(rec => `  - ${rec}`).join('\n')}

RECENT ACTIVITY
---------------
Last Audit: ${summary.recentActivity.lastAuditDate}
Recent Audits:
${summary.recentActivity.recentAudits.slice(0, 5).map(audit => `  - ${audit.employeeId}: ${audit.validationStatus} (${this.formatCurrency(audit.netPayDifference)})`).join('\n')}
    `.trim();
  }
}

// Export singleton instance for easy access
export const payrollMonitor = new PayrollMonitor();

