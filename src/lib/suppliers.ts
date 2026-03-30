import { supabase } from "./supabase";

export interface Supplier {
  id: string;
  company_id: string;
  supplier_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateSupplierInput = {
  supplier_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export type UpdateSupplierInput = Partial<CreateSupplierInput>;

export interface SupplierCostItem {
  id: string;
  cost_item_id: string | null;
  supplier_id: string;
  supplier_sku?: string | null;
  supplier_item_name?: string | null;
  supplier_description?: string | null;
  unit?: string | null;
  is_preferred: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateSupplierCostItemInput = {
  supplier_id: string;
  cost_item_id: string | null;
  supplier_sku?: string | null;
  supplier_item_name?: string | null;
  supplier_description?: string | null;
  unit?: string | null;
  is_preferred?: boolean;
};

export type CreateSupplierRateInput = {
  cost_item_id: string;
  rate: number;
  currency?: string;
  effective_date?: string;
  source?: string;
  supplier_id?: string;
  is_supplier_specific?: boolean;
};

/**
 * Get current user's company_id from their profile
 */
export async function getCurrentCompanyId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) {
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  return profile?.company_id || null;
}

/**
 * List all suppliers for the current user's company
 * @param activeOnly - If true, returns only active suppliers
 * @returns Array of suppliers sorted by name
 */
export async function listSuppliers(activeOnly: boolean = false): Promise<Supplier[]> {
  try {
    let query = supabase
      .from("suppliers")
      .select("*")
      .order("supplier_name", { ascending: true });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching suppliers:", error);
      throw new Error(`Failed to fetch suppliers: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    throw new Error(`Failed to fetch suppliers: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Get active suppliers only
 * @returns Array of active suppliers sorted by name
 */
export async function getActiveSuppliers(): Promise<Supplier[]> {
  return listSuppliers(true);
}

/**
 * Get a single supplier by ID
 * @param id - Supplier ID
 * @returns Supplier or null if not found
 */
export async function getSupplier(id: string): Promise<Supplier | null> {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching supplier:", error);
      throw new Error(`Failed to fetch supplier: ${error.message}`);
    }

    return data;
  } catch (err) {
    throw new Error(`Failed to fetch supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Create a new supplier in the current user's company
 * @param input - Supplier data
 * @returns Created supplier
 */
export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  try {
    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      throw new Error("Could not determine company ID. Please ensure you are logged in.");
    }

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        company_id: companyId,
        supplier_name: input.supplier_name,
        contact_name: input.contact_name || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        payment_terms: input.payment_terms || null,
        notes: input.notes || null,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A supplier with the name "${input.supplier_name}" already exists.`);
      }
      console.error("Error creating supplier:", error);
      throw new Error(`Failed to create supplier: ${error.message}`);
    }

    return data;
  } catch (err) {
    throw new Error(`Failed to create supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Update an existing supplier
 * @param id - Supplier ID
 * @param input - Fields to update
 * @returns Updated supplier
 */
export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A supplier with the name "${input.supplier_name}" already exists.`);
      }
      console.error("Error updating supplier:", error);
      throw new Error(`Failed to update supplier: ${error.message}`);
    }

    return data;
  } catch (err) {
    throw new Error(`Failed to update supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Delete a supplier
 * @param id - Supplier ID
 * @returns Success boolean
 */
export async function deleteSupplier(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting supplier:", error);
      throw new Error(`Failed to delete supplier: ${error.message}`);
    }

    return true;
  } catch (err) {
    throw new Error(`Failed to delete supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Toggle supplier active status
 * @param id - Supplier ID
 * @param isActive - New active status
 * @returns Updated supplier
 */
export async function toggleSupplierStatus(id: string, isActive: boolean): Promise<Supplier> {
  return updateSupplier(id, { is_active: isActive });
}
