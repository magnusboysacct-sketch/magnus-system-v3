// Payroll Activation Access Hook - Phase 2D-2-4
// Access control for payroll activation and pilot management
// PHASE 2D-2-4 ACTIVATION CONTROL UI ONLY — NOT ACTIVE PAYROLL

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface PayrollActivationAccess {
  // Dashboard access
  canViewActivationDashboard: boolean;
  canViewPilotManagement: boolean;
  canViewRollbackManagement: boolean;
  canViewExecutionModes: boolean;
  
  // Pilot management
  canCreatePilotGroups: boolean;
  canManagePilotGroups: boolean;
  canAssignWorkersToPilot: boolean;
  canRemoveWorkersFromPilot: boolean;
  canPreviewPilotExecution: boolean;
  
  // Activation control
  canActivateJamaicanPayroll: boolean;
  canActivateDualRunMode: boolean;
  canModifyActivationFlags: boolean;
  canExecuteRollback: boolean;
  canViewActivationHistory: boolean;
  
  // Rollback management
  canViewRollbackPlans: boolean;
  canCreateRollbackPlans: boolean;
  canViewRollbackHistory: boolean;
  canViewArchiveIntegrity: boolean;
  
  // Read-only admin
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function usePayrollActivationAccess() {
  const [access, setAccess] = useState<PayrollActivationAccess>({
    // Dashboard access
    canViewActivationDashboard: false,
    canViewPilotManagement: false,
    canViewRollbackManagement: false,
    canViewExecutionModes: false,
    
    // Pilot management
    canCreatePilotGroups: false,
    canManagePilotGroups: false,
    canAssignWorkersToPilot: false,
    canRemoveWorkersFromPilot: false,
    canPreviewPilotExecution: false,
    
    // Activation control
    canActivateJamaicanPayroll: false,
    canActivateDualRunMode: false,
    canModifyActivationFlags: false,
    canExecuteRollback: false,
    canViewActivationHistory: false,
    
    // Rollback management
    canViewRollbackPlans: false,
    canCreateRollbackPlans: false,
    canViewRollbackHistory: false,
    canViewArchiveIntegrity: false,
    
    // Read-only admin
    isAdmin: false,
    isSuperAdmin: false,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setAccess(prev => ({ ...prev, loading: false }));
          return;
        }

        // Get user profile with role information
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, is_super_admin')
          .eq('user_id', user.id)
          .single();

        if (!profile) {
          console.error('User profile not found for access check');
          setAccess(prev => ({ ...prev, loading: false }));
          return;
        }

        const userRole = profile.role;
        const isSuperAdmin = profile.is_super_admin || false;

        // Define access based on role
        const newAccess: PayrollActivationAccess = {
          // Dashboard access - Admin and above can view
          canViewActivationDashboard: ['admin', 'director', 'super_admin'].includes(userRole),
          canViewPilotManagement: ['admin', 'director', 'super_admin'].includes(userRole),
          canViewRollbackManagement: ['admin', 'director', 'super_admin'].includes(userRole),
          canViewExecutionModes: ['admin', 'director', 'super_admin'].includes(userRole),
          
          // Pilot management - Admin only for creation/modification
          canCreatePilotGroups: userRole === 'admin' || userRole === 'super_admin',
          canManagePilotGroups: userRole === 'admin' || userRole === 'super_admin',
          canAssignWorkersToPilot: userRole === 'admin' || userRole === 'super_admin',
          canRemoveWorkersFromPilot: userRole === 'admin' || userRole === 'super_admin',
          canPreviewPilotExecution: ['admin', 'director', 'super_admin'].includes(userRole),
          
          // Activation control - Director and admin can activate
          canActivateJamaicanPayroll: ['director', 'admin', 'super_admin'].includes(userRole),
          canActivateDualRunMode: ['director', 'admin', 'super_admin'].includes(userRole),
          canModifyActivationFlags: ['admin', 'director', 'super_admin'].includes(userRole),
          canExecuteRollback: ['admin', 'director', 'super_admin'].includes(userRole),
          canViewActivationHistory: ['admin', 'director', 'super_admin'].includes(userRole),
          
          // Rollback management - Admin only for safety
          canViewRollbackPlans: userRole === 'admin' || userRole === 'super_admin',
          canCreateRollbackPlans: userRole === 'admin' || userRole === 'super_admin',
          canViewRollbackHistory: ['admin', 'director', 'super_admin'].includes(userRole),
          canViewArchiveIntegrity: ['admin', 'director', 'super_admin'].includes(userRole),
          
          // Read-only admin
          isAdmin: userRole === 'admin',
          isSuperAdmin: isSuperAdmin,
        };

        setAccess(newAccess);
      } catch (error) {
        console.error('Failed to check payroll activation access:', error);
        setAccess(prev => ({ 
          ...prev, 
          loading: false,
          canViewActivationDashboard: false,
          canViewPilotManagement: false,
          canViewRollbackManagement: false,
          canViewExecutionModes: false,
          canCreatePilotGroups: false,
          canManagePilotGroups: false,
          canAssignWorkersToPilot: false,
          canRemoveWorkersFromPilot: false,
          canPreviewPilotExecution: false,
          canActivateJamaicanPayroll: false,
          canActivateDualRunMode: false,
          canModifyActivationFlags: false,
          canExecuteRollback: false,
          canViewActivationHistory: false,
          canViewRollbackPlans: false,
          canCreateRollbackPlans: false,
          canViewRollbackHistory: false,
          canViewArchiveIntegrity: false,
          isAdmin: false,
          isSuperAdmin: false,
        }));
      }
    };

    checkAccess();
  }, []);

  return { access, loading };
}
