// Payroll Migration Approval Access Hook - Phase 2C-4
// Role-based access control for payroll migration approval workflow
// PHASE 2C-4 GOVERNANCE EXECUTION ONLY — NOT ACTIVE PAYROLL

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ApprovalPermissions {
  canApproveAsDirector: boolean;
  canApproveAsAdmin: boolean;
  canReject: boolean;
  canReset: boolean;
  canViewNotes: boolean;
  isLoading: boolean;
}

export function usePayrollMigrationApprovalAccess(): ApprovalPermissions {
  const [permissions, setPermissions] = useState<ApprovalPermissions>({
    canApproveAsDirector: false,
    canApproveAsAdmin: false,
    canReject: false,
    canReset: false,
    canViewNotes: false,
    isLoading: true,
  });

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const userRole = profile?.role || '';

      const canApproveAsDirector = userRole === 'director';
      const canApproveAsAdmin = userRole === 'admin' || userRole === 'director';
      const canReject = userRole === 'admin' || userRole === 'director';
      const canReset = userRole === 'admin' || userRole === 'director';
      const canViewNotes = userRole === 'admin' || userRole === 'director';

      setPermissions({
        canApproveAsDirector,
        canApproveAsAdmin,
        canReject,
        canReset,
        canViewNotes,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to check approval permissions:', error);
      setPermissions(prev => ({ ...prev, isLoading: false }));
    }
  };

  return permissions;
}
