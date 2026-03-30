import { supabase } from "../../lib/supabase";

// =====================================================
// FINANCE FILE STORAGE TYPES
// =====================================================

export type FinanceFileType = "bank" | "credit" | "receipts";

export interface FinanceFile {
  id: string;
  company_id: string;
  file_type: FinanceFileType;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type_mime: string;
  storage_url: string;
  upload_date: string;
  uploaded_by: string;
  description?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceFileUpload {
  file: File;
  type: FinanceFileType;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  uploadDate?: Date;
}

export interface FinanceFileFilter {
  type?: FinanceFileType;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  uploadedBy?: string;
  search?: string;
}

export interface BankStatementUploadOptions {
  statementDate?: Date;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface CreditCardStatementUploadOptions {
  statementDate?: Date;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ReceiptUploadOptions {
  description?: string;
  tags?: string[];
  projectId?: string;
  expenseId?: string;
  vendorName?: string;
  amount?: number;
  receiptDate?: Date;
  metadata?: Record<string, any>;
}

export interface StoragePathInfo {
  bucket: string;
  path: string;
  fileName: string;
  fullPath: string;
}

export interface FileStorageStats {
  totalFiles: number;
  totalSize: number;
  filesByType: Record<FinanceFileType, number>;
  sizeByType: Record<FinanceFileType, number>;
  recentUploads: number;
  uploadsThisMonth: number;
}

// =====================================================
// STORAGE PATH GENERATION
// =====================================================

/**
 * Generate structured storage path for finance files
 */
export function generateStoragePath(type: FinanceFileType, date: Date = new Date()): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  
  switch (type) {
    case "bank":
      return `finance/bank/${year}/${month}`;
    case "credit":
      return `finance/credit/${year}/${month}`;
    case "receipts":
      return `finance/receipts/${year}/${month}`;
    default:
      throw new Error(`Invalid finance file type: ${type}`);
  }
}

/**
 * Generate unique filename with timestamp
 */
export function generateFileName(originalName: string, date: Date = new Date()): string {
  const timestamp = date.getTime();
  const fileExt = originalName.split('.').pop();
  const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  
  // Sanitize base name (remove special characters, spaces)
  const sanitizedName = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
  
  return `${timestamp}_${sanitizedName}.${fileExt}`;
}

/**
 * Get complete storage path information
 */
export function getStoragePathInfo(file: File, type: FinanceFileType, date: Date = new Date()): StoragePathInfo {
  const bucket = "project-files"; // Reuse existing bucket
  const path = generateStoragePath(type, date);
  const fileName = generateFileName(file.name, date);
  const fullPath = `${path}/${fileName}`;
  
  return {
    bucket,
    path,
    fileName,
    fullPath,
  };
}

// =====================================================
// CORE FILE STORAGE FUNCTIONS
// =====================================================

/**
 * Upload finance file with structured storage
 */
export async function uploadFinanceFile(
  file: File,
  type: FinanceFileType,
  options: {
    description?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    uploadDate?: Date;
  } = {}
): Promise<FinanceFile> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Get company_id from user profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      throw new Error("User profile not found");
    }

    const uploadDate = options.uploadDate || new Date();
    const storageInfo = getStoragePathInfo(file, type, uploadDate);

    // Upload file to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(storageInfo.bucket)
      .upload(storageInfo.fullPath, file);

    if (uploadError) {
      console.error("Error uploading file to storage:", uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(storageInfo.bucket)
      .getPublicUrl(storageInfo.fullPath);

    // Create finance file record
    const { data: fileData, error: fileError } = await supabase
      .from("finance_files")
      .insert([
        {
          company_id: profile.company_id,
          file_type: type,
          file_name: file.name,
          file_path: storageInfo.fullPath,
          file_size: file.size,
          file_type_mime: file.type,
          storage_url: urlData.publicUrl,
          upload_date: uploadDate.toISOString().split('T')[0],
          uploaded_by: user.id,
          description: options.description,
          tags: options.tags || [],
          metadata: {
            ...options.metadata,
            original_upload_date: new Date().toISOString(),
            storage_bucket: storageInfo.bucket,
          },
          is_active: true,
        },
      ])
      .select()
      .single();

    if (fileError) {
      // Clean up storage if database insert fails
      await supabase.storage
        .from(storageInfo.bucket)
        .remove([storageInfo.fullPath]);
      
      console.error("Error creating file record:", fileError);
      throw fileError;
    }

    return fileData as FinanceFile;
  } catch (error) {
    console.error("Exception uploading finance file:", error);
    throw error;
  }
}

/**
 * Get finance files with filtering
 */
export async function getFinanceFiles(
  companyId: string,
  filters?: FinanceFileFilter
): Promise<FinanceFile[]> {
  try {
    let query = supabase
      .from("finance_files")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (filters?.type) {
      query = query.eq("file_type", filters.type);
    }

    if (filters?.startDate) {
      query = query.gte("upload_date", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("upload_date", filters.endDate);
    }

    if (filters?.uploadedBy) {
      query = query.eq("uploaded_by", filters.uploadedBy);
    }

    if (filters?.search) {
      query = query.or(`file_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    if (filters?.tags && filters.tags.length > 0) {
      query = query.contains("tags", filters.tags);
    }

    const { data, error } = await query
      .order("upload_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching finance files:", error);
    return [];
  }
}

/**
 * Get finance file by ID
 */
export async function getFinanceFileById(fileId: string): Promise<FinanceFile | null> {
  try {
    const { data, error } = await supabase
      .from("finance_files")
      .select("*")
      .eq("id", fileId)
      .eq("is_active", true)
      .single();

    if (error) throw error;
    return data as FinanceFile || null;
  } catch (error) {
    console.error("Error fetching finance file by ID:", error);
    return null;
  }
}

/**
 * Delete finance file
 */
export async function deleteFinanceFile(fileId: string): Promise<void> {
  try {
    // Get file info before deletion
    const file = await getFinanceFileById(fileId);
    
    if (!file) {
      throw new Error("File not found");
    }

    // Delete from storage
    if (file.file_path) {
      const { error: storageError } = await supabase.storage
        .from("project-files")
        .remove([file.file_path]);

      if (storageError) {
        console.error("Error deleting file from storage:", storageError);
      }
    }

    // Soft delete from database (set is_active = false)
    const { error: dbError } = await supabase
      .from("finance_files")
      .update({ is_active: false })
      .eq("id", fileId);

    if (dbError) {
      console.error("Error deleting file record:", dbError);
      throw dbError;
    }
  } catch (error) {
    console.error("Exception deleting finance file:", error);
    throw error;
  }
}

/**
 * Update finance file metadata
 */
export async function updateFinanceFile(
  fileId: string,
  updates: Partial<Pick<FinanceFile, "description" | "tags" | "metadata">>
): Promise<FinanceFile> {
  try {
    const { data, error } = await supabase
      .from("finance_files")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId)
      .select()
      .single();

    if (error) throw error;
    return data as FinanceFile;
  } catch (error) {
    console.error("Error updating finance file:", error);
    throw error;
  }
}

// =====================================================
// INTEGRATION FUNCTIONS
// =====================================================

/**
 * Upload bank statement file (integrates with Phase 5)
 */
export async function uploadBankStatement(
  file: File,
  bankAccountId: string,
  options: BankStatementUploadOptions = {}
): Promise<FinanceFile> {
  const uploadOptions = {
    ...options,
    metadata: {
      ...options.metadata,
      bank_account_id: bankAccountId,
      statement_date: options.statementDate?.toISOString().split('T')[0],
      file_category: "bank_statement",
    },
    tags: [...(options.tags || []), "bank", "statement"],
  };

  return uploadFinanceFile(file, "bank", uploadOptions);
}

/**
 * Upload credit card statement file (integrates with Phase 6)
 */
export async function uploadCreditCardStatement(
  file: File,
  creditCardId: string,
  options: CreditCardStatementUploadOptions = {}
): Promise<FinanceFile> {
  const uploadOptions = {
    ...options,
    metadata: {
      ...options.metadata,
      credit_card_id: creditCardId,
      statement_date: options.statementDate?.toISOString().split('T')[0],
      file_category: "credit_card_statement",
    },
    tags: [...(options.tags || []), "credit", "statement"],
  };

  return uploadFinanceFile(file, "credit", uploadOptions);
}

/**
 * Upload receipt file
 */
export async function uploadReceipt(
  file: File,
  options: ReceiptUploadOptions = {}
): Promise<FinanceFile> {
  const uploadOptions = {
    ...options,
    metadata: {
      ...options.metadata,
      file_category: "receipt",
      project_id: options.projectId,
      expense_id: options.expenseId,
      vendor_name: options.vendorName,
      amount: options.amount,
      receipt_date: options.receiptDate?.toISOString().split('T')[0],
    },
    tags: [...(options.tags || []), "receipt"],
  };

  return uploadFinanceFile(file, "receipts", uploadOptions);
}

// =====================================================
// BATCH OPERATIONS
// =====================================================

/**
 * Upload multiple finance files
 */
export async function uploadMultipleFinanceFiles(
  files: FinanceFileUpload[],
  companyId: string
): Promise<Array<{ file: FinanceFile; error?: string }>> {
  const results = [];
  
  for (const fileUpload of files) {
    try {
      const uploadedFile = await uploadFinanceFile(
        fileUpload.file,
        fileUpload.type,
        {
          description: fileUpload.description,
          tags: fileUpload.tags,
          metadata: fileUpload.metadata,
          uploadDate: fileUpload.uploadDate,
        }
      );
      
      results.push({ file: uploadedFile });
    } catch (error) {
      console.error(`Error uploading file ${fileUpload.file.name}:`, error);
      results.push({ 
        file: null as any, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  }
  
  return results;
}

/**
 * Get files by date range
 */
export async function getFinanceFilesByDateRange(
  companyId: string,
  startDate: string,
  endDate: string,
  type?: FinanceFileType
): Promise<FinanceFile[]> {
  return getFinanceFiles(companyId, {
    type,
    startDate,
    endDate,
  });
}

/**
 * Get files by tags
 */
export async function getFinanceFilesByTags(
  companyId: string,
  tags: string[],
  type?: FinanceFileType
): Promise<FinanceFile[]> {
  return getFinanceFiles(companyId, {
    type,
    tags,
  });
}

// =====================================================
// STATISTICS AND REPORTING
// =====================================================

/**
 * Get file storage statistics
 */
export async function getFileStorageStats(companyId: string): Promise<FileStorageStats> {
  try {
    // Get total files and size
    const { data: files, error: filesError } = await supabase
      .from("finance_files")
      .select("file_type, file_size, upload_date, created_at")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (filesError) throw filesError;

    const allFiles = files || [];
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Calculate statistics
    const stats: FileStorageStats = {
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((sum, file) => sum + (file.file_size || 0), 0),
      filesByType: {
        bank: 0,
        credit: 0,
        receipts: 0,
      },
      sizeByType: {
        bank: 0,
        credit: 0,
        receipts: 0,
      },
      recentUploads: allFiles.filter(file => {
        const uploadDate = new Date(file.created_at);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return uploadDate >= thirtyDaysAgo;
      }).length,
      uploadsThisMonth: allFiles.filter(file => 
        file.upload_date.startsWith(currentMonth)
      ).length,
    };

    // Calculate by type
    allFiles.forEach(file => {
      const type = file.file_type as FinanceFileType;
      if (stats.filesByType[type] !== undefined) {
        stats.filesByType[type]++;
        stats.sizeByType[type] += file.file_size || 0;
      }
    });

    return stats;
  } catch (error) {
    console.error("Error getting file storage stats:", error);
    return {
      totalFiles: 0,
      totalSize: 0,
      filesByType: { bank: 0, credit: 0, receipts: 0 },
      sizeByType: { bank: 0, credit: 0, receipts: 0 },
      recentUploads: 0,
      uploadsThisMonth: 0,
    };
  }
}

/**
 * Get storage usage by month
 */
export async function getStorageUsageByMonth(
  companyId: string,
  months: number = 12
): Promise<Array<{ month: string; files: number; size: number }>> {
  try {
    const { data, error } = await supabase
      .from("finance_files")
      .select("upload_date, file_size")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .gte("upload_date", new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    if (error) throw error;

    const files = data || [];
    const monthlyData = new Map<string, { files: number; size: number }>();

    files.forEach(file => {
      const month = file.upload_date.slice(0, 7); // YYYY-MM
      const existing = monthlyData.get(month) || { files: 0, size: 0 };
      existing.files++;
      existing.size += file.file_size || 0;
      monthlyData.set(month, existing);
    });

    return Array.from(monthlyData.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));
  } catch (error) {
    console.error("Error getting storage usage by month:", error);
    return [];
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Validate file type for finance uploads
 */
export function validateFinanceFileType(file: File): boolean {
  const allowedTypes = [
    // PDF
    'application/pdf',
    // Images
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  return allowedTypes.includes(file.type) || file.type.startsWith('image/');
}

/**
 * Check if file is too large (max 50MB)
 */
export function validateFileSize(file: File, maxSizeMB: number = 50): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

/**
 * Generate download URL for file
 */
export function generateDownloadUrl(file: FinanceFile): string {
  return file.storage_url;
}

/**
 * Create download link for file
 */
export function createDownloadLink(file: FinanceFile): void {
  const link = document.createElement('a');
  link.href = generateDownloadUrl(file);
  link.download = file.file_name;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
