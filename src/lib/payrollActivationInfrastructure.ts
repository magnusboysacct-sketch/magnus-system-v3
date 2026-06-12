// Payroll Activation Infrastructure - Phase 2D-1
// Safe helper functions for activation infrastructure management
// PHASE 2D-1 ACTIVATION INFRASTRUCTURE ONLY — NOT ACTIVE PAYROLL

import { supabase } from './supabase';

// Activation flag interfaces
export interface PayrollActivationFlags {
  id: string;
  company_id: string;
  jamaican_payroll_enabled: boolean;
  pilot_mode_enabled: boolean;
  dual_run_mode: boolean;
  auto_rollback_enabled: boolean;
  rollback_threshold_hours: number;
  require_governance_approval: boolean;
  min_readiness_score: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollPeriodActivationFlags {
  id: string;
  company_id: string;
  payroll_period_id: string;
  activation_engine: 'us' | 'jamaican' | 'pilot_jamaican' | 'dual_run';
  activation_mode: 'full' | 'pilot_group' | 'comparison_only';
  validation_required: boolean;
  rollback_enabled: boolean;
  created_at: string;
  updated_at: string;
  activated_by?: string;
  activated_at?: string;
  rolled_back_at?: string;
  notes?: string;
}

export interface PayrollExecutionVersion {
  id: string;
  company_id: string;
  payroll_period_id: string;
  execution_engine: string;
  version_number: number;
  calculation_version: string;
  is_rollback_version: boolean;
  rollback_from_version_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface PayrollPilotGroup {
  id: string;
  company_id: string;
  group_name: string;
  worker_ids: string[];
  activation_status: 'pending' | 'active' | 'paused' | 'rolled_back';
  created_at: string;
  updated_at: string;
  activated_at?: string;
  rolled_back_at?: string;
  notes?: string;
  created_by?: string;
  updated_by?: string;
}

export interface PayrollWorkerActivationFlag {
  id: string;
  company_id: string;
  worker_id: string;
  payroll_period_id: string;
  activation_engine: 'us' | 'jamaican' | 'pilot_jamaican';
  is_pilot_worker: boolean;
  rollback_version: number;
  created_at: string;
  updated_at: string;
}

// Helper functions for activation infrastructure management
export class PayrollActivationInfrastructure {
  
  /**
   * Get company-level activation flags
   */
  static async getActivationFlags(companyId: string): Promise<PayrollActivationFlags | null> {
    try {
      const { data, error } = await supabase
        .from('payroll_activation_flags')
        .select('*')
        .eq('company_id', companyId)
        .single();

      if (error) {
        console.error('Failed to get activation flags:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting activation flags:', error);
      return null;
    }
  }

  /**
   * Get payroll period-specific activation flags
   */
  static async getPayrollPeriodActivation(
    payrollPeriodId: string,
    companyId: string
  ): Promise<PayrollPeriodActivationFlags | null> {
    try {
      const { data, error } = await supabase
        .from('payroll_period_activation_flags')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId)
        .single();

      if (error) {
        console.error('Failed to get payroll period activation:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting payroll period activation:', error);
      return null;
    }
  }

  /**
   * Get execution versions for a payroll period
   */
  static async getExecutionVersions(
    payrollPeriodId: string,
    companyId: string
  ): Promise<PayrollExecutionVersion[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_execution_versions')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId)
        .order('version_number', { ascending: false });

      if (error) {
        console.error('Failed to get execution versions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting execution versions:', error);
      return [];
    }
  }

  /**
   * Get latest execution version
   */
  static async getLatestExecutionVersion(
    payrollPeriodId: string,
    companyId: string
  ): Promise<PayrollExecutionVersion | null> {
    try {
      const { data, error } = await supabase
        .from('payroll_execution_versions')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Failed to get latest execution version:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting latest execution version:', error);
      return null;
    }
  }

  /**
   * Archive payroll entries for version tracking
   */
  static async archivePayrollEntries(
    payrollPeriodId: string,
    companyId: string,
    versionNumber: number,
    executionEngine: string
  ): Promise<void> {
    try {
      // Get current payroll entries to archive
      const { data: entries, error: fetchError } = await supabase
        .from('payroll_entries')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId);

      if (fetchError) {
        console.error('Failed to fetch payroll entries for archiving:', fetchError);
        throw fetchError;
      }

      if (!entries || entries.length === 0) {
        console.log('No payroll entries to archive');
        return;
      }

      // Prepare archive entries with version info
      const archiveEntries = entries.map(entry => ({
        ...entry,
        version_number: versionNumber,
        execution_engine: executionEngine,
        created_at: new Date().toISOString()
      }));

      // Insert into archive
      const { error: archiveError } = await supabase
        .from('payroll_entries_archive')
        .insert(archiveEntries);

      if (archiveError) {
        console.error('Failed to archive payroll entries:', archiveError);
        throw archiveError;
      }

      console.log(`Archived ${entries.length} payroll entries with version ${versionNumber}`);
    } catch (error) {
      console.error('Error archiving payroll entries:', error);
      throw error;
    }
  }

  /**
   * Create new execution version
   */
  static async createExecutionVersion(
    payrollPeriodId: string,
    companyId: string,
    executionEngine: string,
    calculationVersion: string,
    userId?: string
  ): Promise<PayrollExecutionVersion> {
    try {
      // Get latest version number
      const latestVersion = await this.getLatestExecutionVersion(payrollPeriodId, companyId);
      const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

      const newVersion = {
        company_id: companyId,
        payroll_period_id: payrollPeriodId,
        execution_engine: executionEngine,
        version_number: nextVersionNumber,
        calculation_version: calculationVersion,
        is_rollback_version: false,
        created_by: userId
      };

      const { data, error } = await supabase
        .from('payroll_execution_versions')
        .insert(newVersion)
        .select()
        .single();

      if (error) {
        console.error('Failed to create execution version:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error creating execution version:', error);
      throw error;
    }
  }

  /**
   * Get pilot groups for a company
   */
  static async getPilotGroups(companyId: string): Promise<PayrollPilotGroup[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_activation_pilot_groups')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to get pilot groups:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting pilot groups:', error);
      return [];
    }
  }

  /**
   * Create new pilot group
   */
  static async createPilotGroup(
    companyId: string,
    groupName: string,
    workerIds: string[],
    userId?: string
  ): Promise<PayrollPilotGroup> {
    try {
      const newGroup = {
        company_id: companyId,
        group_name: groupName,
        worker_ids: workerIds,
        activation_status: 'pending' as const,
        created_by: userId
      };

      const { data, error } = await supabase
        .from('payroll_activation_pilot_groups')
        .insert(newGroup)
        .select()
        .single();

      if (error) {
        console.error('Failed to create pilot group:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error creating pilot group:', error);
      throw error;
    }
  }

  /**
   * Get worker activation flags
   */
  static async getWorkerActivationFlags(
    workerId: string,
    payrollPeriodId: string,
    companyId: string
  ): Promise<PayrollWorkerActivationFlag | null> {
    try {
      const { data, error } = await supabase
        .from('payroll_worker_activation_flags')
        .select('*')
        .eq('worker_id', workerId)
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId)
        .single();

      if (error) {
        console.error('Failed to get worker activation flags:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting worker activation flags:', error);
      return null;
    }
  }

  /**
   * Set worker activation flag
   */
  static async setWorkerActivationFlag(
    workerId: string,
    payrollPeriodId: string,
    companyId: string,
    activationEngine: 'us' | 'jamaican' | 'pilot_jamaican',
    isPilotWorker: boolean = false
  ): Promise<PayrollWorkerActivationFlag> {
    try {
      const flagData = {
        company_id: companyId,
        worker_id: workerId,
        payroll_period_id: payrollPeriodId,
        activation_engine: activationEngine,
        is_pilot_worker: isPilotWorker
      };

      const { data, error } = await supabase
        .from('payroll_worker_activation_flags')
        .upsert(flagData, {
          onConflict: 'worker_id,payroll_period_id,company_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to set worker activation flag:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error setting worker activation flag:', error);
      throw error;
    }
  }

  /**
   * Get archived payroll entries for a specific version
   */
  static async getArchivedPayrollEntries(
    payrollPeriodId: string,
    companyId: string,
    versionNumber?: number
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('payroll_entries_archive')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId);

      if (versionNumber) {
        query = query.eq('version_number', versionNumber);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to get archived payroll entries:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting archived payroll entries:', error);
      return [];
    }
  }

  /**
   * Initialize activation flags for new company
   */
  static async initializeActivationFlags(companyId: string): Promise<PayrollActivationFlags> {
    try {
      const defaultFlags = {
        company_id: companyId,
        jamaican_payroll_enabled: false,
        pilot_mode_enabled: false,
        dual_run_mode: false,
        auto_rollback_enabled: true,
        rollback_threshold_hours: 24,
        require_governance_approval: true,
        min_readiness_score: 95.0
      };

      const { data, error } = await supabase
        .from('payroll_activation_flags')
        .insert(defaultFlags)
        .select()
        .single();

      if (error) {
        console.error('Failed to initialize activation flags:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error initializing activation flags:', error);
      throw error;
    }
  }
}
