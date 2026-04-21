import { supabase } from "./supabase";

export type FieldPaymentStatus = "draft" | "signed" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "check" | "other";
export type SignatureType = "worker" | "supervisor";
export type ReceiptType = "payment_acknowledgment" | "company_receipt" | "payroll_entry";

export interface FieldPayment {
  id: string;
  company_id: string;
  project_id?: string | null;
  
  // Worker Information
  worker_name: string;
  worker_nickname?: string | null;
  worker_id_number?: string | null;
  worker_phone?: string | null;
  worker_address?: string | null;
  
  // Work Details
  work_type: string;
  work_date: string;
  hours_worked?: number | null;
  days_worked?: number | null;
  rate_per_hour?: number | null;
  rate_per_day?: number | null;
  total_amount: number;
  
  // Payment Method
  payment_method: PaymentMethod;
  payment_notes?: string | null;
  
  // Status
  status: FieldPaymentStatus;
  
  // Images (stored in Supabase Storage)
  id_photo_url?: string | null;
  worker_photo_url?: string | null;
  
  // Metadata
  supervisor_id?: string | null;
  supervisor_name?: string | null;
  location?: string | null;
  weather_conditions?: string | null;
  notes?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  signed_at?: string | null;
  completed_at?: string | null;
  
  // Finance Integration
  synced_to_finance: boolean;
  finance_transaction_id?: string | null;
  cost_code_id?: string | null;
}

export interface FieldPaymentSignature {
  id: string;
  field_payment_id: string;
  company_id: string;
  
  signature_type: SignatureType;
  signature_data: string; // Base64 encoded signature
  signed_at: string;
  signed_by?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  
  created_at: string;
}

export interface FieldPaymentReceipt {
  id: string;
  field_payment_id: string;
  company_id: string;
  
  receipt_type: ReceiptType;
  receipt_number?: string | null;
  pdf_url: string;
  pdf_data?: string | null; // Base64 encoded PDF
  
  receipt_date: string;
  generated_by?: string | null;
  
  created_at: string;
}

export interface CreateFieldPaymentData {
  project_id?: string;
  
  // Worker Information
  worker_name: string;
  worker_nickname?: string;
  worker_id_number?: string;
  worker_phone?: string;
  worker_address?: string;
  
  // Work Details
  work_type: string;
  work_date?: string;
  hours_worked?: number;
  days_worked?: number;
  rate_per_hour?: number;
  rate_per_day?: number;
  total_amount: number;
  
  // Payment Method
  payment_method: PaymentMethod;
  payment_notes?: string;
  
  // Metadata
  location?: string;
  weather_conditions?: string;
  notes?: string;
  
  cost_code_id?: string;
}

export interface FieldPaymentFilters {
  status?: FieldPaymentStatus | "all";
  payment_method?: PaymentMethod | "all";
  work_date_from?: string;
  work_date_to?: string;
  worker_name?: string;
  project_id?: string;
}

export interface FieldPaymentSummary {
  company_id: string;
  project_id?: string;
  project_name?: string;
  work_date: string;
  payment_method: PaymentMethod;
  status: FieldPaymentStatus;
  payment_count: number;
  total_amount: number;
  average_amount: number;
  unique_workers: number;
}

// API Functions

export async function fetchFieldPayments(
  companyId: string,
  filters?: FieldPaymentFilters
): Promise<FieldPayment[]> {
  let query = supabase
    .from("field_payments")
    .select(`
      *,
      projects(name),
      cost_codes(code, description)
    `)
    .eq("company_id", companyId)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Apply filters
  if (filters) {
    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters.payment_method && filters.payment_method !== "all") {
      query = query.eq("payment_method", filters.payment_method);
    }
    if (filters.work_date_from) {
      query = query.gte("work_date", filters.work_date_from);
    }
    if (filters.work_date_to) {
      query = query.lte("work_date", filters.work_date_to);
    }
    if (filters.worker_name) {
      query = query.ilike("worker_name", `%${filters.worker_name}%`);
    }
    if (filters.project_id) {
      query = query.eq("project_id", filters.project_id);
    }
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as FieldPayment[];
}

export async function createFieldPayment(
  payment: CreateFieldPaymentData,
  companyId: string,
  userId?: string
): Promise<FieldPayment> {
  const { data, error } = await supabase
    .from("field_payments")
    .insert({
      ...payment,
      company_id: companyId,
      supervisor_id: userId,
      work_date: payment.work_date || new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) throw error;
  return data as FieldPayment;
}

export async function updateFieldPayment(
  id: string,
  updates: Partial<FieldPayment>
): Promise<FieldPayment> {
  const { data, error } = await supabase
    .from("field_payments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as FieldPayment;
}

export async function deleteFieldPayment(id: string): Promise<void> {
  const { error } = await supabase
    .from("field_payments")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function fetchFieldPaymentSignatures(
  fieldPaymentId: string
): Promise<FieldPaymentSignature[]> {
  const { data, error } = await supabase
    .from("field_payment_signatures")
    .select("*")
    .eq("field_payment_id", fieldPaymentId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as FieldPaymentSignature[];
}

export async function createFieldPaymentSignature(
  signature: Omit<FieldPaymentSignature, "id" | "company_id" | "signed_at" | "created_at">,
  companyId: string
): Promise<FieldPaymentSignature> {
  const { data, error } = await supabase
    .from("field_payment_signatures")
    .insert({
      ...signature,
      company_id: companyId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as FieldPaymentSignature;
}

export async function fetchFieldPaymentReceipts(
  fieldPaymentId: string
): Promise<FieldPaymentReceipt[]> {
  const { data, error } = await supabase
    .from("field_payment_receipts")
    .select("*")
    .eq("field_payment_id", fieldPaymentId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as FieldPaymentReceipt[];
}

export async function createFieldPaymentReceipt(
  receipt: Omit<FieldPaymentReceipt, "id" | "company_id" | "receipt_date" | "created_at">,
  companyId: string,
  userId?: string
): Promise<FieldPaymentReceipt> {
  const { data, error } = await supabase
    .from("field_payment_receipts")
    .insert({
      ...receipt,
      company_id: companyId,
      generated_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as FieldPaymentReceipt;
}

export async function fetchFieldPaymentSummary(
  companyId: string,
  filters?: {
    work_date_from?: string;
    work_date_to?: string;
    project_id?: string;
  }
): Promise<FieldPaymentSummary[]> {
  let query = supabase
    .from("field_payment_summary")
    .select("*")
    .eq("company_id", companyId)
    .order("work_date", { ascending: false });

  if (filters) {
    if (filters.work_date_from) {
      query = query.gte("work_date", filters.work_date_from);
    }
    if (filters.work_date_to) {
      query = query.lte("work_date", filters.work_date_to);
    }
    if (filters.project_id) {
      query = query.eq("project_id", filters.project_id);
    }
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as FieldPaymentSummary[];
}

// Upload functions for images
export async function uploadFieldPaymentImage(
  file: File,
  companyId: string,
  paymentId: string,
  imageType: "id_photo" | "worker_photo"
): Promise<{ url: string; path: string }> {
  const fileName = `${companyId}/${paymentId}/${imageType}_${Date.now()}_${file.name}`;
  
  const { data, error } = await supabase.storage
    .from("field-payments")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  // Generate signed URL
  const { data: signedData } = await supabase.storage
    .from("field-payments")
    .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year

  if (!signedData?.signedUrl) {
    throw new Error("Failed to generate signed URL");
  }

  return {
    url: signedData.signedUrl,
    path: fileName,
  };
}

export async function uploadFieldPaymentPDF(
  pdfBlob: Blob,
  companyId: string,
  paymentId: string,
  receiptType: ReceiptType
): Promise<{ url: string; path: string }> {
  const fileName = `${companyId}/${paymentId}/receipts/${receiptType}_${Date.now()}.pdf`;
  
  const { data, error } = await supabase.storage
    .from("field-payments")
    .upload(fileName, pdfBlob, {
      cacheControl: "3600",
      upsert: false,
      contentType: "application/pdf",
    });

  if (error) throw error;

  // Generate signed URL
  const { data: signedData } = await supabase.storage
    .from("field-payments")
    .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year

  if (!signedData?.signedUrl) {
    throw new Error("Failed to generate signed URL");
  }

  return {
    url: signedData.signedUrl,
    path: fileName,
  };
}
