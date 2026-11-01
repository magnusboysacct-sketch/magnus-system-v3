// src/lib/hq/website.ts — Magnus HQ: demo requests (leads), feedback, and the public website text.
// Everything goes through SECURITY DEFINER functions that check platform admin + 2-step login (migration 20260966).

import { supabase } from "../supabase";

export const LEAD_STATUSES = ["new", "called", "trial", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_LABEL: Record<LeadStatus, string> = { new: "New", called: "Called", trial: "On trial", won: "Won", lost: "Lost" };

export type Lead = {
  id: string; name: string; company: string | null; phone: string | null; email: string | null;
  message: string | null; source: string | null; status: LeadStatus; note: string | null;
  created_at: string; updated_at: string;
};

export const FEEDBACK_STATUSES = ["new", "read", "planned", "done", "spam"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_LABEL: Record<FeedbackStatus, string> = { new: "New", read: "Read", planned: "Planned", done: "Done", spam: "Spam" };
export const FEEDBACK_KIND: Record<string, string> = { idea: "Idea", problem: "Problem", like: "Like", other: "Other" };

export type Feedback = {
  id: string; kind: "idea" | "problem" | "like" | "other"; message: string; contact: string | null; page: string | null;
  status: FeedbackStatus; note: string | null; created_at: string; company_name: string | null; user_email: string | null;
};

export type FaqItem = { q: string; a: string };
export type WebsiteText = { hero_title: string; hero_sub: string; faq: FaqItem[] };

export type LegalDoc = { kind: "privacy" | "terms"; version: number; body: string; published_at: string; published_by: string | null };

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.rpc("hq_leads");
  fail(error);
  return (data ?? []) as Lead[];
}

export async function saveLead(id: string, status: LeadStatus, note: string): Promise<void> {
  const { error } = await supabase.rpc("hq_lead_save", { p_id: id, p_status: status, p_note: note });
  fail(error);
}

export async function addLead(l: { name: string; company: string; phone: string; email: string; message: string }): Promise<void> {
  const { error } = await supabase.rpc("hq_lead_add", { p_name: l.name, p_company: l.company, p_phone: l.phone, p_email: l.email, p_message: l.message });
  fail(error);
}

export async function deleteLead(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_lead_delete", { p_id: id, p_reason: reason });
  fail(error);
}

export async function fetchFeedback(): Promise<Feedback[]> {
  const { data, error } = await supabase.rpc("hq_feedback");
  fail(error);
  return (data ?? []) as Feedback[];
}

export async function saveFeedback(id: string, status: FeedbackStatus, note: string): Promise<void> {
  const { error } = await supabase.rpc("hq_feedback_save", { p_id: id, p_status: status, p_note: note });
  fail(error);
}

export async function fetchLegal(): Promise<LegalDoc[]> {
  const { data, error } = await supabase.rpc("hq_legal_list");
  fail(error);
  return (data ?? []) as LegalDoc[];
}

export async function publishLegal(kind: LegalDoc["kind"], body: string, reason: string): Promise<number> {
  const { data, error } = await supabase.rpc("hq_legal_publish", { p_kind: kind, p_body: body, p_reason: reason });
  fail(error);
  return Number(data);
}

/** WhatsApp link for a phone number typed any Jamaican way: 555-1234, 876 555 1234, +1 (876) 555-1234. */
export function whatsAppLink(phone: string | null, text: string): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 7) d = "1876" + d;
  else if (d.length === 10 && /^(876|658)/.test(d)) d = "1" + d;
  if (d.length < 10) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export const when = (ts: string) => new Date(ts).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" });

export function ago(ts: string): string {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
