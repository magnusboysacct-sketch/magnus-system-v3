// src/lib/receiptInbox.ts — the Receipt Inbox (migration 20260994000000): staff snap receipts and leave them; someone with full
// finance access (the accountant) turns each into an expense, a supplier bill, a document, or "not needed".
// The picture goes straight into the monthly receipts folder (<company>/receipts/<yyyy>/<mm>/inbox-...), so when it becomes an
// expense or a bill it simply stays there, attached.
import { supabase } from "./supabase";
import { aiScanReceipt, type ReceiptScanResult } from "./magnusAI";
import { docMime, type Drawer } from "./filingCabinet";

export type InboxStatus = "new" | "expense" | "bill" | "document" | "discarded";
export interface InboxItem {
  id: string; company_id: string; file_path: string; mime_type: string | null; size_bytes: number | null; project_id: string | null; note: string | null;
  dropped_by: string | null; dropped_at: string; ai_status: "pending" | "done" | "failed"; ai_data: InboxAI | null; status: InboxStatus;
  handled_by: string | null; handled_at: string | null; expense_id: string | null; bill_id: string | null; doc_file_id: string | null; discard_reason: string | null;
}
export interface InboxAI { vendor?: string; amount?: number; date?: string; receiptNumber?: string; tax?: number; paymentMethod?: string }
// What the expense / bill form is opened with (router state / props).
export interface FromInbox { id: string; path: string; ai: InboxAI | null; projectId: string | null; note: string | null }

const today = () => { const d = new Date(Date.now() - 5 * 3600_000); return d.toISOString().slice(0, 10); };   // Jamaica

// Drop one receipt in. Pictures are made smaller first. The AI read runs after, in the background.
export async function dropReceipt(o: { companyId: string; file: File; projectId: string | null; note: string | null }): Promise<InboxItem> {
  const isImg = /^image\//.test(o.file.type) && !/heic|heif/i.test(o.file.type);
  const body: Blob = isImg ? await shrink(o.file) : o.file;
  const ext = isImg ? "jpg" : ((o.file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf");
  const contentType = isImg ? "image/jpeg" : (o.file.type || docMime(o.file.name));
  const d = today();
  const path = `${o.companyId}/receipts/${d.slice(0, 4)}/${d.slice(5, 7)}/inbox-${crypto.randomUUID().slice(0, 12)}.${ext}`;
  const { error: upErr } = await supabase.storage.from("private-files").upload(path, body, { contentType, upsert: false });
  if (upErr) throw new Error(`The picture was not saved (${upErr.message}).`);
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("receipt_inbox").insert({
    company_id: o.companyId, file_path: path, mime_type: contentType, size_bytes: body.size, project_id: o.projectId, note: o.note, dropped_by: user?.id,
  }).select("*").single();
  if (error) { await supabase.storage.from("private-files").remove([path]); throw new Error(error.message); }
  return data as InboxItem;
}

// The AI reads the receipt and the result is kept with it. Never throws.
export async function readReceipt(item: Pick<InboxItem, "id" | "file_path" | "mime_type">, file?: Blob): Promise<InboxAI | null> {
  try {
    const blob = file ?? await download(item.file_path);
    const r: ReceiptScanResult | null = await aiScanReceipt(new File([blob], item.file_path.split("/").pop() || "receipt.jpg", { type: item.mime_type || blob.type || "image/jpeg" }));
    const ok = !!r && (r.amount > 0 || !!r.vendor);
    const ai: InboxAI | null = ok && r ? { vendor: r.vendor || undefined, amount: r.amount || undefined, date: r.date || undefined, receiptNumber: r.receiptNumber || undefined, tax: r.tax || undefined, paymentMethod: r.paymentMethod || undefined } : null;
    await supabase.rpc("receipt_inbox_set_ai", { p_id: item.id, p_data: ai, p_ok: ok });
    return ai;
  } catch {
    try { await supabase.rpc("receipt_inbox_set_ai", { p_id: item.id, p_data: null, p_ok: false }); } catch { /* fine */ }
    return null;
  }
}

export async function download(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from("private-files").download(path);
  if (error || !data) throw new Error("Could not get the picture.");
  return data;
}
export async function asFile(item: InboxItem): Promise<File> {
  const blob = await download(item.file_path);
  return new File([blob], item.file_path.split("/").pop() || "receipt.jpg", { type: item.mime_type || blob.type || "image/jpeg" });
}

export async function listInbox(companyId: string, which: "new" | "done"): Promise<InboxItem[]> {
  let q = supabase.from("receipt_inbox").select("*").eq("company_id", companyId);
  q = which === "new" ? q.eq("status", "new").order("dropped_at", { ascending: true }) : q.neq("status", "new").order("handled_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as InboxItem[];
}
export async function inboxCount(companyId: string): Promise<number> {
  const { count } = await supabase.from("receipt_inbox").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "new");
  return count || 0;
}
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const list = Array.from(new Set(paths.filter(Boolean)));
  if (!list.length) return {};
  const { data } = await supabase.storage.from("private-files").createSignedUrls(list, 900);
  const out: Record<string, string> = {};
  (data || []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}

export async function markDone(id: string, kind: "expense" | "bill" | "document", linkId: string): Promise<void> {
  const { error } = await supabase.rpc("receipt_inbox_done", { p_id: id, p_kind: kind, p_link: linkId });
  if (error) throw new Error(error.message);
}
export async function discard(item: InboxItem, reason: string): Promise<void> {
  const { data: path, error } = await supabase.rpc("receipt_inbox_discard", { p_id: item.id, p_reason: reason });
  if (error) throw new Error(error.message);
  if (path) await supabase.storage.from("private-files").remove([path as string]);
}

// Not a cost (a warranty, a guarantee...): move the picture into the filing cabinet and mark it done.
export async function fileAsDocument(item: InboxItem, o: { drawer: Drawer | null; title: string }): Promise<void> {
  const name = item.file_path.split("/").pop() || "receipt.jpg";
  const to = `${item.company_id}/${o.drawer?.is_private ? "finance/" : ""}documents/${crypto.randomUUID().slice(0, 8)}_${name}`;
  const { error: mvErr } = await supabase.storage.from("private-files").move(item.file_path, to);
  if (mvErr) throw new Error("Could not move the picture: " + mvErr.message);
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("doc_files").insert({
    company_id: item.company_id, drawer_id: o.drawer?.id ?? null, project_id: item.project_id, title: o.title.trim() || name, file_name: name,
    file_path: to, mime_type: item.mime_type, size_bytes: item.size_bytes, doc_date: item.ai_data?.date || null, note: item.note, uploaded_by: user?.id,
  }).select("id").single();
  if (error || !data) { await supabase.storage.from("private-files").move(to, item.file_path); throw new Error(error?.message || "Could not file it."); }
  await markDone(item.id, "document", data.id);
}

function shrink(file: File, maxSide = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => b ? resolve(b) : reject(new Error("Could not read the picture")), "image/jpeg", 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
