import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type FinanceAccessLevel = 'full' | 'project_only' | 'none';

export interface FinanceAccessControl {
  level: FinanceAccessLevel;
  loading: boolean;
  canAccessFullFinance: boolean;
  canAccessProjectFinance: boolean;
  canViewCompanyReports: boolean;
  canViewMarkupAndProfit: boolean;
  canViewCashFlow: boolean;
  canViewExpenses: boolean;
  canViewBilling: boolean;
}

export function useFinanceAccess(): FinanceAccessControl {
  const [level, setLevel] = useState<FinanceAccessLevel>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadFinanceAccess() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          if (mounted) {
            setLevel('none');
            setLoading(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('finance_access_level')
          .eq('id', user.id)
          .single();

        if (mounted) {
          setLevel((profile?.finance_access_level as FinanceAccessLevel) || 'none');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading finance access:', error);
        if (mounted) {
          setLevel('none');
          setLoading(false);
        }
      }
    }

    loadFinanceAccess();

    return () => {
      mounted = false;
    };
  }, []);

  const canAccessFullFinance = level === 'full';
  const canAccessProjectFinance = level === 'full' || level === 'project_only';
  const canViewCompanyReports = level === 'full';
  const canViewMarkupAndProfit = level === 'full';
  const canViewCashFlow = level === 'full';
  const canViewExpenses = level === 'full';
  const canViewBilling = level === 'full';

  return {
    level,
    loading,
    canAccessFullFinance,
    canAccessProjectFinance,
    canViewCompanyReports,
    canViewMarkupAndProfit,
    canViewCashFlow,
    canViewExpenses,
    canViewBilling,
  };
}
