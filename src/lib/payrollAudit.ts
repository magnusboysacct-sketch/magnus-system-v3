// Jamaican Payroll Audit Persistence Layer - Phase 1E
// Safe audit utilities for payroll calculation tracking
// PHASE 1E AUDIT PERSISTENCE ONLY — NOT ACTIVE PAYROLL

import { supabase } from "./supabase";

export interface PayrollAuditInput {
  // Core identifiers
  companyId: string;
  employeeId: string;
  payrollPeriodId?: string;
  
  // Payroll calculation data
  grossPay: number;
  existingNetPay: number;
  existingTotalDeductions: number;
  
  // Jamaican shadow calculation data
  jamaicanShadowNetPay?: number;
  jamaicanShadowDeductions?: any;
  jamaicanShadowCalculation?: any;
  jamaicanShadowVersion?: string;
  
  // Validation data
  validationStatus?: 'valid' | 'warning' | 'error' | 'not_available';
  validationWarnings?: string[];
  validationDifferences?: any;
  validationVersion?: string;
}

export interface PayrollAuditRecord {
  // Core identifiers
  company_id: string;
  payroll_entry_id?: string;
  
  // Audit metadata
  old_calculation_method: string;
  new_calculation_method: string;
  old_values: any;
  new_values: any;
  changed_by?: string;
  changed_at: string;
  change_reason: string;
}

export class PayrollAuditor {
  private readonly AUDIT_VERSION = 'jamaican_audit_v1.0_phase1e';

  /**
   * Create audit record for Jamaican payroll calculation and validation
   * PHASE 1E AUDIT PERSISTENCE ONLY — NOT ACTIVE PAYROLL
   */
  async createPayrollAuditRecord(
    input: PayrollAuditInput,
    userId?: string
  ): Promise<void> {
    try {
      // Create old values (existing payroll calculation)
      const oldValues = {
        gross_pay: input.grossPay,
        net_pay: input.existingNetPay,
        total_deductions: input.existingTotalDeductions,
        calculation_method: 'legacy_us',
        calculation_version: 'legacy_us_preserved'
      };

      // Create new values (Jamaican shadow calculation + validation)
      const newValues = {
        gross_pay: input.grossPay,
        net_pay: input.existingNetPay, // Keep existing net pay for now
        jamaican_shadow_net_pay: input.jamaicanShadowNetPay,
        jamaican_shadow_deductions: input.jamaicanShadowDeductions,
        jamaican_shadow_calculation: input.jamaicanShadowCalculation,
        jamaican_shadow_version: input.jamaicanShadowVersion,
        validation_status: input.validationStatus,
        validation_warnings: input.validationWarnings,
        validation_differences: input.validationDifferences,
        validation_version: input.validationVersion,
        calculation_method: 'jamaican_shadow',
        calculation_version: 'jamaican_v1.0_phase1e'
      };

      // Create audit record
      const auditRecord: PayrollAuditRecord = {
        company_id: input.companyId,
        payroll_entry_id: input.payrollPeriodId, // Will be updated when we have actual payroll entry ID
        old_calculation_method: 'legacy_us_payroll',
        new_calculation_method: 'jamaican_shadow_payroll_with_validation',
        old_values: oldValues,
        new_values: newValues,
        changed_by: userId,
        changed_at: new Date().toISOString(),
        change_reason: 'Phase 1E: Jamaican shadow calculation and validation audit',
      };

      // Insert into payroll_calculation_audit table
      const { error } = await this.insertAuditRecord(auditRecord);
      
      if (error) {
        console.warn('Failed to insert payroll audit record:', error);
      }
    } catch (error) {
      // PHASE 1E AUDIT PERSISTENCE ONLY — NOT ACTIVE PAYROLL
      // If audit fails, log warning but don't break payroll
      console.warn('Jamaican payroll audit failed:', error);
    }
  }

  /**
   * Insert audit record into database
   */
  private async insertAuditRecord(record: PayrollAuditRecord): Promise<{ error?: any }> {
    try {
      const { error } = await supabase
        .from('payroll_calculation_audit')
        .insert([record])
        .select();

      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Generate audit summary for logging
   */
  generateAuditSummary(input: PayrollAuditInput): string {
    return `Jamaican Payroll Audit Summary:
Employee: ${input.employeeId}
Company: ${input.companyId}
Payroll Period: ${input.payrollPeriodId || 'N/A'}
Gross Pay: ${this.formatCurrency(input.grossPay)}
Existing Net Pay: ${this.formatCurrency(input.existingNetPay)}
Existing Deductions: ${this.formatCurrency(input.existingTotalDeductions)}
Jamaican Shadow Net Pay: ${input.jamaicanShadowNetPay ? this.formatCurrency(input.jamaicanShadowNetPay) : 'N/A'}
Validation Status: ${input.validationStatus || 'N/A'}
Validation Warnings: ${input.validationWarnings?.length || 0}
Audit Version: ${this.AUDIT_VERSION}
Created: ${new Date().toISOString()}`;
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
   * Update audit record with payroll entry ID
   * This can be called after the payroll entry is created and we have the ID
   */
  async updateAuditRecordWithPayrollEntryId(
    auditId: string,
    payrollEntryId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('payroll_calculation_audit')
        .update({ payroll_entry_id: payrollEntryId })
        .eq('id', auditId);

      if (error) {
        console.warn('Failed to update audit record with payroll entry ID:', error);
      }
    } catch (error) {
      console.warn('Audit record update failed:', error);
    }
  }

  /**
   * Get audit records for a company
   */
  async getCompanyAuditRecords(
    companyId: string,
    limit?: number
  ): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_calculation_audit')
        .select('*')
        .eq('company_id', companyId)
        .order('changed_at', { ascending: false })
        .limit(limit || 100);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn('Failed to fetch audit records:', error);
      return [];
    }
  }

  /**
   * Get audit records for a specific employee
   */
  async getEmployeeAuditRecords(
    employeeId: string,
    companyId: string,
    limit?: number
  ): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_calculation_audit')
        .select('*')
        .eq('company_id', companyId)
        .contains('new_values', employeeId.toString())
        .order('changed_at', { ascending: false })
        .limit(limit || 50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn('Failed to fetch employee audit records:', error);
      return [];
    }
  }

  /**
   * Create batch audit records for multiple employees
   */
  async createBatchAuditRecords(
    inputs: PayrollAuditInput[],
    userId?: string
  ): Promise<void> {
    try {
      const auditRecords = inputs.map(input => {
        const oldValues = {
          gross_pay: input.grossPay,
          net_pay: input.existingNetPay,
          total_deductions: input.existingTotalDeductions,
          calculation_method: 'legacy_us',
          calculation_version: 'legacy_us_preserved'
        };

        const newValues = {
          gross_pay: input.grossPay,
          net_pay: input.existingNetPay,
          jamaican_shadow_net_pay: input.jamaicanShadowNetPay,
          jamaican_shadow_deductions: input.jamaicanShadowDeductions,
          jamaican_shadow_calculation: input.jamaicanShadowCalculation,
          jamaican_shadow_version: input.jamaicanShadowVersion,
          validation_status: input.validationStatus,
          validation_warnings: input.validationWarnings,
          validation_differences: input.validationDifferences,
          validation_version: input.validationVersion,
          calculation_method: 'jamaican_shadow',
          calculation_version: 'jamaican_v1.0_phase1e'
        };

        return {
          company_id: input.companyId,
          payroll_entry_id: input.payrollPeriodId,
          old_calculation_method: 'legacy_us_payroll',
          new_calculation_method: 'jamaican_shadow_payroll_with_validation',
          old_values: oldValues,
          new_values: newValues,
          changed_by: userId,
          changed_at: new Date().toISOString(),
          change_reason: 'Phase 1E: Jamaican shadow calculation and validation audit',
        };
      });

      // Insert batch records
      const { error } = await supabase
        .from('payroll_calculation_audit')
        .insert(auditRecords)
        .select();

      if (error) {
        console.warn('Failed to insert batch audit records:', error);
      }
    } catch (error) {
      // PHASE 1E AUDIT PERSISTENCE ONLY — NOT ACTIVE PAYROLL
      // If batch audit fails, log warning but don't break payroll
      console.warn('Jamaican payroll batch audit failed:', error);
    }
  }
}

// Export singleton instance for easy access
export const payrollAuditor = new PayrollAuditor();

