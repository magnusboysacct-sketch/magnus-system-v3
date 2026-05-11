// Admin Access Hook - Phase 2A
// Admin permission checking for internal tools
// PHASE 2A INTERNAL MONITORING DASHBOARD ONLY — NOT ACTIVE PAYROLL

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AdminAccessControl {
  isAdmin: boolean;
  loading: boolean;
  canAccessAdminTools: boolean;
  userRole?: string;
}

export function useAdminAccess(): AdminAccessControl {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>();

  useEffect(() => {
    let mounted = true;

    async function loadAdminAccess() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          if (mounted) {
            setIsAdmin(false);
            setLoading(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const role = profile?.role;
        const adminRoles = ['director', 'admin'];
        const hasAdminAccess = role ? adminRoles.includes(role) : false;

        if (mounted) {
          setUserRole(role);
          setIsAdmin(hasAdminAccess);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading admin access:', error);
        if (mounted) {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    }

    loadAdminAccess();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    isAdmin,
    loading,
    canAccessAdminTools: isAdmin,
    userRole,
  };
}
