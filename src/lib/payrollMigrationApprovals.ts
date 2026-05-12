// Payroll Migration Approvals - Phase 2C-3
// Governance workflow for Jamaican payroll migration approval process
// PHASE 2C-3 GOVERNANCE WORKFLOW ONLY — NOT ACTIVE PAYROLL

import { supabase } from './supabase';

// Approval state types
export type WorkerReviewStatus = 'pending' | 'reviewed' | 'approved' | 'rejected' | 'requires_investigation';
export type MigrationReadiness = 'not_ready' | 'ready' | 'approved' | 'blocked';
export type MigrationStatus = 'pending' | 'director_approved' | 'admin_approved' | 'fully_approved' | 'rejected';

// Worker review interface
export interface WorkerComparisonReview {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  workerId: string;
  reviewStatus: WorkerReviewStatus;
  migrationReadiness: MigrationReadiness;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  validationWarnings?: string[];
  usNetPay: number;
  jamaicanNetPay: number;
  netPayDifference: number;
  differencePercentage: number;
  createdAt: string;
  updatedAt: string;
}

// Migration approval interface
export interface PayrollMigrationApproval {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  migrationStatus: MigrationStatus;
  directorApprovalId?: string;
  directorApprovedAt?: string;
  directorNotes?: string;
  adminApprovalId?: string;
  adminApprovedAt?: string;
  adminNotes?: string;
  migrationReadinessScore: number;
  totalWorkers: number;
  readyWorkers: number;
  blockedWorkers: number;
  createdAt: string;
  updatedAt: string;
}

// Helper functions for approval workflow
export class PayrollMigrationApprovals {
  private readonly APPROVAL_VERSION = 'migration_approvals_v1.0_phase2c3';

  /**
   * Create or update a worker comparison review
   * PHASE 2C-3 GOVERNANCE WORKFLOW ONLY — NOT ACTIVE PAYROLL
   */
  async upsertWorkerReview(review: Omit<WorkerComparisonReview, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkerComparisonReview> {
    try {
      const { data, error } = await supabase
        .from('payroll_comparison_reviews')
        .upsert([{
          ...review,
          updated_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (error) throw error;
      return data as WorkerComparisonReview;
    } catch (error) {
      console.error('Failed to upsert worker review:', error);
      throw new Error(`Failed to upsert worker review: ${error}`);
    }
  }

  /**
   * Get worker comparison reviews for a payroll period
   */
  async getWorkerReviews(payrollPeriodId: string, companyId: string): Promise<WorkerComparisonReview[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_comparison_reviews')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkerComparisonReview[];
    } catch (error) {
      console.error('Failed to get worker reviews:', error);
      throw new Error(`Failed to get worker reviews: ${error}`);
    }
  }

  /**
   * Get worker comparison review by worker ID
   */
  async getWorkerReview(workerId: string, companyId: string): Promise<WorkerComparisonReview | null> {
    try {
      const { data, error } = await supabase
        .from('payroll_comparison_reviews')
        .select('*')
        .eq('worker_id', workerId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      return data as WorkerComparisonReview | null;
    } catch (error) {
      console.error('Failed to get worker review:', error);
      throw new Error(`Failed to get worker review: ${error}`);
    }
  }

  /**
   * Create or update a payroll migration approval
   * PHASE 2C-3 GOVERNANCE WORKFLOW ONLY — NOT ACTIVE PAYROLL
   */
  async upsertMigrationApproval(approval: Omit<PayrollMigrationApproval, 'id' | 'createdAt' | 'updatedAt'>): Promise<PayrollMigrationApproval> {
    try {
      const { data, error } = await supabase
        .from('payroll_migration_approvals')
        .upsert([{
          ...approval,
          updated_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (error) throw error;
      return data as PayrollMigrationApproval;
    } catch (error) {
      console.error('Failed to upsert migration approval:', error);
      throw new Error(`Failed to upsert migration approval: ${error}`);
    }
  }

  /**
   * Get payroll migration approval for a period
   */
  async getMigrationApproval(payrollPeriodId: string, companyId: string): Promise<PayrollMigrationApproval | null> {
    try {
      const { data, error } = await supabase
        .from('payroll_migration_approvals')
        .select('*')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      return data as PayrollMigrationApproval | null;
    } catch (error) {
      console.error('Failed to get migration approval:', error);
      throw new Error(`Failed to get migration approval: ${error}`);
    }
  }

  /**
   * Get migration readiness summary for a period
   */
  async getMigrationReadinessSummary(payrollPeriodId: string, companyId: string): Promise<{
    totalWorkers: number;
    readyWorkers: number;
    blockedWorkers: number;
    readinessScore: number;
    reviewStatusCounts: Record<WorkerReviewStatus, number>;
    readinessCounts: Record<MigrationReadiness, number>;
  }> {
    try {
      const { data, error } = await supabase
        .from('payroll_comparison_reviews')
        .select('review_status, migration_readiness')
        .eq('payroll_period_id', payrollPeriodId)
        .eq('company_id', companyId);

      if (error) throw error;

      // Calculate counts
      const reviewStatusCounts: Record<WorkerReviewStatus, number> = {
        pending: 0,
        reviewed: 0,
        approved: 0,
        rejected: 0,
        requires_investigation: 0,
      };

      const readinessCounts: Record<MigrationReadiness, number> = {
        not_ready: 0,
        ready: 0,
        approved: 0,
        blocked: 0,
      };

      let totalWorkers = 0;
      let readyWorkers = 0;
      let blockedWorkers = 0;

      data.forEach((review: any) => {
        totalWorkers++;
        reviewStatusCounts[review.review_status as WorkerReviewStatus]++;
        readinessCounts[review.migration_readiness as MigrationReadiness]++;
        
        if (review.migration_readiness === 'ready' || review.migration_readiness === 'approved') {
          readyWorkers++;
        } else if (review.migration_readiness === 'blocked') {
          blockedWorkers++;
        }
      });

      // Calculate readiness score
      const readinessScore = totalWorkers > 0 ? (readyWorkers / totalWorkers) * 100 : 0;

      return {
        totalWorkers,
        readyWorkers,
        blockedWorkers,
        readinessScore,
        reviewStatusCounts,
        readinessCounts,
      };
    } catch (error) {
      console.error('Failed to get migration readiness summary:', error);
      throw new Error(`Failed to get migration readiness summary: ${error}`);
    }
  }

  /**
   * Batch create worker reviews from comparison data
   * PHASE 2C-3 GOVERNANCE WORKFLOW ONLY — NOT ACTIVE PAYROLL
   */
  async batchCreateWorkerReviews(
    payrollPeriodId: string,
    companyId: string,
    workerComparisons: any[],
    userId: string
  ): Promise<WorkerComparisonReview[]> {
    try {
      const reviews = workerComparisons.map(worker => ({
        companyId,
        payrollPeriodId,
        workerId: worker.workerId,
        reviewStatus: 'pending' as WorkerReviewStatus,
        migrationReadiness: this.determineMigrationReadiness(worker.validationStatus, worker.warningCount),
        reviewedBy: userId,
        reviewedAt: new Date().toISOString(),
        validationWarnings: worker.validationWarnings || [],
        usNetPay: worker.usNetPay,
        jamaicanNetPay: worker.jamaicanNetPay,
        netPayDifference: worker.difference,
        differencePercentage: worker.differencePercentage,
      }));

      const { data, error } = await supabase
        .from('payroll_comparison_reviews')
        .insert(reviews)
        .select()
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkerComparisonReview[];
    } catch (error) {
      console.error('Failed to batch create worker reviews:', error);
      throw new Error(`Failed to batch create worker reviews: ${error}`);
    }
  }

  /**
   * Determine migration readiness from validation status and warnings
   */
  private determineMigrationReadiness(validationStatus: string, warningCount: number): MigrationReadiness {
    if (validationStatus === 'error') {
      return 'blocked';
    } else if (validationStatus === 'warning' || warningCount > 0) {
      return 'not_ready';
    } else if (validationStatus === 'valid') {
      return 'ready';
    } else {
      return 'not_ready';
    }
  }

  /**
   * Get migration approval history for a company
   */
  async getMigrationApprovalHistory(companyId: string, limit: number = 10): Promise<PayrollMigrationApproval[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_migration_approvals')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as PayrollMigrationApproval[];
    } catch (error) {
      console.error('Failed to get migration approval history:', error);
      throw new Error(`Failed to get migration approval history: ${error}`);
    }
  }

  /**
   * Generate migration readiness report
   */
  generateMigrationReadinessReport(summary: {
    totalWorkers: number;
    readyWorkers: number;
    blockedWorkers: number;
    readinessScore: number;
    reviewStatusCounts: Record<WorkerReviewStatus, number>;
    readinessCounts: Record<MigrationReadiness, number>;
  }): string {
    return `
Migration Readiness Report
Generated: ${new Date().toISOString()}
Version: ${this.APPROVAL_VERSION}

SUMMARY
========
Total Workers: ${summary.totalWorkers}
Ready for Migration: ${summary.readyWorkers}
Blocked from Migration: ${summary.blockedWorkers}
Readiness Score: ${summary.readinessScore.toFixed(1)}%

REVIEW STATUS BREAKDOWN
======================
Pending Reviews: ${summary.reviewStatusCounts.pending}
Reviewed: ${summary.reviewStatusCounts.reviewed}
Approved: ${summary.reviewStatusCounts.approved}
Rejected: ${summary.reviewStatusCounts.rejected}
Requires Investigation: ${summary.reviewStatusCounts.requires_investigation}

MIGRATION READINESS BREAKDOWN
=============================
Not Ready: ${summary.readinessCounts.not_ready}
Ready: ${summary.readinessCounts.ready}
Approved: ${summary.readinessCounts.approved}
Blocked: ${summary.readinessCounts.blocked}

RECOMMENDATIONS
===============
${summary.readinessScore >= 90 ? '✅ Migration Ready - Proceed with approval workflow' : ''}
${summary.readinessScore >= 70 ? '⚠️  Migration Possible - Address remaining issues first' : ''}
${summary.readinessScore < 70 ? '❌ Migration Not Ready - Significant issues to resolve' : ''}
`;
  }

  /**
   * Approve migration as director
   * PHASE 2C-4 GOVERNANCE EXECUTION ONLY — NOT ACTIVE PAYROLL
   */
  async approveAsDirector(
    payrollPeriodId: string, 
    companyId: string, 
    userId: string, 
    notes?: string
  ): Promise<PayrollMigrationApproval> {
    try {
      // Get current approval record
      const currentApproval = await this.getMigrationApproval(payrollPeriodId, companyId);
      
      if (!currentApproval) {
        throw new Error('Migration approval record not found');
      }

      // Validate workflow transition
      if (currentApproval.migrationStatus !== 'pending') {
        throw new Error(`Cannot approve as director from status: ${currentApproval.migrationStatus}`);
      }

      // Update approval record
      const updatedApproval = await this.upsertMigrationApproval({
        ...currentApproval,
        migrationStatus: 'director_approved',
        directorApprovalId: userId,
        directorApprovedAt: new Date().toISOString(),
        directorNotes: notes,
      });

      return updatedApproval;
    } catch (error) {
      console.error('Failed to approve as director:', error);
      throw new Error(`Failed to approve as director: ${error}`);
    }
  }

  /**
   * Approve migration as admin
   * PHASE 2C-4 GOVERNANCE EXECUTION ONLY — NOT ACTIVE PAYROLL
   */
  async approveAsAdmin(
    payrollPeriodId: string, 
    companyId: string, 
    userId: string, 
    notes?: string
  ): Promise<PayrollMigrationApproval> {
    try {
      // Get current approval record
      const currentApproval = await this.getMigrationApproval(payrollPeriodId, companyId);
      
      if (!currentApproval) {
        throw new Error('Migration approval record not found');
      }

      // Validate workflow transition
      if (!['director_approved', 'admin_approved'].includes(currentApproval.migrationStatus)) {
        throw new Error(`Cannot approve as admin from status: ${currentApproval.migrationStatus}`);
      }

      // Determine final status
      const finalStatus = currentApproval.migrationStatus === 'director_approved' ? 'fully_approved' : 'admin_approved';

      // Update approval record
      const updatedApproval = await this.upsertMigrationApproval({
        ...currentApproval,
        migrationStatus: finalStatus,
        adminApprovalId: userId,
        adminApprovedAt: new Date().toISOString(),
        adminNotes: notes,
      });

      return updatedApproval;
    } catch (error) {
      console.error('Failed to approve as admin:', error);
      throw new Error(`Failed to approve as admin: ${error}`);
    }
  }

  /**
   * Reject migration
   * PHASE 2C-4 GOVERNANCE EXECUTION ONLY — NOT ACTIVE PAYROLL
   */
  async rejectMigration(
    payrollPeriodId: string, 
    companyId: string, 
    userId: string, 
    notes?: string
  ): Promise<PayrollMigrationApproval> {
    try {
      // Get current approval record
      const currentApproval = await this.getMigrationApproval(payrollPeriodId, companyId);
      
      if (!currentApproval) {
        throw new Error('Migration approval record not found');
      }

      // Update approval record
      const updatedApproval = await this.upsertMigrationApproval({
        ...currentApproval,
        migrationStatus: 'rejected',
        // Add rejection notes to both director and admin fields for audit trail
        directorNotes: notes ? `REJECTION: ${notes}` : 'REJECTED',
        adminNotes: notes ? `REJECTION: ${notes}` : 'REJECTED',
      });

      return updatedApproval;
    } catch (error) {
      console.error('Failed to reject migration:', error);
      throw new Error(`Failed to reject migration: ${error}`);
    }
  }

  /**
   * Reset migration approval to pending
   * PHASE 2C-4 GOVERNANCE EXECUTION ONLY — NOT ACTIVE PAYROLL
   */
  async resetMigrationApproval(
    payrollPeriodId: string, 
    companyId: string, 
    userId: string, 
    notes?: string
  ): Promise<PayrollMigrationApproval> {
    try {
      // Get current approval record
      const currentApproval = await this.getMigrationApproval(payrollPeriodId, companyId);
      
      if (!currentApproval) {
        throw new Error('Migration approval record not found');
      }

      // Update approval record
      const updatedApproval = await this.upsertMigrationApproval({
        ...currentApproval,
        migrationStatus: 'pending',
        directorApprovalId: undefined,
        directorApprovedAt: undefined,
        directorNotes: notes ? `RESET: ${notes}` : 'RESET TO PENDING',
        adminApprovalId: undefined,
        adminApprovedAt: undefined,
        adminNotes: notes ? `RESET: ${notes}` : 'RESET TO PENDING',
      });

      return updatedApproval;
    } catch (error) {
      console.error('Failed to reset migration approval:', error);
      throw new Error(`Failed to reset migration approval: ${error}`);
    }
  }

  /**
   * Get audit log for migration approval
   */
  async getMigrationAuditLog(payrollPeriodId: string, companyId: string): Promise<Array<{
    action: string;
    timestamp: string;
    userId: string;
    userName?: string;
    notes?: string;
    previousStatus: string;
    newStatus: string;
  }>> {
    try {
      // This would typically query a separate audit table, but for now we'll reconstruct from the approval record
      const approval = await this.getMigrationApproval(payrollPeriodId, companyId);
      
      if (!approval) {
        return [];
      }

      const auditLog = [];

      // Creation log
      auditLog.push({
        action: 'CREATED',
        timestamp: approval.createdAt,
        userId: 'system',
        userName: 'System',
        notes: 'Migration approval record created',
        previousStatus: 'N/A',
        newStatus: 'pending',
      });

      // Director approval log
      if (approval.directorApprovedAt && approval.directorApprovalId) {
        auditLog.push({
          action: 'DIRECTOR_APPROVED',
          timestamp: approval.directorApprovedAt,
          userId: approval.directorApprovalId,
          userName: 'Director', // Would fetch from users table
          notes: approval.directorNotes,
          previousStatus: 'pending',
          newStatus: 'director_approved',
        });
      }

      // Admin approval log
      if (approval.adminApprovedAt && approval.adminApprovalId) {
        auditLog.push({
          action: 'ADMIN_APPROVED',
          timestamp: approval.adminApprovedAt,
          userId: approval.adminApprovalId,
          userName: 'Admin', // Would fetch from users table
          notes: approval.adminNotes,
          previousStatus: approval.directorApprovedAt ? 'director_approved' : 'pending',
          newStatus: approval.migrationStatus,
        });
      }

      // Rejection log
      if (approval.migrationStatus === 'rejected') {
        const rejectionNotes = approval.directorNotes?.startsWith('REJECTION:') ? 
          approval.directorNotes.substring(11) : 
          'Rejected';
        
        auditLog.push({
          action: 'REJECTED',
          timestamp: approval.updatedAt,
          userId: 'unknown',
          userName: 'Unknown',
          notes: rejectionNotes,
          previousStatus: 'pending', // Would need to track previous state properly
          newStatus: 'rejected',
        });
      }

      // Reset log
      if (approval.directorNotes?.startsWith('RESET:')) {
        auditLog.push({
          action: 'RESET',
          timestamp: approval.updatedAt,
          userId: 'unknown',
          userName: 'Unknown',
          notes: approval.directorNotes.substring(6),
          previousStatus: approval.migrationStatus,
          newStatus: 'pending',
        });
      }

      return auditLog.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      console.error('Failed to get migration audit log:', error);
      throw new Error(`Failed to get migration audit log: ${error}`);
    }
  }
}

// Export singleton instance for easy access
export const payrollMigrationApprovals = new PayrollMigrationApprovals();
