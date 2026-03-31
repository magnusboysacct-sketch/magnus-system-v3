import { supabase } from './supabase';

export async function updateProcurementApproval(
  documentId: string,
  status: 'approved' | 'rejected' | 'reset',
  approvedBy?: string,
  notes?: string
) {
  try {
    const { error } = await supabase
      .from('procurement_approvals')
      .upsert({
        document_id: documentId,
        status,
        approved_by: approvedBy,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        notes,
        updated_at: new Date().toISOString(),
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
      .select('*')
      .order('created_at', { ascending: false });

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
