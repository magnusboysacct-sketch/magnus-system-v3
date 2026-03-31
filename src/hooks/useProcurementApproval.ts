import React from 'react';
import type { ProcurementItemWithSource } from '../types/procurement';

export interface ProcurementApproval {
  status: 'pending' | 'approved' | 'rejected' | 'reset';
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

export function useProcurementApproval(document: any) {
  const [approvals, setApprovals] = React.useState<Map<string, ProcurementApproval>>(new Map());

  const getDocumentApproval = (): ProcurementApproval | null => {
    const docApproval = approvals.get(document.id);
    if (docApproval) {
      return docApproval;
    }
    return null;
  };

  const updateApproval = (status: ProcurementApproval['status'], notes?: string) => {
    setApprovals(prev => {
      const newApprovals = new Map(prev);
      newApprovals.set(document.id, {
        status,
        approvedBy: status === 'approved' ? 'Current User' : undefined,
        approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
        notes
      });
      return newApprovals;
    });
  };

  const resetApproval = () => {
    setApprovals(prev => {
      const newApprovals = new Map(prev);
      newApprovals.set(document.id, { status: 'pending' });
      return newApprovals;
    });
  };

  return {
    approvals,
    getDocumentApproval,
    updateApproval,
    resetApproval,
  };
}
