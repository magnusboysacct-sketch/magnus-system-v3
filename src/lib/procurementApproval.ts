import { supabase } from './supabase';

export async function updateProcurementApproval(
  documentId: string,
  status: 'approved' | 'rejected' | 'reset',
  userId?: string,
  notes?: string
) {
  try {
    // First, deactivate existing approvals for this document
    if (status === 'approved' || status === 'rejected') {
      await supabase
        .from('procurement_approvals')
        .update({ is_active: false })
        .eq('document_id', documentId)
        .eq('is_active', true);
    }

    // Get next sequence number
    const { data: maxSequence } = await supabase
      .from('procurement_approvals')
      .select('sequence_number')
      .eq('document_id', documentId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    const nextSequence = (maxSequence?.sequence_number || 0) + 1;

    // Insert new approval record
    const { error } = await supabase
      .from('procurement_approvals')
      .insert({
        document_id: documentId,
        status,
        user_id: userId,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        notes,
        sequence_number: nextSequence,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to update procurement approval:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Error updating procurement approval:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getProcurementApprovals(documentIds?: string[]) {
  try {
    let query = supabase
      .from('procurement_approvals')
      .select(`
        *,
        user_profiles!procurement_approvals_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .order('sequence_number', { ascending: true });

    if (documentIds && documentIds.length > 0) {
      query = query.in('document_id', documentIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch procurement approvals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching procurement approvals:', err);
    return [];
  }
}

export async function getProcurementApproval(documentId: string) {
  try {
    const { data, error } = await supabase
      .from('procurement_approvals')
      .select(`
        *,
        user_profiles!procurement_approvals_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('document_id', documentId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Failed to fetch procurement approval:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching procurement approval:', err);
    return null;
  }
}

export async function getProcurementApprovalHistory(documentId: string) {
  try {
    const { data, error } = await supabase
      .from('procurement_approvals')
      .select(`
        *,
        user_profiles!procurement_approvals_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('document_id', documentId)
      .order('sequence_number', { ascending: false });

    if (error) {
      console.error('Failed to fetch approval history:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching approval history:', err);
    return [];
  }
}

export async function getCurrentUserProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Failed to fetch user profile:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return null;
  }
}
