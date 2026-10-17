// src/lib/staffHr.ts
// A staff member's TRN, employee number and ID-card dates are not readable by colleagues (column privileges on user_profiles): the owner of the row and payroll
// staff (director / admin / secretary) get them through the get_staff_hr_fields database function. Anyone else gets nothing for those four fields.
import { supabase } from "./supabase";

export interface StaffHrFields {
  id: string;
  trn: string | null;
  employee_number: string | null;
  id_issued_date: string | null;
  id_expiry_date: string | null;
}

// userIds omitted = every staff member of the caller's company the caller may see.
export async function fetchStaffHrFields(userIds?: string[]): Promise<Map<string, StaffHrFields>> {
  const out = new Map<string, StaffHrFields>();
  const { data, error } = await supabase.rpc("get_staff_hr_fields", { p_user_ids: userIds ?? null });
  if (error) {
    console.error("get_staff_hr_fields error:", error);
    return out;
  }
  for (const row of (data || []) as StaffHrFields[]) out.set(row.id, row);
  return out;
}

// The four fields merged onto plain user_profiles rows (null where the caller may not see them).
export function withStaffHr<T extends { id: string }>(rows: T[], hr: Map<string, StaffHrFields>) {
  return rows.map((r) => {
    const f = hr.get(r.id);
    return { ...r, trn: f?.trn ?? null, employee_number: f?.employee_number ?? null, id_issued_date: f?.id_issued_date ?? null, id_expiry_date: f?.id_expiry_date ?? null };
  });
}
