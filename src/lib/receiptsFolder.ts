// src/lib/receiptsFolder.ts — the company's receipts folder in private storage (<company>/receipts/<year>/<month>/...,
// plus older field-app receipts directly in <company>/receipts/). Used by the Expenses filing cabinet to show every
// picture filed there: expense receipts, supplier bill pictures, and pictures not attached to anything yet.

import { supabase } from "./supabase";
import { PRIVATE_FILES_BUCKET } from "./storageRefs";

export interface FolderFile { path: string; name: string; created_at: string | null }

async function list(prefix: string): Promise<{ name: string; id: string | null; created_at?: string | null }[]> {
  const { data, error } = await supabase.storage.from(PRIVATE_FILES_BUCKET).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);
  return (data || []) as { name: string; id: string | null; created_at?: string | null }[];
}

/** Every file in the receipts folder (folders are walked: year, then month). Throws if the folder can't be read. */
export async function listReceiptFiles(companyId: string): Promise<FolderFile[]> {
  const root = `${companyId}/receipts`;
  const out: FolderFile[] = [];
  const isFile = (e: { id: string | null; name: string }) => !!e.id && e.name !== ".emptyFolderPlaceholder";
  for (const e of await list(root)) {
    if (isFile(e)) { out.push({ path: `${root}/${e.name}`, name: e.name, created_at: e.created_at ?? null }); continue; }
    if (!/^\d{4}$/.test(e.name)) continue;
    for (const m of await list(`${root}/${e.name}`)) {
      if (isFile(m)) { out.push({ path: `${root}/${e.name}/${m.name}`, name: m.name, created_at: m.created_at ?? null }); continue; }
      for (const f of await list(`${root}/${e.name}/${m.name}`)) {
        if (isFile(f)) out.push({ path: `${root}/${e.name}/${m.name}/${f.name}`, name: f.name, created_at: f.created_at ?? null });
      }
    }
  }
  return out;
}

/** The month folder a path is filed in ("2026-11"), else the upload month. */
export function folderMonth(f: FolderFile): string {
  const m = f.path.match(/\/receipts\/(\d{4})\/(\d{2})\//);
  if (m) return `${m[1]}-${m[2]}`;
  return (f.created_at || new Date().toISOString()).slice(0, 7);
}

export interface BillPicture { id: string; invoice_number: string; invoice_date: string; total_amount: number; supplier: string; path: string }

export async function fetchBillPictures(companyId: string): Promise<BillPicture[]> {
  const { data, error } = await supabase.from("supplier_invoices")
    .select("id, invoice_number, invoice_date, total_amount, bill_file_path, suppliers(supplier_name)")
    .eq("company_id", companyId).not("bill_file_path", "is", null);
  if (error) throw new Error(error.message);
  type Row = { id: string; invoice_number: string; invoice_date: string; total_amount: number; bill_file_path: string; suppliers: { supplier_name: string } | null };
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date, total_amount: Number(r.total_amount),
    supplier: r.suppliers?.supplier_name ?? "Supplier", path: r.bill_file_path,
  }));
}
